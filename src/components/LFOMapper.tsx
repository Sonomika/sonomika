import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Layer } from '../store/types';
import { useLFOStore, type LFOMapping } from '../store/lfoStore';
import { ParamRow, Select, Tabs, TabsList, TabsTrigger, TabsContent } from './ui';
import { BPMManager } from '../engine/BPMManager';
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
  const [activeTab, setActiveTab] = useState<'lfo' | 'random'>('lfo');
  
  const lfo = useLFOStore((state) => state.lfoState);
  const setLFO = useLFOStore((state) => state.setLFOState);
  const mappings = useLFOStore((state) => state.mappings);
  const addMapping = useLFOStore((state) => state.addMapping);
  const removeMapping = useLFOStore((state) => state.removeMapping);
  const updateMapping = useLFOStore((state) => state.updateMapping);
  const setLFOModulatedValue = useLFOStore((state) => state.setModulatedValue);

  // Sync UI tab with store mode (view only). Do NOT change generator mode on tab switch.
  useEffect(() => { setActiveTab(lfo.mode); }, [lfo.mode]);

  // Refs to avoid dependencies
  const selectedLayerRef = useRef(selectedLayer);
  const mappingsRef = useRef(mappings);
  const onUpdateLayerRef = useRef(onUpdateLayer);
  const prevNormByMappingRef = useRef<Record<string, number>>({});

  useEffect(() => { selectedLayerRef.current = selectedLayer; }, [selectedLayer]);
  useEffect(() => { mappingsRef.current = mappings; }, [mappings]);
  useEffect(() => { onUpdateLayerRef.current = onUpdateLayer; }, [onUpdateLayer]);

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
                const updatedParams = { ...(currentSelectedLayer.params || {}) } as Record<string, any>;
                Object.entries(randomized).forEach(([n, obj]) => {
                  updatedParams[n] = { ...(updatedParams[n] || {}), value: (obj as any).value };
                });
                currentOnUpdateLayer(currentSelectedLayer.id, { params: updatedParams });
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
          let updatedParams = { ...(currentSelectedLayer.params || {}) } as Record<string, any>;
          if (isEffect && effectId) {
            const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`) || null;
            const metadata: any = effectComponent ? (effectComponent as any).metadata : null;
            const paramDef = metadata?.parameters?.find((p: any) => p?.name === actualParamName);
            if (paramDef) {
              const randomized = globalRandomize([paramDef], currentSelectedLayer.params);
              if (randomized && randomized[actualParamName]) {
                updatedParams[actualParamName] = { ...(updatedParams[actualParamName] || {}), value: (randomized as any)[actualParamName].value };
                currentOnUpdateLayer(currentSelectedLayer.id, { params: updatedParams });
                return;
              }
            }
          }
          // Fallback: random within mapping min/max scaled to layer param
          const val = minVal + Math.random() * (maxVal - minVal);
          updatedParams[actualParamName] = { ...(updatedParams[actualParamName] || {}), value: val };
          currentOnUpdateLayer(currentSelectedLayer.id, { params: updatedParams });
        }
        return; // Do not continuous-modulate when mapping is randomize
      }

      // Normal continuous modulation
      if (actualParamName === 'opacity') {
        const clampedValue = Math.max(0, Math.min(1, modulatedValue / 100));
        currentOnUpdateLayer(currentSelectedLayer.id, { opacity: clampedValue });
      } else {
        const currentParams = currentSelectedLayer.params || {};
        const currentVal = currentParams[actualParamName]?.value;
        if (!isNumber(currentVal)) return;
        const newParams = { 
          ...currentParams, 
          [actualParamName]: { 
            ...currentParams[actualParamName], 
            value: modulatedValue 
          } 
        };
        currentOnUpdateLayer(currentSelectedLayer.id, { params: newParams });
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
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const points = 200;
    const frequency = lfo.rate;
    const amplitude = (lfo.depth / 100) * (height / 2 - 10);
    const offsetY = centerY + (lfo.offset / 100) * (height / 2 - 10);
    // Simple hash for deterministic preview noise 0..1
    const hash01 = (n: number) => {
      const s = Math.sin(n) * 43758.5453123;
      return s - Math.floor(s);
    };

    for (let i = 0; i <= points; i++) {
      const x = (width / points) * i;
      const t = (i / points) * 4 * Math.PI * frequency + (lfo.phase / 100) * 2 * Math.PI;
      let y: number;
      const wf = (lfo.waveform || 'sine').toLowerCase();
      if (wf === 'random') {
        const segments = Math.max(1, Math.round(8 * frequency));
        const step = Math.floor((i / points) * segments);
        y = hash01(step + 1) * 2 - 1;
      } else if (wf === 'randomsmooth') {
        const segments = Math.max(1, Math.round(8 * frequency));
        const pos = (i / points) * segments;
        const i0 = Math.floor(pos);
        const f = pos - i0;
        const y0 = hash01(i0 + 1) * 2 - 1;
        const y1 = hash01(i0 + 2) * 2 - 1;
        y = y0 + (y1 - y0) * f;
      } else {
        y = waveValue(t, lfo.waveform);
      }
      const plotY = offsetY - y * amplitude;
      if (i === 0) ctx.moveTo(x, plotY); else ctx.lineTo(x, plotY);
    }
    ctx.stroke();
  };

  // LFO animation loop (only when mode === 'lfo')
  useEffect(() => {
    if (lfo.mode !== 'lfo') return;
    const animate = () => {
      const time = Date.now() * 0.001;
      let value = waveValue(time * lfo.rate * 2 * Math.PI + lfo.phase * 0.01 * 2 * Math.PI, lfo.waveform, time, lfo.rate);
      value = value * (lfo.depth / 100) + (lfo.offset / 100);
      value = Math.max(-1, Math.min(1, value));
      applyLFOModulation(value);
      setLFO({ currentValue: value });
      drawWaveform();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [lfo.mode, lfo.rate, lfo.phase, lfo.depth, lfo.offset, lfo.waveform]);

  // Random generator: BPM-synced trigger with skip probability
  useEffect(() => {
    if (lfo.mode !== 'random') return;
    const bpmMgr = BPMManager.getInstance();
    let timer: number | null = null;
    const clearTimer = () => { if (timer != null) { clearInterval(timer); timer = null; } };

    const fireRandom = () => {
      // Skip based on percentage
      const skip = Math.random() * 100 < (lfo.skipPercent || 0);
      if (skip) return;
      // Generate value in -1..1 from randomMin/Max scaled -100..100
      const min = Math.min(lfo.randomMin, lfo.randomMax) / 100;
      const max = Math.max(lfo.randomMin, lfo.randomMax) / 100;
      const rand = min + Math.random() * (max - min);
      const clamped = Math.max(-1, Math.min(1, rand));
      setLFO({ currentValue: clamped });
      applyLFOModulation(clamped);

      // Additionally, fire randomize triggers for mappings that request it
      const layer = selectedLayerRef.current;
      const mps = mappingsRef.current;
      const updateLayer = onUpdateLayerRef.current;
      if (!layer || !mps || mps.length === 0) return;

      const effectId: string | undefined = (layer as any)?.asset?.id || (layer as any)?.asset?.name;
      const isEffect = (layer as any)?.type === 'effect' || (layer as any)?.asset?.isEffect;
      const effectComponent = isEffect && effectId ? (getEffect(effectId) || getEffect(`${effectId}Effect`) || null) : null;
      const metadata: any = effectComponent ? (effectComponent as any).metadata : null;

      mps.forEach((mapping) => {
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
              const updatedParams = { ...(layer.params || {}) } as Record<string, any>;
              Object.entries(randomized).forEach(([n, obj]) => {
                updatedParams[n] = { ...(updatedParams[n] || {}), value: (obj as any).value };
              });
              updateLayer(layer.id, { params: updatedParams });
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
                const updatedParams = { ...(layer.params || {}) } as Record<string, any>;
                updatedParams[actualParamName] = { ...(updatedParams[actualParamName] || {}), value: (randomized as any)[actualParamName].value };
                updateLayer(layer.id, { params: updatedParams });
              }
            }
          }
        }
      });
    };

    // Mode: sync to BPM divisions using its own interval that updates on BPM/division changes
    if ((lfo.randomTimingMode || 'sync') === 'sync') {
      let currentBpm = bpmMgr.getBPM();
      const restart = () => {
        clearTimer();
        const ms = parseDivisionToMs(currentBpm, lfo.randomDivision || '1/4');
        timer = window.setInterval(fireRandom, ms);
      };
      const onBpmChange = (b: number) => { currentBpm = b; restart(); };
      bpmMgr.addCallback(onBpmChange);
      restart();
      return () => { clearTimer(); bpmMgr.removeCallback(onBpmChange); };
    }

    // Mode: fixed Hz interval
    const hz = Math.max(0.1, Math.min(20, lfo.randomHz || 2));
    const intervalMs = 1000 / hz;
    timer = window.setInterval(fireRandom, intervalMs);
    return () => clearTimer();
  }, [lfo.mode, lfo.randomMin, lfo.randomMax, lfo.skipPercent, lfo.randomTimingMode, lfo.randomDivision, lfo.randomHz]);

  const addMappingHandler = () => {
    const newMapping: LFOMapping = {
      id: Date.now().toString(),
      parameter: 'Select Parameter',
      min: 0,
      max: 100,
      enabled: true
    };
    addMapping(newMapping);
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

  return (
    <div className="ableton-lfo">
      <div className="lfo-header">
        <div className="lfo-title">
          <span className="lfo-icon">∿</span>
          <span>LFO</span>
        </div>
        <div className="lfo-controls-top"></div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'lfo' | 'random')}>
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
              <div className="lfo-parameters">
                <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                  <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-[180px]">Waveform</label>
                  <div className="tw-w-[240px]">
                    <Select
                      value={lfo.waveform as any}
                      onChange={(v) => setLFO({ waveform: String(v) })}
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
            <div className="param-row">
                  <ParamRow label="Rate" value={lfo.rate} min={0.01} max={20} step={0.01}
                onChange={(value) => setLFO({ rate: value })}
                onIncrement={() => setLFO({ rate: Math.min(20, lfo.rate + 0.01) })}
                onDecrement={() => setLFO({ rate: Math.max(0.01, lfo.rate - 0.01) })}
              />
            </div>
            <div className="param-row">
                  <ParamRow label="Depth" value={lfo.depth} min={0} max={100} step={1}
                onChange={(value) => setLFO({ depth: value })}
                onIncrement={() => setLFO({ depth: Math.min(100, lfo.depth + 1) })}
                onDecrement={() => setLFO({ depth: Math.max(0, lfo.depth - 1) })}
              />
            </div>
            <div className="param-row">
                  <ParamRow label="Offset" value={lfo.offset} min={-100} max={100} step={1}
                onChange={(value) => setLFO({ offset: value })}
                onIncrement={() => setLFO({ offset: Math.min(100, lfo.offset + 1) })}
                onDecrement={() => setLFO({ offset: Math.max(-100, lfo.offset - 1) })}
              />
            </div>
            <div className="param-row">
                  <ParamRow label="Phase" value={lfo.phase} min={0} max={100} step={1}
                onChange={(value) => setLFO({ phase: value })}
                onIncrement={() => setLFO({ phase: Math.min(100, lfo.phase + 1) })}
                onDecrement={() => setLFO({ phase: Math.max(0, lfo.phase - 1) })}
              />
            </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="random">
          <div className="lfo-content-wrapper">
            <div className="lfo-main">
              <div className="lfo-parameters">
                <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                  <label className="tw-text-xs tw-uppercase tw-text-neutral-400 tw-w-[180px]">Timing</label>
                  <div className="tw-w-[240px] tw-flex tw-gap-2">
                    <button
                      className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${ (lfo.randomTimingMode || 'sync') === 'sync' ? 'tw-bg-sky-600 tw-border-sky-600 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200' }`}
                      onClick={() => setLFO({ randomTimingMode: 'sync' })}
                    >
                      Sync
                    </button>
                    <button
                      className={`tw-rounded tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${ (lfo.randomTimingMode || 'sync') === 'hz' ? 'tw-bg-sky-600 tw-border-sky-600 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200' }`}
                      onClick={() => setLFO({ randomTimingMode: 'hz' })}
                    >
                      Hz
                    </button>
                  </div>
                </div>
                {(lfo.randomTimingMode || 'sync') === 'sync' ? (
            <div className="param-row">
                    {(() => {
                      const allowedDenoms = [2, 4, 8, 16, 32, 64];
                      const normDiv = normalizeDivision(lfo.randomDivision);
                      const currentDenom = Number(normDiv.match(/\d+/)?.[0] || 4);
                      const currentIndex = Number.isFinite(lfo.randomDivisionIndex) && lfo.randomDivisionIndex != null
                        ? Math.max(0, Math.min(allowedDenoms.length - 1, Math.round(lfo.randomDivisionIndex as any)))
                        : Math.max(0, allowedDenoms.indexOf(currentDenom));
                      const setByIndex = (idx: number) => {
                        const clamped = Math.max(0, Math.min(allowedDenoms.length - 1, Math.round(idx)));
                        const denom = allowedDenoms[clamped];
                        setLFO({ randomDivision: `1/${denom}` as any, randomDivisionIndex: clamped as any });
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
                      value={Number(lfo.randomHz || 2)}
                      min={0.1}
                      max={20}
                      step={0.01}
                      onChange={(value) => setLFO({ randomHz: value })}
                      onIncrement={() => setLFO({ randomHz: Math.min(20, Number(lfo.randomHz || 2) + 0.01) })}
                      onDecrement={() => setLFO({ randomHz: Math.max(0.1, Number(lfo.randomHz || 2) - 0.01) })}
                    />
                  </div>
                )}
                <div className="param-row">
                  <ParamRow label="Min" value={toNumberOr(lfo.randomMin, -100)} min={-100} max={100} step={1}
                    onChange={(value) => setLFO({ randomMin: value })}
                    onIncrement={() => setLFO({ randomMin: Math.min(100, toNumberOr(lfo.randomMin, -100) + 1) })}
                    onDecrement={() => setLFO({ randomMin: Math.max(-100, toNumberOr(lfo.randomMin, -100) - 1) })}
                  />
                </div>
            <div className="param-row">
                  <ParamRow label="Max" value={toNumberOr(lfo.randomMax, 100)} min={-100} max={100} step={1}
                    onChange={(value) => setLFO({ randomMax: value })}
                    onIncrement={() => setLFO({ randomMax: Math.min(100, toNumberOr(lfo.randomMax, 100) + 1) })}
                    onDecrement={() => setLFO({ randomMax: Math.max(-100, toNumberOr(lfo.randomMax, 100) - 1) })}
              />
            </div>
            <div className="param-row">
                  <ParamRow label="Skip %" value={toNumberOr(lfo.skipPercent, 0)} min={0} max={100} step={1}
                    onChange={(value) => setLFO({ skipPercent: value })}
                    onIncrement={() => setLFO({ skipPercent: Math.min(100, toNumberOr(lfo.skipPercent, 0) + 1) })}
                    onDecrement={() => setLFO({ skipPercent: Math.max(0, toNumberOr(lfo.skipPercent, 0) - 1) })}
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
                          onChange={(v) => updateMapping(mapping.id, { parameter: String(v) })}
                      options={buildParameterOptions()}
                        />
                      </div>
                      <div className="tw-flex tw-items-center tw-gap-2">
                        <label className="tw-flex tw-items-center tw-gap-1 tw-text-sm tw-text-neutral-300">
                          <input
                            type="checkbox"
                            checked={mapping.enabled}
                            onChange={(e) => updateMapping(mapping.id, { enabled: e.target.checked })}
                            className="tw-rounded tw-border tw-border-neutral-700"
                          />
                          Enabled
                        </label>
                        <button 
                          className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-700 tw-w-6 tw-h-6 hover:tw-bg-neutral-800"
                          onClick={() => removeMapping(mapping.id)}
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
                          onChange={(e) => updateMapping(mapping.id, { min: Number(e.target.value) })}
                          className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
                        />
                      </div>
                      <div className="tw-relative tw-flex-1 tw-h-2 tw-rounded tw-bg-neutral-800 tw-overflow-hidden">
                        <div 
                          className="tw-absolute tw-top-0 tw-bottom-0 tw-bg-sky-600/70"
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
                          onChange={(e) => updateMapping(mapping.id, { max: Number(e.target.value) })}
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
