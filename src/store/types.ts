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
  // Dropbox metadata for web playback auto-refresh
  dropboxPath?: string; // path_lower of the Dropbox file within app folder
  dropboxExpiresAt?: number; // epoch ms for temporary link expiry
}

export interface LayerParamValue {
  value: number | boolean | string | any[];
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | { value: string; label?: string }[];
  locked?: boolean;
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
  playMode?: 'restart' | 'continue'; // For video layers: restart or continue playback
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
  // UI: number of visible rows in the column grid
  numRows?: number;
  // Action to take when scene ends
  endOfSceneAction?: 'loop' | 'play_next' | 'random' | 'stop';
  // Whether Sequence (audio-triggered markers) is enabled for this scene
  sequenceEnabled?: boolean;
}

export interface MIDIMapping {
  // Input type and addressing
  // 'note' and 'cc' use channel+number; 'key' uses key/modifiers
  type: 'note' | 'cc' | 'key';
  channel?: number; // 1-16 for MIDI
  number?: number;  // note number (0-127) or CC number (0-127)
  key?: string;     // KeyboardEvent.key (case-sensitive from browser)
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  enabled?: boolean;

  // Target action for this mapping. We support multiple kinds of actions.
  target:
    | {
        // Control a specific layer parameter
        type: 'layer';
        id: string; // layerId
        param?: string; // parameter name (e.g., opacity or effect param)
      }
    | {
        // Control a global effect parameter in the current scene
        type: 'global-effect';
        id: string; // globalEffectSlot id
        param?: string; // parameter name in the global effect
      }
    | {
        // Trigger a specific cell (row x column) in the current scene
        // Prefer addressing by columnId for stability; fall back to 1-based column index
        type: 'cell';
        row: number;          // 1..numRows (layer number)
        column?: number;      // 1..N columns in current scene
        columnId?: string;    // Stable id of the column in the current scene
      }
    | {
        // Switch scenes by id
        type: 'scene';
        id: string; // sceneId
      }
    | {
        // Global parameter control (e.g., bpm)
        type: 'global';
        param: 'bpm';
      }
    | {
        // Transport actions (play/pause/stop)
        type: 'transport';
        action: 'play' | 'pause' | 'stop';
      }
    | {
        // Trigger a column in the current scene by its 1-based index
        type: 'column';
        index: number; // 1..N in current scene
      };
}

export interface CompositionSettings {
  width: number;
  height: number;
  aspectRatio: string; // e.g., "16:9", "4:3", "1:1"
  backgroundColor: string; // Hex color string, e.g. #000000
  name?: string;
  description?: string;
}

export interface AppState {
  // Column mode scenes (original scenes)
  scenes: Scene[];
  currentSceneId: string;
  // Timeline mode scenes (separate from column mode)
  timelineScenes: Scene[];
  currentTimelineSceneId: string;
  playingColumnId: string | null; // Track which column is currently playing
  // UI selection (separate from transport). This should NOT auto-start playback.
  selectedColumnId?: string | null;
  isGlobalPlaying: boolean; // Track global play/pause state
  // Global toggle for Sequence (audio-triggered markers) across all scenes
  sequenceEnabledGlobal?: boolean;
  bpm: number;
  sidebarVisible: boolean; // Global accessibility mode
  accessibilityEnabled: boolean; // Global accessibility mode
  accentColor?: string;
  // Multiplier to adjust brightness of neutral greys (0.5–1.5, default 1)
  neutralContrast?: number;
  // Font color for all text elements (hex color string)
  fontColor?: string;
  midiMappings: MIDIMapping[];
  // MIDI options
  midiForceChannel1?: boolean; // If true, remap incoming MIDI events to channel 1
  // Selected MIDI input devices (empty array means no devices - MIDI disabled)
  selectedMIDIDevices?: string[]; // Array of device names/IDs to listen to
  // Normalize incoming CC numbers by subtracting this offset (e.g., 31 makes CC32 behave like CC1)
  midiCCOffset?: number;
  // When true, learn CC offset automatically from the next incoming CC message
  midiAutoDetectOffset?: boolean;
  // Internal flag that indicates the auto-detect mode is waiting for the next CC message
  midiAutoDetectOffsetPrimed?: boolean;
  selectedLayerId: string | null;
  selectedTimelineClip: any | null;
  previewMode: 'composition' | 'layer';
  showTimeline: boolean; // Persisted: whether timeline view is active
  middlePanelTab?: 'global' | 'layer';
  rightPanelTab?: 'media' | 'effects' | 'midi' | 'lfo';
  // Show/hide the System effects tab in the EffectsBrowser
  showSystemEffectsTab?: boolean;
  transitionType: TransitionType;
  transitionDuration: number;
  assets: Asset[];
  compositionSettings: CompositionSettings;
  timelineSnapEnabled: boolean; // Magnet/Snap toggle
  timelineDuration: number; // Timeline duration in seconds
  timelineZoom: number; // Timeline zoom level
  // Default sizing mode for video/image/webcam sourcesu
  // Default internal render scale for new/unspecified video layers (0.1..1)
  defaultVideoRenderScale?: number;
  // Mirror output quality preset
  mirrorQuality?: 'low' | 'medium' | 'high';
  // Whether single mirror keeps preview in app (skip direct-output)
  mirrorKeepPreview?: boolean;
  // Spout output (Windows-only in Electron)
  spoutEnabled?: boolean;
  spoutSenderName?: string;
  spoutMaxFps?: number;
  // Global default fit mode for video sources
  defaultVideoFitMode?: 'cover' | 'contain' | 'stretch' | 'none' | 'tile';
  // Per-layer active cell overrides (Resolume-style): map layerNum -> columnId
  activeLayerOverrides?: Record<number, string>;
  // Track last saved/loaded preset name (web + Electron)
  currentPresetName?: string | null;
  // Track last saved/loaded preset file path (Electron)
  currentPresetPath?: string | null;
  // Enable crossfade transitions when switching between columns
  columnCrossfadeEnabled?: boolean;
  // Crossfade transition duration in milliseconds
  columnCrossfadeDuration?: number;
  // Enable crossfade transitions when switching "cells" (row overrides) across columns
  cellCrossfadeEnabled?: boolean;
} 