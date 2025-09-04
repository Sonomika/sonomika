import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { AppState, Scene, Column, Layer, MIDIMapping, Asset, CompositionSettings, TransitionType } from './types';

// Synchronously read persisted composition settings for initial render (before hydration)
const getPersistedCompositionSettings = (): CompositionSettings | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = localStorage.getItem('vj-app-storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const saved = (parsed && (parsed.state?.compositionSettings || parsed.compositionSettings)) || null;
    if (!saved) return null;
    const width = Number(saved.width);
    const height = Number(saved.height);
    const aspect = saved.aspectRatio || (width && height ? `${width}:${height}` : '16:9');
    const backgroundColor = typeof saved.backgroundColor === 'string' ? saved.backgroundColor : '#000000';
    if (!width || !height) return null;
    return { width, height, aspectRatio: aspect, backgroundColor } as CompositionSettings;
  } catch {
    return null;
  }
};

const createEmptyLayer = (type: Layer['type'] = 'p5'): Layer => ({
  id: uuidv4(),
  type,
  name: 'New Layer',
  opacity: 1,
  blendMode: 'normal',
  solo: false,
  mute: false,
  locked: false,
  playMode: 'restart', // Default to restart mode
  params: {},
});

const createEmptyColumn = (): Column => ({
  id: uuidv4(),
  name: 'New Column',
  layers: [createEmptyLayer()],
});

const createEmptyScene = (): Scene => ({
  id: uuidv4(),
  name: 'New Scene',
  columns: Array.from({ length: 20 }, () => createEmptyColumn()),
  globalEffects: [],
});

const createDefaultScenes = (): Scene[] => {
  // console.log('🔧 Creating default scene');
  return [{
    id: uuidv4(),
    name: '1',
    columns: Array.from({ length: 20 }, () => createEmptyColumn()),
    globalEffects: [],
  }];
};

const initialState: AppState = {
  scenes: createDefaultScenes(),
  currentSceneId: '',
  playingColumnId: null, // No column playing initially
  isGlobalPlaying: false, // Global play/pause state
  bpm: 120,
  sidebarVisible: true,
  accessibilityEnabled: false,
  accentColor: '#00bcd4',
  midiMappings: [],
  midiForceChannel1: false,
  selectedLayerId: null,
  selectedTimelineClip: null,
  previewMode: 'composition',
  showTimeline: false,
  transitionType: 'fade',
  transitionDuration: 500,
  assets: [],
  compositionSettings: getPersistedCompositionSettings() || {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    backgroundColor: '#000000',
  },
  timelineSnapEnabled: true,
  timelineDuration: 60, // 1 minute default
  timelineZoom: 2, // Default zoom level
  defaultVideoRenderScale: 0.5,
  mirrorQuality: 'medium',
  mirrorKeepPreview: true,
};

initialState.currentSceneId = initialState.scenes[0].id;

export type RecordSettings = {
  durationSec: number;
  codec: 'vp8' | 'vp9';
  quality: 'low' | 'medium' | 'high';
  untilStop?: boolean;
  audioSource: 'none' | 'microphone' | 'system';
  audioBitrate: number;
};

const initialRecordSettings: RecordSettings = {
  durationSec: 5,
  codec: 'vp8',
  quality: 'medium',
  audioSource: 'none',
  audioBitrate: 128000,
  untilStop: false
};

export const useStore = createWithEqualityFn<AppState & {
  addScene: () => void;
  setCurrentScene: (sceneId: string) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  removeScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  setAccessibilityEnabled: (enabled: boolean) => void;
  toggleAccessibility: () => void;
  addColumn: (sceneId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  toggleSidebar: () => void;
  setBpm: (bpm: number) => void;
  setSelectedLayer: (layerId: string | null) => void;
  setSelectedTimelineClip: (clip: any | null) => void;
  setPreviewMode: (mode: AppState['previewMode']) => void;
  setShowTimeline: (show: boolean) => void;
  addMIDIMapping: (mapping: MIDIMapping) => void;
  removeMIDIMapping: (index: number) => void;
  setMIDIMappings: (mappings: MIDIMapping[]) => void;
  setMIDIForceChannel1: (forced: boolean) => void;
  setTransitionType: (type: TransitionType) => void;
  setTransitionDuration: (duration: number) => void;
  setPlayingColumn: (columnId: string | null) => void;
  playColumn: (columnId: string) => void;
  stopColumn: () => void;
  globalPlay: () => void;
  globalPause: () => void;
  globalStop: () => void;
  clearStorage: () => void;
  resetToDefault: () => void;
      addAsset: (asset: Asset) => void;
    updateAsset: (assetId: string, updates: Partial<Asset>) => void;
    removeAsset: (assetId: string) => void;
    ensureVideoPersistence: (assetId: string) => void;
    debugStorage: () => void;
  updateCompositionSettings: (settings: Partial<CompositionSettings>) => void;
  setAccentColor: (hex: string) => void;
  reorderLayers: (columnId: string, startIndex: number, endIndex: number) => void;
  moveBetweenColumns: (sourceColumnId: string, destinationColumnId: string, sourceIndex: number, destinationIndex: number) => void;
  savePreset: (presetName?: string) => string | null;
  loadPreset: (file: File) => Promise<boolean>;
  // Cloud presets (web via Supabase)
  listCloudPresets: () => Promise<Array<{ name: string; updated_at?: string }>>;
  loadPresetCloud: (name: string) => Promise<boolean>;
  deletePresetCloud: (name: string) => Promise<boolean>;
  setTimelineSnapEnabled: (enabled: boolean) => void;
  setTimelineDuration: (duration: number) => void;
  setTimelineZoom: (zoom: number) => void;
  setCurrentPresetName?: (name: string | null) => void;
  recordSettings: RecordSettings;
  setRecordSettings: (rs: Partial<RecordSettings>) => void;
  setDefaultVideoRenderScale: (scale: number) => void;
  setMirrorQuality: (q: 'low' | 'medium' | 'high') => void;
  setMirrorKeepPreview: (v: boolean) => void;
}>()(
  persist(
    (set, get) => ({
      ...initialState,
      currentPresetName: null as any,
      setCurrentPresetName: (name: string | null) => set({ currentPresetName: name } as any),
      recordSettings: initialRecordSettings,
      setRecordSettings: (rs) => set({ recordSettings: { ...get().recordSettings, ...rs } }),
      setDefaultVideoRenderScale: (scale: number) => set({ defaultVideoRenderScale: Math.max(0.1, Math.min(1, Number(scale) || 1)) }),
      setMirrorQuality: (q) => set({ mirrorQuality: (q === 'low' || q === 'medium' || q === 'high') ? q : 'medium' }),
      setMirrorKeepPreview: (v: boolean) => set({ mirrorKeepPreview: Boolean(v) }),

      addScene: () => set((state) => {
        const newScene = createEmptyScene();
        return { scenes: [...state.scenes, newScene] };
      }),

      setCurrentScene: (sceneId: string) => set({ currentSceneId: sceneId }),

      updateScene: (sceneId: string, updates: Partial<Scene>) => {
        // console.log('updateScene called with sceneId:', sceneId, 'updates:', updates);
        return set((state) => {
          const newScenes = state.scenes.map(scene => 
            scene.id === sceneId ? { ...scene, ...updates } : scene
          );
          // console.log('Updated scenes:', newScenes);
          return { scenes: newScenes };
        });
      },

      removeScene: (sceneId: string) => set((state) => ({
        scenes: state.scenes.filter(scene => scene.id !== sceneId),
        currentSceneId: state.currentSceneId === sceneId 
          ? state.scenes[0].id 
          : state.currentSceneId,
      })),

      duplicateScene: (sceneId: string) => set((state) => {
        const srcIndex = state.scenes.findIndex(s => s.id === sceneId);
        if (srcIndex === -1) return {} as any;
        const src = state.scenes[srcIndex];
        const cloned = {
          id: uuidv4(),
          name: `${src.name} Copy`,
          columns: src.columns.map((col) => ({
            id: uuidv4(),
            name: col.name,
            layers: col.layers.map((layer) => ({
              ...layer,
              id: uuidv4(),
            }))
          })),
          globalEffects: (src.globalEffects || []).map((eff: any) => {
            if (!eff) return eff;
            return { ...eff, id: uuidv4() };
          })
        } as Scene as any;
        const nextScenes = [...state.scenes];
        nextScenes.splice(srcIndex + 1, 0, cloned);
        return { scenes: nextScenes } as any;
      }),

      reorderScenes: (fromIndex: number, toIndex: number) => set((state) => {
        if (fromIndex === toIndex) return {} as any;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.scenes.length || toIndex >= state.scenes.length) return {} as any;
        const scenes = [...state.scenes];
        const [moved] = scenes.splice(fromIndex, 1);
        scenes.splice(toIndex, 0, moved);
        return { scenes } as any;
      }),

      setAccessibilityEnabled: (enabled: boolean) => set({ accessibilityEnabled: enabled }),
      toggleAccessibility: () => set((state) => ({ accessibilityEnabled: !state.accessibilityEnabled })),

      setAccentColor: (hex: string) => set((state) => {
        const color = /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : state.accentColor || '#00bcd4';
        // Apply to CSS var for global theming
        try {
          document.documentElement.style.setProperty('--accent', color);
        } catch {}
        return { accentColor: color } as any;
      }),

      addColumn: (sceneId: string) => set((state) => ({
        scenes: state.scenes.map(scene =>
          scene.id === sceneId
            ? { ...scene, columns: [...scene.columns, createEmptyColumn()] }
            : scene
        ),
      })),

      updateLayer: (layerId: string, updates: Partial<Layer>) => set((state) => ({
        scenes: state.scenes.map(scene => ({
          ...scene,
          columns: scene.columns.map(column => ({
            ...column,
            layers: column.layers.map(layer =>
              layer.id === layerId ? { ...layer, ...updates } : layer
            ),
          })),
        })),
      })),

      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

      setBpm: (bpm: number) => set({ bpm }),

      setSelectedLayer: (layerId: string | null) => set({ selectedLayerId: layerId }),

      setSelectedTimelineClip: (clip: any | null) => set({ selectedTimelineClip: clip }),

      setPreviewMode: (mode: AppState['previewMode']) => set({ previewMode: mode }),

      // Temporarily disable timeline mode for release: force false
      setShowTimeline: (_show: boolean) => set({ showTimeline: false }),

      addMIDIMapping: (mapping: MIDIMapping) => set((state) => ({
        midiMappings: [...state.midiMappings, mapping],
      })),

      removeMIDIMapping: (index: number) => set((state) => ({
        midiMappings: state.midiMappings.filter((_, i) => i !== index),
      })),

      setMIDIMappings: (mappings: MIDIMapping[]) => set({ midiMappings: mappings }),
      setMIDIForceChannel1: (forced: boolean) => set({ midiForceChannel1: !!forced }),

      setTransitionType: (type: AppState['transitionType']) => set({ transitionType: type }),

      setTransitionDuration: (duration: number) => set({ transitionDuration: duration }),

             // Column playback control
       setPlayingColumn: (columnId: string | null) => {
         try {
           set({ playingColumnId: columnId });
         } catch (error) {
           console.warn('Failed to set playing column:', error);
         }
       },
       
               playColumn: (columnId: string) => {
          try {
            // Get the current scene and column to access video layers
            const state = get();
            const currentScene = state.scenes.find(scene => scene.id === state.currentSceneId);
            const column = currentScene?.columns.find(col => col.id === columnId);
            
            if (column) {
              // Handle video layers based on their playMode
              column.layers.forEach(layer => {
                if (layer.type === 'video' || (layer as any)?.asset?.type === 'video') {
                  const playMode = layer.playMode || 'restart';
                  
                  if (playMode === 'restart') {
                    // Always restart if restart mode is selected
                    document.dispatchEvent(new CustomEvent('videoRestart', {
                      detail: { layerId: layer.id, columnId }
                    }));
                  } else if (playMode === 'continue') {
                    // Continue playback (resume from current position)
                    document.dispatchEvent(new CustomEvent('videoContinue', {
                      detail: { layerId: layer.id, columnId }
                    }));
                  }
                }
              });
            }
            
            // Dispatch column play event for general handling
            document.dispatchEvent(new CustomEvent('columnPlay', {
              detail: { type: 'columnPlay', columnId }
            }));
            
            // Always set as playing column (don't toggle off)
            set({ playingColumnId: columnId });
          } catch (error) {
            console.warn('Failed to play column:', error);
          }
        },
       
       stopColumn: () => {
         try {
           set({ playingColumnId: null });
           // Dispatch column stop event
           document.dispatchEvent(new CustomEvent('columnStop', {
             detail: { type: 'columnStop' }
           }));
         } catch (error) {
           console.warn('Failed to stop column:', error);
         }
       },

       // Global playback control
       globalPlay: () => {
         try {
           set({ isGlobalPlaying: true });
           // Dispatch global play event
           document.dispatchEvent(new CustomEvent('globalPlay', {
             detail: { type: 'globalPlay' }
           }));
           // Resume paused videos
           document.dispatchEvent(new CustomEvent('videoResume', {
             detail: { type: 'videoResume', allColumns: true }
           }));

           // Ensure a column is marked as playing so the app actually runs
           try {
             const st = get();
             if (!st.playingColumnId) {
               const scene = st.scenes.find(s => s.id === st.currentSceneId);
               const firstColumn = scene?.columns?.[0];
               if (firstColumn) {
                 // Defer slightly to allow any listeners to attach
                 setTimeout(() => {
                   try { (get() as any).playColumn(firstColumn.id); } catch {}
                 }, 0);
               }
             }
           } catch {}
         } catch (error) {
           console.warn('Failed to start global playback:', error);
         }
       },

       globalPause: () => {
         try {
           set({ isGlobalPlaying: false });
           // Dispatch global pause event
           document.dispatchEvent(new CustomEvent('globalPause', {
             detail: { type: 'globalPause' }
           }));
           // Pause LFO engine as well
           document.dispatchEvent(new CustomEvent('columnStop', {
             detail: { type: 'columnStop' }
           }));
           // Dispatch pause event for all video layers
           document.dispatchEvent(new CustomEvent('videoPause', {
             detail: { type: 'videoPause', allColumns: true }
           }));
         } catch (error) {
           console.warn('Failed to pause global playback:', error);
         }
       },

       globalStop: () => {
         try {
           set({ isGlobalPlaying: false, playingColumnId: null });
           // Dispatch global stop event
           document.dispatchEvent(new CustomEvent('globalStop', {
             detail: { type: 'globalStop' }
           }));
           // Also signal column stop for LFO engine
           document.dispatchEvent(new CustomEvent('columnStop', {
             detail: { type: 'columnStop' }
           }));
           // Dispatch stop event for all video layers
           document.dispatchEvent(new CustomEvent('videoStop', {
             detail: { type: 'videoStop', allColumns: true }
           }));
         } catch (error) {
           console.warn('Failed to stop global playback:', error);
         }
       },

       // Clear storage when quota is exceeded
             clearStorage: () => {
        try {
          localStorage.removeItem('vj-app-storage');
          // console.log('Storage cleared due to quota issues');
        } catch (error) {
          console.warn('Failed to clear storage:', error);
        }
      },

      resetToDefault: () => {
        try {
          // Clear localStorage
          localStorage.removeItem('vj-app-storage');
          
          // Reset to initial state
          set({
            ...initialState,
            currentSceneId: initialState.scenes[0].id,
          });
          
          // console.log('✅ Reset to default state completed');
        } catch (error) {
          console.warn('Failed to reset to default:', error);
        }
      },

      addAsset: (asset: Asset) => set((state) => {
        // console.log('Adding asset to store:', asset.name, asset.id);
        // console.log('Current assets count:', state.assets.length);
        
        // Ensure the asset has a persistent identifier
        const persistentAsset = {
          ...asset,
          // Store the original file path if available
          originalPath: asset.filePath || asset.path || asset.name,
          // Add timestamp for better tracking
          addedAt: Date.now(),
        };
        
        // console.log('Persistent asset data:', persistentAsset);
        return {
          assets: [...state.assets, persistentAsset],
        };
      }),

      updateAsset: (assetId: string, updates: Partial<Asset>) => set((state) => ({
        assets: state.assets.map(asset => 
          asset.id === assetId ? { ...asset, ...updates } : asset
        ),
      })),

      updateCompositionSettings: (settings: Partial<CompositionSettings>) => set((state) => ({
        compositionSettings: { ...state.compositionSettings, ...settings },
      })),

      removeAsset: (assetId: string) => set((state) => ({
        assets: state.assets.filter(asset => asset.id !== assetId),
      })),

      // Helper function to ensure video files persist their paths
      ensureVideoPersistence: (assetId: string) => set((state) => ({
        assets: state.assets.map(asset => 
          asset.id === assetId && asset.type === 'video' 
            ? { 
                ...asset, 
                originalPath: asset.filePath || asset.path,
                videoPath: asset.filePath || asset.path 
              }
            : asset
        ),
      })),

      // Debug function to check storage state
      debugStorage: () => {
        const state = get();
        // console.log('🔍 Current Storage State:');
        // console.log('  - Total Assets:', state.assets.length);
        // console.log('  - Video Assets:', state.assets.filter(a => a.type === 'video').length);
        // console.log('  - Assets with paths:', state.assets.filter(a => a.filePath || a.originalPath).length);
        // console.log('  - Video assets with paths:', state.assets.filter(a => a.type === 'video' && (a.filePath || a.originalPath)).length);
        
        // Check localStorage
        try {
          const storageData = localStorage.getItem('vj-app-storage');
          // console.log('  - localStorage size:', storageData?.length || 0, 'bytes');
          if (storageData) {
            const parsed = JSON.parse(storageData);
            // console.log('  - Stored assets count:', parsed.assets?.length || 0);
          }
        } catch (error) {
          console.error('  - Error reading localStorage:', error);
        }
      },

      reorderLayers: (columnId: string, startIndex: number, endIndex: number) => set((state) => ({
        scenes: state.scenes.map(scene => ({
          ...scene,
          columns: scene.columns.map(column => {
            if (column.id !== columnId) return column;
            const layers = [...column.layers];
            const [movedLayer] = layers.splice(startIndex, 1);
            layers.splice(endIndex, 0, movedLayer);
            return { ...column, layers };
          }),
        })),
      })),

             moveBetweenColumns: (
         sourceColumnId: string,
         destinationColumnId: string,
         sourceIndex: number,
         destinationIndex: number
       ) => set((state) => ({
         scenes: state.scenes.map(scene => {
           const sourceColumn = scene.columns.find(col => col.id === sourceColumnId);
           const destColumn = scene.columns.find(col => col.id === destinationColumnId);
           if (!sourceColumn || !destColumn) return scene;

           const newColumns = scene.columns.map(column => {
             if (column.id === sourceColumnId) {
               const layers = [...column.layers];
               layers.splice(sourceIndex, 1);
               return { ...column, layers };
             }
             if (column.id === destinationColumnId) {
               const layers = [...column.layers];
               layers.splice(destinationIndex, 0, sourceColumn.layers[sourceIndex]);
               return { ...column, layers };
             }
             return column;
           });

           return { ...scene, columns: newColumns };
         }),
       })),

               // Save current state as a preset
              savePreset: (presetName?: string) => {
        try {
          const state = get();
          const defaultName = presetName || `preset-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
          
          // Filter out large assets to prevent storage quota issues
          const filteredAssets = state.assets.map(asset => {
            const { base64Data, ...assetWithoutBase64 } = asset;
            // Only include base64Data for small files (under 500KB)
            if (asset.size < 500 * 1024 && base64Data) {
              return { ...assetWithoutBase64, base64Data };
            }
            // For larger files, just include the metadata
            return assetWithoutBase64;
          });
          
          let finalName = defaultName;

          const preset = {
            name: finalName,
            displayName: defaultName, // Human-readable name
            timestamp: Date.now(),
            version: '1.0.0',
            description: `VJ Preset: ${defaultName}`,
            data: {
              scenes: state.scenes,
              currentSceneId: state.currentSceneId,
              playingColumnId: state.playingColumnId,
              bpm: state.bpm,
              sidebarVisible: state.sidebarVisible,
              midiMappings: state.midiMappings,
              selectedLayerId: state.selectedLayerId,
              previewMode: state.previewMode,
              transitionType: state.transitionType,
              transitionDuration: state.transitionDuration,
              compositionSettings: state.compositionSettings,
              assets: filteredAssets,
            }
          };
          
          // Web: Save to database (Supabase). Electron: name only; file save handled in App.
          try {
            const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
            if (!isElectron) {
              (async () => {
                try {
                  const { getSupabase } = await import('../lib/supabaseClient');
                  const supabase = getSupabase();
                  const { data: userRes } = await supabase.auth.getUser();
                  const userId = userRes?.user?.id || null;
                  // Check for existing preset by case-insensitive name
                  try {
                    const { data: existing } = await supabase
                      .from('presets')
                      .select('name')
                      .eq('user_id', userId)
                      .ilike('name', defaultName);
                    if (existing && existing.length > 0 && existing[0]?.name) {
                      finalName = existing[0].name as string;
                    }
                  } catch {}
                  await supabase.from('presets').upsert(
                    {
                      user_id: userId,
                      name: finalName,
                      content: preset,
                      updated_at: new Date().toISOString()
                    },
                    { onConflict: 'user_id,name', ignoreDuplicates: false } as any
                  );
                } catch (cloudErr) {
                  try {
                    // Fallback to download file if cloud save fails
                    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${finalName}.vjpreset`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {}
                }
              })();
            }
          } catch {}
          try { set({ currentPresetName: finalName } as any); } catch {}
          return finalName;
        } catch (error) {
          console.error('Failed to save preset:', error);
          return null;
        }
      },

               // Load a preset
              loadPreset: (file: File) => {
        return new Promise<boolean>((resolve) => {
          try {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const presetData = e.target?.result as string;
                const preset = JSON.parse(presetData);
                const presetName = preset.displayName || preset.name || file.name;
                // console.log('Loading preset:', presetName);
                
                // Check if the preset data is too large for localStorage
                const dataSize = new Blob([presetData]).size;
                const maxSize = 4 * 1024 * 1024; // 4MB limit to be safe
                
                if (dataSize > maxSize) {
                  console.warn('⚠️ Preset data is too large for localStorage:', Math.round(dataSize / 1024), 'KB');
                  
                  // Try to load without large assets
                  const cleanedData = {
                    ...preset.data,
                                         assets: preset.data.assets?.filter((asset: any) => {
                       // Remove assets with base64Data that are too large
                       if (asset.base64Data && asset.size > 1024 * 1024) { // 1MB
                         // console.log('Removing large asset from preset:', asset.name, 'size:', Math.round(asset.size / 1024), 'KB');
                         return false;
                       }
                       return true;
                     }) || []
                  };
                  
                  // Clear localStorage first to make space
                  try {
                    localStorage.removeItem('vj-app-storage');
                    // console.log('Cleared localStorage to make space for preset');
                  } catch (clearError) {
                    console.warn('Failed to clear localStorage:', clearError);
                  }
                  
                  // Apply the cleaned preset data
                  set({ ...cleanedData, currentPresetName: presetName } as any);
                  resolve(true);
                } else {
                  // Apply the preset data to the store
                  set({ ...preset.data, currentPresetName: presetName } as any);
                  resolve(true);
                }
              } catch (error) {
                console.error('Failed to parse preset file:', error);
                resolve(false);
              }
            };
            reader.onerror = () => {
              console.error('Failed to read preset file');
              resolve(false);
            };
            reader.readAsText(file);
          } catch (error) {
            console.error('Failed to load preset:', error);
            resolve(false);
          }
        });
      },
      
      // Cloud preset management (web only)
      listCloudPresets: async () => {
        try {
          const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
          if (isElectron) return [];
          const { getSupabase } = await import('../lib/supabaseClient');
          const supabase = getSupabase();
          const { data: userRes } = await supabase.auth.getUser();
          const userId = userRes?.user?.id || null;
          const { data, error } = await supabase
            .from('presets')
            .select('name, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });
          if (error) throw error;
          return (data || []).map((r: any) => ({ name: r.name, updated_at: r.updated_at }));
        } catch {
          return [];
        }
      },
      
      loadPresetCloud: async (name: string) => {
        try {
          const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
          if (isElectron) return false;
          const { getSupabase } = await import('../lib/supabaseClient');
          const supabase = getSupabase();
          const { data: userRes } = await supabase.auth.getUser();
          const userId = userRes?.user?.id || null;
          const { data, error } = await supabase
            .from('presets')
            .select('content,name')
            .eq('user_id', userId)
            .ilike('name', name)
            .maybeSingle();
          if (error) throw error;
          const preset = data?.content;
          if (!preset?.data) return false;
          // Apply data to store
          set({ ...preset.data, currentPresetName: (data as any)?.name || name } as any);
          return true;
        } catch (e) {
          console.error('Failed to load cloud preset:', e);
          return false;
        }
      },
      
      deletePresetCloud: async (name: string) => {
        try {
          const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
          if (isElectron) return false;
          const { getSupabase } = await import('../lib/supabaseClient');
          const supabase = getSupabase();
          const { data: userRes } = await supabase.auth.getUser();
          const userId = userRes?.user?.id || null;
          const { error } = await supabase
            .from('presets')
            .delete()
            .eq('user_id', userId)
            .ilike('name', name);
          if (error) throw error;
          return true;
        } catch (e) {
          console.error('Failed to delete cloud preset:', e);
          return false;
        }
      },
      setTimelineSnapEnabled: (enabled: boolean) => set({ timelineSnapEnabled: enabled }),
      setTimelineDuration: (duration: number) => set({ timelineDuration: duration }),
      setTimelineZoom: (zoom: number) => set({ timelineZoom: zoom }),
    }),
    {
      name: 'vj-app-storage',
             partialize: (state) => {
         // console.log('Persisting state with assets:', state.assets.length);
         const sanitizedScenes = state.scenes.map((scene) => ({
           ...scene,
           columns: scene.columns.map((col) => ({
             ...col,
             layers: col.layers.map((layer: any) => {
               const nextLayer: any = { ...layer };
               if (nextLayer.asset) {
                 const a = nextLayer.asset as any;
                 // Drop heavy non-serializable refs
                 if (a.originalFile) delete a.originalFile;
                 if (a.base64Data && a.size > 500 * 1024) delete a.base64Data;
               }
               return nextLayer;
             })
           }))
         }));

         return {
           // Persist assets with base64Data for small files
           assets: state.assets.map(asset => {
             const persistedAsset: any = {
               id: asset.id,
               name: asset.name,
               type: asset.type,
               path: asset.path,
               filePath: asset.filePath,
               originalPath: asset.originalPath,
               size: asset.size,
               date: asset.date,
               addedAt: asset.addedAt,
             };
             
             // Include base64Data for small files (under 500KB to prevent quota issues)
             if (asset.size < 500 * 1024 && asset.base64Data) {
               persistedAsset.base64Data = asset.base64Data;
               // console.log('Including base64Data for asset:', asset.name);
             }
             
             // For video files, ensure we store the file path for persistence
             if (asset.type === 'video' && asset.filePath) {
               // console.log('Persisting video file path:', asset.filePath);
               persistedAsset.videoPath = asset.filePath;
             }
             
             return persistedAsset;
           }),
           // Persist all critical application state (sanitized)
           scenes: sanitizedScenes,
           currentSceneId: state.currentSceneId,
           playingColumnId: state.playingColumnId,
           bpm: state.bpm,
           sidebarVisible: state.sidebarVisible,
           // Force timeline off in persisted state
           showTimeline: false,
           midiMappings: state.midiMappings,
           midiForceChannel1: (state as any).midiForceChannel1,
           selectedLayerId: state.selectedLayerId,
           selectedTimelineClip: state.selectedTimelineClip,
           previewMode: state.previewMode,
           transitionType: state.transitionType,
           transitionDuration: state.transitionDuration,
           compositionSettings: state.compositionSettings,
           defaultVideoRenderScale: (state as any).defaultVideoRenderScale,
           defaultVideoFitMode: state.defaultVideoFitMode,
           timelineSnapEnabled: state.timelineSnapEnabled,
           timelineDuration: state.timelineDuration,
           timelineZoom: state.timelineZoom,
           recordSettings: state.recordSettings,
           mirrorQuality: (state as any).mirrorQuality,
           mirrorKeepPreview: (state as any).mirrorKeepPreview,
         };
       },
             onRehydrateStorage: () => (state) => {
         // Ensure timeline remains disabled after rehydrate
         try { (useStore as any)?.setState?.({ showTimeline: false }); } catch {}
         // console.log('🔄 Store rehydrated successfully!');
         // console.log('📊 Rehydrated data summary:');
         // console.log('  - Assets:', state?.assets?.length || 0, 'items');
         // console.log('  - Scenes:', state?.scenes?.length || 0, 'scenes');
         // console.log('  - Current Scene ID:', state?.currentSceneId || 'none');
         // console.log('  - Playing Column ID:', state?.playingColumnId || 'none');
         // console.log('  - BPM:', state?.bpm || 120);
         // console.log('  - Sidebar Visible:', state?.sidebarVisible);
         // console.log('  - Selected Layer ID:', state?.selectedLayerId || 'none');
         // console.log('  - Preview Mode:', state?.previewMode || 'composition');
         // console.log('  - MIDI Mappings:', state?.midiMappings?.length || 0, 'mappings');
         // console.log('  - Composition Settings:', state?.compositionSettings);
         
         // Debug: Check what's actually in localStorage
         try {
           const storageData = localStorage.getItem('vj-app-storage');
           // console.log('🔍 Raw localStorage data length:', storageData?.length || 0);
           if (storageData) {
             const parsed = JSON.parse(storageData);
             // console.log('🔍 Parsed storage keys:', Object.keys(parsed));
             // console.log('🔍 Storage state:', parsed);
           }
         } catch (error) {
           console.error('❌ Error reading localStorage:', error);
         }
         
                   // Check if storage is getting too full and clear if needed
          try {
            const storageSize = localStorage.getItem('vj-app-storage')?.length || 0;
            const maxSize = 4 * 1024 * 1024; // 4MB limit to be safe
            if (storageSize > maxSize) {
              console.warn('⚠️ Storage size exceeded limit, clearing...');
              localStorage.removeItem('vj-app-storage');
            } else {
              // console.log('💾 Storage size:', Math.round(storageSize / 1024), 'KB');
            }
          } catch (error) {
            console.warn('Failed to check storage size:', error);
            // If we can't check storage size, clear it to be safe
            try {
              localStorage.removeItem('vj-app-storage');
              // console.log('Cleared localStorage due to error checking size');
            } catch (clearError) {
              console.warn('Failed to clear localStorage:', clearError);
            }
          }
       },
    }
  ),
  Object.is
);