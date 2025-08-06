import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface VideoPulseEffectProps {
  videoTexture: THREE.VideoTexture;
  intensity?: number;
  speed?: number;
}

const VideoPulseEffect: React.FC<VideoPulseEffectProps> = ({ 
  videoTexture, 
  intensity = 0.3, 
  speed = 2.0 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      // Create a pulsing effect by modifying the material's color
      const pulse = Math.sin(state.clock.elapsedTime * speed) * intensity;
      const brightness = 1 + pulse;
      
      // Apply brightness to the material while preserving the video texture
      materialRef.current.color.setRGB(brightness, brightness, brightness);
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial 
        ref={materialRef}
        map={videoTexture}
        transparent
        opacity={0.9} // Slightly transparent to show video underneath
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending} // Use additive blending for overlay effect
        depthTest={false} // Ensure overlay renders on top
        depthWrite={false} // Don't write to depth buffer
      />
    </mesh>
  );
};

// Add metadata for the effect
(VideoPulseEffect as any).metadata = {
  name: 'Video Pulse',
  description: 'Adds a pulsing brightness effect to video',
  category: 'Video',
  icon: '💓',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'intensity',
      type: 'number',
      value: 0.3,
      min: 0.1,
      max: 1.0,
      step: 0.1,
      description: 'Pulse intensity'
    },
    {
      name: 'speed',
      type: 'number',
      value: 2.0,
      min: 0.5,
      max: 5.0,
      step: 0.1,
      description: 'Pulse speed'
    }
  ]
};

export default VideoPulseEffect; 