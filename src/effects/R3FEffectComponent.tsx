import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { R3FBaseEffect, R3FEffectProps } from './R3FBaseEffect';

interface R3FEffectComponentProps extends R3FEffectProps {
  EffectClass: new () => R3FBaseEffect;
}

export const R3FEffectComponent: React.FC<R3FEffectComponentProps> = ({ 
  EffectClass, 
  bpm = 120, 
  parameters = {} 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const effectRef = useRef<R3FBaseEffect>();
  
  // Create effect instance
  const effect = useMemo(() => {
    const newEffect = new EffectClass();
    effectRef.current = newEffect;
    return newEffect;
  }, [EffectClass]);

  // Update BPM
  useEffect(() => {
    effect.setBPM(bpm);
  }, [bpm, effect]);

  // Update parameters
  useEffect(() => {
    Object.entries(parameters).forEach(([name, value]) => {
      effect.setParameter(name, value);
    });
  }, [parameters, effect]);

  // Create mesh if it doesn't exist
  useEffect(() => {
    if (meshRef.current && effect) {
      // If the effect has a createMesh method, use it
      if ('createMesh' in effect && typeof (effect as any).createMesh === 'function') {
        const newMesh = (effect as any).createMesh();
        if (newMesh) {
          // Replace the current mesh
          meshRef.current.geometry.dispose();
          if (Array.isArray(meshRef.current.material)) {
            meshRef.current.material.forEach(mat => mat.dispose());
          } else {
            meshRef.current.material.dispose();
          }
          meshRef.current.geometry = newMesh.geometry;
          meshRef.current.material = newMesh.material;
        }
      }
    }
  }, [effect]);

  // Animation frame
  useFrame((state, deltaTime) => {
    if (effect) {
      effect.updateTime(deltaTime);
      
      // Update mesh if the effect has an updateMesh method
      if (meshRef.current && 'updateMesh' in effect && typeof (effect as any).updateMesh === 'function') {
        (effect as any).updateMesh(meshRef.current, deltaTime);
      }
    }
  });

  // Default geometry and material if effect doesn't provide custom ones
  const geometry = useMemo(() => new THREE.CircleGeometry(1, 32), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ 
    color: 0x0000ff, 
    transparent: true, 
    opacity: 0.8 
  }), []);

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
}; 