import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface RotatingParticleEffectProps {
  rotationSpeed?: number;
  particleCount?: number;
  particleSize?: number;
  particleSpeed?: number;
  orbitRadius?: number;
  centralObject?: 'cube' | 'sphere' | 'torus' | 'octahedron';
  particleColor?: string;
  centralColor?: string;
  bpm?: number;
}

const RotatingParticleEffect: React.FC<RotatingParticleEffectProps> = ({
  rotationSpeed = 1.0,
  particleCount = 100,
  particleSize = 0.1,
  particleSpeed = 1.0,
  orbitRadius = 3.0,
  centralObject = 'cube',
  particleColor = '#ffffff',
  centralColor = '#ffffff',
  bpm = 120
}) => {
  const centralRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const particlesMaterialRef = useRef<THREE.PointsMaterial>(null);

  // Create central geometry based on selected object
  const centralGeometry = useMemo(() => {
    switch (centralObject) {
      case 'sphere':
        return new THREE.SphereGeometry(0.5, 32, 32);
      case 'torus':
        return new THREE.TorusGeometry(0.3, 0.1, 16, 100);
      case 'octahedron':
        return new THREE.OctahedronGeometry(0.4);
      case 'cube':
      default:
        return new THREE.BoxGeometry(0.8, 0.8, 0.8);
    }
  }, [centralObject]);

  // Create central material
  const centralMaterial = useMemo(() => {
    if (centralObject === 'cube') {
      // Wireframe material for cube
      return new THREE.MeshBasicMaterial({
        color: centralColor,
        wireframe: true,
        transparent: true,
        opacity: 0.8
      });
    } else {
      // Regular material for other objects
      return new THREE.MeshPhongMaterial({
        color: centralColor,
        shininess: 100,
        transparent: true,
        opacity: 0.9
      });
    }
  }, [centralColor, centralObject]);

  // Create particle system
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const color = new THREE.Color(particleColor);

    for (let i = 0; i < particleCount; i++) {
      // Create multiple orbital rings
      const ringIndex = Math.floor(i / (particleCount / 3));
      const ringRadius = orbitRadius + ringIndex * 0.5;
      const angle = (i / (particleCount / 3)) * Math.PI * 2;
      const height = (Math.random() - 0.5) * 2;

      // Position particles in orbital rings
      positions[i * 3] = Math.cos(angle) * ringRadius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * ringRadius;

      // Vary particle colors slightly
      const colorVariation = 0.2;
      colors[i * 3] = color.r + (Math.random() - 0.5) * colorVariation;
      colors[i * 3 + 1] = color.g + (Math.random() - 0.5) * colorVariation;
      colors[i * 3 + 2] = color.b + (Math.random() - 0.5) * colorVariation;
    }

    return { positions, colors };
  }, [particleCount, orbitRadius, particleColor]);

  // Create particle geometry
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, [positions, colors]);

  // Create particle material
  const particleMaterial = useMemo(() => {
    return new THREE.PointsMaterial({
      size: particleSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
  }, [particleSize]);

  // Animation loop
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const bpmTime = (bpm / 60) * time;

    // Rotate central object
    if (centralRef.current) {
      centralRef.current.rotation.x = Math.sin(time * rotationSpeed * 0.5) * 0.3;
      centralRef.current.rotation.y = time * rotationSpeed;
      centralRef.current.rotation.z = Math.cos(time * rotationSpeed * 0.3) * 0.2;
    }

    // Animate particles
    if (particlesRef.current && particlesRef.current.geometry) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < particleCount; i++) {
        const ringIndex = Math.floor(i / (particleCount / 3));
        const ringRadius = orbitRadius + ringIndex * 0.5;
        const baseAngle = (i / (particleCount / 3)) * Math.PI * 2;
        
        // Add orbital motion
        const orbitalSpeed = particleSpeed * (1 + ringIndex * 0.2);
        const angle = baseAngle + time * orbitalSpeed;
        
        // Add wave motion
        const waveOffset = Math.sin(time * 2 + i * 0.1) * 0.3;
        
        positions[i * 3] = Math.cos(angle) * (ringRadius + waveOffset);
        positions[i * 3 + 1] = Math.sin(time * 1.5 + i * 0.05) * 0.5;
        positions[i * 3 + 2] = Math.sin(angle) * (ringRadius + waveOffset);
      }
      
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // Pulse effect based on BPM
    if (particlesMaterialRef.current) {
      const pulse = Math.sin(bpmTime * Math.PI * 2) * 0.3 + 0.7;
      particlesMaterialRef.current.size = particleSize * pulse;
    }
  });

  return (
    <group>
      {/* Central rotating object */}
      <mesh ref={centralRef} geometry={centralGeometry} material={centralMaterial} />
      
      {/* Particle system */}
      <points ref={particlesRef} geometry={particleGeometry}>
        <primitive object={particleMaterial} ref={particlesMaterialRef} />
      </points>
      
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00bcd4" />
    </group>
  );
};

// Metadata for dynamic discovery
(RotatingParticleEffect as any).metadata = {
  name: 'Rotating Particle Effect',
  description: '3D rotating object surrounded by animated particles in orbital patterns',
  category: '3D',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'rotationSpeed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Central object rotation speed'
    },
    {
      name: 'particleCount',
      type: 'number',
      value: 100,
      min: 20,
      max: 500,
      step: 10,
      description: 'Number of particles'
    },
    {
      name: 'particleSize',
      type: 'number',
      value: 0.1,
      min: 0.01,
      max: 0.5,
      step: 0.01,
      description: 'Particle size'
    },
    {
      name: 'particleSpeed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 3.0,
      step: 0.1,
      description: 'Particle orbital speed'
    },
    {
      name: 'orbitRadius',
      type: 'number',
      value: 3.0,
      min: 1.0,
      max: 8.0,
      step: 0.1,
      description: 'Particle orbit radius'
    },
    {
      name: 'centralObject',
      type: 'string',
      value: 'cube',
      description: 'Central object type'
    },
         {
       name: 'particleColor',
       type: 'color',
       value: '#ffffff',
       description: 'Particle color'
     },
     {
       name: 'centralColor',
       type: 'color',
       value: '#ffffff',
       description: 'Central object color'
     }
  ]
};

// Self-register the effect
console.log('🔧 Registering RotatingParticleEffect...');
registerEffect('RotatingParticleEffect', RotatingParticleEffect);
console.log('✅ RotatingParticleEffect registered successfully');

export default RotatingParticleEffect;
