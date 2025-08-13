// src/effects/VideoWarpEffect.tsx
import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface VideoWarpEffectProps {
  intensity?: number;
  frequency?: number;
  speed?: number;
  waveType?: 'sine' | 'cosine' | 'tangent';
  videoTexture?: THREE.VideoTexture;
  isGlobal?: boolean; // New prop to indicate if this is a global effect
}

const VideoWarpEffect: React.FC<VideoWarpEffectProps> = ({
  intensity = 0.1,
  frequency = 3.0,
  speed = 1.0,
  waveType = 'sine',
  videoTexture,
  isGlobal = false // Default to false
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();
  const { gl, scene, camera } = useThree(); // Destructure gl, scene, camera

  console.log('🎨 VideoWarpEffect component rendered with props:', { intensity, frequency, speed, waveType, isGlobal });

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

  // Create shader material that warps the video texture
  const shaderMaterial = useMemo(() => {
    // For global effects, we'll use a fallback texture initially
    const inputTexture = videoTexture || new THREE.Color(0, 0, 0); // Fallback for global

    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        intensity: { value: intensity },
        frequency: { value: frequency },
        speed: { value: speed },
        bpm: { value: bpm },
        waveType: { value: waveType === 'sine' ? 0 : waveType === 'cosine' ? 1 : 2 },
        tDiffuse: { value: inputTexture } // Initial value
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float time;
        uniform float intensity;
        uniform float frequency;
        uniform float speed;
        uniform float bpm;
        uniform int waveType;
        
        void main() {
          // Get original UV coordinates
          vec2 uv = uv;
          
          // Calculate wave distortion based on BPM
          float beatTime = time * (bpm / 60.0);
          float waveTime = time * speed;
          
          // Create different wave patterns
          float waveX, waveY;
          
          if (waveType == 0) {
            // Sine wave
            waveX = sin(uv.x * frequency * 3.14159 + waveTime) * 
                    sin(uv.y * frequency * 2.0 + waveTime * 0.7) * intensity;
            waveY = cos(uv.x * frequency * 2.5 + waveTime * 1.3) * 
                    sin(uv.y * frequency * 1.5 + waveTime * 0.9) * intensity;
          } else if (waveType == 1) {
            // Cosine wave
            waveX = cos(uv.x * frequency * 2.0 + waveTime) * 
                    cos(uv.y * frequency * 1.8 + waveTime * 0.5) * intensity;
            waveY = sin(uv.x * frequency * 2.2 + waveTime * 1.1) * 
                    cos(uv.y * frequency * 1.3 + waveTime * 0.8) * intensity;
          } else {
            // Tangent-like wave (using sin/cos combination)
            waveX = sin(uv.x * frequency * 4.0 + waveTime) * 
                    cos(uv.y * frequency * 3.0 + waveTime * 0.6) * intensity;
            waveY = cos(uv.x * frequency * 3.5 + waveTime * 1.2) * 
                    sin(uv.y * frequency * 2.5 + waveTime * 0.4) * intensity;
          }
          
          // Add BPM-based pulsing
          float bpmPulse = sin(beatTime * 3.14159 * 2.0) * 0.3 + 0.7;
          waveX *= bpmPulse;
          waveY *= bpmPulse;
          
          // Apply distortion to UV coordinates
          vec2 distortedUv = uv + vec2(waveX, waveY);
          
          // Pass distorted UV to fragment shader
          vUv = distortedUv;
          
          // Standard vertex transformation
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        
        void main() {
          // Sample the video texture with distorted UV coordinates
          vec4 texColor = texture2D(tDiffuse, vUv);
          
          // Return the warped video color
          gl_FragColor = texColor;
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
  }, [intensity, frequency, speed, waveType, bpm, videoTexture, isGlobal]);

  useFrame((state) => {
    // For global effects, capture the current scene and apply warp effect
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
      
      // Update parameter uniforms in real-time
      materialRef.current.uniforms.intensity.value = intensity;
      materialRef.current.uniforms.frequency.value = frequency;
      materialRef.current.uniforms.speed.value = speed;
      materialRef.current.uniforms.waveType.value = waveType === 'sine' ? 0.0 : 
                                                   waveType === 'cosine' ? 1.0 : 2.0;
      
      // Update video texture if available (for layer effects)
      if (videoTexture && !isGlobal && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
    }
  });

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

  // Don't render if missing dependencies
  if (!shaderMaterial) {
    console.log('🚫 Missing dependencies for VideoWarpEffect:', {
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
(VideoWarpEffect as any).metadata = {
  name: 'Video Warp',
  description: 'Distorts video texture with wave patterns synchronized to BPM - works as both layer and global effect',
  category: 'Video',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  canBeGlobal: true, // NEW: This effect can be used as a global effect
  parameters: [
    {
      name: 'intensity',
      type: 'number',
      value: 0.1,
      min: 0.01,
      max: 0.5,
      step: 0.01,
      description: 'Warp intensity'
    },
    {
      name: 'frequency',
      type: 'number',
      value: 3.0,
      min: 0.5,
      max: 10.0,
      step: 0.5,
      description: 'Wave frequency'
    },
    {
      name: 'speed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Animation speed'
    },
    {
      name: 'waveType',
      type: 'select',
      value: 'sine',
      options: [
        { value: 'sine', label: 'Sine Wave' },
        { value: 'cosine', label: 'Cosine Wave' },
        { value: 'tangent', label: 'Tangent Wave' }
      ],
      description: 'Wave pattern type'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering VideoWarpEffect...');
registerEffect('VideoWarpEffect', VideoWarpEffect);
console.log('✅ VideoWarpEffect registered successfully');

export default VideoWarpEffect;
