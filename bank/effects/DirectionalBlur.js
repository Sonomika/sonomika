// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Directional Blur',
  description: 'Motion-like blur',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'angle', type: 'number', value: Math.PI*0.25, min: 0, max: Math.PI*2, step: 0.01 },
    { name: 'radius', type: 'number', value: 6.0, min: 0.0, max: 32.0, step: 0.25 },
    { name: 'samples', type: 'number', value: 16, min: 3, max: 64, step: 1 },
  ],
};

export default function DirectionalBlur({ videoTexture, isGlobal = false, angle = Math.PI*0.25, radius = 6.0, samples = 16, compositionWidth, compositionHeight }) {
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
    uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uAngle; uniform float uRadius; uniform float uSamples; varying vec2 vUv;
    void main(){ vec2 dir = vec2(cos(uAngle), sin(uAngle)); vec2 texel = dir / uResolution * uRadius; vec3 acc = vec3(0.0); float count = max(1.0, uSamples); float halfC = floor(0.5*(count-1.0)); for (float i=-64.0;i<=64.0;i+=1.0){ if (i>halfC) break; if (-i>halfC) continue; vec2 offs = texel * i; acc += texture2D(tDiffuse, vUv + offs).rgb; } acc /= count; gl_FragColor = vec4(acc, 1.0); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat)) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) }, uAngle: { value: angle }, uRadius: { value: radius }, uSamples: { value: samples },
    }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, angle, radius, samples]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state) => {
    if (!materialRef.current) return;
    const w = (size && size.width) || effectiveW; const h = (size && size.height) || effectiveH; materialRef.current.uniforms.uResolution.value.set(Math.max(1,w), Math.max(1,h));
    materialRef.current.uniforms.uAngle.value = angle; materialRef.current.uniforms.uRadius.value = radius; materialRef.current.uniforms.uSamples.value = samples;
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


