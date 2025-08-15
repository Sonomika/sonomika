import React, { useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/store';
// EffectLoader import removed - using dynamic loading instead
import { Layer, AppState, LayerParamValue } from '../store/types';

type StoreActions = {
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
};

type Store = AppState & StoreActions;

interface Props {
  layer: Layer;
}

export const LayerControls: React.FC<Props> = ({ layer }) => {
  const { updateLayer } = useStore() as Store;

  // Using dynamic discovery instead of EffectLoader
  console.log('Getting metadata for layer controls:', layer.type);
  const metadata = null; // TODO: Implement dynamic metadata loading

  // Batch parameter updates to prevent cascading re-renders
  const updateTimeoutRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<Record<string, any>>({});

  const flushUpdates = useCallback(() => {
    if (Object.keys(pendingUpdatesRef.current).length > 0) {
      console.log('🔄 Flushing parameter updates:', {
        layerId: layer.id,
        updates: pendingUpdatesRef.current,
        currentParams: layer.params
      });
      updateLayer(layer.id, {
        params: {
          ...layer.params,
          ...Object.entries(pendingUpdatesRef.current).reduce((acc, [name, value]) => ({
            ...acc,
            [name]: { ...layer.params[name], value } as LayerParamValue,
          }), {}),
        },
      });
      pendingUpdatesRef.current = {};
    }
    updateTimeoutRef.current = null;
  }, [layer.id, layer.params, updateLayer]);

  const handleParamChange = (name: string, value: number | boolean | string) => {
    pendingUpdatesRef.current[name] = value;
    
    if (updateTimeoutRef.current !== null) {
      cancelAnimationFrame(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = requestAnimationFrame(flushUpdates);
  };

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current !== null) {
        cancelAnimationFrame(updateTimeoutRef.current);
      }
    };
  }, []);

  // Flush any pending updates when layer changes
  useEffect(() => {
    flushUpdates();
  }, [layer.id, flushUpdates]);

  const handleParamChangeImmediate = (name: string, value: number | boolean | string) => {
    updateLayer(layer.id, {
      params: {
        ...layer.params,
        [name]: { ...layer.params[name], value } as LayerParamValue,
      },
    });
  };

  const handleOpacityChange = (opacity: number) => {
    updateLayer(layer.id, { opacity });
  };

  const handleBlendModeChange = (blendMode: Layer['blendMode']) => {
    updateLayer(layer.id, { blendMode });
  };

  const handleToggleMute = () => {
    updateLayer(layer.id, { mute: !layer.mute });
  };

  const handleToggleSolo = () => {
    updateLayer(layer.id, { solo: !layer.solo });
  };

  const handleToggleLock = () => {
    updateLayer(layer.id, { locked: !layer.locked });
  };

  const getParamValue = (name: string) => {
    return (layer.params[name] as LayerParamValue)?.value;
  };

  return (
    <div className="layer-controls">
      <div className="layer-header">
        <h3>{layer.name}</h3>
        <div className="layer-toggles">
          <button
            className={`toggle-btn ${layer.mute ? 'active' : ''}`}
            onClick={handleToggleMute}
            title="Mute (M)"
          >
            M
          </button>
          <button
            className={`toggle-btn ${layer.solo ? 'active' : ''}`}
            onClick={handleToggleSolo}
            title="Solo (S)"
          >
            S
          </button>
          <button
            className={`toggle-btn ${layer.locked ? 'active' : ''}`}
            onClick={handleToggleLock}
            title="Lock (L)"
          >
            L
          </button>
        </div>
      </div>

      <div className="control-group">
        <label>
          Opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={layer.opacity}
            onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
          />
          <span>{Math.round(layer.opacity * 100)}%</span>
        </label>
      </div>

      <div className="control-group">
        <label>
          Blend Mode
          <select
            value={layer.blendMode}
            onChange={(e) => handleBlendModeChange(e.target.value as Layer['blendMode'])}
          >
            <option value="normal">Normal</option>
            <option value="multiply">Multiply</option>
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="darken">Darken</option>
            <option value="lighten">Lighten</option>
            <option value="color-dodge">Color Dodge</option>
            <option value="color-burn">Color Burn</option>
            <option value="hard-light">Hard Light</option>
            <option value="soft-light">Soft Light</option>
            <option value="difference">Difference</option>
            <option value="exclusion">Exclusion</option>
          </select>
        </label>
      </div>

      {metadata?.parameters.map(param => (
        <div key={param.name} className="control-group">
          <label>
            {param.name}
            {param.type === 'number' && (
              <>
                <input
                  type="range"
                  min={param.min || 0}
                  max={param.max || 1}
                  step={param.step || 0.01}
                  value={getParamValue(param.name) as number}
                  onChange={(e) => handleParamChange(param.name, parseFloat(e.target.value))}
                  onPointerUp={() => flushUpdates()} // Ensure final value is committed
                />
                <span>{getParamValue(param.name)}</span>
              </>
            )}
            {param.type === 'boolean' && (
              <input
                type="checkbox"
                checked={getParamValue(param.name) as boolean}
                onChange={(e) => handleParamChangeImmediate(param.name, e.target.checked)}
              />
            )}
            {param.type === 'select' && param.options && (
              <select
                value={getParamValue(param.name) as string}
                onChange={(e) => handleParamChangeImmediate(param.name, e.target.value)}
              >
                {param.options.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
      ))}
    </div>
  );
}; 