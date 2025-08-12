import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface PCDPointCloudEffectProps {
  pointSize?: number;
  pointColor?: string;
  rotationSpeed?: number;
  scale?: number;
  autoRotate?: boolean;
  bpmSync?: boolean;
  intensity?: number;
}

const PCDPointCloudEffect: React.FC<PCDPointCloudEffectProps> = ({
  pointSize = 0.005,
  pointColor = '#ffffff',
  rotationSpeed = 0.5,
  scale = 1.0,
  autoRotate = true,
  bpmSync = false,
  intensity = 0.5
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const { bpm } = useStore();
  const [pointCloud, setPointCloud] = useState<THREE.Points | null>(null);
  const [loading, setLoading] = useState(true);

  console.log('🎨 PCDPointCloudEffect component rendered with props:', { 
    pointSize, pointColor, rotationSpeed, scale, autoRotate, bpmSync, intensity 
  });

  // Create point cloud geometry with sample data
  const createSamplePointCloud = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const pointCount = 10000;
    const positions = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);
    
    const color = new THREE.Color(pointColor);
    
    for (let i = 0; i < pointCount; i++) {
      // Create a sphere-like distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 0.5 + Math.random() * 0.5;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      // Add some color variation
      const colorVariation = 0.3;
      colors[i * 3] = color.r + (Math.random() - 0.5) * colorVariation;
      colors[i * 3 + 1] = color.g + (Math.random() - 0.5) * colorVariation;
      colors[i * 3 + 2] = color.b + (Math.random() - 0.5) * colorVariation;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    return geometry;
  }, [pointColor]);

  // Create point cloud material
  const pointMaterial = useMemo(() => {
    return new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });
  }, [pointSize]);

  // Create the point cloud
  useEffect(() => {
    if (createSamplePointCloud && pointMaterial) {
      const points = new THREE.Points(createSamplePointCloud, pointMaterial);
      setPointCloud(points);
      setLoading(false);
    }
  }, [createSamplePointCloud, pointMaterial]);

  // Animation frame
  useFrame((state) => {
    if (groupRef.current && pointCloud) {
      const time = state.clock.elapsedTime;
      
      // Calculate rotation speed based on BPM if enabled
      const currentRotationSpeed = bpmSync 
        ? rotationSpeed * (bpm / 60.0) 
        : rotationSpeed;
      
      // Auto-rotate the point cloud
      if (autoRotate) {
        groupRef.current.rotation.x = Math.sin(time * currentRotationSpeed * 0.5) * 0.3;
        groupRef.current.rotation.y = time * currentRotationSpeed;
        groupRef.current.rotation.z = Math.cos(time * currentRotationSpeed * 0.3) * 0.2;
      }
      
      // Pulse effect based on BPM
      if (bpmSync) {
        const beatTime = time * (bpm / 60.0);
        const pulse = 1.0 + Math.sin(beatTime * Math.PI * 2) * intensity * 0.3;
        groupRef.current.scale.setScalar(scale * pulse);
      } else {
        groupRef.current.scale.setScalar(scale);
      }
      
      // Animate point colors
      if (pointCloud.material instanceof THREE.PointsMaterial) {
        const colors = pointCloud.geometry.attributes.color;
        if (colors) {
          for (let i = 0; i < colors.count; i++) {
            const colorOffset = Math.sin(time * 2.0 + i * 0.01) * 0.1;
            colors.setXYZ(
              i,
              Math.max(0, Math.min(1, colors.getX(i) + colorOffset)),
              Math.max(0, Math.min(1, colors.getY(i) + colorOffset * 0.5)),
              Math.max(0, Math.min(1, colors.getZ(i) + colorOffset * 0.3))
            );
          }
          colors.needsUpdate = true;
        }
      }
    }
  });

  if (loading) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {pointCloud && (
        <primitive object={pointCloud} ref={pointsRef} />
      )}
    </group>
  );
};

// Metadata for dynamic discovery
(PCDPointCloudEffect as any).metadata = {
  name: 'PCD Point Cloud',
  description: 'Renders animated 3D point cloud with BPM synchronization',
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
      description: 'Size of individual points'
    },
    {
      name: 'pointColor',
      type: 'color',
      value: '#ffffff',
      description: 'Base color for points'
    },
    {
      name: 'rotationSpeed',
      type: 'number',
      value: 0.5,
      min: 0.0,
      max: 2.0,
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
      description: 'Overall scale of the point cloud'
    },
    {
      name: 'autoRotate',
      type: 'boolean',
      value: true,
      description: 'Enable automatic rotation'
    },
    {
      name: 'bpmSync',
      type: 'boolean',
      value: false,
      description: 'Synchronize with BPM'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.05,
      description: 'Animation intensity'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering PCDPointCloudEffect...');
registerEffect('PCDPointCloudEffect', PCDPointCloudEffect);
console.log('✅ PCDPointCloudEffect registered successfully');

export default PCDPointCloudEffect;
