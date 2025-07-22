import React, { useState } from 'react';

interface LayerOptionsProps {
  selectedLayer: any;
  onUpdateLayer: (layerId: string, options: any) => void;
}

export const LayerOptions: React.FC<LayerOptionsProps> = ({ selectedLayer, onUpdateLayer }) => {
  // Update local state when selectedLayer changes
  const [loopMode, setLoopMode] = useState(selectedLayer?.loopMode || 'none');
  const [loopCount, setLoopCount] = useState(selectedLayer?.loopCount || 1);
  const [reverseEnabled, setReverseEnabled] = useState(selectedLayer?.reverseEnabled || false);
  const [pingPongEnabled, setPingPongEnabled] = useState(selectedLayer?.pingPongEnabled || false);

  // Sync local state with selectedLayer when it changes
  React.useEffect(() => {
    if (selectedLayer) {
      setLoopMode(selectedLayer.loopMode || 'none');
      setLoopCount(selectedLayer.loopCount || 1);
      setReverseEnabled(selectedLayer.reverseEnabled || false);
      setPingPongEnabled(selectedLayer.pingPongEnabled || false);
    }
  }, [selectedLayer]);

  const handleLoopModeChange = (mode: string) => {
    setLoopMode(mode);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...selectedLayer,
        loopMode: mode,
        loopCount: mode === 'none' ? 1 : loopCount,
        reverseEnabled: mode === 'reverse' ? true : false,
        pingPongEnabled: mode === 'ping-pong' ? true : false
      });
    }
  };

  const handleLoopCountChange = (count: number) => {
    setLoopCount(count);
    if (selectedLayer) {
      onUpdateLayer(selectedLayer.id, {
        ...selectedLayer,
        loopCount: count
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
            <div className="icon">🎛️</div>
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
                className={`loop-btn ${loopMode === 'none' ? 'active' : ''}`}
                onClick={() => handleLoopModeChange('none')}
              >
                None
              </button>
              <button
                className={`loop-btn ${loopMode === 'loop' ? 'active' : ''}`}
                onClick={() => handleLoopModeChange('loop')}
              >
                Loop
              </button>
              <button
                className={`loop-btn ${loopMode === 'reverse' ? 'active' : ''}`}
                onClick={() => handleLoopModeChange('reverse')}
              >
                Reverse
              </button>
              <button
                className={`loop-btn ${loopMode === 'ping-pong' ? 'active' : ''}`}
                onClick={() => handleLoopModeChange('ping-pong')}
              >
                Ping-Pong
              </button>
            </div>
          </div>
        </div>

        {loopMode !== 'none' && (
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
              <span className="setting-value">{selectedLayer.asset?.name || 'None'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 