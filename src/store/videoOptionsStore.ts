import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VideoLayerOptions {
  fitMode?: 'cover' | 'contain' | 'stretch' | 'none' | 'tile';
  loopMode?: 'none' | 'loop' | 'reverse' | 'ping-pong' | 'random';
  // For Random playback: BPM used to determine jump interval (defaults to app BPM)
  randomBpm?: number;
  loopCount?: number;
  reverseEnabled?: boolean;
  pingPongEnabled?: boolean;
  playMode?: 'restart' | 'continue';
  renderScale?: number;
  blendMode?: 'add' | 'multiply' | 'screen' | 'overlay' | 'difference';
  opacity?: number;
  backgroundSizeMode?: 'contain' | 'cover' | 'stretch' | 'none';
  backgroundRepeat?: 'repeat' | 'no-repeat';
  backgroundSizeCustom?: string;
}

interface VideoOptionsStore {
  // Video options for columns mode
  videoOptionsByLayer: Record<string, VideoLayerOptions>;
  // Video options for timeline mode
  timelineVideoOptionsByLayer: Record<string, VideoLayerOptions>;
  
  // Actions for video options (persisted) — per layer and mode
  setVideoOptionsForLayer: (layerId: string, options: Partial<VideoLayerOptions>) => void;
  setTimelineVideoOptionsForLayer: (layerId: string, options: Partial<VideoLayerOptions>) => void;
  getVideoOptionsForLayer: (layerId: string, isTimelineMode: boolean) => VideoLayerOptions;
  setVideoOptionsForLayerMode: (layerId: string, options: Partial<VideoLayerOptions>, isTimelineMode: boolean) => void;
  ensureVideoOptionsForLayer: (layerId: string, isTimelineMode: boolean) => VideoLayerOptions;
  clearVideoOptionsForLayer: (layerId: string, isTimelineMode: boolean) => void;
}

const DEFAULT_VIDEO_OPTIONS: VideoLayerOptions = {
  fitMode: 'cover',
  loopMode: 'none',
  randomBpm: undefined,
  loopCount: 1,
  reverseEnabled: false,
  pingPongEnabled: false,
  playMode: 'restart',
  renderScale: 1.0,
  blendMode: 'add',
  opacity: 1.0,
  backgroundSizeMode: 'cover',
  backgroundRepeat: 'no-repeat',
  backgroundSizeCustom: undefined,
};

// Video options store with selective persistence
export const useVideoOptionsStore = create<VideoOptionsStore>()(
  persist(
    (set, get) => ({
      // Video options for columns mode
      videoOptionsByLayer: {},
      // Video options for timeline mode
      timelineVideoOptionsByLayer: {},
      
      // Actions for video options (persisted) — per layer and mode
      setVideoOptionsForLayer: (layerId: string, options: Partial<VideoLayerOptions>) => set((state) => ({
        videoOptionsByLayer: {
          ...state.videoOptionsByLayer,
          [layerId]: {
            ...state.videoOptionsByLayer[layerId],
            ...options,
          },
        }
      })),

      setTimelineVideoOptionsForLayer: (layerId: string, options: Partial<VideoLayerOptions>) => set((state) => ({
        timelineVideoOptionsByLayer: {
          ...state.timelineVideoOptionsByLayer,
          [layerId]: {
            ...state.timelineVideoOptionsByLayer[layerId],
            ...options,
          },
        }
      })),

      getVideoOptionsForLayer: (layerId: string, isTimelineMode: boolean) => {
        const state = get();
        const options = isTimelineMode 
          ? state.timelineVideoOptionsByLayer[layerId]
          : state.videoOptionsByLayer[layerId];
        return options ? { ...DEFAULT_VIDEO_OPTIONS, ...options } : { ...DEFAULT_VIDEO_OPTIONS };
      },

      setVideoOptionsForLayerMode: (layerId: string, options: Partial<VideoLayerOptions>, isTimelineMode: boolean) => set((state) => {
        if (isTimelineMode) {
          return {
            timelineVideoOptionsByLayer: {
              ...state.timelineVideoOptionsByLayer,
              [layerId]: {
                ...state.timelineVideoOptionsByLayer[layerId],
                ...options,
              },
            }
          };
        } else {
          return {
            videoOptionsByLayer: {
              ...state.videoOptionsByLayer,
              [layerId]: {
                ...state.videoOptionsByLayer[layerId],
                ...options,
              },
            }
          };
        }
      }),

      ensureVideoOptionsForLayer: (layerId: string, isTimelineMode: boolean) => {
        const state = get();
        const existing = isTimelineMode 
          ? state.timelineVideoOptionsByLayer[layerId]
          : state.videoOptionsByLayer[layerId];
        
        if (existing) return { ...DEFAULT_VIDEO_OPTIONS, ...existing };
        
        const init = { ...DEFAULT_VIDEO_OPTIONS };
        set((s) => {
          if (isTimelineMode) {
            return {
              timelineVideoOptionsByLayer: {
                ...s.timelineVideoOptionsByLayer,
                [layerId]: init,
              },
            };
          } else {
            return {
              videoOptionsByLayer: {
                ...s.videoOptionsByLayer,
                [layerId]: init,
              },
            };
          }
        });
        return init;
      },

      clearVideoOptionsForLayer: (layerId: string, isTimelineMode: boolean) => set((state) => {
        if (isTimelineMode) {
          const newTimelineOptions = { ...state.timelineVideoOptionsByLayer };
          delete newTimelineOptions[layerId];
          return { timelineVideoOptionsByLayer: newTimelineOptions };
        } else {
          const newOptions = { ...state.videoOptionsByLayer };
          delete newOptions[layerId];
          return { videoOptionsByLayer: newOptions };
        }
      }),
    }),
    {
      name: 'video-options-storage',
      onRehydrateStorage: () => (state) => {
        try { (useVideoOptionsStore as any).persist.__hydrated = true; } catch {}
      },
      // Only persist video options, not real-time values
      partialize: (state) => ({
        videoOptionsByLayer: state.videoOptionsByLayer,
        timelineVideoOptionsByLayer: state.timelineVideoOptionsByLayer,
      }),
    }
  )
);

// Expose store for debugging in DevTools
try { (window as any).__vj_video_options_store = useVideoOptionsStore; } catch {}
