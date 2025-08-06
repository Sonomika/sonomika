// src/effects/PulseHexagonEffect.tsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';

interface PulseHexagonEffectProps {
  color?: string;
  intensity?: number;
  size?: number;
  speed?: number;
}

const PulseHexagonEffect: React.FC<PulseHexagonEffectProps> = ({
  color = '#00ff00',
  intensity = 0.5,
  size = 0.5,
  speed = 1.0
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { bpm } = useStore();

  useFrame((state) => {
    if (materialRef.current && meshRef.current) {
      // Calculate BPM-based pulse timing
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond * speed;
      
      // Create a pulse that syncs with BPM
      const pulse = Math.sin(beatTime * Math.PI * 2) * intensity;
      const opacity = Math.max(0.3, Math.min(1.0, 0.6 + pulse * 0.4));
      const scale = 1 + pulse * 0.2;
      
      materialRef.current.opacity = opacity;
      meshRef.current.scale.setScalar(scale);
      
      // Rotate the hexagon
      meshRef.current.rotation.z += 0.01 * speed;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      {/* Hexagon geometry */}
      <ringGeometry args={[size * 0.8, size, 6]} />
      <meshBasicMaterial 
        ref={materialRef}
        color={color}
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

// Metadata for dynamic discovery
(PulseHexagonEffect as any).metadata = {
  id: 'hexagon',
  name: 'Pulse Hexagon',
  description: 'A hexagonal shape that pulses with the BPM',
  category: 'Pulse',
  icon: '⬡',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#00ff00',
      description: 'Hexagon colour'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Pulse intensity'
    },
    {
      name: 'size',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Hexagon size'
    },
    {
      name: 'speed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Pulse speed multiplier'
    }
  ]
};

export default PulseHexagonEffect;
