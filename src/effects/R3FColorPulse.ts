import React from 'react';
import { R3FBaseEffect, R3FEffectMetadata, R3FEffectProps } from './R3FBaseEffect';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef, useMemo } from 'react';

export class R3FColorPulse extends R3FBaseEffect {
  getMetadata(): R3FEffectMetadata {
    return {
      name: 'Color Pulse',
      description: 'A color-changing background that pulses with the BPM',
      parameters: [
        {
          name: 'intensity',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.5,
        },
        {
          name: 'colorSpeed',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.1,
        },
        {
          name: 'autoColor',
          type: 'boolean',
          default: true,
        },
      ],
    };
  }
}

// React Component for R3F Color Pulse
export const R3FColorPulseComponent: React.FC<R3FEffectProps> = (props) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const effect = new R3FColorPulse();
  
  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: 0.5 },
        colorSpeed: { value: 0.1 },
        bpm: { value: 120 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform float colorSpeed;
        uniform float bpm;
        varying vec2 vUv;
        
        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }
        
        void main() {
          float beatsPerSecond = bpm / 60.0;
          float hue = mod(time * beatsPerSecond * colorSpeed * 360.0, 360.0);
          
          // Create gradient based on UV coordinates
          float gradient = mix(0.0, 1.0, vUv.x + vUv.y);
          
          // Calculate colors
          vec3 color1 = hsv2rgb(vec3(hue / 360.0, 0.7, 0.5 + intensity * 0.2));
          vec3 color2 = hsv2rgb(vec3(mod(hue + 60.0, 360.0) / 360.0, 0.7, 0.5 + intensity * 0.2));
          vec3 color3 = hsv2rgb(vec3(mod(hue + 120.0, 360.0) / 360.0, 0.7, 0.5 + intensity * 0.2));
          
          // Mix colors based on gradient
          vec3 finalColor = mix(color1, color2, smoothstep(0.0, 0.5, gradient));
          finalColor = mix(finalColor, color3, smoothstep(0.5, 1.0, gradient));
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: true,
    });
  }, []);

  // Update uniforms
  useFrame((state, deltaTime) => {
    if (material.uniforms) {
      material.uniforms.time.value += deltaTime;
      material.uniforms.intensity.value = effect.getParameter('intensity') as number || 0.5;
      material.uniforms.colorSpeed.value = effect.getParameter('colorSpeed') as number || 0.1;
      material.uniforms.bpm.value = props.bpm || 120;
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} />
    </mesh>
  );
}; 