import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { Timeline } from './Timeline';

interface CompositionScreenProps {
  className?: string;
}

export const CompositionScreen: React.FC<CompositionScreenProps> = ({ className = '' }) => {
  const { scenes, currentSceneId, bpm, setBpm } = useStore() as any;
  const [isPlaying, setIsPlaying] = useState(false);

  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);

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
          <span className="bpm-display">BPM: {bpm}</span>
          <input
            type="range"
            min="60"
            max="200"
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            className="bpm-slider"
          />
        </div>
      </div>
      
      <div className="composition-content">
        <Timeline onClose={() => {}} />
      </div>
    </div>
  );
}; 