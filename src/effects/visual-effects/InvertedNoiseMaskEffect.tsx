import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface InvertedNoiseMaskEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  scale?: number;       // noise scale
  threshold?: number;   // mask threshold 0..1
  contrast?: number;    // contrast curve
  speed?: number;       // animation speed
  softness?: number;    // edge softness
}

const InvertedNoiseMaskEffect: React.FC<InvertedNoiseMaskEffectProps> = ({
  videoTexture,
  isGlobal = false,
  scale = 3.0,
  threshold = 0.5,
  contrast = 2.0,
  speed = 0.5,
  softness = 0.05
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
        uScale: { value: scale },
        uThreshold: { value: threshold },
        uContrast: { value: contrast },
        uSpeed: { value: speed },
        uSoftness: { value: softness }
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
        uniform float uScale;
        uniform float uThreshold;
        uniform float uContrast;
        uniform float uSpeed;
        uniform float uSoftness;
        varying vec2 vUv;

        // Simple value noise (hash-based)
        float hash(vec2 p){
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p.x + p.y) * 43758.5453123);
        }

        float noise(vec2 p){
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
        }

        float fbm(vec2 p){
          float v = 0.0;
          float a = 0.5;
          for(int i=0;i<5;i++){
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        void main(){
          vec2 uv = vUv;
          vec2 p = uv * uScale + vec2(0.0, uTime * uSpeed);
          float n = fbm(p);
          // apply contrast curve around threshold
          float t = uThreshold;
          float s = uSoftness;
          float c = uContrast;
          float edge = smoothstep(t - s, t + s, pow(n, c));
          float invMask = 1.0 - edge; // inverted mask (strength)
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
    materialRef.current.uniforms.uScale.value = scale;
    materialRef.current.uniforms.uThreshold.value = threshold;
    materialRef.current.uniforms.uContrast.value = contrast;
    materialRef.current.uniforms.uSpeed.value = speed;
    materialRef.current.uniforms.uSoftness.value = softness;
  }, [scale, threshold, contrast, speed, softness]);

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

(InvertedNoiseMaskEffect as any).metadata = {
  name: 'Inverted Noise Mask',
  description: 'Animated fractal noise used as an inverted mask with soft edges',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'scale', type: 'number', value: 3.0, min: 0.5, max: 12.0, step: 0.1 },
    { name: 'threshold', type: 'number', value: 0.5, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'contrast', type: 'number', value: 2.0, min: 0.5, max: 4.0, step: 0.05 },
    { name: 'speed', type: 'number', value: 0.5, min: 0.0, max: 5.0, step: 0.05 },
    { name: 'softness', type: 'number', value: 0.05, min: 0.0, max: 0.3, step: 0.005 }
  ]
};

registerEffect('inverted-noise-mask', InvertedNoiseMaskEffect);
registerEffect('InvertedNoiseMaskEffect', InvertedNoiseMaskEffect);

export default InvertedNoiseMaskEffect;


