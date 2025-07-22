import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { AppState, Scene, Column, Layer, MIDIMapping, Asset } from './types';

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
  bpm: 120,
  sidebarVisible: true,
  midiMappings: [],
  selectedLayerId: null,
  previewMode: 'composition',
  transitionType: 'fade',
  transitionDuration: 500,
  assets: [],
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

      addAsset: (asset: Asset) => set((state) => {
        console.log('Adding asset to store:', asset.name, asset.id);
        console.log('Current assets count:', state.assets.length);
        return {
          assets: [...state.assets, asset],
        };
      }),

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
          assets: state.assets.map(asset => ({
            ...asset,
            file: undefined, // Exclude File object from persistence
            // Keep base64 data for all files to ensure persistence
            base64Data: asset.base64Data || undefined
          })),
          scenes: state.scenes,
          currentSceneId: state.currentSceneId,
          bpm: state.bpm,
          midiMappings: state.midiMappings,
          transitionType: state.transitionType,
          transitionDuration: state.transitionDuration,
        };
      },
      onRehydrateStorage: () => (state) => {
        console.log('Store rehydrated with assets:', state?.assets?.length || 0);
        console.log('Rehydrated assets:', state?.assets);
      },
    }
  )
); 