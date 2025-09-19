// Portable external Video Slice Kaleidoscope effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Video Slice Kaleidoscope (External)',
  description: 'Kaleidoscopic mirroring using angular slices; layer or global.',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'segments', type: 'number', value: 6, min: 2, max: 24, step: 1 },
    { name: 'angle', type: 'number', value: 0, min: 0, max: 360, step: 1 },
    { name: 'scale', type: 'number', value: 1, min: 0.2, max: 3, step: 0.01 },
    { name: 'offsetX', type: 'number', value: 0, min: -1, max: 1, step: 0.01 },
    { name: 'offsetY', type: 'number', value: 0, min: -1, max: 1, step: 0.01 },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.01 },
  ],
};

export default function VideoSliceKaleidoExternal({ videoTexture, segments=6, angle=0, scale=1, offsetX=0, offsetY=0, opacity=1, isGlobal=false, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}
  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const blackTexture = useMemo(() => { const tex = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat); tex.needsUpdate = true; return tex; }, []);
  const renderTarget = useMemo(() => { if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float uSegments; uniform float uAngle; uniform vec2 uOffset; uniform float uScale; uniform float uOpacity; varying vec2 vUv; const float TAU = 6.283185307179586; void main(){ vec2 uv = vUv - 0.5; float r = length(uv); float theta = atan(uv.y, uv.x) + uAngle; float sector = TAU / max(2.0, uSegments); theta = mod(theta, sector); theta = abs(theta - sector*0.5) - sector*0.5; vec2 dir = vec2(cos(theta), sin(theta)); vec2 k = dir * r; vec2 sampleUv = k * uScale + uOffset + 0.5; vec4 color = texture2D(tDiffuse, sampleUv); gl_FragColor = vec4(color.rgb, color.a * uOpacity); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || blackTexture) },
      resolution: { value: new THREE.Vector2(effectiveW, effectiveH) }, uSegments: { value: Math.max(2, Math.floor(segments)) }, uAngle: { value: (angle * Math.PI)/180 }, uOffset: { value: new THREE.Vector2(offsetX, offsetY) }, uScale: { value: scale }, uOpacity: { value: opacity },
    }, vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [videoTexture, blackTexture, isGlobal, renderTarget, effectiveW, effectiveH, segments, angle, offsetX, offsetY, scale, opacity]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame(() => {
    if (!materialRef.current) return;
    const segs = Math.max(2, Math.floor(segments)); const ang = (angle * Math.PI)/180; const off = materialRef.current.uniforms.uOffset.value;
    materialRef.current.uniforms.uSegments.value = segs; materialRef.current.uniforms.uAngle.value = ang; if (off.x!==offsetX || off.y!==offsetY) off.set(offsetX, offsetY); materialRef.current.uniforms.uScale.value = scale; materialRef.current.uniforms.uOpacity.value = opacity;
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget(); const wasVisible = meshRef.current ? meshRef.current.visible : undefined; if (meshRef.current) meshRef.current.visible=false; try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible!==undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspect = useMemo(() => { try { if (size && size.width>0 && size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}


