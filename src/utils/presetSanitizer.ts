// Utilities for building and sanitizing preset payloads so they are
// safe to share between machines (no local file paths, device lists, etc.)
// Kept dependency-free (any types are `any`) to avoid tight coupling.

type AnyState = any;

function sanitizeTimelineTrackAsset(asset: any): any {
  if (!asset || typeof asset !== 'object') return asset;
  const next: any = { ...asset };
  if (next.blobURL) delete next.blobURL;
  try {
    const p = typeof next.path === 'string' ? next.path : '';
    const fp = typeof next.filePath === 'string' ? next.filePath : '';
    if (p.startsWith('blob:') && fp) {
      next.path = `local-file://${fp}`;
    }
  } catch {}
  return next;
}

function sanitizeTimelineTracks(tracks: any): any[] {
  if (!Array.isArray(tracks)) return [];
  return tracks.map((t: any) => ({
    ...t,
    clips: Array.isArray(t?.clips)
      ? t.clips.map((c: any) => ({
          ...c,
          asset: c?.asset ? sanitizeTimelineTrackAsset(c.asset) : c?.asset,
        }))
      : [],
  }));
}

/**
 * Generate a stable, shareable effect id from a filename.
 * Mirrors EffectDiscovery.generateEffectId but in a standalone helper.
 */
function generateEffectIdFromFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    return 'unknown-effect';
  }

  const id = fileName
    // Handle consecutive uppercase letters properly (e.g., "BPM" -> "bpm")
    .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, (match) => `-${match.toLowerCase()}`)
    // Handle single uppercase
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    // Drop leading dash
    .replace(/^-/, '')
    // Remove extensions
    .replace(/\.(tsx|ts|js|jsx)$/i, '')
    // Trim trailing and duplicate hyphens
    .replace(/-+$/, '')
    .replace(/-+/g, '-');

  return id || 'unknown-effect';
}

function sanitizeDeviceParameter(param: any): any {
  const next = { ...param };

  if (next.name === 'deviceId') {
    // For shared presets, always revert to "Default Camera"
    next.value = '';
    if ('options' in next) {
      delete next.options;
    }
    if ('lockDefault' in next) {
      delete next.lockDefault;
    }
  } else if (next.lockDefault && next.type === 'select' && Array.isArray(next.options)) {
    // Any lockDefault select is almost certainly enumerated from local hardware
    delete next.options;
  }

  return next;
}

function sanitizeParameters(params: any): any {
  if (!Array.isArray(params)) return params;
  return params.map((p) => sanitizeDeviceParameter(p));
}

/**
 * Normalize effect id for presets so they don't encode absolute paths.
 * - For user effects whose sourcePath points into the bundled bank/, derive
 *   the canonical id from the bank filename.
 * - For other effects, preserve id as-is.
 */
function normalizeEffectIdForPreset(id: string, metadata: any): string {
  if (!id || typeof id !== 'string') return id;
  const meta = metadata || {};

  // Primary: derive a stable slug from the effect's display name so presets
  // are keyed by NAME, not by transient internal IDs or file paths.
  if (typeof meta.name === 'string' && meta.name.trim()) {
    const canonicalFromName = generateEffectIdFromFileName(`${meta.name}.tsx`);
    if (canonicalFromName) return canonicalFromName;
  }

  // Secondary: for bank-based effects, infer from the bank path when available
  const rawSourcePath = typeof meta.sourcePath === 'string' ? meta.sourcePath : '';
  let baseNameFromPath: string | null = null;

  if (rawSourcePath) {
    const normalizedPath = rawSourcePath.replace(/\\/g, '/');

    if (normalizedPath.includes('/bank/')) {
      const afterBank = normalizedPath.split('/bank/')[1] || '';
      baseNameFromPath = afterBank.split('/').pop() || afterBank;
    }
  }

  // Tertiary: infer from legacy path-like IDs that embed "bank(effects|sources)-<file>"
  let baseNameFromId: string | null = null;
  try {
    const lowered = id.toLowerCase();
    const match = lowered.match(/bank(?:sources|effects)[^a-z0-9]*([a-z0-9._-]+)$/i);
    if (match && match[1]) {
      baseNameFromId = match[1];
    }
  } catch {
    // Ignore and keep original id
  }

  const baseName = baseNameFromPath || baseNameFromId;
  if (!baseName) return id;

  const canonical = generateEffectIdFromFileName(baseName);
  return canonical || id;
}

function sanitizeEffectLike(effect: any, owningMetadata?: any): any {
  if (!effect || typeof effect !== 'object') return effect;
  const next: any = { ...effect };

  if (typeof next.id === 'string') {
    next.id = normalizeEffectIdForPreset(next.id, owningMetadata);
  }

  if (Array.isArray(next.parameters)) {
    next.parameters = sanitizeParameters(next.parameters);
  }

  return next;
}

function sanitizeLayer(layer: any): any {
  if (!layer || typeof layer !== 'object') return layer;
  const next: any = { ...layer };

  // Sanitize attached effect asset metadata
  if (next.asset) {
    const asset = { ...(next.asset as any) };
    const originalMeta = asset.metadata ? { ...asset.metadata } : {};

    // Ensure we always have a stable display name available for ID canonicalization
    if (asset.name && typeof asset.name === 'string' && !originalMeta.name) {
      (originalMeta as any).name = asset.name;
    }

    // Compute canonical ID before stripping helper fields like sourcePath
    if (typeof asset.id === 'string') {
      const canonicalId = normalizeEffectIdForPreset(asset.id, originalMeta);
      if (canonicalId && typeof canonicalId === 'string') {
        asset.id = canonicalId;
      }
    }

    if (asset.metadata) {
      const meta = { ...asset.metadata };
      // Strip absolute sourcePath; receiving machines re-discover from bank/user dirs
      if (typeof meta.sourcePath === 'string') {
        delete meta.sourcePath;
      }
      meta.parameters = sanitizeParameters(meta.parameters);
      asset.metadata = meta;
    }

    next.asset = asset;
  }

  // Sanitize instantiated effect descriptors (effect chain)
  if (Array.isArray(next.effects)) {
    const owningMeta = (next.asset as any)?.metadata;
    next.effects = next.effects.map((e: any) => sanitizeEffectLike(e, owningMeta));
  }

  // Sanitize dynamic params mirror (per-layer param overrides)
  if (next.params && typeof next.params === 'object') {
    const params: any = {};
    for (const [key, val] of Object.entries(next.params)) {
      if (key === 'deviceId') {
        params[key] = { value: '' };
      } else {
        params[key] = val;
      }
    }
    next.params = params;
  }

  return next;
}

function sanitizeScenes(scenes: any[]): any[] {
  if (!Array.isArray(scenes)) return Array.isArray((scenes as any)) ? (scenes as any) : [];
  return scenes.map((scene) => {
    if (!scene || typeof scene !== 'object') return scene;
    return {
      ...scene,
      columns: Array.isArray(scene.columns)
        ? scene.columns.map((col: any) => ({
            ...col,
            layers: Array.isArray(col.layers) ? col.layers.map((l: any) => sanitizeLayer(l)) : [],
          }))
        : [],
    };
  });
}

function sanitizeAssetsForPreset(assets: any[]): any[] {
  if (!Array.isArray(assets)) return [];

  return assets.map((asset) => {
    if (!asset || typeof asset !== 'object') return asset;
    const { base64Data, ...rest } = asset;
    const next: any = { ...rest };

    // Drop machine-specific paths for shared presets
    delete next.filePath;
    delete next.path;
    delete next.originalPath;
    delete next.videoPath;

    // Preserve base64 payload only for small files to avoid huge presets
    const size = typeof asset.size === 'number' ? asset.size : 0;
    if (size > 0 && size < 500 * 1024 && base64Data) {
      next.base64Data = base64Data;
    }

    return next;
  });
}

/**
 * Build the `data` block for a preset from the current app state,
 * applying sanitization so the result is portable and shareable.
 */
export function buildPresetDataFromState(state: AnyState): any {
  if (!state) return {};

  const scenes = sanitizeScenes(state.scenes || []);
  const timelineScenes = sanitizeScenes(state.timelineScenes || []);
  const assets = sanitizeAssetsForPreset(state.assets || []);

  // Timeline clips/tracks are persisted outside zustand (Timeline.tsx uses localStorage).
  // Capture them into the preset so reopening a set restores its original timeline state.
  let timelineTracksBySceneId: Record<string, any[]> | undefined;
  try {
    if (typeof window !== 'undefined' && window.localStorage && Array.isArray(state.timelineScenes)) {
      const out: Record<string, any[]> = {};
      for (const scene of state.timelineScenes || []) {
        const id = scene?.id ? String(scene.id) : '';
        if (!id) continue;
        const raw = localStorage.getItem(`timeline-tracks-${id}`);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          out[id] = sanitizeTimelineTracks(parsed);
        } catch {
          // ignore malformed entries
        }
      }
      if (Object.keys(out).length > 0) timelineTracksBySceneId = out;
    }
  } catch {}

  return {
    scenes,
    currentSceneId: state.currentSceneId,
    timelineScenes,
    currentTimelineSceneId: state.currentTimelineSceneId,
    timelineTracksBySceneId,
    // Persist UI mode so each saved set reopens in the same mode.
    // `true` => timeline mode, `false` => column mode.
    showTimeline: !!state.showTimeline,
    playingColumnId: state.playingColumnId,
    bpm: state.bpm,
    sidebarVisible: state.sidebarVisible,
    midiMappings: state.midiMappings,
    selectedLayerId: state.selectedLayerId,
    previewMode: state.previewMode,
    transitionType: state.transitionType,
    transitionDuration: state.transitionDuration,
    compositionSettings: state.compositionSettings,
    // Crossfade settings (UI)
    columnCrossfadeEnabled: !!(state as any).columnCrossfadeEnabled,
    columnCrossfadeDuration: (state as any).columnCrossfadeDuration,
    cellCrossfadeEnabled: !!(state as any).cellCrossfadeEnabled,
    assets,
  };
}

/**
 * Sanitize an incoming preset `data` payload when loading a set.
 * This applies the same rules as export, and also cleans up any
 * older presets that stored machine-specific details.
 */
export function sanitizePresetDataOnLoad(data: any): any {
  if (!data || typeof data !== 'object') return data || {};

  const next: any = { ...data };

  next.scenes = sanitizeScenes(next.scenes || []);
  next.timelineScenes = sanitizeScenes(next.timelineScenes || []);
  next.assets = sanitizeAssetsForPreset(next.assets || []);
  try {
    if (next.timelineTracksBySceneId && typeof next.timelineTracksBySceneId === 'object') {
      const src = next.timelineTracksBySceneId as Record<string, any>;
      const out: Record<string, any[]> = {};
      for (const [sceneId, tracks] of Object.entries(src)) {
        out[String(sceneId)] = sanitizeTimelineTracks(tracks);
      }
      next.timelineTracksBySceneId = out;
    }
  } catch {}

  // Migration: old sets may have persisted blob: URLs (not valid across restarts).
  // If an asset has a real filePath, rebuild the persistent local-file:// URL.
  try {
    const fixLayerAsset = (layer: any) => {
      if (!layer?.asset) return;
      const a: any = layer.asset;
      const p = typeof a.path === 'string' ? a.path : '';
      const fp = typeof a.filePath === 'string' ? a.filePath : '';
      if (p.startsWith('blob:') && fp) {
        a.path = `local-file://${fp}`;
      }
      // Drop stale blobURL field on load; it will be regenerated when needed
      if (typeof a.blobURL === 'string' && a.blobURL.startsWith('blob:')) {
        delete a.blobURL;
      }
    };
    const fixScenes = (scenes: any[]) => {
      for (const scene of scenes || []) {
        for (const col of scene?.columns || []) {
          for (const layer of col?.layers || []) fixLayerAsset(layer);
        }
      }
    };
    fixScenes(next.scenes || []);
    fixScenes(next.timelineScenes || []);
  } catch {}

  return next;
}


