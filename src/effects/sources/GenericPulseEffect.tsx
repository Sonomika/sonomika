import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface GenericPulseEffectProps {
  videoTexture?: THREE.VideoTexture;
  color?: string;
  speed?: number;
  intensity?: number;
  geometryType?: 'sphere' | 'cube' | 'plane';
  geometryArgs?: [number, number] | [number, number, number];
}

const GenericPulseEffect: React.FC<GenericPulseEffectProps> = ({
  videoTexture,
  color = '#ff6666',
  speed = 2.0,
  intensity = 0.2,
  geometryType = 'sphere',
  geometryArgs = [0.5, 16, 16]
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { bpm } = useStore();

  useFrame((state) => {
    if (meshRef.current && materialRef.current) {
      // Calculate BPM-based timing
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond;
      
      // Apply pulsing animation
      const pulse = Math.sin(beatTime * Math.PI * 2) * intensity;
      const scale = 1 + pulse * 0.3;
      meshRef.current.scale.setScalar(scale);
      
      // Apply rotation animation
      meshRef.current.rotation.z = beatTime * 2;
    }
  });

  const geometry = React.useMemo(() => {
    switch (geometryType) {
      case 'sphere':
        return new THREE.SphereGeometry(...geometryArgs);
      case 'cube':
        return new THREE.BoxGeometry(...geometryArgs);
      case 'plane':
        return new THREE.PlaneGeometry(...geometryArgs);
      default:
        return new THREE.SphereGeometry(0.5, 16, 16);
    }
  }, [geometryType, geometryArgs]);

  const material = React.useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
  }, [color]);

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};

// Add metadata for the effect
(GenericPulseEffect as any).metadata = {
  name: 'Generic Pulse',
  description: 'A generic pulsing effect with rotation and scaling',
  category: 'Animation',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#ff6666',
      description: 'Effect color'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 0.2,
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
      description: 'Animation speed'
    },
    {
      name: 'geometryType',
      type: 'select',
      value: 'sphere',
      options: ['sphere', 'cube', 'plane'],
      description: 'Geometry type'
    }
  ]
};

// Self-register the effect
registerEffect('GenericPulseEffect', GenericPulseEffect);

export default GenericPulseEffect; 