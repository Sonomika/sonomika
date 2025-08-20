import { useStore } from '../store/store';
import { useLFOStore, type LFOState, type LFOMapping } from '../store/lfoStore';
import { BPMManager } from './BPMManager';
import { getEffect } from '../utils/effectRegistry';
import { randomizeEffectParams as globalRandomize } from '../utils/ParameterRandomizer';

type LayerLike = {
  id: string;
  type: string;
  name?: string;
  opacity?: number;
  params?: Record<string, any>;
  asset?: any;
};

function normalizeKeyName(k: string): string {
  return String(k || '').toLowerCase().replace(/\s+/g, '');
}

const RANDOMIZE_SUFFIX = '__randomize';
const RANDOMIZE_ALL = '__randomize_all';

function waveValue(timeRadians: number, type: string, timeSec?: number, rateHz?: number, cache?: { step: number; value: number }): number {
  const cycles = timeRadians / (2 * Math.PI);
  const frac = cycles - Math.floor(cycles);
  const kind = (type || 'sine').toLowerCase();
  switch (kind) {
    case 'square':
      return Math.sign(Math.sin(timeRadians)) || 1;
    case 'triangle':
      return 2 * Math.abs(2 * frac - 1) - 1;
    case 'sawup':
      return 2 * frac - 1;
    case 'sawdown':
      return 1 - 2 * frac;
    case 'random': {
      const r = Math.max(0.0001, rateHz || 1);
      const ts = Math.floor((timeSec || 0) * r);
      if (cache && cache.step !== ts) {
        cache.step = ts;
        cache.value = Math.random() * 2 - 1;
      }
      return cache ? cache.value : (Math.random() * 2 - 1);
    }
    case 'randomsmooth': {
      const r = Math.max(0.0001, rateHz || 1);
      const x = (timeSec || 0) * r;
      const i0 = Math.floor(x);
      const f = x - i0;
      const y0 = (Math.sin(i0 + 1) * 43758.5453123 - Math.floor(Math.sin(i0 + 1) * 43758.5453123)) * 2 - 1;
      const y1 = (Math.sin(i0 + 2) * 43758.5453123 - Math.floor(Math.sin(i0 + 2) * 43758.5453123)) * 2 - 1;
      return y0 + (y1 - y0) * f;
    }
    case 'sine':
    default:
      return Math.sin(timeRadians);
  }
}

function parseDivisionToMs(bpm: number, division?: string): number {
  const div = (division || '1/4').trim();
  const dotted = div.endsWith('.') || div.endsWith('d');
  const triplet = /t$/i.test(div);
  const core = div.replace(/[.d]|t$/i, '');
  const match = core.match(/^\s*1\s*\/\s*(\d+)\s*$/);
  const denom = match ? Math.max(1, parseInt(match[1], 10)) : 4;
  const quarterMs = (60 / Math.max(1, bpm)) * 1000;
  let ms = quarterMs * (4 / denom);
  if (dotted) ms *= 1.5;
  if (triplet) ms *= 2 / 3;
  return ms;
}

class LFOEngineImpl {
  private rafId: number | null = null;
  private running: boolean = false;
  private lastUpdateMs: number = 0;
  private updateThrottleMs: number = 50;
  private randomTimers: Map<string, number> = new Map();
  private randomTimerMeta: Map<string, string> = new Map();
  private randomHoldCache: Map<string, { step: number; value: number }> = new Map();
  private prevNormByMapping: Map<string, number> = new Map();

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    // Clear random timers
    for (const [, t] of this.randomTimers) clearInterval(t);
    this.randomTimers.clear();
    this.randomTimerMeta.clear();
  }

  // Expose a safe way to rebuild random timers (e.g., on BPM or division change)
  resetRandomTimers() {
    for (const [, t] of this.randomTimers) clearInterval(t);
    this.randomTimers.clear();
    this.randomTimerMeta.clear();
  }

  onColumnPlay() {
    this.start();
  }

  onGlobalPlay() {
    this.start();
    // Ensure a column is marked as playing so engine has layers to modulate
    try {
      const state = useStore.getState() as any;
      if (!state.playingColumnId) {
        const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
        const firstColumn = scene?.columns?.[0];
        if (firstColumn && typeof state.playColumn === 'function') {
          state.playColumn(firstColumn.id);
        }
      }
    } catch {}
  }

  onGlobalPause() {
    this.stop();
  }

  onGlobalStop() {
    this.stop();
  }

  onColumnStop() {
    this.stop();
  }

  private loop = () => {
    if (!this.running) return;
    const now = Date.now();
    if (now - this.lastUpdateMs >= this.updateThrottleMs) {
      this.lastUpdateMs = now;
      this.updateAllActiveLayers(now);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private getActiveLayers(): LayerLike[] {
    // Determine active layers: timeline first (if playing), else currently playing column
    try {
      const state = useStore.getState() as any;
      const { scenes, currentSceneId, playingColumnId, selectedTimelineClip } = state;
      // If timeline is playing, synthesize active layers from timeline preview
      const timelineIsPlaying = (window as any).__vj_timeline_is_playing__ === true;
      const timelineActiveLayers: LayerLike[] | null = (window as any).__vj_timeline_active_layers__ || null;
      if (timelineIsPlaying && Array.isArray(timelineActiveLayers) && timelineActiveLayers.length > 0) {
        return timelineActiveLayers;
      }
      const scene = scenes?.find((s: any) => s.id === currentSceneId);
      if (!scene) return [];
      if (!playingColumnId) return [];
      const col = scene.columns?.find((c: any) => c.id === playingColumnId);
      const layers: any[] = (col?.layers || []).filter(Boolean);
      return layers as LayerLike[];
    } catch {
      return [];
    }
  }

  private updateAllActiveLayers(nowMs: number) {
    const layers = this.getActiveLayers();
    if (!layers || layers.length === 0) return;
    const lfoState = useLFOStore.getState();
    const updateLayer = (useStore.getState() as any).updateLayer as (id: string, updates: Partial<LayerLike>) => void;
    const bpmMgr = BPMManager.getInstance();
    const bpm = bpmMgr.getBPM?.() || 120;

    for (const layer of layers) {
      const lfo: LFOState | undefined = lfoState.lfoStateByLayer[layer.id];
      const mappings: LFOMapping[] = lfoState.mappingsByLayer[layer.id] || [];
      if (!lfo || !mappings || mappings.length === 0) {
        // Clear any timer left from random mode
        const key = layer.id;
        if (this.randomTimers.has(key)) {
          clearInterval(this.randomTimers.get(key)!);
          this.randomTimers.delete(key);
        }
        continue;
      }

      if (lfo.mode === 'lfo') {
        // Ensure any random timer is cleared for this layer
        if (this.randomTimers.has(layer.id)) {
          clearInterval(this.randomTimers.get(layer.id)!);
          this.randomTimers.delete(layer.id);
        }
        // Compute current value
        const timeSec = nowMs * 0.001;
        // Support BPM sync for LFO
        const bpmMgr = BPMManager.getInstance();
        const bpm = bpmMgr.getBPM?.() || 120;
        const timingMode = String((lfo as any).lfoTimingMode || 'hz').toLowerCase();
        const division = (lfo as any).lfoDivision || '1/4';
        const periodMs = timingMode === 'sync' ? parseDivisionToMs(bpm, division) : undefined;
        // Keep rate in sync with lfoHz for downstream users that read it
        const rate = timingMode === 'sync' ? Math.max(0.01, 1000 / Math.max(1, periodMs || 1000)) : Number((lfo as any).lfoHz || lfo.rate || 1);
        if (timingMode === 'sync') {
          try { useLFOStore.getState().setLFOStateForLayer(layer.id, { rate }); } catch {}
        }
        const phase = Number(lfo.phase || 0);
        const depth = Number(lfo.depth || 100);
        const offset = Number(lfo.offset || 0);
        const waveform = String(lfo.waveform || 'sine');
        const cacheKey = `${layer.id}-lfo`;
        const cache = this.randomHoldCache.get(cacheKey) || { step: -1, value: 0 };
        this.randomHoldCache.set(cacheKey, cache);
        let value = waveValue(timeSec * rate * 2 * Math.PI + phase * 0.01 * 2 * Math.PI, waveform, timeSec, rate, cache);
        value = value * (depth / 100) + (offset / 100);
        value = Math.max(-1, Math.min(1, value));

        this.applyModulationToLayer(layer, mappings, value, nowMs, updateLayer);
        // Persist current value
        useLFOStore.getState().setLFOStateForLayer(layer.id, { currentValue: value });
      } else if (lfo.mode === 'random') {
        // Random mode: ensure per-layer timer exists
        const timerKey = layer.id;
        const timingMode = (lfo.randomTimingMode || 'sync') as 'sync' | 'hz';
        const signature = timingMode === 'sync'
          ? `sync:${bpm}:${String(lfo.randomDivision || '1/4')}`
          : `hz:${Math.max(0.1, Math.min(20, Number(lfo.randomHz || 2)))}`;
        const prevSig = this.randomTimerMeta.get(timerKey);
        if (prevSig !== signature) {
          // Rebuild timer only if signature changed
          if (this.randomTimers.has(timerKey)) {
            clearInterval(this.randomTimers.get(timerKey)!);
            this.randomTimers.delete(timerKey);
          }
          this.randomTimerMeta.set(timerKey, signature);
          const createTimer = () => {
            const min = Math.min(Number(lfo.randomMin || -100), Number(lfo.randomMax || 100)) / 100;
            const max = Math.max(Number(lfo.randomMin || -100), Number(lfo.randomMax || 100)) / 100;
            const fireRandom = () => {
              // If mode switched away from random, tear down timer
              const latest = useLFOStore.getState().lfoStateByLayer[layer.id];
              if (!latest || latest.mode !== 'random') {
                const id = this.randomTimers.get(timerKey);
                if (id) clearInterval(id);
                this.randomTimers.delete(timerKey);
                this.randomTimerMeta.delete(timerKey);
                return;
              }
              const skip = Math.random() * 100 < Number(lfo.skipPercent || 0);
              if (skip) return;
              const rand = min + Math.random() * (max - min);
              const clamped = Math.max(-1, Math.min(1, rand));
              this.applyModulationToLayer(layer, mappings, clamped, Date.now(), updateLayer, /*isRandomMode*/ true);
              useLFOStore.getState().setLFOStateForLayer(layer.id, { currentValue: clamped });
            };
            let intervalMs = 500;
            if (timingMode === 'sync') {
              intervalMs = parseDivisionToMs(bpm, lfo.randomDivision || '1/4');
            } else {
              const hz = Math.max(0.1, Math.min(20, Number(lfo.randomHz || 2)));
              intervalMs = Math.max(10, Math.round(1000 / hz));
            }
            const id = window.setInterval(fireRandom, Math.max(10, Math.floor(intervalMs)));
            return id;
          };
          const id = createTimer();
          this.randomTimers.set(timerKey, id);
        }
      }
    }
  }

  private applyModulationToLayer(
    layer: LayerLike,
    mappings: LFOMapping[],
    currentValue: number,
    now: number,
    updateLayer: (id: string, updates: Partial<LayerLike>) => void,
    isRandomMode: boolean = false,
  ) {
    if (!mappings || mappings.length === 0) return;
    const normalizedLFO = (currentValue + 1) / 2;

    mappings.forEach((mapping) => {
      if (!mapping.enabled || mapping.parameter === 'Select Parameter') return;
      const minVal = Number.isFinite(Number(mapping.min)) ? Number(mapping.min) : 0;
      const maxVal = Number.isFinite(Number(mapping.max)) ? Number(mapping.max) : 100;
      const range = maxVal - minVal;
      const modulatedValue = minVal + (range * normalizedLFO);

      const parts = mapping.parameter.split(' - ');
      const rawName = parts.length > 1 ? parts[1] : (parts[0].toLowerCase().includes('opacity') ? 'opacity' : undefined);
      if (!rawName) return;

      const isRandomizeAll = rawName === RANDOMIZE_ALL;
      const isRandomizeTarget = rawName.endsWith(RANDOMIZE_SUFFIX);
      const targetName = isRandomizeTarget ? rawName.slice(0, -RANDOMIZE_SUFFIX.length) : rawName;

      // Handle randomize-all and per-parameter randomize triggers
      if (isRandomizeAll) {
        // In LFO mode, trigger on rising edge; in random mode, fire per trigger
        const prev = this.prevNormByMapping.get(mapping.id) ?? 0;
        this.prevNormByMapping.set(mapping.id, normalizedLFO);
        const threshold = 0.9;
        const shouldFire = isRandomMode ? true : (prev <= threshold && normalizedLFO > threshold);
        if (shouldFire) {
          const effectId: string | undefined = (layer as any)?.asset?.id || (layer as any)?.asset?.name;
          const isEffect = (layer as any)?.type === 'effect' || (layer as any)?.asset?.isEffect;
          if (isEffect && effectId) {
            const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
            const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
            if (metadata?.parameters) {
              const unlockedDefs = (metadata.parameters as any[]).filter((p: any) => !(layer.params as any)?.[p.name]?.locked);
              const randomized = globalRandomize(unlockedDefs, layer.params);
              if (randomized && Object.keys(randomized).length > 0) {
                const updatedParams = { ...(layer.params || {}) } as Record<string, any>;
                Object.entries(randomized).forEach(([n, obj]) => {
                  updatedParams[n] = { ...(updatedParams[n] || {}), value: (obj as any).value };
                });
                updateLayer(layer.id, { params: updatedParams });
              }
            }
          }
        }
        return;
      }

      // Resolve actual parameter name
      let actualParamName = targetName;
      const paramKeys = Object.keys((layer.params || {}));
      if (!(layer.params || {})[actualParamName]) {
        const norm = normalizeKeyName(targetName);
        const found = paramKeys.find((k) => normalizeKeyName(k) === norm);
        if (found) actualParamName = found;
      }
      if (!actualParamName) return;

      if (isRandomizeTarget) {
        const prev = this.prevNormByMapping.get(mapping.id) ?? 0;
        this.prevNormByMapping.set(mapping.id, normalizedLFO);
        const threshold = 0.9;
        const shouldFire = isRandomMode ? true : (prev <= threshold && normalizedLFO > threshold);
        if (shouldFire) {
          const effectId: string | undefined = (layer as any)?.asset?.id || (layer as any)?.asset?.name;
          const isEffect = (layer as any)?.type === 'effect' || (layer as any)?.asset?.isEffect;
          let updatedParams = { ...(layer.params || {}) } as Record<string, any>;
          if (isEffect && effectId) {
            const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
            const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
            const paramDef = metadata?.parameters?.find((p: any) => p?.name === actualParamName);
            if (paramDef) {
              const randomized = globalRandomize([paramDef], layer.params);
              if (randomized && randomized[actualParamName]) {
                updatedParams[actualParamName] = { ...(updatedParams[actualParamName] || {}), value: (randomized as any)[actualParamName].value };
                updateLayer(layer.id, { params: updatedParams });
                return;
              }
            }
          }
          // Fallback numeric randomization
          const val = Number(minVal) + Math.random() * (Number(maxVal) - Number(minVal));
          updatedParams[actualParamName] = { ...(updatedParams[actualParamName] || {}), value: val };
          updateLayer(layer.id, { params: updatedParams });
        }
        return;
      }

      // Continuous modulation
      const isTimelinePlaying = (window as any).__vj_timeline_is_playing__ === true;
      const dispatchToTimeline = (payload: any) => {
        try { document.dispatchEvent(new CustomEvent('timelineModulate', { detail: payload })); } catch {}
      };
      if (actualParamName === 'opacity') {
        const clampedValue = Math.max(0, Math.min(1, modulatedValue / 100));
        if (isTimelinePlaying) {
          // For timeline layers, map layer.id back to original clipId
          const clipId = String((layer as any).clipId || String(layer.id).replace(/^timeline-layer-/, ''));
          dispatchToTimeline({ clipId, isOpacity: true, value: clampedValue });
        } else {
          updateLayer(layer.id, { opacity: clampedValue });
        }
      } else {
        const currentParams = layer.params || {};
        const currentVal = currentParams[actualParamName]?.value;
        if (typeof currentVal !== 'number' || !Number.isFinite(currentVal)) return;
        if (isTimelinePlaying) {
          const clipId = String((layer as any).clipId || String(layer.id).replace(/^timeline-layer-/, ''));
          dispatchToTimeline({ clipId, paramName: actualParamName, value: modulatedValue });
        } else {
          const newParams = {
            ...currentParams,
            [actualParamName]: {
              ...currentParams[actualParamName],
              value: modulatedValue,
            },
          };
          updateLayer(layer.id, { params: newParams });
        }
      }

      // Store last modulated info for overlays/debug
      const key = `${layer.id}-${actualParamName}`;
      useLFOStore.getState().setModulatedValue(key, {
        layerId: layer.id,
        parameterName: actualParamName,
        baseValue: actualParamName === 'opacity' ? (Number(layer.opacity || 1) * 100) : (typeof (layer.params || {})[actualParamName]?.value === 'number' ? Number((layer.params as any)[actualParamName].value) : 0),
        modulatedValue: modulatedValue,
        timestamp: now,
      });
    });
  }
}

let _engine: LFOEngineImpl | null = null;

export function getLFOEngine(): LFOEngineImpl {
  if (!_engine) _engine = new LFOEngineImpl();
  return _engine;
}

export function attachLFOEngineGlobalListeners() {
  const engine = getLFOEngine();
  const onColumnPlay = () => engine.onColumnPlay();
  const onColumnStop = () => engine.onColumnStop();
  const onGlobalPlay = () => engine.onGlobalPlay();
  const onGlobalPause = () => engine.onGlobalPause();
  const onGlobalStop = () => engine.onGlobalStop();
  document.addEventListener('columnPlay', onColumnPlay as any);
  document.addEventListener('columnStop', onColumnStop as any);
  document.addEventListener('globalPlay', onGlobalPlay as any);
  document.addEventListener('globalPause', onGlobalPause as any);
  document.addEventListener('globalStop', onGlobalStop as any);

  // Ensure engine runs during timeline playback and stays in sync
  const onTimelineTick = () => { if (!(engine as any).running) engine.start(); };
  const onTimelineStop = () => engine.stop();
  document.addEventListener('timelineTick', onTimelineTick as any);
  document.addEventListener('timelineStop', onTimelineStop as any);

  // Rebuild random timers when BPM changes so Sync timing updates immediately
  try {
    const bpmMgr = BPMManager.getInstance();
    const onBpmChange = () => engine.resetRandomTimers();
    bpmMgr.addCallback(onBpmChange);
  } catch {}

  // Extra safety: subscribe to store state to auto-start/stop on playing state changes
  try {
    const subscribe = (useStore as any).subscribe as (<T>(selector: (state: any) => T, listener: (state: T, prevState: T) => void) => () => void) | undefined;
    if (subscribe) {
      // Listen to a slice that includes flags we care about
      subscribe(
        (state: any) => ({ isGlobalPlaying: state.isGlobalPlaying, playingColumnId: state.playingColumnId }),
        (state, prev) => {
          try {
            if (state.isGlobalPlaying && !prev.isGlobalPlaying) engine.start();
            if (!state.isGlobalPlaying && prev.isGlobalPlaying) engine.stop();
            if (state.playingColumnId && !prev.playingColumnId) engine.start();
            if (!state.playingColumnId && prev.playingColumnId) engine.stop();
          } catch {}
        }
      );
    }
  } catch {}
}


