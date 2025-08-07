// src/effects/PulseHexagon.tsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { registerEffect } from '../utils/effectRegistry';

interface PulseHexagonEffectProps {
  color?: string;
}

const PulseHexagon: React.FC<PulseHexagonEffectProps> = ({
  color = '#00ff00'
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { bpm } = useStore();

  // Add debugging logs
  console.log('🎨 PulseHexagon component rendered with props:', { color });

  useFrame((state) => {
    if (materialRef.current && meshRef.current) {
      // Calculate BPM-based pulse timing
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond;
      
      // Create a pulse that syncs with BPM
      const pulse = Math.sin(beatTime * Math.PI * 2);
      const opacity = Math.max(0.3, Math.min(1.0, 0.6 + pulse * 0.4));
      const scale = 1 + pulse * 0.2;
      
      materialRef.current.opacity = opacity;
      meshRef.current.scale.setScalar(scale);
      
      // Rotate the hexagon
      meshRef.current.rotation.z += 0.01;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.5]}>
      {/* Hexagon geometry */}
      <ringGeometry args={[0.8, 1.0, 6]} />
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
(PulseHexagon as any).metadata = {
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
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering PulseHexagon effect...');
registerEffect('PulseHexagon', PulseHexagon);
console.log('✅ PulseHexagon effect registered successfully');

export default PulseHexagon;
