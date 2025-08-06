import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TestEffectProps {
  videoTexture?: THREE.VideoTexture;
  color?: string;
  speed?: number;
}

const TestEffect: React.FC<TestEffectProps> = ({
  videoTexture,
  color = '#ff0000',
  speed = 1.0
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      // Simple rotation animation
      meshRef.current.rotation.z = state.clock.elapsedTime * speed;

      // Pulsing scale animation
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial 
        color={color}
        transparent
        opacity={0.3} // Very transparent overlay
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

// Add metadata for the effect
(TestEffect as any).metadata = {
  name: 'Test Effect',
  description: 'A simple test effect with rotation and pulsing animation',
  category: 'Test',
  icon: '🧪',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#ff0000',
      description: 'Color of the overlay'
    },
    {
      name: 'speed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Animation speed'
    }
  ]
};

export default TestEffect; 