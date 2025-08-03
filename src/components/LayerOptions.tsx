import React, { useState } from 'react';
import { LOOP_MODES, type LoopMode } from '../constants/video';
import type { Layer } from '../types/layer';

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
      
      <div className="layer-options-content">
        <div className="option-group">
          <h4>Loop Mode</h4>
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