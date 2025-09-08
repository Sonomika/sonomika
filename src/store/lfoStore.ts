import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LFOModulatedValue {
  layerId: string;
  parameterName: string;
  baseValue: number;
  modulatedValue: number;
  timestamp: number;
}

export interface LFOState {
  mode: 'lfo' | 'random';
  waveform: string;
  rate: number;
  // offset and phase removed per UI simplification
  jitter: number;
  smooth: number;
  tempoSync: boolean;
  hold: boolean;
  retrigger: boolean;
  currentValue: number;
  // LFO timing
  lfoTimingMode?: 'sync' | 'hz';
  lfoDivision?: '1/64' | '1/32' | '1/16' | '1/8' | '1/4' | '1/2' | '1' | '2' | '4' | '8' | '16' | '32';
  lfoHz?: number;
  lfoDivisionIndex?: number; // 0..11 maps to [1/64,1/32,1/16,1/8,1/4,1/2,1,2,4,8,16,32]
  // LFO shaping (percentage amplitude window 0..100)
  lfoMin?: number; // 0..100 minimum amplitude floor (0 = none)
  lfoMax?: number; // 0..100 maximum amplitude ceiling (100 = full)
  lfoSkipPercent?: number; // 0..100 randomly skip frames
  // Random (BPM) generator settings
  randomMin: number; // -100..100, mapped to -1..1
  randomMax: number; // -100..100, mapped to -1..1
  skipPercent: number; // 0..100 chance to skip triggering on a beat
  randomTimingMode?: 'sync' | 'hz';
  randomDivision?: '1/64' | '1/32' | '1/16' | '1/8' | '1/4' | '1/2' | '1' | '2' | '4' | '8' | '16' | '32';
  randomHz?: number;
  randomDivisionIndex?: number; // 0..11 maps to [1/64,1/32,1/16,1/8,1/4,1/2,1,2,4,8,16,32]
}

export interface LFOMapping {
  id: string;
  parameter: string;
  min: number;
  max: number;
  enabled: boolean;
}

const DEFAULT_LFO_STATE: LFOState = {
  mode: 'lfo',
  waveform: 'sine',
  rate: 1.0,
  // offset/phase removed
  jitter: 0,
  smooth: 0,
  tempoSync: false,
  hold: false,
  retrigger: false,
  currentValue: 0,
  // LFO timing defaults
  lfoTimingMode: 'hz',
  lfoDivision: '1/4',
  lfoHz: 1.0,
  lfoDivisionIndex: 4, // 1/4 is at index 4 in the full array
  // LFO shaping defaults (0..100)
  lfoMin: 0,
  lfoMax: 100,
  lfoSkipPercent: 0,
  // Random defaults
  randomMin: -100,
  randomMax: 100,
  skipPercent: 0,
  randomTimingMode: 'sync',
  randomDivision: '1/4',
  randomHz: 2.0,
  randomDivisionIndex: 4, // 1/4 is at index 4 in the full array
};

interface LFOStore {
  // Non-persisted real-time values
  modulatedValues: Record<string, LFOModulatedValue>;
  
  // Persisted LFO state and mappings, scoped per layer id
  lfoStateByLayer: Record<string, LFOState>;
  mappingsByLayer: Record<string, LFOMapping[]>;
  selectedMapping: string | null; // kept global for UI convenience
  // Persisted UI defaults for initializing new layers
  uiDefaults: { lfoMin: number; lfoMax: number };
  // Template capturing last used LFO settings to initialize new layers
  lastLFOStateTemplate: Partial<LFOState> | null;
  
  // Actions for modulated values (not persisted)
  setModulatedValue: (key: string, value: LFOModulatedValue) => void;
  clearModulatedValue: (key: string) => void;
  getModulatedValue: (layerId: string, parameterName: string) => LFOModulatedValue | null;
  
  // Actions for LFO state (persisted) — per layer
  setLFOStateForLayer: (layerId: string, state: Partial<LFOState>) => void;
  ensureLFOStateForLayer: (layerId: string) => LFOState;
  setMappingsForLayer: (layerId: string, mappings: LFOMapping[]) => void;
  addMappingForLayer: (layerId: string, mapping: LFOMapping) => void;
  removeMappingForLayer: (layerId: string, id: string) => void;
  updateMappingForLayer: (layerId: string, id: string, updates: Partial<LFOMapping>) => void;
  setSelectedMapping: (id: string | null) => void;
  setUIDefaults: (defaults: Partial<{ lfoMin: number; lfoMax: number }>) => void;
  getDefaultsForNewLayer: () => LFOState;
}

// LFO store with selective persistence
export const useLFOStore = create<LFOStore>()(
  persist(
    (set, get) => ({
      // Non-persisted real-time values
      modulatedValues: {},
      
      // Persisted LFO state and mappings (initial values) — empty, filled lazily per layer
      lfoStateByLayer: {},
      mappingsByLayer: {},
      selectedMapping: null,
      uiDefaults: { lfoMin: 0, lfoMax: 100 },
      lastLFOStateTemplate: null,
      
      // Actions for modulated values (not persisted)
      setModulatedValue: (key: string, value: LFOModulatedValue) => set((state) => ({
        modulatedValues: {
          ...state.modulatedValues,
          [key]: value
        }
      })),
      
      clearModulatedValue: (key: string) => set((state) => {
        const newValues = { ...state.modulatedValues };
        delete newValues[key];
        return { modulatedValues: newValues };
      }),
      
      getModulatedValue: (layerId: string, parameterName: string) => {
        const state = get();
        const key = `${layerId}-${parameterName}`;
        return state.modulatedValues[key] || null;
      },
      
      // Actions for LFO state (persisted) — per layer
      setLFOStateForLayer: (layerId: string, newState: Partial<LFOState>) => set((state) => {
        const current = state.lfoStateByLayer[layerId] || DEFAULT_LFO_STATE;
        // Update last used template with a sanitized subset of stable fields
        const templateSafeKeys: (keyof LFOState)[] = [
          'mode','waveform','lfoTimingMode','lfoDivision','lfoDivisionIndex','lfoHz','lfoMin','lfoMax','lfoSkipPercent',
          'randomTimingMode','randomDivision','randomDivisionIndex','randomHz','randomMin','randomMax','skipPercent'
        ];
        const templateUpdates: Partial<LFOState> = {};
        templateSafeKeys.forEach((k) => {
          if (k in newState && typeof (newState as any)[k] !== 'undefined') {
            (templateUpdates as any)[k] = (newState as any)[k];
          }
        });
        const mergedTemplate = { ...(state.lastLFOStateTemplate || {}), ...templateUpdates };
        const next = { ...current, ...newState } as LFOState;
        try {
          const changedKeys = Object.keys(newState).filter((k) => (newState as any)[k] !== (current as any)[k]);
          if (changedKeys.length > 0) {
            // Always log to regular console (filtered noise rules won't hide this prefix)
            // eslint-disable-next-line no-console
            console.log('[LFO]', 'setLFOStateForLayer', { layerId, changedKeys, newState });
          }
        } catch {}
        return {
          lfoStateByLayer: {
            ...state.lfoStateByLayer,
            [layerId]: next,
          },
          lastLFOStateTemplate: mergedTemplate,
        };
      }),

      ensureLFOStateForLayer: (layerId: string) => {
        const state = get();
        const existing = state.lfoStateByLayer[layerId];
        if (existing) return existing;
        const init: LFOState = state.getDefaultsForNewLayer();
        set((s) => ({
          lfoStateByLayer: {
            ...s.lfoStateByLayer,
            [layerId]: init,
          },
        }));
        return init;
      },

      setMappingsForLayer: (layerId: string, mappings: LFOMapping[]) => set((state) => ({
        mappingsByLayer: {
          ...state.mappingsByLayer,
          [layerId]: [...mappings],
        }
      })),

      addMappingForLayer: (layerId: string, mapping: LFOMapping) => set((state) => ({
        mappingsByLayer: {
          ...state.mappingsByLayer,
          [layerId]: [...(state.mappingsByLayer[layerId] || []), mapping],
        }
      })),

      removeMappingForLayer: (layerId: string, id: string) => set((state) => ({
        mappingsByLayer: {
          ...state.mappingsByLayer,
          [layerId]: (state.mappingsByLayer[layerId] || []).filter(m => m.id !== id),
        }
      })),

      updateMappingForLayer: (layerId: string, id: string, updates: Partial<LFOMapping>) => set((state) => ({
        mappingsByLayer: {
          ...state.mappingsByLayer,
          [layerId]: (state.mappingsByLayer[layerId] || []).map(m => m.id === id ? { ...m, ...updates } : m),
        }
      })),
      
      setSelectedMapping: (id: string | null) => set({ selectedMapping: id }),
      setUIDefaults: (defaults: Partial<{ lfoMin: number; lfoMax: number }>) => set((state) => ({
        uiDefaults: { ...state.uiDefaults, ...defaults },
      })),
      getDefaultsForNewLayer: () => {
        const state = get();
        const d = { ...DEFAULT_LFO_STATE } as LFOState;
        const tpl = state.lastLFOStateTemplate || {};
        const ui = state.uiDefaults || { lfoMin: 0, lfoMax: 100 };
        const merged: LFOState = {
          ...d,
          ...tpl,
          lfoMin: typeof tpl.lfoMin === 'number' ? tpl.lfoMin : ui.lfoMin,
          lfoMax: typeof tpl.lfoMax === 'number' ? tpl.lfoMax : ui.lfoMax,
        } as LFOState;
        return merged;
      },
    }),
    {
      name: 'lfo-storage',
      onRehydrateStorage: () => (state) => {
        try { (useLFOStore as any).persist.__hydrated = true; } catch {}
      },
      // Only persist LFO state and mappings, NOT real-time modulated values
      partialize: (state) => ({
        lfoStateByLayer: state.lfoStateByLayer,
        mappingsByLayer: state.mappingsByLayer,
        selectedMapping: state.selectedMapping,
        uiDefaults: state.uiDefaults,
        lastLFOStateTemplate: state.lastLFOStateTemplate,
      }),
    }
  )
);

// Expose store for debugging in DevTools
try { (window as any).__vj_lfo_store = useLFOStore; } catch {}
