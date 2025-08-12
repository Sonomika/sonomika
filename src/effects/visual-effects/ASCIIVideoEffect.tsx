// src/effects/ASCIIVideoEffect.tsx
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface ASCIIVideoEffectProps {
  videoTexture?: THREE.VideoTexture;
  characters?: string;
  fontSize?: number;
  cellSize?: number;
  color?: string;
  invert?: boolean;
  opacity?: number;
}

export const ASCIIVideoEffect: React.FC<ASCIIVideoEffectProps> = ({
  videoTexture,
  characters = ` .:,'-^=*+?!|0#X%WM@`,
  fontSize = 54,
  cellSize = 28,
  color = '#ffffff',
  invert = false
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  console.log('📺 ASCIIVideoEffect rendering with videoTexture:', !!videoTexture);

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
    return createCharactersTexture(characters, fontSize);
  }, [characters, fontSize]);

  // Adapt the EXACT fragment shader from reference for our use
  const adaptedFragment = `
uniform sampler2D inputBuffer;
uniform sampler2D uCharacters;
uniform float uCharactersCount;
uniform float uCellSize;
uniform bool uInvert;
uniform vec3 uColor;
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

    asciiCharacter.rgb = uColor * asciiCharacter.r;
    asciiCharacter.a = pixelized.a;
    gl_FragColor = asciiCharacter;
}
`;

  // Create shader material using exact reference code logic
  const shaderMaterial = useMemo(() => {
    if (!videoTexture || !asciiTexture) return null;

    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: videoTexture },
        uCharacters: { value: asciiTexture },
        uCellSize: { value: cellSize },
        uCharactersCount: { value: characters.length },
        uColor: { value: new THREE.Color(color) },
        uInvert: { value: invert },
        resolution: { value: new THREE.Vector2(1920, 1080) }
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
  }, [videoTexture, asciiTexture, cellSize, characters.length, color, invert]);

  // Update uniforms on each frame
  useFrame(() => {
    if (materialRef.current && shaderMaterial) {
      materialRef.current.uniforms.uCellSize.value = cellSize;
      materialRef.current.uniforms.uCharactersCount.value = characters.length;
      materialRef.current.uniforms.uColor.value.set(color);
      materialRef.current.uniforms.uInvert.value = invert;
      
      // Update video texture if available
      if (videoTexture && materialRef.current.uniforms.inputBuffer.value !== videoTexture) {
        materialRef.current.uniforms.inputBuffer.value = videoTexture;
      }
      
      // Update ASCII texture if changed
      if (asciiTexture && materialRef.current.uniforms.uCharacters.value !== asciiTexture) {
        materialRef.current.uniforms.uCharacters.value = asciiTexture;
      }
    }
  });

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

  // Don't render if missing dependencies
  if (!videoTexture || !shaderMaterial || !asciiTexture) {
    console.log('🚫 Missing dependencies for ASCIIVideoEffect:', {
      videoTexture: !!videoTexture,
      shaderMaterial: !!shaderMaterial,
      asciiTexture: !!asciiTexture
    });
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive 
        object={shaderMaterial} 
        ref={materialRef}
        attach="material"
      />
    </mesh>
  );
};

// Register the effect with metadata - EXACT defaults from reference
(ASCIIVideoEffect as any).metadata = {
  name: 'ASCII Video',
  description: 'Converts video texture to ASCII characters using GPU fragment shader - exact reference implementation',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  parameters: [
    { name: 'characters', type: 'string', value: ` .:,'-^=*+?!|0#X%WM@` },
    { name: 'fontSize', type: 'number', value: 54, min: 8, max: 100, step: 1 },
    { name: 'cellSize', type: 'number', value: 28, min: 4, max: 32, step: 1 },
    { name: 'color', type: 'color', value: '#ffffff' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.1 }
  ]
};

// Register the effect (single registration)
registerEffect('ascii-video-effect', ASCIIVideoEffect);

export default ASCIIVideoEffect;
