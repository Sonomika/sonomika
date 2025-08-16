import React, { useState } from 'react';
import { useStore } from '../store/store';
import { Timeline } from './Timeline';
import { ButtonGroup, Popover, PopoverTrigger, PopoverContent, Slider } from './ui';
import { PlayIcon, PauseIcon } from '@radix-ui/react-icons';

interface CompositionScreenProps {
  className?: string;
}

export const CompositionScreen: React.FC<CompositionScreenProps> = ({ className = '' }) => {
  const { bpm, setBpm } = useStore() as any;
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBpmDropdown, setShowBpmDropdown] = useState(false);

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
            {isPlaying ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
          </button>
          
          <div className="bpm-control">
            <Popover open={showBpmDropdown} onOpenChange={setShowBpmDropdown}>
              <PopoverTrigger asChild>
                <button 
                  className="bpm-display"
                  onClick={() => setShowBpmDropdown(!showBpmDropdown)}
                >
                  <span className="bpm-label">BPM</span>
                  <span className="bpm-value">{bpm}</span>
                  <span className="bpm-arrow">▼</span>
                </button>
              </PopoverTrigger>
              {showBpmDropdown && (
                <PopoverContent className="tw-w-[320px]">
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
                    <div className="tw-py-1.5">
                      <Slider value={bpm} min={60} max={200} step={1} onChange={(v) => setBpm(v)} />
                    </div>
                    <span className="bpm-slider-value">{bpm}</span>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>
        </div>
      </div>
      
      <div className="composition-content">
        <Timeline onClose={() => {}} />
      </div>
    </div>
  );
}; 