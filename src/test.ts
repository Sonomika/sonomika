import { useStore } from './store/store';
import { MIDIManager } from './midi/MIDIManager';
import { BPMManager } from './engine/BPMManager';
import { EffectLoader } from './utils/EffectLoader';
import { SceneTransition } from './utils/SceneTransition';
import { AppState, Layer, LayerType } from './store/types';

type StoreActions = {
  addScene: () => void;
  addColumn: (sceneId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
};

type Store = AppState & StoreActions;

export function runTests() {
  console.log('Running tests...');

  // Test store
  const store = useStore.getState() as Store;
  console.log('Initial store state:', store);

  // Test MIDI
  const midi = MIDIManager.getInstance();
  console.log('MIDI initialized:', midi.isInitialized());
  console.log('MIDI inputs:', midi.getInputs());

  // Test BPM
  const bpm = BPMManager.getInstance();
  console.log('Initial BPM:', bpm.getBPM());
  bpm.setBPM(140);
  console.log('Updated BPM:', bpm.getBPM());

  // Test effects
  const effectLoader = EffectLoader.getInstance();
  console.log('Available effects:', effectLoader.getAvailableEffects());

  // Create test effect
  const effect = effectLoader.createEffect('TestEffect', 400, 300);
  console.log('Test effect metadata:', effect.getMetadata());

  // Test scene transition
  const transition = SceneTransition.getInstance();
  console.log('Scene transition active:', transition.isActive());

  // Test store actions
  const { addScene, addColumn, updateLayer } = store;

  // Add a new scene
  addScene();
  console.log('Added new scene');

  // Add a column to the current scene
  const currentScene = store.scenes.find(s => s.id === store.currentSceneId);
  if (currentScene) {
    addColumn(currentScene.id);
    console.log('Added new column');

    // Update layer parameters
    const column = currentScene.columns[0];
    if (column && column.layers[0]) {
      updateLayer(column.layers[0].id, {
        name: 'Test Layer',
        type: 'p5' as LayerType,
        opacity: 0.8,
        blendMode: 'screen',
        params: {
          size: { value: 0.7 },
          speed: { value: 2 },
          colorSpeed: { value: 0.2 },
          autoColor: { value: true },
          shape: { value: 'triangle' },
        },
      });
      console.log('Updated layer parameters');
    }
  }

  console.log('Tests completed');
}

// Run tests when the window loads
window.addEventListener('load', runTests); 