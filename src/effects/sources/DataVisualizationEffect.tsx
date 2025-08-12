// src/effects/DataVisualizationEffect.tsx
import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface DataVisualizationEffectProps {
  color?: string;
  intensity?: number;
  speed?: number;
  textCount?: number;
  lineCount?: number;
}

const DataVisualizationEffect: React.FC<DataVisualizationEffectProps> = ({
  color = '#00ff00',
  intensity = 1.0,
  speed = 1.0,
  textCount = 50,
  lineCount = 20
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { bpm } = useStore();
  
  // Generate random data texts
  const dataTexts = useMemo(() => [
    'FPS: 60', 'CPU: 23%', 'GPU: 45%', 'RAM: 2.1GB', 'TEMP: 67°C',
    'BPM: 128', 'TIME: 03:42', 'LAYER: 5', 'BLEND: ADD', 'OPACITY: 85%',
    'X: 1920', 'Y: 1080', 'Z: 0.5', 'ROT: 45°', 'SCALE: 1.2x',
    'MIDI: CH1', 'CC64: 127', 'NOTE: C4', 'VEL: 100', 'PITCH: +12',
    'BUFFER: 512', 'RATE: 44.1k', 'BITS: 24', 'CHANNELS: 2', 'LATENCY: 12ms',
    'FRAMES: 23847', 'DROPPED: 0', 'QUEUE: 3', 'RENDER: 16ms', 'SYNC: OK',
    'NET: 45ms', 'PING: 23ms', 'UP: 12MB', 'DOWN: 5MB', 'PKT: 99.9%',
    'SHADER: OK', 'VERTEX: 1024', 'FRAGMENT: 2048', 'UNIFORM: 64', 'TEXTURE: 8',
    'HEAP: 12MB', 'STACK: 2MB', 'GC: 150ms', 'ALLOC: 5MB', 'FREE: 7MB',
    'ERROR: 0', 'WARN: 2', 'INFO: 47', 'DEBUG: 156', 'TRACE: 2847',
    'VU: -12dB', 'PEAK: -6dB', 'RMS: -18dB', 'THD: 0.01%', 'SNR: 96dB'
  ], []);

  // Create random positions for text elements
  const textElements = useMemo(() => {
    return Array.from({ length: Math.min(textCount, dataTexts.length) }, (_, i) => ({
      id: i,
      text: dataTexts[i % dataTexts.length],
      position: [
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 2
      ] as [number, number, number],
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2
    }));
  }, [textCount, dataTexts]);

  // Create random lines
  const lineElements = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => ({
      id: i,
      start: [
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 2
      ] as [number, number, number],
      end: [
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 2
      ] as [number, number, number],
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 1.5
    }));
  }, [lineCount]);

  // State for dynamic text content
  const [dynamicTexts, setDynamicTexts] = useState<string[]>([]);

  // Generate random dynamic values
  const generateRandomValues = () => {
    const newTexts = [
      `FPS: ${Math.floor(Math.random() * 60 + 30)}`,
      `CPU: ${Math.floor(Math.random() * 100)}%`,
      `GPU: ${Math.floor(Math.random() * 100)}%`,
      `RAM: ${(Math.random() * 4 + 1).toFixed(1)}GB`,
      `TEMP: ${Math.floor(Math.random() * 40 + 50)}°C`,
      `BPM: ${bpm}`,
      `TIME: ${new Date().toLocaleTimeString().slice(0, 5)}`,
      `X: ${Math.floor(Math.random() * 2000)}`,
      `Y: ${Math.floor(Math.random() * 1200)}`,
      `VU: ${Math.floor(Math.random() * 40 - 60)}dB`
    ];
    setDynamicTexts(newTexts);
  };

  useFrame((state) => {
    if (groupRef.current) {
      // Calculate BPM timing
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond * speed;
      
      // Global rotation
      groupRef.current.rotation.z = Math.sin(beatTime * 0.1) * 0.1;
      
      // Update dynamic text values every few frames
      if (Math.floor(beatTime * 4) % 8 === 0 && Math.random() < 0.1) {
        generateRandomValues();
      }
    }
  });

  // Create line geometry
  const createLineGeometry = (start: [number, number, number], end: [number, number, number]) => {
    const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
    return new THREE.BufferGeometry().setFromPoints(points);
  };

  return (
    <group ref={groupRef}>
      {/* Flashing text elements */}
      {textElements.map((element, index) => (
        <FlashingText
          key={element.id}
          position={element.position}
          text={index < dynamicTexts.length ? dynamicTexts[index] : element.text}
          color={color}
          intensity={intensity}
          speed={speed}
          phase={element.phase}
          elementSpeed={element.speed}
        />
      ))}
      
      {/* Flashing lines */}
      {lineElements.map((element) => (
        <FlashingLine
          key={element.id}
          start={element.start}
          end={element.end}
          color={color}
          intensity={intensity}
          speed={speed}
          phase={element.phase}
          elementSpeed={element.speed}
        />
      ))}
      
      {/* Central data hub */}
      <mesh position={[0, 0, 0]}>
        <ringGeometry args={[0.5, 0.6, 16]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

// Flashing text component using canvas texture
const FlashingText: React.FC<{
  position: [number, number, number];
  text: string;
  color: string;
  intensity: number;
  speed: number;
  phase: number;
  elementSpeed: number;
}> = ({ position, text, color, intensity, speed, phase, elementSpeed }) => {
  const { bpm } = useStore();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  
  // Create text texture
  const textTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = 'transparent';
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    context.font = '16px monospace';
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, [text, color]);

  useFrame((state) => {
    if (meshRef.current && materialRef.current) {
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond * speed * elementSpeed;
      
      // Flashing opacity
      const flash = Math.sin(beatTime * Math.PI * 2 + phase);
      const opacity = Math.max(0.1, Math.min(1.0, 0.5 + flash * 0.5 * intensity));
      
      // Slight position jitter
      const jitter = Math.sin(beatTime * Math.PI * 4 + phase) * 0.02 * intensity;
      
      materialRef.current.opacity = opacity;
      meshRef.current.position.x = position[0] + jitter;
      meshRef.current.position.y = position[1] + Math.cos(beatTime + phase) * 0.01;
      meshRef.current.position.z = position[2];
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[0.8, 0.2]} />
      <meshBasicMaterial
        ref={materialRef}
        map={textTexture}
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

// Flashing line component
const FlashingLine: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  intensity: number;
  speed: number;
  phase: number;
  elementSpeed: number;
}> = ({ start, end, color, intensity, speed, phase, elementSpeed }) => {
  const { bpm } = useStore();
  const lineRef = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [start, end]);

  useFrame((state) => {
    if (lineRef.current && lineRef.current.material) {
      const beatsPerSecond = bpm / 60;
      const beatTime = state.clock.elapsedTime * beatsPerSecond * speed * elementSpeed;
      
      // Flashing opacity
      const flash = Math.sin(beatTime * Math.PI * 2 + phase);
      const opacity = Math.max(0.05, Math.min(0.8, 0.3 + flash * 0.3 * intensity));
      
      (lineRef.current.material as THREE.LineBasicMaterial).opacity = opacity;
    }
  });

  return (
    <line ref={lineRef}>
      <primitive object={geometry} />
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </line>
  );
};

// Metadata for dynamic discovery
(DataVisualizationEffect as any).metadata = {
  name: 'Data Visualization',
  description: 'Shows animated system data with flashing text and lines',
  category: 'Data',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#00ff00',
      description: 'Primary color for text and lines'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 3.0,
      step: 0.1,
      description: 'Flash intensity'
    },
    {
      name: 'speed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Animation speed'
    },
    {
      name: 'textCount',
      type: 'number',
      value: 50,
      min: 10,
      max: 100,
      step: 5,
      description: 'Number of text elements'
    },
    {
      name: 'lineCount',
      type: 'number',
      value: 20,
      min: 5,
      max: 50,
      step: 1,
      description: 'Number of connecting lines'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering DataVisualizationEffect...');
registerEffect('DataVisualizationEffect', DataVisualizationEffect);
console.log('✅ DataVisualizationEffect registered successfully');

export default DataVisualizationEffect;
