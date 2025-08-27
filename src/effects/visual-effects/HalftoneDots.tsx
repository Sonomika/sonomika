// src/effects/visual-effects/HalftoneDots.tsx
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface HalftoneDotsProps {
  videoTexture?: THREE.VideoTexture;
  cellSize?: number;
  angle?: number; // degrees
  dotScale?: number; // 0..~1.5
  softness?: number; // edge softness in cell units
  shape?: number; // 0=circle .. 1=square
  color?: string;
  invert?: boolean;
  opacity?: number;
  preserveColors?: boolean;
  isGlobal?: boolean;
}

export const HalftoneDots: React.FC<HalftoneDotsProps> = ({
  videoTexture,
  cellSize = 18,
  angle = 0,
  dotScale = 1,
  softness = 0.035,
  shape = 0,
  color = '#ffffff',
  invert = false,
  opacity = 1,
  preserveColors = false,
  isGlobal = false
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, scene, camera, size } = useThree();

  const normalizeColorToHex = (input: any): string => {
    try {
      if (input == null) return '#ffffff';
      if (typeof input === 'object' && 'value' in input) {
        return normalizeColorToHex((input as any).value);
      }
      if (typeof input === 'object' && (input as any).isColor) {
        const c = input as any;
        return `#${c.getHexString()}`;
      }
      if (
        typeof input === 'object' &&
        typeof (input as any).r === 'number' &&
        typeof (input as any).g === 'number' &&
        typeof (input as any).b === 'number'
      ) {
        const r = (input as any).r;
        const g = (input as any).g;
        const b = (input as any).b;
        const rr = r > 1 ? Math.round(r) : Math.round(r * 255);
        const gg = g > 1 ? Math.round(g) : Math.round(g * 255);
        const bb = b > 1 ? Math.round(b) : Math.round(b * 255);
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
      }
      if (typeof input === 'number') {
        return `#${(input as number).toString(16).padStart(6, '0')}`;
      }
      if (typeof input === 'string') {
        const s = input.trim();
        if (s.startsWith('#')) return s;
        if (s.startsWith('rgb')) {
          const m = s.match(/rgba?\(([^)]+)\)/i);
          if (m) {
            const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
            const [r, g, b] = parts;
            const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          }
        }
        try {
          const c = new THREE.Color(s);
          return `#${c.getHexString()}`;
        } catch {}
      }
    } catch {}
    return '#ffffff';
  };

  const blackTexture = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const renderTarget = useMemo(() => {
    if (isGlobal) {
      const rt = new THREE.WebGLRenderTarget(Math.max(1, size.width), Math.max(1, size.height), {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      });
      return rt;
    }
    return null;
  }, [isGlobal, size.width, size.height]);

  useEffect(() => {
    return () => {
      try {
        renderTarget?.dispose?.();
      } catch {}
    };
  }, [renderTarget]);

  const fragmentShader = `
uniform sampler2D inputBuffer;
uniform vec2 resolution;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPreserveColors;
uniform bool uInvert;
uniform float uCellSize;
uniform float uAngle; // radians
uniform float uDotScale;
uniform float uSoftness; // in 0..~0.1 (relative to cell)
uniform float uShape; // 0 circle .. 1 square

varying vec2 vUv;

float luminance(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(){
  // Rotate UV around center
  vec2 uv = vUv - 0.5;
  float ca = cos(uAngle), sa = sin(uAngle);
  uv = mat2(ca, -sa, sa, ca) * uv + 0.5;

  // Grid setup
  vec2 cell = resolution / uCellSize; // number of cells in x/y
  vec2 grid = 1.0 / cell;            // size of one cell in UV

  // Find the current cell center (pixelized UV)
  vec2 cellIndex = floor(uv / grid);
  vec2 center = grid * (cellIndex + 0.5);

  vec4 sampleColor = texture2D(inputBuffer, center);
  float lum = luminance(sampleColor.rgb);
  if (uInvert) lum = 1.0 - lum;

  // Dot radius based on luminance
  float r = 0.5 * uDotScale * (1.0 - lum);

  // Local coordinates within cell, centered at 0
  vec2 local = (uv - center) / grid; // roughly [-0.5,0.5]

  // Shape masks with softness
  float dCircle = length(local);
  float dSquare = max(abs(local.x), abs(local.y));
  float circle = 1.0 - smoothstep(r - uSoftness, r + uSoftness, dCircle);
  float square = 1.0 - smoothstep(r - uSoftness, r + uSoftness, dSquare);
  float mask = mix(circle, square, clamp(uShape, 0.0, 1.0));

  vec3 baseColor = mix(uColor, sampleColor.rgb, uPreserveColors);
  vec3 outColor = baseColor * mask;
  gl_FragColor = vec4(outColor, sampleColor.a * uOpacity);
}
`;

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: blackTexture },
        resolution: { value: new THREE.Vector2(Math.max(1, size.width), Math.max(1, size.height)) },
        uColor: { value: new THREE.Color(normalizeColorToHex(color)) },
        uOpacity: { value: opacity },
        uPreserveColors: { value: preserveColors ? 1 : 0 },
        uInvert: { value: invert },
        uCellSize: { value: cellSize },
        uAngle: { value: (angle * Math.PI) / 180 },
        uDotScale: { value: dotScale },
        uSoftness: { value: softness },
        uShape: { value: shape }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
  }, [isGlobal]);

  useFrame(() => {
    if (isGlobal && renderTarget && shaderMaterial) {
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
      if (materialRef.current) {
        materialRef.current.uniforms.inputBuffer.value = renderTarget.texture;
      }
    }

    if (materialRef.current && shaderMaterial) {
      if (!isGlobal && videoTexture && materialRef.current.uniforms.inputBuffer.value !== videoTexture) {
        materialRef.current.uniforms.inputBuffer.value = videoTexture;
      }
      if (materialRef.current.uniforms.uCellSize.value !== cellSize) {
        materialRef.current.uniforms.uCellSize.value = cellSize;
      }
      const normColor = normalizeColorToHex(color);
      const currentHex = materialRef.current.uniforms.uColor.value.getHexString();
      const targetHex = normColor.startsWith('#') ? normColor.slice(1) : normColor;
      if (currentHex !== targetHex) {
        materialRef.current.uniforms.uColor.value.set(normColor);
      }
      if (materialRef.current.uniforms.uOpacity.value !== opacity) {
        materialRef.current.uniforms.uOpacity.value = opacity;
      }
      const preserve = preserveColors ? 1 : 0;
      if (materialRef.current.uniforms.uPreserveColors.value !== preserve) {
        materialRef.current.uniforms.uPreserveColors.value = preserve;
      }
      if (materialRef.current.uniforms.uInvert.value !== invert) {
        materialRef.current.uniforms.uInvert.value = invert;
      }
      const angleRad = (angle * Math.PI) / 180;
      if (materialRef.current.uniforms.uAngle.value !== angleRad) {
        materialRef.current.uniforms.uAngle.value = angleRad;
      }
      if (materialRef.current.uniforms.uDotScale.value !== dotScale) {
        materialRef.current.uniforms.uDotScale.value = dotScale;
      }
      if (materialRef.current.uniforms.uSoftness.value !== softness) {
        materialRef.current.uniforms.uSoftness.value = softness;
      }
      if (materialRef.current.uniforms.uShape.value !== shape) {
        materialRef.current.uniforms.uShape.value = shape;
      }
    }
  });

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.resolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
    }
    if (isGlobal && renderTarget) {
      renderTarget.setSize(Math.max(1, size.width), Math.max(1, size.height));
    }
  }, [size, isGlobal, renderTarget]);

  const compositionAspect = useMemo(() => {
    return size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  }, [size]);

  if (!shaderMaterial) {
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[compositionAspect * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} attach="material" />
    </mesh>
  );
};

(HalftoneDots as any).metadata = {
  name: 'Halftone Dots',
  description: 'Converts input to a rotated halftone dot grid; works as layer or global effect.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'cellSize', type: 'number', value: 18, min: 4, max: 64, step: 1 },
    { name: 'angle', type: 'number', value: 0, min: 0, max: 360, step: 1 },
    { name: 'dotScale', type: 'number', value: 1, min: 0.1, max: 1.5, step: 0.05 },
    { name: 'softness', type: 'number', value: 0.035, min: 0.0, max: 0.2, step: 0.005 },
    { name: 'shape', type: 'number', value: 0, min: 0, max: 1, step: 0.01 },
    { name: 'color', type: 'color', value: '#ffffff' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'preserveColors', type: 'boolean', value: false }
  ]
};

registerEffect('halftone-dots', HalftoneDots);
registerEffect('halftone', HalftoneDots);
registerEffect('visual-effects/HalftoneDots', HalftoneDots);

export default HalftoneDots;


