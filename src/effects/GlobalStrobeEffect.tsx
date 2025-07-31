import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GlobalStrobeEffectProps {
  bpm?: number;
  intensity?: number;
  frequency?: number;
}

const GlobalStrobeEffect: React.FC<GlobalStrobeEffectProps> = ({
  bpm = 120,
  intensity = 0.8,
  frequency = 1.0
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(4, 2);
  }, []);

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }, []);

  useFrame((state) => {
    if (meshRef.current) {
      timeRef.current += state.clock.getDelta();

      const beatsPerSecond = bpm / 60;
      const strobePhase = timeRef.current * beatsPerSecond * frequency;
      const strobe = Math.sin(strobePhase * Math.PI * 2) * 0.5 + 0.5;

      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      if (material) {
        // Create strobe effect - flash white overlay
        material.opacity = strobe * intensity;
        
        // Add some color variation
        const hue = (timeRef.current * 50) % 360;
        const saturation = 0.8;
        const lightness = 0.5 + strobe * 0.3;
        material.color.setHSL(hue / 360, saturation, lightness);
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};

export default GlobalStrobeEffect; 