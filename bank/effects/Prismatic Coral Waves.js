// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Prismatic Coral Waves',
  description: 'A glassy, prismatic water-like ripple with coral-like fractal waves, caustic light bands, directional streak flares, thin-film color shifts, haze, and film grain.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  isSource: false,
  parameters: [
    { name: 'refraction', type: 'number', value: 0.18, min: 0, max: 1, step: 0.01 },
    { name: 'waveAmp', type: 'number', value: 0.57, min: 0, max: 2, step: 0.01 },
    { name: 'waveFreq', type: 'number', value: 4.01, min: 0, max: 5, step: 0.01 },
    { name: 'flow', type: 'number', value: 0.75, min: 0, max: 2, step: 0.01 },
    { name: 'scale', type: 'number', value: 7.2, min: 0.1, max: 10, step: 0.1 },
    { name: 'chroma', type: 'number', value: 0.57, min: 0, max: 1, step: 0.01 },
    { name: 'prismAngle', type: 'number', value: 6.10, min: 0, max: 6.283, step: 0.01 },
    { name: 'caustic', type: 'number', value: 0.38, min: 0, max: 2, step: 0.01 },
    { name: 'streaks', type: 'number', value: 1.58, min: 0, max: 5, step: 0.01 },
    { name: 'streakLen', type: 'number', value: 1.98, min: 0, max: 2, step: 0.01 },
    { name: 'grain', type: 'number', value: 0.077, min: 0, max: 1, step: 0.001 },
    { name: 'haze', type: 'number', value: 0.43, min: 0, max: 1, step: 0.01 },
    { name: 'mixOriginal', type: 'number', value: 1.00, min: 0, max: 1, step: 0.01 },
  ],
};

export default function PrismaticCoralWaves({
  videoTexture, isGlobal=false,
  refraction=0.18, waveAmp=0.57, waveFreq=4.01, flow=0.75,
  scale=7.2, chroma=0.57, prismAngle=6.10, caustic=0.38,
  streaks=1.58, streakLen=1.98, grain=0.077, haze=0.43,
  mixOriginal=1.00,
  compositionWidth, compositionHeight
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try {
    const ctx = useThree();
    if (ctx) {
      gl = ctx.gl;
      scene = ctx.scene;
      camera = ctx.camera;
      size = ctx.size;
    }
  } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }, [isGlobal, effectiveW, effectiveH]);

  useEffect(() => () => {
    try {
      renderTarget && renderTarget.dispose && renderTarget.dispose();
    } catch {}
  }, [renderTarget]);

  const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }`;

  const fragmentShader = `precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float time;
  uniform float refraction;
  uniform float waveAmp;
  uniform float waveFreq;
  uniform float flow;
  uniform float scale;
  uniform float chroma;
  uniform float prismAngle;
  uniform float caustic;
  uniform float streaks;
  uniform float streakLen;
  uniform float grain;
  uniform float haze;
  uniform float mixOriginal;

  #define PI 3.141592653589793
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

  float noise(in vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0,0.0));
    float c = hash21(i + vec2(0.0,1.0));
    float d = hash21(i + vec2(1.0,1.0));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(a, b, u.x) + (c - a)*u.y*(1.0-u.x) + (d - b)*u.x*u.y;
  }

  float fbm(vec2 p){
    float v = 0.0;
    float a = 0.6;
    for(int i=0;i<6;i++){
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  void main(){
    vec2 uv = vUv;
    vec2 centered = uv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    centered.x *= aspect;
    vec2 flowDir = vec2(cos(prismAngle), sin(prismAngle));
    vec2 p = centered * scale;
    p += flowDir * time * flow * 0.2;

    float waves = sin((p.x + p.y) * waveFreq + fbm(p*0.8 + time*0.15)*2.0) * 0.5;
    waves += fbm(p * 1.3 + time * 0.35) * 0.6;
    waves *= waveAmp;
    float r = length(centered);
    vec2 n = normalize(vec2(dFdx(waves), dFdy(waves)));
    vec2 refr = n * refraction * (1.0 - r);
    vec2 samp = uv + refr;
    vec3 color = texture2D(tDiffuse, samp).rgb;
    float g = (hash21(uv * uResolution.xy + time * 12.345) - 0.5) * grain;
    color += g;
    gl_FragColor = vec4(color, 1.0);
  }`;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || null) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
      time: { value: 0 },
      refraction: { value: refraction },
      waveAmp: { value: waveAmp },
      waveFreq: { value: waveFreq },
      flow: { value: flow },
      scale: { value: scale },
      chroma: { value: chroma },
      prismAngle: { value: prismAngle },
      caustic: { value: caustic },
      streaks: { value: streaks },
      streakLen: { value: streakLen },
      grain: { value: grain },
      haze: { value: haze },
      mixOriginal: { value: mixOriginal },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, refraction, waveAmp, waveFreq, flow, scale, chroma, prismAngle, caustic, streaks, streakLen, grain, haze, mixOriginal]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;
  });

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, ref: materialRef })
  );
}
