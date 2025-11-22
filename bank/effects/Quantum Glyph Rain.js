// Portable external GLYPH RAIN effect (no imports). Use with globals:
// window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};
const useThree = (r3f && r3f.useThree) || (() => null);
const useFrame = (r3f && r3f.useFrame) || (() => {});

export const metadata = {
  name: 'Quantum Glyph Rain',
  description: 'Procedural falling glyph streams with glow, refraction and chromatic drift over the input.',
  category: 'Video Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'characters', type: 'string', value: " .,:;+*?%#@MW" },
    { name: 'fontSize', type: 'number', value: 72, min: 8, max: 120, step: 1 },
    { name: 'cellSize', type: 'number', value: 28, min: 6, max: 64, step: 1 },
    { name: 'speed', type: 'number', value: 0.35, min: 0.02, max: 3, step: 0.01 },
    { name: 'density', type: 'number', value: 0.65, min: 0.1, max: 1.5, step: 0.01 },
    { name: 'glow', type: 'number', value: 0.8, min: 0, max: 2, step: 0.01 },
    { name: 'chromatic', type: 'number', value: 0.6, min: 0, max: 2, step: 0.01 },
    { name: 'refraction', type: 'number', value: 0.25, min: 0, max: 2, step: 0.01 },
    { name: 'foregroundIntensity', type: 'number', value: 0.9, min: 0, max: 1, step: 0.01 },
    { name: 'backgroundFade', type: 'number', value: 0.45, min: 0, max: 1, step: 0.01 },
    { name: 'tint', type: 'color', value: '#7fffd4' },
    { name: 'preserveColors', type: 'boolean', value: true },
    { name: 'tilt', type: 'number', value: 0.12, min: -0.5, max: 0.5, step: 0.01 },
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

export default function QuantumGlyphRain({
  videoTexture,
  characters = " .,:;+*?%#@MW",
  fontSize = 72,
  cellSize = 28,
  speed = 0.35,
  density = 0.65,
  glow = 0.8,
  chromatic = 0.6,
  refraction = 0.25,
  foregroundIntensity = 0.9,
  backgroundFade = 0.45,
  tint = '#7fffd4',
  preserveColors = true,
  tilt = 0.12,
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

  const effectiveChars = useMemo(() => (typeof characters === 'string' && characters.length > 0 ? characters : ' .'), [characters]);
  const nFontSize = useMemo(() => Math.max(8, Number.isFinite(+fontSize) ? +fontSize : 72), [fontSize]);
  const nCellSize = useMemo(() => Math.max(4, Number.isFinite(+cellSize) ? +cellSize : 28), [cellSize]);

  const nSpeed = useMemo(() => Math.max(0.001, Number(speed) || 0.35), [speed]);
  const nDensity = useMemo(() => Math.max(0.05, Number(density) || 0.65), [density]);
  const nGlow = useMemo(() => Math.max(0, Number(glow) || 0.8), [glow]);
  const nChrom = useMemo(() => Math.max(0, Number(chromatic) || 0.6), [chromatic]);
  const nRefract = useMemo(() => Math.max(0, Number(refraction) || 0.25), [refraction]);
  const nFg = useMemo(() => Math.min(1, Math.max(0, Number(foregroundIntensity) || 0.9)), [foregroundIntensity]);
  const nBgFade = useMemo(() => Math.min(1, Math.max(0, Number(backgroundFade) || 0.45)), [backgroundFade]);
  const nTilt = useMemo(() => Number(tilt) || 0, [tilt]);

  const normalizedTint = useMemo(() => normalizeColor(tint), [tint]);

  const createCharactersTexture = (chars, fs) => {
    const canvas = document.createElement('canvas');
    const SIZE = 1024; const MAX_PER_ROW = 16; const CELL = SIZE / MAX_PER_ROW;
    canvas.width = canvas.height = SIZE;
    const texture = new THREE.CanvasTexture(canvas, undefined, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestFilter);
    const ctx = canvas.getContext('2d'); if (!ctx) return texture;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.font = `${fs}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    for (let i = 0; i < chars.length; i++) {
      const x = i % MAX_PER_ROW; const y = Math.floor(i / MAX_PER_ROW);
      ctx.fillText(chars[i], x * CELL + CELL / 2, y * CELL + CELL / 2);
    }
    texture.needsUpdate = true; return texture;
  };

  const glyphTexture = useMemo(() => createCharactersTexture(effectiveChars, nFontSize), [effectiveChars, nFontSize]);
  useEffect(() => () => { try { glyphTexture && glyphTexture.dispose && glyphTexture.dispose(); } catch {} }, [glyphTexture]);

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
uniform sampler2D uGlyphs;
uniform float uGlyphCount;
uniform float uCellSize;
uniform float uSpeed;
uniform float uDensity;
uniform float uGlow;
uniform float uChromatic;
uniform float uRefraction;
uniform float uForeground;
uniform float uBgFade;
uniform float uPreserveColors;
uniform vec3 uTint;
uniform float uTilt;
uniform vec2 resolution;
uniform float uTime;
varying vec2 vUv;

const vec2 ATLAS = vec2(16.0, 16.0);

// Cheap hash for per-column randomness
float hash(float n){ return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// Small 2D noise
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Sample atlas with character index
vec4 sampleGlyph(float idx, vec2 inUv){
  float i = clamp(idx, 0.0, uGlyphCount - 1.0);
  vec2 cell = vec2(mod(i, ATLAS.x), floor(i / ATLAS.y));
  vec2 base = (cell + vec2(0.0, 1.0)) / ATLAS;
  vec2 uv = fract(inUv * ATLAS);
  uv.y = 1.0 - uv.y;
  uv += base;
  return texture2D(uGlyphs, uv);
}

// Luminance
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(){
  vec2 uv = vUv;

  // Screen space to pixel grid
  vec2 gridSize = resolution / uCellSize;
  vec2 grid = 1.0 / gridSize;
  // Apply a subtle tilt so columns lean
  uv.x += (uv.y - 0.5) * uTilt;

  // Pixelised lookup for the source
  vec2 pixUV = grid * (0.5 + floor(uv / grid));
  vec4 src = texture2D(inputBuffer, pixUV);

  // Column id and local cell uv
  vec2 cellId = floor(uv * gridSize);
  vec2 cellLocalUV = fract(uv * gridSize);

  // Each column has a random phase and drift
  float colSeed = cellId.x + 13.0 * floor(resolution.x / uCellSize);
  float wobble = noise(vec2(cellId.x * 0.123, uTime * 0.15)) * 0.6 + 0.4;

  // Head position for this column
  float head = fract(uTime * uSpeed * wobble + hash(colSeed));

  // Distance of this cell from head in wraparound space
  float y = cellId.y / gridSize.y;
  float d1 = abs(y - head);
  float d2 = 1.0 - d1;
  float dist = min(d1, d2);

  // Trail shape and density control
  float trailLen = mix(0.05, 0.6, clamp(uDensity, 0.0, 1.5));
  float core = smoothstep(0.0, 0.008, trailLen - dist);
  float glow = uGlow * smoothstep(trailLen, 0.0, dist);

  // Character choice blends source brightness with column hash
  float srcLum = luma(src.rgb);
  float charIdx = floor((uGlyphCount - 1.0) * clamp(mix(hash(cellId.x * 17.0 + cellId.y * 131.0), srcLum, 0.6), 0.0, 1.0));

  // Render glyph from atlas into the cell
  vec4 g = sampleGlyph(charIdx, cellLocalUV);
  float ink = g.r;

  // Foreground colour
  vec3 baseCol = mix(uTint, src.rgb, uPreserveColors);
  vec3 fg = baseCol * (0.35 + 0.65 * ink);

  // Glow halo by sampling ink at a slightly blurred coordinate
  vec2 blurUV = cellLocalUV + (vec2(0.5) - cellLocalUV) * 0.15;
  float halo = sampleGlyph(charIdx, blurUV).r * glow;

  // Chromatic drift and mild refraction over the background
  vec2 bend = (vec2(0.5) - uv) * 0.02 * uRefraction;
  vec2 aberr = normalize(vec2(uv - 0.5)) * 0.0015 * uChromatic;
  vec3 bg;
  bg.r = texture2D(inputBuffer, uv + bend + aberr).r;
  bg.g = texture2D(inputBuffer, uv + bend).g;
  bg.b = texture2D(inputBuffer, uv + bend - aberr).b;

  // Mix background and foreground
  float mask = clamp(core * uForeground + halo, 0.0, 1.0);
  vec3 colour = mix(bg * (1.0 - uBgFade), fg, mask);

  gl_FragColor = vec4(colour, 1.0);
}
`;

  const shaderMaterial = useMemo(() => {
    if (!glyphTexture) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat) },
        uGlyphs: { value: glyphTexture },
        uCellSize: { value: nCellSize },
        uGlyphCount: { value: Math.max(1, effectiveChars.length) },
        uSpeed: { value: nSpeed },
        uDensity: { value: nDensity },
        uGlow: { value: nGlow },
        uChromatic: { value: nChrom },
        uRefraction: { value: nRefract },
        uForeground: { value: nFg },
        uBgFade: { value: nBgFade },
        uPreserveColors: { value: preserveColors ? 1 : 0 },
        uTint: { value: new THREE.Color(normalizedTint) },
        uTilt: { value: nTilt },
        resolution: { value: new THREE.Vector2(Math.max(1, effectiveW), Math.max(1, effectiveH)) },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: frag,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
  }, [
    glyphTexture, nCellSize, effectiveChars.length, nSpeed, nDensity, nGlow, nChrom,
    nRefract, nFg, nBgFade, preserveColors, normalizedTint, nTilt, effectiveW, effectiveH
  ]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useEffect(() => {
    const mesh = meshRef.current; if (!mesh || !shaderMaterial) return; mesh.material = shaderMaterial;
  }, [shaderMaterial]);

  useEffect(() => { const m = materialRef.current; if (!m) return; m.uniforms.uGlyphs.value = glyphTexture; }, [glyphTexture]);

  useEffect(() => {
    const m = materialRef.current; if (!m) return;
    m.uniforms.uCellSize.value = nCellSize;
    m.uniforms.uGlyphCount.value = Math.max(1, effectiveChars.length);
    m.uniforms.uSpeed.value = nSpeed;
    m.uniforms.uDensity.value = nDensity;
    m.uniforms.uGlow.value = nGlow;
    m.uniforms.uChromatic.value = nChrom;
    m.uniforms.uRefraction.value = nRefract;
    m.uniforms.uForeground.value = nFg;
    m.uniforms.uBgFade.value = nBgFade;
    m.uniforms.uTint.value.set(normalizedTint);
    m.uniforms.uPreserveColors.value = preserveColors ? 1 : 0;
    m.uniforms.uTilt.value = nTilt;
  }, [nCellSize, effectiveChars.length, nSpeed, nDensity, nGlow, nChrom, nRefract, nFg, nBgFade, normalizedTint, preserveColors, nTilt]);

  useFrame(() => {
    const m = materialRef.current; if (!m || !shaderMaterial) return;
    const t = clock && typeof clock.getElapsedTime === 'function' ? clock.getElapsedTime() : performance.now() * 0.001;
    m.uniforms.uTime.value = t;
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

  if (!shaderMaterial || !glyphTexture) return null;
  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] })
  );
}
