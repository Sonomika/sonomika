// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'HSB Color Adjust',
  description: 'Adjust hue, saturation',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'hue', type: 'number', value: 0, min: -180, max: 180, step: 1 },
    { name: 'saturation', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'brightness', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.01 },
  ],
};

export default function HSBEffect({ hue = 0.0, saturation = 1.0, brightness = 1.0, videoTexture, isGlobal = false, compositionWidth, compositionHeight }) {
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
    uniform sampler2D tDiffuse; uniform float uHue; uniform float uSaturation; uniform float uBrightness; varying vec2 vUv;
    vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.0,-0.3333333333,0.6666666666,-1.0); vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g)); vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r)); float d = q.x - min(q.w,q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w-q.y)/(6.0*d+e)), d/(q.x+e), q.x); }
    vec3 hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(0.0,0.3333333333,0.6666666666))*6.0-3.0); return c.z * mix(vec3(1.0), clamp(p-1.0,0.0,1.0), c.y); }
    void main(){ vec4 color = texture2D(tDiffuse, vUv); vec3 hsv = rgb2hsv(color.rgb); float hueShift = uHue / 6.28318530718; hsv.x = fract(hsv.x + hueShift); hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0); hsv.z = clamp(hsv.z * uBrightness, 0.0, 1.0); vec3 rgb = hsv2rgb(hsv); gl_FragColor = vec4(rgb, color.a); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat)) },
      uHue: { value: (Math.max(-180, Math.min(180, hue)) * Math.PI) / 180.0 },
      uSaturation: { value: Math.max(0.0, Math.min(2.0, saturation)) },
      uBrightness: { value: Math.max(0.0, Math.min(2.0, brightness)) },
    }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, hue, saturation, brightness]),
  aspect = useMemo(() => { try { if (size && size.width>0 && size.height>0) return size.width / size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uHue.value = (Math.max(-180, Math.min(180, hue)) * Math.PI) / 180.0;
    materialRef.current.uniforms.uSaturation.value = Math.max(0.0, Math.min(2.0, saturation));
    materialRef.current.uniforms.uBrightness.value = Math.max(0.0, Math.min(2.0, brightness));
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget(); const wasVisible = meshRef.current ? meshRef.current.visible : undefined; if (meshRef.current) meshRef.current.visible=false; try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible!==undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}


