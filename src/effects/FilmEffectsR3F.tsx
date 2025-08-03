import React from 'react';
import { Canvas } from '@react-three/fiber';
import FilmNoiseEffectR3F from './FilmNoiseEffectR3F';
import FilmFlickerEffectR3F from './FilmFlickerEffectR3F';
import LightLeakEffectR3F from './LightLeakEffectR3F';

interface FilmEffectsR3FProps {
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

const FilmEffectsR3F: React.FC<FilmEffectsR3FProps> = ({
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
  return (
    <div style={{ 
      position: 'absolute', 
      top: 0, 
      left: 0, 
      width: '100%', 
      height: '100%',
      pointerEvents: 'none',
      zIndex: 1000
    }}>
      <Canvas
        camera={{ position: [0, 0, 2], fov: 90 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ 
          alpha: true, 
          antialias: false,
          preserveDrawingBuffer: true
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        {/* Film Noise Effect */}
        {noiseEnabled && (
          <FilmNoiseEffectR3F
            intensity={noiseIntensity}
            color={noiseColor}
            opacity={0.4}
          />
        )}
        
        {/* Film Flicker Effect */}
        {flickerEnabled && (
          <FilmFlickerEffectR3F
            intensity={flickerIntensity}
            speed={flickerSpeed}
            color={flickerColor}
          />
        )}
        
        {/* Light Leak Effect */}
        {lightLeakEnabled && (
          <LightLeakEffectR3F
            intensity={lightLeakIntensity}
            color={lightLeakColor}
            position={lightLeakPosition}
            speed={0.5}
          />
        )}
      </Canvas>
    </div>
  );
};

export default FilmEffectsR3F; 