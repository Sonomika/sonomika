// Portable Spectral Swirl Warp effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Spectral Swirl Warp',
  description: 'Liquid swirl refraction with RGB dispersion, subtle scanlines, and occasional glitch streaks.',
  category: 'Video Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'swirl', type: 'number', value: 1.2, min: 0.0, max: 10.0, step: 0.01 },
    { name: 'curvature', type: 'number', value: 0.15, min: -0.5, max: 0.5, step: 0.005 },
    { name: 'dispersion', type: 'number', value: 0.007, min: 0.0, max: 0.05, step: 0.0005 },
    { name: 'warp', type: 'number', value: 0.02, min: 0.0, max: 0.2, step: 0.001 },
    { name: 'noiseScale', type: 'number', value: 8.0, min: 0.1, max: 32.0, step: 0.1 },
    { name: 'glitch', type: 'number', value: 0.2, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'scanlines', type: 'number', value: 0.3, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'speed', type: 'number', value: 0.35, min: -3.0, max: 3.0, step: 0.01 },
    { name: 'centerX', type: 'number', value: 0.5, min: 0.0, max: 1.0, step: 0.001 },
    { name: 'centerY', type: 'number', value: 0.5, min: 0.0, max: 1.0, step: 0.001 },
  ],
};

export default function SpectralSwirlWarp({
  videoTexture,
  isGlobal = false,
  swirl = 1.2,
  curvature = 0.15,
  dispersion = 0.007,
  warp = 0.02,
  noiseScale = 8.0,
  glitch = 0.2,
  scanlines = 0.3,
  speed = 0.35,
  centerX = 0.5,
  centerY = 0.5,
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
    if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; }
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
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [isGlobal, effectiveW, effectiveH]);

  useEffect(() => () => {
    try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {}
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
    uniform float uSwirl;
    uniform float uCurvature;
    uniform float uDispersion;
    uniform float uWarp;
    uniform float uNoiseScale;
    uniform float uGlitch;
    uniform float uScanlines;
    uniform float uSpeed;
    uniform vec2 uCenter;

    varying vec2 vUv;

    float hash(float n){ return fract(sin(n) * 43758.5453123); }
    float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p){
      float t = 0.0;
      float amp = 0.5;
      for (int i=0; i<4; i++){
        t += amp * noise(p);
        p = mat2(1.6, -1.2, 1.2, 1.6) * p + 0.5;
        amp *= 0.5;
      }
      return t;
    }

    vec2 barrel(vec2 uv, vec2 c, float k){
      vec2 d = uv - c;
      float r2 = dot(d, d);
      return c + d * (1.0 + k * r2);
    }

    vec2 swirl(vec2 uv, vec2 c, float a){
      vec2 d = uv - c;
      float r = length(d);
      float ang = atan(d.y, d.x) + a * r * r;
      return c + vec2(cos(ang), sin(ang)) * r;
    }

    void main(){
      vec2 uv = vUv;
      vec2 res = uResolution;
      vec2 center = uCenter;

      // Optical barrel distortion and swirl around the chosen center
      uv = barrel(uv, center, uCurvature);
      uv = swirl(uv, center, uSwirl);

      // Liquid warp via fbm displacement
      float tt = uTime * (0.5 + 0.5*sign(uSpeed)) * abs(uSpeed + 0.0001);
      float n = fbm(uv * uNoiseScale + vec2(0.0, tt));
      vec2 disp = (n - 0.5) * uWarp * vec2(1.0, -1.0);

      // Occasional horizontal glitch shifts per row
      float row = floor(vUv.y * res.y);
      float gA = step(0.985, hash(row + floor(tt * 60.0)));
      float gB = step(0.995, hash(row * 1.37 + floor(tt * 24.0)));
      float glitchMask = max(gA, gB) * uGlitch;
      float glitchShift = (hash(row + 3.14159) - 0.5) * glitchMask * 0.08; // up to ~8% width shift

      vec2 baseUV = uv + disp + vec2(glitchShift, 0.0);

      // Direction for spectral dispersion
      vec2 dir = normalize((uv - center) + 1e-6);
      vec2 offs = dir * uDispersion;

      // Clamp to avoid sampling outside
      vec2 uvR = clamp(baseUV + offs, 0.0, 1.0);
      vec2 uvG = clamp(baseUV, 0.0, 1.0);
      vec2 uvB = clamp(baseUV - offs, 0.0, 1.0);

      float r = texture2D(tDiffuse, uvR).r;
      float g = texture2D(tDiffuse, uvG).g;
      float b = texture2D(tDiffuse, uvB).b;
      vec3 col = vec3(r, g, b);

      // Subtle scanline modulation
      float sl = 0.5 + 0.5 * sin(6.2831853 * (vUv.y * res.y) + tt * 6.0);
      col *= mix(1.0, mix(0.92, 1.08, sl), uScanlines);

      // Gentle vignette around center
      float d = distance(vUv, center);
      float vign = smoothstep(0.85, 0.2, d);
      col *= mix(1.0, vign, 0.25);

      // Tiny grain for texture
      float grain = (hash21(vUv * res + vec2(tt, 1.234)) - 0.5) * 0.01;
      col += grain;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]), 1, 1, THREE.RGBAFormat)) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
      uTime: { value: 0.0 },
      uSwirl: { value: swirl },
      uCurvature: { value: curvature },
      uDispersion: { value: dispersion },
      uWarp: { value: warp },
      uNoiseScale: { value: noiseScale },
      uGlitch: { value: glitch },
      uScanlines: { value: scanlines },
      uSpeed: { value: speed },
      uCenter: { value: new THREE.Vector2(centerX, centerY) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), [
    videoTexture, isGlobal, renderTarget,
    effectiveW, effectiveH,
    swirl, curvature, dispersion, warp, noiseScale, glitch, scanlines, speed, centerX, centerY
  ]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const w = (size && size.width) || effectiveW;
    const h = (size && size.height) || effectiveH;
    materialRef.current.uniforms.uResolution.value.set(Math.max(1, w), Math.max(1, h));
    materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    materialRef.current.uniforms.uSwirl.value = swirl;
    materialRef.current.uniforms.uCurvature.value = curvature;
    materialRef.current.uniforms.uDispersion.value = dispersion;
    materialRef.current.uniforms.uWarp.value = warp;
    materialRef.current.uniforms.uNoiseScale.value = noiseScale;
    materialRef.current.uniforms.uGlitch.value = glitch;
    materialRef.current.uniforms.uScanlines.value = scanlines;
    materialRef.current.uniforms.uSpeed.value = speed;
    materialRef.current.uniforms.uCenter.value.set(centerX, centerY);

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
    }
  });

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;

  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef })
  );
}
