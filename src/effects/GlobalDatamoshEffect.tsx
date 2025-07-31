import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GlobalDatamoshEffectProps {
  bpm?: number;
  intensity?: number;
  glitchFrequency?: number;
}

const GlobalDatamoshEffect: React.FC<GlobalDatamoshEffectProps> = ({
  bpm = 120,
  intensity = 0.6,
  glitchFrequency = 2.0
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(4, 2, 64, 32);
  }, []);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity },
        glitchFrequency: { value: glitchFrequency },
        bpm: { value: bpm }
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float time;
        uniform float intensity;
        uniform float glitchFrequency;

        void main() {
          vUv = uv;
          
          // Add vertex displacement for datamosh effect
          vec3 pos = position;
          float glitch = sin(time * glitchFrequency) * intensity;
          
          // Random displacement based on position
          float displacement = sin(pos.x * 10.0 + time) * sin(pos.y * 10.0 + time) * glitch * 0.1;
          pos.z += displacement;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform float bpm;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv;
          
          // Create datamosh-like color shifts
          float glitch = sin(time * 10.0) * intensity;
          float redShift = sin(time * 5.0) * glitch * 0.1;
          float blueShift = cos(time * 7.0) * glitch * 0.1;
          
          // Create scan lines
          float scanLine = sin(uv.y * 100.0 + time * 20.0) * 0.5 + 0.5;
          scanLine *= intensity;
          
          // Create color channels with shifts
          float r = scanLine + redShift;
          float g = scanLine;
          float b = scanLine + blueShift;
          
          // Add noise
          float noise = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
          noise *= intensity * 0.3;
          
          vec3 color = vec3(r, g, b) + noise;
          
          gl_FragColor = vec4(color, intensity * 0.8);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }, [intensity, glitchFrequency, bpm]);

  useFrame((state) => {
    if (meshRef.current) {
      timeRef.current += state.clock.getDelta();

      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (material && material.uniforms) {
        material.uniforms.time.value = timeRef.current;
        material.uniforms.intensity.value = intensity;
        material.uniforms.glitchFrequency.value = glitchFrequency;
        material.uniforms.bpm.value = bpm;
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};

export default GlobalDatamoshEffect; 