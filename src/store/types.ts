export type LayerType = 'image' | 'video' | 'shader' | 'p5' | 'three';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';
export type TransitionType = 'cut' | 'fade' | 'fade-through-black';

export interface LayerParamValue {
  value: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  opacity: number;
  blendMode: BlendMode;
  solo: boolean;
  mute: boolean;
  locked: boolean;
  params: Record<string, LayerParamValue>;
}

export interface Column {
  id: string;
  name: string;
  layers: Layer[];
  midiNote?: number;
  midiChannel?: number;
}

export interface Scene {
  id: string;
  name: string;
  columns: Column[];
  globalEffects: string[];
}

export interface MIDIMapping {
  type: 'note' | 'cc';
  channel: number;
  number: number;
  target: {
    type: 'layer' | 'scene' | 'global';
    id: string;
    param?: string;
  };
}

export interface AppState {
  scenes: Scene[];
  currentSceneId: string;
  bpm: number;
  sidebarVisible: boolean;
  midiMappings: MIDIMapping[];
  selectedLayerId: string | null;
  previewMode: 'composition' | 'layer';
  transitionType: TransitionType;
  transitionDuration: number;
} 