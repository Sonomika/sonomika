export type LayerType = 'image' | 'video' | 'shader' | 'p5' | 'three';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';
export type TransitionType = 'cut' | 'fade' | 'fade-through-black';

export interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'shader' | 'p5js' | 'threejs';
  path: string;
  filePath?: string; // Actual file path on disk
  originalPath?: string; // Original file path for persistence
  base64Data?: string; // For persistence
  size: number;
  date: string;
  addedAt?: number; // Timestamp when asset was added
  file?: File;
}

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

export interface GlobalEffectSlot {
  id: string;
  effectId: string;
  enabled: boolean;
  params: Record<string, LayerParamValue>;
}

export interface Scene {
  id: string;
  name: string;
  columns: Column[];
  globalEffects: GlobalEffectSlot[];
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

export interface CompositionSettings {
  width: number;
  height: number;
  aspectRatio: string; // e.g., "16:9", "4:3", "1:1"
  frameRate: number;
  backgroundColor: string; // Hex color string, e.g. #000000
  name?: string;
  description?: string;
}

export interface AppState {
  scenes: Scene[];
  currentSceneId: string;
  playingColumnId: string | null; // Track which column is currently playing
  bpm: number;
  sidebarVisible: boolean;
  midiMappings: MIDIMapping[];
  selectedLayerId: string | null;
  selectedTimelineClip: any | null;
  previewMode: 'composition' | 'layer';
  transitionType: TransitionType;
  transitionDuration: number;
  assets: Asset[];
  compositionSettings: CompositionSettings;
  timelineSnapEnabled: boolean; // Magnet/Snap toggle
  timelineDuration: number; // Timeline duration in seconds
  timelineZoom: number; // Timeline zoom level
} 