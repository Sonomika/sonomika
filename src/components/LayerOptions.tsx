import React, { useState } from 'react';
import { LOOP_MODES, type LoopMode } from '../constants/video';
import type { Layer } from '../types/layer';
import { getEffect } from '../utils/effectRegistry';

interface LayerOptionsProps {
  selectedLayer: Layer | null;
  onUpdateLayer: (layerId: string, options: Partial<Layer>) => void;
}

export const LayerOptions: React.FC<LayerOptionsProps> = ({ selectedLayer, onUpdateLayer }) => {
  // Update local state when selectedLayer changes
  const [loopMode, setLoopMode] = useState<LoopMode>(
    (selectedLayer as any)?.loopMode || LOOP_MODES.NONE
  );
  const [loopCount, setLoopCount] = useState(
    (selectedLayer as any)?.loopCount || 1
  );
  const [blendMode, setBlendMode] = useState(selectedLayer?.blendMode || 'add');
  const [opacity, setOpacity] = useState(selectedLayer?.opacity || 1.0);

  // Sync local state with selectedLayer when it changes
  React.useEffect(() => {
    if (selectedLayer) {
      setLoopMode((selectedLayer as any).loopMode || LOOP_MODES.NONE);
      setLoopCount((selectedLayer as any).loopCount || 1);
      setBlendMode(selectedLayer.blendMode || 'add');
      setOpacity(selectedLayer.opacity || 1.0);
    }
  }, [selectedLayer]);

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

  const handleOpacityChange = (value: number) => {
    setOpacity(value);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...(selectedLayer as any),
        opacity: value
      });
    }
  };

  const handleEffectParamChange = (paramName: string, value: any) => {
    if (selectedLayer) {
      const currentParams = selectedLayer.params || {};
      
      // Clean up old parameters that were removed from PulseHexagon
      const cleanedParams = { ...currentParams };
      if (selectedLayer.asset?.name === 'Pulse Hexagon' || selectedLayer.asset?.id === 'PulseHexagon') {
        delete cleanedParams.intensity;
        delete cleanedParams.size;
        delete cleanedParams.speed;
      }
      
      const newParams = { ...cleanedParams, [paramName]: { ...cleanedParams[paramName], value } };
      onUpdateLayer(selectedLayer.id, { params: newParams });
    }
  };

  // Check if the layer has an effect
  const hasEffect = selectedLayer?.type === 'effect' || selectedLayer?.asset?.type === 'effect' || selectedLayer?.asset?.isEffect;
  const effectId = selectedLayer?.asset?.id || selectedLayer?.asset?.name;
  
  // Try multiple ways to find the effect component
  let effectComponent = null;
  if (hasEffect) {
    // Try the exact ID first
    effectComponent = getEffect(effectId);
    
    // If not found, try common variations
    if (!effectComponent) {
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

  // Debug logging
  console.log('🔍 LayerOptions Debug:', {
    selectedLayer: selectedLayer,
    asset: selectedLayer?.asset,
    assetType: selectedLayer?.asset?.type,
    assetName: selectedLayer?.asset?.name,
    assetId: selectedLayer?.asset?.id,
    layerType: selectedLayer?.type,
    hasEffect: hasEffect,
    effectId: effectId,
    effectComponent: effectComponent,
    effectMetadata: effectMetadata,
    params: selectedLayer?.params
  });

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
    <div className="layer-options-panel">
      <div className="layer-options-header">
        <h3>Layer Options - {selectedLayer.name}</h3>
      </div>
      
      <div className="layer-options-content" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
        {/* Effect Parameters Section */}
        {hasEffect && (
          <div className="option-group">
            <h4>Effect Parameters</h4>
            <div className="effect-params">
              {effectMetadata ? (
                // Use metadata if available
                effectMetadata.parameters?.map((param: any) => {
                  const currentValue = selectedLayer.params?.[param.name]?.value ?? param.value;
                  
                  return (
                    <div key={param.name} className="effect-param">
                      <label className="param-label">{param.description || param.name}</label>
                      <div className="param-control">
                        {param.type === 'color' && (
                          <input
                            type="color"
                            value={currentValue}
                            onChange={(e) => handleEffectParamChange(param.name, e.target.value)}
                            className="color-picker"
                          />
                        )}
                        {param.type === 'select' && (
                          <select
                            value={currentValue}
                            onChange={(e) => handleEffectParamChange(param.name, e.target.value)}
                            className="param-select"
                          >
                            {param.options?.map((option: any) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {param.type === 'number' && (
                          <div className="number-control">
                            <input
                              type="range"
                              min={param.min || 0}
                              max={param.max || 1}
                              step={param.step || 0.1}
                              value={currentValue}
                              onChange={(e) => handleEffectParamChange(param.name, parseFloat(e.target.value))}
                              className="param-slider"
                            />
                            <span className="param-value">{currentValue}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                // Fallback: show parameters from layer.params, but filter out removed ones
                selectedLayer.params && Object.keys(selectedLayer.params).map((paramName) => {
                  // Skip parameters that were removed from PulseHexagon
                  if (paramName === 'intensity' || paramName === 'size' || paramName === 'speed') {
                    return null;
                  }
                  
                  const param = selectedLayer.params[paramName];
                  const currentValue = param?.value ?? 1.0;
                  
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
                          <div className="number-control">
                            <input
                              type="range"
                              min={param?.min || 0}
                              max={param?.max || 2}
                              step={param?.step || 0.1}
                              value={currentValue}
                              onChange={(e) => handleEffectParamChange(paramName, parseFloat(e.target.value))}
                              className="param-slider"
                            />
                            <span className="param-value">{currentValue}</span>
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
        {selectedLayer?.type === 'video' && (
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
          </div>
        )}

        {/* Effect-specific options */}
        {hasEffect && (
          <div className="option-group">
            <h4>Effect Options</h4>
            <div className="option-control">
              <p className="effect-info">Effects are automatically synchronized with BPM</p>
            </div>
          </div>
        )}

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
          <h4>Opacity</h4>
          <div className="option-control">
            <div className="opacity-control">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                onInput={(e) => handleOpacityChange(parseFloat(e.currentTarget.value))}
                className="opacity-slider"
              />
              <span className="opacity-value">{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        </div>

        <div className="option-group">
          <h4>Current Settings</h4>
          <div className="current-settings">
            <div className="setting-item">
              <span className="setting-label">Mode:</span>
              <span className="setting-value">{loopMode}</span>
            </div>
            {loopMode !== 'none' && (
              <div className="setting-item">
                <span className="setting-label">Count:</span>
                <span className="setting-value">{loopCount}</span>
              </div>
            )}
            <div className="setting-item">
              <span className="setting-label">Asset:</span>
              <span className="setting-value">{(selectedLayer as any).asset?.name || 'None'}</span>
            </div>
            <div className="setting-item">
              <span className="setting-label">Blend Mode:</span>
              <span className="setting-value">{blendMode}</span>
            </div>
            <div className="setting-item">
              <span className="setting-label">Opacity:</span>
              <span className="setting-value">{Math.round(opacity * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 