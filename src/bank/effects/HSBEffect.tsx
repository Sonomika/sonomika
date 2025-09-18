import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { registerEffect } from '../../utils/effectRegistry';
import { useStore } from '../../store/store';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface HSBEffectProps {
  hue?: number;          // degrees (-180..180)
  saturation?: number;   // multiplier (0..2)
  brightness?: number;   // multiplier (0..2)
  videoTexture?: THREE.VideoTexture;
  isGlobal?: boolean;
  compositionWidth?: number;
  compositionHeight?: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const HSBEffect: React.FC<HSBEffectProps> = ({
  hue = 0.0,
  saturation = 1.0,
  brightness = 1.0,
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
  const { gl, scene, camera, size } = useThree();

  // ============================================================================
  // RENDER TARGET SETUP (FOR GLOBAL EFFECTS)
  // ============================================================================
  
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

  // ============================================================================
  // CLEANUP & DISPOSAL
  // ============================================================================
  
  useEffect(() => {
    return () => {
      try {
        renderTarget?.dispose?.();
      } catch {}
    };
  }, [renderTarget]);

  // ============================================================================
  // SHADER CODE
  // ============================================================================
  
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform sampler2D tDiffuse;
    uniform float uHue;         // radians
    uniform float uSaturation;  // multiplier
    uniform float uBrightness;  // multiplier
    varying vec2 vUv;

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      float h = abs(q.z + (q.w - q.y) / (6.0 * d + e));
      float s = d / (q.x + e);
      float v = q.x;
      return vec3(h, s, v);
    }

    vec3 hsv2rgb(vec3 c) {
      vec3 p = abs(fract(c.xxx + vec3(0.0, 1.0/3.0, 2.0/3.0)) * 6.0 - 3.0);
      vec3 rgb = c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
      return rgb;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 hsv = rgb2hsv(color.rgb);

      // Rotate hue; hsv.x in [0,1]
      float hueShift = uHue / (6.28318530718); // radians to turns
      hsv.x = fract(hsv.x + hueShift);

      // Adjust saturation and brightness (value)
      hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0);
      hsv.z = clamp(hsv.z * uBrightness, 0.0, 1.0);

      vec3 rgb = hsv2rgb(hsv);
      gl_FragColor = vec4(rgb, color.a);
    }
  `;

  // ============================================================================
  // SHADER MATERIAL CREATION
  // ============================================================================
  
  const shaderMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        uHue: { value: (hue * Math.PI) / 180.0 },
        uSaturation: { value: saturation },
        uBrightness: { value: brightness }
      },
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    return mat;
  }, [videoTexture, hue, saturation, brightness]);

  // ============================================================================
  // ASPECT RATIO CALCULATION
  // ============================================================================
  
  const aspectRatio = useMemo(() => {
    if (videoTexture && (videoTexture as any).image && !isGlobal) {
      try {
        const { width, height } = (videoTexture as any).image;
        if (width && height && width > 0 && height > 0) {
          return width / height;
        }
      } catch {
        // no-op
      }
    }
    return size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  }, [videoTexture, isGlobal, size]);

  // ============================================================================
  // MATERIAL UPDATES
  // ============================================================================
  
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uHue.value = (clamp(hue, -180, 180) * Math.PI) / 180.0;
      materialRef.current.uniforms.uSaturation.value = clamp(saturation, 0.0, 2.0);
      materialRef.current.uniforms.uBrightness.value = clamp(brightness, 0.0, 2.0);
    }
  }, [hue, saturation, brightness]);

  // ============================================================================
  // RENDER LOOP & UNIFORM UPDATES
  // ============================================================================
  
  useFrame(() => {
    if (materialRef.current && shaderMaterial) {
      // Global capture path - only when needed
      if (isGlobal && renderTarget) {
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
        
        // Only update texture if it changed
        if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
          materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
        }
      } else if (!isGlobal && videoTexture) {
        // Only update texture if it changed
        if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
          materialRef.current.uniforms.tDiffuse.value = videoTexture;
        }
      }
    }
  });

  // ============================================================================
  // RENDER
  // ============================================================================
  
  if (!shaderMaterial) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// ============================================================================
// EFFECT METADATA & REGISTRATION
// ============================================================================
(HSBEffect as any).metadata = {
  name: 'HSB Color Adjust',
  description: 'Adjusts Hue, Saturation, and Brightness of the input texture. Works as both layer and global effect.',
  category: 'Color',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    {
      name: 'hue',
      type: 'number',
      min: -180,
      max: 180,
      step: 1,
      value: 0,
      description: 'Hue shift (degrees)'
    },
    {
      name: 'saturation',
      type: 'number',
      min: 0.0,
      max: 2.0,
      step: 0.01,
      value: 1.0,
      description: 'Saturation multiplier'
    },
    {
      name: 'brightness',
      type: 'number',
      min: 0.0,
      max: 2.0,
      step: 0.01,
      value: 1.0,
      description: 'Brightness multiplier'
    }
  ]
};

// Register with multiple ID variations to ensure the UI can find it
registerEffect('HSBEffect', HSBEffect);
registerEffect('hsb-effect', HSBEffect);
registerEffect('hsb', HSBEffect);

export default HSBEffect;
