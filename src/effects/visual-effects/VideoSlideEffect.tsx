import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';
import { sourceTextureRegistry } from '../../utils/SourceTextureRegistry';

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

  // Prefer provided videoTexture; otherwise fall back to webcam source if available
  const inputVideoTexture = useMemo(() => {
    return videoTexture ?? sourceTextureRegistry.getTexture('WebcamSource');
  }, [videoTexture]);

  // Persistent buffer to hold last good frame and avoid background bleed
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    // Initialize with 1x1 transparent pixel
    canvas.width = 1;
    canvas.height = 1;
    offscreenCanvasRef.current = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

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
        // Always sample from our persistent buffer
        tDiffuse: { value: bufferTexture },
        time: { value: 0.0 },
        slideSpeed: { value: slideSpeed },
        slideAmount: { value: slideAmount },
        slideDirection: { value: 0 },
        bpm: { value: bpm }
      },
      // Start transparent, we will make opaque once the first frame is captured
      transparent: true
    });
  }, [bufferTexture, slideSpeed, slideAmount, slideDirection, bpm]);

  // Calculate aspect ratio from video texture if available
  const aspectRatio = useMemo(() => {
    if (inputVideoTexture && inputVideoTexture.image) {
      try {
        const { width, height } = (inputVideoTexture as any).image;
        if (width && height && width > 0 && height > 0) {
          return width / height;
        }
      } catch (error) {
        console.warn('Error calculating aspect ratio from video texture:', error);
      }
    }
    return 16/9; // Default aspect ratio
  }, [inputVideoTexture]);

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
      
      // Only update uniforms when values actually change
      if (materialRef.current.uniforms.slideDirection.value !== directionValue) {
        materialRef.current.uniforms.slideDirection.value = directionValue;
      }
      if (materialRef.current.uniforms.slideSpeed.value !== slideSpeed) {
        materialRef.current.uniforms.slideSpeed.value = slideSpeed;
      }
      if (materialRef.current.uniforms.slideAmount.value !== slideAmount) {
        materialRef.current.uniforms.slideAmount.value = slideAmount;
      }
      
      // Update buffer from the video element when ready
      if (inputVideoTexture) {
        const videoEl: any = (inputVideoTexture as any).image;
        const canvas = offscreenCanvasRef.current;
        if (videoEl && canvas) {
          const ready = typeof videoEl.readyState === 'number' ? videoEl.readyState >= 2 : true;
          if (ready && videoEl.videoWidth && videoEl.videoHeight) {
            if (canvas.width !== videoEl.videoWidth || canvas.height !== videoEl.videoHeight) {
              canvas.width = videoEl.videoWidth;
              canvas.height = videoEl.videoHeight;
            }
            const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            bufferTexture.needsUpdate = true;
            if (materialRef.current.transparent) {
              materialRef.current.transparent = false;
            }
          } catch {}
        }
          }
        }
        // Ensure shader samples from our buffer
        if (materialRef.current.uniforms.tDiffuse.value !== bufferTexture) {
          materialRef.current.uniforms.tDiffuse.value = bufferTexture;
        }
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
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
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
registerEffect('video-slide-effect', VideoSlideEffect);
registerEffect('VideoSlideEffect', VideoSlideEffect); // Also register with PascalCase for compatibility
console.log('✅ VideoSlideEffect registered successfully');

export default VideoSlideEffect;
