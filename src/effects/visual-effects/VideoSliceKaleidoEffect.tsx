import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface VideoSliceKaleidoEffectProps {
  videoTexture?: THREE.VideoTexture;
  segments?: number;
  angle?: number; // degrees
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  isGlobal?: boolean;
}

export const VideoSliceKaleidoEffect: React.FC<VideoSliceKaleidoEffectProps> = ({
  videoTexture,
  segments = 6,
  angle = 0,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  opacity = 1,
  isGlobal = false
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, scene, camera, size } = useThree();

  const blackTexture = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const renderTarget = useMemo(() => {
    if (isGlobal) {
      const rt = new THREE.WebGLRenderTarget(
        Math.max(1, size.width),
        Math.max(1, size.height),
        {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter
        }
      );
      return rt;
    }
    return null;
  }, [isGlobal, size.width, size.height]);

  useEffect(() => {
    return () => {
      try {
        renderTarget?.dispose?.();
      } catch {}
    };
  }, [renderTarget]);

  const fragmentShader = `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float uSegments;
uniform float uAngle; // radians
uniform vec2 uOffset;
uniform float uScale;
uniform float uOpacity;

varying vec2 vUv;

const float TAU = 6.283185307179586;

void main(){
  // Centered UV
  vec2 uv = vUv - 0.5;

  // Polar coords
  float r = length(uv);
  float theta = atan(uv.y, uv.x) + uAngle;

  // Sector size and folding
  float sector = TAU / max(2.0, uSegments);
  theta = mod(theta, sector);
  // Mirror around sector center
  theta = abs(theta - sector * 0.5) - sector * 0.5;

  // Reconstruct coordinates after folding
  vec2 dir = vec2(cos(theta), sin(theta));
  vec2 k = dir * r;

  // Apply scale and offset, recenter to [0,1]
  vec2 sampleUv = k * uScale + uOffset + 0.5;

  vec4 color = texture2D(tDiffuse, sampleUv);
  gl_FragColor = vec4(color.rgb, color.a * uOpacity);
}`;

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: blackTexture },
        resolution: { value: new THREE.Vector2(Math.max(1, size.width), Math.max(1, size.height)) },
        uSegments: { value: Math.max(2, Math.floor(segments)) },
        uAngle: { value: (angle * Math.PI) / 180 },
        uOffset: { value: new THREE.Vector2(offsetX, offsetY) },
        uScale: { value: scale },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
  }, [isGlobal]);

  useFrame(() => {
    // Global capture
    if (isGlobal && renderTarget && shaderMaterial) {
      const currentRenderTarget = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(currentRenderTarget);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      if (materialRef.current && materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    }

    if (materialRef.current && shaderMaterial) {
      // Route texture in layer mode
      if (!isGlobal && videoTexture && materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
      // Update uniforms if changed
      const segs = Math.max(2, Math.floor(segments));
      if (materialRef.current.uniforms.uSegments.value !== segs) {
        materialRef.current.uniforms.uSegments.value = segs;
      }
      const ang = (angle * Math.PI) / 180;
      if (materialRef.current.uniforms.uAngle.value !== ang) {
        materialRef.current.uniforms.uAngle.value = ang;
      }
      const off = materialRef.current.uniforms.uOffset.value as THREE.Vector2;
      if (off.x !== offsetX || off.y !== offsetY) {
        off.set(offsetX, offsetY);
      }
      if (materialRef.current.uniforms.uScale.value !== scale) {
        materialRef.current.uniforms.uScale.value = scale;
      }
      if (materialRef.current.uniforms.uOpacity.value !== opacity) {
        materialRef.current.uniforms.uOpacity.value = opacity;
      }
    }
  });

  // Keep resolution and RT size synced with canvas size
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.resolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
    }
    if (isGlobal && renderTarget) {
      renderTarget.setSize(Math.max(1, size.width), Math.max(1, size.height));
    }
  }, [size, isGlobal, renderTarget]);

  const compositionAspect = useMemo(() => {
    return size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  }, [size]);

  if (!shaderMaterial) {
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[compositionAspect * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} attach="material" />
    </mesh>
  );
};

(VideoSliceKaleidoEffect as any).metadata = {
  name: 'Video Slice Kaleidoscope',
  description: 'Kaleidoscopic mirroring using angular slices; works as layer or global effect.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'segments', type: 'number', value: 6, min: 2, max: 24, step: 1 },
    { name: 'angle', type: 'number', value: 0, min: 0, max: 360, step: 1 },
    { name: 'scale', type: 'number', value: 1, min: 0.2, max: 3, step: 0.01 },
    { name: 'offsetX', type: 'number', value: 0, min: -1, max: 1, step: 0.01 },
    { name: 'offsetY', type: 'number', value: 0, min: -1, max: 1, step: 0.01 }
  ]
};

registerEffect('video-slice-kaleido-effect', VideoSliceKaleidoEffect);
registerEffect('kaleido', VideoSliceKaleidoEffect);
registerEffect('kaleidoscope', VideoSliceKaleidoEffect);
registerEffect('visual-effects/VideoSliceKaleidoEffect', VideoSliceKaleidoEffect);
registerEffect('VideoSliceKaleidoEffect', VideoSliceKaleidoEffect);

export default VideoSliceKaleidoEffect;


