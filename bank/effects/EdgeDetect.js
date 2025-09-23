// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Edge Detect',
  description: 'Sobel edge detection with threshold and invert. Works as layer or global.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'strength', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'threshold', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'invert', type: 'boolean', value: false },
  ],
};

export default function EdgeDetectEffectExternal({ videoTexture, isGlobal = false, strength = 1.0, threshold = 0.0, invert = false, compositionWidth, compositionHeight }) {
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
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uStrength; uniform float uThreshold; uniform float uInvert; varying vec2 vUv;
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
      float gx = -tl - 2.0*l - bl + tr + 2.0*r + br; float gy =  tl + 2.0*t + tr - bl - 2.0*b - br; float g = length(vec2(gx, gy));
      g = max(0.0, g - uThreshold) * uStrength; float edge = clamp(g, 0.0, 1.0); if (uInvert > 0.5) edge = 1.0 - edge; gl_FragColor = vec4(vec3(edge), 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat));
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: inputTexture }, uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
        uStrength: { value: strength }, uThreshold: { value: threshold }, uInvert: { value: invert ? 1 : 0 },
      }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
    });
  }, [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, strength, threshold, invert]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame(() => {
    if (!materialRef.current) return;
    const w = (size && size.width) || effectiveW; const h = (size && size.height) || effectiveH;
    materialRef.current.uniforms.uResolution.value.set(Math.max(1,w), Math.max(1,h));
    materialRef.current.uniforms.uStrength.value = strength;
    materialRef.current.uniforms.uThreshold.value = threshold;
    materialRef.current.uniforms.uInvert.value = invert ? 1 : 0;
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


