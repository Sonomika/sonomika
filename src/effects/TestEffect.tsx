// src/effects/TestEffect.tsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { registerEffect } from '../utils/effectRegistry';

interface TestEffectProps {
  color?: string;
  size?: number;
  speed?: number;
  rotation?: number;
}

const TestEffect: React.FC<TestEffectProps> = ({
  color = '#ff0000',
  size = 0.5,
  speed = 1.0,
  rotation = 0.5
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { bpm } = useStore();

  // Add debugging logs
  console.log('🎨 TestEffect component rendered with props:', { color, size, speed, rotation });

  useFrame((state) => {
    if (materialRef.current && meshRef.current) {
      // Simple rotation animation
      meshRef.current.rotation.x += 0.01 * speed;
      meshRef.current.rotation.y += 0.01 * speed;
      meshRef.current.rotation.z += 0.01 * rotation;
      
      // Pulse with BPM
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond;
      const pulse = Math.sin(beatTime * Math.PI * 2) * 0.3;
      const scale = 1 + pulse;
      
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.5]}>
      {/* Cube geometry */}
      <boxGeometry args={[size, size, size]} />
      <meshBasicMaterial 
        ref={materialRef}
        color={color}
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

// Metadata for dynamic discovery
(TestEffect as any).metadata = {
  name: 'Test Effect',
  description: 'A simple test effect with rotating cube',
  category: 'Test',
  icon: '🧪',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#ff0000',
      description: 'Cube color'
    },
    {
      name: 'size',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Cube size'
    },
    {
      name: 'speed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Rotation speed'
    },
    {
      name: 'rotation',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Z-axis rotation speed'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering TestEffect...');
registerEffect('TestEffect', TestEffect);
console.log('✅ TestEffect registered successfully');

export default TestEffect;
