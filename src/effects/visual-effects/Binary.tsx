// src/effects/visual-effects/Binary.tsx
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface BinaryProps {
  videoTexture?: THREE.VideoTexture;
  characters?: string;
  fontSize?: number;
  cellSize?: number;
  color?: string;
  invert?: boolean;
  opacity?: number;
  preserveColors?: boolean;
  isGlobal?: boolean;
}

export const Binary: React.FC<BinaryProps> = ({
  videoTexture,
  characters = '01',
  fontSize = 54,
  cellSize = 24,
  color = '#00ff55',
  invert = false,
  opacity = 1,
  preserveColors = false,
  isGlobal = false
}) => {
  const effectiveChars = useMemo(() => {
    return typeof characters === 'string' && characters.length > 0 ? characters : '01';
  }, [characters]);

  const normalizeColorToHex = (input: any): string => {
    try {
      if (input == null) return '#00ff55';
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
            const toHex = (n: number) =>
              Math.max(0, Math.min(255, Math.round(n)))
                .toString(16)
                .padStart(2, '0');
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          }
        }
        try {
          const c = new THREE.Color(s);
          return `#${c.getHexString()}`;
        } catch {}
      }
    } catch {}
    return '#00ff55';
  };

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, scene, camera, size } = useThree();

  const createCharactersTexture = (characters: string, fontSize: number): THREE.Texture => {
    const canvas = document.createElement('canvas');

    const SIZE = 1024;
    const MAX_PER_ROW = 16;
    const CELL = SIZE / MAX_PER_ROW;

    canvas.width = canvas.height = SIZE;

    const texture = new THREE.CanvasTexture(
      canvas,
      undefined,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      THREE.NearestFilter,
      THREE.NearestFilter
    );

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Context not available');
    }

    context.clearRect(0, 0, SIZE, SIZE);
    context.font = `${fontSize}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#fff';

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const x = i % MAX_PER_ROW;
      const y = Math.floor(i / MAX_PER_ROW);
      context.fillText(char, x * CELL + CELL / 2, y * CELL + CELL / 2);
    }

    texture.needsUpdate = true;
    return texture;
  };

  const charsTexture = useMemo(() => {
    return createCharactersTexture(effectiveChars, fontSize);
  }, [effectiveChars, fontSize]);

  useEffect(() => {
    return () => {
      try {
        charsTexture?.dispose?.();
      } catch {}
    };
  }, [charsTexture]);

  const blackTexture = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uCharactersCount.value = Math.max(1, effectiveChars.length);
    }
  }, [effectiveChars.length]);

  const renderTarget = useMemo(() => {
    if (isGlobal) {
      const rt = new THREE.WebGLRenderTarget(
        Math.max(1, size.width),
        Math.max(1, size.height),
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
uniform sampler2D uCharacters;
uniform float uCharactersCount;
uniform float uCellSize;
uniform bool uInvert;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPreserveColors;
uniform vec2 resolution;

varying vec2 vUv;

const vec2 SIZE = vec2(16.);

vec3 greyscale(vec3 color, float strength) {
  float g = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(color, vec3(g), strength);
}

void main() {
  vec2 uv = vUv;
  vec2 cell = resolution / uCellSize;
  vec2 grid = 1.0 / cell;
  vec2 pixelizedUV = grid * (0.5 + floor(uv / grid));
  vec4 pixelized = texture2D(inputBuffer, pixelizedUV);
  float lum = greyscale(pixelized.rgb, 1.0).r;
  if (uInvert) {
    lum = 1.0 - lum;
  }
  float idx = floor((uCharactersCount - 1.0) * lum);
  vec2 pos = vec2(mod(idx, SIZE.x), floor(idx / SIZE.y));
  vec2 offset = vec2(pos.x, -pos.y) / SIZE;
  vec2 charUV = mod(uv * (cell / SIZE), 1.0 / SIZE) - vec2(0., 1.0 / SIZE) + offset;
  vec4 symbol = texture2D(uCharacters, charUV);
  vec3 baseColor = mix(uColor, pixelized.rgb, uPreserveColors);
  symbol.rgb = baseColor * symbol.r;
  symbol.a = pixelized.a * uOpacity;
  gl_FragColor = symbol;
}`;

  const shaderMaterial = useMemo(() => {
    if (!charsTexture) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: blackTexture },
        uCharacters: { value: charsTexture },
        uCellSize: { value: cellSize },
        uCharactersCount: { value: Math.max(1, effectiveChars.length) },
        uColor: { value: new THREE.Color(normalizeColorToHex(color)) },
        uInvert: { value: invert },
        uOpacity: { value: opacity },
        uPreserveColors: { value: preserveColors ? 1 : 0 },
        resolution: { value: new THREE.Vector2(Math.max(1, size.width), Math.max(1, size.height)) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
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
      if (materialRef.current.uniforms.uCellSize.value !== cellSize) {
        materialRef.current.uniforms.uCellSize.value = cellSize;
      }
      const desired = Math.max(1, effectiveChars.length);
      if (materialRef.current.uniforms.uCharactersCount.value !== desired) {
        materialRef.current.uniforms.uCharactersCount.value = desired;
      }
      const normalizedColor = normalizeColorToHex(color);
      const currentHex = materialRef.current.uniforms.uColor.value.getHexString();
      const targetHex = normalizedColor.startsWith('#') ? normalizedColor.slice(1) : normalizedColor;
      if (currentHex !== targetHex) {
        materialRef.current.uniforms.uColor.value.set(normalizedColor);
      }
      if (materialRef.current.uniforms.uInvert.value !== invert) {
        materialRef.current.uniforms.uInvert.value = invert;
      }
      if (materialRef.current.uniforms.uOpacity && materialRef.current.uniforms.uOpacity.value !== opacity) {
        materialRef.current.uniforms.uOpacity.value = opacity;
      }
      const preserve = preserveColors ? 1 : 0;
      if (materialRef.current.uniforms.uPreserveColors && materialRef.current.uniforms.uPreserveColors.value !== preserve) {
        materialRef.current.uniforms.uPreserveColors.value = preserve;
      }
      if (materialRef.current.uniforms.uCharacters.value !== charsTexture) {
        materialRef.current.uniforms.uCharacters.value = charsTexture;
      }
      if (!isGlobal && videoTexture && materialRef.current.uniforms.inputBuffer.value !== videoTexture) {
        materialRef.current.uniforms.inputBuffer.value = videoTexture;
      }
    }
  });

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.resolution.value.set(
        Math.max(1, size.width),
        Math.max(1, size.height)
      );
    }
    if (isGlobal && renderTarget) {
      renderTarget.setSize(Math.max(1, size.width), Math.max(1, size.height));
    }
  }, [size, isGlobal, renderTarget]);

  const compositionAspect = useMemo(() => {
    return size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  }, [size]);

  if (!shaderMaterial || !charsTexture) {
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[compositionAspect * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} attach="material" />
    </mesh>
  );
};

(Binary as any).metadata = {
  name: 'Binary',
  description:
    'Renders video as a matrix of binary symbols using GPU shader. Works as layer or global effect.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'characters', type: 'string', value: '01' },
    { name: 'fontSize', type: 'number', value: 54, min: 8, max: 100, step: 1 },
    { name: 'cellSize', type: 'number', value: 24, min: 4, max: 48, step: 1 },
    { name: 'color', type: 'color', value: '#00ff55' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.1 },
    { name: 'preserveColors', type: 'boolean', value: false }
  ]
};

registerEffect('binary', Binary);
registerEffect('binary-video-effect', Binary);
registerEffect('visual-effects/Binary', Binary);

export default Binary;


