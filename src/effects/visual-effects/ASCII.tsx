// src/effects/visual-effects/ASCII.tsx
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface ASCIIProps {
  videoTexture?: THREE.VideoTexture;
  characters?: string;
  fontSize?: number;
  cellSize?: number;
  color?: string;
  invert?: boolean;
  opacity?: number;
  preserveColors?: boolean;
  isGlobal?: boolean; // New prop to indicate if this is a global effect
}

export const ASCII: React.FC<ASCIIProps> = ({
  videoTexture,
  characters = ` .:,'-^=*+?!|0#X%WM@`,
  fontSize = 54,
  cellSize = 28,
  color = '#ffffff',
  invert = false,
  opacity = 1,
  preserveColors = false,
  isGlobal = false
}) => {
  // Ensure at least one character to avoid invalid shader indexing when editing string to empty
  const effectiveChars = useMemo(() => {
    return typeof characters === 'string' && characters.length > 0 ? characters : ' .';
  }, [characters]);
  // Normalize various color input types to a hex string like '#rrggbb'
  const normalizeColorToHex = (input: any): string => {
    try {
      if (input == null) return '#ffffff';
      // Unwrap { value: ... }
      if (typeof input === 'object' && 'value' in input) {
        return normalizeColorToHex((input as any).value);
      }
      // THREE.Color instance
      if (typeof input === 'object' && (input as any).isColor) {
        const c = input as any;
        return `#${c.getHexString()}`;
      }
      // { r, g, b } objects (0-1 or 0-255)
      if (typeof input === 'object' &&
          typeof (input as any).r === 'number' &&
          typeof (input as any).g === 'number' &&
          typeof (input as any).b === 'number') {
        const r = (input as any).r;
        const g = (input as any).g;
        const b = (input as any).b;
        const rr = r > 1 ? Math.round(r) : Math.round(r * 255);
        const gg = g > 1 ? Math.round(g) : Math.round(g * 255);
        const bb = b > 1 ? Math.round(b) : Math.round(b * 255);
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
      }
      // numeric hex like 0xff00ff
      if (typeof input === 'number') {
        return `#${(input as number).toString(16).padStart(6, '0')}`;
      }
      if (typeof input === 'string') {
        const s = input.trim();
        if (s.startsWith('#')) return s;
        // rudimentary rgb(a) parser
        if (s.startsWith('rgb')) {
          const m = s.match(/rgba?\(([^)]+)\)/i);
          if (m) {
            const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
            const [r, g, b] = parts;
            const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          }
        }
        // fallback - let THREE.Color parse common strings
        try {
          const c = new THREE.Color(s);
          return `#${c.getHexString()}`;
        } catch {}
      }
    } catch {}
    return '#ffffff';
  };
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, scene, camera, size } = useThree();

  /** Draws the characters on a Canvas and returns a texture - EXACT CODE FROM REFERENCE */
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
    context.font = `${fontSize}px arial`;
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

  const asciiTexture = useMemo(() => {
    return createCharactersTexture(effectiveChars, fontSize);
  }, [effectiveChars, fontSize]);

  useEffect(() => {
    return () => {
      try {
        asciiTexture?.dispose?.();
      } catch {}
    };
  }, [asciiTexture]);

  // Safe default 1x1 black texture for sampler2D uniform
  const blackTexture = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Update material when asciiTexture changes (without recreating the material)
  useEffect(() => {
    if (materialRef.current) {
      // Update character count when characters change (clamped to >= 1)
      materialRef.current.uniforms.uCharactersCount.value = Math.max(1, effectiveChars.length);
    }
  }, [effectiveChars.length]); // Only update when characters string changes

  // For global effects, we need to capture the current render target
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

  // Dispose render target on unmount or when it changes
  useEffect(() => {
    return () => {
      try {
        renderTarget?.dispose?.();
      } catch {}
    };
  }, [renderTarget]);

  // Adapt the EXACT fragment shader from reference for our use
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

vec3 greyscale(vec3 color, float strength) {
    float g = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(color, vec3(g), strength);
}

vec3 greyscale(vec3 color) {
    return greyscale(color, 1.0);
}

void main() {
    vec2 uv = vUv;
    vec2 cell = resolution / uCellSize;
    vec2 grid = 1.0 / cell;
    vec2 pixelizedUV = grid * (0.5 + floor(uv / grid));
    vec4 pixelized = texture2D(inputBuffer, pixelizedUV);
    float greyscaled = greyscale(pixelized.rgb).r;

    if (uInvert) {
        greyscaled = 1.0 - greyscaled;
    }

    float characterIndex = floor((uCharactersCount - 1.0) * greyscaled);
    vec2 characterPosition = vec2(mod(characterIndex, SIZE.x), floor(characterIndex / SIZE.y));
    vec2 offset = vec2(characterPosition.x, -characterPosition.y) / SIZE;
    vec2 charUV = mod(uv * (cell / SIZE), 1.0 / SIZE) - vec2(0., 1.0 / SIZE) + offset;
    vec4 asciiCharacter = texture2D(uCharacters, charUV);
    vec3 baseColor = mix(uColor, pixelized.rgb, uPreserveColors);
    asciiCharacter.rgb = baseColor * asciiCharacter.r;
    asciiCharacter.a = pixelized.a * uOpacity;
    gl_FragColor = asciiCharacter;
}
`;

  // Create shader material using exact reference code logic
  const shaderMaterial = useMemo(() => {
    if (!asciiTexture) return null;

    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: blackTexture },
        uCharacters: { value: asciiTexture },
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
      fragmentShader: adaptedFragment,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
  }, [isGlobal]); // Only recreate when global mode changes, not when ascii texture changes

  // For global effects, capture the current scene and apply ASCII effect
  useFrame(() => {
    if (isGlobal && renderTarget && shaderMaterial) {
      // Capture current scene to render target
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

      // Update the input buffer to use the captured scene
      if (materialRef.current) {
        materialRef.current.uniforms.inputBuffer.value = renderTarget.texture;
      }
    }

    // Update uniforms on each frame
    if (materialRef.current && shaderMaterial) {
      // Only update uniforms when values actually change (prevents video restart)
      if (materialRef.current.uniforms.uCellSize.value !== cellSize) {
        materialRef.current.uniforms.uCellSize.value = cellSize;
      }
      const desiredCount = Math.max(1, effectiveChars.length);
      if (materialRef.current.uniforms.uCharactersCount.value !== desiredCount) {
        materialRef.current.uniforms.uCharactersCount.value = desiredCount;
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
      const preserveAsNumber = preserveColors ? 1 : 0;
      if (materialRef.current.uniforms.uPreserveColors && materialRef.current.uniforms.uPreserveColors.value !== preserveAsNumber) {
        materialRef.current.uniforms.uPreserveColors.value = preserveAsNumber;
      }
      
      // Update character texture only when characters or font size change
      if (materialRef.current.uniforms.uCharacters.value !== asciiTexture) {
        materialRef.current.uniforms.uCharacters.value = asciiTexture;
      }
      
      // Update video texture if available
      if (!isGlobal && videoTexture && materialRef.current.uniforms.inputBuffer.value !== videoTexture) {
        materialRef.current.uniforms.inputBuffer.value = videoTexture;
      }
      
      // Texture binding is handled in useMemo and only changes when the source changes
      // No need to constantly update inputBuffer during playback - this was causing the conflict
      
    }
  });

  // Update resolution uniform and render target size when canvas size changes
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.resolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
    }
    if (isGlobal && renderTarget) {
      renderTarget.setSize(Math.max(1, size.width), Math.max(1, size.height));
    }
  }, [size, isGlobal, renderTarget]);

  // Derive plane aspect from renderer size for responsive layout
  const compositionAspect = useMemo(() => {
    return size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  }, [size]);

  // Don't render if missing dependencies
  if (!shaderMaterial || !asciiTexture) {
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[compositionAspect * 2, 2]} />
      <primitive 
        object={shaderMaterial} 
        ref={materialRef}
        attach="material"
      />
    </mesh>
  );
};

// Register the effect with metadata - EXACT defaults from reference
(ASCII as any).metadata = {
  name: 'ASCII',
  description: 'Converts video texture to ASCII characters using GPU fragment shader - works as both layer and global effect',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  canBeGlobal: true, // NEW: This effect can be used as a global effect
  parameters: [
    { name: 'characters', type: 'string', value: ` .:,'-^=*+?!|0#X%WM@` },
    { name: 'fontSize', type: 'number', value: 54, min: 8, max: 100, step: 1 },
    { name: 'cellSize', type: 'number', value: 28, min: 4, max: 32, step: 1 },
    { name: 'color', type: 'color', value: '#ffffff' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.1 },
    { name: 'preserveColors', type: 'boolean', value: false }
  ]
};

// Register the effect (single registration)
registerEffect('ascii', ASCII);
registerEffect('ascii-video-effect', ASCII); // backward compatibility
registerEffect('visual-effects/ASCII', ASCII); // direct path-style id for discovery

export default ASCII;
