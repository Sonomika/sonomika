import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface VideoDatamoshGlitchProps {
  intensity?: number;
  frequency?: number;
  glitchType?: 'datamosh' | 'rgb_split' | 'block_shift' | 'scanlines';
  colorShift?: number;
  blockSize?: number;
  videoTexture?: THREE.VideoTexture;
}

const VideoDatamoshGlitch: React.FC<VideoDatamoshGlitchProps> = ({
  intensity = 0.3,
  frequency = 2.0,
  glitchType = 'datamosh',
  colorShift = 0.02,
  blockSize = 0.1,
  videoTexture
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();

  console.log('🎨 VideoDatamoshGlitch component rendered with props:', { intensity, frequency, glitchType, colorShift, blockSize });

  // Create shader material for datamosh glitch effect
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        intensity: { value: intensity },
        frequency: { value: frequency },
        bpm: { value: bpm },
        colorShift: { value: colorShift },
        blockSize: { value: blockSize },
        glitchType: { value: glitchType === 'datamosh' ? 0 : glitchType === 'rgb_split' ? 1 : glitchType === 'block_shift' ? 2 : 3 },
        tDiffuse: { value: videoTexture } // Video texture
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float time;
        uniform float intensity;
        uniform float frequency;
        uniform float bpm;
        uniform float blockSize;
        uniform int glitchType;
        
        void main() {
          vec2 uv = uv;
          
          // Calculate beat-synchronized glitch timing
          float beatTime = time * (bpm / 60.0);
          float glitchTime = time * frequency;
          
          // Create random glitch triggers
          float glitchTrigger = fract(sin(beatTime * 3.14159) * 43758.5453);
          float glitchActive = step(0.95, glitchTrigger);
          
          // Apply different glitch types
          if (glitchType == 0) {
            // Datamosh effect - block-based distortion
            if (glitchActive > 0.5) {
              float blockX = floor(uv.x / blockSize) * blockSize;
              float blockY = floor(uv.y / blockSize) * blockSize;
              float offsetX = sin(glitchTime * 10.0 + blockX * 100.0) * intensity * 0.1;
              float offsetY = cos(glitchTime * 8.0 + blockY * 80.0) * intensity * 0.1;
              uv.x += offsetX;
              uv.y += offsetY;
            }
          } else if (glitchType == 1) {
            // RGB split effect
            if (glitchActive > 0.5) {
              float splitOffset = sin(glitchTime * 5.0) * intensity * 0.05;
              uv.x += splitOffset;
            }
          } else if (glitchType == 2) {
            // Block shift effect
            if (glitchActive > 0.5) {
              float shiftX = sin(glitchTime * 3.0) * intensity * 0.2;
              float shiftY = cos(glitchTime * 2.0) * intensity * 0.15;
              uv.x += shiftX;
              uv.y += shiftY;
            }
          } else {
            // Scanlines effect
            float scanline = sin(uv.y * 100.0 + glitchTime * 2.0) * intensity * 0.3;
            uv.x += scanline * 0.01;
          }
          
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        uniform float frequency;
        uniform float bpm;
        uniform float colorShift;
        uniform int glitchType;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vUv;
          
          // Calculate beat-synchronized timing
          float beatTime = time * (bpm / 60.0);
          float glitchTime = time * frequency;
          
          // Create random glitch triggers
          float glitchTrigger = fract(sin(beatTime * 3.14159) * 43758.5453);
          float glitchActive = step(0.92, glitchTrigger);
          
          vec4 color = vec4(0.0);
          
          if (glitchType == 0) {
            // Datamosh effect - color channel manipulation
            if (glitchActive > 0.5) {
              // Sample with different offsets for each channel
              vec4 colorR = texture2D(tDiffuse, uv + vec2(colorShift * sin(glitchTime), 0.0));
              vec4 colorG = texture2D(tDiffuse, uv + vec2(colorShift * cos(glitchTime * 0.7), 0.0));
              vec4 colorB = texture2D(tDiffuse, uv + vec2(colorShift * sin(glitchTime * 1.3), 0.0));
              
              color = vec4(colorR.r, colorG.g, colorB.b, 1.0);
              
              // Add datamosh artifacts
              float artifact = sin(uv.x * 50.0 + glitchTime * 10.0) * intensity * 0.5;
              color.rgb += vec3(artifact, artifact * 0.5, artifact * 0.2);
            } else {
              color = texture2D(tDiffuse, uv);
            }
          } else if (glitchType == 1) {
            // RGB split effect
            if (glitchActive > 0.5) {
              float splitOffset = sin(glitchTime * 5.0) * intensity * 0.05;
              vec4 colorR = texture2D(tDiffuse, uv + vec2(splitOffset, 0.0));
              vec4 colorG = texture2D(tDiffuse, uv);
              vec4 colorB = texture2D(tDiffuse, uv - vec2(splitOffset, 0.0));
              color = vec4(colorR.r, colorG.g, colorB.b, 1.0);
            } else {
              color = texture2D(tDiffuse, uv);
            }
          } else if (glitchType == 2) {
            // Block shift effect
            if (glitchActive > 0.5) {
              float blockX = floor(uv.x * 20.0) / 20.0;
              float blockY = floor(uv.y * 15.0) / 15.0;
              float shiftX = sin(glitchTime * 3.0 + blockX * 10.0) * intensity * 0.1;
              float shiftY = cos(glitchTime * 2.0 + blockY * 8.0) * intensity * 0.08;
              color = texture2D(tDiffuse, uv + vec2(shiftX, shiftY));
            } else {
              color = texture2D(tDiffuse, uv);
            }
          } else {
            // Scanlines effect
            float scanline = sin(uv.y * 100.0 + glitchTime * 2.0) * intensity * 0.3;
            color = texture2D(tDiffuse, uv);
            color.rgb *= 1.0 - scanline;
            
            // Add scanline artifacts
            if (glitchActive > 0.5) {
              float artifact = sin(uv.x * 200.0 + glitchTime * 15.0) * intensity * 0.4;
              color.rgb += vec3(artifact, artifact * 0.3, artifact * 0.1);
            }
          }
          
          // Add overall intensity modulation
          float intensityMod = 1.0 + sin(beatTime * 3.14159 * 2.0) * intensity * 0.2;
          color.rgb *= intensityMod;
          
          gl_FragColor = color;
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
  }, [intensity, frequency, glitchType, colorShift, blockSize, bpm, videoTexture]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.bpm.value = bpm;
      
      // Update video texture if available
      if (videoTexture && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
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

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      {/* Full screen quad for video glitching */}
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(VideoDatamoshGlitch as any).metadata = {
  name: 'Video Datamosh Glitch',
  description: 'Applies datamosh-style glitch artifacts to video textures',
  category: 'Video',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  parameters: [
    {
      name: 'intensity',
      type: 'number',
      value: 0.3,
      min: 0.0,
      max: 1.0,
      step: 0.05,
      description: 'Glitch intensity'
    },
    {
      name: 'frequency',
      type: 'number',
      value: 2.0,
      min: 0.1,
      max: 10.0,
      step: 0.1,
      description: 'Glitch frequency'
    },
    {
      name: 'glitchType',
      type: 'select',
      value: 'datamosh',
      options: [
        { value: 'datamosh', label: 'Datamosh' },
        { value: 'rgb_split', label: 'RGB Split' },
        { value: 'block_shift', label: 'Block Shift' },
        { value: 'scanlines', label: 'Scanlines' }
      ],
      description: 'Type of glitch effect'
    },
    {
      name: 'colorShift',
      type: 'number',
      value: 0.02,
      min: 0.0,
      max: 0.1,
      step: 0.001,
      description: 'Color channel shift'
    },
    {
      name: 'blockSize',
      type: 'number',
      value: 0.1,
      min: 0.01,
      max: 0.5,
      step: 0.01,
      description: 'Block size for datamosh'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering video-datamosh-glitch...');
registerEffect('video-datamosh-glitch', VideoDatamoshGlitch);
registerEffect('VideoDatamoshGlitch', VideoDatamoshGlitch); // Also register with PascalCase for compatibility
console.log('✅ VideoDatamoshGlitch registered successfully');

export default VideoDatamoshGlitch;
