// AI Generated Effect: Dots Overlay Glitch
// Generated on: 2025-09-02T22:04:00.477Z
// Description: An animated glitch effect with dot overlays responsive to BPM and time.
// Category: visual-effects

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface Props {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
}

const DotsOverlayGlitchEffect: React.FC<Props> = ({ videoTexture, isGlobal = false }) => {
  const { gl, scene, camera, size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const fallback = useMemo(() => new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat), []);
  const target = useMemo(() => (isGlobal ? new THREE.WebGLRenderTarget(Math.max(1,size.width), Math.max(1,size.height)) : null), [isGlobal, size.width, size.height]);
  useEffect(() => () => target?.dispose(), [target]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      inputBuffer: { value: fallback },
      resolution: { value: new THREE.Vector2(Math.max(1,size.width), Math.max(1,size.height)) },
      uTime: { value: 0 },
      uBpm: { value: 120 },
      uOpacity: { value: 1.0 },
      uDotSize: { value: 5.0 },
      uGlitchIntensity: { value: 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D inputBuffer;
      uniform vec2 resolution;
      uniform float uTime;
      uniform float uBpm;
      uniform float uOpacity;
      uniform float uDotSize;
      uniform float uGlitchIntensity;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        float time = uTime * 0.001;
        uv.x += sin(time * uBpm * 0.1) * uGlitchIntensity;
        uv.y += cos(time * uBpm * 0.1) * uGlitchIntensity;

        vec4 color = texture2D(inputBuffer, uv);
        float dots = step(0.5, mod(floor(uv.x * resolution.x / uDotSize) + floor(uv.y * resolution.y / uDotSize), 2.0));
        color.rgb *= dots;

        gl_FragColor = vec4(color.rgb, color.a * uOpacity);
      }
    `,
    transparent: true, depthTest: false, depthWrite: false,
  }), []);

  useFrame((state) => {
    if (isGlobal && target && materialRef.current) {
      const prev = gl.getRenderTarget();
      const vis = meshRef.current?.visible;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(target); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && vis!==undefined) meshRef.current.visible = vis; }
      materialRef.current.uniforms.inputBuffer.value = target.texture;
    } else if (!isGlobal && videoTexture && materialRef.current) {
      materialRef.current.uniforms.inputBuffer.value = videoTexture;
    }
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * 1000;
    }
  });

  useEffect(() => { 
    if (materialRef.current) materialRef.current.uniforms.resolution.value.set(Math.max(1,size.width), Math.max(1,size.height)); 
    if (isGlobal && target) target.setSize(Math.max(1,size.width), Math.max(1,size.height)); 
  }, [size, isGlobal, target]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
};

(DotsOverlayGlitchEffect as any).metadata = {
  name: 'Dots Overlay Glitch',
  description: 'An animated glitch effect with dot overlays responsive to BPM and time.',
  category: 'Video Effects',
  icon: '', 
  author: 'AI Generator', 
  version: '1.0.0',
  replacesVideo: false, 
  canBeGlobal: true,
  parameters: [
    { name: 'uDotSize', type: 'number', default: 5.0, min: 1.0, max: 20.0, step: 0.1 },
    { name: 'uGlitchIntensity', type: 'number', default: 0.5, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'uOpacity', type: 'number', default: 1.0, min: 0.0, max: 1.0, step: 0.01 },
  ],
};

registerEffect('dots-overlay-glitch', DotsOverlayGlitchEffect);
export default DotsOverlayGlitchEffect;