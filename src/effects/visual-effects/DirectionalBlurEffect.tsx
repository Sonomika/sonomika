import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface DirectionalBlurEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  angle?: number;       // radians
  radius?: number;      // blur radius in pixels
  samples?: number;     // number of taps
}

const DirectionalBlurEffect: React.FC<DirectionalBlurEffectProps> = ({
  videoTexture,
  isGlobal = false,
  angle = Math.PI * 0.25,
  radius = 6.0,
  samples = 16
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  const shaderMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uAngle: { value: angle },
        uRadius: { value: radius },
        uSamples: { value: samples }
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
        uniform float uAngle;
        uniform float uRadius;
        uniform float uSamples;
        varying vec2 vUv;

        void main(){
          vec2 dir = vec2(cos(uAngle), sin(uAngle));
          vec2 texel = dir / uResolution * uRadius;
          vec3 acc = vec3(0.0);
          float count = max(1.0, uSamples);
          float halfC = floor(0.5 * (count - 1.0));
          for (float i = -64.0; i <= 64.0; i += 1.0) {
            if (i > halfC) break;
            if (-i > halfC) continue;
            vec2 offs = texel * i;
            acc += texture2D(tDiffuse, vUv + offs).rgb;
          }
          acc /= count;
          gl_FragColor = vec4(acc, 1.0);
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
    materialRef.current.uniforms.uAngle.value = angle;
    materialRef.current.uniforms.uRadius.value = radius;
    materialRef.current.uniforms.uSamples.value = samples;
  }, [angle, radius, samples]);

  useFrame((state) => {
    const { gl, scene, camera } = state;
    const w = gl.domElement.width || 1920;
    const h = gl.domElement.height || 1080;
    if (materialRef.current) {
      materialRef.current.uniforms.uResolution.value.set(w, h);
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

(DirectionalBlurEffect as any).metadata = {
  name: 'Directional Blur',
  description: 'Motion-like blur in a chosen direction with configurable tap count',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'angle', type: 'number', value: Math.PI * 0.25, min: 0, max: Math.PI * 2, step: 0.01 },
    { name: 'radius', type: 'number', value: 6.0, min: 0.0, max: 32.0, step: 0.25 },
    { name: 'samples', type: 'number', value: 16, min: 3, max: 64, step: 1 }
  ]
};

registerEffect('directional-blur', DirectionalBlurEffect);
registerEffect('DirectionalBlurEffect', DirectionalBlurEffect);

export default DirectionalBlurEffect;


