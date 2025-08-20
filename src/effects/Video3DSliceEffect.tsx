import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../utils/effectRegistry';

interface Video3DSliceEffectProps {
  videoTexture?: THREE.VideoTexture;
  opacity?: number;
  sliceCount?: number;
  separationDistance?: number;
  rotationIntensity?: number;
  depthSpread?: number;
  animationSpeed?: number;
  chaosLevel?: number;
}

export const Video3DSliceEffect: React.FC<Video3DSliceEffectProps> = ({
  videoTexture,
  opacity = 1,
  sliceCount = 10,
  separationDistance = 0.5,
  rotationIntensity = 1,
  depthSpread = 2,
  animationSpeed = 1,
  chaosLevel = 0.5
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const [sliceDirection, setSliceDirection] = useState<'horizontal' | 'vertical'>('horizontal');

  console.log('🎨 Video3DSliceEffect rendering with videoTexture:', !!videoTexture);

  // Create 3D slices of the video
  const slices = useMemo(() => {
    if (!videoTexture) return [];

    const sliceArray: {
      geometry: THREE.PlaneGeometry;
      material: THREE.ShaderMaterial;
      position: [number, number, number];
      rotation: [number, number, number];
      sliceIndex: number;
      randomSeed: number;
    }[] = [];

    const sliceHeight = 2 / sliceCount; // Height of each slice
    const startY = 1 - sliceHeight / 2; // Start from top

    for (let i = 0; i < sliceCount; i++) {
      // Make slices slightly taller to ensure complete coverage with overlap
      const sliceHeight = 2.1 / sliceCount; // Slightly larger to prevent gaps
      const geometry = new THREE.PlaneGeometry(2.1, sliceHeight); // Slightly wider too
      
      // Calculate UV coordinates for this slice
      const uvOffsetY = i / sliceCount;
      const uvScale = 1 / sliceCount;

      // Update UV coordinates to sample correct portion of video
      const uvAttribute = geometry.attributes.uv as THREE.BufferAttribute;
      const uvArray = uvAttribute.array as Float32Array;
      
      for (let j = 0; j < uvArray.length; j += 2) {
        // Keep X coordinates (horizontal) unchanged
        // Adjust Y coordinates (vertical) for this slice
        uvArray[j + 1] = uvOffsetY + uvArray[j + 1] * uvScale;
      }
      uvAttribute.needsUpdate = true;

      // Create shader material for each slice
      const material = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: videoTexture },
          uTime: { value: 0 },
          uSliceIndex: { value: i },
          uSliceCount: { value: sliceCount },
          uSeparationDistance: { value: separationDistance },
          uRotationIntensity: { value: rotationIntensity },
          uDepthSpread: { value: depthSpread },
          uAnimationSpeed: { value: animationSpeed },
          uChaosLevel: { value: chaosLevel },
          uOpacity: { value: opacity },
          uRandomSeed: { value: Math.random() * 1000 }
        },
        vertexShader: `
          uniform float uTime;
          uniform float uSliceIndex;
          uniform float uSliceCount;
          uniform float uSeparationDistance;
          uniform float uRotationIntensity;
          uniform float uDepthSpread;
          uniform float uAnimationSpeed;
          uniform float uChaosLevel;
          uniform float uRandomSeed;
          
          varying vec2 vUv;
          
          // Noise function
          float noise(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
          }
          
          void main() {
            vUv = uv;
            
            vec3 pos = position;
            float animTime = uTime * uAnimationSpeed;
            
            // Individual slice behavior based on index
            float sliceProgress = uSliceIndex / uSliceCount;
            float sliceNoise = noise(vec2(uSliceIndex * 123.456, uRandomSeed));
            
            // Horizontal separation - push slices apart
            float separationOffset = (sliceProgress - 0.5) * uSeparationDistance * 2.0;
            pos.x += separationOffset;
            
            // Add chaotic horizontal displacement
            float chaosX = sin(animTime * 3.0 + uSliceIndex * 0.5 + uRandomSeed) * uChaosLevel * 0.5;
            pos.x += chaosX * sliceNoise;
            
            // Depth displacement - create 3D effect
            float depthOffset = sin(animTime * 2.0 + uSliceIndex * 0.3) * uDepthSpread * sliceNoise;
            pos.z += depthOffset;
            
            // Additional chaos in Z direction
            float chaosZ = cos(animTime * 4.0 + uSliceIndex * 0.7 + uRandomSeed) * uChaosLevel;
            pos.z += chaosZ;
            
            // Vertical displacement for extra chaos
            float chaosY = sin(animTime * 5.0 + uSliceIndex * 0.9) * uChaosLevel * 0.3;
            pos.y += chaosY * sliceNoise;
            
            // Store modified position for rotation in main transformation
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uTime;
          uniform float uSliceIndex;
          uniform float uSliceCount;
          uniform float uOpacity;
          uniform float uChaosLevel;
          uniform float uRandomSeed;
          
          varying vec2 vUv;
          
          // Noise function
          float noise(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
          }
          
          void main() {
            vec2 uv = vUv;
            
            // Sample the video texture
            vec4 color = texture2D(tDiffuse, uv);
            
            // Ensure full opacity to completely hide video underneath
            if (color.a < 0.1) {
              color.a = 1.0; // Force alpha to ensure coverage
            }
            
            // Add some per-slice effects
            float sliceNoise = noise(vec2(uSliceIndex * 234.567, uRandomSeed));
            
            // Slight color variation per slice
            if (uChaosLevel > 0.3) {
              float colorShift = sin(uTime * 10.0 + uSliceIndex) * uChaosLevel * 0.1;
              color.r += colorShift * sliceNoise;
              color.g -= colorShift * 0.5;
              color.b += colorShift * sliceNoise * 0.7;
            }
            
            // Random slice flickering
            if (sliceNoise > 0.9 && uChaosLevel > 0.5) {
              float flicker = sin(uTime * 50.0 + uSliceIndex * 10.0);
              color.rgb *= 0.5 + 0.5 * flicker;
            }
            
            // Ensure slices completely cover the original video
            gl_FragColor = vec4(color.rgb, max(color.a * uOpacity, 0.95));
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      });

      sliceArray.push({
        geometry,
        material,
        position: [
          0, // Will be positioned by shader
          startY - i * sliceHeight, // Y position for each slice
          0  // Will be displaced by shader
        ],
        rotation: [
          (Math.random() - 0.5) * rotationIntensity,
          (Math.random() - 0.5) * rotationIntensity,
          (Math.random() - 0.5) * rotationIntensity
        ],
        sliceIndex: i,
        randomSeed: Math.random() * 1000
      });
    }

    return sliceArray;
  }, [videoTexture, sliceCount, separationDistance, rotationIntensity, depthSpread, animationSpeed, chaosLevel, opacity]);

  // Animation loop for 3D slice movement
  useFrame((state, delta) => {
    timeRef.current += delta;
    
    if (groupRef.current) {
      // Rotate entire group for additional motion
      groupRef.current.rotation.y += delta * animationSpeed * 0.1;
      
      // Update each slice
      groupRef.current.children.forEach((child, index) => {
        const mesh = child as THREE.Mesh;
        const slice = slices[index];
        
        if (mesh && slice) {
          // Individual slice rotation with chaos
          const rotationSpeed = animationSpeed * (1 + slice.randomSeed * chaosLevel);
          
          mesh.rotation.x += delta * rotationSpeed * rotationIntensity * 0.5;
          mesh.rotation.y += delta * rotationSpeed * rotationIntensity * 0.3;
          mesh.rotation.z += delta * rotationSpeed * rotationIntensity * 0.2;
          
          // Update shader uniforms
          const material = mesh.material as THREE.ShaderMaterial;
          if (material.uniforms) {
            material.uniforms.uTime.value = timeRef.current;
            material.uniforms.tDiffuse.value = videoTexture;
            material.uniforms.uSeparationDistance.value = separationDistance;
            material.uniforms.uRotationIntensity.value = rotationIntensity;
            material.uniforms.uDepthSpread.value = depthSpread;
            material.uniforms.uAnimationSpeed.value = animationSpeed;
            material.uniforms.uChaosLevel.value = chaosLevel;
            material.uniforms.uOpacity.value = opacity;
          }
        }
      });
    }
  });

  // Don't render if no video texture
  if (!videoTexture) {
    console.log('🚫 No video texture provided to Video3DSliceEffect');
    return null;
  }

  return (
    <group ref={groupRef}>
      {/* Render 3D slices - no background blocker needed since effect replaces video */}
      {slices.map((slice, index) => (
        <mesh
          key={index}
          geometry={slice.geometry}
          material={slice.material}
          position={slice.position}
          rotation={slice.rotation}
        />
      ))}
    </group>
  );
};

// Register the effect with metadata
(Video3DSliceEffect as any).metadata = {
  name: '3D Video Slices',
  description: 'Splits video into 3D horizontal slices that move independently in 3D space',
  category: '3D Effects',
  icon: '📐',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect completely replaces the video instead of overlaying
  parameters: [
    { name: 'sliceCount', type: 'number', value: 10, min: 3, max: 30, step: 1 },
    { name: 'separationDistance', type: 'number', value: 0.5, min: 0, max: 2, step: 0.1 },
    { name: 'rotationIntensity', type: 'number', value: 1, min: 0, max: 3, step: 0.1 },
    { name: 'depthSpread', type: 'number', value: 2, min: 0, max: 5, step: 0.1 },
    { name: 'animationSpeed', type: 'number', value: 1, min: 0, max: 3, step: 0.1 },
    { name: 'chaosLevel', type: 'number', value: 0.5, min: 0, max: 1, step: 0.1 },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.1 }
  ]
};

// Register the effect (single registration)
registerEffect('video-3d-slice-effect', Video3DSliceEffect);

export default Video3DSliceEffect;
