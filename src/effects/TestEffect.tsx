import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { registerEffect } from '../utils/effectRegistry';

interface TestEffectProps {
  videoTexture?: THREE.VideoTexture;
  color?: string;
  speed?: number;
  intensity?: number;
  geometryArgs?: [number, number];
}

const TestEffect: React.FC<TestEffectProps> = ({
  videoTexture,
  color = '#ff0000',
  speed = 2.0,
  intensity = 0.3,
  geometryArgs = [2, 2]
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { bpm } = useStore();

  useFrame((state) => {
    if (materialRef.current && meshRef.current) {
      // Calculate BPM-based pulse timing
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond;
      
      // Create a pulse that syncs with BPM (quarter notes)
      const pulse = Math.sin(beatTime * Math.PI * 2) * intensity;
      const opacity = Math.max(0.2, Math.min(1.0, 0.6 + pulse * 0.4)); // More dramatic pulse
      const scale = 1 + pulse * 0.3; // Scale pulsing effect
      
      materialRef.current.opacity = opacity;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      {/* Small circle geometry for the dot */}
      <circleGeometry args={[0.1, 32]} />
      <meshBasicMaterial 
        ref={materialRef}
        color={color}
        transparent
        opacity={0.5}
        blending={THREE.NormalBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

// Add metadata for the effect
(TestEffect as any).metadata = {
  name: 'BPM Red Dot',
  description: 'A small red dot that pulses in sync with the BPM',
  category: 'Test',
  icon: '🔴',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#ff0000',
      description: 'Dot color'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 0.3,
      min: 0.1,
      max: 1.0,
      step: 0.1,
      description: 'Pulse intensity'
    }
  ]
};

// Self-register the effect
registerEffect('TestEffect', TestEffect);
registerEffect('test-effect', TestEffect); // Also register with kebab-case ID for backward compatibility

export default TestEffect; 