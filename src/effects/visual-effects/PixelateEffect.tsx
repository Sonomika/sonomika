import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { registerEffect } from '../../utils/effectRegistry';

interface PixelateEffectProps {
  pixelSize?: number;
  intensity?: number;
  videoTexture?: THREE.VideoTexture;
}

export const PixelateEffect: React.FC<PixelateEffectProps> = ({ 
  pixelSize = 0.02, 
  intensity = 1.0,
  videoTexture 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    const vertexShader = `
      precision mediump float;
      precision mediump int;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision mediump float;
      precision mediump int;
      uniform sampler2D tDiffuse;
      uniform float uPixelSize;       // fraction of screen width (0..1)
      uniform float uIntensity;       // brightness multiplier
      uniform vec2 uResolution;       // renderer size in pixels
      varying vec2 vUv;

      void main() {
        // Compute pixel grid count based on resolution and requested pixel size.
        // Clamp to avoid division by zero and extremely large counts.
        float minPixelSize = max(uPixelSize, 1.0 / max(uResolution.x, 1.0));
        vec2 pixelCount = max(vec2(1.0), uResolution * minPixelSize);

        // Snap uv to the grid
        vec2 snappedUv = floor(vUv * pixelCount) / pixelCount;

        // Sample
        vec4 color = texture2D(tDiffuse, snappedUv);
        color.rgb *= uIntensity;
        gl_FragColor = color;
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: videoTexture || new THREE.Texture() },
        uPixelSize: { value: pixelSize },
        uIntensity: { value: intensity },
        uResolution: { value: new THREE.Vector2(1920, 1080) }
      },
      transparent: true
    });

    return mat;
  }, []);

  // Calculate aspect ratio from video texture if available
  const aspectRatio = useMemo(() => {
    if (videoTexture && (videoTexture as any).image) {
      try {
        const { width, height } = (videoTexture as any).image;
        if (width && height && width > 0 && height > 0) {
          return width / height;
        }
      } catch (error) {
        console.warn('Error calculating aspect ratio from video texture:', error);
      }
    }
    return 16/9; // Default aspect ratio
  }, [videoTexture]);

  // Update uniforms when props change
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uPixelSize.value = pixelSize;
      materialRef.current.uniforms.uIntensity.value = intensity;
    }
  }, [pixelSize, intensity]);

  // Animation loop
  useFrame((state) => {
    if (materialRef.current) {
      // Update resolution
      materialRef.current.uniforms.uResolution.value.set(
        state.gl.domElement.width,
        state.gl.domElement.height
      );
      
      // Update video texture if available
      if (videoTexture && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
      
      // Update parameter uniforms
      materialRef.current.uniforms.uPixelSize.value = pixelSize;
      materialRef.current.uniforms.uIntensity.value = intensity;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata for the effect
PixelateEffect.metadata = {
  name: 'Pixelate Effect',
  description: 'Applies a pixelation filter to video content',
  category: 'Distortion',
  replacesVideo: true, // This effect replaces the video texture
  parameters: [
    {
      name: 'pixelSize',
      type: 'number',
      min: 0.001,
      max: 0.2,
      step: 0.001,
      value: 0.02,
      description: 'Relative pixel size (fraction of width)'
    },
    {
      name: 'intensity',
      type: 'number',
      min: 0.1,
      max: 2.0,
      step: 0.1,
      value: 1.0,
      description: 'Intensity of the pixelation effect'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering PixelateEffect...');
registerEffect('PixelateEffect', PixelateEffect);
console.log('✅ PixelateEffect registered successfully');

export default PixelateEffect;
