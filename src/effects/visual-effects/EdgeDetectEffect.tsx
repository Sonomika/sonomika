import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface EdgeDetectEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  strength?: number;     // edge magnitude multiplier
  threshold?: number;    // edge threshold 0..1
  invert?: boolean;      // invert edges
}

const EdgeDetectEffect: React.FC<EdgeDetectEffectProps> = ({
  videoTexture,
  isGlobal = false,
  strength = 1.0,
  threshold = 0.0,
  invert = false
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uStrength: { value: strength },
        uThreshold: { value: threshold },
        uInvert: { value: invert ? 1 : 0 }
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
        uniform float uStrength;
        uniform float uThreshold;
        uniform float uInvert;
        varying vec2 vUv;

        float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

        void main(){
          vec2 texel = 1.0 / uResolution;
          float tl = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0,  1.0)).rgb);
          float  t = luma(texture2D(tDiffuse, vUv + texel * vec2( 0.0,  1.0)).rgb);
          float tr = luma(texture2D(tDiffuse, vUv + texel * vec2( 1.0,  1.0)).rgb);
          float  l = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0,  0.0)).rgb);
          float  c = luma(texture2D(tDiffuse, vUv + texel * vec2( 0.0,  0.0)).rgb);
          float  r = luma(texture2D(tDiffuse, vUv + texel * vec2( 1.0,  0.0)).rgb);
          float bl = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb);
          float  b = luma(texture2D(tDiffuse, vUv + texel * vec2( 0.0, -1.0)).rgb);
          float br = luma(texture2D(tDiffuse, vUv + texel * vec2( 1.0, -1.0)).rgb);

          // Sobel
          float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
          float gy =  tl + 2.0*t + tr - bl - 2.0*b - br;
          float g = length(vec2(gx, gy));
          g = max(0.0, g - uThreshold) * uStrength;
          float edge = clamp(g, 0.0, 1.0);
          if (uInvert > 0.5) edge = 1.0 - edge;
          gl_FragColor = vec4(vec3(edge), 1.0);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    return mat;
  }, []);

  // Update uniforms when props change
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uStrength.value = strength;
      materialRef.current.uniforms.uThreshold.value = threshold;
      materialRef.current.uniforms.uInvert.value = invert ? 1 : 0;
    }
  }, [strength, threshold, invert]);

  // Frame loop: handle global capture and resolution
  useFrame((state) => {
    const { gl } = state;
    const w = gl.domElement.width || 1920;
    const h = gl.domElement.height || 1080;

    if (materialRef.current) {
      materialRef.current.uniforms.uResolution.value.set(w, h);
    }

    if (isGlobal) {
      if (!renderTargetRef.current) {
        renderTargetRef.current = new THREE.WebGLRenderTarget(w, h, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter
        });
      } else {
        if (renderTargetRef.current.width !== w || renderTargetRef.current.height !== h) {
          renderTargetRef.current.setSize(w, h);
        }
      }
      const rt = renderTargetRef.current;
      const current = gl.getRenderTarget();
      gl.setRenderTarget(rt);
      state.gl.render(state.scene, state.camera);
      gl.setRenderTarget(current);
      if (materialRef.current) materialRef.current.uniforms.tDiffuse.value = rt.texture;
    } else if (videoTexture && materialRef.current) {
      materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  // Aspect ratio calculation
  const aspectRatio = useMemo(() => {
    const img: any = (videoTexture as any)?.image;
    if (img && img.width && img.height) {
      return img.width / img.height;
    }
    return 16 / 9;
  }, [videoTexture]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

(EdgeDetectEffect as any).metadata = {
  name: 'Edge Detect',
  description: 'Sobel edge detection with threshold and invert options',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'strength', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'threshold', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'invert', type: 'boolean', value: false }
  ]
};

registerEffect('edge-detect', EdgeDetectEffect);
registerEffect('EdgeDetectEffect', EdgeDetectEffect);

export default EdgeDetectEffect;


