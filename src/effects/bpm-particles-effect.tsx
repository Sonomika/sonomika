import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BPMParticlesEffectProps {
  bpm?: number;
  intensity?: number;
  particleCount?: number;
  color?: string;
  size?: number;
  speed?: number;
}

export const BPMParticlesEffect: React.FC<BPMParticlesEffectProps> = ({
  bpm = 120,
  intensity = 1.0,
  particleCount = 100,
  color = '#ff6b6b',
  size = 0.1,
  speed = 1.0
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const positionsRef = useRef<Float32Array>(null);
  const velocitiesRef = useRef<Float32Array>(null);

  // Calculate BPM timing
  const beatInterval = 60 / bpm; // seconds per beat
  const beatTime = useRef(0);
  const lastBeatTime = useRef(0);

  // Create particle system
  const { positions, velocities, colors } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorObj = new THREE.Color(color);

    for (let i = 0; i < particleCount; i++) {
      // Random positions in a sphere
      const radius = Math.random() * 2 + 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Random velocities
      velocities[i * 3] = (Math.random() - 0.5) * speed;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * speed;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * speed;

      // Colors
      colors[i * 3] = colorObj.r;
      colors[i * 3 + 1] = colorObj.g;
      colors[i * 3 + 2] = colorObj.b;
    }

    // Store refs for animation
    positionsRef.current = positions;
    velocitiesRef.current = velocities;

    return { positions, velocities, colors };
  }, [particleCount, color, speed]);

  // Create circle geometry and material
  const geometry = useMemo(() => {
    return new THREE.CircleGeometry(size, 16); // Circle with 16 segments
  }, [size]);

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }, [color]);

  useFrame((state, delta) => {
    if (!meshRef.current || !positionsRef.current || !velocitiesRef.current) return;

    // Update beat timing
    beatTime.current += delta;
    
    // Check if we're on a beat
    const isOnBeat = beatTime.current - lastBeatTime.current >= beatInterval;
    if (isOnBeat) {
      lastBeatTime.current = beatTime.current;
    }

    // Get current positions and velocities
    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;

    // Update particle positions
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Apply velocities
      positions[i3] += velocities[i3] * delta;
      positions[i3 + 1] += velocities[i3 + 1] * delta;
      positions[i3 + 2] += velocities[i3 + 2] * delta;

      // BPM-driven effects
      if (isOnBeat) {
        // Pulse effect on beat
        const pulse = Math.sin(beatTime.current * 10) * intensity * 0.5;
        positions[i3] *= 1 + pulse;
        positions[i3 + 1] *= 1 + pulse;
        positions[i3 + 2] *= 1 + pulse;
      }

      // Bounce off boundaries
      const maxDistance = 3;
      const distance = Math.sqrt(
        positions[i3] ** 2 + 
        positions[i3 + 1] ** 2 + 
        positions[i3 + 2] ** 2
      );

      if (distance > maxDistance) {
        // Normalize and scale back
        const scale = maxDistance / distance;
        positions[i3] *= scale;
        positions[i3 + 1] *= scale;
        positions[i3 + 2] *= scale;

        // Reverse velocity
        velocities[i3] *= -0.8;
        velocities[i3 + 1] *= -0.8;
        velocities[i3 + 2] *= -0.8;
      }
    }

    // Update instanced mesh positions
    if (meshRef.current) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        matrix.setPosition(positions[i3], positions[i3 + 1], positions[i3 + 2]);
        meshRef.current.setMatrixAt(i, matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Rotate the entire system
    meshRef.current.rotation.x += delta * 0.1;
    meshRef.current.rotation.y += delta * 0.15;
  });

  return (
    <instancedMesh ref={meshRef} geometry={geometry} material={material} args={[undefined, undefined, particleCount]} />
  );
};

// Metadata for dynamic discovery
export const BPMParticlesEffectMeta = {
  id: 'bpm-particles-effect',
  name: 'BPM Particles',
  type: 'threejs',
  description: 'Particle system synchronized with BPM',
  parameters: {
    bpm: { type: 'number', default: 120, min: 60, max: 200, label: 'BPM' },
    intensity: { type: 'number', default: 1.0, min: 0.1, max: 3.0, label: 'Intensity' },
    particleCount: { type: 'number', default: 100, min: 10, max: 500, label: 'Particle Count' },
    color: { type: 'color', default: '#ff6b6b', label: 'Color' },
    size: { type: 'number', default: 0.1, min: 0.01, max: 0.5, label: 'Particle Size' },
    speed: { type: 'number', default: 1.0, min: 0.1, max: 5.0, label: 'Speed' }
  }
};

export default BPMParticlesEffect; 