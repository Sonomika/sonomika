import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface BackgroundColorSourceProps {
  color?: string;
  gradientType?: 'solid' | 'linear' | 'radial' | 'conic';
  gradientColors?: string[];
  gradientStops?: number[];
  gradientDirection?: 'horizontal' | 'vertical' | 'diagonal';
  gradientCenter?: [number, number];
  gradientRadius?: number;
  animate?: boolean;
  animationSpeed?: number;
  animationType?: 'pulse' | 'rotate' | 'flow';
}

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform int uGradientType;
  uniform vec3 uGradientColors[3];
  uniform float uGradientStops[3];
  uniform vec2 uGradientDirection;
  uniform vec2 uGradientCenter;
  uniform float uGradientRadius;
  uniform bool uAnimate;
  uniform float uAnimationSpeed;
  uniform int uAnimationType;
  varying vec2 vUv;

  vec3 getSolidColor() { return uColor; }

  vec3 interp(float t) {
    t = clamp(t, 0.0, 1.0);
    int idx = 0;
    for (int i = 0; i < 2; i++) {
      if (t >= uGradientStops[i] && t <= uGradientStops[i + 1]) { idx = i; break; }
    }
    float localT = (t - uGradientStops[idx]) / (uGradientStops[idx + 1] - uGradientStops[idx]);
    localT = clamp(localT, 0.0, 1.0);
    return mix(uGradientColors[idx], uGradientColors[idx + 1], localT);
  }

  vec3 getLinearGradient() { return interp(dot(vUv, uGradientDirection)); }
  vec3 getRadialGradient() {
    float t = distance(vUv, uGradientCenter) / uGradientRadius;
    return interp(t);
  }
  vec3 getConicGradient() {
    vec2 dir = vUv - uGradientCenter;
    float t = (atan(dir.y, dir.x) + 3.14159) / (2.0 * 3.14159);
    return interp(t);
  }

  vec3 getAnimatedColor(vec3 baseColor) {
    if (!uAnimate) return baseColor;
    float time = uTime * uAnimationSpeed;

    if (uAnimationType == 0) { // pulse
      float pulse = sin(time) * 0.3 + 0.7;
      return baseColor * pulse;
    } else if (uAnimationType == 1) { // rotate
      float rotation = time * 0.5;
      vec2 rotatedUv = vec2(
        cos(rotation) * (vUv.x - 0.5) - sin(rotation) * (vUv.y - 0.5) + 0.5,
        sin(rotation) * (vUv.x - 0.5) + cos(rotation) * (vUv.y - 0.5) + 0.5
      );
      float t = dot(rotatedUv, uGradientDirection);
      return (uGradientType == 1) ? interp(t) : baseColor;
    } else { // flow
      float flow = sin(time + vUv.x * 10.0) * 0.2 + 0.8;
      return baseColor * flow;
    }
  }

  void main() {
    vec3 finalColor =
      (uGradientType == 0) ? getSolidColor() :
      (uGradientType == 1) ? getLinearGradient() :
      (uGradientType == 2) ? getRadialGradient() :
                             getConicGradient();

    finalColor = getAnimatedColor(finalColor);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const BackgroundColorSource: React.FC<BackgroundColorSourceProps> = ({
  color = '#000000',
  gradientType = 'solid',
  gradientColors = ['#ff0000', '#00ff00', '#0000ff'],
  gradientStops = [0, 0.5, 1],
  gradientDirection = 'horizontal',
  gradientCenter = [0.5, 0.5],
  gradientRadius = 1.0,
  animate = false,
  animationSpeed = 1.0,
  animationType = 'pulse'
}) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  // Create static uniforms once
  const uniforms = useRef({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(color) },
    uGradientType: { value: gradientType === 'solid' ? 0 : gradientType === 'linear' ? 1 : gradientType === 'radial' ? 2 : 3 },
    uGradientColors: { value: gradientColors.map(c => new THREE.Color(c)) },
    uGradientStops: { value: gradientStops },
    uGradientDirection: { value: new THREE.Vector2(
      gradientDirection === 'horizontal' ? 1 : gradientDirection === 'vertical' ? 0 : 0.707,
      gradientDirection === 'vertical' ? 1 : gradientDirection === 'horizontal' ? 0 : 0.707
    ) },
    uGradientCenter: { value: new THREE.Vector2(...gradientCenter) },
    uGradientRadius: { value: gradientRadius },
    uAnimate: { value: animate },
    uAnimationSpeed: { value: animationSpeed },
    uAnimationType: { value: animationType === 'pulse' ? 0 : animationType === 'rotate' ? 1 : 2 }
  }).current;

  // Update uniforms reactively when props change
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uColor.value.set(color); 
    }
  }, [color]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uGradientType.value =
        gradientType === 'solid' ? 0 : gradientType === 'linear' ? 1 : gradientType === 'radial' ? 2 : 3;
    }
  }, [gradientType]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uGradientColors.value =
        gradientColors.map(c => new THREE.Color(c));
    }
  }, [gradientColors]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uGradientStops.value = gradientStops; 
    }
  }, [gradientStops]);
  
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uGradientDirection.value.set(
        gradientDirection === 'horizontal' ? 1 : gradientDirection === 'vertical' ? 0 : 0.707,
        gradientDirection === 'vertical' ? 1 : gradientDirection === 'horizontal' ? 0 : 0.707
      );
    }
  }, [gradientDirection]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uGradientCenter.value.set(...gradientCenter); 
    }
  }, [gradientCenter]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uGradientRadius.value = gradientRadius; 
    }
  }, [gradientRadius]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uAnimate.value = animate; 
    }
  }, [animate]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uAnimationSpeed.value = animationSpeed; 
    }
  }, [animationSpeed]);
  
  useEffect(() => { 
    if (materialRef.current) {
      materialRef.current.uniforms.uAnimationType.value =
        animationType === 'pulse' ? 0 : animationType === 'rotate' ? 1 : 2;
    }
  }, [animationType]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

// Add metadata for the effect
(BackgroundColorSource as any).metadata = {
  name: 'Background Color Source',
  description: 'A source effect that provides solid colors and gradients as background layers',
  category: 'Source',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#000000',
      description: 'Base color for solid mode'
    },
    {
      name: 'gradientType',
      type: 'select',
      value: 'solid',
      options: ['solid', 'linear', 'radial', 'conic'],
      description: 'Type of gradient or solid color'
    },
    {
      name: 'gradientColors',
      type: 'colorArray',
      value: ['#ff0000', '#00ff00', '#0000ff'],
      description: 'Colors for gradient (2-3 colors)'
    },
    {
      name: 'gradientStops',
      type: 'numberArray',
      value: [0, 0.5, 1],
      description: 'Stop positions for gradient (0-1)'
    },
    {
      name: 'gradientDirection',
      type: 'select',
      value: 'horizontal',
      options: ['horizontal', 'vertical', 'diagonal'],
      description: 'Direction for linear gradients'
    },
    {
      name: 'gradientCenter',
      type: 'vector2',
      value: [0.5, 0.5],
      description: 'Center point for radial/conic gradients'
    },
    {
      name: 'gradientRadius',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Radius for radial gradients'
    },
    {
      name: 'animate',
      type: 'boolean',
      value: false,
      description: 'Enable animation'
    },
    {
      name: 'animationSpeed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Animation speed multiplier'
    },
    {
      name: 'animationType',
      type: 'select',
      value: 'pulse',
      options: ['pulse', 'rotate', 'flow'],
      description: 'Type of animation'
    }
  ]
};

// Register the effect for dynamic loading
registerEffect('BackgroundColorSource', BackgroundColorSource);
console.log('✅ BackgroundColorSource registered successfully');

// Force hot reload trigger
console.log('🔥 BackgroundColorSource hot reload trigger');

export default BackgroundColorSource;
