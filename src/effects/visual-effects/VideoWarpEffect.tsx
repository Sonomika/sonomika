// src/effects/visual-effects/VideoWarpEffect.tsx
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';
import { useOptimizedUniforms } from '../../hooks/useOptimizedUniforms';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface VideoWarpEffectProps {
  intensity?: number;
  frequency?: number;
  speed?: number;
  waveType?: 'sine' | 'cosine' | 'tangent';
  videoTexture?: THREE.VideoTexture;
  isGlobal?: boolean;
  compositionWidth?: number;
  compositionHeight?: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const VideoWarpEffect = React.memo<VideoWarpEffectProps>(({
  intensity = 0.1,
  frequency = 3.0,
  speed = 1.0,
  waveType = 'sine',
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight
}) => {
  // ============================================================================
  // COMPOSITION SETTINGS & DIMENSIONS
  // ============================================================================
  
  const compositionSettings = useStore((state) => state.compositionSettings);
  const effectiveCompositionWidth = compositionWidth || compositionSettings?.width || 1920;
  const effectiveCompositionHeight = compositionHeight || compositionSettings?.height || 1080;

  // ============================================================================
  // THREE.JS SETUP & REFS
  // ============================================================================
  
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();
  const { gl, scene, camera, size } = useThree();
  const { updateUniforms } = useOptimizedUniforms();

  // For global effects, we need to capture the current render target
  const renderTarget = useMemo(() => {
    if (isGlobal) {
      const rt = new THREE.WebGLRenderTarget(
        Math.max(1, effectiveCompositionWidth),
        Math.max(1, effectiveCompositionHeight),
        {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter
        }
      );
      return rt;
    }
    return null;
  }, [isGlobal, effectiveCompositionWidth, effectiveCompositionHeight]);

  useEffect(() => {
    return () => {
      try {
        renderTarget?.dispose?.();
      } catch {}
    };
  }, [renderTarget]);

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

  // Create shader material that warps the video texture
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        intensity: { value: intensity },
        frequency: { value: frequency },
        speed: { value: speed },
        bpm: { value: bpm },
        waveType: { value: waveType === 'sine' ? 0 : waveType === 'cosine' ? 1 : 2 },
        tDiffuse: { value: bufferTexture }
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
          vec2 localUv = uv;
          
          // Calculate wave distortion based on BPM
          float beatTime = time * (bpm / 60.0);
          float waveTime = time * speed;
          
          // Create different wave patterns
          float waveX, waveY;
          
          if (waveType == 0) {
            // Sine wave
            waveX = sin(localUv.x * frequency * 3.14159 + waveTime) * 
                    sin(localUv.y * frequency * 2.0 + waveTime * 0.7) * intensity;
            waveY = cos(localUv.x * frequency * 2.5 + waveTime * 1.3) * 
                    sin(localUv.y * frequency * 1.5 + waveTime * 0.9) * intensity;
          } else if (waveType == 1) {
            // Cosine wave
            waveX = cos(localUv.x * frequency * 2.0 + waveTime) * 
                    cos(localUv.y * frequency * 1.8 + waveTime * 0.5) * intensity;
            waveY = sin(localUv.x * frequency * 2.2 + waveTime * 1.1) * 
                    cos(localUv.y * frequency * 1.3 + waveTime * 0.8) * intensity;
          } else {
            // Tangent-like wave (using sin/cos combination)
            waveX = sin(localUv.x * frequency * 4.0 + waveTime) * 
                    cos(localUv.y * frequency * 3.0 + waveTime * 0.6) * intensity;
            waveY = cos(localUv.x * frequency * 3.5 + waveTime * 1.2) * 
                    sin(localUv.y * frequency * 2.5 + waveTime * 0.4) * intensity;
          }
          
          // Add BPM-based pulsing
          float bpmPulse = sin(beatTime * 3.14159 * 2.0) * 0.3 + 0.7;
          waveX *= bpmPulse;
          waveY *= bpmPulse;
          
          // Apply distortion to UV coordinates
          vec2 distortedUv = localUv + vec2(waveX, waveY);
          
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
  }, [isGlobal]);

  useFrame((state) => {
    // For global effects, capture the current scene and apply warp effect
    if (isGlobal && renderTarget && shaderMaterial) {
      // Capture current scene to render target, hide this mesh to avoid recursion
      const currentRenderTarget = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(currentRenderTarget);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }

      if (materialRef.current && materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    }

    if (materialRef.current) {
      // Always update time and BPM (these change every frame)
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.bpm.value = bpm;

      // Use optimized uniform updates for parameters
      const waveTypeIndex = waveType === 'sine' ? 0 : waveType === 'cosine' ? 1 : 2;
      updateUniforms(materialRef.current, {
        intensity,
        frequency,
        speed,
        waveType: waveTypeIndex
      });

      // Update input texture in layer mode
      if (!isGlobal && videoTexture && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
    }
  });

  // Update render target size on canvas resize
  useEffect(() => {
    if (isGlobal && renderTarget) {
      renderTarget.setSize(Math.max(1, effectiveCompositionWidth), Math.max(1, effectiveCompositionHeight));
    }
  }, [effectiveCompositionWidth, effectiveCompositionHeight, isGlobal, renderTarget]);

  // Calculate aspect ratio from video texture if available
  const compositionAspect = useMemo(() => {
    return size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  }, [size]);

  // Don't render if missing dependencies
  if (!shaderMaterial) {
    return null;
  }

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[compositionAspect * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} attach="material" />
    </mesh>
  );
});

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
registerEffect('video-warp', VideoWarpEffect);
registerEffect('video-warp-effect', VideoWarpEffect);
registerEffect('VideoWarpEffect', VideoWarpEffect);
registerEffect('visual-effects/VideoWarpEffect', VideoWarpEffect);

export default VideoWarpEffect;
