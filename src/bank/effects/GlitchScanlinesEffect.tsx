import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface GlitchScanlinesEffectProps {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  lineDensity?: number;   // lines per screen height
  distortion?: number;    // horizontal displacement magnitude
  noiseSpeed?: number;    // noise animation speed
  colorBleed?: number;    // RGB offset strength
}

const GlitchScanlinesEffect: React.FC<GlitchScanlinesEffectProps> = ({
  videoTexture,
  isGlobal = false,
  lineDensity = 600.0,
  distortion = 0.0025,
  noiseSpeed = 1.0,
  colorBleed = 0.0015
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
        uLineDensity: { value: lineDensity },
        uDistortion: { value: distortion },
        uNoiseSpeed: { value: noiseSpeed },
        uColorBleed: { value: colorBleed }
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
        uniform float uLineDensity;
        uniform float uDistortion;
        uniform float uNoiseSpeed;
        uniform float uColorBleed;
        varying vec2 vUv;

        // Simple hash noise
        float hash(vec2 p){
          p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
          return fract(sin(p.x+p.y)*43758.5453);
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

        void main(){
          vec2 uv = vUv;
          float lines = sin(uv.y * uLineDensity) * 0.2 + 0.8;
          float n = noise(vec2(uv.y * 30.0, uTime * uNoiseSpeed));
          float dist = (n - 0.5) * uDistortion;
          vec2 offs = vec2(dist, 0.0);
          // RGB split
          float r = texture2D(tDiffuse, uv + offs * (1.0 + uColorBleed)).r;
          float g = texture2D(tDiffuse, uv + offs * (0.5 - uColorBleed)).g;
          float b = texture2D(tDiffuse, uv + offs * (-0.5 - uColorBleed)).b;
          vec3 col = vec3(r,g,b) * lines;
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
    materialRef.current.uniforms.uLineDensity.value = lineDensity;
    materialRef.current.uniforms.uDistortion.value = distortion;
    materialRef.current.uniforms.uNoiseSpeed.value = noiseSpeed;
    materialRef.current.uniforms.uColorBleed.value = colorBleed;
  }, [lineDensity, distortion, noiseSpeed, colorBleed]);

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

(GlitchScanlinesEffect as any).metadata = {
  name: 'Glitch Scanlines',
  description: 'Analog scanlines with horizontal noise distortion and subtle RGB split',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'lineDensity', type: 'number', value: 600.0, min: 50.0, max: 1200.0, step: 10.0 },
    { name: 'distortion', type: 'number', value: 0.0025, min: 0.0, max: 0.02, step: 0.0005 },
    { name: 'noiseSpeed', type: 'number', value: 1.0, min: 0.0, max: 5.0, step: 0.05 },
    { name: 'colorBleed', type: 'number', value: 0.0015, min: 0.0, max: 0.01, step: 0.0005 }
  ]
};

registerEffect('glitch-scanlines', GlitchScanlinesEffect);
registerEffect('GlitchScanlinesEffect', GlitchScanlinesEffect);

export default GlitchScanlinesEffect;


