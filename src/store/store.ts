import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { AppState, Scene, Column, Layer, MIDIMapping, Asset, CompositionSettings, TransitionType } from './types';

const createEmptyLayer = (type: Layer['type'] = 'p5'): Layer => ({
  id: uuidv4(),
  type,
  name: 'New Layer',
  opacity: 1,
  blendMode: 'normal',
  solo: false,
  mute: false,
  locked: false,
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
  columns: Array.from({ length: 10 }, () => createEmptyColumn()),
  globalEffects: [],
});

const createDefaultScenes = (): Scene[] => {
  console.log('🔧 Creating default scene');
  return [{
    id: uuidv4(),
    name: '1',
    columns: Array.from({ length: 10 }, () => createEmptyColumn()),
    globalEffects: [],
  }];
};

const initialState: AppState = {
  scenes: createDefaultScenes(),
  currentSceneId: '',
  playingColumnId: null, // No column playing initially
  bpm: 120,
  sidebarVisible: true,
  midiMappings: [],
  selectedLayerId: null,
  selectedTimelineClip: null,
  previewMode: 'composition',
  transitionType: 'fade',
  transitionDuration: 500,
  assets: [],
  compositionSettings: {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    frameRate: 30,
    backgroundColor: '#000000',
  },
  timelineSnapEnabled: true,
  timelineDuration: 60, // 1 minute default
  timelineZoom: 2, // Default zoom level
};

initialState.currentSceneId = initialState.scenes[0].id;

export const useStore = create<AppState & {
  addScene: () => void;
  setCurrentScene: (sceneId: string) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  removeScene: (sceneId: string) => void;
  addColumn: (sceneId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  toggleSidebar: () => void;
  setBpm: (bpm: number) => void;
  setSelectedLayer: (layerId: string | null) => void;
  setSelectedTimelineClip: (clip: any | null) => void;
  setPreviewMode: (mode: AppState['previewMode']) => void;
  addMIDIMapping: (mapping: MIDIMapping) => void;
  removeMIDIMapping: (index: number) => void;
  setMIDIMappings: (mappings: MIDIMapping[]) => void;
  setTransitionType: (type: TransitionType) => void;
  setTransitionDuration: (duration: number) => void;
  setPlayingColumn: (columnId: string | null) => void;
  playColumn: (columnId: string) => void;
  stopColumn: () => void;
  clearStorage: () => void;
  resetToDefault: () => void;
      addAsset: (asset: Asset) => void;
    updateAsset: (assetId: string, updates: Partial<Asset>) => void;
    removeAsset: (assetId: string) => void;
    ensureVideoPersistence: (assetId: string) => void;
    debugStorage: () => void;
  updateCompositionSettings: (settings: Partial<CompositionSettings>) => void;
  reorderLayers: (columnId: string, startIndex: number, endIndex: number) => void;
  moveBetweenColumns: (sourceColumnId: string, destinationColumnId: string, sourceIndex: number, destinationIndex: number) => void;
  savePreset: (presetName?: string) => string | null;
  loadPreset: (file: File) => Promise<boolean>;
  setTimelineSnapEnabled: (enabled: boolean) => void;
  setTimelineDuration: (duration: number) => void;
  setTimelineZoom: (zoom: number) => void;
}>()(
  persist(
    (set, get) => ({
      ...initialState,

      addScene: () => set((state) => {
        const newScene = createEmptyScene();
        return { scenes: [...state.scenes, newScene] };
      }),

      setCurrentScene: (sceneId: string) => set({ currentSceneId: sceneId }),

      updateScene: (sceneId: string, updates: Partial<Scene>) => {
        console.log('updateScene called with sceneId:', sceneId, 'updates:', updates);
        return set((state) => {
          const newScenes = state.scenes.map(scene => 
            scene.id === sceneId ? { ...scene, ...updates } : scene
          );
          console.log('Updated scenes:', newScenes);
          return { scenes: newScenes };
        });
      },

      removeScene: (sceneId: string) => set((state) => ({
        scenes: state.scenes.filter(scene => scene.id !== sceneId),
        currentSceneId: state.currentSceneId === sceneId 
          ? state.scenes[0].id 
          : state.currentSceneId,
      })),

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

      addMIDIMapping: (mapping: MIDIMapping) => set((state) => ({
        midiMappings: [...state.midiMappings, mapping],
      })),

      removeMIDIMapping: (index: number) => set((state) => ({
        midiMappings: state.midiMappings.filter((_, i) => i !== index),
      })),

      setMIDIMappings: (mappings: MIDIMapping[]) => set({ midiMappings: mappings }),

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
            // Immediate state update
            set({ playingColumnId: columnId });
          } catch (error) {
            console.warn('Failed to play column:', error);
          }
        },
       
       stopColumn: () => {
         try {
           set({ playingColumnId: null });
         } catch (error) {
           console.warn('Failed to stop column:', error);
         }
       },

       // Clear storage when quota is exceeded
             clearStorage: () => {
        try {
          localStorage.removeItem('vj-app-storage');
          console.log('Storage cleared due to quota issues');
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
          
          console.log('✅ Reset to default state completed');
        } catch (error) {
          console.warn('Failed to reset to default:', error);
        }
      },

      addAsset: (asset: Asset) => set((state) => {
        console.log('Adding asset to store:', asset.name, asset.id);
        console.log('Current assets count:', state.assets.length);
        
        // Ensure the asset has a persistent identifier
        const persistentAsset = {
          ...asset,
          // Store the original file path if available
          originalPath: asset.filePath || asset.path || asset.name,
          // Add timestamp for better tracking
          addedAt: Date.now(),
        };
        
        console.log('Persistent asset data:', persistentAsset);
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
        console.log('🔍 Current Storage State:');
        console.log('  - Total Assets:', state.assets.length);
        console.log('  - Video Assets:', state.assets.filter(a => a.type === 'video').length);
        console.log('  - Assets with paths:', state.assets.filter(a => a.filePath || a.originalPath).length);
        console.log('  - Video assets with paths:', state.assets.filter(a => a.type === 'video' && (a.filePath || a.originalPath)).length);
        
        // Check localStorage
        try {
          const storageData = localStorage.getItem('vj-app-storage');
          console.log('  - localStorage size:', storageData?.length || 0, 'bytes');
          if (storageData) {
            const parsed = JSON.parse(storageData);
            console.log('  - Stored assets count:', parsed.assets?.length || 0);
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
          
          const preset = {
            name: defaultName,
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
          
          // Create a blob and download the preset file
          const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${defaultName}.vjpreset`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          console.log('Preset saved to file:', defaultName);
          return defaultName;
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
                console.log('Loading preset:', presetName);
                
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
                         console.log('Removing large asset from preset:', asset.name, 'size:', Math.round(asset.size / 1024), 'KB');
                         return false;
                       }
                       return true;
                     }) || []
                  };
                  
                  // Clear localStorage first to make space
                  try {
                    localStorage.removeItem('vj-app-storage');
                    console.log('Cleared localStorage to make space for preset');
                  } catch (clearError) {
                    console.warn('Failed to clear localStorage:', clearError);
                  }
                  
                  // Apply the cleaned preset data
                  set(cleanedData);
                  resolve(true);
                } else {
                  // Apply the preset data to the store
                  set(preset.data);
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
      setTimelineSnapEnabled: (enabled: boolean) => set({ timelineSnapEnabled: enabled }),
      setTimelineDuration: (duration: number) => set({ timelineDuration: duration }),
      setTimelineZoom: (zoom: number) => set({ timelineZoom: zoom }),
    }),
    {
      name: 'vj-app-storage',
             partialize: (state) => {
         console.log('Persisting state with assets:', state.assets.length);
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
               console.log('Including base64Data for asset:', asset.name);
             }
             
             // For video files, ensure we store the file path for persistence
             if (asset.type === 'video' && asset.filePath) {
               console.log('Persisting video file path:', asset.filePath);
               persistedAsset.videoPath = asset.filePath;
             }
             
             return persistedAsset;
           }),
           // Persist all critical application state
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
           timelineSnapEnabled: state.timelineSnapEnabled,
           timelineDuration: state.timelineDuration,
           timelineZoom: state.timelineZoom,
         };
       },
             onRehydrateStorage: () => (state) => {
         console.log('🔄 Store rehydrated successfully!');
         console.log('📊 Rehydrated data summary:');
         console.log('  - Assets:', state?.assets?.length || 0, 'items');
         console.log('  - Scenes:', state?.scenes?.length || 0, 'scenes');
         console.log('  - Current Scene ID:', state?.currentSceneId || 'none');
         console.log('  - Playing Column ID:', state?.playingColumnId || 'none');
         console.log('  - BPM:', state?.bpm || 120);
         console.log('  - Sidebar Visible:', state?.sidebarVisible);
         console.log('  - Selected Layer ID:', state?.selectedLayerId || 'none');
         console.log('  - Preview Mode:', state?.previewMode || 'composition');
         console.log('  - MIDI Mappings:', state?.midiMappings?.length || 0, 'mappings');
         console.log('  - Composition Settings:', state?.compositionSettings);
         
         // Debug: Check what's actually in localStorage
         try {
           const storageData = localStorage.getItem('vj-app-storage');
           console.log('🔍 Raw localStorage data length:', storageData?.length || 0);
           if (storageData) {
             const parsed = JSON.parse(storageData);
             console.log('🔍 Parsed storage keys:', Object.keys(parsed));
             console.log('🔍 Storage state:', parsed);
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
              console.log('💾 Storage size:', Math.round(storageSize / 1024), 'KB');
            }
          } catch (error) {
            console.warn('Failed to check storage size:', error);
            // If we can't check storage size, clear it to be safe
            try {
              localStorage.removeItem('vj-app-storage');
              console.log('Cleared localStorage due to error checking size');
            } catch (clearError) {
              console.warn('Failed to clear localStorage:', clearError);
            }
          }
       },
    }
  )
); 