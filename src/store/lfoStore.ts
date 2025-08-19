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

interface LFOStore {
  // Non-persisted real-time values
  modulatedValues: Record<string, LFOModulatedValue>;
  
  // Persisted LFO state and mappings
  lfoState: LFOState;
  mappings: LFOMapping[];
  selectedMapping: string | null;
  
  // Actions for modulated values (not persisted)
  setModulatedValue: (key: string, value: LFOModulatedValue) => void;
  clearModulatedValue: (key: string) => void;
  getModulatedValue: (layerId: string, parameterName: string) => LFOModulatedValue | null;
  
  // Actions for LFO state (persisted)
  setLFOState: (state: Partial<LFOState>) => void;
  setMappings: (mappings: LFOMapping[]) => void;
  addMapping: (mapping: LFOMapping) => void;
  removeMapping: (id: string) => void;
  updateMapping: (id: string, updates: Partial<LFOMapping>) => void;
  setSelectedMapping: (id: string | null) => void;
}

// LFO store with selective persistence
export const useLFOStore = create<LFOStore>()(
  persist(
    (set, get) => ({
      // Non-persisted real-time values
      modulatedValues: {},
      
      // Persisted LFO state and mappings (initial values)
      lfoState: {
        mode: 'lfo',
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
        // Random defaults
        randomMin: -100,
        randomMax: 100,
        skipPercent: 0,
        randomTimingMode: 'sync',
        randomDivision: '1/4',
        randomHz: 2.0,
        randomDivisionIndex: 1,
      },
      mappings: [],
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
      
      // Actions for LFO state (persisted)
      setLFOState: (newState: Partial<LFOState>) => set((state) => ({
        lfoState: { ...state.lfoState, ...newState }
      })),
      
      setMappings: (mappings: LFOMapping[]) => set({ mappings }),
      
      addMapping: (mapping: LFOMapping) => set((state) => ({
        mappings: [...state.mappings, mapping]
      })),
      
      removeMapping: (id: string) => set((state) => ({
        mappings: state.mappings.filter(m => m.id !== id)
      })),
      
      updateMapping: (id: string, updates: Partial<LFOMapping>) => set((state) => ({
        mappings: state.mappings.map(m => m.id === id ? { ...m, ...updates } : m)
      })),
      
      setSelectedMapping: (id: string | null) => set({ selectedMapping: id }),
    }),
    {
      name: 'lfo-storage',
      // Only persist LFO state and mappings, NOT real-time modulated values
      partialize: (state) => ({
        lfoState: state.lfoState,
        mappings: state.mappings,
        selectedMapping: state.selectedMapping
      }),
    }
  )
);
