import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { registerEffect } from '../utils/effectRegistry';

interface FluxEffectProps {
  intensity?: number;
  speed?: number;
  noiseAmount?: number;
  noiseScale?: number;
  lightLeakIntensity?: number;
  lightLeakColor?: string;
  flowDirection?: number;
  pulseStrength?: number;
  videoTexture?: THREE.VideoTexture;
}

const FluxEffect: React.FC<FluxEffectProps> = ({
  intensity = 1.0,
  speed = 1.0,
  noiseAmount = 0.3,
  noiseScale = 2.0,
  lightLeakIntensity = 0.4,
  lightLeakColor = '#ff6b35',
  flowDirection = 0.0,
  pulseStrength = 0.2,
  videoTexture
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();

  console.log('🌊 FluxEffect component rendered with props:', { 
    intensity, speed, noiseAmount, noiseScale, lightLeakIntensity, lightLeakColor, flowDirection, pulseStrength 
  });

  // Create shader material for flux effect
  const shaderMaterial = useMemo(() => {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uSpeed;
      uniform float uNoiseAmount;
      uniform float uNoiseScale;
      uniform float uLightLeakIntensity;
      uniform vec3 uLightLeakColor;
      uniform float uFlowDirection;
      uniform float uPulseStrength;
      uniform float uBPM;
      uniform sampler2D uVideoTexture;
      uniform bool uHasVideo;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      
      // Noise functions
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      
      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        
        vec2 u = f * f * (3.0 - 2.0 * f);
        
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      
      float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 0.0;
        
        for (int i = 0; i < 5; i++) {
          value += amplitude * noise(st);
          st *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }
      
      // Flow field function
      vec2 flowField(vec2 uv, float time) {
        float angle = uFlowDirection + fbm(uv * uNoiseScale + time * uSpeed * 0.1) * 6.28318;
        return vec2(cos(angle), sin(angle));
      }
      
      // Light leak function
      vec3 lightLeak(vec2 uv, float time) {
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(uv, center);
        
        // Create radial light leaks
        float radial = 1.0 - smoothstep(0.0, 0.8, dist);
        
        // Add some animated streaks
        float streak1 = abs(sin((uv.x + uv.y) * 10.0 + time * uSpeed * 2.0));
        float streak2 = abs(sin((uv.x - uv.y) * 8.0 + time * uSpeed * 1.5));
        
        streak1 = pow(streak1, 3.0);
        streak2 = pow(streak2, 4.0);
        
        float leakMask = radial + streak1 * 0.3 + streak2 * 0.2;
        leakMask = clamp(leakMask, 0.0, 1.0);
        
        return uLightLeakColor * leakMask * uLightLeakIntensity;
      }
      
      void main() {
        vec2 uv = vUv;
        float time = uTime * uSpeed;
        
        // BPM-based pulse
        float bpmPulse = sin(uTime * (uBPM / 60.0) * 6.28318) * uPulseStrength;
        
        // Create flowing distortion
        vec2 flow = flowField(uv, time);
        vec2 distortedUv = uv + flow * uIntensity * 0.1 * (1.0 + bpmPulse);
        
        // Add noise-based displacement
        float noiseX = fbm(uv * uNoiseScale + time * 0.1) - 0.5;
        float noiseY = fbm(uv * uNoiseScale + vec2(100.0, 0.0) + time * 0.1) - 0.5;
        vec2 noiseOffset = vec2(noiseX, noiseY) * uNoiseAmount * uIntensity;
        
        distortedUv += noiseOffset;
        
        // Ensure UV coordinates stay in bounds
        distortedUv = fract(distortedUv);
        
        vec3 color;
        
        if (uHasVideo && uVideoTexture != null) {
          // Sample video texture with distorted coordinates
          color = texture2D(uVideoTexture, distortedUv).rgb;
          
          // Add flux effect to video
          float flux = fbm(uv * 3.0 + time * 0.2);
          flux = smoothstep(0.3, 0.7, flux);
          
          // Create flowing color shifts
          vec3 fluxColor = vec3(
            sin(time + uv.x * 3.0) * 0.5 + 0.5,
            sin(time + uv.y * 3.0 + 2.0) * 0.5 + 0.5,
            sin(time + (uv.x + uv.y) * 2.0 + 4.0) * 0.5 + 0.5
          );
          
          color = mix(color, color * fluxColor, flux * uIntensity * 0.5);
        } else {
          // Create procedural flux pattern when no video
          float pattern1 = fbm(uv * 4.0 + time * 0.3);
          float pattern2 = fbm(uv * 2.0 - time * 0.2);
          
          vec3 color1 = vec3(0.2, 0.6, 1.0); // Blue
          vec3 color2 = vec3(1.0, 0.3, 0.7); // Pink
          vec3 color3 = vec3(0.9, 0.9, 0.1); // Yellow
          
          color = mix(color1, color2, pattern1);
          color = mix(color, color3, pattern2 * 0.5);
          
          // Add flowing effect
          float flowPattern = sin(uv.x * 10.0 + time) * sin(uv.y * 10.0 + time * 1.3);
          color += flowPattern * 0.2 * uIntensity;
        }
        
        // Add light leaks
        vec3 leaks = lightLeak(uv, time);
        color += leaks;
        
        // Add overall intensity
        color *= 0.8 + uIntensity * 0.4;
        
        // Add subtle noise grain
        float grain = random(uv + time) * 0.05;
        color += grain;
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0.0 },
        uIntensity: { value: intensity },
        uSpeed: { value: speed },
        uNoiseAmount: { value: noiseAmount },
        uNoiseScale: { value: noiseScale },
        uLightLeakIntensity: { value: lightLeakIntensity },
        uLightLeakColor: { value: new THREE.Color(lightLeakColor) },
        uFlowDirection: { value: flowDirection },
        uPulseStrength: { value: pulseStrength },
        uBPM: { value: bpm },
        uVideoTexture: { value: videoTexture || null },
        uHasVideo: { value: !!videoTexture }
      },
      transparent: true,
      side: THREE.DoubleSide
    });
  }, [intensity, speed, noiseAmount, noiseScale, lightLeakIntensity, lightLeakColor, flowDirection, pulseStrength, videoTexture, bpm]);

  // Update uniforms on prop changes
  React.useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uIntensity.value = intensity;
      materialRef.current.uniforms.uSpeed.value = speed;
      materialRef.current.uniforms.uNoiseAmount.value = noiseAmount;
      materialRef.current.uniforms.uNoiseScale.value = noiseScale;
      materialRef.current.uniforms.uLightLeakIntensity.value = lightLeakIntensity;
      materialRef.current.uniforms.uLightLeakColor.value = new THREE.Color(lightLeakColor);
      materialRef.current.uniforms.uFlowDirection.value = flowDirection;
      materialRef.current.uniforms.uPulseStrength.value = pulseStrength;
      materialRef.current.uniforms.uBPM.value = bpm;
      materialRef.current.uniforms.uVideoTexture.value = videoTexture || null;
      materialRef.current.uniforms.uHasVideo.value = !!videoTexture;
    }
  }, [intensity, speed, noiseAmount, noiseScale, lightLeakIntensity, lightLeakColor, flowDirection, pulseStrength, bpm, videoTexture]);

  // Animation loop
  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[16, 9, 128, 72]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Add metadata for the effects browser
FluxEffect.metadata = {
  name: 'Flux Effect',
  description: 'Dynamic flowing effect with noise and light leaks',
  category: 'Distortion',
  icon: '🌊',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    { name: 'intensity', type: 'number', min: 0, max: 2, step: 0.1, value: 1.0 },
    { name: 'speed', type: 'number', min: 0, max: 3, step: 0.1, value: 1.0 },
    { name: 'noiseAmount', type: 'number', min: 0, max: 1, step: 0.05, value: 0.3 },
    { name: 'noiseScale', type: 'number', min: 0.5, max: 5, step: 0.1, value: 2.0 },
    { name: 'lightLeakIntensity', type: 'number', min: 0, max: 1, step: 0.05, value: 0.4 },
    { name: 'lightLeakColor', type: 'color', value: '#ff6b35' },
    { name: 'flowDirection', type: 'number', min: 0, max: 6.28, step: 0.1, value: 0.0 },
    { name: 'pulseStrength', type: 'number', min: 0, max: 1, step: 0.05, value: 0.2 }
  ]
};

// Register the effect
registerEffect('FluxEffect', FluxEffect);
console.log('✅ FluxEffect registered successfully');

export default FluxEffect;
