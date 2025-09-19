// Portable external DATA GLITCH effect (no imports). Use with globals:
// window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};
const useThree = (r3f && r3f.useThree) || (() => null);
const useFrame = (r3f && r3f.useFrame) || (() => {});

export const metadata = {
  name: 'Spectral DataGlitch (External)',
  description: 'Blocky temporal tears, scanlines and spectral drift. Designed to sit on top of an input stream.',
  category: 'Video Effects',
  author: 'You',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'glitchStrength', type: 'number', value: 0.55, min: 0, max: 2, step: 0.01 },
    { name: 'blockSize', type: 'number', value: 24, min: 4, max: 128, step: 1 },
    { name: 'rowJitter', type: 'number', value: 0.8, min: 0, max: 2, step: 0.01 },
    { name: 'chromatic', type: 'number', value: 0.9, min: 0, max: 2, step: 0.01 },
    { name: 'refraction', type: 'number', value: 0.2, min: 0, max: 2, step: 0.01 },
    { name: 'scanlines', type: 'number', value: 0.35, min: 0, max: 1, step: 0.01 },
    { name: 'dropout', type: 'number', value: 0.1, min: 0, max: 1, step: 0.01 },
    { name: 'desaturate', type: 'number', value: 0.2, min: 0, max: 1, step: 0.01 },
    { name: 'tint', type: 'color', value: '#8fffe0' },
    { name: 'tintAmount', type: 'number', value: 0.25, min: 0, max: 1, step: 0.01 },
    { name: 'preserveColors', type: 'boolean', value: true },
    { name: 'rollSpeed', type: 'number', value: 0.12, min: 0, max: 1, step: 0.001 },
    { name: 'timeScale', type: 'number', value: 1.0, min: 0.1, max: 3, step: 0.01 },
  ],
};

function normalizeColor(input) {
  try {
    if (typeof input === 'string') {
      if (input.startsWith('#')) return input;
      if (input.startsWith('rgb')) {
        const m = input.match(/rgba?\(([^)]+)\)/i);
        if (m) {
          const [r, g, b] = m[1].split(',').map((p) => parseFloat(p.trim()));
          const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
      }
      const c = new THREE.Color(input);
      return `#${c.getHexString()}`;
    }
  } catch {}
  return '#ffffff';
}

export default function SpectralDataGlitchExternal({
  videoTexture,
  glitchStrength = 0.55,
  blockSize = 24,
  rowJitter = 0.8,
  chromatic = 0.9,
  refraction = 0.2,
  scanlines = 0.35,
  dropout = 0.1,
  desaturate = 0.2,
  tint = '#8fffe0',
  tintAmount = 0.25,
  preserveColors = true,
  rollSpeed = 0.12,
  timeScale = 1.0,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;

  const effectiveW = compositionWidth || 1920;
  const effectiveH = compositionHeight || 1080;

  const meshRef = useRef(null);
  const materialRef = useRef(null);
  let gl, scene, camera, size, clock;
  try {
    const ctx = useThree();
    if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; clock = ctx.clock; }
  } catch {}

  const nBlock = useMemo(() => Math.max(4, Number(blockSize) || 24), [blockSize]);
  const nGlitch = useMemo(() => Math.max(0, Number(glitchStrength) || 0.55), [glitchStrength]);
  const nRowJ = useMemo(() => Math.max(0, Number(rowJitter) || 0.8), [rowJitter]);
  const nChrom = useMemo(() => Math.max(0, Number(chromatic) || 0.9), [chromatic]);
  const nRefract = useMemo(() => Math.max(0, Number(refraction) || 0.2), [refraction]);
  const nScan = useMemo(() => Math.min(1, Math.max(0, Number(scanlines) || 0.35)), [scanlines]);
  const nDrop = useMemo(() => Math.min(1, Math.max(0, Number(dropout) || 0.1)), [dropout]);
  const nDesat = useMemo(() => Math.min(1, Math.max(0, Number(desaturate) || 0.2)), [desaturate]);
  const nTintAmt = useMemo(() => Math.min(1, Math.max(0, Number(tintAmount) || 0.25)), [tintAmount]);
  const nRoll = useMemo(() => Math.max(0, Number(rollSpeed) || 0.12), [rollSpeed]);
  const nTimeScale = useMemo(() => Math.max(0.01, Number(timeScale) || 1.0), [timeScale]);
  const normalizedTint = useMemo(() => normalizeColor(tint), [tint]);

  const renderTarget = useMemo(() => {
    if (isGlobal) {
      return new THREE.WebGLRenderTarget(
        Math.max(1, effectiveW), Math.max(1, effectiveH),
        { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
      );
    }
    return null;
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const frag = `
uniform sampler2D inputBuffer;
uniform vec2 resolution;
uniform float uTime;
uniform float uGlitch;
uniform float uBlock;
uniform float uRowJitter;
uniform float uChromatic;
uniform float uRefraction;
uniform float uScanlines;
uniform float uDropout;
uniform float uDesat;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uPreserveColors;
uniform float uRoll;

varying vec2 vUv;

float hash11(float p){ return fract(sin(p*91.3453)*43758.543123); }
float hash12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453123); }

float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// Cheap block noise
float blockNoise(vec2 uv, float scale){
  vec2 g = floor(uv * scale);
  return hash12(g);
}

// Horizontal tear offset per scan row
float rowOffset(float row, float t){
  float h = hash11(row*1.123 + floor(t*7.0)*13.37);
  float burst = step(0.85, hash11(floor(t*2.0)+row*0.001)) * (0.2 + 0.8*h);
  float wob = sin(t*3.7 + row*0.013)*0.5 + 0.5;
  return (h - 0.5) * 0.002 + burst*0.03 + wob*0.0015;
}

// Quantise to block grid
vec2 blockify(vec2 uv, float px){
  vec2 grid = resolution / px;
  return (floor(uv * grid) + 0.5) / grid;
}

// Subtle refraction based on local contrast
vec2 refractUV(vec2 uv, float amt){
  vec2 o = vec2(1.0) / resolution;
  float a = luma(texture2D(inputBuffer, uv + vec2(o.x, 0.0)).rgb);
  float b = luma(texture2D(inputBuffer, uv - vec2(o.x, 0.0)).rgb);
  float c = luma(texture2D(inputBuffer, uv + vec2(0.0, o.y)).rgb);
  float d = luma(texture2D(inputBuffer, uv - vec2(0.0, o.y)).rgb);
  vec2 grad = vec2(a - b, c - d);
  return uv + grad * amt;
}

void main(){
  vec2 uv = vUv;

  // Vertical roll
  uv.y = fract(uv.y + uRoll);

  // Decide when a heavy glitch hits
  float beat = step(0.92, hash11(floor(uTime*1.25)));
  float localPunch = mix(0.0, 1.0, beat);

  // Row wise horizontal jitter
  float rows = resolution.y;
  float rowId = floor(uv.y * rows);
  float jitter = uRowJitter * rowOffset(rowId, uTime) * (0.5 + 0.5*uGlitch) * (0.5 + 0.5*localPunch);
  uv.x = fract(uv.x + jitter);

  // Block quantisation and temporal slip
  float px = uBlock;
  vec2 buv = blockify(uv, px);
  float slip = blockNoise(buv + uTime, 64.0) - 0.5;
  buv.x = fract(buv.x + slip * 0.15 * uGlitch);

  // Dropout mask
  float dropMask = step(uDropout, blockNoise(buv * resolution, 0.25 + 4.0*uGlitch));
  
  // Base sample with refraction
  vec2 bend = (vec2(0.5) - uv) * 0.02 * uRefraction;
  vec2 rUV = refractUV(buv + bend, 0.003 * uRefraction);

  // Spectral channel drift
  vec2 dir = normalize(vec2(uv - 0.5) + 0.0001);
  vec2 aberr = dir * (0.001 + 0.004 * uChromatic * (0.25 + 0.75*localPunch));

  vec3 col;
  col.r = texture2D(inputBuffer, rUV + aberr).r;
  col.g = texture2D(inputBuffer, rUV).g;
  col.b = texture2D(inputBuffer, rUV - aberr).b;

  // Harsh block mixing during heavy hits
  vec3 hard = texture2D(inputBuffer, blockify(uv, px * (0.6 + 0.8*uGlitch))).rgb;
  col = mix(col, hard, 0.35 * uGlitch + 0.4 * localPunch);

  // Scanlines
  float sl = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
  col *= 1.0 - uScanlines * (0.35 + 0.65*sl);

  // Desaturate
  float Y = luma(col);
  col = mix(vec3(Y), col, 1.0 - uDesat);

  // Tint
  vec3 tinted = mix(col, col * uTint, 0.0); // guard
  tinted = mix(col, col * uTint, uTintAmt);
  if (uPreserveColors < 0.5) {
    tinted = mix(vec3(Y), vec3(Y) * uTint, uTintAmt);
  }
  col = tinted;

  // Row dropout
  float rdrop = step(0.97, hash11(rowId + floor(uTime*11.0)));
  col *= mix(1.0, 0.0, rdrop * uDropout);

  // Final vignette to reduce edges during heavy glitch
  float vig = smoothstep(0.0, 0.6, 1.0 - length(uv - 0.5) * 1.25);
  col *= mix(1.0, vig, 0.25 * uGlitch + 0.25 * localPunch);

  gl_FragColor = vec4(col * dropMask, 1.0);
}
`;

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat) },
        resolution: { value: new THREE.Vector2(Math.max(1, effectiveW), Math.max(1, effectiveH)) },
        uTime: { value: 0 },
        uGlitch: { value: nGlitch },
        uBlock: { value: nBlock },
        uRowJitter: { value: nRowJ },
        uChromatic: { value: nChrom },
        uRefraction: { value: nRefract },
        uScanlines: { value: nScan },
        uDropout: { value: nDrop },
        uDesat: { value: nDesat },
        uTint: { value: new THREE.Color(normalizedTint) },
        uTintAmt: { value: nTintAmt },
        uPreserveColors: { value: preserveColors ? 1 : 0 },
        uRoll: { value: nRoll },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: frag,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
  }, [effectiveW, effectiveH, nGlitch, nBlock, nRowJ, nChrom, nRefract, nScan, nDrop, nDesat, normalizedTint, nTintAmt, preserveColors, nRoll]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useEffect(() => {
    const mesh = meshRef.current; if (!mesh || !shaderMaterial) return; mesh.material = shaderMaterial;
  }, [shaderMaterial]);

  useEffect(() => {
    const m = materialRef.current; if (!m) return;
    m.uniforms.uBlock.value = nBlock;
    m.uniforms.uGlitch.value = nGlitch;
    m.uniforms.uRowJitter.value = nRowJ;
    m.uniforms.uChromatic.value = nChrom;
    m.uniforms.uRefraction.value = nRefract;
    m.uniforms.uScanlines.value = nScan;
    m.uniforms.uDropout.value = nDrop;
    m.uniforms.uDesat.value = nDesat;
    m.uniforms.uTint.value.set(normalizedTint);
    m.uniforms.uTintAmt.value = nTintAmt;
    m.uniforms.uPreserveColors.value = preserveColors ? 1 : 0;
    m.uniforms.uRoll.value = nRoll;
  }, [nBlock, nGlitch, nRowJ, nChrom, nRefract, nScan, nDrop, nDesat, normalizedTint, nTintAmt, preserveColors, nRoll]);

  useFrame(() => {
    const m = materialRef.current; if (!m || !shaderMaterial) return;
    const t0 = clock && typeof clock.getElapsedTime === 'function' ? clock.getElapsedTime() : performance.now() * 0.001;
    m.uniforms.uTime.value = t0 * nTimeScale;

    if (isGlobal && renderTarget && gl && scene && camera) {
      const currentRT = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(currentRT); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (m.uniforms.inputBuffer.value !== renderTarget.texture) m.uniforms.inputBuffer.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (m.uniforms.inputBuffer.value !== videoTexture) m.uniforms.inputBuffer.value = videoTexture;
    }
  });

  useEffect(() => {
    const m = materialRef.current; if (!m) return;
    m.uniforms.resolution.value.set(Math.max(1, effectiveW), Math.max(1, effectiveH));
    if (isGlobal && renderTarget) renderTarget.setSize(Math.max(1, effectiveW), Math.max(1, effectiveH));
  }, [effectiveW, effectiveH, isGlobal, renderTarget]);

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] })
  );
}