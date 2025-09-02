import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface PolarKaleidoscopeEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  segments?: number;     // number of mirrored segments
  rotate?: number;       // rotation speed
  swirl?: number;        // polar swirl strength
  radialScale?: number;  // radial scaling factor
}

const PolarKaleidoscopeEffect: React.FC<PolarKaleidoscopeEffectProps> = ({
  videoTexture,
  isGlobal = false,
  segments = 8,
  rotate = 0.2,
  swirl = 0.0,
  radialScale = 1.0
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
        uSegments: { value: segments },
        uRotate: { value: rotate },
        uSwirl: { value: swirl },
        uRadialScale: { value: radialScale }
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
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uSegments;
        uniform float uRotate;
        uniform float uSwirl;
        uniform float uRadialScale;
        varying vec2 vUv;

        vec2 kaleido(vec2 uv, float seg){
          vec2 p = uv * 2.0 - 1.0; // [-1,1]
          float r = length(p);
          float a = atan(p.y, p.x);
          float ang = a + uTime * uRotate + r * uSwirl;
          float segAng = 6.28318530718 / max(1.0, seg);
          ang = mod(ang, segAng);
          ang = abs(ang - segAng * 0.5);
          vec2 q = vec2(cos(ang), sin(ang)) * r * uRadialScale;
          return (q + 1.0) * 0.5;
        }

        void main(){
          vec2 uv = kaleido(vUv, uSegments);
          vec3 col = texture2D(tDiffuse, uv).rgb;
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
    materialRef.current.uniforms.uSegments.value = segments;
    materialRef.current.uniforms.uRotate.value = rotate;
    materialRef.current.uniforms.uSwirl.value = swirl;
    materialRef.current.uniforms.uRadialScale.value = radialScale;
  }, [segments, rotate, swirl, radialScale]);

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

(PolarKaleidoscopeEffect as any).metadata = {
  name: 'Polar Kaleidoscope',
  description: 'Polar space kaleidoscope with segment mirroring and optional swirl',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'segments', type: 'number', value: 8, min: 2, max: 24, step: 1 },
    { name: 'rotate', type: 'number', value: 0.2, min: -2.0, max: 2.0, step: 0.01 },
    { name: 'swirl', type: 'number', value: 0.0, min: -3.0, max: 3.0, step: 0.05 },
    { name: 'radialScale', type: 'number', value: 1.0, min: 0.2, max: 2.5, step: 0.01 }
  ]
};

registerEffect('polar-kaleidoscope', PolarKaleidoscopeEffect);
registerEffect('PolarKaleidoscopeEffect', PolarKaleidoscopeEffect);

export default PolarKaleidoscopeEffect;


