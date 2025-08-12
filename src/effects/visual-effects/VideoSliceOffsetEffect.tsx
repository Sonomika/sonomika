import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
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
}

const VideoSliceOffsetEffect: React.FC<VideoSliceOffsetEffectProps> = ({
  sliceCount = 41,
  offsetAmount = 0.48,
  sliceWidth = 0.05,
  animationSpeed = 1.0,
  sliceDirection = 'horizontal',
  removeGaps = true,
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
         tDiffuse: { value: videoTexture || new THREE.Texture() },
         time: { value: 0.0 },
         sliceCount: { value: sliceCount },
         offsetAmount: { value: offsetAmount },
         sliceWidth: { value: sliceWidth },
         animationSpeed: { value: animationSpeed },
         sliceDirection: { value: 0 },
         removeGaps: { value: removeGaps ? 1.0 : 0.0 },
         bpm: { value: bpm }
       },
       transparent: false
     });
  }, [videoTexture, sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection, removeGaps, bpm]);

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
      
      // Debug: Log the current parameter values being received
      if (state.clock.elapsedTime % 2 < 0.1) { // Log every 2 seconds
        console.log('🔍 VideoSliceOffsetEffect - Current props:', {
          sliceCount,
          offsetAmount,
          sliceWidth,
          animationSpeed,
          sliceDirection,
          removeGaps,
          bpm
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
(VideoSliceOffsetEffect as any).metadata = {
  name: 'Video Slice Offset Effect',
  description: 'Slices video into strips and offsets them for glitch-like effects',
  category: 'Video',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
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
