import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface RotatingSquareGlitchEffectProps {
  videoTexture?: THREE.VideoTexture;
  opacity?: number;
  intensity?: number;
  gridSize?: number;
  rotationSpeed?: number;
  glitchAmount?: number;
  colorShift?: number;
  depthVariation?: number;
}

export const RotatingSquareGlitchEffect: React.FC<RotatingSquareGlitchEffectProps> = ({
  videoTexture,
  opacity = 1,
  intensity = 1,
  gridSize = 8,
  rotationSpeed = 1,
  glitchAmount = 0.5,
  colorShift = 0.3,
  depthVariation = 1
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  console.log('🎨 RotatingSquareGlitchEffect rendering with videoTexture:', !!videoTexture);

  // Create a single quad with advanced glitch shader that simulates split squares
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: videoTexture },
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uGlitchAmount: { value: glitchAmount },
        uColorShift: { value: colorShift },
        uOpacity: { value: opacity },
        uGridSize: { value: gridSize },
        uRotationSpeed: { value: rotationSpeed },
        uDepthVariation: { value: depthVariation }
      },
                vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
                fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uGlitchAmount;
        uniform float uColorShift;
        uniform float uOpacity;
        uniform float uGridSize;
        uniform float uRotationSpeed;
        uniform float uDepthVariation;
        
        varying vec2 vUv;
        
        // Enhanced noise functions
        float noise(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        float fbm(vec2 st) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 5; i++) {
            value += amplitude * noise(st);
            st *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        
        // Matrix rotation
        mat2 rotate(float angle) {
          float s = sin(angle);
          float c = cos(angle);
          return mat2(c, -s, s, c);
        }
        
        // Aggressive RGB shift function
        vec3 rgbShift(sampler2D tex, vec2 uv, float amount) {
          vec2 rOffset = vec2(amount * 0.05, amount * 0.02);
          vec2 gOffset = vec2(-amount * 0.03, amount * 0.04);
          vec2 bOffset = vec2(amount * 0.02, -amount * 0.05);
          
          float r = texture2D(tex, uv + rOffset).r;
          float g = texture2D(tex, uv + gOffset).g;
          float b = texture2D(tex, uv + bOffset).b;
          return vec3(r, g, b);
        }
        
        void main() {
          vec2 uv = vUv;
          float glitchIntensity = uGlitchAmount * uIntensity;
          
          // Create grid of squares
          vec2 grid = floor(uv * uGridSize);
          vec2 gridUv = fract(uv * uGridSize);
          
          // Each square gets a unique seed
          float squareSeed = noise(grid * 123.456);
          
          // Rotate each square individually
          float rotationAngle = uTime * uRotationSpeed + squareSeed * 100.0;
          mat2 rotation = rotate(rotationAngle * glitchIntensity);
          
          // Center the UV for rotation
          vec2 centeredUv = gridUv - 0.5;
          centeredUv = rotation * centeredUv;
          centeredUv += 0.5;
          
          // EXTREME position displacement per square
          vec2 displacement = vec2(
            sin(uTime * 15.0 + squareSeed * 50.0) * glitchIntensity * 2.0,
            cos(uTime * 18.0 + squareSeed * 30.0) * glitchIntensity * 1.5
          );
          
          // Random square explosion
          if (noise(grid + uTime * 5.0) > 0.7) {
            displacement *= 5.0;
          }
          
          // Convert back to full UV space
          vec2 finalUv = (grid + centeredUv + displacement) / uGridSize;
          
          // MASSIVE UV distortion
          float chaos = fbm(finalUv * 10.0 + uTime * 5.0) * glitchIntensity;
          finalUv.x += sin(uTime * 25.0 + finalUv.y * 100.0) * glitchIntensity * 0.5 * chaos;
          finalUv.y += cos(uTime * 30.0 + finalUv.x * 80.0) * glitchIntensity * 0.4 * chaos;
          
          // Massive scanline displacement
          float scanlineIntensity = sin(finalUv.y * 1000.0 + uTime * 100.0) * glitchIntensity;
          finalUv.x += scanlineIntensity * 0.3;
          
          // Random block displacement (datamoshing effect)
          vec2 blockPos = floor(finalUv * 20.0) / 20.0;
          float blockNoise = noise(blockPos + uTime * 10.0);
          if (blockNoise > 0.6) {
            finalUv += vec2(
              sin(blockNoise * 100.0) * glitchIntensity * 0.8,
              cos(blockNoise * 80.0) * glitchIntensity * 0.6
            );
          }
          
          // Wrap UV coordinates to create extreme tiling artifacts
          finalUv = fract(finalUv);
          
          // Sample texture with extreme RGB shift
          vec3 color;
          if (glitchIntensity > 0.3) {
            color = rgbShift(tDiffuse, finalUv, uColorShift * glitchIntensity * 3.0);
          } else {
            color = texture2D(tDiffuse, finalUv).rgb;
          }
          
          // HEAVY digital noise overlay
          float digitalNoise = noise(finalUv * 200.0 + uTime * 100.0);
          float staticNoise = fbm(finalUv * 50.0 + uTime * 20.0);
          
          // Add static and corruption
          if (digitalNoise > 0.3) {
            color = mix(color, vec3(staticNoise), glitchIntensity * 0.8);
          }
          
          // Color channel destruction per square
          float glitchNoise = noise(grid + uTime * 10.0);
          if (glitchNoise > 0.4) {
            color.r = 1.0 - color.r; // Invert red
            color.g = fract(color.g * 10.0); // Quantize green
            color.b = abs(sin(color.b * 20.0 + uTime * 10.0)); // Oscillate blue
          }
          
          // Random color replacement per square
          if (staticNoise > 0.8) {
            color = vec3(
              noise(grid + uTime),
              noise(grid + uTime + 100.0),
              noise(grid + uTime + 200.0)
            );
          }
          
          // Extreme pixelation with random block colors
          if (glitchIntensity > 0.3) {
            vec2 pixelSize = vec2(5.0 + glitchIntensity * 50.0);
            vec2 pixelUv = floor(finalUv * pixelSize) / pixelSize;
            float pixelNoise = noise(pixelUv + uTime * 5.0);
            
            if (pixelNoise > 0.7) {
              // Replace with random colored blocks
              color = vec3(
                fract(sin(pixelNoise * 100.0)),
                fract(sin(pixelNoise * 200.0)),
                fract(sin(pixelNoise * 300.0))
              );
            } else {
              color = texture2D(tDiffuse, pixelUv).rgb;
            }
          }
          
          // Final chaos - randomly replace pixels with pure noise
          if (noise(finalUv * 500.0 + uTime * 50.0) > 0.95 - glitchIntensity * 0.5) {
            color = vec3(
              fract(sin(dot(finalUv + uTime, vec2(12.9898, 78.233))) * 43758.5),
              fract(sin(dot(finalUv + uTime + 1.0, vec2(12.9898, 78.233))) * 43758.5),
              fract(sin(dot(finalUv + uTime + 2.0, vec2(12.9898, 78.233))) * 43758.5)
            );
          }
          
          // Brightness modulation for additional chaos
          float brightnessChaos = sin(uTime * 20.0 + squareSeed) * glitchIntensity;
          color *= 1.0 + brightnessChaos * 2.0;
          
          gl_FragColor = vec4(color, uOpacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });
  }, [videoTexture, intensity, glitchAmount, colorShift, opacity, gridSize, rotationSpeed, depthVariation]);

  // Ensure texture uniform updates when upstream texture identity changes
  useEffect(() => {
    if (materialRef.current && videoTexture && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
      materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  }, [videoTexture]);

  // Update material uniforms on each frame
  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
      materialRef.current.uniforms.uIntensity.value = intensity;
      materialRef.current.uniforms.uGlitchAmount.value = glitchAmount;
      materialRef.current.uniforms.uColorShift.value = colorShift;
      materialRef.current.uniforms.uOpacity.value = opacity;
      materialRef.current.uniforms.uGridSize.value = gridSize;
      materialRef.current.uniforms.uRotationSpeed.value = rotationSpeed;
      materialRef.current.uniforms.uDepthVariation.value = depthVariation;
      
      // Texture binding is handled in useMemo and only changes when the source changes
      // No need to constantly update tDiffuse during playback - this was causing the conflict
    }
  });

  // Don't render if no video texture
  if (!videoTexture) {
    console.log('🚫 No video texture provided to RotatingSquareGlitchEffect');
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Register the effect with metadata
(RotatingSquareGlitchEffect as any).metadata = {
  name: 'Rotating Square Glitch',
  description: 'Splits video texture into 3D rotating squares with advanced glitch effects',
  category: 'Glitch',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  parameters: [
    { name: 'intensity', type: 'number', value: 1.5, min: 0, max: 3, step: 0.1 },
    { name: 'gridSize', type: 'number', value: 12, min: 4, max: 20, step: 1 },
    { name: 'rotationSpeed', type: 'number', value: 2, min: 0, max: 5, step: 0.1 },
    { name: 'glitchAmount', type: 'number', value: 0.8, min: 0, max: 1, step: 0.1 },
    { name: 'colorShift', type: 'number', value: 0.7, min: 0, max: 1, step: 0.1 },
    { name: 'depthVariation', type: 'number', value: 2, min: 0, max: 3, step: 0.1 },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.1 }
  ]
};

// Register the effect (single registration)
registerEffect('rotating-square-glitch-effect', RotatingSquareGlitchEffect);

export default RotatingSquareGlitchEffect;
