import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface LightLeakEffectR3FProps {
  intensity?: number;
  speed?: number;
  color?: string;
  position?: 'left' | 'right' | 'top' | 'bottom';
  width?: number;
}

const LightLeakEffectR3F: React.FC<LightLeakEffectR3FProps> = ({
  intensity = 0.3,
  speed = 1,
  color = '#ff6b35',
  position = 'right',
  width = 0.2
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Create shader material for light leak
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity },
        color: { value: new THREE.Color(color) },
        speed: { value: speed },
        position: { value: position === 'left' ? 0 : position === 'right' ? 1 : position === 'top' ? 2 : 3 },
        width: { value: width }
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
        uniform vec3 color;
        uniform float speed;
        uniform float position;
        uniform float width;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vUv;
          float gradient = 0.0;
          
          // Create gradient based on position
          if (position < 1.0) {
            // Left
            gradient = smoothstep(0.0, width, uv.x);
          } else if (position < 2.0) {
            // Right
            gradient = smoothstep(1.0, 1.0 - width, uv.x);
          } else if (position < 3.0) {
            // Top
            gradient = smoothstep(0.0, width, uv.y);
          } else {
            // Bottom
            gradient = smoothstep(1.0, 1.0 - width, uv.y);
          }
          
          // Add flicker animation
          float flicker = sin(time * speed * 2.0) * 0.3 + 0.7;
          float totalIntensity = intensity * flicker * gradient;
          
          // Apply color and intensity
          vec3 finalColor = color * totalIntensity;
          float alpha = totalIntensity;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.ScreenBlending,
      depthTest: false,
      depthWrite: false
    });
  }, [intensity, color, speed, position, width]);

  // Update uniforms on each frame
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.intensity.value = intensity;
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

export default LightLeakEffectR3F; 