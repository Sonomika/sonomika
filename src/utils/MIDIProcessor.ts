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
  setMidiCCOffset: (offset: number) => void;
  setMidiAutoDetectOffsetPrimed: (primed: boolean) => void;
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
  // Global-effects batching (slotId -> { paramName -> value })
  private pendingGlobalUpdates: Map<string, Record<string, number>> = new Map();
  private lastAppliedGlobalValues: Map<string, number> = new Map();
  // Timeline clip updates batching (clipId -> { paramName -> value }) for same sensitivity as column mode
  private pendingTimelineUpdates: Map<string, Record<string, number>> = new Map();
  private pendingTimelineOpacityUpdates: Map<string, number> = new Map();
  private timelineApplyScheduled: boolean = false;

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

  private queueTimelineUpdate(clipId: string, paramName: string, value: number) {
    // Timeline updates trigger expensive re-renders (syncs to tracks via useEffect)
    // Use slightly higher epsilon to reduce update frequency and match column mode sensitivity
    const key = `timeline:${clipId}:${paramName}`;
    const prev = this.lastAppliedParamValues.get(key);
    // Skip tiny changes - use same epsilon as column mode (0.002 of range)
    // This prevents excessive updates that slow down sliders
    if (prev !== undefined && Math.abs(prev - value) < 0.002) return;
    this.lastAppliedParamValues.set(key, value);

    if (paramName === 'opacity') {
      this.pendingTimelineOpacityUpdates.set(clipId, value);
    } else {
      if (!this.pendingTimelineUpdates.has(clipId)) {
        this.pendingTimelineUpdates.set(clipId, {});
      }
      const existing = this.pendingTimelineUpdates.get(clipId)!;
      existing[paramName] = value;
    }

    // Use same requestAnimationFrame batching as column mode
    if (!this.timelineApplyScheduled) {
      this.timelineApplyScheduled = true;
      const flush = () => {
        try {
          this.flushTimelineUpdates();
        } finally {
          // Always reset scheduled flag, matching column mode's pattern
          this.timelineApplyScheduled = false;
        }
      };
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

  private flushTimelineUpdates() {
    try {
      const state: any = useStore.getState();
      if (!state.showTimeline || !state.selectedTimelineClip) {
        this.pendingTimelineUpdates.clear();
        this.pendingTimelineOpacityUpdates.clear();
        return;
      }

      const selectedClip = state.selectedTimelineClip;
      const clipId = selectedClip.id;
      
      // Capture pending updates at the start to avoid processing new updates that come in during processing
      // This ensures we only process what was queued at this moment, matching column mode behavior
      const pendingOpacityValue = this.pendingTimelineOpacityUpdates.get(clipId);
      const pendingParamUpdates = this.pendingTimelineUpdates.get(clipId);
      
      // Clear pending updates immediately (like column mode does) to prevent accumulation
      // This ensures updates stop immediately when knob stops turning
      this.pendingTimelineOpacityUpdates.delete(clipId);
      this.pendingTimelineUpdates.delete(clipId);

      // If no pending updates, nothing to do
      if (pendingOpacityValue === undefined && (!pendingParamUpdates || Object.keys(pendingParamUpdates).length === 0)) {
        return;
      }

      let hasUpdates = false;
      const clipData = { ...(selectedClip.data || {}) } as any;
      const currentParams = { ...(clipData.params || {}) } as Record<string, any>;
      const currentOpacity = clipData.opacity;

      // Apply opacity updates only if changed significantly
      if (pendingOpacityValue !== undefined) {
        // Only update if change is significant (same epsilon check)
        if (currentOpacity === undefined || Math.abs(currentOpacity - pendingOpacityValue) >= 0.002) {
          clipData.opacity = pendingOpacityValue;
          hasUpdates = true;
        }
      }

      // Apply param updates only if changed significantly
      if (pendingParamUpdates && Object.keys(pendingParamUpdates).length > 0) {
        let paramsChanged = false;
        Object.entries(pendingParamUpdates).forEach(([name, v]) => {
          const prevValue = currentParams[name]?.value;
          // Only update if change is significant (same epsilon check)
          if (prevValue === undefined || Math.abs(prevValue - v) >= 0.002) {
            const prev = currentParams[name] || {};
            currentParams[name] = { ...prev, value: v as number };
            paramsChanged = true;
          }
        });
        if (paramsChanged) {
          clipData.params = currentParams;
          hasUpdates = true;
        }
      }

      // Only call setSelectedTimelineClip if we have real changes
      if (hasUpdates && typeof state.setSelectedTimelineClip === 'function') {
        state.setSelectedTimelineClip({ ...selectedClip, data: clipData });
      }
    } catch {}
  }

  private flushParamUpdates() {
    try {
      const state: any = useStore.getState();
      const isTimeline = !!state.showTimeline;
      
      // In timeline mode, don't update column mode layers - they're completely separate
      if (isTimeline) {
        // Timeline mode updates are handled by flushTimelineUpdates
        this.pendingParamUpdates.clear();
        return;
      }
      
      // Column mode: update layers normally
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
      }
      // Flush global-effect updates in a single scene update per frame
      if (this.pendingGlobalUpdates.size > 0) {
        const st: any = useStore.getState();
        const isTimeline = !!st.showTimeline;
        const scene = isTimeline
          ? (st.timelineScenes || []).find((s: any) => s.id === st.currentTimelineSceneId)
          : (st.scenes || []).find((s: any) => s.id === st.currentSceneId);
        if (scene) {
          const nextSlots = (scene.globalEffects || []).map((slot: any) => {
            if (!slot) return slot;
            const changes = this.pendingGlobalUpdates.get(slot.id);
            if (!changes) return slot;
            const nextParams = { ...(slot.params || {}) } as Record<string, any>;
            Object.entries(changes).forEach(([name, v]) => {
              const prev = nextParams[name] || {};
              nextParams[name] = { ...prev, value: v as number };
            });
            return { ...slot, params: nextParams };
          });
          const updateScene = isTimeline
            ? ((st as any).updateTimelineScene as (sceneId: string, updates: any) => void)
            : ((st as any).updateScene as (sceneId: string, updates: any) => void);
          updateScene(isTimeline ? st.currentTimelineSceneId : st.currentSceneId, { globalEffects: nextSlots });
        }
      }
    } finally {
      this.pendingParamUpdates.clear();
      this.pendingGlobalUpdates.clear();
      this.applyScheduled = false;
    }
  }

  private queueGlobalParamUpdate(slotId: string, paramName: string, value: number) {
    const key = `${slotId}:${paramName}`;
    const prev = this.lastAppliedGlobalValues.get(key);
    if (prev !== undefined && Math.abs(prev - value) < 0.002) return;
    this.lastAppliedGlobalValues.set(key, value);

    const existing = this.pendingGlobalUpdates.get(slotId) || {};
    existing[paramName] = value;
    this.pendingGlobalUpdates.set(slotId, existing);

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
      // If the user previously clicked a specific cell, we may have per-row overrides active.
      // Column-level triggers should behave like the column header Play button: play the full column.
      if (typeof state.clearActiveLayerOverrides === 'function') {
        try { state.clearActiveLayerOverrides(); } catch {}
      }
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
          case 'global-effect': {
            const geTarget = mapping.target as any;
            const st: any = useStore.getState();
            const isTimeline = !!st.showTimeline;
            const scene = isTimeline
              ? (st.timelineScenes || []).find((s: any) => s.id === st.currentTimelineSceneId)
              : (st.scenes || []).find((s: any) => s.id === st.currentSceneId);
            if (!scene) break;
            const slot = (scene.globalEffects || []).find((g: any) => g && g.id === geTarget.id);
            if (!slot) break;
            const metadata = this.getEffectMetadataForLayer({ type: 'effect', asset: { id: slot.effectId }, params: slot.params } as any) as any;
            const paramName = geTarget.param;
            if (!paramName) break;
            const paramConfig = metadata?.parameters?.find((p: any) => p.name === paramName);
            let min = 0; let max = 1;
            if (paramConfig) { if (typeof paramConfig.min === 'number') min = paramConfig.min; if (typeof paramConfig.max === 'number') max = paramConfig.max; }
            const mapped = min + ((max - min) * (velocity / 127));
            this.queueGlobalParamUpdate(slot.id, paramName, mapped);
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
            const st: any = useStore.getState();
            
            // In timeline mode, update the clip directly (independent from column mode)
            if (st.showTimeline && st.selectedTimelineClip && layerTarget.param) {
              const selectedClip = st.selectedTimelineClip;
              
              // Get effect metadata for min/max from the clip's asset
              let min = 0;
              let max = 1;
              try {
                const clipAsset = selectedClip.data?.asset || {};
                const effectId = clipAsset.id || clipAsset.name || clipAsset.effectId;
                if (effectId) {
                  const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
                  const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
                  if (metadata?.parameters) {
                    const paramConfig = metadata.parameters.find((p: any) => p.name === layerTarget.param);
                    if (paramConfig) {
                      if (typeof paramConfig.min === 'number') min = paramConfig.min;
                      if (typeof paramConfig.max === 'number') max = paramConfig.max;
                    }
                  }
                }
                
                // Check clip params for min/max as fallback
                if (selectedClip.data?.params?.[layerTarget.param]) {
                  const clipParam = selectedClip.data.params[layerTarget.param];
                  if (clipParam && typeof clipParam === 'object') {
                    if (typeof clipParam.min === 'number') min = clipParam.min;
                    if (typeof clipParam.max === 'number') max = clipParam.max;
                  }
                }
              } catch {}
              
              const range = max - min;
              const normalizedValue = velocity / 127;
              const mappedValue = min + (range * normalizedValue);
              
              // Queue timeline updates with same batching as column mode for matching sensitivity
              this.queueTimelineUpdate(selectedClip.id, layerTarget.param, mappedValue);
              break; // Skip column mode processing in timeline mode
            }
            
            // Column mode: use existing layer resolution logic
            let layer = this.findLayer(layerTarget.id);
            
            if (layer && layerTarget.param) {
              const effectiveLayerId = layer.id;
              if (layerTarget.param === 'opacity') {
                store.updateLayer(effectiveLayerId, { opacity: velocity / 127 });
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
                this.queueLayerParamUpdate(effectiveLayerId, layerTarget.param, mappedValue);
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
    let store = useStore.getState() as Store;
    const force = !!(store as any).midiForceChannel1;
    const effectiveChannel = force ? 1 : channel;

    if (store.midiAutoDetectOffset && store.midiAutoDetectOffsetPrimed) {
      try {
        const learnedOffset = Math.max(0, Math.min(127, cc > 0 ? cc - 1 : 0));
        if (typeof store.setMidiCCOffset === 'function') {
          store.setMidiCCOffset(learnedOffset);
        }
        if (typeof store.setMidiAutoDetectOffsetPrimed === 'function') {
          store.setMidiAutoDetectOffsetPrimed(false);
        }
      } catch {
        // Ignore learning errors but continue processing with existing offset
      } finally {
        store = useStore.getState() as Store;
      }
    }

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
          case 'global-effect': {
            const geTarget = mapping.target as any;
            const st: any = useStore.getState();
            const isTimeline = !!st.showTimeline;
            const scene = isTimeline
              ? (st.timelineScenes || []).find((s: any) => s.id === st.currentTimelineSceneId)
              : (st.scenes || []).find((s: any) => s.id === st.currentSceneId);
            if (!scene) break;
            const slot = (scene.globalEffects || []).find((g: any) => g && g.id === geTarget.id);
            if (!slot) break;
            const metadata = this.getEffectMetadataForLayer({ type: 'effect', asset: { id: slot.effectId }, params: slot.params } as any) as any;
            const paramName = geTarget.param;
            if (!paramName) break;
            const paramConfig = metadata?.parameters?.find((p: any) => p.name === paramName);
            let min = 0; let max = 1;
            if (paramConfig) { if (typeof paramConfig.min === 'number') min = paramConfig.min; if (typeof paramConfig.max === 'number') max = paramConfig.max; }
            const mapped = min + ((max - min) * (value / 127));
            this.queueGlobalParamUpdate(slot.id, paramName, mapped);
            break;
          }
          case 'layer': {
            const layerTarget = mapping.target as Extract<MIDIMapping['target'], { type: 'layer' }>;
            const st: any = useStore.getState();
            
            // In timeline mode, update the clip directly (independent from column mode)
            if (st.showTimeline && st.selectedTimelineClip && layerTarget.param) {
              const selectedClip = st.selectedTimelineClip;
              
              // Get effect metadata for min/max from the clip's asset
              let min = 0;
              let max = 1;
              try {
                const clipAsset = selectedClip.data?.asset || {};
                const effectId = clipAsset.id || clipAsset.name || clipAsset.effectId;
                if (effectId) {
                  const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
                  const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
                  if (metadata?.parameters) {
                    const paramConfig = metadata.parameters.find((p: any) => p.name === layerTarget.param);
                    if (paramConfig) {
                      if (typeof paramConfig.min === 'number') min = paramConfig.min;
                      if (typeof paramConfig.max === 'number') max = paramConfig.max;
                    }
                  }
                }
                
                // Check clip params for min/max as fallback
                if (selectedClip.data?.params?.[layerTarget.param]) {
                  const clipParam = selectedClip.data.params[layerTarget.param];
                  if (clipParam && typeof clipParam === 'object') {
                    if (typeof clipParam.min === 'number') min = clipParam.min;
                    if (typeof clipParam.max === 'number') max = clipParam.max;
                  }
                }
              } catch {}
              
              const range = max - min;
              const normalizedValue = value / 127;
              const mappedValue = min + (range * normalizedValue);
              
              // Queue timeline updates with same batching as column mode for matching sensitivity
              this.queueTimelineUpdate(selectedClip.id, layerTarget.param, mappedValue);
              break; // Skip column mode processing in timeline mode
            }
            
            // Column mode: use existing layer resolution logic
            let layer = this.findLayer(layerTarget.id);
            
            if (layer && layerTarget.param) {
              const effectiveLayerId = layer.id;
              if (layerTarget.param === 'opacity') {
                store.updateLayer(effectiveLayerId, { opacity: value / 127 });
              } else {
                const metadata = this.getEffectMetadataForLayer(layer) as any;
                const paramConfig = metadata?.parameters?.find((p: any) => p.name === layerTarget.param);
                let min = 0; let max = 1;
                if (paramConfig) {
                  if (typeof paramConfig.min === 'number') min = paramConfig.min;
                  if (typeof paramConfig.max === 'number') max = paramConfig.max;
                } else {
                  try {
                    const layerParam = ((layer as any).params || {})[layerTarget.param];
                    if (layerParam && typeof layerParam === 'object') {
                      if (typeof layerParam.min === 'number') min = layerParam.min;
                      if (typeof layerParam.max === 'number') max = layerParam.max;
                    }
                  } catch {}
                }
                const range = max - min;
                const normalizedValue = value / 127;
                const mappedValue = min + (range * normalizedValue);
                this.queueLayerParamUpdate(effectiveLayerId, layerTarget.param, mappedValue);
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
    const store: any = useStore.getState();
    const isTimeline = !!store.showTimeline;
    
    // Handle timeline pseudo-layer IDs (e.g., "timeline-layer-{clipId}")
    if (isTimeline && String(layerId).startsWith('timeline-layer-')) {
      const clipId = String(layerId).replace('timeline-layer-', '');
      const selectedClip = store.selectedTimelineClip;
      
      // If the selected clip matches this pseudo ID, resolve to the actual layer
      if (selectedClip && selectedClip.id === clipId) {
        // First try to use explicit layerId from the clip
        if (selectedClip.layerId) {
          const actualLayerId = selectedClip.layerId;
          // Try to find the actual layer in timeline scenes
          const sceneList = store.timelineScenes || [];
          const sceneId = store.currentTimelineSceneId;
          const currentScene = sceneList.find((s: any) => s && s.id === sceneId);
          if (currentScene) {
            for (const column of currentScene.columns || []) {
              const layer = column.layers.find((l: any) => l.id === actualLayerId);
              if (layer) return layer;
            }
          }
          // If not found in timeline scenes, try column scenes
          const columnSceneList = store.scenes || [];
          const columnSceneId = store.currentSceneId;
          const columnScene = columnSceneList.find((s: any) => s && s.id === columnSceneId);
          if (columnScene) {
            for (const column of columnScene.columns || []) {
              const layer = column.layers.find((l: any) => l.id === actualLayerId);
              if (layer) return layer;
            }
          }
        }
        
        // If no explicit layerId but we have clip data, try to resolve by asset matching
        if (selectedClip.data) {
          const assetId = selectedClip.data?.asset?.id || selectedClip.data?.asset?.name || selectedClip.data?.name;
          const isVideo = selectedClip.data?.type === 'video' || selectedClip.data?.asset?.type === 'video';
          
          // Check timeline scenes first
          const sceneList = store.timelineScenes || [];
          const sceneId = store.currentTimelineSceneId;
          const currentScene = sceneList.find((s: any) => s && s.id === sceneId);
          if (currentScene) {
            const allLayers = currentScene.columns.flatMap((c: any) => c.layers || []);
            const match = isVideo
              ? allLayers.find((l: any) => l?.asset?.type === 'video' && (l?.asset?.id === assetId || l?.asset?.name === assetId))
              : allLayers.find((l: any) => (l?.asset?.isEffect || l?.type === 'effect') && (l?.asset?.id === assetId || l?.asset?.name === assetId));
            if (match) return match;
          }
          
          // Fallback to column scenes
          const columnSceneList = store.scenes || [];
          const columnSceneId = store.currentSceneId;
          const columnScene = columnSceneList.find((s: any) => s && s.id === columnSceneId);
          if (columnScene) {
            const allLayers = columnScene.columns.flatMap((c: any) => c.layers || []);
            const match = isVideo
              ? allLayers.find((l: any) => l?.asset?.type === 'video' && (l?.asset?.id === assetId || l?.asset?.name === assetId))
              : allLayers.find((l: any) => (l?.asset?.isEffect || l?.type === 'effect') && (l?.asset?.id === assetId || l?.asset?.name === assetId));
            if (match) return match;
          }
        }
      }
    }
    
    // Standard lookup: try timeline scenes first if in timeline mode
    const sceneList = isTimeline ? (store.timelineScenes || []) : (store.scenes || []);
    const sceneId = isTimeline ? store.currentTimelineSceneId : store.currentSceneId;
    let currentScene = sceneList.find((s: any) => s && s.id === sceneId);
    
    if (currentScene) {
      for (const column of currentScene.columns || []) {
        const layer = column.layers.find((l: any) => l.id === layerId);
        if (layer) return layer;
      }
    }
    
    // Fallback: if in timeline mode and not found, also check column scenes
    if (isTimeline) {
      const columnSceneList = store.scenes || [];
      const columnSceneId = store.currentSceneId;
      const columnScene = columnSceneList.find((s: any) => s && s.id === columnSceneId);
      if (columnScene) {
        for (const column of columnScene.columns || []) {
          const layer = column.layers.find((l: any) => l.id === layerId);
          if (layer) return layer;
        }
      }
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