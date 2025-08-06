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
      
      // Apply brightness to the material
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
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

export default VideoPulseEffect; 