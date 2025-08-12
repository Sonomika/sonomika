// src/effects/MatrixNumbersEffect.tsx
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';
import { Text } from '@react-three/drei';

interface MatrixNumbersEffectProps {
  opacity?: number;
  nodeCount?: number;
  connectionDistance?: number;
  numberSize?: number;
  animationSpeed?: number;
  colorIntensity?: number;
  spaceSize?: number;
  flowSpeed?: number;
  numberChangeSpeed?: number;
}

export const MatrixNumbersEffect: React.FC<MatrixNumbersEffectProps> = ({
  opacity = 1,
  nodeCount = 100,
  connectionDistance = 4.0,
  numberSize = 0.5,
  animationSpeed = 1.0,
  colorIntensity = 1.0,
  spaceSize = 8,
  flowSpeed = 2.0,
  numberChangeSpeed = 1.0
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<any[]>([]);
  const linesRef = useRef<THREE.LineSegments | null>(null);
  const { bpm } = useStore();

  console.log('🔢 MatrixNumbersEffect rendering as standalone 3D effect');

  // Generate initial node data
  const initialNodes = useMemo(() => {
    const nodeArray = [];
    
    for (let i = 0; i < nodeCount; i++) {
      // Random position in 3D space
      const position = new THREE.Vector3(
        (Math.random() - 0.5) * spaceSize,
        (Math.random() - 0.5) * spaceSize,
        (Math.random() - 0.5) * spaceSize
      );
      
      // Random velocity for floating movement
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * animationSpeed * 0.5,
        (Math.random() - 0.5) * animationSpeed * 0.5,
        (Math.random() - 0.5) * animationSpeed * 0.5
      );
      
      // Random number (0-9)
      const number = Math.floor(Math.random() * 10);
      
      // Random color variation in green spectrum
      const hue = 0.2 + Math.random() * 0.2; // Green-ish hues
      const color = new THREE.Color().setHSL(hue, 0.8, 0.5 + Math.random() * 0.3);
      
      nodeArray.push({
        id: i,
        position: position.clone(),
        velocity: velocity.clone(),
        number,
        color,
        phase: Math.random() * Math.PI * 2,
        lastNumberChange: 0,
        size: numberSize * (0.8 + Math.random() * 0.4)
      });
    }
    
    nodesRef.current = nodeArray;
    return nodeArray;
  }, [nodeCount, spaceSize, numberSize, animationSpeed]);

  // Create line geometry for connections
  const connectionLines = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({ 
      color: 0x00ff44, 
      transparent: true, 
      opacity: 0.3,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.01
    });
    
    const positions = new Float32Array(nodeCount * nodeCount * 6); // Max possible connections
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    return new THREE.LineSegments(geometry, material);
  }, [nodeCount]);

  // Animation logic
  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    
    if (nodesRef.current.length === 0) return;
    
    // Update node positions and properties
    nodesRef.current.forEach((node, index) => {
      // Update position with velocity and some floating behavior
      node.position.add(node.velocity.clone().multiplyScalar(delta));
      
      // Add floating behavior with sine waves
      const floatingOffset = new THREE.Vector3(
        Math.sin(time * animationSpeed + node.phase) * 0.1,
        Math.cos(time * animationSpeed * 1.3 + node.phase) * 0.1,
        Math.sin(time * animationSpeed * 0.7 + node.phase) * 0.1
      );
      
      // Keep nodes within bounds
      if (Math.abs(node.position.x) > spaceSize / 2) {
        node.velocity.x *= -1;
        node.position.x = Math.sign(node.position.x) * (spaceSize / 2 - 0.1);
      }
      if (Math.abs(node.position.y) > spaceSize / 2) {
        node.velocity.y *= -1;
        node.position.y = Math.sign(node.position.y) * (spaceSize / 2 - 0.1);
      }
      if (Math.abs(node.position.z) > spaceSize / 2) {
        node.velocity.z *= -1;
        node.position.z = Math.sign(node.position.z) * (spaceSize / 2 - 0.1);
      }
      
      // Change numbers periodically
      if (time - node.lastNumberChange > numberChangeSpeed) {
        node.number = Math.floor(Math.random() * 10);
        node.lastNumberChange = time;
      }
      
      // BPM-based pulsing
      const bpmPulse = Math.sin(time * (bpm / 60) * Math.PI * 2 + index * 0.5) * 0.3 + 0.7;
      node.currentOpacity = opacity * bpmPulse * colorIntensity;
    });
    
    // Update connection lines
    if (linesRef.current) {
      const positions = [];
      
      for (let i = 0; i < nodesRef.current.length; i++) {
        for (let j = i + 1; j < nodesRef.current.length; j++) {
          const nodeA = nodesRef.current[i];
          const nodeB = nodesRef.current[j];
          const distance = nodeA.position.distanceTo(nodeB.position);
          
          if (distance < connectionDistance) {
            positions.push(
              nodeA.position.x, nodeA.position.y, nodeA.position.z,
              nodeB.position.x, nodeB.position.y, nodeB.position.z
            );
          }
        }
      }
      
      const positionAttribute = linesRef.current.geometry.getAttribute('position');
      if (positionAttribute) {
        for (let i = 0; i < positions.length && i < positionAttribute.array.length; i++) {
          positionAttribute.array[i] = positions[i];
        }
        positionAttribute.needsUpdate = true;
        linesRef.current.geometry.setDrawRange(0, positions.length / 3);
      }
      
      // Update line opacity
      if (linesRef.current.material instanceof THREE.LineBasicMaterial) {
        linesRef.current.material.opacity = 0.3 * opacity * colorIntensity;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Render connection lines */}
      <primitive object={connectionLines} ref={linesRef} />
      
      {/* Render floating numbers */}
      {nodesRef.current.map((node, index) => (
        <Text
          key={`${node.id}-${node.number}`}
          position={[node.position.x, node.position.y, node.position.z]}
          fontSize={node.size}
          color={node.color}
          anchorX="center"
          anchorY="middle"
          material-transparent
          material-opacity={node.currentOpacity || opacity}
          material-depthTest={false}
          material-depthWrite={false}
          material-alphaTest={0.01}
          rotation={[0, 0, Math.sin(Date.now() * 0.001 + node.phase) * 0.2]}
        >
          {node.number.toString()}
        </Text>
      ))}
    </group>
  );
};

// Register the effect with metadata
(MatrixNumbersEffect as any).metadata = {
  name: 'Matrix Numbers',
  description: 'Standalone 3D effect with floating numbers connected by glowing lines in digital matrix style',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  replacesVideo: false, // This is a standalone effect that doesn't need video
  parameters: [
    { name: 'nodeCount', type: 'number', value: 100, min: 30, max: 200, step: 10 },
    { name: 'connectionDistance', type: 'number', value: 4.0, min: 2.0, max: 8.0, step: 0.5 },
    { name: 'numberSize', type: 'number', value: 0.5, min: 0.2, max: 1.5, step: 0.1 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: 'colorIntensity', type: 'number', value: 1.0, min: 0.3, max: 2.0, step: 0.1 },
    { name: 'spaceSize', type: 'number', value: 8, min: 4, max: 15, step: 1 },
    { name: 'flowSpeed', type: 'number', value: 2.0, min: 0.5, max: 5.0, step: 0.1 },
    { name: 'numberChangeSpeed', type: 'number', value: 1.0, min: 0.2, max: 3.0, step: 0.1 },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.1 }
  ]
};

// Register the effect (single registration)
registerEffect('matrix-numbers-effect', MatrixNumbersEffect);

export default MatrixNumbersEffect;
