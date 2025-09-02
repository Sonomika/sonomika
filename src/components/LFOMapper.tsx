import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useStore } from '../store/store';
import { Layer } from '../store/types';
import { useLFOStore, type LFOMapping } from '../store/lfoStore';
import { ParamRow, Select, Tabs, TabsList, TabsTrigger, TabsContent, Checkbox } from './ui';
import { getClock } from '../engine/Clock';
import { getEffect } from '../utils/effectRegistry';
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
  const [activeTab, setActiveTab] = useState<'lfo' | 'random'>('random');
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
    if (currentMode && currentMode !== activeTab) {
      setActiveTab(currentMode as 'lfo' | 'random');
    }
    // Only depend on the computed mode to avoid re-running on unrelated per-layer state updates (e.g., currentValue)
  }, [currentMode, activeTab]);

  // Refs to avoid dependencies
  const selectedLayerRef = useRef(selectedLayer);
  const mappingsRef = useRef(mappingsByLayer[selectedLayer?.id || ''] || []);
  const onUpdateLayerRef = useRef(onUpdateLayer);
  const prevNormByMappingRef = useRef<Record<string, number>>({});

  useEffect(() => { selectedLayerRef.current = selectedLayer; }, [selectedLayer]);
  useEffect(() => {
    const lid = selectedLayerRef.current?.id;
    mappingsRef.current = lid ? (mappingsByLayer[lid] || []) : [];
  }, [mappingsByLayer, selectedLayer?.id]);
  useEffect(() => { onUpdateLayerRef.current = onUpdateLayer; }, [onUpdateLayer]);

  // Initialize newly selected layers with Random mode defaults so UI opens on Random
  useEffect(() => {
    const lid = selectedLayer?.id;
    if (!lid) return;
    const existing = lfoStateByLayer[lid];
    if (!existing) {
      setLFOForLayer(lid, { mode: 'random', randomTimingMode: 'sync', randomDivision: '1/8', randomDivisionIndex: 2 } as any);
      setActiveTab('random');
    }
  }, [selectedLayer?.id, lfoStateByLayer, setLFOForLayer]);

  const lastUpdateTime = useRef(0);
  const updateThrottleMs = 50;

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

  // Parse musical division strings like "1/4", "1/8.", "1/8T" to an interval in ms
  const parseDivisionToMs = (bpm: number, division: string | undefined): number => {
    const div = (division || '1/4').trim();
    const dotted = div.endsWith('.') || div.endsWith('d');
    const triplet = /t$/i.test(div);
    const core = div.replace(/[.d]|t$/i, '');
    const match = core.match(/^\s*1\s*\/\s*(\d+)\s*$/);
    const denom = match ? Math.max(1, parseInt(match[1], 10)) : 4;
    const quarterMs = (60 / Math.max(1, bpm)) * 1000;
    // duration in quarter notes is 4/denom
    let ms = quarterMs * (4 / denom);
    if (dotted) ms *= 1.5;
    if (triplet) ms *= 2 / 3;
    return ms;
  };

  const normalizeDivision = (division: string | undefined): string => {
    const allowedDenoms = [2, 4, 8, 16, 32, 64];
    const m = String(division || '1/4').match(/\d+/);
    const d = m ? Number(m[0]) : 4;
    if (allowedDenoms.includes(d)) return `1/${d}`;
    // pick nearest allowed denominator
    let best = 4;
    let bestDiff = Infinity;
    for (const a of allowedDenoms) {
      const diff = Math.abs(a - d);
      if (diff < bestDiff) { bestDiff = diff; best = a; }
    }
    return `1/${best}`;
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

    currentMappings.forEach(mapping => {
      if (!mapping.enabled || mapping.parameter === 'Select Parameter') return;

      const minVal = Number.isFinite(Number(mapping.min)) ? Number(mapping.min) : 0;
      const maxVal = Number.isFinite(Number(mapping.max)) ? Number(mapping.max) : 100;
      const range = maxVal - minVal;
      const normalizedLFO = (currentValue + 1) / 2;
      const modulatedValue = minVal + (range * normalizedLFO);

      const parts = mapping.parameter.split(' - ');
      const rawName = parts.length > 1 ? parts[1] : (parts[0].toLowerCase().includes('opacity') ? 'opacity' : undefined);
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
        const currentVal = currentParams[actualParamName]?.value;
        if (!isNumber(currentVal)) {
          // If param exists but is non-number, skip
        } else {
          pendingParams = { 
            ...currentParams, 
            [actualParamName]: { 
              ...currentParams[actualParamName], 
              value: modulatedValue 
            } 
          };
          anyChanged = true;
        }
      }

      const key = `${currentSelectedLayer.id}-${actualParamName}`;
      const baseValueNum = actualParamName === 'opacity'
        ? (currentSelectedLayer.opacity || 1) * 100
        : (isNumber((currentSelectedLayer.params || {})[actualParamName]?.value) ? Number((currentSelectedLayer.params as any)[actualParamName].value) : 0);
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
    const points = 200;
    // Compute effective Hz from timing mode
    const clock = getClock();
    const bpm = (clock.smoothedBpm || clock.bpm || 120) as number;
    const timingMode = String(((lfo as any)?.lfoTimingMode || 'hz')).toLowerCase();
    const division = (lfo as any)?.lfoDivision || '1/4';
    const periodMs = timingMode === 'sync' ? parseDivisionToMs(bpm, division) : undefined;
    const effectiveHz = timingMode === 'sync' ? Math.max(0.01, 1000 / Math.max(1, periodMs || 1000)) : Number((lfo as any)?.lfoHz || (lfo as any)?.rate || 1);
    const amplitude = (Number((lfo as any)?.depth || 100) / 100) * (height / 2 - 10);
    const offsetY = centerY + (Number((lfo as any)?.offset || 0) / 100) * (height / 2 - 10);
    // Simple hash for deterministic preview noise 0..1
    const hash01 = (n: number) => {
      const s = Math.sin(n) * 43758.5453123;
      return s - Math.floor(s);
    };

    for (let i = 0; i <= points; i++) {
      const x = (width / points) * i;
      const t = (i / points) * 4 * Math.PI * effectiveHz + (Number((lfo as any)?.phase || 0) / 100) * 2 * Math.PI;
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
      const plotY = offsetY - y * amplitude;
      if (i === 0) ctx.moveTo(x, plotY); else ctx.lineTo(x, plotY);
    }
    ctx.stroke();
  };

  // LFO animation loop (only when per-layer mode === 'lfo' and transport is playing)
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
      const effectiveHz = timingMode === 'sync' ? Math.max(0.01, 1000 / Math.max(1, periodMs || 1000)) : Number((lfo as any)?.lfoHz || (lfo as any)?.rate || 1);
      let value = waveValue(time * effectiveHz * 2 * Math.PI + (lfo.phase || 0) * 0.01 * 2 * Math.PI, lfo.waveform || 'sine', time, effectiveHz);
      value = value * ((lfo.depth || 100) / 100) + ((lfo.offset || 0) / 100);
      value = Math.max(-1, Math.min(1, value));
      // Apply modulation to the currently selected layer (timeline or column) at ~rAF cadence
      applyLFOModulation(value);
      drawWaveform();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [lfoStateByLayer, selectedLayer?.id, transportPlaying]);

  // Random generators: run for all layers in random mode, independent of selection
  useEffect(() => {
    if (!transportPlaying) return;
    const clock = getClock();
    const timers: Record<string, number> = {};

    const isLayerInActiveColumn = (lid: string) => {
      try {
        const state = (useStore as any).getState();
        const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
        const col = scene?.columns?.find((c: any) => c.id === state.playingColumnId);
        return Boolean(col?.layers?.some((ly: any) => ly?.id === lid));
      } catch { return false; }
    };

    const fireRandomForLayer = (layerId: string, lfoState: any) => {
      // Gate: only update if this layer is in the currently playing column
      if (!isLayerInActiveColumn(layerId)) return;

      // Skip based on percentage
      const skip = Math.random() * 100 < (Number(lfoState.skipPercent || 0));
      if (skip) return;

      // Generate value in -1..1 from randomMin/Max scaled -100..100
      const min = Math.min(Number(lfoState.randomMin || -100), Number(lfoState.randomMax || 100)) / 100;
      const max = Math.max(Number(lfoState.randomMin || -100), Number(lfoState.randomMax || 100)) / 100;
      const rand = min + Math.random() * (max - min);
      const clamped = Math.max(-1, Math.min(1, rand));

      const state = (useStore as any).getState();
      const scene = state.scenes?.find((s: any) => s.id === state.currentSceneId);
      const col = scene?.columns?.find((c: any) => c.id === state.playingColumnId);
      const layer = col?.layers?.find((ly: any) => ly?.id === layerId);
      if (!layer) return;

      const updateLayer = onUpdateLayerRef.current;
      const mps = (mappingsByLayer as any)[layerId] || [];

      // Check if we have any enabled randomize mappings
      const hasRandomizeMappings = mps.some((mapping: any) => {
        if (!mapping.enabled || mapping.parameter === 'Select Parameter') return false;
        const parts = mapping.parameter.split(' - ');
        const rawName = parts.length > 1 ? parts[1] : undefined;
        return rawName && (rawName === RANDOMIZE_ALL || rawName.endsWith(RANDOMIZE_SUFFIX));
      });

      // Apply continuous modulation only for the currently selected layer and only when
      // there are no randomize mappings to avoid conflicts
      if (!hasRandomizeMappings && selectedLayerRef.current?.id === layerId) {
        applyLFOModulation(clamped);
      }

      const effectId: string | undefined = (layer as any)?.asset?.id || (layer as any)?.asset?.name;
      const isEffect = (layer as any)?.type === 'effect' || (layer as any)?.asset?.isEffect;
      const effectComponent = isEffect && effectId ? (getEffect(effectId) || getEffect(`${effectId}Effect`) || null) : null;
      const metadata: any = effectComponent ? (effectComponent as any).metadata : null;

      mps.forEach((mapping: any) => {
        if (!mapping.enabled || mapping.parameter === 'Select Parameter') return;
        const parts = mapping.parameter.split(' - ');
        const rawName = parts.length > 1 ? parts[1] : undefined;
        if (!rawName) return;

        // Global randomize-all
        if (rawName === RANDOMIZE_ALL) {
          if (metadata?.parameters) {
            const unlockedDefs = (metadata.parameters as any[]).filter((p: any) => !(layer.params as any)?.[p.name]?.locked);
            const randomized = globalRandomize(unlockedDefs, layer.params);
            if (randomized && Object.keys(randomized).length > 0) {
              const gs: any = (window as any).__vj_rand_smoothing;
              const smoothing = Math.max(0, Math.min(1, typeof gs === 'number' && Number.isFinite(gs) ? gs : 0.1));
              if (smoothing > 0) {
                const targets: Record<string, number> = {};
                const starts: Record<string, number> = {};
                const immediateNonNumeric: Record<string, any> = {};
                (unlockedDefs as any[]).forEach((def: any) => {
                  const name = def.name;
                  const randomizedObj = (randomized as any)[name];
                  const randomTarget = randomizedObj ? randomizedObj.value : (layer.params as any)?.[name]?.value ?? def.value;
                  if (def.type === 'number') {
                    const metaMin = typeof def.min === 'number' ? def.min : 0;
                    const metaMax = typeof def.max === 'number' ? def.max : 1;
                    const currentVal: number = Number((layer.params as any)?.[name]?.value ?? def.value);
                    targets[name] = Math.max(metaMin, Math.min(metaMax, Number(randomTarget)));
                    starts[name] = currentVal;
                  } else {
                    immediateNonNumeric[name] = { ...((layer.params as any)[name] || {}), value: randomTarget };
                  }
                });
                const baseDuration = 2000;
                const duration = baseDuration * smoothing;
                const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
                let startTime: number | null = null;
                const step = (ts: number) => {
                  if (startTime == null) startTime = ts;
                  const frameParams = { ...(layer.params || {}), ...immediateNonNumeric } as Record<string, any>;
                  Object.keys(targets).forEach((name) => {
                    const from = starts[name];
                    const to = targets[name];
                    const elapsed = ts - startTime!;
                    const pLin = Math.max(0, Math.min(1, duration > 0 ? elapsed / duration : 1));
                    const p = easeInOut(pLin);
                    frameParams[name] = { ...(frameParams[name] || {}), value: from + (to - from) * p };
                  });
                  updateLayer(layer.id, { params: frameParams });
                  if ((ts - startTime!) < duration) {
                    requestAnimationFrame(step);
                  }
                };
                requestAnimationFrame(step);
              } else {
                const updatedParams = { ...(layer.params || {}) } as Record<string, any>;
                Object.entries(randomized).forEach(([n, obj]) => {
                  updatedParams[n] = { ...(updatedParams[n] || {}), value: (obj as any).value };
                });
                updateLayer(layer.id, { params: updatedParams });
              }
            }
          }
          return;
        }

        // Per-parameter randomize
        const isRandomizeTarget = rawName.endsWith(RANDOMIZE_SUFFIX);
        if (isRandomizeTarget) {
          const targetName = rawName.slice(0, -RANDOMIZE_SUFFIX.length);
          let actualParamName = targetName;
          const paramKeys = Object.keys((layer.params || {}));
          if (!(layer.params || {})[actualParamName]) {
            const norm = normalizeKey(targetName);
            const found = paramKeys.find((k) => normalizeKey(k) === norm);
            if (found) actualParamName = found;
          }
          if (!actualParamName) return;

          if (metadata?.parameters) {
            const paramDef = (metadata.parameters as any[]).find((p: any) => p?.name === actualParamName);
            if (paramDef) {
              const randomized = globalRandomize([paramDef], layer.params);
              if (randomized && randomized[actualParamName]) {
                const gs: any = (window as any).__vj_rand_smoothing;
                const smoothing = Math.max(0, Math.min(1, typeof gs === 'number' && Number.isFinite(gs) ? gs : 0.1));
                if (smoothing > 0 && paramDef.type === 'number') {
                  const baseDuration = 2000;
                  const duration = baseDuration * smoothing;
                  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
                  const start = Number((layer.params as any)?.[actualParamName]?.value ?? paramDef.value);
                  const target = Number((randomized as any)[actualParamName].value);
                  let startTime: number | null = null;
                  const step = (ts: number) => {
                    if (startTime == null) startTime = ts;
                    const pLin = Math.max(0, Math.min(1, duration > 0 ? (ts - startTime) / duration : 1));
                    const p = easeInOut(pLin);
                    const v = start + (target - start) * p;
                    const updatedParams = { ...(layer.params || {}) } as Record<string, any>;
                    updatedParams[actualParamName] = { ...(updatedParams[actualParamName] || {}), value: v };
                    updateLayer(layer.id, { params: updatedParams });
                    if ((ts - startTime) < duration) requestAnimationFrame(step);
                  };
                  requestAnimationFrame(step);
                } else {
                  const updatedParams = { ...(layer.params || {}) } as Record<string, any>;
                  updatedParams[actualParamName] = { ...(updatedParams[actualParamName] || {}), value: (randomized as any)[actualParamName].value };
                  updateLayer(layer.id, { params: updatedParams });
                }
              }
            }
          }
        }
      });
    };

    // Create random generators for all layers with random mode enabled
    Object.entries(lfoStateByLayer).forEach(([layerId, lfoState]) => {
      if (!lfoState || (lfoState as any).mode !== 'random') return;

      if ((((lfoState as any).randomTimingMode) || 'sync') === 'sync') {
        let currentBpm = (clock.smoothedBpm || clock.bpm || 120) as number;
        const restart = () => {
          if (timers[layerId]) clearInterval(timers[layerId]);
          const ms = parseDivisionToMs(currentBpm, ((lfoState as any).randomDivision as any) || '1/4');
          timers[layerId] = window.setInterval(() => fireRandomForLayer(layerId, lfoState), ms);
        };
        const onBeatOrBpm = () => { currentBpm = (clock.smoothedBpm || clock.bpm || 120) as number; restart(); };
        try { clock.onBpmChangeListener(() => onBeatOrBpm()); } catch {}
        try { clock.onNewBeatListener(() => onBeatOrBpm()); } catch {}
        restart();
      } else {
        const hz = Math.max(0.1, Math.min(20, Number((((lfoState as any).randomHz) as any) || 2)));
        const intervalMs = 1000 / hz;
        timers[layerId] = window.setInterval(() => fireRandomForLayer(layerId, lfoState), intervalMs);
      }
    });

    return () => {
      Object.values(timers).forEach((t) => clearInterval(t));
      try { clock.onBpmChangeListener(undefined); } catch {}
      try { clock.onNewBeatListener(undefined); } catch {}
    };
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

    const effectId: string | undefined = (layer as any)?.asset?.id || (layer as any)?.asset?.name;
    const isEffect = (layer as any)?.type === 'effect' || (layer as any)?.asset?.isEffect;
    if (isEffect && effectId) {
      const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
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

      <Tabs value={activeTab} onValueChange={(v) => {
        setActiveTab(v as 'lfo' | 'random');
        const lid2 = selectedLayerRef.current?.id;
        if (lid2) setLFOForLayer(lid2, { mode: v as any });
      }}>
        <TabsList>
          <TabsTrigger value="random">Random</TabsTrigger>
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
                      const allowedDenoms = [2, 4, 8, 16, 32, 64];
                      const normDiv = normalizeDivision((lfo.lfoDivision as any));
                      const currentDenom = Number(normDiv?.match(/\d+/)?.[0] || 4);
                      const currentIndex = Number.isFinite(lfo.lfoDivisionIndex as any) && (lfo.lfoDivisionIndex as any) != null
                        ? Math.max(0, Math.min(allowedDenoms.length - 1, Math.round(Number(lfo.lfoDivisionIndex as any))))
                        : Math.max(0, allowedDenoms.indexOf(currentDenom));
                      const setByIndex = (idx: number) => {
                        const clamped = Math.max(0, Math.min(allowedDenoms.length - 1, Math.round(idx)));
                        const denom = allowedDenoms[clamped];
                        if (lid) setLFOForLayer(lid, { lfoDivision: `1/${denom}` as any, lfoDivisionIndex: clamped as any });
                      };
                      return (
                        <ParamRow
                          label="Division"
                          value={currentIndex}
                          min={0}
                          max={allowedDenoms.length - 1}
                          step={1}
                          onChange={setByIndex}
                          onIncrement={() => setByIndex(currentIndex + 1)}
                          onDecrement={() => setByIndex(currentIndex - 1)}
                          valueDisplay={`1/${allowedDenoms[currentIndex]}`}
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
                  <ParamRow label="Depth" value={Number(lfo.depth || 100)} min={0} max={100} step={1} buttonsAfter
                    onChange={(value) => lid && setLFOForLayer(lid, { depth: value })}
                    onIncrement={() => lid && setLFOForLayer(lid, { depth: Math.min(100, Number(lfo.depth || 100) + 1) })}
                    onDecrement={() => lid && setLFOForLayer(lid, { depth: Math.max(0, Number(lfo.depth || 100) - 1) })}
                  />
                </div>
            <div className="param-row">
                  <ParamRow label="Depth" value={Number(lfo.depth || 100)} min={0} max={100} step={1} buttonsAfter
                onChange={(value) => lid && setLFOForLayer(lid, { depth: value })}
                onIncrement={() => lid && setLFOForLayer(lid, { depth: Math.min(100, Number(lfo.depth || 100) + 1) })}
                onDecrement={() => lid && setLFOForLayer(lid, { depth: Math.max(0, Number(lfo.depth || 100) - 1) })}
              />
            </div>
            <div className="param-row">
                  <ParamRow label="Offset" value={Number(lfo.offset || 0)} min={-100} max={100} step={1} buttonsAfter
                onChange={(value) => lid && setLFOForLayer(lid, { offset: value })}
                onIncrement={() => lid && setLFOForLayer(lid, { offset: Math.min(100, Number(lfo.offset || 0) + 1) })}
                onDecrement={() => lid && setLFOForLayer(lid, { offset: Math.max(-100, Number(lfo.offset || 0) - 1) })}
              />
            </div>
            <div className="param-row">
                  <ParamRow label="Phase" value={Number(lfo.phase || 0)} min={0} max={100} step={1} buttonsAfter
                onChange={(value) => lid && setLFOForLayer(lid, { phase: value })}
                onIncrement={() => lid && setLFOForLayer(lid, { phase: Math.min(100, Number(lfo.phase || 0) + 1) })}
                onDecrement={() => lid && setLFOForLayer(lid, { phase: Math.max(0, Number(lfo.phase || 0) - 1) })}
              />
            </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="random">
          <div className="lfo-content-wrapper">
            <div className="lfo-main">
              <div className="lfo-parameters tw-space-y-3">
                <div className="tw-flex tw-items-center tw-gap-2">
                  <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-[180px]">Timing</label>
                  <div className="tw-w-[240px] tw-flex tw-gap-2">
                    <button
                      className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${ ((lfo.randomTimingMode as any) || 'sync') === 'sync' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200' }`}
                      onClick={() => lid && setLFOForLayer(lid, { randomTimingMode: 'sync' })}
                    >
                      Sync
                    </button>
                    <button
                      className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${ ((lfo.randomTimingMode as any) || 'sync') === 'hz' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200' }`}
                      onClick={() => lid && setLFOForLayer(lid, { randomTimingMode: 'hz' })}
                    >
                      Hz
                    </button>
                  </div>
                </div>
                {(((lfo.randomTimingMode as any) || 'sync') as string) === 'sync' ? (
            <div className="param-row">
                    {(() => {
                      const allowedDenoms = [2, 4, 8, 16, 32, 64];
                      const normDiv = normalizeDivision((lfo.randomDivision as any));
                      const currentDenom = Number(normDiv.match(/\d+/)?.[0] || 4);
                      const currentIndex = Number.isFinite(lfo.randomDivisionIndex as any) && (lfo.randomDivisionIndex as any) != null
                        ? Math.max(0, Math.min(allowedDenoms.length - 1, Math.round(Number(lfo.randomDivisionIndex as any))))
                        : Math.max(0, allowedDenoms.indexOf(currentDenom));
                      const setByIndex = (idx: number) => {
                        const clamped = Math.max(0, Math.min(allowedDenoms.length - 1, Math.round(idx)));
                        const denom = allowedDenoms[clamped];
                        if (lid) setLFOForLayer(lid, { randomDivision: `1/${denom}` as any, randomDivisionIndex: clamped as any });
                      };
                      return (
              <ParamRow
                          label="Division"
                          value={currentIndex}
                min={0}
                          max={allowedDenoms.length - 1}
                step={1}
                          onChange={setByIndex}
                          onIncrement={() => setByIndex(currentIndex + 1)}
                          onDecrement={() => setByIndex(currentIndex - 1)}
                          valueDisplay={`1/${allowedDenoms[currentIndex]}`}
                        />
                      );
                    })()}
            </div>
                ) : (
            <div className="param-row">
              <ParamRow
                      label="Hz"
                      value={Number((lfo.randomHz as any) || 2)}
                      min={0.1}
                      max={20}
                      step={0.01}
                      onChange={(value) => lid && setLFOForLayer(lid, { randomHz: value })}
                      onIncrement={() => lid && setLFOForLayer(lid, { randomHz: Math.min(20, Number((lfo.randomHz as any) || 2) + 0.01) })}
                      onDecrement={() => lid && setLFOForLayer(lid, { randomHz: Math.max(0.1, Number((lfo.randomHz as any) || 2) - 0.01) })}
                    />
                  </div>
                )}
                <div className="param-row">
                  <ParamRow label="Min" value={toNumberOr(Number((lfo.randomMin as any) ?? -100), -100)} min={-100} max={100} step={1}
                    onChange={(value) => lid && setLFOForLayer(lid, { randomMin: value })}
                    onIncrement={() => lid && setLFOForLayer(lid, { randomMin: Math.min(100, toNumberOr(Number((lfo.randomMin as any) ?? -100), -100) + 1) })}
                    onDecrement={() => lid && setLFOForLayer(lid, { randomMin: Math.max(-100, toNumberOr(Number((lfo.randomMin as any) ?? -100), -100) - 1) })}
                  />
                </div>
            <div className="param-row">
                  <ParamRow label="Max" value={toNumberOr(Number((lfo.randomMax as any) ?? 100), 100)} min={-100} max={100} step={1}
                    onChange={(value) => lid && setLFOForLayer(lid, { randomMax: value })}
                    onIncrement={() => lid && setLFOForLayer(lid, { randomMax: Math.min(100, toNumberOr(Number((lfo.randomMax as any) ?? 100), 100) + 1) })}
                    onDecrement={() => lid && setLFOForLayer(lid, { randomMax: Math.max(-100, toNumberOr(Number((lfo.randomMax as any) ?? 100), 100) - 1) })}
              />
            </div>
            <div className="param-row">
                  <ParamRow label="Skip %" value={toNumberOr(Number((lfo.skipPercent as any) ?? 0), 0)} min={0} max={100} step={1}
                    onChange={(value) => lid && setLFOForLayer(lid, { skipPercent: value })}
                    onIncrement={() => lid && setLFOForLayer(lid, { skipPercent: Math.min(100, toNumberOr(Number((lfo.skipPercent as any) ?? 0), 0) + 1) })}
                    onDecrement={() => lid && setLFOForLayer(lid, { skipPercent: Math.max(0, toNumberOr(Number((lfo.skipPercent as any) ?? 0), 0) - 1) })}
                  />
                </div>
                <div className="tw-text-neutral-400 tw-text-xs">
                  Random triggers on each beat (BPM-synced). Skip % reduces how often a new random value fires.
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
                            if (lid) updateMappingForLayer(lid, mapping.id, { parameter: String(v) });
                          }}
                          options={buildParameterOptions()}
                        />
                      </div>
                      <div className="tw-flex tw-items-center tw-gap-2">
                        <label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-neutral-200">
                          <Checkbox
                            checked={mapping.enabled}
                            onCheckedChange={(checked) => {
                              const lid = selectedLayerRef.current?.id;
                              if (lid) updateMappingForLayer(lid, mapping.id, { enabled: Boolean(checked) });
                            }}
                            className="tw-bg-neutral-800 tw-border tw-border-neutral-500 data-[state=checked]:tw-bg-neutral-200 data-[state=checked]:tw-text-neutral-900"
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
                    <div className="tw-flex tw-items-center tw-gap-2 tw-mt-2">
                      <div className="tw-flex tw-items-center tw-gap-1">
                        <label>Min:</label>
                        <input
                          type="number"
                          value={Number(mapping.min) || 0}
                          onChange={(e) => {
                            const lid = selectedLayerRef.current?.id;
                            if (lid) updateMappingForLayer(lid, mapping.id, { min: Number(e.target.value) });
                          }}
                          className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
                        />
                      </div>
                      <div className="tw-relative tw-flex-1 tw-h-2 tw-rounded tw-bg-neutral-800 tw-overflow-hidden">
                        <div 
                          className="tw-absolute tw-top-0 tw-bottom-0 tw-bg-neutral-600/70"
                          style={{ 
                            left: `${((Number(mapping.min) / 100) * 100)}%`,
                            width: `${((Number(mapping.max) - Number(mapping.min)) / 100) * 100}%`
                          }}
                        />
                      </div>
                      <div className="tw-flex tw-items-center tw-gap-1">
                        <label>Max:</label>
                        <input
                          type="number"
                          value={Number(mapping.max) || 0}
                          onChange={(e) => {
                            const lid = selectedLayerRef.current?.id;
                            if (lid) updateMappingForLayer(lid, mapping.id, { max: Number(e.target.value) });
                          }}
                          className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
        </div>
      </div>
    </div>
  );
};

