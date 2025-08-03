import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FilmFlickerEffectR3FProps {
  intensity?: number;
  speed?: number;
  frequency?: number;
  color?: string;
}

const FilmFlickerEffectR3F: React.FC<FilmFlickerEffectR3FProps> = ({
  intensity = 0.2,
  speed = 1,
  frequency = 24, // 24fps film flicker
  color = '#ffffff'
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Create shader material for film flicker
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity },
        frequency: { value: frequency },
        color: { value: new THREE.Color(color) },
        speed: { value: speed }
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
        uniform float frequency;
        uniform vec3 color;
        uniform float speed;
        varying vec2 vUv;
        
        // Noise function for additional randomness
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        void main() {
          vec2 uv = vUv;
          
          // Create flicker using sine wave
          float flickerIntensity = sin(time * speed * frequency * 3.14159 * 2.0) * 0.5 + 0.5;
          
          // Add some random noise to make it more realistic
          float flickerNoise = noise(uv * 10.0 + time * speed) * 0.3;
          
          // Combine flicker and noise
          float totalFlicker = (flickerIntensity + flickerNoise) * intensity;
          
          // Apply color and flicker
          vec3 finalColor = color * totalFlicker;
          float alpha = totalFlicker;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
  }, [intensity, frequency, color, speed]);

  // Update uniforms on each frame
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.intensity.value = intensity;
      materialRef.current.uniforms.frequency.value = frequency;
      materialRef.current.uniforms.speed.value = speed;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[4, 4]} />
      <shaderMaterial ref={materialRef} attach="material" {...shaderMaterial} />
    </mesh>
  );
};

export default FilmFlickerEffectR3F; 