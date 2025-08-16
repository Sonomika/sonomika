import React, { useRef, useEffect, useCallback } from 'react';
import { Layer } from '../store/types';
import { useLFOStore, type LFOMapping } from '../store/lfoStore';
import { ParamRow, Select } from './ui';

interface LFOMapperProps {
  selectedLayer: Layer | null;
  onUpdateLayer: (layerId: string, options: Partial<Layer>) => void;
}

// Interfaces now imported from lfoStore

export const LFOMapper: React.FC<LFOMapperProps> = ({ selectedLayer, onUpdateLayer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  
  // Get state and actions from LFO store
  const lfo = useLFOStore((state) => state.lfoState);
  const setLFO = useLFOStore((state) => state.setLFOState);
  const mappings = useLFOStore((state) => state.mappings);
  // const selectedMapping = useLFOStore((state) => state.selectedMapping);
  // const setSelectedMapping = useLFOStore((state) => state.setSelectedMapping);
  const addMapping = useLFOStore((state) => state.addMapping);
  const removeMapping = useLFOStore((state) => state.removeMapping);
  const updateMapping = useLFOStore((state) => state.updateMapping);
  const setLFOModulatedValue = useLFOStore((state) => state.setModulatedValue);

  // Use refs to avoid useEffect dependencies changing
  const selectedLayerRef = useRef(selectedLayer);
  const mappingsRef = useRef(mappings);
  const onUpdateLayerRef = useRef(onUpdateLayer);

  // Update refs when props change
  useEffect(() => {
    selectedLayerRef.current = selectedLayer;
  }, [selectedLayer]);

  useEffect(() => {
    mappingsRef.current = mappings;
  }, [mappings]);

  useEffect(() => {
    onUpdateLayerRef.current = onUpdateLayer;
  }, [onUpdateLayer]);

  // Throttle parameter updates to prevent infinite loops
  const lastUpdateTime = useRef(0);
  const updateThrottleMs = 50; // Update parameters max every 50ms (20fps)

  // Apply LFO modulation to mapped parameters (throttled)
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

      // Calculate modulated value based on LFO current value
      const minVal = Number(mapping.min) || 0;
      const maxVal = Number(mapping.max) || 0;
      const range = maxVal - minVal;
      const normalizedLFO = (currentValue + 1) / 2; // Convert -1,1 to 0,1 range
      const modulatedValue = minVal + (range * normalizedLFO);

      // Extract parameter name from the mapping
      const paramName = mapping.parameter.split(' - ')[1]?.toLowerCase().replace(/\s+/g, '');
      if (!paramName) return;

      // Map common parameter names to actual effect parameter names
      const parameterMapping: { [key: string]: string } = {
        'slicecount': 'sliceCount',
        'offsetamount': 'offsetAmount', 
        'intensity': 'intensity',
        'fontsize': 'fontSize',
        'cellsize': 'cellSize',
        'layeropacity': 'opacity',
        'blendmodeintensity': 'intensity'
      };

      const actualParamName = parameterMapping[paramName] || paramName;

      // Get the base value for UI display as a number
      const rawBase = currentSelectedLayer.params?.[actualParamName]?.value;
      const baseValue: number = actualParamName === 'opacity' 
        ? (currentSelectedLayer.opacity || 1) * 100 // Convert opacity back to 0-100 for display
        : (typeof rawBase === 'number' ? rawBase : Number(rawBase) || 0);

      // Update the parameter value
      if (actualParamName === 'opacity') {
        // Handle layer opacity specially (range 0-1)
        const clampedValue = Math.max(0, Math.min(1, modulatedValue / 100));
        currentOnUpdateLayer(currentSelectedLayer.id, { opacity: clampedValue });
      } else {
        // Handle effect parameters
        const currentParams = currentSelectedLayer.params || {};
        const newParams = { 
          ...currentParams, 
          [actualParamName]: { 
            ...currentParams[actualParamName], 
            value: modulatedValue 
          } 
        };
        currentOnUpdateLayer(currentSelectedLayer.id, { params: newParams });
      }

      // Also push modulated values to store for UI display
      const key = `${currentSelectedLayer.id}-${actualParamName}`;
      setLFOModulatedValue(key, {
        layerId: currentSelectedLayer.id,
        parameterName: actualParamName,
        baseValue: baseValue,
        modulatedValue: modulatedValue,
        timestamp: now
      });
    });
  }, []); // No dependencies - use refs instead

  const waveforms = [
    { id: 'sine', name: 'Sine', symbol: '∿' },
    { id: 'triangle', name: 'Triangle', symbol: '△' },
    { id: 'sawtooth-up', name: 'Saw Up', symbol: '⟋' },
    { id: 'sawtooth-down', name: 'Saw Down', symbol: '⟍' },
    { id: 'square', name: 'Square', symbol: '⊓' },
    { id: 'random', name: 'Random', symbol: '※' },
    { id: 'stepped', name: 'Stepped', symbol: '⋮' },
    { id: 'glide', name: 'Glide', symbol: '⟋⟍' },
    { id: 'asymmetric', name: 'Asymmetric', symbol: '⟋⟋' },
    { id: 'morphing', name: 'Morphing', symbol: '⧨' },
    { id: 'chaotic', name: 'Chaotic', symbol: '※※' },
    { id: 'multi-step', name: 'Multi-Step', symbol: '⬜⬜' }
  ];

  // Draw waveform visualization
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Vertical grid lines
    for (let i = 0; i <= 8; i++) {
      const x = (width / 8) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw waveform
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
      let y = 0;

      switch (lfo.waveform) {
        case 'sine':
          y = Math.sin(t);
          break;
        case 'triangle':
          y = (2 / Math.PI) * Math.asin(Math.sin(t));
          break;
        case 'sawtooth-up':
          y = 2 * (t / (2 * Math.PI) - Math.floor(t / (2 * Math.PI) + 0.5));
          break;
        case 'sawtooth-down':
          y = -2 * (t / (2 * Math.PI) - Math.floor(t / (2 * Math.PI) + 0.5));
          break;
        case 'square':
          y = Math.sign(Math.sin(t));
          break;
        case 'random':
          y = (Math.random() - 0.5) * 2;
          break;
        case 'stepped':
          y = Math.round(Math.sin(t) * 4) / 4;
          break;
        case 'glide':
          const sawUp = 2 * (t / (2 * Math.PI) - Math.floor(t / (2 * Math.PI) + 0.5));
          y = sawUp * Math.exp(-((t % (2 * Math.PI)) / Math.PI));
          break;
        case 'asymmetric':
          y = t % (2 * Math.PI) < Math.PI ? Math.sin(t * 2) : Math.sin(t * 0.5);
          break;
        case 'morphing':
          const morph = (Math.sin(t * 0.1) + 1) / 2;
          y = morph * Math.sin(t) + (1 - morph) * Math.sign(Math.sin(t));
          break;
        case 'chaotic':
          y = Math.sin(t) + 0.3 * Math.sin(t * 3.7) + 0.2 * Math.sin(t * 7.1);
          y = Math.tanh(y);
          break;
        case 'multi-step':
          const step = Math.floor((t % (2 * Math.PI)) / (Math.PI / 4));
          y = (step % 2 === 0 ? 1 : -1) * (step / 8);
          break;
        default:
          y = Math.sin(t);
      }

      // Apply jitter
      if (lfo.jitter > 0) {
        y += (Math.random() - 0.5) * (lfo.jitter / 100) * 0.5;
      }

      // Apply smoothing
      if (lfo.smooth > 0 && i > 0) {
        // Simple smoothing approximation
        y = y * (1 - lfo.smooth / 100) + (y * (lfo.smooth / 100));
      }

      const plotY = offsetY - y * amplitude;

      if (i === 0) {
        ctx.moveTo(x, plotY);
      } else {
        ctx.lineTo(x, plotY);
      }
    }

    ctx.stroke();

    // Draw current value indicator
    if (!lfo.hold) {
      const currentX = (Date.now() * 0.001 * lfo.rate * width / 4) % width;
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.arc(currentX, centerY, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  useEffect(() => {
    const animate = () => {
      const time = Date.now() * 0.001; // Convert to seconds
      
      // Calculate LFO value based on current parameters
      let value = 0;
      
      switch (lfo.waveform) {
        case 'sine':
          value = Math.sin(time * lfo.rate * 2 * Math.PI + lfo.phase * 0.01 * 2 * Math.PI);
          break;
        case 'triangle':
          const trianglePhase = (time * lfo.rate + lfo.phase * 0.01) % 1;
          value = trianglePhase < 0.5 ? (trianglePhase * 4 - 1) : (3 - trianglePhase * 4);
          break;
        case 'sawtooth-up':
          value = 2 * ((time * lfo.rate + lfo.phase * 0.01) % 1) - 1;
          break;
        case 'sawtooth-down':
          value = 1 - 2 * ((time * lfo.rate + lfo.phase * 0.01) % 1);
          break;
        case 'square':
          value = ((time * lfo.rate + lfo.phase * 0.01) % 1) < 0.5 ? -1 : 1;
          break;
        case 'random':
          value = (Math.random() - 0.5) * 2;
          break;
        default:
          value = Math.sin(time * lfo.rate * 2 * Math.PI + lfo.phase * 0.01 * 2 * Math.PI);
      }
      
      // Apply depth and offset
      value = value * (lfo.depth / 100) + (lfo.offset / 100);
      
      // Clamp to -1, 1 range
      value = Math.max(-1, Math.min(1, value));
      
      // Apply parameter modulation with the new value (throttled)
      applyLFOModulation(value);
      
      // Update current value for display only (don't trigger re-renders)
      setLFO({ currentValue: value });
      
      drawWaveform();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [lfo.waveform, lfo.rate, lfo.phase, lfo.depth, lfo.offset]); // Only depend on specific LFO properties, not applyLFOModulation

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

  return (
    <div className="ableton-lfo">
      <div className="lfo-header">
        <div className="lfo-title">
          <span className="lfo-icon">∿</span>
          <span>LFO</span>
        </div>
        <div className="lfo-controls-top">
          <button 
            className={`lfo-button ${lfo.hold ? 'active' : ''}`}
            onClick={() => setLFO({ hold: !lfo.hold })}
          >
            Hold
          </button>
          <button 
            className="lfo-button"
            onClick={() => setLFO({ retrigger: !lfo.retrigger })}
          >
            R
          </button>
        </div>
      </div>

      <div className="lfo-content-wrapper">
        <div className="lfo-main">
          {/* Waveform Display */}
          <div className="waveform-section">
            <canvas 
              ref={canvasRef}
              width={300}
              height={120}
              className="waveform-canvas"
            />
            <div className="waveform-controls">
              <div className="waveform-selector">
                {waveforms.map(wave => (
                  <button
                    key={wave.id}
                    className={`waveform-btn ${lfo.waveform === wave.id ? 'active' : ''}`}
                    onClick={() => setLFO({ waveform: wave.id })}
                    title={wave.name}
                  >
                    {wave.symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Parameter Controls */}
          <div className="lfo-parameters">
            <div className="param-row">
              <ParamRow
                label="Rate"
                value={lfo.rate}
                min={0.01}
                max={20}
                step={0.01}
                onChange={(value) => setLFO({ rate: value })}
                onIncrement={() => setLFO({ rate: Math.min(20, lfo.rate + 0.01) })}
                onDecrement={() => setLFO({ rate: Math.max(0.01, lfo.rate - 0.01) })}
              />
              <button 
                className={`sync-btn ${lfo.tempoSync ? 'active' : ''}`}
                onClick={() => setLFO({ tempoSync: !lfo.tempoSync })}
              >
                {lfo.tempoSync ? 'Hz' : '♩'}
              </button>
            </div>

            <div className="param-row">
              <ParamRow
                label="Depth"
                value={lfo.depth}
                min={0}
                max={100}
                step={1}
                onChange={(value) => setLFO({ depth: value })}
                onIncrement={() => setLFO({ depth: Math.min(100, lfo.depth + 1) })}
                onDecrement={() => setLFO({ depth: Math.max(0, lfo.depth - 1) })}
              />
            </div>

            <div className="param-row">
              <ParamRow
                label="Offset"
                value={lfo.offset}
                min={-100}
                max={100}
                step={1}
                onChange={(value) => setLFO({ offset: value })}
                onIncrement={() => setLFO({ offset: Math.min(100, lfo.offset + 1) })}
                onDecrement={() => setLFO({ offset: Math.max(-100, lfo.offset - 1) })}
              />
            </div>

            <div className="param-row">
              <ParamRow
                label="Phase"
                value={lfo.phase}
                min={0}
                max={100}
                step={1}
                onChange={(value) => setLFO({ phase: value })}
                onIncrement={() => setLFO({ phase: Math.min(100, lfo.phase + 1) })}
                onDecrement={() => setLFO({ phase: Math.max(0, lfo.phase - 1) })}
              />
            </div>

            <div className="param-row">
              <ParamRow
                label="Jitter"
                value={lfo.jitter}
                min={0}
                max={100}
                step={1}
                onChange={(value) => setLFO({ jitter: value })}
                onIncrement={() => setLFO({ jitter: Math.min(100, lfo.jitter + 1) })}
                onDecrement={() => setLFO({ jitter: Math.max(0, lfo.jitter - 1) })}
              />
            </div>

            <div className="param-row">
              <ParamRow
                label="Smooth"
                value={lfo.smooth}
                min={0}
                max={100}
                step={1}
                onChange={(value) => setLFO({ smooth: value })}
                onIncrement={() => setLFO({ smooth: Math.min(100, lfo.smooth + 1) })}
                onDecrement={() => setLFO({ smooth: Math.max(0, lfo.smooth - 1) })}
              />
            </div>
          </div>

          {/* Parameter Mappings */}
          <div className="tw-space-y-2">
            <div className="tw-flex tw-items-center tw-justify-between">
              <h4 className="tw-text-sm tw-font-semibold tw-text-white">Parameter Mappings</h4>
              <button className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-2 tw-py-1 hover:tw-bg-neutral-700" onClick={addMappingHandler}>
                + Map
              </button>
            </div>
            
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
                          options={[
                            { value: 'Select Parameter', label: 'Select Parameter' },
                            { value: 'Video Slice - Slice Count', label: 'Video Slice - Slice Count' },
                            { value: 'Video Slice - Offset Amount', label: 'Video Slice - Offset Amount' },
                            { value: 'Video Warp - Intensity', label: 'Video Warp - Intensity' },
                            { value: 'ASCII - Font Size', label: 'ASCII - Font Size' },
                            { value: 'ASCII - Cell Size', label: 'ASCII - Cell Size' },
                            { value: 'Layer Opacity', label: 'Layer Opacity' },
                            { value: 'Blend Mode Intensity', label: 'Blend Mode Intensity' },
                          ]}
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
      </div>
    </div>
  );
};
