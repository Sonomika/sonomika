import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface InvertedStripeMaskEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  stripes?: number;     // number of stripes
  angle?: number;       // radians
  speed?: number;       // scroll speed
  duty?: number;        // stripe duty cycle 0..1
  soften?: number;      // edge softness
}

const InvertedStripeMaskEffect: React.FC<InvertedStripeMaskEffectProps> = ({
  videoTexture,
  isGlobal = false,
  stripes = 24,
  angle = Math.PI * 0.25,
  speed = 0.25,
  duty = 0.5,
  soften = 0.02
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  const shaderMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uTime: { value: 0.0 },
        uStripes: { value: stripes },
        uAngle: { value: angle },
        uSpeed: { value: speed },
        uDuty: { value: duty },
        uSoften: { value: soften }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uStripes;
        uniform float uAngle;
        uniform float uSpeed;
        uniform float uDuty;
        uniform float uSoften;
        varying vec2 vUv;

        void main(){
          vec2 uv0 = vUv;
          vec2 uv = uv0 - 0.5;
          float c = cos(uAngle), s = sin(uAngle);
          vec2 r = mat2(c,-s,s,c) * uv; // rotate coords
          float phase = uTime * uSpeed;
          float g = fract(r.x * uStripes + phase);
          float band = smoothstep(0.0, uSoften, g) * (1.0 - smoothstep(uDuty, uDuty + uSoften, g));
          float invMask = 1.0 - band; // strength
          vec3 base = texture2D(tDiffuse, uv0).rgb;
          vec3 inverted = 1.0 - base;
          vec3 col = mix(base, inverted, clamp(invMask, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    return mat;
  }, []);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uStripes.value = stripes;
    materialRef.current.uniforms.uAngle.value = angle;
    materialRef.current.uniforms.uSpeed.value = speed;
    materialRef.current.uniforms.uDuty.value = duty;
    materialRef.current.uniforms.uSoften.value = soften;
  }, [stripes, angle, speed, duty, soften]);

  useFrame((state) => {
    const { gl, clock, scene, camera } = state;
    const w = gl.domElement.width || 1920;
    const h = gl.domElement.height || 1080;
    if (materialRef.current) {
      materialRef.current.uniforms.uResolution.value.set(w, h);
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
    if (isGlobal) {
      if (!renderTargetRef.current) {
        renderTargetRef.current = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      } else if (renderTargetRef.current.width !== w || renderTargetRef.current.height !== h) {
        renderTargetRef.current.setSize(w, h);
      }
      const rt = renderTargetRef.current;
      const current = gl.getRenderTarget();
      gl.setRenderTarget(rt);
      gl.render(scene, camera);
      gl.setRenderTarget(current);
      if (materialRef.current) materialRef.current.uniforms.tDiffuse.value = rt.texture;
    } else if (videoTexture && materialRef.current) {
      materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspectRatio = useMemo(() => {
    const img: any = (videoTexture as any)?.image;
    if (img && img.width && img.height) return img.width / img.height;
    return 16/9;
  }, [videoTexture]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

(InvertedStripeMaskEffect as any).metadata = {
  name: 'Inverted Stripe Mask',
  description: 'Scrolling angled stripe mask inverted to reveal moving slots',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'stripes', type: 'number', value: 24, min: 2, max: 200, step: 1 },
    { name: 'angle', type: 'number', value: Math.PI * 0.25, min: 0, max: Math.PI * 2, step: 0.01 },
    { name: 'speed', type: 'number', value: 0.25, min: 0.0, max: 5.0, step: 0.01 },
    { name: 'duty', type: 'number', value: 0.5, min: 0.05, max: 0.95, step: 0.01 },
    { name: 'soften', type: 'number', value: 0.02, min: 0.0, max: 0.25, step: 0.005 }
  ]
};

registerEffect('inverted-stripe-mask', InvertedStripeMaskEffect);
registerEffect('InvertedStripeMaskEffect', InvertedStripeMaskEffect);

export default InvertedStripeMaskEffect;


