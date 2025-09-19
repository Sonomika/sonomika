// Portable external Glitch Scanlines effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Glitch Scanlines (External)',
  description: 'Analog scanlines with horizontal noise distortion and RGB split.',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'lineDensity', type: 'number', value: 600.0, min: 50.0, max: 1200.0, step: 10.0 },
    { name: 'distortion', type: 'number', value: 0.0025, min: 0.0, max: 0.02, step: 0.0005 },
    { name: 'noiseSpeed', type: 'number', value: 1.0, min: 0.0, max: 5.0, step: 0.05 },
    { name: 'colorBleed', type: 'number', value: 0.0015, min: 0.0, max: 0.01, step: 0.0005 },
  ],
};

export default function GlitchScanlinesExternal({ videoTexture, isGlobal = false, lineDensity = 600.0, distortion = 0.0025, noiseSpeed = 1.0, colorBleed = 0.0015, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}
  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const renderTarget = useMemo(() => { if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uTime; uniform float uLineDensity; uniform float uDistortion; uniform float uNoiseSpeed; uniform float uColorBleed; varying vec2 vUv;
    float hash(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return fract(sin(p.x+p.y)*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i); float b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y; }
    void main(){ vec2 uv=vUv; float lines=sin(uv.y*uLineDensity)*0.2+0.8; float n=noise(vec2(uv.y*30.0,uTime*uNoiseSpeed)); float dist=(n-0.5)*uDistortion; vec2 offs=vec2(dist,0.0); float r=texture2D(tDiffuse, uv + offs*(1.0+uColorBleed)).r; float g=texture2D(tDiffuse, uv + offs*(0.5-uColorBleed)).g; float b=texture2D(tDiffuse, uv + offs*(-0.5-uColorBleed)).b; vec3 col=vec3(r,g,b)*lines; gl_FragColor=vec4(col,1.0); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat)) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) }, uTime: { value: 0 }, uLineDensity: { value: lineDensity }, uDistortion: { value: distortion }, uNoiseSpeed: { value: noiseSpeed }, uColorBleed: { value: colorBleed },
    }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, lineDensity, distortion, noiseSpeed, colorBleed]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uLineDensity.value = lineDensity;
    materialRef.current.uniforms.uDistortion.value = distortion;
    materialRef.current.uniforms.uNoiseSpeed.value = noiseSpeed;
    materialRef.current.uniforms.uColorBleed.value = colorBleed;
    const w = (size && size.width) || effectiveW; const h = (size && size.height) || effectiveH; materialRef.current.uniforms.uResolution.value.set(Math.max(1,w), Math.max(1,h));
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget(); const wasVisible = meshRef.current ? meshRef.current.visible : undefined; if (meshRef.current) meshRef.current.visible = false; try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible!==undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspect = useMemo(() => { try { if (size && size.width>0 && size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}


