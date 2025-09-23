// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Posterize',
  description: 'Quantizes colors into discrete levels with gamma and saturation.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'levels', type: 'number', value: 6, min: 2, max: 32, step: 1 },
    { name: 'gamma', type: 'number', value: 1.0, min: 0.2, max: 3.0, step: 0.05 },
    { name: 'saturation', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.05 },
  ],
};

export default function PosterizeEffectExternal({ videoTexture, isGlobal = false, levels = 6, gamma = 1.0, saturation = 1.0, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform float uLevels; uniform float uGamma; uniform float uSaturation; varying vec2 vUv;
    vec3 adjustSaturation(vec3 color, float sat){ float l = dot(color, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), color, sat); }
    void main(){ vec3 col = texture2D(tDiffuse, vUv).rgb; col = pow(col, vec3(1.0 / max(0.001, uGamma))); col = adjustSaturation(col, uSaturation); vec3 q = floor(col * uLevels) / max(1.0, uLevels - 1.0); gl_FragColor = vec4(q, 1.0); }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat));
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: inputTexture }, uLevels: { value: levels }, uGamma: { value: gamma }, uSaturation: { value: saturation },
      }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
    });
  }, [videoTexture, isGlobal, renderTarget, levels, gamma, saturation]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uLevels.value = levels;
    materialRef.current.uniforms.uGamma.value = gamma;
    materialRef.current.uniforms.uSaturation.value = saturation;
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget(); const wasVisible = meshRef.current ? meshRef.current.visible : undefined; if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible!==undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspect = useMemo(() => { try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {} return effectiveW / effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}


