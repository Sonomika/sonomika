import React, { useState } from 'react';
import { FilmNoiseEffect } from './FilmNoiseEffect';
import { FilmFlickerEffect } from './FilmFlickerEffect';
import { LightLeakEffect } from './LightLeakEffect';

interface FilmEffectsOverlayProps {
  noiseEnabled?: boolean;
  noiseIntensity?: number;
  noiseColor?: string;
  
  flickerEnabled?: boolean;
  flickerIntensity?: number;
  flickerSpeed?: number;
  flickerColor?: string;
  
  lightLeakEnabled?: boolean;
  lightLeakIntensity?: number;
  lightLeakColor?: string;
  lightLeakPosition?: 'left' | 'right' | 'top' | 'bottom';
  
  showControls?: boolean;
}

export const FilmEffectsOverlay: React.FC<FilmEffectsOverlayProps> = ({
  noiseEnabled = true,
  noiseIntensity = 0.3,
  noiseColor = '#ffffff',
  
  flickerEnabled = true,
  flickerIntensity = 0.2,
  flickerSpeed = 1,
  flickerColor = '#ffffff',
  
  lightLeakEnabled = false,
  lightLeakIntensity = 0.3,
  lightLeakColor = '#ff6b35',
  lightLeakPosition = 'right',
  
  showControls = false
}) => {
  const [localNoiseIntensity, setLocalNoiseIntensity] = useState(noiseIntensity);
  const [localFlickerIntensity, setLocalFlickerIntensity] = useState(flickerIntensity);
  const [localLightLeakIntensity, setLocalLightLeakIntensity] = useState(lightLeakIntensity);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Film Noise Effect */}
      {noiseEnabled && (
        <FilmNoiseEffect
          intensity={localNoiseIntensity}
          color={noiseColor}
          opacity={0.1}
        />
      )}
      
      {/* Film Flicker Effect */}
      {flickerEnabled && (
        <FilmFlickerEffect
          intensity={localFlickerIntensity}
          speed={flickerSpeed}
          color={flickerColor}
        />
      )}
      
      {/* Light Leak Effect */}
      {lightLeakEnabled && (
        <LightLeakEffect
          intensity={localLightLeakIntensity}
          color={lightLeakColor}
          position={lightLeakPosition}
          speed={0.5}
        />
      )}
      
      {/* Controls Panel */}
      {showControls && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '15px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '12px',
          zIndex: 1003,
          minWidth: '200px'
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Film Effects</h4>
          
          {/* Noise Controls */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Noise Intensity: {localNoiseIntensity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={localNoiseIntensity}
              onChange={(e) => setLocalNoiseIntensity(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          {/* Flicker Controls */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Flicker Intensity: {localFlickerIntensity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={localFlickerIntensity}
              onChange={(e) => setLocalFlickerIntensity(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          {/* Light Leak Controls */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Light Leak Intensity: {localLightLeakIntensity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={localLightLeakIntensity}
              onChange={(e) => setLocalLightLeakIntensity(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          
          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
            <button
              onClick={() => {
                setLocalNoiseIntensity(0.2);
                setLocalFlickerIntensity(0.1);
                setLocalLightLeakIntensity(0.2);
              }}
              style={{
                padding: '5px 10px',
                fontSize: '10px',
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Subtle
            </button>
            <button
              onClick={() => {
                setLocalNoiseIntensity(0.5);
                setLocalFlickerIntensity(0.3);
                setLocalLightLeakIntensity(0.4);
              }}
              style={{
                padding: '5px 10px',
                fontSize: '10px',
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Strong
            </button>
            <button
              onClick={() => {
                setLocalNoiseIntensity(0.8);
                setLocalFlickerIntensity(0.6);
                setLocalLightLeakIntensity(0.7);
              }}
              style={{
                padding: '5px 10px',
                fontSize: '10px',
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Heavy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 