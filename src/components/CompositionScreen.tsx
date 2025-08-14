import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { Timeline } from './Timeline';
import { ButtonGroup } from './ui';

interface CompositionScreenProps {
  className?: string;
}

export const CompositionScreen: React.FC<CompositionScreenProps> = ({ className = '' }) => {
  const { scenes, currentSceneId, bpm, setBpm } = useStore() as any;
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBpmDropdown, setShowBpmDropdown] = useState(false);

  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);

  // Common BPM presets
  const bpmPresets = [60, 80, 90, 100, 110, 120, 128, 140, 150, 160, 180, 200];

  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    setShowBpmDropdown(false);
  };

  const handleBpmInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (value >= 60 && value <= 200) {
      setBpm(value);
    }
  };

  return (
    <div className={`composition-screen ${className}`}>
      <div className="composition-header">
        <h2>Composition</h2>
        <div className="composition-controls">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className={`play-button ${isPlaying ? 'playing' : ''}`}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          
          <div className="bpm-control">
            <div 
              className="bpm-display"
              onClick={() => setShowBpmDropdown(!showBpmDropdown)}
            >
              <span className="bpm-label">BPM</span>
              <span className="bpm-value">{bpm}</span>
              <span className="bpm-arrow">▼</span>
            </div>
            
            {showBpmDropdown && (
              <div className="bpm-dropdown">
                <div className="bpm-input-section">
                  <label>Custom BPM:</label>
                  <input
                    type="number"
                    min="60"
                    max="200"
                    value={bpm}
                    onChange={handleBpmInputChange}
                    className="bpm-number-input"
                  />
                </div>
                
                <div className="bpm-presets">
                  <label>Presets:</label>
                  <ButtonGroup
                    options={bpmPresets.map(preset => ({ value: preset, label: preset.toString() }))}
                    value={bpm}
                    onChange={(value) => handleBpmChange(Number(value))}
                    columns={4}
                    size="small"
                  />
                </div>
                
                <div className="bpm-slider-section">
                  <label>Fine-tune:</label>
                  <input
                    type="range"
                    min="60"
                    max="200"
                    value={bpm}
                    onChange={(e) => setBpm(parseInt(e.target.value))}
                    className="bpm-range-slider"
                  />
                  <span className="bpm-slider-value">{bpm}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="composition-content">
        <Timeline onClose={() => {}} />
      </div>
    </div>
  );
}; 