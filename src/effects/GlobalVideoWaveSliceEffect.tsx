import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GlobalVideoWaveSliceEffectProps {
  bpm?: number;
  intensity?: number;
  waveSpeed?: number;
  sliceCount?: number;
}

const GlobalVideoWaveSliceEffect: React.FC<GlobalVideoWaveSliceEffectProps> = ({
  bpm = 120,
  intensity = 0.7,
  waveSpeed = 1.0,
  sliceCount = 20
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(4, 2, sliceCount, 1);
  }, [sliceCount]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity },
        waveSpeed: { value: waveSpeed },
        bpm: { value: bpm },
        sliceCount: { value: sliceCount }
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float time;
        uniform float waveSpeed;
        uniform float sliceCount;

        void main() {
          vUv = uv;
          
          // Create wave-like vertex displacement
          vec3 pos = position;
          float wave = sin(pos.x * 2.0 + time * waveSpeed) * 0.1;
          pos.z += wave;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform float waveSpeed;
        uniform float bpm;
        uniform float sliceCount;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv;
          
          // Create wave-like slicing effect
          float wave = sin(uv.x * sliceCount + time * waveSpeed) * 0.5 + 0.5;
          float slice = sin(uv.y * 50.0 + time * waveSpeed * 2.0) * 0.5 + 0.5;
          
          // Combine wave and slice effects
          float effect = wave * slice * intensity;
          
          // Create color variation
          float hue = (time * 30.0) % 360.0;
          vec3 color = vec3(effect, effect * 0.8, effect * 0.6);
          
          // Add some pulsing based on BPM
          float bpmPulse = sin(time * (bpm / 60.0) * 3.14159) * 0.5 + 0.5;
          color *= (0.5 + bpmPulse * 0.5);
          
          gl_FragColor = vec4(color, effect * 0.9);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }, [intensity, waveSpeed, bpm, sliceCount]);

  useFrame((state) => {
    if (meshRef.current) {
      timeRef.current += state.clock.getDelta();

      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (material && material.uniforms) {
        material.uniforms.time.value = timeRef.current;
        material.uniforms.intensity.value = intensity;
        material.uniforms.waveSpeed.value = waveSpeed;
        material.uniforms.bpm.value = bpm;
        material.uniforms.sliceCount.value = sliceCount;
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};

export default GlobalVideoWaveSliceEffect; 