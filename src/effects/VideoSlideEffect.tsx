import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../utils/effectRegistry';

interface VideoSlideEffectProps {
  slideSpeed?: number;
  slideDirection?: 'horizontal' | 'vertical' | 'diagonal' | 'circular';
  slideAmount?: number;
  videoTexture?: THREE.VideoTexture;
  bpm?: number;
}

const VideoSlideEffect: React.FC<VideoSlideEffectProps> = ({
  slideSpeed = 1.0,
  slideDirection = 'horizontal',
  slideAmount = 0.5,
  videoTexture,
  bpm = 120
}) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    const vertexShader = `
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform float slideSpeed;
      uniform float slideAmount;
      uniform int slideDirection;
      uniform float bpm;
      
      varying vec2 vUv;
      
      vec2 slideUV(vec2 uv, float time, float speed, float amount, int direction) {
        vec2 offset = vec2(0.0);
        
        if (direction == 0) { // horizontal
          offset.x = sin(time * speed) * amount;
        } else if (direction == 1) { // vertical
          offset.y = cos(time * speed) * amount;
        } else if (direction == 2) { // diagonal
          offset.x = sin(time * speed) * amount;
          offset.y = cos(time * speed * 0.7) * amount;
        } else if (direction == 3) { // circular
          float angle = time * speed;
          offset.x = sin(angle) * amount;
          offset.y = cos(angle) * amount;
        } else if (direction == 4) { // bpm sync horizontal
          float bpmTime = (bpm / 60.0) * time;
          offset.x = sin(bpmTime * 3.14159 * 2.0) * amount;
        } else if (direction == 5) { // bpm sync vertical
          float bpmTime = (bpm / 60.0) * time;
          offset.y = cos(bpmTime * 3.14159 * 2.0) * amount;
        }
        
        return uv + offset;
      }
      
      void main() {
        vec2 slidUV = slideUV(vUv, time, slideSpeed, slideAmount, slideDirection);
        
        // Handle UV wrapping
        slidUV = fract(slidUV);
        
        vec4 texColor = texture2D(tDiffuse, slidUV);
        gl_FragColor = texColor;
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: videoTexture || new THREE.Texture() },
        time: { value: 0.0 },
        slideSpeed: { value: slideSpeed },
        slideAmount: { value: slideAmount },
        slideDirection: { value: 0 },
        bpm: { value: bpm }
      },
      transparent: true
    });
  }, [videoTexture, slideSpeed, slideAmount, slideDirection, bpm]);

  // Calculate aspect ratio from video texture if available
  const aspectRatio = useMemo(() => {
    if (videoTexture && videoTexture.image) {
      try {
        const { width, height } = videoTexture.image;
        if (width && height && width > 0 && height > 0) {
          return width / height;
        }
      } catch (error) {
        console.warn('Error calculating aspect ratio from video texture:', error);
      }
    }
    return 16/9; // Default aspect ratio
  }, [videoTexture]);

  // Animation loop
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.bpm.value = bpm;
      
      // Update slide direction uniform
      let directionValue = 0;
      switch (slideDirection) {
        case 'horizontal':
          directionValue = 0;
          break;
        case 'vertical':
          directionValue = 1;
          break;
        case 'diagonal':
          directionValue = 2;
          break;
        case 'circular':
          directionValue = 3;
          break;
        case 'bpm-horizontal':
          directionValue = 4;
          break;
        case 'bpm-vertical':
          directionValue = 5;
          break;
        default:
          directionValue = 0;
      }
      
      materialRef.current.uniforms.slideDirection.value = directionValue;
      materialRef.current.uniforms.slideSpeed.value = slideSpeed;
      materialRef.current.uniforms.slideAmount.value = slideAmount;
      
      // Update video texture if available
      if (videoTexture && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(VideoSlideEffect as any).metadata = {
  name: 'Video Slide Effect',
  description: 'Slides and pans video texture with various motion patterns',
  category: 'Video',
  icon: '🎬',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'slideSpeed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Speed of the slide motion'
    },
    {
      name: 'slideDirection',
      type: 'string',
      value: 'horizontal',
      description: 'Direction of slide motion'
    },
    {
      name: 'slideAmount',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Amount of slide movement'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering VideoSlideEffect...');
registerEffect('VideoSlideEffect', VideoSlideEffect);
console.log('✅ VideoSlideEffect registered successfully');

export default VideoSlideEffect;
