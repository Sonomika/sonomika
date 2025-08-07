import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { registerEffect } from '../utils/effectRegistry';

interface MonjoriShaderEffectProps {
  speed?: number;
  intensity?: number;
  scale?: number;
  bpmSync?: boolean;
  colorMode?: 'original' | 'rgb' | 'monochrome';
}

const MonjoriShaderEffect: React.FC<MonjoriShaderEffectProps> = ({
  speed = 40.0,
  intensity = 1.0,
  scale = 1.0,
  bpmSync = false,
  colorMode = 'original'
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();

  console.log('🎨 MonjoriShaderEffect component rendered with props:', { 
    speed, intensity, scale, bpmSync, colorMode 
  });

  // Create shader material for Monjori effect
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        speed: { value: speed },
        intensity: { value: intensity },
        scale: { value: scale },
        bpm: { value: bpm },
        bpmSync: { value: bpmSync ? 1.0 : 0.0 },
        colorMode: { value: colorMode === 'original' ? 0 : colorMode === 'rgb' ? 1 : 2 }
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time;
        uniform float speed;
        uniform float intensity;
        uniform float scale;
        uniform float bpm;
        uniform float bpmSync;
        uniform int colorMode;
        
        void main() {
          vec2 p = -1.0 + 2.0 * vUv;
          p *= scale;
          
          // Calculate time with BPM sync if enabled
          float timeValue = time;
          if (bpmSync > 0.5) {
            timeValue = time * (bpm / 60.0);
          }
          
          // Simple animated pattern to test
          float a = timeValue * speed;
          
          // Create animated circles
          float dist = length(p);
          float angle = atan(p.y, p.x);
          
          // Animated wave pattern
          float wave = sin(dist * 10.0 - a * 2.0) * 0.5 + 0.5;
          wave += sin(angle * 8.0 + a * 1.5) * 0.3;
          wave += sin(p.x * 20.0 + a * 3.0) * 0.2;
          wave += sin(p.y * 15.0 + a * 2.5) * 0.2;
          
          vec3 color;
          if (colorMode == 0) {
            // Original colors - animated rainbow
            color = vec3(
              sin(wave + a * 0.5) * 0.5 + 0.5,
              sin(wave + a * 0.7 + 2.094) * 0.5 + 0.5,
              sin(wave + a * 0.9 + 4.188) * 0.5 + 0.5
            );
          } else if (colorMode == 1) {
            // RGB cycling
            float rgbTime = timeValue * 2.0;
            color = vec3(
              sin(rgbTime) * 0.5 + 0.5,
              sin(rgbTime + 2.094) * 0.5 + 0.5,
              sin(rgbTime + 4.188) * 0.5 + 0.5
            ) * wave;
          } else {
            // Monochrome
            color = vec3(wave, wave, wave);
          }
          
          // Apply intensity
          color *= intensity;
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
  }, [speed, intensity, scale, bpm, bpmSync, colorMode]);

  useFrame((state) => {
    if (materialRef.current) {
      const time = state.clock.elapsedTime;
      materialRef.current.uniforms.time.value = time;
      materialRef.current.uniforms.bpm.value = bpm;
      
      // Update parameter uniforms in real-time
      materialRef.current.uniforms.speed.value = speed;
      materialRef.current.uniforms.intensity.value = intensity;
      materialRef.current.uniforms.scale.value = scale;
      materialRef.current.uniforms.bpmSync.value = bpmSync ? 1.0 : 0.0;
      materialRef.current.uniforms.colorMode.value = colorMode === 'original' ? 0.0 : 
                                                    colorMode === 'rgb' ? 1.0 : 2.0;
      
      // Debug logging
      if (Math.floor(time * 10) % 60 === 0) {
        console.log('🔄 Monjori time update:', time, 'BPM:', bpm);
      }
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      {/* Full screen quad for shader effect */}
      <planeGeometry args={[2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(MonjoriShaderEffect as any).metadata = {
  name: 'Monjori Shader',
  description: 'Famous Monjori shader demo with BPM synchronization and color modes',
  category: 'Shader',
  icon: '🌀',
  author: 'Mic (adapted by VJ System)',
  version: '1.0.0',
  parameters: [
    {
      name: 'speed',
      type: 'number',
      value: 40.0,
      min: 10.0,
      max: 100.0,
      step: 1.0,
      description: 'Animation speed'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 3.0,
      step: 0.1,
      description: 'Color intensity'
    },
    {
      name: 'scale',
      type: 'number',
      value: 1.0,
      min: 0.5,
      max: 3.0,
      step: 0.1,
      description: 'Pattern scale'
    },
    {
      name: 'bpmSync',
      type: 'boolean',
      value: false,
      description: 'Synchronize with BPM'
    },
    {
      name: 'colorMode',
      type: 'select',
      value: 'original',
      options: [
        { value: 'original', label: 'Original' },
        { value: 'rgb', label: 'RGB Cycling' },
        { value: 'monochrome', label: 'Monochrome' }
      ],
      description: 'Color mode'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering MonjoriShaderEffect...');
registerEffect('MonjoriShaderEffect', MonjoriShaderEffect);
console.log('✅ MonjoriShaderEffect registered successfully');

export default MonjoriShaderEffect;
