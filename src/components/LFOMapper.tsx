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
  const [activeTab, setActiveTab] = useState<'lfo' | 'random'>('lfo');
  
  const lfo = useLFOStore((state) => state.lfoState);
  const setLFO = useLFOStore((state) => state.setLFOState);
  const mappings = useLFOStore((state) => state.mappings);
  const addMapping = useLFOStore((state) => state.addMapping);
  const removeMapping = useLFOStore((state) => state.removeMapping);
  const updateMapping = useLFOStore((state) => state.updateMapping);
  const setLFOModulatedValue = useLFOStore((state) => state.setModulatedValue);

  // Sync UI tab with store mode
  useEffect(() => { setActiveTab(lfo.mode); }, [lfo.mode]);
  useEffect(() => { setLFO({ mode: activeTab }); }, [activeTab]);

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
    for (let i = 0; i <= points; i++) {
      const x = (width / points) * i;
      const t = (i / points) * 4 * Math.PI * frequency + (lfo.phase / 100) * 2 * Math.PI;
      let y = Math.sin(t);
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
      let value = Math.sin(time * lfo.rate * 2 * Math.PI + lfo.phase * 0.01 * 2 * Math.PI);
      value = value * (lfo.depth / 100) + (lfo.offset / 100);
      value = Math.max(-1, Math.min(1, value));
      applyLFOModulation(value);
      setLFO({ currentValue: value });
      drawWaveform();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [lfo.mode, lfo.rate, lfo.phase, lfo.depth, lfo.offset]);

  // Random generator: BPM-synced trigger with skip probability
  useEffect(() => {
    if (lfo.mode !== 'random') return;
    const bpmMgr = BPMManager.getInstance();
    const onBeat = () => {
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
    bpmMgr.addCallback(onBeat);
    return () => bpmMgr.removeCallback(onBeat);
  }, [lfo.mode, lfo.randomMin, lfo.randomMax, lfo.skipPercent]);

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
          <TabsTrigger value="lfo">LFO</TabsTrigger>
          <TabsTrigger value="random">Random (BPM)</TabsTrigger>
        </TabsList>

        <TabsContent value="lfo">
          <div className="lfo-content-wrapper">
            <div className="lfo-main">
              <div className="waveform-section">
                <canvas ref={canvasRef} width={300} height={120} className="waveform-canvas" />
              </div>
              <div className="lfo-parameters">
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
