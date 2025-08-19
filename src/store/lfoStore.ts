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
  depth: number;
  offset: number;
  phase: number;
  jitter: number;
  smooth: number;
  tempoSync: boolean;
  hold: boolean;
  retrigger: boolean;
  currentValue: number;
  // LFO timing
  lfoTimingMode?: 'sync' | 'hz';
  lfoDivision?: '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/64';
  lfoHz?: number;
  lfoDivisionIndex?: number; // 0..5 maps to [2,4,8,16,32,64]
  // Random (BPM) generator settings
  randomMin: number; // -100..100, mapped to -1..1
  randomMax: number; // -100..100, mapped to -1..1
  skipPercent: number; // 0..100 chance to skip triggering on a beat
  randomTimingMode?: 'sync' | 'hz';
  randomDivision?: '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/64';
  randomHz?: number;
  randomDivisionIndex?: number; // 0..5 maps to [2,4,8,16,32,64]
}

export interface LFOMapping {
  id: string;
  parameter: string;
  min: number;
  max: number;
  enabled: boolean;
}

const DEFAULT_LFO_STATE: LFOState = {
  mode: 'random',
  waveform: 'sine',
  rate: 1.0,
  depth: 100,
  offset: 0,
  phase: 0,
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
  lfoDivisionIndex: 1,
  // Random defaults
  randomMin: -100,
  randomMax: 100,
  skipPercent: 0,
  randomTimingMode: 'sync',
  randomDivision: '1/4',
  randomHz: 2.0,
  randomDivisionIndex: 1,
};

interface LFOStore {
  // Non-persisted real-time values
  modulatedValues: Record<string, LFOModulatedValue>;
  
  // Persisted LFO state and mappings, scoped per layer id
  lfoStateByLayer: Record<string, LFOState>;
  mappingsByLayer: Record<string, LFOMapping[]>;
  selectedMapping: string | null; // kept global for UI convenience
  
  // Actions for modulated values (not persisted)
  setModulatedValue: (key: string, value: LFOModulatedValue) => void;
  clearModulatedValue: (key: string) => void;
  getModulatedValue: (layerId: string, parameterName: string) => LFOModulatedValue | null;
  
  // Actions for LFO state (persisted) — per layer
  setLFOStateForLayer: (layerId: string, state: Partial<LFOState>) => void;
  setMappingsForLayer: (layerId: string, mappings: LFOMapping[]) => void;
  addMappingForLayer: (layerId: string, mapping: LFOMapping) => void;
  removeMappingForLayer: (layerId: string, id: string) => void;
  updateMappingForLayer: (layerId: string, id: string, updates: Partial<LFOMapping>) => void;
  setSelectedMapping: (id: string | null) => void;
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
        return {
          lfoStateByLayer: {
            ...state.lfoStateByLayer,
            [layerId]: { ...current, ...newState },
          }
        };
      }),

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
    }),
    {
      name: 'lfo-storage',
      // Only persist LFO state and mappings, NOT real-time modulated values
      partialize: (state) => ({
        lfoStateByLayer: state.lfoStateByLayer,
        mappingsByLayer: state.mappingsByLayer,
        selectedMapping: state.selectedMapping
      }),
    }
  )
);
