import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';

interface BPMParticleEffectProps {
  count?: number;
  speed?: number;
  size?: number;
  color?: string;
  spread?: number;
  pulseIntensity?: number;
}

const BPMParticleEffect: React.FC<BPMParticleEffectProps> = ({ 
  count = 1000, 
  speed = 0.5, 
  size = 0.02, 
  color = '#ffffff',
  spread = 10,
  pulseIntensity = 0.5
}) => {
  const meshRef = useRef<THREE.Points>(null);
  const { bpm } = useStore();
  const [particles, setParticles] = useState<Float32Array | null>(null);

  // Create particle positions with vibrant multi-colors (same as ParticleEffect)
  const particlePositions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    // Define vibrant color palettes
    const colorPalettes = [
      [1.0, 0.2, 0.8], // Hot pink
      [0.2, 1.0, 0.8], // Cyan
      [1.0, 0.8, 0.2], // Yellow
      [0.8, 0.2, 1.0], // Purple
      [1.0, 0.4, 0.2], // Orange
      [0.2, 0.8, 1.0], // Light blue
      [1.0, 0.2, 0.4], // Rose
      [0.4, 1.0, 0.2], // Lime
    ];
    
    for (let i = 0; i < count; i++) {
      // Random positions within spread
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      
      // Pick a random vibrant color from palette
      const colorIndex = Math.floor(Math.random() * colorPalettes.length);
      const baseColor = colorPalettes[colorIndex];
      
      // Add some variation to the base color
      colors[i * 3] = baseColor[0] + (Math.random() - 0.5) * 0.3; // R
      colors[i * 3 + 1] = baseColor[1] + (Math.random() - 0.5) * 0.3; // G
      colors[i * 3 + 2] = baseColor[2] + (Math.random() - 0.5) * 0.3; // B
      
      // Ensure colors stay in valid range
      colors[i * 3] = Math.max(0, Math.min(1, colors[i * 3]));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, colors[i * 3 + 1]));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, colors[i * 3 + 2]));
    }
    
    return { positions, colors };
  }, [count, spread]);

  // Create geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particlePositions.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(particlePositions.colors, 3));
    return geo;
  }, [particlePositions]);

  // Create material with size variation
  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: size,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
  }, [size]);

  // Enhanced animation with BPM synchronization
  useFrame((state) => {
    if (meshRef.current) {
      const elapsedTime = state.clock.elapsedTime;
      const beatsPerSecond = bpm / 60;
      const beatPhase = (elapsedTime * beatsPerSecond) % 1; // 0 to 1 over one beat
      
      // Rotate the entire particle system with BPM-synchronized motion
      const rotationSpeed = beatsPerSecond * 0.1; // Sync rotation with BPM
      meshRef.current.rotation.x = Math.sin(elapsedTime * rotationSpeed) * 0.2;
      meshRef.current.rotation.y = Math.sin(elapsedTime * rotationSpeed * 1.5) * 0.2;
      meshRef.current.rotation.z = Math.cos(elapsedTime * rotationSpeed * 0.7) * 0.1;
      
      // Move particles with BPM-synchronized patterns
      const positions = meshRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < count; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        
        // Create BPM-synchronized spiral motion
        const angle = elapsedTime * speed * beatsPerSecond + i * 0.01;
        const radius = Math.sin(elapsedTime * beatsPerSecond * 0.3 + i * 0.02) * 0.5 + 0.5;
        
        // Add spiral motion synchronized with BPM
        positions[i * 3] = x + Math.sin(angle) * radius * 0.02;
        positions[i * 3 + 1] = y + Math.cos(angle) * radius * 0.02;
        positions[i * 3 + 2] = z + Math.sin(angle * 0.7) * 0.01;
        
        // Add BPM-synchronized chaotic movement
        const chaosSpeed = beatsPerSecond * 2;
        positions[i * 3] += Math.sin(elapsedTime * chaosSpeed + i * 0.1) * 0.005;
        positions[i * 3 + 1] += Math.cos(elapsedTime * chaosSpeed * 0.75 + i * 0.1) * 0.005;
        positions[i * 3 + 2] += Math.sin(elapsedTime * chaosSpeed * 1.5 + i * 0.1) * 0.003;
        
        // BPM-synchronized pulse effect on particle size
        const pulse = Math.sin(beatPhase * Math.PI * 2) * pulseIntensity + 1;
        const currentSize = size * pulse;
        
        // Wrap particles back to bounds with bounce effect
        if (Math.abs(x) > spread / 2) {
          positions[i * 3] = Math.sign(x) * (spread / 2 - 0.5);
        }
        if (Math.abs(y) > spread / 2) {
          positions[i * 3 + 1] = Math.sign(y) * (spread / 2 - 0.5);
        }
        if (Math.abs(z) > spread / 2) {
          positions[i * 3 + 2] = Math.sign(z) * (spread / 2 - 0.5);
        }
      }
      
      meshRef.current.geometry.attributes.position.needsUpdate = true;
      
      // Update material size based on BPM pulse
      const pulse = Math.sin(beatPhase * Math.PI * 2) * pulseIntensity + 1;
      material.size = size * pulse;
    }
  });

  useEffect(() => {
    console.log('BPMParticleEffect: Created with', count, 'particles, BPM:', bpm);
  }, [count, bpm]);

  return (
    <points ref={meshRef} geometry={geometry} material={material} />
  );
};

// Metadata for the effect library
export const BPMParticleEffectMetadata = {
  name: 'BPM Particle Effect',
  description: 'Particles that move and pulse in time with the BPM',
  category: 'BPM',
  parameters: [
    {
      name: 'count',
      type: 'number',
      min: 100,
      max: 2000,
      step: 100,
      default: 1000,
      label: 'Particle Count'
    },
    {
      name: 'speed',
      type: 'number',
      min: 0.1,
      max: 2,
      step: 0.1,
      default: 0.5,
      label: 'Speed'
    },
    {
      name: 'size',
      type: 'number',
      min: 0.01,
      max: 0.1,
      step: 0.01,
      default: 0.02,
      label: 'Particle Size'
    },
    {
      name: 'color',
      type: 'color',
      default: '#ffffff',
      label: 'Color'
    },
    {
      name: 'spread',
      type: 'number',
      min: 5,
      max: 20,
      step: 1,
      default: 10,
      label: 'Spread'
    },
    {
      name: 'pulseIntensity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      default: 0.5,
      label: 'BPM Pulse Intensity'
    }
  ]
};

export default BPMParticleEffect; 