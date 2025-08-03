import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FilmNoiseEffectR3FProps {
  intensity?: number;
  speed?: number;
  color?: string;
  opacity?: number;
  particleCount?: number;
}

const FilmNoiseEffectR3F: React.FC<FilmNoiseEffectR3FProps> = ({
  intensity = 0.5,
  speed = 1,
  color = '#ffffff',
  opacity = 0.3,
  particleCount = 10000
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Create shader material for film noise
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity },
        opacity: { value: opacity },
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
        uniform float opacity;
        uniform vec3 color;
        uniform float speed;
        varying vec2 vUv;
        
        // Simple noise function
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        void main() {
          vec2 uv = vUv;
          
          // Create simple animated noise
          float n = noise(uv * 100.0 + time * speed);
          float noiseValue = n * intensity;
          
          // Apply color and opacity
          vec3 finalColor = color * noiseValue;
          float alpha = noiseValue * opacity;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
  }, [intensity, opacity, color, speed]);

  // Update uniforms on each frame
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.intensity.value = intensity;
      materialRef.current.uniforms.opacity.value = opacity;
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

export default FilmNoiseEffectR3F; 