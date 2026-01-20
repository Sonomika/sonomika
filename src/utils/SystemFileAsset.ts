export type SystemImportedAsset = {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio' | 'unknown';
  path: string;
  filePath?: string;
  blobURL?: string;
  size?: number;
  date?: number;
  isSystemFile?: boolean;
};

const sanitizeFileNameForWindows = (name: string): string => {
  try {
    const base = String(name || '').trim() || 'file';
    // Windows invalid filename characters: <>:"/\|?*
    return base.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').trim();
  } catch {
    return 'file';
  }
};

const ensureUniqueWindowsPath = (dir: string, name: string): string => {
  const safe = sanitizeFileNameForWindows(name);
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  return `${dir}\\${stamp}_${safe}`;
};

const getTypeFromFile = (file: File): SystemImportedAsset['type'] => {
  const n = (file?.name || '').toLowerCase();
  const t = (file?.type || '').toLowerCase();
  const hasExt = (ext: string) => n.endsWith(ext);
  const isVideo = t.startsWith('video/') || ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'].some(hasExt);
  const isImage = t.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].some(hasExt);
  const isAudio = t.startsWith('audio/') || ['.mp3', '.wav', '.aiff', '.flac', '.ogg'].some(hasExt);
  if (isVideo) return 'video';
  if (isImage) return 'image';
  if (isAudio) return 'audio';
  return 'unknown';
};

export const isSupportedVideoFile = (file: File): boolean => {
  try {
    return getTypeFromFile(file) === 'video';
  } catch {
    return false;
  }
};

/**
 * Build an asset from an OS-dropped file in a way that survives refresh/restart:
 * - Prefer Electron absolute path when available (file.path)
 * - Otherwise copy into Documents/Sonomika/video using Electron IPC, then persist that path.
 * - Always attach a blob URL for immediate preview/playback (but callers should not persist it).
 */
export async function importSystemFileAsPersistentAsset(file: File): Promise<SystemImportedAsset | null> {
  try {
    const type = getTypeFromFile(file);
    if (type === 'unknown') return null;

    const blobURL = URL.createObjectURL(file);
    const fileAny: any = file as any;
    let absPath: string = String(fileAny?.path || '').trim();

    if (!absPath) {
      // Copy into Documents/Sonomika/video
      const electronAny: any = (window as any)?.electron;
      if (electronAny?.getDocumentsFolder && electronAny?.saveBinaryFile) {
        const docsRes = await electronAny.getDocumentsFolder();
        const docsPath = docsRes && docsRes.success ? String(docsRes.path || '') : '';
        if (docsPath) {
          const videoDir = `${docsPath}\\video`;
          const destPath = ensureUniqueWindowsPath(videoDir, file.name);
          const buf = await file.arrayBuffer();
          const ok = await electronAny.saveBinaryFile(destPath, new Uint8Array(buf));
          if (ok) absPath = destPath;
        }
      }
    }

    const asset: SystemImportedAsset = {
      id: `system-file-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: file.name || 'file',
      type,
      path: absPath ? `local-file://${absPath}` : blobURL,
      filePath: absPath || undefined,
      blobURL,
      size: file.size,
      date: Date.now(),
      isSystemFile: true,
    };

    return asset;
  } catch {
    return null;
  }
}

