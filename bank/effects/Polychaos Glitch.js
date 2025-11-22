// Super Crazy PolyChaos Glitch effect. Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'PolyChaos Glitch',
  description: 'A hyperactive combination of slice offsets, kaleidoscope/polar warps, RGB splits, block scatter, strobe/BPM sync, posterize and grain for extreme visuals.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'sliceCount', type: 'number', value: 32, min: 1, max: 128, step: 1 },
    { name: 'sliceChaos', type: 'number', value: 0.45, min: 0.0, max: 1.5, step: 0.01 },
    { name: 'sliceDirection', type: 'select', value: 'horizontal', options: [
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Vertical' }
    ]},
    { name: 'microShred', type: 'number', value: 0.06, min: 0.0, max: 0.3, step: 0.01 },
    { name: 'rgbSplit', type: 'number', value: 0.02, min: 0.0, max: 0.2, step: 0.001 },
    { name: 'kaleido', type: 'number', value: 6, min: 0, max: 12, step: 1 },
    { name: 'polarStrength', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'rotation', type: 'number', value: 0.4, min: -3.14, max: 3.14, step: 0.01 },
    { name: 'blockSize', type: 'number', value: 32, min: 1, max: 256, step: 1 },
    { name: 'blockScatter', type: 'number', value: 0.12, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'posterize', type: 'number', value: 12, min: 2, max: 64, step: 1 },
    { name: 'strobe', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'bpm', type: 'number', value: 120, min: 30, max: 300, step: 1 },
    { name: 'grain', type: 'number', value: 0.04, min: 0.0, max: 0.2, step: 0.001 },
    { name: 'seed', type: 'number', value: 0.13, min: 0.0, max: 10.0, step: 0.01 },
    { name: 'intensity', type: 'number', value: 1.0, min: 0.0, max: 3.0, step: 0.01 },
  ],
};

export default function PolyChaosGlitch({
  sliceCount = 32,
  sliceChaos = 0.45,
  sliceDirection = 'horizontal',
  microShred = 0.06,
  rgbSplit = 0.02,
  kaleido = 6,
  polarStrength = 0.35,
  rotation = 0.4,
  blockSize = 32,
  blockScatter = 0.12,
  posterize = 12,
  strobe = 0.0,
  bpm = 120,
  grain = 0.04,
  seed = 0.13,
  intensity = 1.0,
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0,0,64,64);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      for(let i=0;i<8;i+=2){
        ctx.strokeRect(4+i*2,4+i*2,56-i*4,56-i*4);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `
    varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `;

  const fragmentShader = `
    precision mediump float;
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float sliceCount;
    uniform float sliceChaos;
    uniform int sliceDirection;
    uniform float microShred;
    uniform float rgbSplit;
    uniform float kaleido;
    uniform float polarStrength;
    uniform float rotation;
    uniform float blockSize;
    uniform float blockScatter;
    uniform float posterize;
    uniform float strobe;
    uniform float bpm;
    uniform float grain;
    uniform float seed;
    uniform float intensity;
    uniform int inputIsSRGB;
    varying vec2 vUv;

    // helpers
    float PI = 3.141592653589793;
    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 78.233);
      return fract(p.x * p.y);
    }
    float noise(in vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
    }
    vec2 rotate(vec2 p, float a){
      float c = cos(a), s = sin(a);
      return vec2(p.x*c - p.y*s, p.x*s + p.y*c);
    }

    void main(){
      vec2 uv = vUv;
      // convert input colors if necessary
      // prepare time / beat
      float t = time + seed * 10.0;
      float beat = sin(t * (bpm * 0.5) * (PI / 60.0));
      float st = step(1.0 - strobe, (beat * 0.5 + 0.5)); // strobe on peaks when strobe>0

      // --- slice offset chaos ---
      float sc = max(1.0, sliceCount);
      if(sliceDirection == 0){
        float idx = floor(uv.y * sc);
        float sshift = sin(t * 1.2 + idx * 0.73 + seed * 3.1) * sliceChaos * (0.5 + 0.5*sin(seed*3.0 + idx));
        // slight rotation per slice mapped to uv center
        uv.x = fract(uv.x + sshift * 0.8 * intensity);
        // micro shred
        float m = noise(vec2(uv.x*200.0 + t*0.5, idx*12.0)) - 0.5;
        uv.y += m * microShred * (1.0 + 0.5*sin(idx*0.12 + t));
      } else {
        float idx = floor(uv.x * sc);
        float sshift = cos(t * 1.1 + idx * 0.63 + seed * 2.7) * sliceChaos * (0.5 + 0.5*cos(seed*2.0 + idx));
        uv.y = fract(uv.y + sshift * 0.8 * intensity);
        float m = noise(vec2(uv.y*200.0 + t*0.6, idx*9.0)) - 0.5;
        uv.x += m * microShred * (1.0 + 0.5*cos(idx*0.17 + t));
      }

      // --- block scatter (coarse tearing) ---
      vec2 res = vec2(1.0);
      vec2 cell = floor(uv * (res * blockSize));
      vec2 cellOff = vec2(hash(cell + seed), hash(cell.yx + seed*1.7)) - 0.5;
      uv += cellOff * blockScatter * intensity;

      // --- center & rotate ---
      vec2 p = uv - 0.5;
      p = rotate(p, rotation * (0.5 + 0.5*sin(t * 0.3)));
      float r = length(p);
      float a = atan(p.y, p.x);

      // --- kaleidoscope/polar ---
      float k = max(0.0, kaleido);
      if(k >= 1.0){
        float seg = max(1.0, k);
        a = mod(a, 2.0 * PI / seg);
        // fold to center for mirror like effect
        a = abs(a - (PI/seg));
        // polar strength push
        r = pow(r, 1.0 - polarStrength * 0.6);
      }
      vec2 polar = vec2(cos(a), sin(a)) * r;
      uv = polar + 0.5;

      // --- chromatic sampling with slight offsets and motion ---
      vec2 motion = vec2(sin(t*0.6)*0.002, cos(t*0.7)*0.002) * intensity;
      vec2 offR = vec2( rgbSplit * 1.0, -rgbSplit * 0.5 ) * (1.0 + 0.5*sin(t*1.3 + seed));
      vec2 offG = vec2( -rgbSplit * 0.6, rgbSplit * 0.9 ) * (1.0 + 0.6*cos(t*1.1 + seed*2.0));
      vec2 offB = vec2( rgbSplit * -0.4, -rgbSplit * 0.8 ) * (1.0 + 0.4*sin(t*0.9 + seed*1.3));

      vec4 cR = texture2D(tDiffuse, uv + offR + motion);
      vec4 cG = texture2D(tDiffuse, uv + offG + motion);
      vec4 cB = texture2D(tDiffuse, uv + offB + motion);

      vec3 col = vec3(cR.r, cG.g, cB.b);

      // --- posterize (color bands) ---
      float levels = max(2.0, posterize);
      col = floor(col * levels) / levels;

      // --- strobe/BPM driven brightness / cuts ---
      if(strobe > 0.001){
        float strength = mix(1.0, 0.0, st * strobe);
        col *= strength;
      } else {
        // gentle beat pulse
        float pulse = 1.0 + 0.12 * (beat * 0.5 + 0.5) * intensity;
        col *= pulse;
      }

      // --- final grain and vignette-ish boost ---
      float g = (hash(uv * (100.0 + seed*10.0)) - 0.5) * grain;
      col += g;

      // subtle vignette to center
      float vign = smoothstep(0.9, 0.3, length((vUv-0.5) * vec2(1.0, 1.0)));
      col *= mix(1.0, 0.8, vign * 0.6 * intensity);

      // clamp & convert from sRGB if necessary (many video/canvas textures are sRGB-ish)
      if(inputIsSRGB == 1){
        col = pow(col, vec3(2.2));
      }
      col = clamp(col, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || bufferTexture);
    return new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture }, time: { value: 0.0 },
        sliceCount: { value: sliceCount }, sliceChaos: { value: sliceChaos }, sliceDirection: { value: sliceDirection === 'horizontal' ? 0 : 1 },
        microShred: { value: microShred }, rgbSplit: { value: rgbSplit }, kaleido: { value: kaleido }, polarStrength: { value: polarStrength },
        rotation: { value: rotation }, blockSize: { value: blockSize }, blockScatter: { value: blockScatter }, posterize: { value: posterize },
        strobe: { value: strobe }, bpm: { value: bpm }, grain: { value: grain }, seed: { value: seed }, intensity: { value: intensity },
        inputIsSRGB: { value: 1 },
      },
      transparent: false, depthTest: false, depthWrite: false, toneMapped: false,
    });
  }, [videoTexture, bufferTexture, isGlobal, renderTarget, sliceCount, sliceChaos, sliceDirection, microShred, rgbSplit, kaleido, polarStrength, rotation, blockSize, blockScatter, posterize, strobe, bpm, grain, seed, intensity]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    mat.uniforms.time.value = state.clock.elapsedTime;
    // Sync parameters
    mat.uniforms.sliceCount.value = sliceCount;
    mat.uniforms.sliceChaos.value = sliceChaos;
    mat.uniforms.sliceDirection.value = sliceDirection === 'horizontal' ? 0 : 1;
    mat.uniforms.microShred.value = microShred;
    mat.uniforms.rgbSplit.value = rgbSplit;
    mat.uniforms.kaleido.value = kaleido;
    mat.uniforms.polarStrength.value = polarStrength;
    mat.uniforms.rotation.value = rotation;
    mat.uniforms.blockSize.value = blockSize;
    mat.uniforms.blockScatter.value = blockScatter;
    mat.uniforms.posterize.value = posterize;
    mat.uniforms.strobe.value = strobe;
    mat.uniforms.bpm.value = bpm;
    mat.uniforms.grain.value = grain;
    mat.uniforms.seed.value = seed;
    mat.uniforms.intensity.value = intensity;

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.clear(true, true, true); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (mat.uniforms.tDiffuse.value !== renderTarget.texture) {
        mat.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else {
      const nextTex = (videoTexture || bufferTexture);
      if (mat.uniforms.tDiffuse.value !== nextTex) {
        mat.uniforms.tDiffuse.value = nextTex;
      }
      const isSRGB = !!((nextTex && (nextTex.isVideoTexture || nextTex.isCanvasTexture)));
      mat.uniforms.inputIsSRGB.value = isSRGB ? 1 : 0;
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
