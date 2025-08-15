import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface VideoSliceOffsetEffectProps {
  sliceCount?: number;
  offsetAmount?: number;
  sliceWidth?: number;
  animationSpeed?: number;
  sliceDirection?: 'horizontal' | 'vertical';
  removeGaps?: boolean;
  videoTexture?: THREE.VideoTexture;
  bpm?: number;
  isGlobal?: boolean; // New prop to indicate if this is a global effect
}

const VideoSliceOffsetEffect: React.FC<VideoSliceOffsetEffectProps> = ({
  sliceCount = 41,
  offsetAmount = 0.48,
  sliceWidth = 0.05,
  animationSpeed = 1.0,
  sliceDirection = 'horizontal',
  removeGaps = true,
  videoTexture,
  bpm = 120,
  isGlobal = false // Default to false
}) => {
  // Debug all props
  console.log('🎬 VideoSliceOffsetEffect: All props received:', {
    sliceCount,
    offsetAmount,
    sliceWidth,
    animationSpeed,
    sliceDirection,
    removeGaps,
    videoTexture: !!videoTexture,
    videoTextureType: videoTexture?.constructor?.name,
    bpm,
    isGlobal
  });
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const frameCountRef = useRef(0);
  const lastTextureRef = useRef<THREE.Texture | null>(null);

  console.log('🎨 VideoSliceOffsetEffect component rendered with props:', { 
    sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection, removeGaps, bpm, isGlobal 
  });
  
  // Debug video texture
  if (videoTexture) {
    console.log('🎬 VideoSliceOffsetEffect: videoTexture details:', {
      hasImage: !!videoTexture.image,
      imageType: videoTexture.image?.constructor?.name,
      readyState: videoTexture.image?.readyState,
      videoWidth: videoTexture.image?.videoWidth,
      videoHeight: videoTexture.image?.videoHeight
    });
  } else {
    console.log('🎬 VideoSliceOffsetEffect: No videoTexture provided');
  }

  // For global effects, we need to capture the current render target
  const renderTarget = useMemo(() => {
    if (isGlobal || !videoTexture) {
      const rt = new THREE.WebGLRenderTarget(1920, 1080, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      });
      return rt;
    }
    return null;
  }, [isGlobal]);

  // Canvas buffer to persist the last good frame (prevents black and background bleed)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    // Initialize with a fallback pattern instead of empty canvas
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
    const initialTexture: THREE.Texture = (lastTextureRef.current as THREE.Texture)
      || ((videoTexture && !isGlobal) ? (videoTexture as THREE.Texture) : (renderTarget ? renderTarget.texture : bufferTexture));

    if (!lastTextureRef.current) {
      lastTextureRef.current = initialTexture;
    }

    // Always render from live videoTexture if provided, otherwise from our persistent canvas buffer
    const inputTexture: THREE.Texture = initialTexture;

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
      uniform float sliceCount;
      uniform float offsetAmount;
      uniform float sliceWidth;
      uniform float animationSpeed;
      uniform int sliceDirection;
      uniform float bpm;
      uniform int inputIsSRGB;
      uniform float removeGaps;

      varying vec2 vUv;

      // three.js color space helpers
      #ifdef USE_ENVMAP
      #endif
      
      vec2 sliceOffset(vec2 uv, float time, float count, float offset, float width, float speed, int direction) {
        vec2 offsetUV = uv;
        if (direction == 0) {
          float sliceIndex = floor(uv.y * count);
          float sliceShift = sin(time * speed + sliceIndex * 0.5) * offset;
          offsetUV.x = fract(uv.x + sliceShift);
        } else {
          float sliceIndex = floor(uv.x * count);
          float sliceShift = cos(time * speed + sliceIndex * 0.3) * offset;
          offsetUV.y = fract(uv.y + sliceShift);
        }
        return offsetUV;
      }

      void main() {
        vec2 slicedUV = sliceOffset(vUv, time, sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection);

        float sliceMask = 0.0;
        if (sliceDirection == 0) {
          float sliceY = fract(vUv.y * sliceCount);
          sliceMask = step(sliceWidth, sliceY) * step(sliceY, 1.0 - sliceWidth);
        } else {
          float sliceX = fract(vUv.x * sliceCount);
          sliceMask = step(sliceWidth, sliceX) * step(sliceX, 1.0 - sliceWidth);
        }

        vec4 texColor = texture2D(tDiffuse, slicedUV);
        if (inputIsSRGB == 1) {
          texColor.rgb = pow(texColor.rgb, vec3(2.2));
        }

        vec4 outColor;
        if (removeGaps > 0.5) {
          outColor = texColor;
        } else {
          outColor = (sliceMask > 0.0) ? texColor : vec4(0.0, 0.0, 0.0, 1.0);
        }

        // Force full opacity for replacesVideo effects to avoid background showing through
        outColor.a = 1.0;
        // Write linear color into render target; final display pass handles encoding
        gl_FragColor = outColor;
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture },
        time: { value: 0.0 },
        sliceCount: { value: sliceCount },
        offsetAmount: { value: offsetAmount },
        sliceWidth: { value: sliceWidth },
        animationSpeed: { value: animationSpeed },
        sliceDirection: { value: 0 },
        removeGaps: { value: removeGaps ? 1.0 : 0.0 },
        bpm: { value: bpm },
        inputIsSRGB: { value: 1 }
      },
      // Opaque output to ensure background never bleeds through
      transparent: false,
      toneMapped: false
    });
  }, []);

  // Update input texture when upstream changes to avoid stale binding and prevent feedback loops
  useEffect(() => {
    if (!materialRef.current) return;
    console.log('🎥 Texture update triggered:', {
      hasVideoTexture: !!videoTexture,
      hasRenderTarget: !!renderTarget,
      isGlobal,
      currentTexture: materialRef.current.uniforms.tDiffuse.value?.uuid
    });
    const nextTex: THREE.Texture | null = isGlobal
      ? (renderTarget ? renderTarget.texture : bufferTexture)
      : ((videoTexture as unknown as THREE.Texture) || bufferTexture);
    if (nextTex && materialRef.current.uniforms.tDiffuse.value !== nextTex) {
      console.log('🔄 Updating texture:', {
        from: materialRef.current.uniforms.tDiffuse.value?.uuid,
        to: nextTex.uuid
      });
      materialRef.current.uniforms.tDiffuse.value = nextTex;
      lastTextureRef.current = nextTex;
    }
    const isSRGB = !!((nextTex as any)?.isVideoTexture || (nextTex as any)?.isCanvasTexture);
    materialRef.current.uniforms.inputIsSRGB.value = isSRGB ? 1 : 0;
  }, [videoTexture, renderTarget, bufferTexture, isGlobal]);

  // Keep slice direction uniform synced with prop
  useEffect(() => {
    if (materialRef.current) {
      const dir = sliceDirection === 'horizontal' ? 0 : 1;
      if (materialRef.current.uniforms.sliceDirection.value !== dir) {
        materialRef.current.uniforms.sliceDirection.value = dir;
      }
    }
  }, [sliceDirection]);

  // Calculate aspect ratio from video texture if available
  const aspectRatio = useMemo(() => {
    if (videoTexture && videoTexture.image && !isGlobal) { // Added !isGlobal
      try {
        const { width, height } = videoTexture.image as any;
        if (width && height && width > 0 && height > 0) {
          return width / height;
        }
      } catch (error) {
        console.warn('Error calculating aspect ratio from video texture:', error);
      }
    }
    return 16/9; // Default aspect ratio
  }, [videoTexture, isGlobal]); // Added isGlobal

  // Keep time advancing; other uniforms are updated via effects on prop change
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  // Update parameter uniforms when props change
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    console.log('🎛️ Parameter update:', {
      sliceCount,
      offsetAmount,
      sliceWidth,
      animationSpeed,
      sliceDirection,
      removeGaps,
      bpm,
      materialId: mat.uuid
    });
    mat.uniforms.sliceCount.value = sliceCount;
    mat.uniforms.offsetAmount.value = offsetAmount;
    mat.uniforms.sliceWidth.value = sliceWidth;
    mat.uniforms.animationSpeed.value = animationSpeed;
    mat.uniforms.sliceDirection.value = sliceDirection === 'horizontal' ? 0 : 1;
    mat.uniforms.removeGaps.value = removeGaps ? 1.0 : 0.0;
    mat.uniforms.bpm.value = bpm;
  }, [sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection, removeGaps, bpm]);

  // Don't render if missing dependencies
  if (!shaderMaterial) {
    console.log('🚫 Missing dependencies for VideoSliceOffsetEffect:', {
      videoTexture: !!videoTexture,
      shaderMaterial: !!shaderMaterial,
      isGlobal
    });
    return null;
  }

  

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} attach="material" ref={materialRef} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(VideoSliceOffsetEffect as any).metadata = {
  name: 'Video Slice Offset Effect',
  description: 'Slices video into strips and offsets them for glitch-like effects - works as both layer and global effect',
  category: 'Video',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  canBeGlobal: true, // NEW: This effect can be used as a global effect
  parameters: [
    {
      name: 'sliceCount',
      type: 'number',
      value: 41,
      min: 2,
      max: 50,
      step: 1,
      description: 'Number of slices'
    },
    {
      name: 'offsetAmount',
      type: 'number',
      value: 0.48,
      min: 0.01,
      max: 0.5,
      step: 0.01,
      description: 'Amount of slice offset'
    },
    {
      name: 'sliceWidth',
      type: 'number',
      value: 0.05,
      min: 0.01,
      max: 0.2,
      step: 0.01,
      description: 'Width of slice gaps'
    },
    {
      name: 'animationSpeed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Animation speed'
    },
    {
      name: 'sliceDirection',
      type: 'select',
      value: 'horizontal',
      options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' }
      ],
      description: 'Direction of slices'
    },
    {
      name: 'removeGaps',
      type: 'boolean',
      value: true,
      description: 'Remove gaps between slices'
    }
  ]
};

// Self-register the effect - use unique registration name
console.log('🔧 Registering video-slice-offset-effect...');
registerEffect('video-slice-offset-effect', VideoSliceOffsetEffect);
registerEffect('VideoSliceOffsetEffect', VideoSliceOffsetEffect); // Also register with PascalCase for compatibility
console.log('✅ VideoSliceOffsetEffect registered successfully');

export default VideoSliceOffsetEffect;
