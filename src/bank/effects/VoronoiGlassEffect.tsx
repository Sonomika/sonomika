import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';
import { useOptimizedUniforms } from '../../hooks/useOptimizedUniforms';

interface VoronoiGlassEffectProps {
  refractionStrength?: number; // 0.0 - 0.2
  cellScale?: number; // 2 - 40
  edgeSharpness?: number; // 0 - 8
  dispersion?: number; // 0.0 - 0.01
  edgeBrightness?: number; // 0 - 2
  speed?: number; // animation speed
  mixOriginal?: number; // 0..1
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
  compositionWidth?: number;
  compositionHeight?: number;
}

const VoronoiGlassEffect: React.FC<VoronoiGlassEffectProps> = ({
  refractionStrength = 0.07,
  cellScale = 3.0,
  edgeSharpness = 0.4,
  dispersion = 0.003,
  edgeBrightness = 0.0,
  speed = 1.75,
  mixOriginal = 0.0,
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, scene, camera, size } = useThree();
  const { bpm, compositionSettings } = useStore();
  const { updateUniforms } = useOptimizedUniforms();

  const effectiveCompositionWidth = compositionWidth || compositionSettings?.width || 1920;
  const effectiveCompositionHeight = compositionHeight || compositionSettings?.height || 1080;

  // Render target for global mode capture
  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, effectiveCompositionWidth),
      Math.max(1, effectiveCompositionHeight),
      {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      }
    );
    return rt;
  }, [isGlobal, effectiveCompositionWidth, effectiveCompositionHeight]);

  useEffect(() => {
    return () => {
      try { renderTarget?.dispose?.(); } catch {}
    };
  }, [renderTarget]);

  // Shader material
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: videoTexture || null },
        time: { value: 0.0 },
        bpm: { value: bpm },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        refractionStrength: { value: refractionStrength },
        cellScale: { value: cellScale },
        edgeSharpness: { value: edgeSharpness },
        dispersion: { value: dispersion },
        edgeBrightness: { value: edgeBrightness },
        speed: { value: speed },
        mixOriginal: { value: mixOriginal },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float time;
        uniform float bpm;
        uniform float refractionStrength;
        uniform float cellScale;
        uniform float edgeSharpness;
        uniform float dispersion;
        uniform float edgeBrightness;
        uniform float speed;
        uniform float mixOriginal;
        varying vec2 vUv;

        // Hash and random helpers
        float hash11(float p){
          p = fract(p * 0.1031);
          p *= p + 33.33;
          p *= p + p;
          return fract(p);
        }
        float hash21(vec2 p){
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        vec2 hash22(vec2 p){
          float n = sin(dot(p, vec2(127.1, 311.7)));
          return fract(vec2(262144.0, 32768.0) * n);
        }

        // Voronoi returning nearest and second nearest distances and nearest offset
        struct VoroData { float d1; float d2; vec2 nearestVec; };

        VoroData voronoi(vec2 x){
          vec2 cell = floor(x);
          vec2 frac = fract(x);
          float d1 = 1e9;
          float d2 = 1e9;
          vec2 nearest = vec2(0.0);
          for(int j=-1;j<=1;j++){
            for(int i=-1;i<=1;i++){
              vec2 g = vec2(float(i), float(j));
              vec2 o = hash22(cell + g);
              // jitter animate
              o = 0.5 + 0.5 * sin(6.2831 * (o + 0.25 * sin(time * speed + dot(cell+g, vec2(1.7, 9.2)))));
              vec2 r = g + o - frac;
              float d = dot(r, r);
              if(d < d1){ d2 = d1; d1 = d; nearest = r; }
              else if(d < d2){ d2 = d; }
            }
          }
          VoroData vd; vd.d1 = sqrt(d1); vd.d2 = sqrt(d2); vd.nearestVec = nearest;
          return vd;
        }

        void main(){
          vec2 uv = vUv;
          // Scale space for Voronoi
          float scale = max(0.001, cellScale);
          VoroData vd = voronoi(uv * scale);

          // Edge factor using F2 - F1 (thicker edges near boundaries)
          float edge = clamp((vd.d2 - vd.d1) * scale, 0.0, 1.0);
          edge = pow(edge, edgeSharpness);

          // Refraction direction is away from cell center (nearestVec)
          vec2 dir = normalize(vd.nearestVec + 1e-6);
          float bend = (1.0 - edge) * refractionStrength;

          // Chromatic dispersion: sample channels with slight offset
          vec2 uvR = uv + dir * (bend + dispersion);
          vec2 uvG = uv + dir * bend;
          vec2 uvB = uv + dir * (bend - dispersion);

          vec3 col;
          col.r = texture2D(tDiffuse, uvR).r;
          col.g = texture2D(tDiffuse, uvG).g;
          col.b = texture2D(tDiffuse, uvB).b;

          // Edge highlight (glass edges catch light)
          float highlight = smoothstep(0.0, 0.6, edge) * edgeBrightness;
          col += highlight;

          // Optional original mix
          vec3 base = texture2D(tDiffuse, uv).rgb;
          col = mix(col, base, clamp(mixOriginal, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
  }, [videoTexture]);

  // Keep render target size in sync
  useEffect(() => {
    if (isGlobal && renderTarget) {
      renderTarget.setSize(
        Math.max(1, effectiveCompositionWidth),
        Math.max(1, effectiveCompositionHeight)
      );
    }
  }, [isGlobal, renderTarget, effectiveCompositionWidth, effectiveCompositionHeight]);

  // Animation and uniform updates
  useFrame((state) => {
    // Capture for global mode
    if (isGlobal && renderTarget && shaderMaterial) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      if (materialRef.current && materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else if (!isGlobal && videoTexture && materialRef.current && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
      materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }

    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.bpm.value = bpm;
      materialRef.current.uniforms.uResolution.value.set(
        state.gl.domElement.width,
        state.gl.domElement.height
      );

      updateUniforms(materialRef.current, {
        refractionStrength,
        cellScale,
        edgeSharpness,
        dispersion,
        edgeBrightness,
        speed,
        mixOriginal
      });
    }
  });

  const aspect = useMemo(() => {
    return size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  }, [size]);

  if (!shaderMaterial) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspect * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} attach="material" />
    </mesh>
  );
};

// Metadata for dynamic discovery
(VoronoiGlassEffect as any).metadata = {
  name: 'Voronoi Glass',
  description: 'Voronoi-based glass refraction with chromatic dispersion; works in layer or global mode',
  category: 'Distortion',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'refractionStrength', type: 'number', value: 0.07, min: 0.0, max: 0.2, step: 0.005, description: 'UV refraction amount' },
    { name: 'cellScale', type: 'number', value: 3.0, min: 2.0, max: 60.0, step: 0.5, description: 'Voronoi cell density' },
    { name: 'edgeSharpness', type: 'number', value: 0.4, min: 0.0, max: 8.0, step: 0.1, description: 'Edge hardness' },
    { name: 'dispersion', type: 'number', value: 0.003, min: 0.0, max: 0.02, step: 0.0005, description: 'Chromatic dispersion amount' },
    { name: 'edgeBrightness', type: 'number', value: 0.0, min: 0.0, max: 2.0, step: 0.05, description: 'Edge highlight intensity' },
    { name: 'speed', type: 'number', value: 1.75, min: 0.0, max: 3.0, step: 0.05, description: 'Cell animation speed' },
    { name: 'mixOriginal', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.01, description: 'Blend with original' }
  ]
};

// Self-register
registerEffect('VoronoiGlassEffect', VoronoiGlassEffect);
registerEffect('voronoi-glass', VoronoiGlassEffect);

export default VoronoiGlassEffect;


