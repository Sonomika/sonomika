import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';

// ✅ Correct metadata structure for current system
export const metadata = {
  name: "Bouncing Particles",
  description: "Bouncing 3D particles bouncing off invisible boundaries with BPM-synced pulsing.",
  category: "Sources", // This generates content, so it's a source
  author: "VJ System",
  version: "1.0.0",
  parameters: [
    {
      name: 'count',
      type: 'number' as const,
      value: 100,
      min: 10,
      max: 500,
      step: 10
    },
    {
      name: 'speed',
      type: 'number' as const,
      value: 1,
      min: 0.1,
      max: 5,
      step: 0.1
    },
    {
      name: 'size',
      type: 'number' as const,
      value: 0.1,
      min: 0.05,
      max: 0.5,
      step: 0.05
    },
    {
      name: 'color',
      type: 'color' as const,
      value: '#ff4444'
    }
  ]
};

interface BouncingParticlesProps {
  count?: number;
  speed?: number;
  size?: number;
  color?: string;
}

const BouncingParticles: React.FC<BouncingParticlesProps> = ({
  count = 100,
  speed = 1,
  size = 0.1,
  color = '#ff4444',
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { bpm } = useStore();

  // Calculate speed factor based on BPM for synchronization
  const speedFactor = useMemo(() => {
    return (bpm / 120) * speed;
  }, [bpm, speed]);

  // Initialize particles data
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      temp.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2
        ),
        size: size * (0.5 + Math.random()),
      });
    }
    return temp;
  }, [count, size]);

  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.elapsedTime;
    const pulse = Math.sin(time * speedFactor * 2) * 0.5 + 0.5;

    particles.forEach((particle, i) => {
      // Update position based on velocity
      particle.position.add(particle.velocity.clone().multiplyScalar(speedFactor));

      // Bounce off boundaries
      const boundary = 3;
      if (Math.abs(particle.position.x) > boundary) {
        particle.position.x = Math.sign(particle.position.x) * boundary;
        particle.velocity.x *= -0.9;
      }
      if (Math.abs(particle.position.y) > boundary) {
        particle.position.y = Math.sign(particle.position.y) * boundary;
        particle.velocity.y *= -0.9;
      }
      if (Math.abs(particle.position.z) > boundary) {
        particle.position.z = Math.sign(particle.position.z) * boundary;
        particle.velocity.z *= -0.9;
      }

      // Apply a subtle pulsing scale effect synced with BPM
      const mesh = groupRef.current?.children[i] as THREE.Mesh;
      if (mesh) {
        mesh.position.copy(particle.position);
        mesh.scale.setScalar(particle.size * (0.8 + pulse * 0.2));
      }
    });
  });

  return (
    <group ref={groupRef}>
      {particles.map((particle, i) => (
        <mesh key={i} position={particle.position}>
          <sphereGeometry args={[particle.size, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
};

// ✅ Correct export - no registerEffect call needed
export default BouncingParticles;
