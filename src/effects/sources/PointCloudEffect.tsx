import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface PointCloudEffectProps {
  pointSize?: number;
  color?: string;
  rotationSpeed?: number;
  scale?: number;
  density?: number;
  bpmSync?: boolean;
  videoTexture?: THREE.VideoTexture;
}

const PointCloudEffect: React.FC<PointCloudEffectProps> = ({
  pointSize = 0.005,
  color = '#00ff00',
  rotationSpeed = 1.0,
  scale = 1.0,
  density = 0.5,
  bpmSync = true,
  videoTexture
}) => {
  const meshRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const { bpm } = useStore();
  const [pointCloud, setPointCloud] = useState<THREE.BufferGeometry | null>(null);

  console.log('🎨 PointCloudEffect component rendered with props:', { 
    pointSize, color, rotationSpeed, scale, density, bpmSync 
  });

  // Generate point cloud geometry
  useEffect(() => {
    const geometry = new THREE.BufferGeometry();
    const points: number[] = [];
    const colors: number[] = [];
    
    // Create a spherical point cloud
    const numPoints = Math.floor(10000 * density);
    const colorObj = new THREE.Color(color);
    
    for (let i = 0; i < numPoints; i++) {
      // Spherical distribution
      const phi = Math.acos(-1 + (2 * i) / numPoints);
      const theta = Math.sqrt(numPoints * Math.PI) * phi;
      
      const x = Math.cos(theta) * Math.sin(phi) * scale;
      const y = Math.sin(theta) * Math.sin(phi) * scale;
      const z = Math.cos(phi) * scale;
      
      points.push(x, y, z);
      
      // Color variation based on position
      const intensity = (Math.sin(x * 10) + Math.cos(y * 10) + Math.sin(z * 10)) / 3;
      const finalColor = colorObj.clone().multiplyScalar(0.5 + intensity * 0.5);
      colors.push(finalColor.r, finalColor.g, finalColor.b);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    setPointCloud(geometry);
  }, [color, scale, density]);

  // Create material
  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
  }, [pointSize]);

  useFrame((state) => {
    if (meshRef.current && materialRef.current) {
      const time = state.clock.elapsedTime;
      
      // BPM-synchronized rotation
      if (bpmSync) {
        const beatsPerSecond = bpm / 60;
        const beatTime = time * beatsPerSecond;
        const rotationSpeedBPM = rotationSpeed * (1 + Math.sin(beatTime * Math.PI * 2) * 0.3);
        
        meshRef.current.rotation.x += rotationSpeedBPM * 0.01;
        meshRef.current.rotation.y += rotationSpeedBPM * 0.015;
        meshRef.current.rotation.z += rotationSpeedBPM * 0.02;
      } else {
        meshRef.current.rotation.x += rotationSpeed * 0.01;
        meshRef.current.rotation.y += rotationSpeed * 0.015;
        meshRef.current.rotation.z += rotationSpeed * 0.02;
      }
      
      // BPM-synchronized pulsing
      if (bpmSync) {
        const beatsPerSecond = bpm / 60;
        const beatTime = time * beatsPerSecond;
        const pulse = Math.sin(beatTime * Math.PI * 2) * 0.3 + 0.7;
        materialRef.current.opacity = 0.6 + pulse * 0.4;
        materialRef.current.size = pointSize * (0.8 + pulse * 0.4);
      }
      
      // Scale animation
      const scalePulse = Math.sin(time * 2) * 0.1 + 1.0;
      meshRef.current.scale.setScalar(scale * scalePulse);
    }
  });

  if (!pointCloud) {
    return null;
  }

  return (
    <points ref={meshRef} position={[0, 0, 0]}>
      <primitive object={pointCloud} />
      <primitive object={material} ref={materialRef} />
    </points>
  );
};

// Metadata for dynamic discovery
(PointCloudEffect as any).metadata = {
  name: 'Point Cloud',
  description: '3D point cloud effect with BPM synchronization',
  category: '3D',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'pointSize',
      type: 'number',
      value: 0.005,
      min: 0.001,
      max: 0.02,
      step: 0.001,
      description: 'Size of each point'
    },
    {
      name: 'color',
      type: 'color',
      value: '#00ff00',
      description: 'Point cloud color'
    },
    {
      name: 'rotationSpeed',
      type: 'number',
      value: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      description: 'Rotation speed'
    },
    {
      name: 'scale',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 3.0,
      step: 0.1,
      description: 'Point cloud scale'
    },
    {
      name: 'density',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 1.0,
      step: 0.1,
      description: 'Point density'
    },
    {
      name: 'bpmSync',
      type: 'select',
      value: 'true',
      options: [
        { value: 'true', label: 'BPM Sync' },
        { value: 'false', label: 'Free Run' }
      ],
      description: 'BPM synchronization'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering PointCloudEffect...');
registerEffect('PointCloudEffect', PointCloudEffect);
console.log('✅ PointCloudEffect registered successfully');

export default PointCloudEffect;
