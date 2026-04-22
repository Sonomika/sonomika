const EXTERNAL_LIBRARY_STORAGE_KEY = 'vj-external-library-urls';
const EXTERNAL_LIBRARY_SCRIPT_ATTRIBUTE = 'data-external-library-url';

export interface ExternalLibraryEntry {
  url: string;
  enabled: boolean;
}

export const DEFAULT_EXTERNAL_LIBRARY_ENTRIES: ExternalLibraryEntry[] = [
  { url: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', enabled: true },
  { url: 'https://cdn.jsdelivr.net/npm/ml5@1.0.1/dist/ml5.min.js', enabled: true },
  { url: 'https://cdn.jsdelivr.net/npm/tone@15.0.4/build/Tone.js', enabled: true },
];

type LoadStatus = 'loaded' | 'already-loaded' | 'invalid' | 'failed';

export interface ExternalLibraryLoadResult {
  url: string;
  status: LoadStatus;
  error?: string;
}

const activeLoads = new Map<string, Promise<ExternalLibraryLoadResult>>();

export function normalizeExternalLibraryUrls(input: string[] | string): string[] {
  const urls = Array.isArray(input) ? input : input.split(/\r?\n/);
  const seen = new Set<string>();

  return urls
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

export function normalizeExternalLibraryEntries(
  input: ExternalLibraryEntry[] | string[] | string
): ExternalLibraryEntry[] {
  const entries = typeof input === 'string'
    ? input.split(/\r?\n/).map((url) => ({ url, enabled: true }))
    : input.map((value) =>
        typeof value === 'string' ? { url: value, enabled: true } : value
      );

  const seen = new Set<string>();

  return entries
    .map((entry) => ({
      url: String(entry?.url || '').trim(),
      enabled: entry?.enabled !== false,
    }))
    .filter((entry) => entry.url.length > 0)
    .filter((entry) => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    });
}

export function isAllowedExternalLibraryUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function readExternalLibraryEntries(): ExternalLibraryEntry[] {
  try {
    const raw = localStorage.getItem(EXTERNAL_LIBRARY_STORAGE_KEY);
    if (raw === null) return DEFAULT_EXTERNAL_LIBRARY_ENTRIES.map((entry) => ({ ...entry }));

    const parsed = JSON.parse(raw);
    return normalizeExternalLibraryEntries(Array.isArray(parsed) ? parsed : []);
  } catch {
    return DEFAULT_EXTERNAL_LIBRARY_ENTRIES.map((entry) => ({ ...entry }));
  }
}

export function readExternalLibraryUrls(): string[] {
  return readExternalLibraryEntries()
    .filter((entry) => entry.enabled)
    .map((entry) => entry.url);
}

export function saveExternalLibraryEntries(entries: ExternalLibraryEntry[]): void {
  localStorage.setItem(
    EXTERNAL_LIBRARY_STORAGE_KEY,
    JSON.stringify(normalizeExternalLibraryEntries(entries))
  );
}

export function saveExternalLibraryUrls(urls: string[]): void {
  saveExternalLibraryEntries(normalizeExternalLibraryUrls(urls).map((url) => ({ url, enabled: true })));
}

function getExistingScript(url: string): HTMLScriptElement | null {
  const scripts = Array.from(document.querySelectorAll('script'));
  return (
    scripts.find((script) => script.getAttribute(EXTERNAL_LIBRARY_SCRIPT_ATTRIBUTE) === url) ??
    scripts.find((script) => script.src === url) ??
    null
  );
}

function loadExternalLibrary(url: string): Promise<ExternalLibraryLoadResult> {
  if (!isAllowedExternalLibraryUrl(url)) {
    return Promise.resolve({
      url,
      status: 'invalid',
      error: 'Only HTTPS script URLs are supported.',
    });
  }

  const existing = getExistingScript(url);
  if (existing) {
    return Promise.resolve({ url, status: 'already-loaded' });
  }

  const activeLoad = activeLoads.get(url);
  if (activeLoad) return activeLoad;

  const loadPromise = new Promise<ExternalLibraryLoadResult>((resolve) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.setAttribute(EXTERNAL_LIBRARY_SCRIPT_ATTRIBUTE, url);

    script.onload = () => {
      activeLoads.delete(url);
      resolve({ url, status: 'loaded' });
    };

    script.onerror = () => {
      activeLoads.delete(url);
      try {
        script.remove();
      } catch {}
      resolve({
        url,
        status: 'failed',
        error: 'The script could not be loaded.',
      });
    };

    document.head.appendChild(script);
  });

  activeLoads.set(url, loadPromise);
  return loadPromise;
}

export async function loadExternalLibraries(
  urls: string[] | ExternalLibraryEntry[] = readExternalLibraryUrls()
): Promise<ExternalLibraryLoadResult[]> {
  if (typeof document === 'undefined') return [];

  const normalizedUrls = Array.isArray(urls) && typeof urls[0] === 'object'
    ? normalizeExternalLibraryEntries(urls as ExternalLibraryEntry[])
        .filter((entry) => entry.enabled)
        .map((entry) => entry.url)
    : normalizeExternalLibraryUrls(urls as string[] | string);
  const results: ExternalLibraryLoadResult[] = [];

  for (const url of normalizedUrls) {
    results.push(await loadExternalLibrary(url));
  }

  return results;
}
