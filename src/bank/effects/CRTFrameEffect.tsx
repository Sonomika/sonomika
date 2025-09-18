import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface CRTFrameEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  vignette?: number;     // 0..1 vignette strength
  curvature?: number;    // CRT bulge amount
  bloom?: number;        // simple glow multiplier
  scanlineMix?: number;  // 0..1 scanline visibility
}

const CRTFrameEffect: React.FC<CRTFrameEffectProps> = ({
  videoTexture,
  isGlobal = false,
  vignette = 0.35,
  curvature = 0.15,
  bloom = 0.1,
  scanlineMix = 0.35
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  const shaderMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uVignette: { value: vignette },
        uCurvature: { value: curvature },
        uBloom: { value: bloom },
        uScanlineMix: { value: scanlineMix },
        uTime: { value: 0.0 }
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
        uniform float uVignette;
        uniform float uCurvature;
        uniform float uBloom;
        uniform float uScanlineMix;
        uniform float uTime;
        varying vec2 vUv;

        vec2 barrelDistortion(vec2 coord, float amt){
          vec2 cc = coord - 0.5;
          float dist = dot(cc, cc);
          return coord + cc * dist * amt;
        }

        void main(){
          vec2 uv = vUv;
          uv = barrelDistortion(uv, uCurvature * 0.25);
          vec3 color = texture2D(tDiffuse, uv).rgb;
          // simple bloom-like lift
          color += smoothstep(0.6, 1.0, color) * uBloom;
          // scanlines
          float scan = sin(uv.y * uResolution.y) * 0.5 + 0.5;
          color *= mix(1.0, scan, uScanlineMix);
          // vignette
          vec2 p = uv - 0.5;
          float vig = 1.0 - dot(p, p) * 2.0 * uVignette;
          color *= clamp(vig, 0.0, 1.0);
          gl_FragColor = vec4(color, 1.0);
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
    materialRef.current.uniforms.uVignette.value = vignette;
    materialRef.current.uniforms.uCurvature.value = curvature;
    materialRef.current.uniforms.uBloom.value = bloom;
    materialRef.current.uniforms.uScanlineMix.value = scanlineMix;
  }, [vignette, curvature, bloom, scanlineMix]);

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

(CRTFrameEffect as any).metadata = {
  name: 'CRT Frame',
  description: 'CRT-style curved screen with scanlines, vignette and simple bloom',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'vignette', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'curvature', type: 'number', value: 0.15, min: 0.0, max: 0.6, step: 0.01 },
    { name: 'bloom', type: 'number', value: 0.1, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'scanlineMix', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 }
  ]
};

registerEffect('crt-frame', CRTFrameEffect);
registerEffect('CRTFrameEffect', CRTFrameEffect);

export default CRTFrameEffect;


