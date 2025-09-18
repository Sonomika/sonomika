import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface ChromaticAberrationEffectProps {
  intensity?: number;
  speed?: number;
  dispScale?: number;
  samples?: number;
  contrast?: number;
  videoTexture?: THREE.VideoTexture;
}

const ChromaticAberrationEffect: React.FC<ChromaticAberrationEffectProps> = ({
  intensity = 1.0,
  speed = 1.0,
  dispScale = 2.0,
  samples = 64,
  contrast = 12.0,
  videoTexture
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();

  console.log('🎨 ChromaticAberrationEffect component rendered with props:', { intensity, speed, dispScale, samples, contrast });

  // Create shader material for chromatic aberration effect
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0.0 },
        iResolution: { value: new THREE.Vector3(1, 1, 1) },
        intensity: { value: intensity },
        speed: { value: speed },
        dispScale: { value: dispScale },
        samples: { value: samples },
        contrast: { value: contrast },
        bpm: { value: bpm },
        iChannel0: { value: videoTexture }, // Displacement texture
        iChannel1: { value: videoTexture }  // Color texture
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float iTime;
        uniform vec3 iResolution;
        uniform float intensity;
        uniform float speed;
        uniform float dispScale;
        uniform float samples;
        uniform float contrast;
        uniform float bpm;
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        varying vec2 vUv;
        
        // displacement amount
        #define DISP_SCALE dispScale
        
        // chromatic dispersion samples
        #define SAMPLES samples
        
        // contrast
        #define SIGMOID_CONTRAST contrast
        
        // channels to use for displacement, either xy or zw
        #define CH xy
        
        vec3 contrast(vec3 x) {
          return 1.0 / (1.0 + exp(-SIGMOID_CONTRAST * (x - 0.5)));    
        }
        
        vec2 normz(vec2 x) {
          return x == vec2(0) ? vec2(0) : normalize(x);
        }
        
        /*
          This function supplies a weight vector for each color channel.
          It's analogous to (but not a physically accurate model of)
          the response curves for each of the 3 cone types in the human eye.
          The three functions for red, green, and blue have the same integral
          over [0, 1], which is 1/3.
          Here are some other potential terms for the green weight that 
          integrate to 1/3:
              2.0*(1-x)*x
              10.0*((1-x)*x)^2
              46.667*((1-i)*i)^3
              210.0*((1-x)*x)^4
              924.0*((1-x)*x)^5
          By the way, this series of coefficients is OEIS A004731 divided by 3,
          which is a pretty interesting series: https://oeis.org/A002457
        */
        vec3 sampleWeights(float i) {
          return vec3(i * i, 46.6666*pow((1.0-i)*i,3.0), (1.0 - i) * (1.0 - i));
        }
        
        vec3 sampleDisp(vec2 uv, vec2 dispNorm, float disp) {
            vec3 col = vec3(0);
            const float SD = 1.0 / float(SAMPLES);
            float wl = 0.0;
            vec3 denom = vec3(0);
            for(int i = 0; i < SAMPLES; i++) {
                vec3 sw = sampleWeights(wl);
                denom += sw;
                col += sw * texture(iChannel1, uv + dispNorm * disp * wl).xyz;
                wl  += SD;
            }
            
            // For a large enough number of samples,
            // the return below is equivalent to 3.0 * col * SD;
            return col / denom;
        }
        
        void mainImage(out vec4 fragColor, in vec2 fragCoord) {
            vec2 texel = 1. / iResolution.xy;
            vec2 uv = fragCoord.xy / iResolution.xy;
        
            vec2 n  = vec2(0.0, texel.y);
            vec2 e  = vec2(texel.x, 0.0);
            vec2 s  = vec2(0.0, -texel.y);
            vec2 w  = vec2(-texel.x, 0.0);
        
            vec2 d   = texture(iChannel0, uv).CH;
            vec2 d_n = texture(iChannel0, fract(uv+n)).CH;
            vec2 d_e = texture(iChannel0, fract(uv+e)).CH;
            vec2 d_s = texture(iChannel0, fract(uv+s)).CH;
            vec2 d_w = texture(iChannel0, fract(uv+w)).CH; 
        
            // antialias our vector field by blurring
            vec2 db = 0.4 * d + 0.15 * (d_n+d_e+d_s+d_w);
        
            float ld = length(db);
            vec2 ln = normz(db);
        
          vec3 col = sampleDisp(uv, ln, DISP_SCALE * ld);
          
          fragColor = vec4(contrast(col), 1.0);
        }
        
        void main() {
          mainImage(gl_FragColor, gl_FragCoord.xy);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
  }, [intensity, speed, dispScale, samples, contrast, bpm, videoTexture]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.iTime.value = state.clock.elapsedTime * speed;
      materialRef.current.uniforms.bpm.value = bpm;
      
      // Update resolution
      if (state.gl.domElement) {
        materialRef.current.uniforms.iResolution.value.set(
          state.gl.domElement.width,
          state.gl.domElement.height,
          1
        );
      }
      
      // Texture binding is handled in useMemo and only changes when the source changes
      // No need to constantly update iChannel0/iChannel1 during playback - this was causing the conflict
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
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(ChromaticAberrationEffect as any).metadata = {
  name: 'Chromatic Aberration',
  description: 'A chromatic aberration effect with displacement mapping',
  category: 'Video',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  parameters: [
    {
      name: 'intensity',
      type: 'number',
      value: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.1,
      description: 'Effect intensity'
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
      name: 'dispScale',
      type: 'number',
      value: 2.0,
      min: 0.1,
      max: 10.0,
      step: 0.1,
      description: 'Displacement scale'
    },
    {
      name: 'samples',
      type: 'number',
      value: 64,
      min: 8,
      max: 128,
      step: 8,
      description: 'Chromatic dispersion samples'
    },
    {
      name: 'contrast',
      type: 'number',
      value: 12.0,
      min: 1.0,
      max: 20.0,
      step: 0.5,
      description: 'Sigmoid contrast'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering ChromaticAberrationEffect...');
registerEffect('ChromaticAberrationEffect', ChromaticAberrationEffect);
console.log('✅ ChromaticAberrationEffect registered successfully');

export default ChromaticAberrationEffect;
