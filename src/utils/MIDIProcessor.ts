import { MIDIMapping, AppState } from '../store/types';
import { useStore } from '../store/store';
// EffectLoader import removed - using dynamic loading instead

type StoreActions = {
  setCurrentScene: (sceneId: string) => void;
  updateLayer: (layerId: string, updates: any) => void;
  setBpm: (bpm: number) => void;
};

type Store = AppState & StoreActions;

export class MIDIProcessor {
  private static instance: MIDIProcessor;
  private mappings: MIDIMapping[];

  private constructor() {
    this.mappings = [];
  }

  static getInstance(): MIDIProcessor {
    if (!MIDIProcessor.instance) {
      MIDIProcessor.instance = new MIDIProcessor();
    }
    return MIDIProcessor.instance;
  }

  setMappings(mappings: MIDIMapping[]): void {
    this.mappings = mappings;
  }

  handleNoteMessage(note: number, velocity: number, channel: number): void {
    const store = useStore.getState() as Store;

    this.mappings
      .filter(mapping => 
        mapping.type === 'note' &&
        mapping.number === note &&
        mapping.channel === channel
      )
      .forEach(mapping => {
        switch (mapping.target.type) {
          case 'scene':
            store.setCurrentScene(mapping.target.id);
            break;

          case 'layer':
            const layer = this.findLayer(mapping.target.id);
            if (layer) {
              if (mapping.target.param === 'opacity') {
                store.updateLayer(mapping.target.id, { opacity: velocity / 127 });
              } else if (mapping.target.param) {
                const metadata = this.getEffectMetadata(layer.type);
                const paramConfig = metadata?.parameters.find(p => p.name === mapping.target.param);
                if (paramConfig && paramConfig.type === 'number') {
                  const range = (paramConfig.max || 1) - (paramConfig.min || 0);
                  const normalizedValue = velocity / 127;
                  const mappedValue = (paramConfig.min || 0) + (range * normalizedValue);
                  store.updateLayer(mapping.target.id, {
                    params: { ...layer.params, [mapping.target.param]: mappedValue }
                  });
                }
              }
            }
            break;

          case 'global':
            if (mapping.target.param === 'bpm') {
              const bpm = Math.round(velocity / 127 * 200 + 60); // Map to 60-260 BPM
              store.setBpm(bpm);
            }
            break;
        }
      });
  }

  handleCCMessage(cc: number, value: number, channel: number): void {
    const store = useStore.getState() as Store;

    this.mappings
      .filter(mapping => 
        mapping.type === 'cc' &&
        mapping.number === cc &&
        mapping.channel === channel
      )
      .forEach(mapping => {
        switch (mapping.target.type) {
          case 'layer':
            const layer = this.findLayer(mapping.target.id);
            if (layer) {
              if (mapping.target.param === 'opacity') {
                store.updateLayer(mapping.target.id, { opacity: value / 127 });
              } else if (mapping.target.param) {
                const metadata = this.getEffectMetadata(layer.type);
                const paramConfig = metadata?.parameters.find(p => p.name === mapping.target.param);
                if (paramConfig && paramConfig.type === 'number') {
                  const range = (paramConfig.max || 1) - (paramConfig.min || 0);
                  const normalizedValue = value / 127;
                  const mappedValue = (paramConfig.min || 0) + (range * normalizedValue);
                  store.updateLayer(mapping.target.id, {
                    params: { ...layer.params, [mapping.target.param]: mappedValue }
                  });
                }
              }
            }
            break;

          case 'global':
            if (mapping.target.param === 'bpm') {
              const bpm = Math.round(value / 127 * 200 + 60); // Map to 60-260 BPM
              store.setBpm(bpm);
            }
            break;
        }
      });
  }

  private findLayer(layerId: string) {
    const store = useStore.getState();
    const currentScene = store.scenes.find(s => s.id === store.currentSceneId);
    if (!currentScene) return null;

    for (const column of currentScene.columns) {
      const layer = column.layers.find(l => l.id === layerId);
      if (layer) return layer;
    }
    return null;
  }

  private getEffectMetadata(effectType: string) {
    // Using dynamic discovery instead of EffectLoader
    console.log('Getting metadata for effect type:', effectType);
    return null; // TODO: Implement dynamic metadata loading
  }
} 