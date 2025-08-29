import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { registerEffect } from '../../utils/effectRegistry';

interface HSBEffectProps {
  hue?: number;          // degrees (-180..180)
  saturation?: number;   // multiplier (0..2)
  brightness?: number;   // multiplier (0..2)
  videoTexture?: THREE.VideoTexture;
  isGlobal?: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const HSBEffect: React.FC<HSBEffectProps> = ({
  hue = 0.0,
  saturation = 1.0,
  brightness = 1.0,
  videoTexture,
  isGlobal = false
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, scene, camera } = useThree();

  // Render target for global mode
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

  // Shader material
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

    // HSB adjust: convert to HSV, rotate hue, scale saturation and value, convert back to RGB
    const fragmentShader = `
      precision mediump float;
      precision mediump int;
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
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

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uHue: { value: (hue * Math.PI) / 180.0 },
        uSaturation: { value: saturation },
        uBrightness: { value: brightness }
      },
      transparent: true
    });
    return mat;
  }, [videoTexture, hue, saturation, brightness]);

  // Aspect ratio based on source texture if available
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
    return 16 / 9;
  }, [videoTexture, isGlobal]);

  // Prop updates
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uHue.value = (clamp(hue, -180, 180) * Math.PI) / 180.0;
      materialRef.current.uniforms.uSaturation.value = clamp(saturation, 0.0, 2.0);
      materialRef.current.uniforms.uBrightness.value = clamp(brightness, 0.0, 2.0);
    }
  }, [hue, saturation, brightness]);

  // Frame updates
  useFrame((state) => {
    if (materialRef.current) {
      // Resolution
      const w = state.gl.domElement.width;
      const h = state.gl.domElement.height;
      materialRef.current.uniforms.uResolution.value.set(w, h);

      // Global capture path
      if (isGlobal && renderTarget) {
        const current = gl.getRenderTarget();
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
        gl.setRenderTarget(current);
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      } else if (!isGlobal) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture || null;
      }
    }
  });

  if (!shaderMaterial) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata and registration
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
