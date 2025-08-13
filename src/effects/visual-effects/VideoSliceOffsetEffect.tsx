import React, { useRef, useMemo } from 'react';
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
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { gl, scene, camera } = useThree(); // Destructure gl, scene, camera

  console.log('🎨 VideoSliceOffsetEffect component rendered with props:', { 
    sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection, removeGaps, bpm, isGlobal 
  });

  // For global effects, we need to capture the current render target
  const renderTarget = useMemo(() => {
    if (isGlobal) {
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
    offscreenCanvasRef.current = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    // Always render from our persistent canvas buffer
    const inputTexture: THREE.Texture = bufferTexture;

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
      uniform float removeGaps;
      
      varying vec2 vUv;
      
      vec2 sliceOffset(vec2 uv, float time, float count, float offset, float width, float speed, int direction) {
        vec2 offsetUV = uv;
        
        if (direction == 0) { // horizontal slices
          float sliceIndex = floor(uv.y * count);
          float sliceOffset = sin(time * speed + sliceIndex * 0.5) * offset;
          offsetUV.x = fract(uv.x + sliceOffset);
        } else { // vertical slices
          float sliceIndex = floor(uv.x * count);
          float sliceOffset = cos(time * speed + sliceIndex * 0.3) * offset;
          offsetUV.y = fract(uv.y + sliceOffset);
        }
        
        return offsetUV;
      }
      
      void main() {
        vec2 slicedUV = sliceOffset(vUv, time, sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection);
        
        // Create slice mask - show only the slice areas, hide the gaps
        float sliceMask = 0.0;
        if (sliceDirection == 0) { // horizontal
          float sliceY = fract(vUv.y * sliceCount);
          // Show content only in the slice areas (not in the gaps)
          sliceMask = step(sliceWidth, sliceY) * step(sliceY, 1.0 - sliceWidth);
        } else { // vertical
          float sliceX = fract(vUv.x * sliceCount);
          // Show content only in the slice areas (not in the gaps)
          sliceMask = step(sliceWidth, sliceX) * step(sliceX, 1.0 - sliceWidth);
        }
        
        vec4 texColor = texture2D(tDiffuse, slicedUV);
        
        // Apply slice mask - make gaps black (opaque) to hide underlying video
        if (removeGaps > 0.5) {
          // Remove gaps completely - show full video
          gl_FragColor = texColor;
        } else {
          // Show slices with gaps
          if (sliceMask > 0.0) {
            gl_FragColor = texColor;
          } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black gaps
          }
        }
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture }, // Initial value
        time: { value: 0.0 },
        sliceCount: { value: sliceCount },
        offsetAmount: { value: offsetAmount },
        sliceWidth: { value: sliceWidth },
        animationSpeed: { value: animationSpeed },
        sliceDirection: { value: 0 },
        removeGaps: { value: removeGaps ? 1.0 : 0.0 },
        bpm: { value: bpm }
      },
      transparent: true
    });
  }, [bufferTexture, sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection, removeGaps, bpm]);

  // Calculate aspect ratio from video texture if available
  const aspectRatio = useMemo(() => {
    if (videoTexture && videoTexture.image && !isGlobal) { // Added !isGlobal
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
  }, [videoTexture, isGlobal]); // Added isGlobal

  // Animation loop
  useFrame((state) => {
    // For global effects, capture the current scene and apply slice offset effect
    if (isGlobal && renderTarget && shaderMaterial) {
      // Capture current scene to render target
      const currentRenderTarget = gl.getRenderTarget();
      gl.setRenderTarget(renderTarget);
      gl.render(scene, camera);
      gl.setRenderTarget(currentRenderTarget);

      // Update the input buffer to use the captured scene
      if (materialRef.current) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    }

    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.bpm.value = bpm;
      
      // Debug: Log the current parameter values being received
      if (state.clock.elapsedTime % 2 < 0.1) { // Log every 2 seconds
        console.log('🔍 VideoSliceOffsetEffect - Current props:', {
          sliceCount,
          offsetAmount,
          sliceWidth,
          animationSpeed,
          sliceDirection,
          removeGaps,
          bpm,
          isGlobal
        });
        console.log('🔍 VideoSliceOffsetEffect - Current uniforms:', {
          sliceCount: materialRef.current.uniforms.sliceCount.value,
          offsetAmount: materialRef.current.uniforms.offsetAmount.value,
          sliceWidth: materialRef.current.uniforms.sliceWidth.value,
          animationSpeed: materialRef.current.uniforms.animationSpeed.value,
          sliceDirection: materialRef.current.uniforms.sliceDirection.value,
          removeGaps: materialRef.current.uniforms.removeGaps.value
        });
      }
      
      // Get current uniform values to compare against
      const currentSliceCount = materialRef.current.uniforms.sliceCount.value;
      const currentOffsetAmount = materialRef.current.uniforms.offsetAmount.value;
      const currentSliceWidth = materialRef.current.uniforms.sliceWidth.value;
      const currentAnimationSpeed = materialRef.current.uniforms.animationSpeed.value;
      const currentSliceDirection = materialRef.current.uniforms.sliceDirection.value;
      const currentRemoveGaps = materialRef.current.uniforms.removeGaps.value;
      
      // Use the current prop values (which come from the layer's current parameters)
      // This ensures the effect reflects the user's current settings
      if (currentSliceCount !== sliceCount) {
        materialRef.current.uniforms.sliceCount.value = sliceCount;
      }
      if (currentOffsetAmount !== offsetAmount) {
        materialRef.current.uniforms.offsetAmount.value = offsetAmount;
      }
      if (currentSliceWidth !== sliceWidth) {
        materialRef.current.uniforms.sliceWidth.value = sliceWidth;
      }
      if (currentAnimationSpeed !== animationSpeed) {
        materialRef.current.uniforms.animationSpeed.value = animationSpeed;
      }
      
      const newSliceDirection = sliceDirection === 'horizontal' ? 0 : 1;
      if (currentSliceDirection !== newSliceDirection) {
        materialRef.current.uniforms.sliceDirection.value = newSliceDirection;
      }
      
      const newRemoveGaps = removeGaps ? 1.0 : 0.0;
      if (currentRemoveGaps !== newRemoveGaps) {
        materialRef.current.uniforms.removeGaps.value = newRemoveGaps;
      }
      
      // Update buffer from video texture when ready (layer effects)
      if (!isGlobal && videoTexture) {
        const videoEl: any = (videoTexture as any).image;
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
                // Once we have a frame, make material opaque to avoid background bleed
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
      <primitive object={shaderMaterial} ref={materialRef} />
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
