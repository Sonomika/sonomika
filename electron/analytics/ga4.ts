import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

type Ga4Init = {
  measurementId: string;
  apiSecret?: string;
  appName?: string;
  /**
   * By default, analytics will only send when packaged (production).
   * Set true to allow sending in dev when apiSecret is present.
   */
  enableInDev?: boolean;
};

type ClientIdState = {
  client_id: string;
  created_at_ms: number;
};

type SessionState = {
  ga_session_number: number;
};

function safeReadJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWriteJsonFile(filePath: string, data: unknown): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch {
    // best-effort; analytics must never crash the app
  }
}

function getClientIdFilePath() {
  return path.join(app.getPath('userData'), 'ga4_client_id.json');
}

function getSessionFilePath() {
  return path.join(app.getPath('userData'), 'ga4_session.json');
}

type GeoState = {
  ip_override?: string;
  fetched_at_ms: number;
};

function getGeoFilePath() {
  return path.join(app.getPath('userData'), 'ga4_geo.json');
}

function looksLikeIpAddress(ip: string) {
  const s = ip.trim();
  // Very lightweight validation; GA accepts both v4 and v6.
  // v4: "1.2.3.4"  v6: contains ":" and hex.
  if (!s) return false;
  const isV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
  const isV6 = /^[0-9a-f:]+$/i.test(s) && s.includes(':');
  return isV4 || isV6;
}

function getCachedIpOverride(maxAgeMs: number): string | undefined {
  try {
    const fp = getGeoFilePath();
    const st = safeReadJsonFile<GeoState>(fp);
    if (!st || typeof st.fetched_at_ms !== 'number') return undefined;
    if (Date.now() - st.fetched_at_ms > maxAgeMs) return undefined;
    if (typeof st.ip_override !== 'string') return undefined;
    const ip = st.ip_override.trim();
    return looksLikeIpAddress(ip) ? ip : undefined;
  } catch {
    return undefined;
  }
}

async function fetchPublicIpOverride(timeoutMs: number): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
    try {
      // Simple public IP resolver. Best-effort; analytics should never block app startup.
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { ip?: unknown };
      const ip = typeof data?.ip === 'string' ? data.ip.trim() : '';
      if (!looksLikeIpAddress(ip)) return undefined;
      safeWriteJsonFile(getGeoFilePath(), { ip_override: ip, fetched_at_ms: Date.now() } satisfies GeoState);
      return ip;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return undefined;
  }
}

function getOrCreateClientId(): { state: ClientIdState; isNew: boolean } {
  const fp = getClientIdFilePath();
  const existing = safeReadJsonFile<ClientIdState>(fp);
  if (
    existing &&
    typeof existing.client_id === 'string' &&
    existing.client_id.length > 0 &&
    typeof existing.created_at_ms === 'number'
  ) {
    return { state: existing, isNew: false };
  }

  const created: ClientIdState = {
    client_id: crypto.randomUUID(),
    created_at_ms: Date.now(),
  };
  safeWriteJsonFile(fp, created);
  return { state: created, isNew: true };
}

function nextSessionInfo(): { ga_session_id: number; ga_session_number: number } {
  const fp = getSessionFilePath();
  const existing = safeReadJsonFile<SessionState>(fp);
  const prev =
    existing && typeof existing.ga_session_number === 'number' && isFinite(existing.ga_session_number)
      ? existing.ga_session_number
      : 0;

  const next: SessionState = { ga_session_number: Math.max(0, Math.floor(prev)) + 1 };
  safeWriteJsonFile(fp, next);

  // GA4 session id convention: seconds since epoch.
  const ga_session_id = Math.floor(Date.now() / 1000);
  return { ga_session_id, ga_session_number: next.ga_session_number };
}

function truncate(str: string, max: number) {
  if (str.length <= max) return str;
  return str.slice(0, Math.max(0, max - 1)) + '…';
}

export function createGa4Analytics(init: Ga4Init) {
  const measurementId = String(init.measurementId || '').trim();
  const apiSecret = String(init.apiSecret || '').trim();
  const appName = String(init.appName || 'Sonomika').trim();
  const enableInDev = Boolean(init.enableInDev);

  const disabledByEnv =
    String(process.env.GA4_DISABLED || '').toLowerCase() === 'true' ||
    String(process.env.GA4_DISABLED || '').toLowerCase() === '1';

  const canSendInThisBuild = app.isPackaged || enableInDev;
  const enabled = !disabledByEnv && canSendInThisBuild && measurementId && apiSecret;

  const debug =
    String(process.env.GA4_DEBUG || '').toLowerCase() === 'true' ||
    String(process.env.GA4_DEBUG || '').toLowerCase() === '1';

  const { state: client, isNew } = getOrCreateClientId();
  const session = nextSessionInfo();

  // GA4 geo/device dimensions do NOT reliably populate for "Measurement Protocol only" setups.
  // If you aren't also sending gtag/GTM/Firebase-tagged events for the same client_id,
  // provide geographic info explicitly (user_location or ip_override).
  //
  // - Set GA4_COUNTRY_ID / GA4_REGION_ID / GA4_CITY to explicitly define user_location.
  // - Otherwise we best-effort add ip_override using the current public IP (cached).
  //
  // Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference#payload_geo_info
  const explicitCountryId = String(process.env.GA4_COUNTRY_ID || '').trim().toUpperCase();
  const explicitRegionId = String(process.env.GA4_REGION_ID || '').trim();
  const explicitCity = String(process.env.GA4_CITY || '').trim();

  const explicitUserLocation =
    explicitCountryId || explicitRegionId || explicitCity
      ? {
          ...(explicitCity ? { city: explicitCity } : {}),
          ...(explicitRegionId ? { region_id: explicitRegionId } : {}),
          ...(explicitCountryId ? { country_id: explicitCountryId } : {}),
        }
      : undefined;

  const geoDisabled =
    String(process.env.GA4_GEO_DISABLED || '').toLowerCase() === 'true' ||
    String(process.env.GA4_GEO_DISABLED || '').toLowerCase() === '1';

  let ipOverride: string | undefined = undefined;
  const envIpOverride = String(process.env.GA4_IP_OVERRIDE || '').trim();
  if (looksLikeIpAddress(envIpOverride)) ipOverride = envIpOverride;
  if (!ipOverride) ipOverride = getCachedIpOverride(7 * 24 * 60 * 60 * 1000); // 7 days
  if (!ipOverride && !geoDisabled) {
    // Fire-and-forget; ok if it fails.
    void fetchPublicIpOverride(2_000).then((ip) => {
      if (ip) ipOverride = ip;
    });
  }

  function baseParams(params?: Record<string, unknown>) {
    return {
      // GA4 session attribution params (Measurement Protocol)
      ga_session_id: session.ga_session_id,
      ga_session_number: session.ga_session_number,

      // Recommended minimum engagement time to help GA4 keep the event
      engagement_time_msec: 1,

      // App/device-ish context
      app_name: appName,
      app_version: app.getVersion?.() || undefined,
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,

      ...params,
    };
  }

  async function sendEvent(name: string, params?: Record<string, unknown>) {
    if (!enabled) return;

    const eventName = String(name || '').trim();
    if (!eventName) return;

    const endpoint = debug ? 'https://www.google-analytics.com/debug/mp/collect' : 'https://www.google-analytics.com/mp/collect';
    const url = `${endpoint}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

    const payload = {
      client_id: client.client_id,
      ...(geoDisabled
        ? {}
        : explicitUserLocation
          ? { user_location: explicitUserLocation }
          : ipOverride
            ? { ip_override: ipOverride }
            : {}),
      user_properties: {
        app_name: { value: appName },
        app_version: { value: app.getVersion?.() || 'unknown' },
        platform: { value: process.platform },
        arch: { value: process.arch },
        packaged: { value: app.isPackaged ? '1' : '0' },
      },
      events: [
        {
          name: eventName,
          params: baseParams(params),
        },
      ],
    };

    try {
      // Node 18+ / Electron supports global fetch in main process
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // In debug mode GA returns a JSON validation payload; don't spam logs here.
      // We still read it to avoid unhandled stream work in some runtimes.
      try {
        if (debug) await res.text();
      } catch {}
    } catch {
      // ignore
    }
  }

  function track(name: string, params?: Record<string, unknown>) {
    // fire-and-forget; never block app startup
    void sendEvent(name, params);
  }

  // Convenience: one-time first_open
  function trackFirstOpenOnce() {
    if (!enabled) return;
    if (!isNew) return;
    track('first_open', { first_open_ms: client.created_at_ms });
  }

  function trackAppOpen() {
    if (!enabled) return;
    // Match GA4 conventions: include session_start for engagement/session reporting.
    track('session_start', { ts_ms: Date.now() });
    track('app_open', { ts_ms: Date.now() });
  }

  function trackAppError(errorType: string) {
    if (!enabled) return;
    track('app_error', {
      error_type: truncate(String(errorType || 'unknown'), 80),
      fatal: true,
      ts_ms: Date.now(),
    });
  }

  return {
    enabled,
    clientId: client.client_id,
    sessionId: session.ga_session_id,
    sessionNumber: session.ga_session_number,
    track,
    trackFirstOpenOnce,
    trackAppOpen,
    trackAppError,
  };
}

