import { MIDIMapping, AppState } from '../store/types';
import { useStore } from '../store/store';
import { getEffect } from '../utils/effectRegistry';
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
  // Coalesce rapid MIDI updates into per-frame batched store updates
  private pendingParamUpdates: Map<string, Record<string, number>> = new Map();
  private lastAppliedParamValues: Map<string, number> = new Map();
  private applyScheduled: boolean = false;

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

  private queueLayerParamUpdate(layerId: string, paramName: string, value: number) {
    const key = `${layerId}:${paramName}`;
    const prev = this.lastAppliedParamValues.get(key);
    // Skip tiny changes to avoid excessive renders (epsilon ~ 0.002 of range)
    if (prev !== undefined && Math.abs(prev - value) < 0.002) return;
    this.lastAppliedParamValues.set(key, value);

    const existing = this.pendingParamUpdates.get(layerId) || {};
    existing[paramName] = value;
    this.pendingParamUpdates.set(layerId, existing);

    if (!this.applyScheduled) {
      this.applyScheduled = true;
      const flush = () => this.flushParamUpdates();
      try {
        if (typeof window !== 'undefined' && typeof (window as any).requestAnimationFrame === 'function') {
          requestAnimationFrame(flush);
        } else {
          setTimeout(flush, 0);
        }
      } catch {
        setTimeout(flush, 0);
      }
    }
  }

  private flushParamUpdates() {
    try {
      const state: any = useStore.getState();
      const updateLayer = state.updateLayer as (layerId: string, updates: any) => void;
      for (const [layerId, changes] of this.pendingParamUpdates.entries()) {
        const layer = this.findLayer(layerId) as any;
        if (!layer) continue;
        const currentParams = { ...(layer.params || {}) } as Record<string, any>;
        Object.entries(changes).forEach(([name, v]) => {
          const prevObj = currentParams[name] || {};
          currentParams[name] = { ...prevObj, value: v as number };
        });
        updateLayer(layerId, { params: currentParams });

        // When editing in timeline mode, mirror changes into the selectedTimelineClip so UI sliders update
        try {
          const st: any = useStore.getState();
          const clip = st.selectedTimelineClip;
          if (st.showTimeline && clip) {
            let matches = false;
            if (clip.layerId && clip.layerId === layerId) matches = true;
            if (!matches) {
              const clipAsset = clip?.data?.asset || {};
              const assetId = clipAsset.id || clipAsset.name;
              const layerAsset = (layer && (layer.asset || {})) || {};
              const layerAssetId = layerAsset.id || layerAsset.name;
              if (assetId && layerAssetId && assetId === layerAssetId) matches = true;
            }
            if (matches && typeof st.setSelectedTimelineClip === 'function') {
              const clipData = { ...(clip.data || {}) } as any;
              const clipParams = { ...(clipData.params || {}) } as Record<string, any>;
              Object.entries(changes).forEach(([name, v]) => {
                const prev = clipParams[name] || {};
                clipParams[name] = { ...prev, value: v as number };
              });
              clipData.params = clipParams;
              st.setSelectedTimelineClip({ ...clip, data: clipData });
            }
          }
        } catch {}
      }
    } finally {
      this.pendingParamUpdates.clear();
      this.applyScheduled = false;
    }
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
        (mapping.enabled !== false) &&
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
                // Derive min/max more robustly: prefer effect metadata, else infer from existing value object
                const metadata = this.getEffectMetadataForLayer(layer) as any;
                const paramConfig = metadata?.parameters?.find((p: any) => p.name === layerTarget.param);
                let min = 0; let max = 1;
                if (paramConfig) {
                  if (typeof paramConfig.min === 'number') min = paramConfig.min;
                  if (typeof paramConfig.max === 'number') max = paramConfig.max;
                } else {
                  try {
                    const existing = ((layer as any).params || {})[layerTarget.param];
                    if (existing && typeof existing === 'object') {
                      if (typeof existing.min === 'number') min = existing.min;
                      if (typeof existing.max === 'number') max = existing.max;
                    }
                  } catch {}
                }
                const range = max - min;
                const normalizedValue = velocity / 127;
                const mappedValue = min + (range * normalizedValue);
                this.queueLayerParamUpdate(layerTarget.id, layerTarget.param, mappedValue);
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
    const ccOffset = Math.max(0, Math.min(127, Number((store as any).midiCCOffset) || 0));
    const normalizedCC = Math.max(0, Math.min(127, cc - ccOffset));

    this.mappings
      .filter(mapping => 
        mapping.type === 'cc' &&
        mapping.number === normalizedCC &&
        (mapping.enabled !== false) &&
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
                const metadata = this.getEffectMetadataForLayer(layer) as any;
                const paramConfig = metadata?.parameters?.find((p: any) => p.name === layerTarget.param);
                let min = 0; let max = 1;
                if (paramConfig) {
                  if (typeof paramConfig.min === 'number') min = paramConfig.min;
                  if (typeof paramConfig.max === 'number') max = paramConfig.max;
                } else {
                  try {
                    const existing = ((layer as any).params || {})[layerTarget.param];
                    if (existing && typeof existing === 'object') {
                      if (typeof existing.min === 'number') min = existing.min;
                      if (typeof existing.max === 'number') max = existing.max;
                    }
                  } catch {}
                }
                const range = max - min;
                const normalizedValue = value / 127;
                const mappedValue = min + (range * normalizedValue);
                this.queueLayerParamUpdate(layerTarget.id, layerTarget.param, mappedValue);
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
    // Deprecated: we now resolve metadata by layer
    return null;
  }

  private getEffectMetadataForLayer(layer: any) {
    try {
      const isEffect = layer?.type === 'effect' || layer?.asset?.isEffect || layer?.asset?.type === 'effect';
      const effectId: string | undefined = layer?.asset?.id || layer?.asset?.name || layer?.asset?.effectId;
      if (!isEffect || !effectId) return null;
      const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
      const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
      return metadata || null;
    } catch {
      return null;
    }
  }
} 