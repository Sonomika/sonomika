import React, { useRef, useState } from 'react';
import { Select } from './ui';
import { LOOP_MODES, type LoopMode } from '../constants/video';
import type { Layer } from '../types/layer';
import { getEffect } from '../utils/effectRegistry';
import { useLFOStore } from '../store/lfoStore';
import { ParamRow, ButtonGroup, Slider } from './ui';

interface LayerOptionsProps {
  selectedLayer: Layer | null;
  onUpdateLayer: (layerId: string, options: Partial<Layer>) => void;
}

export const LayerOptions: React.FC<LayerOptionsProps> = ({ selectedLayer, onUpdateLayer }) => {
  // Get LFO modulated values from LFO store
  const lfoModulatedValues = useLFOStore((state) => state.modulatedValues);
  
  // Helper function to get display value (LFO modulated or base value)
  const getDisplayValue = (paramName: string, baseValue: number): number => {
    if (!selectedLayer) return baseValue;
    const key = `${selectedLayer.id}-${paramName}`;
    const lfoValue = lfoModulatedValues[key];
    return lfoValue ? lfoValue.modulatedValue : baseValue;
  };

  // Update local state when selectedLayer changes
  const [loopMode, setLoopMode] = useState<LoopMode>(
    (selectedLayer as any)?.loopMode || LOOP_MODES.NONE
  );
  const [loopCount, setLoopCount] = useState(
    (selectedLayer as any)?.loopCount || 1
  );
  const [blendMode, setBlendMode] = useState(selectedLayer?.blendMode || 'add');
  const [opacity, setOpacity] = useState(selectedLayer?.opacity || 1.0);
  const [playMode, setPlayMode] = useState<'restart' | 'continue'>(
    (selectedLayer as any)?.playMode || 'restart'
  );
  const opacityRafRef = useRef<number | null>(null);
  const opacityPendingRef = useRef<number>(selectedLayer?.opacity || 1.0);
  const [localParamValues, setLocalParamValues] = useState<Record<string, number>>({});

  // Check if the layer has an effect
  const hasEffect = selectedLayer?.type === 'effect' || (selectedLayer as any)?.asset?.type === 'effect' || (selectedLayer as any)?.asset?.isEffect;
  const effectId: string | undefined = (selectedLayer as any)?.asset?.id || (selectedLayer as any)?.asset?.name;
  
  // Try multiple ways to find the effect component
  let effectComponent = null;
  if (hasEffect) {
    // Try the exact ID first
    effectComponent = effectId ? getEffect(effectId) : null;
    
    // If not found, try common variations
    if (!effectComponent && effectId) {
      const variations = [
        effectId,
        effectId.replace(/-/g, ''), // Remove hyphens
        effectId.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''), // Add hyphens
        effectId.toLowerCase(),
        effectId.toUpperCase(),
        effectId.replace(/Effect$/, ''), // Remove "Effect" suffix
        effectId + 'Effect', // Add "Effect" suffix
      ];
      
      for (const variation of variations) {
        effectComponent = getEffect(variation);
        if (effectComponent) {
          console.log(`✅ Found effect using variation: ${variation}`);
          break;
        }
      }
    }
  }
  
  const effectMetadata = effectComponent ? (effectComponent as any).metadata : null;

  // Sync local state with selectedLayer when it changes
  React.useEffect(() => {
    if (selectedLayer) {
      setLoopMode((selectedLayer as any).loopMode || LOOP_MODES.NONE);
      setLoopCount((selectedLayer as any).loopCount || 1);
      setBlendMode(selectedLayer.blendMode || 'add');
      setOpacity(selectedLayer.opacity || 1.0);
      
      // Initialize playMode if it doesn't exist
      const currentPlayMode = (selectedLayer as any)?.playMode;
      if (currentPlayMode === undefined) {
        // Set default playMode to 'restart' and update the layer
        const defaultPlayMode = 'restart';
        setPlayMode(defaultPlayMode);
        onUpdateLayer(selectedLayer.id, { playMode: defaultPlayMode });
      } else {
        setPlayMode(currentPlayMode);
      }
      
      // Initialize effect parameters if they don't exist
      if (hasEffect && effectMetadata && selectedLayer.params) {
        const updatedParams = { ...selectedLayer.params };
        let hasChanges = false;
        
        effectMetadata.parameters?.forEach((param: any) => {
          if (updatedParams[param.name] === undefined) {
            updatedParams[param.name] = { value: param.value };
            hasChanges = true;
            console.log(`Initializing param ${param.name} with default value:`, param.value);
          }
        });
        
        // Update layer with initialized parameters if needed
        if (hasChanges) {
          console.log('Initializing effect parameters:', updatedParams);
          onUpdateLayer(selectedLayer.id, { params: updatedParams });
        }
      }
      
      // Sync local param values - only update if they're different
      const paramValues: Record<string, any> = {};
      if (selectedLayer.params) {
        Object.keys(selectedLayer.params).forEach(paramName => {
          const param = selectedLayer.params?.[paramName];
          if (param && param.value !== undefined) {
            paramValues[paramName] = param.value;
          }
        });
      }
      
      // Only update local param values if they're actually different
      setLocalParamValues(prev => {
        const hasChanges = Object.keys(paramValues).some(key => 
          prev[key] !== paramValues[key]
        );
        return hasChanges ? paramValues : prev;
      });
    }
  }, [selectedLayer?.id, hasEffect, effectMetadata?.parameters]); // Only re-run when these specific values change

  const handleLoopModeChange = (mode: LoopMode) => {
    console.log('🎬 Loop mode changed to:', mode, 'for layer:', selectedLayer?.name);
    setLoopMode(mode);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        loopMode: mode,
        loopCount: mode === LOOP_MODES.NONE ? 1 : loopCount,
        reverseEnabled: mode === LOOP_MODES.REVERSE,
        pingPongEnabled: mode === LOOP_MODES.PING_PONG
      });
    }
  };

  const handleLoopCountChange = (count: number) => {
    setLoopCount(count);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...(selectedLayer as any),
        loopCount: count
      });
    }
  };

  const handleBlendModeChange = (mode: string) => {
    setBlendMode(mode);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...(selectedLayer as any),
        blendMode: mode
      });
    }
  };

  const handlePlayModeChange = (mode: 'restart' | 'continue') => {
    setPlayMode(mode);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...(selectedLayer as any),
        playMode: mode
      });
    }
  };

  const commitOpacity = (value: number) => {
    if (!selectedLayer) return;
    onUpdateLayer(selectedLayer.id, {
      ...(selectedLayer as any),
      opacity: value,
    });
  };

  const handleOpacityChange = (value: number) => {
    setOpacity(value);
    opacityPendingRef.current = value;
    if (opacityRafRef.current == null) {
      opacityRafRef.current = requestAnimationFrame(() => {
        commitOpacity(opacityPendingRef.current);
        opacityRafRef.current = null;
      });
    }
  };

  const handleEffectParamChange = (paramName: string, value: any) => {
    if (selectedLayer) {
      const currentParams = selectedLayer.params || {};
      
      // Ensure boolean parameters are properly initialized with their default values
      if (effectMetadata) {
        const paramDef = effectMetadata.parameters?.find((p: any) => p.name === paramName);
        if (paramDef && paramDef.type === 'boolean' && currentParams[paramName] === undefined) {
          // Initialize boolean parameter with default value if not already set
          currentParams[paramName] = { value: paramDef.value };
        }
      }
      
      // Preserve all existing parameters and only update the changed one
      const updatedParams = { ...currentParams };
      updatedParams[paramName] = { value: value };
      
      // Update the layer with the new parameters
      onUpdateLayer(selectedLayer.id, { params: updatedParams });
      
      // Also update local state for immediate UI feedback
      setLocalParamValues(prev => ({
        ...prev,
        [paramName]: value
      }));
    }
  };

  // Debug logging removed for performance during slider drags

  // List all registered effects for debugging
  if (hasEffect && !effectComponent) {
    console.log('⚠️ Effect not found in registry. Available effects:');
    // This will be logged by the effectRegistry.ts file
  }

  if (!selectedLayer) {
    return (
      <div className="layer-options-panel">
        <div className="layer-options-header">
          <h3>Layer Options</h3>
        </div>
        <div className="layer-options-content">
          <div className="no-layer-selected">
            <h3>No Layer Selected</h3>
            <p>Select a layer to configure options</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="layer-options-panel tw-space-y-4 tw-text-neutral-200">
      <div className="layer-options-header tw-border-b tw-border-neutral-800 tw-pb-2">
        <h3 className="tw-text-base tw-font-semibold">Layer Options - {selectedLayer.name}</h3>
      </div>
      
      <div className="layer-options-content tw-space-y-4" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
        {/* Effect Parameters Section */}
        {hasEffect && (
          <div className="option-group tw-space-y-2">
            <h4 className="tw-text-sm tw-font-medium tw-text-neutral-300">Effect Parameters</h4>
            <div className="effect-params tw-space-y-3">
              {effectMetadata ? (
                // Use metadata if available
                effectMetadata.parameters?.map((param: any) => {
                  const currentValue = selectedLayer.params?.[param.name]?.value ?? param.value;
                  const uiValue = localParamValues[param.name] ?? currentValue;
                  
                  // Debug logging for boolean parameters
                  if (param.type === 'boolean') {
                    console.log(`Boolean param ${param.name}:`, {
                      defaultValue: param.value,
                      layerValue: selectedLayer.params?.[param.name]?.value,
                      localValue: localParamValues[param.name],
                      currentValue: currentValue,
                      type: typeof currentValue
                    });
                  }
                  
                  return (
                    <div key={param.name} className="effect-param tw-space-y-1">
                      <label className="param-label tw-text-xs tw-uppercase tw-text-neutral-400">{param.description || param.name}</label>
                      <div className="param-control tw-flex tw-items-center tw-gap-2">
                        {param.type === 'color' && (
                          <input
                            type="color"
                            value={currentValue}
                            onChange={(e) => handleEffectParamChange(param.name, e.target.value)}
                            className="color-picker"
                          />
                        )}
                        {param.type === 'select' && (
                          <div className="tw-w-40">
                            <Select
                              value={uiValue}
                              onChange={(val) => {
                                setLocalParamValues(prev => ({ ...prev, [param.name]: val as any }));
                                handleEffectParamChange(param.name, val);
                              }}
                              options={(param.options || []).map((opt: any) => ({ value: opt.value, label: opt.label }))}
                            />
                          </div>
                        )}
                        {param.type === 'boolean' && (
                          <div className="boolean-control">
                            <button
                              type="button"
                              className={`toggle-button ${Boolean(currentValue) ? 'active' : 'inactive'} tw-rounded tw-px-3 tw-py-1.5 ${Boolean(currentValue) ? 'tw-bg-purple-600 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-300'}`}
                              onClick={() => {
                                const newValue = !Boolean(currentValue);
                                console.log(`Boolean param ${param.name} toggled to:`, newValue);
                                
                                // Update the parameter in the effect
                                handleEffectParamChange(param.name, newValue);
                                
                                // Update local state for immediate UI feedback
                                setLocalParamValues(prev => ({
                                  ...prev,
                                  [param.name]: newValue
                                }));
                              }}
                              style={{
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                userSelect: 'none',
                                minWidth: '60px'
                              }}
                            >
                              {Boolean(currentValue) ? 'ON' : 'OFF'}
                            </button>
                          </div>
                        )}
                        {param.type === 'number' && (
                          <ParamRow
                            key={param.name}
                            label={param.description || param.name}
                            value={uiValue}
                            min={param.min || 0}
                            max={param.max || 1}
                            step={param.step || 0.1}
                            onChange={(value) => {
                              setLocalParamValues(prev => ({ ...prev, [param.name]: value }));
                              handleEffectParamChange(param.name, value);
                            }}
                            onIncrement={() => {
                              const currentVal = localParamValues[param.name] ?? currentValue;
                              const step = param.step || 0.1;
                              const newValue = Math.min(param.max || 1, currentVal + step);
                              setLocalParamValues(prev => ({ ...prev, [param.name]: newValue }));
                              handleEffectParamChange(param.name, newValue);
                            }}
                            onDecrement={() => {
                              const currentVal = localParamValues[param.name] ?? currentValue;
                              const step = param.step || 0.1;
                              const newValue = Math.max(param.min || 0, currentVal - step);
                              setLocalParamValues(prev => ({ ...prev, [param.name]: newValue }));
                              handleEffectParamChange(param.name, newValue);
                            }}
                            showLabel={false}
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                // Fallback: show parameters from layer.params
                selectedLayer.params && Object.keys(selectedLayer.params).map((paramName) => {
                  const param = selectedLayer.params?.[paramName];
                  const currentValue = param?.value ?? 1.0;
                  const baseValue = localParamValues[paramName] ?? currentValue;
                   
                  return (
                    <div key={paramName} className="effect-param">
                      <label className="param-label">{paramName}</label>
                      <div className="param-control">
                        {paramName === 'color' ? (
                          <input
                            type="color"
                            value={currentValue}
                            onChange={(e) => handleEffectParamChange(paramName, e.target.value)}
                            className="color-picker"
                          />
                        ) : (
                          <div className="number-control tw-flex tw-items-center tw-gap-2 tw-w-full">
                            <div style={{ flex: 1 }}>
                              <Slider
                                min={param?.min || 0}
                                max={param?.max || 2}
                                step={param?.step || 0.1}
                                value={baseValue}
                                onChange={(value) => {
                                  setLocalParamValues(prev => ({ ...prev, [paramName]: value }));
                                  handleEffectParamChange(paramName, value);
                                }}
                              />
                            </div>
                            <span className="param-value tw-w-14 tw-text-right tw-text-xs tw-text-neutral-400">{(localParamValues[paramName] ?? currentValue).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }).filter(Boolean)
              )}
            </div>
          </div>
        )}

        {/* Video-specific options */}
        {(() => {
          // Check if this is a video layer (either by layer type or asset type)
          // Also check if the asset name suggests it's a video file
          const assetName = (selectedLayer as any)?.asset?.name || '';
          const isVideoLayer = selectedLayer?.type === 'video' || 
                              (selectedLayer as any)?.asset?.type === 'video' ||
                              assetName.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i);
          
          return isVideoLayer ? (
            <div className="option-group">
              <h4>Video Options</h4>
              <div className="option-control">
                <div className="loop-mode-buttons">
                  <button
                    className={`loop-btn ${loopMode === LOOP_MODES.NONE ? 'active' : ''}`}
                    onClick={() => handleLoopModeChange(LOOP_MODES.NONE)}
                  >
                    None
                  </button>
                  <button
                    className={`loop-btn ${loopMode === LOOP_MODES.LOOP ? 'active' : ''}`}
                    onClick={() => handleLoopModeChange(LOOP_MODES.LOOP)}
                  >
                    Loop
                  </button>
                  <button
                    className={`loop-btn ${loopMode === LOOP_MODES.REVERSE ? 'active' : ''}`}
                    onClick={() => handleLoopModeChange(LOOP_MODES.REVERSE)}
                  >
                    Reverse
                  </button>
                  <button
                    className={`loop-btn ${loopMode === LOOP_MODES.PING_PONG ? 'active' : ''}`}
                    onClick={() => handleLoopModeChange(LOOP_MODES.PING_PONG)}
                  >
                    Ping-Pong
                  </button>
                </div>
              </div>
              
              <div className="option-control">
                <label>Play Mode:</label>
                <ButtonGroup
                  options={[
                    { value: 'restart', label: 'Restart' },
                    { value: 'continue', label: 'Continue' }
                  ]}
                  value={playMode}
                  onChange={(value) => handlePlayModeChange(value as 'restart' | 'continue')}
                  columns={2}
                  size="small"
                />
              </div>
            </div>
          ) : null;
        })()}



        {loopMode !== LOOP_MODES.NONE && (
          <div className="option-group">
            <h4>Loop Count</h4>
            <div className="option-control">
              <div className="loop-count-controls">
                <button
                  className="count-btn"
                  onClick={() => handleLoopCountChange(Math.max(1, loopCount - 1))}
                  disabled={loopCount <= 1}
                >
                  -
                </button>
                <span className="count-display">{loopCount}</span>
                <button
                  className="count-btn"
                  onClick={() => handleLoopCountChange(loopCount + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="option-group">
          <h4>Blend Mode</h4>
          <div className="option-control">
            <div className="blend-mode-buttons">
              <button
                className={`blend-btn ${blendMode === 'add' ? 'active' : ''}`}
                onClick={() => handleBlendModeChange('add')}
                title="Add - Brightens overlapping areas"
              >
                Add
              </button>
              <button
                className={`blend-btn ${blendMode === 'multiply' ? 'active' : ''}`}
                onClick={() => handleBlendModeChange('multiply')}
                title="Multiply - Darkens overlapping areas"
              >
                Multiply
              </button>
              <button
                className={`blend-btn ${blendMode === 'screen' ? 'active' : ''}`}
                onClick={() => handleBlendModeChange('screen')}
                title="Screen - Lightens overlapping areas"
              >
                Screen
              </button>
              <button
                className={`blend-btn ${blendMode === 'overlay' ? 'active' : ''}`}
                onClick={() => handleBlendModeChange('overlay')}
                title="Overlay - Combines multiply and screen"
              >
                Overlay
              </button>
              <button
                className={`blend-btn ${blendMode === 'difference' ? 'active' : ''}`}
                onClick={() => handleBlendModeChange('difference')}
                title="Difference - Shows differences between layers"
              >
                Difference
              </button>
            </div>
          </div>
        </div>

        <div className="option-group">
          <h4>General</h4>
          <div className="option-control">
            <ParamRow
              label="Opacity"
              value={opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => handleOpacityChange(value)}
              onIncrement={() => handleOpacityChange(Math.min(1, opacity + 0.01))}
              onDecrement={() => handleOpacityChange(Math.max(0, opacity - 0.01))}
            />
          </div>
        </div>


      </div>
    </div>
  );
}; 