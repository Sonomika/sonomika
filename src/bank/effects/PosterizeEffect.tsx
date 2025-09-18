import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface PosterizeEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  levels?: number;        // number of color levels per channel
  gamma?: number;         // gamma correction
  saturation?: number;    // saturation multiplier
}

const PosterizeEffect: React.FC<PosterizeEffectProps> = ({
  videoTexture,
  isGlobal = false,
  levels = 6,
  gamma = 1.0,
  saturation = 1.0
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  const shaderMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uLevels: { value: levels },
        uGamma: { value: gamma },
        uSaturation: { value: saturation }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uLevels;
        uniform float uGamma;
        uniform float uSaturation;
        varying vec2 vUv;

        vec3 adjustSaturation(vec3 color, float sat){
          float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
          return mix(vec3(l), color, sat);
        }

        void main(){
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          col = pow(col, vec3(1.0 / max(0.001, uGamma)));
          col = adjustSaturation(col, uSaturation);
          vec3 q = floor(col * uLevels) / max(1.0, uLevels - 1.0);
          gl_FragColor = vec4(q, 1.0);
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
    materialRef.current.uniforms.uLevels.value = levels;
    materialRef.current.uniforms.uGamma.value = gamma;
    materialRef.current.uniforms.uSaturation.value = saturation;
  }, [levels, gamma, saturation]);

  useFrame((state) => {
    const { gl, scene, camera } = state;
    const w = gl.domElement.width || 1920;
    const h = gl.domElement.height || 1080;
    if (isGlobal) {
      if (!renderTargetRef.current) {
        renderTargetRef.current = new THREE.WebGLRenderTarget(w, h, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter
        });
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

(PosterizeEffect as any).metadata = {
  name: 'Posterize',
  description: 'Quantizes colors into discrete levels with gamma and saturation control',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'levels', type: 'number', value: 6, min: 2, max: 32, step: 1 },
    { name: 'gamma', type: 'number', value: 1.0, min: 0.2, max: 3.0, step: 0.05 },
    { name: 'saturation', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.05 }
  ]
};

registerEffect('posterize', PosterizeEffect);
registerEffect('PosterizeEffect', PosterizeEffect);

export default PosterizeEffect;


