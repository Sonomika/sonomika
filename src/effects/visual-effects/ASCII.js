// src/effects/visual-effects/ASCII.js
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { useOptimizedUniforms } from '../../hooks/useOptimizedUniforms';
import { registerEffect } from '../../utils/effectRegistry';

// MAIN COMPONENT
export const ASCII = React.memo(function ASCII({
  videoTexture,
  characters = ` .:,'-^=*+?!|0#X%WM@`,
  fontSize = 72,
  cellSize = 36,
  color = '#ffffff',
  invert = false,
  opacity = 1,
  preserveColors = false,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  const DEBUG_ASCII = true;
  if (DEBUG_ASCII) {
    try { console.log('[ASCII] mount props', { characters, fontSize, cellSize, color, invert, opacity, preserveColors, isGlobal, compositionWidth, compositionHeight }); } catch {}
  }
  // COMPOSITION SETTINGS & DIMENSIONS
  const compositionSettings = useStore((state) => state.compositionSettings);
  const effectiveCompositionWidth = compositionWidth || (compositionSettings && compositionSettings.width) || 1920;
  const effectiveCompositionHeight = compositionHeight || (compositionSettings && compositionSettings.height) || 1080;

  // UTILS
  const normalizeColorToHex = (input) => {
    try {
      if (input == null) return '#ffffff';
      if (typeof input === 'object' && 'value' in input) return normalizeColorToHex(input.value);
      if (typeof input === 'object' && input && input.isColor) {
        const c = input;
        return `#${c.getHexString()}`;
      }
      if (
        typeof input === 'object' &&
        input && typeof input.r === 'number' && typeof input.g === 'number' && typeof input.b === 'number'
      ) {
        const r = input.r;
        const g = input.g;
        const b = input.b;
        const rr = r > 1 ? Math.round(r) : Math.round(r * 255);
        const gg = g > 1 ? Math.round(g) : Math.round(g * 255);
        const bb = b > 1 ? Math.round(b) : Math.round(b * 255);
        const toHex = (n) => n.toString(16).padStart(2, '0');
        return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
      }
      if (typeof input === 'number') return `#${input.toString(16).padStart(6, '0')}`;
      if (typeof input === 'string') {
        const s = input.trim();
        if (s.startsWith('#')) return s;
        if (s.startsWith('rgb')) {
          const m = s.match(/rgba?\(([^)]+)\)/i);
          if (m) {
            const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
            const [r, g, b] = parts;
            const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
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

  // CHARACTER PROCESSING
  const effectiveChars = useMemo(() => (typeof characters === 'string' && characters.length > 0 ? characters : ' .'), [characters]);
  const nFontSize = useMemo(() => {
    const v = Number(fontSize);
    return Math.max(8, isFinite(v) ? v : 72);
  }, [fontSize]);
  const nCellSize = useMemo(() => {
    const v = Number(cellSize);
    return Math.max(1, isFinite(v) ? v : 36);
  }, [cellSize]);
  const nOpacity = useMemo(() => {
    const v = Number(opacity);
    if (!isFinite(v)) return 1;
    return Math.max(0, Math.min(1, v));
  }, [opacity]);
  const normalizedColor = useMemo(() => normalizeColorToHex(color), [color]);

  // THREE SETUP
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const { gl, scene, camera, size } = useThree();
  const { updateUniforms } = useOptimizedUniforms();
  const warnedRef = useRef({ noInput: false, noAsciiTex: false, noMaterial: false });

  // TEXTURE CREATION
  const createCharactersTexture = (chars, fs) => {
    const canvas = document.createElement('canvas');
    const SIZE = 1024;
    const MAX_PER_ROW = 16;
    const CELL = SIZE / MAX_PER_ROW;
    canvas.width = canvas.height = SIZE;
    const texture = new THREE.CanvasTexture(canvas, undefined, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestFilter);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Context not available');
    context.clearRect(0, 0, SIZE, SIZE);
    context.font = `${fs}px Inter, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#fff';
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const x = i % MAX_PER_ROW;
      const y = Math.floor(i / MAX_PER_ROW);
      context.fillText(char, x * CELL + CELL / 2, y * CELL + CELL / 2);
    }
    texture.needsUpdate = true;
    return texture;
  };

  const asciiTexture = useMemo(() => createCharactersTexture(effectiveChars, nFontSize), [effectiveChars, nFontSize]);
  if (DEBUG_ASCII) {
    try { console.log('[ASCII] asciiTexture created', { charCount: effectiveChars.length, nFontSize }); } catch {}
  }
  const blackTexture = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => () => { try { asciiTexture && asciiTexture.dispose && asciiTexture.dispose(); } catch {} }, [asciiTexture]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uCharactersCount.value = Math.max(1, effectiveChars.length);
    }
  }, [effectiveChars.length]);

  // Render target for global path
  const renderTarget = useMemo(() => {
    if (isGlobal) {
      return new THREE.WebGLRenderTarget(
        Math.max(1, effectiveCompositionWidth),
        Math.max(1, effectiveCompositionHeight),
        { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
      );
    }
    return null;
  }, [isGlobal, effectiveCompositionWidth, effectiveCompositionHeight]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  // Shader code
  const adaptedFragment = `
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
vec3 greyscale(vec3 color, float strength) { float g = dot(color, vec3(0.299, 0.587, 0.114)); return mix(color, vec3(g), strength); }
vec3 greyscale(vec3 color) { return greyscale(color, 1.0); }
void main() {
  vec2 uv = vUv;
  vec2 cell = resolution / uCellSize;
  vec2 grid = 1.0 / cell;
  vec2 pixelizedUV = grid * (0.5 + floor(uv / grid));
  vec4 pixelized = texture2D(inputBuffer, pixelizedUV);
  float greyscaled = greyscale(pixelized.rgb).r;
  if (uInvert) { greyscaled = 1.0 - greyscaled; }
  float characterIndex = floor((uCharactersCount - 1.0) * greyscaled);
  vec2 characterPosition = vec2(mod(characterIndex, SIZE.x), floor(characterIndex / SIZE.y));
  vec2 offset = vec2(characterPosition.x, -characterPosition.y) / SIZE;
  vec2 charUV = mod(uv * (cell / SIZE), 1.0 / SIZE) - vec2(0., 1.0 / SIZE) + offset;
  vec4 asciiCharacter = texture2D(uCharacters, charUV);
  vec3 baseColor = mix(uColor, pixelized.rgb, uPreserveColors);
  asciiCharacter.rgb = baseColor * asciiCharacter.r;
  asciiCharacter.a = pixelized.a * uOpacity;
  gl_FragColor = asciiCharacter;
}`;

  const shaderMaterial = useMemo(() => {
    if (!asciiTexture) return null;
    if (DEBUG_ASCII) { try { console.log('[ASCII] creating ShaderMaterial', { nCellSize, normalizedColor, invert, nOpacity, preserveColors, effectiveCompositionWidth, effectiveCompositionHeight }); } catch {} }
    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: blackTexture },
        uCharacters: { value: asciiTexture },
        uCellSize: { value: nCellSize },
        uCharactersCount: { value: Math.max(1, effectiveChars.length) },
        uColor: { value: new THREE.Color(normalizedColor) },
        uInvert: { value: invert },
        uOpacity: { value: nOpacity },
        uPreserveColors: { value: preserveColors ? 1 : 0 },
        resolution: { value: new THREE.Vector2(Math.max(1, effectiveCompositionWidth), Math.max(1, effectiveCompositionHeight)) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: adaptedFragment,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
  }, [asciiTexture, nCellSize, effectiveChars.length, normalizedColor, invert, nOpacity, preserveColors, effectiveCompositionWidth, effectiveCompositionHeight]);

  // Keep ref in sync with material instance
  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  // Attach/detach material to mesh imperatively (avoids attach issues)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !shaderMaterial) return;
    if (DEBUG_ASCII) { try { console.log('[ASCII] attaching material to mesh'); } catch {} }
    const prev = mesh.material;
    mesh.material = shaderMaterial;
    return () => {
      try { if (mesh.material === shaderMaterial) { /* leave disposal to lifecycle */ } } catch {}
      // do not dispose here; handled by memo lifecycle/disposal elsewhere
    };
  }, [shaderMaterial]);

  // React to parameter changes explicitly (in addition to per-frame updates)
  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    if (m.uniforms.uCellSize.value !== nCellSize) m.uniforms.uCellSize.value = nCellSize;
    m.uniforms.uCharactersCount.value = Math.max(1, effectiveChars.length);
    m.uniforms.uInvert.value = !!invert;
    m.uniforms.uOpacity.value = nOpacity;
    m.uniforms.uPreserveColors.value = preserveColors ? 1 : 0;
  }, [nCellSize, effectiveChars.length, invert, nOpacity, preserveColors]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    m.uniforms.uColor.value.set(normalizedColor);
  }, [normalizedColor]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    if (m.uniforms.uCharacters.value !== asciiTexture) m.uniforms.uCharacters.value = asciiTexture;
  }, [asciiTexture]);

  // Render loop
  useFrame(() => {
    if (materialRef.current && shaderMaterial) {
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
        if (materialRef.current.uniforms.inputBuffer.value !== renderTarget.texture) {
          materialRef.current.uniforms.inputBuffer.value = renderTarget.texture;
        }
      } else if (!isGlobal && videoTexture) {
        if (materialRef.current.uniforms.inputBuffer.value !== videoTexture) {
          materialRef.current.uniforms.inputBuffer.value = videoTexture;
        }
      }

      updateUniforms(materialRef.current, {
        uCellSize: nCellSize,
        uCharactersCount: Math.max(1, effectiveChars.length),
        uInvert: invert,
        uOpacity: nOpacity,
        uPreserveColors: preserveColors ? 1 : 0,
      });

      const currentHex = materialRef.current.uniforms.uColor.value.getHexString();
      const targetHex = normalizedColor.startsWith('#') ? normalizedColor.slice(1) : normalizedColor;
      if (currentHex !== targetHex) {
        materialRef.current.uniforms.uColor.value.set(normalizedColor);
      }

      if (materialRef.current.uniforms.uCharacters.value !== asciiTexture) {
        materialRef.current.uniforms.uCharacters.value = asciiTexture;
      }
    } else {
      if (!asciiTexture && !warnedRef.current.noAsciiTex) {
        warnedRef.current.noAsciiTex = true;
        try { console.warn('[ASCII] asciiTexture not ready'); } catch {}
      }
      if (!shaderMaterial && !warnedRef.current.noMaterial) {
        warnedRef.current.noMaterial = true;
        try { console.warn('[ASCII] shaderMaterial not created'); } catch {}
      }
    }
    if (!isGlobal && !videoTexture && !warnedRef.current.noInput) {
      warnedRef.current.noInput = true;
      try { console.warn('[ASCII] No input videoTexture for effect mode (place ASCII above a source, or set isGlobal=true)'); } catch {}
    }
  });

  // Resolution updates
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.resolution.value.set(
        Math.max(1, effectiveCompositionWidth),
        Math.max(1, effectiveCompositionHeight)
      );
    }
    if (isGlobal && renderTarget) {
      renderTarget.setSize(Math.max(1, effectiveCompositionWidth), Math.max(1, effectiveCompositionHeight));
    }
  }, [effectiveCompositionWidth, effectiveCompositionHeight, isGlobal, renderTarget]);

  // Aspect
  const compositionAspect = useMemo(() => (size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9), [size]);

  if (!shaderMaterial || !asciiTexture) return null;
  if (DEBUG_ASCII) { try { console.log('[ASCII] rendering mesh', { aspect: compositionAspect * 2, hasMaterial: !!shaderMaterial }); } catch {} }

  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [compositionAspect * 2, 2] })
  );
});

export const metadata = {
  name: 'ASCII',
  description: 'Converts video texture to ASCII characters using GPU fragment shader - works as both layer and global effect',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'characters', type: 'string', value: ` .:,'-^=*+?!|0#X%WM@` },
    { name: 'fontSize', type: 'number', value: 72, min: 8, max: 120, step: 1 },
    { name: 'cellSize', type: 'number', value: 36, min: 4, max: 48, step: 1 },
    { name: 'color', type: 'color', value: '#ffffff' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'preserveColors', type: 'boolean', value: false },
  ],
};

export default ASCII;

// Self-register so EffectChain can resolve it synchronously
try {
  ASCII.metadata = metadata;
  registerEffect('ASCII', ASCII);
  // console.log('✅ ASCII (JS) registered');
} catch {}


