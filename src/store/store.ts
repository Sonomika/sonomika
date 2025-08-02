import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { AppState, Scene, Column, Layer, MIDIMapping, Asset, CompositionSettings } from './types';

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
  console.log('🔧 Creating default scenes');
  const templateNames = ['Intro', 'Build Up', 'Drop', 'Breakdown', 'Outro'];
  const scenes = templateNames.map(name => ({
    id: uuidv4(),
    name,
    columns: Array.from({ length: 10 }, () => createEmptyColumn()),
    globalEffects: [],
  }));
  return scenes;
};

const initialState: AppState = {
  scenes: createDefaultScenes(),
  currentSceneId: '',
  playingColumnId: null, // No column playing initially
  bpm: 120,
  sidebarVisible: true,
  midiMappings: [],
  selectedLayerId: null,
  previewMode: 'composition',
  transitionType: 'fade',
  transitionDuration: 500,
  assets: [
    // Sample assets for testing
    {
      id: 'sample-image-1',
      name: 'Sample Image 1',
      type: 'image',
      path: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmY2YjZiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlNhbXBsZTwvdGV4dD48L3N2Zz4=',
      size: 1024,
      date: new Date().toLocaleDateString()
    },
    {
      id: 'sample-image-2',
      name: 'Sample Image 2',
      type: 'image',
      path: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzQ5OGRiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlNhbXBsZSAyPC90ZXh0Pjwvc3ZnPg==',
      size: 1024,
      date: new Date().toLocaleDateString()
    }
  ],
  compositionSettings: {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    frameRate: 30,
  },
};

initialState.currentSceneId = initialState.scenes[0].id;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addScene: () => set((state) => {
        const newScene = createEmptyScene();
        return { scenes: [...state.scenes, newScene] };
      }),

      setCurrentScene: (sceneId: string) => set({ currentSceneId: sceneId }),

      updateScene: (sceneId: string, updates: Partial<Scene>) => set((state) => ({
        scenes: state.scenes.map(scene => 
          scene.id === sceneId ? { ...scene, ...updates } : scene
        ),
      })),

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

      addAsset: (asset: Asset) => set((state) => {
        console.log('Adding asset to store:', asset.name, asset.id);
        console.log('Current assets count:', state.assets.length);
        return {
          assets: [...state.assets, asset],
        };
      }),

      updateCompositionSettings: (settings: Partial<CompositionSettings>) => set((state) => ({
        compositionSettings: { ...state.compositionSettings, ...settings },
      })),

      removeAsset: (assetId: string) => set((state) => ({
        assets: state.assets.filter(asset => asset.id !== assetId),
      })),

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
    }),
    {
      name: 'vj-app-storage',
             partialize: (state) => {
         console.log('Persisting state with assets:', state.assets.length);
         return {
           // Only persist essential data, exclude large base64 assets
           assets: state.assets.map(asset => ({
             id: asset.id,
             name: asset.name,
             type: asset.type,
             path: asset.path,
             filePath: asset.filePath,
             size: asset.size,
             date: asset.date,
             // Exclude base64Data to prevent storage quota issues
             // base64Data: asset.base64Data || undefined
           })),
           scenes: state.scenes,
           currentSceneId: state.currentSceneId,
           playingColumnId: state.playingColumnId,
           bpm: state.bpm,
           midiMappings: state.midiMappings,
           transitionType: state.transitionType,
           transitionDuration: state.transitionDuration,
         };
       },
             onRehydrateStorage: () => (state) => {
         console.log('Store rehydrated with assets:', state?.assets?.length || 0);
         console.log('Rehydrated assets:', state?.assets);
         
         // Check if storage is getting too full and clear if needed
         try {
           const storageSize = localStorage.getItem('vj-app-storage')?.length || 0;
           const maxSize = 5 * 1024 * 1024; // 5MB limit
           if (storageSize > maxSize) {
             console.warn('Storage size exceeded limit, clearing...');
             localStorage.removeItem('vj-app-storage');
           }
         } catch (error) {
           console.warn('Failed to check storage size:', error);
         }
       },
    }
  )
); 