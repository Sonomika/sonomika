import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TestEffectProps {
  color?: string;
  speed?: number;
}

const TestEffect: React.FC<TestEffectProps> = ({ 
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
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

export default TestEffect; 