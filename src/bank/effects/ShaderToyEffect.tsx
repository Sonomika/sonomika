import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';
import { createShaderToyMaterial, updateShaderToyUniforms } from '../../utils/ShaderToyLoader';

interface ShaderToyEffectProps {
  shaderCode?: string;
  intensity?: number;
  speed?: number;
  color1?: string;
  color2?: string;
  color3?: string;
  color4?: string;
}

const ShaderToyEffect: React.FC<ShaderToyEffectProps> = ({
  shaderCode = '',
  intensity = 1.0,
  speed = 1.0,
  color1 = '#ff0000',
  color2 = '#00ff00',
  color3 = '#0000ff',
  color4 = '#ffffff'
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();

  console.log('🎨 ShaderToyEffect component rendered with props:', { intensity, speed, color1, color2, color3, color4 });

  // Convert colors to vec3
  const color1Vec = useMemo(() => {
    const color = new THREE.Color(color1);
    return new THREE.Vector3(color.r, color.g, color.b);
  }, [color1]);

  const color2Vec = useMemo(() => {
    const color = new THREE.Color(color2);
    return new THREE.Vector3(color.r, color.g, color.b);
  }, [color2]);

  const color3Vec = useMemo(() => {
    const color = new THREE.Color(color3);
    return new THREE.Vector3(color.r, color.g, color.b);
  }, [color3]);

  const color4Vec = useMemo(() => {
    const color = new THREE.Color(color4);
    return new THREE.Vector3(color.r, color.g, color.b);
  }, [color4]);

  // Create shader material for ShaderToy effect
  const shaderMaterial = useMemo(() => {
    const defaultShaderCode = `
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord/iResolution.xy;
        vec3 col = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));
        fragColor = vec4(col, 1.0);
      }
    `;

    return createShaderToyMaterial({
      shaderCode: shaderCode || defaultShaderCode,
      uniforms: {
        intensity: { value: intensity } as any,
        speed: { value: speed } as any,
        color1: { value: color1Vec } as any,
        color2: { value: color2Vec } as any,
        color3: { value: color3Vec } as any,
        color4: { value: color4Vec } as any,
        bpm: { value: bpm } as any
      }
    });
  }, [shaderCode, intensity, speed, color1Vec, color2Vec, color3Vec, color4Vec, bpm]);

  useFrame((state) => {
    if (materialRef.current) {
      // Update ShaderToy uniforms
      updateShaderToyUniforms(
        materialRef.current,
        state.clock.elapsedTime * speed,
        {
          width: state.gl.domElement?.width || 1,
          height: state.gl.domElement?.height || 1
        }
      );
      
      // Update custom uniforms
      materialRef.current.uniforms.bpm.value = bpm;
    }
  });

  // Calculate aspect ratio from video texture if available
  const aspectRatio = useMemo(() => {
    if (materialRef.current?.uniforms.iChannel0?.value?.image) {
      try {
        const { width, height } = materialRef.current.uniforms.iChannel0.value.image;
        if (width && height && width > 0 && height > 0) {
          return width / height;
        }
      } catch (error) {
        console.warn('Error calculating aspect ratio from video texture:', error);
      }
    }
    return 16/9; // Default aspect ratio
  }, [materialRef.current?.uniforms.iChannel0?.value]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(ShaderToyEffect as any).metadata = {
  name: 'ShaderToy Effect',
  description: 'A generic ShaderToy-compatible effect loader',
  category: 'ShaderToy',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'shaderCode',
      type: 'text',
      value: '',
      description: 'ShaderToy shader code'
    },
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
      name: 'color1',
      type: 'color',
      value: '#ff0000',
      description: 'Color 1'
    },
    {
      name: 'color2',
      type: 'color',
      value: '#00ff00',
      description: 'Color 2'
    },
    {
      name: 'color3',
      type: 'color',
      value: '#0000ff',
      description: 'Color 3'
    },
    {
      name: 'color4',
      type: 'color',
      value: '#ffffff',
      description: 'Color 4'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering ShaderToyEffect...');
registerEffect('ShaderToyEffect', ShaderToyEffect);
console.log('✅ ShaderToyEffect registered successfully');

export default ShaderToyEffect;
