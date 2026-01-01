// sonomika template - new effect
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Holographic Prism',
  description: 'Prismatic kaleidoscope with chromatic aberration, scanlines, grain and time-based glitch shifts. Works as a global post effect or on a single video texture.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'segments', type: 'number', value: 6, min: 1, max: 12, step: 1 },
    { name: 'chromatic', type: 'number', value: 0.02, min: 0.0, max: 0.2, step: 0.001 },
    { name: 'scanline', type: 'number', value: 0.25, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'grain', type: 'number', value: 0.06, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'bloom', type: 'number', value: 0.12, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'glitch', type: 'number', value: 0.18, min: 0.0, max: 0.6, step: 0.01 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.0, max: 4.0, step: 0.01 },
  ],
};

export default function HolographicPrism({
  videoTexture,
  isGlobal = false,
  segments = 6,
  chromatic = 0.02,
  scanline = 0.25,
  grain = 0.06,
  bloom = 0.12,
  glitch = 0.18,
  speed = 1.0,
  compositionWidth,
  compositionHeight,
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
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSegments;
    uniform float uChromatic;
    uniform float uScanline;
    uniform float uGrain;
    uniform float uBloom;
    uniform float uGlitch;
    uniform float uSpeed;
    varying vec2 vUv;

    // Hash / noise
    float hash12(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash12(i);
      float b = hash12(i + vec2(1.0, 0.0));
      float c = hash12(i + vec2(0.0, 1.0));
      float d = hash12(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    // Kaleidoscope transform about center
    vec2 kaleido(vec2 uv, float segments){
      vec2 p = uv - 0.5;
      float r = length(p);
      float ang = atan(p.y, p.x);
      float pi = 3.141592653589793;
      float sector = 2.0 * pi / max(1.0, segments);
      ang = mod(ang, sector);
      ang = abs(ang - sector * 0.5);
      vec2 q = vec2(cos(ang), sin(ang)) * r;
      return q + 0.5;
    }

    // Chromatic sampling with radial aberration
    vec3 chromaSample(sampler2D tex, vec2 uv, float chroma, float t){
      vec2 center = uv - 0.5;
      float r = length(center);
      // directional jitter driven by noise/time
      float jitter = noise(uv * 100.0 + t*0.5) * 0.5;
      vec2 off = normalize(center + vec2(0.0001)) * (chroma * (r + 0.05) * (0.5 + jitter));
      float rx = texture2D(tex, uv + off).r;
      float gy = texture2D(tex, uv).g; // sample green at center
      float bz = texture2D(tex, uv - off).b;
      return vec3(rx, gy, bz);
    }

    void main(){
      vec2 uv = vUv;

      // Time-scaled controls
      float t = uTime * uSpeed;

      // Apply subtle radial wobble (like a holographic shimmer)
      float wobble = sin(t * 1.2 + uv.y * 10.0) * 0.0025 * (1.0 + uGlitch*2.0);
      uv += vec2(cos(t*0.7 + uv.x*6.0)*wobble, sin(t*0.9 + uv.y*6.0)*wobble);

      // Glitch horizontal band shifts
      float g = noise(vec2(0.0, floor(uv.y * 200.0) * 0.01 + t*0.2));
      float bandShift = (g - 0.5) * uGlitch * 0.06;
      // make stronger occasional spikes
      float spike = step(0.95, noise(vec2(t*0.3, uv.y*50.0)));
      bandShift += spike * uGlitch * 0.12;
      uv.x += bandShift;

      // Kaleidoscope symmetry (centered)
      vec2 kUv = kaleido(uv, max(1.0, uSegments));

      // Chromatic sample
      vec3 color = chromaSample(tDiffuse, kUv, uChromatic, t);

      // Bloom-ish brighten on highlights
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      color += pow(max(lum - 0.65, 0.0), 2.0) * uBloom * 2.0;

      // Scanlines (subtle)
      float scan = sin((vUv.y * uResolution.y) * 1.5) * 0.5 + 0.5;
      color *= mix(1.0, scan, clamp(uScanline, 0.0, 1.0));

      // Grain
      float gr = (hash12(vUv * uResolution.xy + t * 10.0) - 0.5) * uGrain;
      color += gr;

      // Edge vignette blend for depth
      vec2 p = vUv - 0.5;
      float vig = smoothstep(0.9, 0.2, length(p)) ; // soft edge darkening
      color *= mix(1.0, vig, 0.3);

      // final clamp/tonemap
      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || null) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
      uTime: { value: 0 },
      uSegments: { value: segments },
      uChromatic: { value: chromatic },
      uScanline: { value: scanline },
      uGrain: { value: grain },
      uBloom: { value: bloom },
      uGlitch: { value: glitch },
      uSpeed: { value: speed },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, segments, chromatic, scanline, grain, bloom, glitch, speed]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    mat.uniforms.uResolution.value.set(Math.max(1, (size && size.width) || effectiveW), Math.max(1, (size && size.height) || effectiveH));
    mat.uniforms.uTime.value = state.clock.elapsedTime || 0;
    mat.uniforms.uSegments.value = segments;
    mat.uniforms.uChromatic.value = chromatic;
    mat.uniforms.uScanline.value = scanline;
    mat.uniforms.uGrain.value = grain;
    mat.uniforms.uBloom.value = bloom;
    mat.uniforms.uGlitch.value = glitch;
    mat.uniforms.uSpeed.value = speed;

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const was = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && was !== undefined) meshRef.current.visible = was;
      }
      if (mat.uniforms.tDiffuse.value !== renderTarget.texture) mat.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (mat.uniforms.tDiffuse.value !== videoTexture) mat.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspect = useMemo(() => {
    try {
      if (size && size.width > 0 && size.height > 0) return size.width / size.height;
    } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, ref: materialRef })
  );
}
