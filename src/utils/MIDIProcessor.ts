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
          case 'scene': {
            store.setCurrentScene((mapping.target as any).id);
            break;
          }
          case 'layer': {
            const layerTarget = mapping.target as Extract<MIDIMapping['target'], { type: 'layer' }>;
            const layer = this.findLayer(layerTarget.id);
            if (layer) {
              if (layerTarget.param === 'opacity') {
                store.updateLayer(layerTarget.id, { opacity: velocity / 127 });
              } else if (layerTarget.param) {
                const metadata = this.getEffectMetadata((layer as any).type) as any;
                const paramConfig = metadata?.parameters?.find((p: any) => p.name === layerTarget.param);
                if (paramConfig && paramConfig.type === 'number') {
                  const range = (paramConfig.max || 1) - (paramConfig.min || 0);
                  const normalizedValue = velocity / 127;
                  const mappedValue = (paramConfig.min || 0) + (range * normalizedValue);
                  store.updateLayer(layerTarget.id, {
                    params: { ...(layer as any).params, [layerTarget.param]: mappedValue }
                  });
                }
              }
            }
            break;
          }
          case 'global': {
            const globalTarget = mapping.target as Extract<MIDIMapping['target'], { type: 'global' }>;
            if (globalTarget.param === 'bpm') {
              const bpm = Math.round((velocity / 127) * 200 + 60);
              store.setBpm(bpm);
            }
            break;
          }
          case 'transport': {
            const action = (mapping.target as any).action as 'play' | 'pause' | 'stop';
            if (velocity === 0) return; // trigger on note-on
            if (action === 'play') store.globalPlay();
            else if (action === 'pause') store.globalPause();
            else if (action === 'stop') store.globalStop();
            break;
          }
          case 'column': {
            if (velocity === 0) return; // trigger on note-on only
            const idx = (mapping.target as any).index as number; // 1-based
            const state = useStore.getState() as any;
            const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
            const col = scene?.columns?.[Math.max(0, idx - 1)];
            if (col && typeof state.playColumn === 'function') state.playColumn(col.id);
            break;
          }
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
          case 'layer': {
            const layerTarget = mapping.target as Extract<MIDIMapping['target'], { type: 'layer' }>;
            const layer = this.findLayer(layerTarget.id);
            if (layer) {
              if (layerTarget.param === 'opacity') {
                store.updateLayer(layerTarget.id, { opacity: value / 127 });
              } else if (layerTarget.param) {
                const metadata = this.getEffectMetadata((layer as any).type) as any;
                const paramConfig = metadata?.parameters?.find((p: any) => p.name === layerTarget.param);
                if (paramConfig && paramConfig.type === 'number') {
                  const range = (paramConfig.max || 1) - (paramConfig.min || 0);
                  const normalizedValue = value / 127;
                  const mappedValue = (paramConfig.min || 0) + (range * normalizedValue);
                  store.updateLayer(layerTarget.id, {
                    params: { ...(layer as any).params, [layerTarget.param]: mappedValue }
                  });
                }
              }
            }
            break;
          }
          case 'global': {
            const globalTarget = mapping.target as Extract<MIDIMapping['target'], { type: 'global' }>;
            if (globalTarget.param === 'bpm') {
              const bpm = Math.round((value / 127) * 200 + 60);
              store.setBpm(bpm);
            }
            break;
          }
          case 'transport': {
            // CC can be used as momentary toggle; threshold at mid point
            const action = (mapping.target as any).action as 'play' | 'pause' | 'stop';
            const pressed = value > 63;
            if (!pressed) return;
            if (action === 'play') store.globalPlay();
            else if (action === 'pause') store.globalPause();
            else if (action === 'stop') store.globalStop();
            break;
          }
          case 'column': {
            const idx = (mapping.target as any).index as number; // 1-based
            const state = useStore.getState() as any;
            const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
            const col = scene?.columns?.[Math.max(0, idx - 1)];
            if (col && typeof state.playColumn === 'function') state.playColumn(col.id);
            break;
          }
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