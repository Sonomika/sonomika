import { LoopMode } from '../constants/video';

// Base layer interface
export interface BaseLayer {
  id: string;
  name: string;
  type: 'video' | 'image' | 'p5' | 'effect';
  enabled?: boolean;
  opacity?: number;
  blendMode?: string;
  solo?: boolean;
  mute?: boolean;
  locked?: boolean;
  params?: Record<string, any>;
}

// Video layer specific interface
export interface VideoLayer extends BaseLayer {
  type: 'video';
  asset?: {
    id: string;
    name: string;
    type: 'video';
    path: string;
    filePath?: string;
    size?: number;
    date?: string;
  };
  loopMode?: LoopMode;
  loopCount?: number;
  reverseEnabled?: boolean;
  pingPongEnabled?: boolean;
  autoplay?: boolean;
  bpmSync?: boolean;
  fitMode?: 'cover' | 'contain' | 'stretch' | 'none' | 'tile';
  position?: { x: number; y: number };
  scale?: number;
  rotation?: number;
  muted?: boolean;
  loop?: boolean;
  playMode?: 'restart' | 'continue'; // New property: restart video or continue from current position
  metadata?: {
    width: number;
    height: number;
    duration: number;
    aspectRatio: number;
  };
}

// Image layer specific interface
export interface ImageLayer extends BaseLayer {
  type: 'image';
  asset?: {
    id: string;
    name: string;
    type: 'image';
    path: string;
    filePath?: string;
    size?: number;
    date?: string;
  };
  fitMode?: 'cover' | 'contain' | 'stretch';
  position?: { x: number; y: number };
}

// P5 layer specific interface
export interface P5Layer extends BaseLayer {
  type: 'p5';
  script?: string;
  params?: Record<string, any>;
}

// Effect layer specific interface
export interface EffectLayer extends BaseLayer {
  type: 'effect';
  effectType?: string;
  params?: Record<string, any>;
}

// Union type for all layer types
export type Layer = VideoLayer | ImageLayer | P5Layer | EffectLayer;

// Column interface
export interface Column {
  id: string;
  name: string;
  layers: Layer[];
}

// Scene interface
export interface Scene {
  id: string;
  name: string;
  columns: Column[];
  globalEffects: any[];
} 