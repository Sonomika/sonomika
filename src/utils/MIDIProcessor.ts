import { MIDIMapping, AppState } from '../store/types';
import { useStore } from '../store/store';
// EffectLoader import removed - using dynamic loading instead

type StoreActions = {
  setCurrentScene: (sceneId: string) => void;
  updateLayer: (layerId: string, updates: any) => void;
  setBpm: (bpm: number) => void;
  globalPlay: (opts?: { force?: boolean; source?: string }) => void;
  globalPause: (opts?: { force?: boolean; source?: string }) => void;
  globalStop: (opts?: { force?: boolean; source?: string }) => void;
};

type Store = AppState & StoreActions;

export class MIDIProcessor {
  private static instance: MIDIProcessor;
  private mappings: MIDIMapping[];
  private lastColumnTriggerAt: number = 0;
  private columnTriggerLock: boolean = false;

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

  private tryTriggerColumn(columnId: string | null | undefined) {
    if (!columnId) return;
    const now = Date.now();
    // Throttle rapid triggers within 150ms (debounce)
    if (now - this.lastColumnTriggerAt < 150) return;
    if (this.columnTriggerLock) return;
    this.columnTriggerLock = true;
    this.lastColumnTriggerAt = now;
    try {
      const state = useStore.getState() as any;
      if (typeof state.playColumn === 'function') state.playColumn(columnId);
    } finally {
      // Release lock after debounce window
      setTimeout(() => { this.columnTriggerLock = false; }, 120);
    }
  }

  handleNoteMessage(note: number, velocity: number, channel: number): void {
    const store = useStore.getState() as Store;
    const force = !!(store as any).midiForceChannel1;
    const effectiveChannel = force ? 1 : channel;

    this.mappings
      .filter(mapping => 
        mapping.type === 'note' &&
        mapping.number === note &&
        (
          force ? true : mapping.channel === effectiveChannel
        )
      )
      .forEach(mapping => {
        switch (mapping.target.type) {
          case 'cell': {
            if (velocity === 0) return; // trigger on note-on only
            const row = (mapping.target as any).row as number; // 1-based
            const colId = (mapping.target as any).columnId as string | undefined;
            const colIndex = (mapping.target as any).column as number | undefined; // 1-based
            const state = useStore.getState() as any;
            const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
            const col = colId
              ? scene?.columns?.find((c: any) => c.id === colId)
              : scene?.columns?.[Math.max(0, ((colIndex || 1) - 1))];
            if (col && typeof state.setActiveLayerOverride === 'function') {
              try { state.setActiveLayerOverride(Math.max(1, Number(row) || 1), col.id); } catch {}
              // Do not change the playing column; this is a per-row horizontal override
            }
            break;
          }
          case 'scene': {
            try {
              const st: any = useStore.getState();
              const id = (mapping.target as any).id;
              if (st?.showTimeline && typeof st.setCurrentTimelineScene === 'function') {
                st.setCurrentTimelineScene(id);
              } else if (typeof st.setCurrentScene === 'function') {
                st.setCurrentScene(id);
              } else {
                store.setCurrentScene(id);
              }
            } catch {
              try { store.setCurrentScene((mapping.target as any).id); } catch {}
            }
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
            if (col) this.tryTriggerColumn(col.id);
            break;
          }
        }
      });
  }

  handleCCMessage(cc: number, value: number, channel: number): void {
    const store = useStore.getState() as Store;
    const force = !!(store as any).midiForceChannel1;
    const effectiveChannel = force ? 1 : channel;

    this.mappings
      .filter(mapping => 
        mapping.type === 'cc' &&
        mapping.number === cc &&
        (
          force ? true : mapping.channel === effectiveChannel
        )
      )
      .forEach(mapping => {
        switch (mapping.target.type) {
          case 'cell': {
            const pressed = value > 63;
            if (!pressed) return;
            const row = (mapping.target as any).row as number; // 1-based
            const colId = (mapping.target as any).columnId as string | undefined;
            const colIndex = (mapping.target as any).column as number | undefined; // 1-based
            const state = useStore.getState() as any;
            const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
            const col = colId
              ? scene?.columns?.find((c: any) => c.id === colId)
              : scene?.columns?.[Math.max(0, ((colIndex || 1) - 1))];
            if (col && typeof state.setActiveLayerOverride === 'function') {
              try { state.setActiveLayerOverride(Math.max(1, Number(row) || 1), col.id); } catch {}
              // Do not change the playing column; this is a per-row horizontal override
            }
            break;
          }
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
            if (col) this.tryTriggerColumn(col.id);
            break;
          }
        }
      });
  }

  handleKeyMessage(key: string, modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }): void {
    const store = useStore.getState() as Store;
    const normalizedKey = String(key || '').toLowerCase();

    const matches = (m: MIDIMapping) => {
      if (m.type !== 'key') return false;
      const mk = String(m.key || '').toLowerCase();
      const mctrl = !!m.ctrl;
      const mshift = !!m.shift;
      const malt = !!m.alt;
      const mmeta = !!m.meta;
      return mk === normalizedKey && mctrl === !!modifiers.ctrl && mshift === !!modifiers.shift && malt === !!modifiers.alt && mmeta === !!modifiers.meta;
    };

    this.mappings
      .filter(matches)
      .forEach(mapping => {
        switch (mapping.target.type) {
          case 'cell': {
            const row = (mapping.target as any).row as number; // 1-based
            const colId = (mapping.target as any).columnId as string | undefined;
            const colIndex = (mapping.target as any).column as number | undefined; // 1-based
            const state = useStore.getState() as any;
            const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
            const col = colId
              ? scene?.columns?.find((c: any) => c.id === colId)
              : scene?.columns?.[Math.max(0, ((colIndex || 1) - 1))];
            if (col && typeof state.setActiveLayerOverride === 'function') {
              try { state.setActiveLayerOverride(Math.max(1, Number(row) || 1), col.id); } catch {}
              // Do not change the playing column; this is a per-row horizontal override
            }
            break;
          }
          case 'scene': {
            try {
              const st: any = useStore.getState();
              let id = (mapping.target as any).id as string;
              if (st?.showTimeline && typeof st.setCurrentTimelineScene === 'function') {
                // Prefer direct id match in timeline scenes; else map by index from column-mode scenes
                const tMatch = (st.timelineScenes || []).find((s: any) => s.id === id);
                if (tMatch) {
                  st.setCurrentTimelineScene(id);
                } else {
                  const idx = (st.scenes || []).findIndex((s: any) => s.id === id);
                  const fallback = idx >= 0 ? (st.timelineScenes || [])[idx] : null;
                  if (fallback) st.setCurrentTimelineScene(fallback.id);
                  else st.setCurrentScene(id);
                }
              } else if (typeof st.setCurrentScene === 'function') {
                st.setCurrentScene(id);
              } else {
                store.setCurrentScene(id);
              }
            } catch {
              try { store.setCurrentScene((mapping.target as any).id); } catch {}
            }
            break;
          }
          case 'layer': {
            const layerTarget = mapping.target as Extract<MIDIMapping['target'], { type: 'layer' }>;
            const layer = this.findLayer(layerTarget.id);
            if (layer) {
              if (layerTarget.param === 'opacity') {
                store.updateLayer(layerTarget.id, { opacity: 1 });
              } else if (layerTarget.param) {
                // For key presses, set to max (1). Advanced mapping could be added later
                store.updateLayer(layerTarget.id, {
                  params: { ...(layer as any).params, [layerTarget.param]: 1 }
                });
              }
            }
            break;
          }
          case 'global': {
            const globalTarget = mapping.target as Extract<MIDIMapping['target'], { type: 'global' }>;
            if (globalTarget.param === 'bpm') {
              // Set to a default tempo on keypress; could be enhanced with UI later
              store.setBpm(120);
            }
            break;
          }
          case 'transport': {
            const action = (mapping.target as any).action as 'play' | 'pause' | 'stop';
            if (action === 'play') store.globalPlay();
            else if (action === 'pause') store.globalPause();
            else if (action === 'stop') store.globalStop();
            break;
          }
          case 'column': {
            const idx = (mapping.target as any).index as number; // 1-based
            const state = useStore.getState() as any;
            const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
            const col = scene?.columns?.[Math.max(0, (idx || 1) - 1)];
            if (col) this.tryTriggerColumn(col.id);
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