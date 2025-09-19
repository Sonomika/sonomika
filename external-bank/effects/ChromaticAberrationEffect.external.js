// Portable external Chromatic Aberration effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Chromatic Aberration (External)',
  description: 'Chromatic dispersion with displacement; single input texture.',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.1 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'dispScale', type: 'number', value: 2.0, min: 0.1, max: 10.0, step: 0.1 },
    { name: 'samples', type: 'number', value: 64, min: 8, max: 128, step: 8 },
    { name: 'contrast', type: 'number', value: 12.0, min: 1.0, max: 20.0, step: 0.5 },
  ],
};

export default function ChromaticAberrationExternal({ intensity = 1.0, speed = 1.0, dispScale = 2.0, samples = 64, contrast = 12.0, videoTexture }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
  const fragmentShader = `
    uniform float iTime; uniform vec3 iResolution; uniform float intensity; uniform float speed; uniform float dispScale; uniform float samples; uniform float contrast; uniform sampler2D iChannel0; varying vec2 vUv;
    vec3 sigmoidContrast(vec3 x, float k){ return 1.0 / (1.0 + exp(-k * (x - 0.5))); }
    vec3 weights(float i){ return vec3(i*i, 46.6666*pow((1.0-i)*i,3.0), (1.0-i)*(1.0-i)); }
    vec3 sampleDisp(vec2 uv, vec2 dir, float amt, float S){ vec3 col = vec3(0.0); float SD = 1.0 / S; float wl = 0.0; vec3 denom = vec3(0.0); for (int j=0;j<128;j++){ if (wl>=1.0) break; vec3 w = weights(wl); denom += w; col += w * texture2D(iChannel0, uv + dir * amt * wl).rgb; wl += SD; } return col / max(denom, vec3(1e-5)); }
    void main(){ vec2 uv=vUv; vec2 texel = 1.0 / iResolution.xy; vec2 n = vec2(0.0, texel.y); vec2 e = vec2(texel.x, 0.0); vec2 s = vec2(0.0, -texel.y); vec2 w = vec2(-texel.x, 0.0); vec2 d   = texture2D(iChannel0, uv).xy; vec2 d_n = texture2D(iChannel0, fract(uv+n)).xy; vec2 d_e = texture2D(iChannel0, fract(uv+e)).xy; vec2 d_s = texture2D(iChannel0, fract(uv+s)).xy; vec2 d_w = texture2D(iChannel0, fract(uv+w)).xy; vec2 db = 0.4*d + 0.15*(d_n+d_e+d_s+d_w); float ld = length(db); vec2 ln = normalize(db.xy + 1e-6); vec3 col = sampleDisp(uv, ln, dispScale * ld, samples); col = sigmoidContrast(col, contrast); gl_FragColor = vec4(col, 1.0); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      iTime: { value: 0.0 }, iResolution: { value: new THREE.Vector3(Math.max(1,size.width||1920), Math.max(1,size.height||1080), 1) }, intensity: { value: intensity }, speed: { value: speed }, dispScale: { value: dispScale }, samples: { value: samples }, contrast: { value: contrast }, iChannel0: { value: videoTexture },
    }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [size, intensity, speed, dispScale, samples, contrast, videoTexture]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.iTime.value = state.clock.elapsedTime * speed;
    const w = Math.max(1, state.gl?.domElement?.width || size.width || 1920);
    const h = Math.max(1, state.gl?.domElement?.height || size.height || 1080);
    materialRef.current.uniforms.iResolution.value.set(w, h, 1);
    // parameters remain synced via uniform refs; if needed, set again
    materialRef.current.uniforms.intensity.value = intensity;
    materialRef.current.uniforms.speed.value = speed;
    materialRef.current.uniforms.dispScale.value = dispScale;
    materialRef.current.uniforms.samples.value = samples;
    materialRef.current.uniforms.contrast.value = contrast;
  });

  const aspect = useMemo(() => { try { if (size && size.width>0 && size.height>0) return size.width/size.height; } catch {} return 16/9; }, [size]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, ref: materialRef }));
}


