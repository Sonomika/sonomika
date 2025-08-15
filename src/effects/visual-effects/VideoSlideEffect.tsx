import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';
import { sourceTextureRegistry } from '../../utils/SourceTextureRegistry';

interface VideoSlideEffectProps {
  slideSpeed?: number;
  slideDirection?: 'horizontal' | 'vertical' | 'diagonal' | 'circular' | 'bpm-horizontal' | 'bpm-vertical';
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
  // Debug all props
  console.log('🎬 VideoSlideEffect: All props received:', {
    slideSpeed,
    slideDirection,
    slideAmount,
    videoTexture: !!videoTexture,
    videoTextureType: videoTexture?.constructor?.name,
    bpm
  });
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 10;
  const frameCountRef = useRef(0);
  const maxFrames = 300; // Give up after 5 seconds at 60fps
  const { } = useThree();
  const lastTextureRef = useRef<THREE.Texture | null>(null);
  const [aspect, setAspect] = React.useState<number>(16 / 9);

  // Create a render target to capture scene when no direct video is available
  const renderTarget = useMemo(() => {
    if (!videoTexture) {
      const rt = new THREE.WebGLRenderTarget(1920, 1080, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      });
      return rt;
    }
    return null;
  }, [videoTexture]);

  // Prefer provided videoTexture; otherwise fall back to webcam source if available
  const inputVideoTexture = useMemo(() => {
    console.log('🎬 VideoSlideEffect: videoTexture prop:', !!videoTexture, 'type:', videoTexture?.constructor?.name);
    if (videoTexture) {
      console.log('🎬 VideoSlideEffect: videoTexture details:', {
        hasImage: !!videoTexture.image,
        imageType: videoTexture.image?.constructor?.name,
        readyState: videoTexture.image?.readyState,
        videoWidth: videoTexture.image?.videoWidth,
        videoHeight: videoTexture.image?.videoHeight
      });
    }
    return videoTexture ?? sourceTextureRegistry.getTexture('WebcamSource');
  }, [videoTexture]);

  // Persistent buffer to hold last good frame and avoid background bleed
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    // Initialize with a fallback pattern instead of transparent pixel
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create a simple fallback pattern
      ctx.fillStyle = '#333333';
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, 48, 48);
      ctx.fillStyle = '#999999';
      ctx.fillRect(16, 16, 32, 32);
    }
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

    const initialTexture = (lastTextureRef.current as THREE.Texture)
      || (videoTexture as THREE.Texture)
      || (renderTarget ? renderTarget.texture : null)
      || bufferTexture;

    if (!lastTextureRef.current) {
      lastTextureRef.current = initialTexture;
    }

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: initialTexture },
        time: { value: 0.0 },
        slideSpeed: { value: slideSpeed },
        slideAmount: { value: slideAmount },
        slideDirection: { value: 0 },
        bpm: { value: bpm }
      },
      transparent: true
    });
  }, [bufferTexture, videoTexture, renderTarget]);

  // Update aspect ratio from the best available texture image when it becomes valid
  useFrame(() => {
    const tex = (videoTexture as THREE.Texture) || lastTextureRef.current || (renderTarget ? renderTarget.texture : null);
    const img: any = (tex as any)?.image;
    if (img && img.videoWidth && img.videoHeight && img.videoWidth > 0 && img.videoHeight > 0) {
      const next = img.videoWidth / img.videoHeight;
      if (Math.abs(next - aspect) > 0.001) setAspect(next);
    }
  });

  // Calculate aspect ratio (stable)
  const aspectRatio = aspect;

  // Animation loop
  useFrame((state) => {
    frameCountRef.current++;
    
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

      // Texture binding is handled in useMemo and only changes when the source changes
      // No need to constantly update tDiffuse during playback - this was causing the conflict
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
