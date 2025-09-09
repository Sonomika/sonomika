import React, { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import { useStore } from '../store/store';
import { Layer } from '../store/types';
import { useLFOStore, type LFOMapping } from '../store/lfoStore';
import { ParamRow, Select, Tabs, TabsList, TabsTrigger, TabsContent, Switch, Slider } from './ui';
import { getClock } from '../engine/Clock';
import { getEffect } from '../utils/effectRegistry';
import { getEffectComponentSync } from '../utils/EffectLoader';
import { randomizeEffectParams as globalRandomize } from '../utils/ParameterRandomizer';

interface LFOMapperProps {
  selectedLayer: Layer | null;
  onUpdateLayer: (layerId: string, options: Partial<Layer>) => void;
}

// Humanize a camelCase identifier into Title Case with spaces
const humanize = (camel: string) => camel
  .replace(/([A-Z])/g, ' $1')
  .replace(/^./, (s) => s.toUpperCase())
  .trim();
const isNumber = (v: any) => typeof v === 'number' && Number.isFinite(v);
const toNumberOr = (v: any, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const normalizeKey = (k: string) => k.toLowerCase().replace(/\s+/g, '');
const RANDOMIZE_SUFFIX = '__randomize';
const RANDOMIZE_ALL = '__randomize_all';

export const LFOMapper: React.FC<LFOMapperProps> = ({ selectedLayer, onUpdateLayer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const randomHoldRef = useRef<{ step: number; value: number }>({ step: -1, value: 0 });
  const [activeTab, setActiveTab] = useState<'lfo'>('lfo');
  const { playingColumnId, isGlobalPlaying } = useStore() as any;
  const [transportPlaying, setTransportPlaying] = useState<boolean>(false);

  // Sync local playing state with column/global/timeline transport
  useEffect(() => {
    const compute = () => Boolean((window as any).__vj_timeline_is_playing__ === true || playingColumnId || isGlobalPlaying);
    setTransportPlaying(compute());
  }, [playingColumnId, isGlobalPlaying]);

  useEffect(() => {
    const onPlay = () => setTransportPlaying(true);
    const onStop = () => setTransportPlaying(false);
    const onPause = () => setTransportPlaying(false);
    document.addEventListener('timelinePlay', onPlay as any);
    document.addEventListener('timelineStop', onStop as any);
    document.addEventListener('columnPlay', onPlay as any);
    document.addEventListener('columnStop', onStop as any);
    document.addEventListener('globalPlay', onPlay as any);
    document.addEventListener('globalStop', onStop as any);
    document.addEventListener('globalPause', onPause as any);
    return () => {
      document.removeEventListener('timelinePlay', onPlay as any);
      document.removeEventListener('timelineStop', onStop as any);
      document.removeEventListener('columnPlay', onPlay as any);
      document.removeEventListener('columnStop', onStop as any);
      document.removeEventListener('globalPlay', onPlay as any);
      document.removeEventListener('globalStop', onStop as any);
      document.removeEventListener('globalPause', onPause as any);
    };
  }, []);
  
  const lfoStateByLayer = useLFOStore((state) => state.lfoStateByLayer);
  const mappingsByLayer = useLFOStore((state) => state.mappingsByLayer);
  const setLFOForLayer = useLFOStore((state) => state.setLFOStateForLayer);
  const ensureLFOForLayer = useLFOStore((state) => state.ensureLFOStateForLayer);
  const addMappingForLayer = useLFOStore((state) => state.addMappingForLayer);
  const removeMappingForLayer = useLFOStore((state) => state.removeMappingForLayer);
  const updateMappingForLayer = useLFOStore((state) => state.updateMappingForLayer);
  const setLFOModulatedValue = useLFOStore((state) => state.setModulatedValue);

  // Sync UI tab with per-layer mode, but only when the mode actually changes
  const currentMode = (() => {
    const lid = selectedLayer?.id;
    return lid ? (lfoStateByLayer[lid]?.mode as any) : undefined;
  })();
  useEffect(() => {
    // Force UI to LFO tab only
    if (activeTab !== 'lfo') setActiveTab('lfo');
    // Coerce any non-lfo mode back to 'lfo'
    const lid = selectedLayer?.id;
    if (lid && currentMode && currentMode !== 'lfo') setLFOForLayer(lid, { mode: 'lfo' as any });
    // Only depend on the computed mode to avoid re-running on unrelated per-layer state updates (e.g., currentValue)
  }, [currentMode, activeTab, selectedLayer?.id]);

  // Refs to avoid dependencies
  const selectedLayerRef = useRef(selectedLayer);
  const mappingsRef = useRef(mappingsByLayer[selectedLayer?.id || ''] || []);
  const onUpdateLayerRef = useRef(onUpdateLayer);
  const prevNormByMappingRef = useRef<Record<string, number>>({});

  useEffect(() => { selectedLayerRef.current = selectedLayer; }, [selectedLayer]);
  useLayoutEffect(() => {
    const lid = selectedLayer?.id;
    if (lid) {
      try { ensureLFOForLayer(lid); } catch {}
    }
  }, [selectedLayer?.id]);
  useEffect(() => {
    const lid = selectedLayerRef.current?.id;
    mappingsRef.current = lid ? (mappingsByLayer[lid] || []) : [];
  }, [mappingsByLayer, selectedLayer?.id]);
  useEffect(() => { onUpdateLayerRef.current = onUpdateLayer; }, [onUpdateLayer]);

  // Debug selection (always log to console)
  useEffect(() => {
    try {
      const lid = selectedLayer?.id;
      const st = (useLFOStore as any).getState?.().lfoStateByLayer?.[lid || ''];
      console.log('[LFO] select', lid, { hasState: !!st, state: st });
    } catch {}
  }, [selectedLayer?.id]);

  const lastUpdateTime = useRef(0);
  const updateThrottleMs = 16; // ~60 FPS for tighter sync at fast divisions

  // Waveform helpers
  const waveValue = (t: number, type: string, timeSec?: number, rateHz?: number): number => {
    // t is radians; convert to normalized cycles for non-sine shapes
    const cycles = t / (2 * Math.PI);
    const frac = cycles - Math.floor(cycles);
    switch ((type || 'sine').toLowerCase()) {
      case 'square':
        return Math.sign(Math.sin(t)) || 1;
      case 'triangle': {
        // 2*abs(2*frac - 1) - 1 → [-1,1]
        return 2 * Math.abs(2 * frac - 1) - 1;
      }
      case 'sawup': {
        // Saw rising from -1 to 1
        return 2 * frac - 1;
      }
      case 'sawdown': {
        return 1 - 2 * frac;
      }
      case 'random': {
        // Sample-and-hold random; changes at `rateHz` times per second
        const r = Math.max(0.0001, rateHz || 1);
        const ts = Math.floor((timeSec || 0) * r);
        if (randomHoldRef.current.step !== ts) {
          randomHoldRef.current.step = ts;
          randomHoldRef.current.value = Math.random() * 2 - 1; // [-1,1]
        }
        return randomHoldRef.current.value;
      }
      case 'randomsmooth': {
        // Linear-interpolated random values per step
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
        return Math.sin(t);
    }
  };

  // Parse musical division strings like "1/64", "1/4", "2", "8" to an interval in ms
  const parseDivisionToMs = (bpm: number, division: string | undefined): number => {
    const div = (division || '1/4').trim();
    const dotted = div.endsWith('.') || div.endsWith('d');
    const triplet = /t$/i.test(div);
    const core = div.replace(/[.d]|t$/i, '');
    
    // Handle fractions like "1/64", "1/4", etc.
    const fractionMatch = core.match(/^\s*1\s*\/\s*(\d+)\s*$/);
    if (fractionMatch) {
      const denom = Math.max(1, parseInt(fractionMatch[1], 10));
      const quarterMs = (60 / Math.max(1, bpm)) * 1000;
      let ms = quarterMs * (4 / denom);
      if (dotted) ms *= 1.5;
      if (triplet) ms *= 2 / 3;
      return ms;
    }
    
    // Handle whole numbers like "1", "2", "4", "8", "16", "32"
    const wholeMatch = core.match(/^\s*(\d+)\s*$/);
    if (wholeMatch) {
      const bars = Math.max(1, parseInt(wholeMatch[1], 10));
      const quarterMs = (60 / Math.max(1, bpm)) * 1000;
      let ms = quarterMs * 4 * bars; // 4 quarter notes per bar
      if (dotted) ms *= 1.5;
      if (triplet) ms *= 2 / 3;
      return ms;
    }
    
    // Fallback to 1/4 note
    const quarterMs = (60 / Math.max(1, bpm)) * 1000;
    return quarterMs;
  };

  const normalizeDivision = (division: string | undefined): string => {
    const allowedDivisions = ['1/64', '1/32', '1/16', '1/8', '1/4', '1/2', '1', '2', '4', '8', '16', '32'];
    const div = String(division || '1/4').trim();
    if (allowedDivisions.includes(div)) return div;
    
    // Handle legacy format like "1/4" and convert to new format
    const match = div.match(/^1\/(\d+)$/);
    if (match) {
      const denom = Number(match[1]);
      if (denom === 64) return '1/64';
      if (denom === 32) return '1/32';
      if (denom === 16) return '1/16';
      if (denom === 8) return '1/8';
      if (denom === 4) return '1/4';
      if (denom === 2) return '1/2';
    }
    
    // Handle whole numbers
    const wholeMatch = div.match(/^(\d+)$/);
    if (wholeMatch) {
      const num = Number(wholeMatch[1]);
      if (num === 1) return '1';
      if (num === 2) return '2';
      if (num === 4) return '4';
      if (num === 8) return '8';
      if (num === 16) return '16';
      if (num === 32) return '32';
    }
    
    // Default fallback
    return '1/4';
  };

  const applyLFOModulation = useCallback((currentValue: number) => {
    const currentSelectedLayer = selectedLayerRef.current;
    const currentMappings = mappingsRef.current;
    const currentOnUpdateLayer = onUpdateLayerRef.current;

    if (!currentSelectedLayer || currentMappings.length === 0) return;

    const now = Date.now();
    if (now - lastUpdateTime.current < updateThrottleMs) return;
    lastUpdateTime.current = now;

    // Accumulate updates to avoid clobbering when multiple mappings are active
    let pendingParams = { ...(currentSelectedLayer.params || {}) } as Record<string, any>;
    let pendingOpacity: number | undefined = undefined;
    let anyChanged = false;

    // Resolve effect metadata for default min/max mapping if available
    const effectId: string | undefined = (currentSelectedLayer as any)?.asset?.id || (currentSelectedLayer as any)?.asset?.name;
    const isEffect = (currentSelectedLayer as any)?.type === 'effect' || (currentSelectedLayer as any)?.asset?.isEffect;
    const effectComponent = isEffect && effectId ? (getEffect(effectId) || getEffect(`${effectId}Effect`) || null) : null;
    const metadata: any = effectComponent ? (effectComponent as any).metadata : null;

    currentMappings.forEach(mapping => {
      if (!mapping.enabled || mapping.parameter === 'Select Parameter') return;

      // Resolve to actual param key on the layer
      const parts = mapping.parameter.split(' - ');
      const rawName = parts.length > 1 ? parts[1] : (parts[0].toLowerCase().includes('opacity') ? 'opacity' : undefined);

      // Default to parameter metadata min/max if mapping values are not set
      let defaultMin = 0;
      let defaultMax = 100;
      if (metadata?.parameters && rawName) {
        const def = (metadata.parameters as any[]).find((p: any) => p?.name === rawName);
        if (def) {
          if (typeof def.min === 'number' && Number.isFinite(def.min)) defaultMin = def.min as number;
          if (typeof def.max === 'number' && Number.isFinite(def.max)) defaultMax = def.max as number;
        }
      }
      const minVal = Number.isFinite(Number(mapping.min)) ? Number(mapping.min) : defaultMin;
      const maxVal = Number.isFinite(Number(mapping.max)) ? Number(mapping.max) : defaultMax;
      const range = maxVal - minVal;
      const normalizedLFO = (currentValue + 1) / 2;
      const modulatedValue = Math.max(Math.min(minVal, maxVal), Math.min(Math.max(minVal, maxVal), minVal + (range * normalizedLFO)));

      if (!rawName) return;

      // Detect randomize triggers
      const isRandomizeAll = rawName === RANDOMIZE_ALL;
      const isRandomizeTarget = rawName.endsWith(RANDOMIZE_SUFFIX);
      const targetName = isRandomizeTarget ? rawName.slice(0, -RANDOMIZE_SUFFIX.length) : rawName;

      if (isRandomizeAll) {
        // Rising edge trigger to randomize all unlocked effect params
        const prev = prevNormByMappingRef.current[mapping.id] ?? 0;
        prevNormByMappingRef.current[mapping.id] = normalizedLFO;
        const threshold = 0.9;
        if (prev <= threshold && normalizedLFO > threshold) {
          const effectId: string | undefined = (currentSelectedLayer as any)?.asset?.id || (currentSelectedLayer as any)?.asset?.name;
          const isEffect = (currentSelectedLayer as any)?.type === 'effect' || (currentSelectedLayer as any)?.asset?.isEffect;
          if (isEffect && effectId) {
            const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
            const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
            if (metadata?.parameters) {
              // Filter out locked params
              const unlockedDefs = (metadata.parameters as any[]).filter((p: any) => !(currentSelectedLayer.params as any)?.[p.name]?.locked);
              const randomized = globalRandomize(unlockedDefs, currentSelectedLayer.params);
              if (randomized && Object.keys(randomized).length > 0) {
                // Respect global smoothing with safe default 0.1 when unset
                const gs: any = (window as any).__vj_rand_smoothing;
                const smoothing = Math.max(0, Math.min(1, typeof gs === 'number' && Number.isFinite(gs) ? gs : 0.1));
                if (smoothing > 0) {
                  const targets: Record<string, number> = {};
                  const starts: Record<string, number> = {};
                  const immediateNonNumeric: Record<string, any> = {};
                  (unlockedDefs as any[]).forEach((def: any) => {
                    const name = def.name;
                    const randomizedObj = (randomized as any)[name];
                    const randomTarget = randomizedObj ? randomizedObj.value : (currentSelectedLayer.params as any)?.[name]?.value ?? def.value;
                    if (def.type === 'number') {
                      const metaMin = typeof def.min === 'number' ? def.min : 0;
                      const metaMax = typeof def.max === 'number' ? def.max : 1;
                      const currentVal: number = Number((currentSelectedLayer.params as any)?.[name]?.value ?? def.value);
                      targets[name] = Math.max(metaMin, Math.min(metaMax, Number(randomTarget)));
                      starts[name] = currentVal;
                    } else {
                      immediateNonNumeric[name] = { ...((currentSelectedLayer.params as any)[name] || {}), value: randomTarget };
                    }
                  });
                  const baseDuration = 2000;
                  const duration = baseDuration * smoothing;
                  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
                  let startTime: number | null = null;
                  const step = (ts: number) => {
                    if (startTime == null) startTime = ts;
                    const frameParams = { ...(currentSelectedLayer.params || {}), ...immediateNonNumeric } as Record<string, any>;
                    Object.keys(targets).forEach((name) => {
                      const from = starts[name];
                      const to = targets[name];
                      const elapsed = ts - startTime!;
                      const pLin = Math.max(0, Math.min(1, duration > 0 ? elapsed / duration : 1));
                      const p = easeInOut(pLin);
                      frameParams[name] = { ...(frameParams[name] || {}), value: from + (to - from) * p };
                    });
                    currentOnUpdateLayer(currentSelectedLayer.id, { params: frameParams });
                    if ((ts - startTime!) < duration) {
                      requestAnimationFrame(step);
                    }
                  };
                  requestAnimationFrame(step);
                } else {
                  const updatedParams = { ...(currentSelectedLayer.params || {}) } as Record<string, any>;
                  Object.entries(randomized).forEach(([n, obj]) => {
                    const def = (unlockedDefs as any[]).find((d: any) => d.name === n);
                    if (def && def.type === 'number') updatedParams[n] = { ...(updatedParams[n] || {}), value: (obj as any).value };
                    else updatedParams[n] = { ...(updatedParams[n] || {}), value: (obj as any).value };
                  });
                  currentOnUpdateLayer(currentSelectedLayer.id, { params: updatedParams });
                }
              }
            }
          }
        }
        return;
      }

      // Resolve to actual param key on the layer
      let actualParamName = targetName;
      const paramKeys = Object.keys((currentSelectedLayer.params || {}));
      if (!(currentSelectedLayer.params || {})[actualParamName]) {
        const norm = normalizeKey(targetName);
        const found = paramKeys.find((k) => normalizeKey(k) === norm);
        if (found) actualParamName = found;
      }
      if (!actualParamName) return;

      if (isRandomizeTarget) {
        // Rising edge trigger
        const prev = prevNormByMappingRef.current[mapping.id] ?? 0;
        prevNormByMappingRef.current[mapping.id] = normalizedLFO;
        const threshold = 0.9;
        if (prev <= threshold && normalizedLFO > threshold) {
          // Randomize this parameter
          const effectId: string | undefined = (currentSelectedLayer as any)?.asset?.id || (currentSelectedLayer as any)?.asset?.name;
          const isEffect = (currentSelectedLayer as any)?.type === 'effect' || (currentSelectedLayer as any)?.asset?.isEffect;
          if (isEffect && effectId) {
            const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
            const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
            const paramDef = metadata?.parameters?.find((p: any) => p?.name === actualParamName);
            if (paramDef) {
              const randomized = globalRandomize([paramDef], currentSelectedLayer.params);
              if (randomized && randomized[actualParamName]) {
                const updParams = { ...(currentSelectedLayer.params || {}) } as Record<string, any>;
                updParams[actualParamName] = { ...(updParams[actualParamName] || {}), value: (randomized as any)[actualParamName].value };
                currentOnUpdateLayer(currentSelectedLayer.id, { params: updParams });
                return;
              }
            }
          }
          // Fallback: random within mapping min/max scaled to layer param
          const val = minVal + Math.random() * (maxVal - minVal);
          const updParams2 = { ...(currentSelectedLayer.params || {}) } as Record<string, any>;
          updParams2[actualParamName] = { ...(updParams2[actualParamName] || {}), value: val };
          currentOnUpdateLayer(currentSelectedLayer.id, { params: updParams2 });
        }
        return; // Do not continuous-modulate when mapping is randomize
      }

      // Normal continuous modulation
      if (actualParamName === 'opacity') {
        const clampedValue = Math.max(0, Math.min(1, modulatedValue / 100));
        pendingOpacity = clampedValue;
        anyChanged = true;
      } else {
        const currentParams = pendingParams;
        // Allow creating numeric params even if not present yet by consulting metadata
        const paramDefMeta = metadata?.parameters?.find((p: any) => p?.name === actualParamName);
        let nextValue = modulatedValue;
        if (paramDefMeta) {
          const metaMin = typeof paramDefMeta.min === 'number' ? paramDefMeta.min : undefined;
          const metaMax = typeof paramDefMeta.max === 'number' ? paramDefMeta.max : undefined;
          if (typeof metaMin === 'number' && typeof metaMax === 'number') {
            nextValue = Math.max(metaMin, Math.min(metaMax, nextValue));
          }
        }
        pendingParams = {
          ...currentParams,
          [actualParamName]: {
            ...currentParams[actualParamName],
            value: nextValue,
          },
        };
        anyChanged = true;
      }

      const key = `${currentSelectedLayer.id}-${actualParamName}`;
      // Base value display uses metadata min/max defaults too for consistency
      let baseValueNum = 0;
      if (actualParamName === 'opacity') baseValueNum = (currentSelectedLayer.opacity || 1) * 100;
      else baseValueNum = isNumber((currentSelectedLayer.params || {})[actualParamName]?.value) ? Number((currentSelectedLayer.params as any)[actualParamName].value) : (typeof defaultMin === 'number' ? defaultMin : 0);
      setLFOModulatedValue(key, {
        layerId: currentSelectedLayer.id,
        parameterName: actualParamName,
        baseValue: baseValueNum,
        modulatedValue: modulatedValue,
        timestamp: now
      });
    });
    if (anyChanged) {
      const update: any = { params: pendingParams };
      if (typeof pendingOpacity === 'number') update.opacity = pendingOpacity;
      currentOnUpdateLayer(currentSelectedLayer.id, update);
    }
  }, []);

  // Waveform drawing and animation (same as before)...
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    for (let i = 0; i <= 8; i++) {
      const x = (width / 8) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.strokeStyle = 'hsl(var(--accent))';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const points = 400; // finer resolution for fast divisions like 1/64
    // Compute effective Hz from timing mode
    const clock = getClock();
    const bpm = (clock.smoothedBpm || clock.bpm || 120) as number;
    const timingMode = String(((lfo as any)?.lfoTimingMode || 'hz')).toLowerCase();
    const division = (lfo as any)?.lfoDivision || '1/4';
    const periodMs = timingMode === 'sync' ? parseDivisionToMs(bpm, division) : undefined;
    const effectiveHz = timingMode === 'sync'
      ? Math.max(0.01, 1000 / Math.max(0.001, periodMs || 1000))
      : Number((lfo as any)?.lfoHz || (lfo as any)?.rate || 1);
    const lfoStateAny: any = (lfo as any) || {};
    const minPctPrev = Math.max(0, Math.min(100, Number(lfoStateAny.lfoMin ?? 0)));
    const maxPctPrev = Math.max(0, Math.min(100, Number(lfoStateAny.lfoMax ?? 100)));
    const loPrev = Math.min(minPctPrev, maxPctPrev) / 100;
    const hiPrev = Math.max(minPctPrev, maxPctPrev) / 100;
    const amplitude = (height / 2 - 10);
    const offsetY = centerY;
    // Simple hash for deterministic preview noise 0..1
    const hash01 = (n: number) => {
      const s = Math.sin(n) * 43758.5453123;
      return s - Math.floor(s);
    };

    for (let i = 0; i <= points; i++) {
      const x = (width / points) * i;
      const t = (i / points) * 4 * Math.PI * effectiveHz;
      let y: number;
      const wf = (String((lfo as any)?.waveform || 'sine')).toLowerCase();
      if (wf === 'random') {
        const segments = Math.max(1, Math.round(8 * effectiveHz));
        const step = Math.floor((i / points) * segments);
        y = hash01(step + 1) * 2 - 1;
      } else if (wf === 'randomsmooth') {
        const segments = Math.max(1, Math.round(8 * effectiveHz));
        const pos = (i / points) * segments;
        const i0 = Math.floor(pos);
        const f = pos - i0;
        const y0 = hash01(i0 + 1) * 2 - 1;
        const y1 = hash01(i0 + 2) * 2 - 1;
        y = y0 + (y1 - y0) * f;
      } else {
        y = waveValue(t, String((lfo as any)?.waveform || 'sine'));
      }
      // Apply same shaping as runtime: map to [lo..hi] percent, then to [-1,1]
      const base01Prev = (y + 1) / 2;
      const shaped01Prev = loPrev + (hiPrev - loPrev) * base01Prev;
      const yShaped = shaped01Prev * 2 - 1;
      const plotY = offsetY - yShaped * amplitude;
      if (i === 0) ctx.moveTo(x, plotY); else ctx.lineTo(x, plotY);
    }
    ctx.stroke();
  };

  // LFO animation loop (UI preview only; runtime modulation handled by engine)
  useEffect(() => {
    const lid = selectedLayerRef.current?.id;
    const lfo = lid ? lfoStateByLayer[lid] : undefined;
    if (!lfo || lfo.mode !== 'lfo' || !transportPlaying) return;
    const animate = () => {
      const time = Date.now() * 0.001;
      // Compute effective rate (Hz) based on timing mode
      const clock = getClock();
      const bpm = (clock.smoothedBpm || clock.bpm || 120) as number;
      const timingMode = String(((lfo as any)?.lfoTimingMode || 'hz')).toLowerCase();
      const division = (lfo as any)?.lfoDivision || '1/4';
      const periodMs = timingMode === 'sync' ? parseDivisionToMs(bpm, division as any) : undefined;
      const effectiveHz = timingMode === 'sync'
        ? Math.max(0.01, 1000 / Math.max(0.001, periodMs || 1000))
        : Number((lfo as any)?.lfoHz || (lfo as any)?.rate || 1);
      let value = waveValue(time * effectiveHz * 2 * Math.PI, lfo.waveform || 'sine', time, effectiveHz);
      // Depth removed; raw waveform is used and then clamped by lfoMin/lfoMax
      // LFO shaping: amplitude is width of range (hi-lo) as percent; centered around 0
      const minPct = Math.max(0, Math.min(100, Number((lfo as any)?.lfoMin ?? 0)));
      const maxPct = Math.max(0, Math.min(100, Number((lfo as any)?.lfoMax ?? 100)));
      const loPct = Math.min(minPct, maxPct);
      const hiPct = Math.max(minPct, maxPct);
      const ampPct = Math.max(0, hiPct - loPct) / 100;   // 0..1
      value = value * ampPct;                             // keep centered, scale movement
      const skip = Math.random() * 100 < (Number((lfo as any)?.lfoSkipPercent || 0));
      // Runtime modulation is performed by LFOEngine; here we only render the preview
      drawWaveform();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [lfoStateByLayer, selectedLayer?.id, transportPlaying]);

  // Random generators are driven by LFOEngine; disable UI-side generators
  useEffect(() => {
    return;
  }, [lfoStateByLayer, transportPlaying, mappingsByLayer, selectedLayer?.id]);

  const addMappingHandler = () => {
    const newMapping: LFOMapping = {
      id: Date.now().toString(),
      parameter: 'Select Parameter',
      min: 0,
      max: 100,
      enabled: true
    };
    const lid = selectedLayerRef.current?.id;
    if (lid) addMappingForLayer(lid, newMapping);
  };

  const buildParameterOptions = (): { value: string; label: string }[] => {
    const options: { value: string; label: string }[] = [{ value: 'Select Parameter', label: 'Select Parameter' }];
    const layer = selectedLayerRef.current;
    if (!layer) return options;

    options.push({ value: 'Layer Opacity', label: 'Layer Opacity' });

    const effectId: string | undefined = (layer as any)?.asset?.id || (layer as any)?.asset?.name || (layer as any)?.asset?.effectId || (layer as any)?.asset?.effect?.id;
    const isEffect = (layer as any)?.type === 'effect' || (layer as any)?.asset?.isEffect;
    if (isEffect && effectId) {
      // Resolve effect component robustly so metadata is available before params exist
      const effectComponent = getEffectComponentSync(effectId) || getEffect(effectId) || null;
      const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
      if (metadata?.parameters && Array.isArray(metadata.parameters)) {
        // Global randomize-all entry
        options.push({ value: `${metadata.name || effectId} - ${RANDOMIZE_ALL}`, label: `Randomise Button` });
        metadata.parameters
          .filter((p: any) => p?.type === 'number')
          .forEach((p: any) => {
            const labelBase = `${metadata.name || 'Effect'} - ${p.description || humanize(p.name)}`;
            options.push({ value: `${metadata.name || effectId} - ${p.name}`, label: labelBase });
            options.push({ value: `${metadata.name || effectId} - ${p.name}${RANDOMIZE_SUFFIX}`, label: `${labelBase} (Randomize)` });
          });
        return options;
      }
    }

    const paramKeys = Object.keys((layer as any).params || {});
    paramKeys
      .filter((k) => isNumber(((layer as any).params || {})[k]?.value))
      .forEach((k) => {
        const labelBase = `${(layer as any).name || 'Layer'} - ${humanize(k)}`;
        options.push({ value: `${(layer as any).name || 'Layer'} - ${k}`, label: labelBase });
        options.push({ value: `${(layer as any).name || 'Layer'} - ${k}${RANDOMIZE_SUFFIX}`, label: `${labelBase} (Randomize)` });
      });

    return options;
  };

  const lid = selectedLayer?.id;
  const lfo = lid ? (lfoStateByLayer[lid] || ({} as any)) : ({} as any);
  const mappings = lid ? (mappingsByLayer[lid] || []) : [];

  return (
    <div className="ableton-lfo">
      <Tabs value={activeTab}>
        <TabsList>
          <TabsTrigger value="lfo">LFO</TabsTrigger>
        </TabsList>

        <TabsContent value="lfo">
      <div className="lfo-content-wrapper">
        <div className="lfo-main">
          <div className="waveform-section">
                <canvas ref={canvasRef} width={300} height={120} className="waveform-canvas" />
              </div>
              <div className="lfo-parameters tw-space-y-3">
                <div className="tw-flex tw-items-center tw-gap-2">
                  <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-[180px]">Waveform</label>
                  <div className="tw-w-[240px]">
                    <Select
                      value={(lfo.waveform as any) || 'sine'}
                      onChange={(v) => lid && setLFOForLayer(lid, { waveform: String(v) })}
                      options={[
                        { value: 'sine', label: 'Sine' },
                        { value: 'triangle', label: 'Triangle' },
                        { value: 'square', label: 'Square' },
                        { value: 'sawup', label: 'Saw Up' },
                        { value: 'sawdown', label: 'Saw Down' },
                        { value: 'random', label: 'Random (S&H)' },
                        { value: 'randomsmooth', label: 'Random (Smooth)' },
                      ]}
                    />
                  </div>
                </div>
                <div className="tw-flex tw-items-center tw-gap-2">
                  <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-[180px]">Timing</label>
                  <div className="tw-w-[240px] tw-flex tw-gap-2">
                    <button
                      className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${ ((lfo.lfoTimingMode as any) || 'hz') === 'sync' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200' }`}
                      onClick={() => lid && setLFOForLayer(lid, { lfoTimingMode: 'sync' })}
                    >
                      Sync
                    </button>
                    <button
                      className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${ ((lfo.lfoTimingMode as any) || 'hz') === 'hz' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200' }`}
                      onClick={() => lid && setLFOForLayer(lid, { lfoTimingMode: 'hz' })}
                    >
                      Hz
                    </button>
                  </div>
                </div>
                {(((lfo.lfoTimingMode as any) || 'hz') as string) === 'sync' ? (
                  <div className="param-row">
                    {(() => {
                      const allowedDivisions = ['1/64', '1/32', '1/16', '1/8', '1/4', '1/2', '1', '2', '4', '8', '16', '32'];
                      const normDiv = normalizeDivision((lfo.lfoDivision as any));
                      const currentIndex = Number.isFinite(lfo.lfoDivisionIndex as any) && (lfo.lfoDivisionIndex as any) != null
                        ? Math.max(0, Math.min(allowedDivisions.length - 1, Math.round(Number(lfo.lfoDivisionIndex as any))))
                        : Math.max(0, allowedDivisions.indexOf(normDiv));
                      const setByIndex = (idx: number) => {
                        const clamped = Math.max(0, Math.min(allowedDivisions.length - 1, Math.round(idx)));
                        const division = allowedDivisions[clamped];
                        if (lid) setLFOForLayer(lid, { lfoDivision: division as any, lfoDivisionIndex: clamped as any });
                      };
                      return (
                        <ParamRow
                          label="Division"
                          value={currentIndex}
                          min={0}
                          max={allowedDivisions.length - 1}
                          step={1}
                          onChange={setByIndex}
                          onIncrement={() => setByIndex(currentIndex + 1)}
                          onDecrement={() => setByIndex(currentIndex - 1)}
                          valueDisplay={allowedDivisions[currentIndex]}
                        />
                      );
                    })()}
                  </div>
                ) : (
                  <div className="param-row">
                    <ParamRow
                      label="Hz"
                      value={Number((lfo.lfoHz as any) || Number(lfo.rate || 1))}
                      min={0.01}
                      max={20}
                      step={0.01}
                      onChange={(value) => lid && setLFOForLayer(lid, { lfoHz: value, rate: value })}
                      onIncrement={() => lid && setLFOForLayer(lid, { lfoHz: Math.min(20, Number((lfo.lfoHz as any) || Number(lfo.rate || 1)) + 0.01), rate: Math.min(20, Number((lfo.lfoHz as any) || Number(lfo.rate || 1)) + 0.01) })}
                      onDecrement={() => lid && setLFOForLayer(lid, { lfoHz: Math.max(0.01, Number((lfo.lfoHz as any) || Number(lfo.rate || 1)) - 0.01), rate: Math.max(0.01, Number((lfo.lfoHz as any) || Number(lfo.rate || 1)) - 0.01) })}
                    />
                  </div>
                )}
                <div className="param-row">
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-[180px]">Range</label>
                    <div className="tw-flex-1 tw-flex tw-items-center tw-gap-3">
                      <div className="tw-w-[240px]">
                        <Slider
                          value={[toNumberOr(Number((lfo.lfoMin as any) ?? 0), 0), toNumberOr(Number((lfo.lfoMax as any) ?? 100), 100)]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(vals: number[]) => {
                            const a = Array.isArray(vals) ? vals[0] : toNumberOr(Number((lfo.lfoMin as any) ?? 0), 0);
                            const b = Array.isArray(vals) ? vals[1] : toNumberOr(Number((lfo.lfoMax as any) ?? 100), 100);
                            const lo = Math.max(0, Math.min(100, Math.min(a, b)));
                            const hi = Math.max(0, Math.min(100, Math.max(a, b)));
                            if (lid) setLFOForLayer(lid, { lfoMin: lo, lfoMax: hi });
                          }}
                        />
                      </div>
                      <div className="tw-text-xs tw-text-neutral-400">{toNumberOr(Number((lfo.lfoMin as any) ?? 0), 0)}% / {toNumberOr(Number((lfo.lfoMax as any) ?? 100), 100)}%</div>
                    </div>
                  </div>
                </div>
                <div className="param-row">
                  <ParamRow label="Skip %" value={toNumberOr(Number((lfo.lfoSkipPercent as any) ?? 0), 0)} min={0} max={100} step={1}
                    onChange={(value) => lid && setLFOForLayer(lid, { lfoSkipPercent: value })}
                    onIncrement={() => lid && setLFOForLayer(lid, { lfoSkipPercent: Math.min(100, toNumberOr(Number((lfo.lfoSkipPercent as any) ?? 0), 0) + 1) })}
                    onDecrement={() => lid && setLFOForLayer(lid, { lfoSkipPercent: Math.max(0, toNumberOr(Number((lfo.lfoSkipPercent as any) ?? 0), 0) - 1) })}
                  />
                </div>
                
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Mappings section retained */}
      <div className="tw-space-y-2 tw-mt-3">
            <div className="tw-flex tw-items-center tw-justify-between">
              <h4 className="tw-text-sm tw-font-semibold tw-text-white">Parameter Mappings</h4>
              <button className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-2 tw-py-1 hover:tw-bg-neutral-700" onClick={addMappingHandler}>
                + Map
              </button>
            </div>
        {/* existing mappings list preserved */}
            <div className="tw-space-y-2">
              {mappings.length === 0 ? (
                <div className="tw-text-sm tw-text-neutral-400">No parameters mapped. Click '+ Map' to start modulating parameters.</div>
                ) : (
                mappings.map(mapping => (
                  <div key={mapping.id} className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2">
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                      <div className="tw-min-w-[240px]">
                        <Select 
                          value={mapping.parameter as any}
                          onChange={(v) => {
                            const lid = selectedLayerRef.current?.id;
                            const newParam = String(v);
                            if (!lid) return;
                            // Initialize mapping min/max from metadata for numeric params (or opacity)
                            try {
                              const layer = selectedLayerRef.current as any;
                              const effectId: string | undefined = layer?.asset?.id || layer?.asset?.name;
                              const isEffect = layer?.type === 'effect' || layer?.asset?.isEffect;
                              const parts = newParam.split(' - ');
                              const rawName = parts.length > 1 ? parts[1] : (parts[0].toLowerCase().includes('opacity') ? 'opacity' : undefined);
                              if (rawName === 'opacity') {
                                updateMappingForLayer(lid, mapping.id, { parameter: newParam, min: 0, max: 100 });
                              } else if (isEffect && effectId && rawName) {
                                const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
                                const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
                                const def = metadata?.parameters?.find((p: any) => p?.name === rawName);
                                if (def && def.type === 'number') {
                                  const defMin = typeof def.min === 'number' ? def.min : 0;
                                  const defMax = typeof def.max === 'number' ? def.max : 100;
                                  updateMappingForLayer(lid, mapping.id, { parameter: newParam, min: defMin, max: defMax });
                                } else {
                                  updateMappingForLayer(lid, mapping.id, { parameter: newParam });
                                }
                              } else {
                                updateMappingForLayer(lid, mapping.id, { parameter: newParam });
                              }
                            } catch {
                              updateMappingForLayer(lid, mapping.id, { parameter: newParam });
                            }
                          }}
                          options={buildParameterOptions()}
                        />
                      </div>
                      <div className="tw-flex tw-items-center tw-gap-2">
                        <label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-neutral-200" htmlFor={`map-enabled-${mapping.id}`}>
                          <Switch
                            id={`map-enabled-${mapping.id}`}
                            checked={mapping.enabled === true}
                            onCheckedChange={(checked) => {
                              const lid = selectedLayerRef.current?.id;
                              if (lid) updateMappingForLayer(lid, mapping.id, { enabled: checked === true });
                            }}
                            aria-label="Enable mapping"
                          />
                          Enabled
                        </label>
                        <button 
                          className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-700 tw-w-6 tw-h-6 hover:tw-bg-neutral-800"
                          onClick={() => {
                            const lid = selectedLayerRef.current?.id;
                            if (lid) removeMappingForLayer(lid, mapping.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {/* Min/Max controls removed per design; mapping uses parameter metadata bounds */}
                  </div>
                ))
              )}
        </div>
      </div>
    </div>
  );
};

