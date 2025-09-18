import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface InvertedRadialMaskEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  radius?: number;       // base radius 0..1
  width?: number;        // ring width 0..1
  speed?: number;        // animation speed
  wobble?: number;       // radial wobble amount
  centerX?: number;      // center offset x [-0.5,0.5]
  centerY?: number;      // center offset y [-0.5,0.5]
}

const InvertedRadialMaskEffect: React.FC<InvertedRadialMaskEffectProps> = ({
  videoTexture,
  isGlobal = false,
  radius = 0.35,
  width = 0.2,
  speed = 0.5,
  wobble = 0.15,
  centerX = 0.0,
  centerY = 0.0
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
        uRadius: { value: radius },
        uWidth: { value: width },
        uSpeed: { value: speed },
        uWobble: { value: wobble },
        uCenter: { value: new THREE.Vector2(centerX, centerY) }
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
        uniform float uRadius;
        uniform float uWidth;
        uniform float uSpeed;
        uniform float uWobble;
        uniform vec2 uCenter;
        varying vec2 vUv;

        void main(){
          vec2 uv = vUv;
          vec2 c = uCenter + vec2(0.5, 0.5);
          vec2 p = uv - c;
          float r = length(p);
          float ang = atan(p.y, p.x);
          float w = uRadius + 0.25 * uWidth * (sin(ang * 4.0 + uTime * uSpeed) * uWobble);
          float inner = w - uWidth * 0.5;
          float outer = w + uWidth * 0.5;
          float mask = smoothstep(inner, inner + 0.01, r) - smoothstep(outer - 0.01, outer, r);
          float invMask = 1.0 - mask; // strength
          vec3 base = texture2D(tDiffuse, uv).rgb;
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
    materialRef.current.uniforms.uRadius.value = radius;
    materialRef.current.uniforms.uWidth.value = width;
    materialRef.current.uniforms.uSpeed.value = speed;
    materialRef.current.uniforms.uWobble.value = wobble;
    materialRef.current.uniforms.uCenter.value.set(centerX, centerY);
  }, [radius, width, speed, wobble, centerX, centerY]);

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

(InvertedRadialMaskEffect as any).metadata = {
  name: 'Inverted Radial Mask',
  description: 'Animated radial ring mask inverted to reveal edges, with wobble',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'radius', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'width', type: 'number', value: 0.2, min: 0.01, max: 1.0, step: 0.01 },
    { name: 'speed', type: 'number', value: 0.5, min: 0.0, max: 5.0, step: 0.05 },
    { name: 'wobble', type: 'number', value: 0.15, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'centerX', type: 'number', value: 0.0, min: -0.5, max: 0.5, step: 0.01 },
    { name: 'centerY', type: 'number', value: 0.0, min: -0.5, max: 0.5, step: 0.01 }
  ]
};

registerEffect('inverted-radial-mask', InvertedRadialMaskEffect);
registerEffect('InvertedRadialMaskEffect', InvertedRadialMaskEffect);

export default InvertedRadialMaskEffect;


