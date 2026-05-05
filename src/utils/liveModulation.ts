// Live (per-frame) parameter modulation channel. The LFO engine writes
// continuously here so effects can read smoothly modulated values inside
// their per-frame loop without going through the Zustand store. Routing
// every LFO tick through `updateLayer` deep-clones the entire scenes tree
// and triggers a React re-render across LayerManager → ColumnPreview →
// EffectChain → portals → effect components, which collapses the framerate
// for any modulated parameter.
//
// Usage:
//   - LFOEngine calls `setLiveModulationValue(layerId, paramName, value)`
//     every tick (and only writes to the store at a low rate for UI sync).
//   - An effect receives its layerId via the `__layerId` prop injected by
//     EffectChain and reads `getLiveModulationValue(__layerId, name)` in
//     its `useFrame` body, falling back to the static prop value.
//
// The map lives on `globalThis` so dynamically loaded effect bundles (the
// `bank/effects/*.js` files that don't bundle this module) can still read
// from it via `globalThis.__VJ_LIVE_MOD__`.

export type LiveModulationMap = Record<string, Record<string, number>>;

const ROOT_KEY = '__VJ_LIVE_MOD__';

interface LiveModulationApi {
  values: LiveModulationMap;
  set: (layerId: string, paramName: string, value: number) => void;
  get: (layerId: string, paramName: string) => number | undefined;
  clearLayer: (layerId: string) => void;
  clearParam: (layerId: string, paramName: string) => void;
  clearAll: () => void;
}

function ensureRoot(): LiveModulationApi {
  const g = globalThis as any;
  if (g[ROOT_KEY] && typeof g[ROOT_KEY] === 'object' && g[ROOT_KEY].values) {
    return g[ROOT_KEY] as LiveModulationApi;
  }
  const values: LiveModulationMap = {};
  const api: LiveModulationApi = {
    values,
    set(layerId, paramName, value) {
      if (!layerId || !paramName) return;
      if (!Number.isFinite(value)) return;
      let bucket = values[layerId];
      if (!bucket) {
        bucket = {};
        values[layerId] = bucket;
      }
      bucket[paramName] = value;
    },
    get(layerId, paramName) {
      if (!layerId || !paramName) return undefined;
      const v = values[layerId]?.[paramName];
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    },
    clearLayer(layerId) {
      if (!layerId) return;
      delete values[layerId];
    },
    clearParam(layerId, paramName) {
      if (!layerId || !paramName) return;
      const bucket = values[layerId];
      if (!bucket) return;
      delete bucket[paramName];
    },
    clearAll() {
      for (const k of Object.keys(values)) delete values[k];
    },
  };
  g[ROOT_KEY] = api;
  return api;
}

const api = ensureRoot();

export const setLiveModulationValue = api.set;
export const getLiveModulationValue = api.get;
export const clearLiveModulationLayer = api.clearLayer;
export const clearLiveModulationParam = api.clearParam;
export const clearAllLiveModulation = api.clearAll;
export const liveModulationValues = api.values;
