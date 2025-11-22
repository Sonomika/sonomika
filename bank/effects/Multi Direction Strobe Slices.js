// MultiDirectionStrobeSlices.js
// Portable effect. Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Multi Direction Strobe Slices',
  description: 'Grid slices move in varied directions simultaneously and strobe individually.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'countX', type: 'number', value: 8, min: 1, max: 64, step: 1, description: 'Slices across' },
    { name: 'countY', type: 'number', value: 6, min: 1, max: 64, step: 1, description: 'Slices down' },
    { name: 'offsetAmount', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01, description: 'Max UV offset per slice' },
    { name: 'motionSpeed', type: 'number', value: 1.2, min: 0.0, max: 8.0, step: 0.05, description: 'Slice motion speed' },
    { name: 'strobeSpeed', type: 'number', value: 2.0, min: 0.0, max: 16.0, step: 0.05, description: 'Per slice strobe rate' },
    { name: 'strobeDuty', type: 'number', value: 0.5, min: 0.05, max: 0.95, step: 0.01, description: 'On fraction of strobe' },
    { name: 'directionMode', type: 'select', value: 'random', options: [
      { value: 'random', label: 'Random per slice' },
      { value: 'alternating', label: 'Alternating H/V' },
      { value: 'horizontal', label: 'All horizontal' },
      { value: 'vertical', label: 'All vertical' },
      { value: 'diag', label: 'Random diagonals' }
    ], description: 'How slice directions are chosen' },
    { name: 'removeGaps', type: 'boolean', value: true, description: 'Fill gaps rather than black' },
    { name: 'bpm', type: 'number', value: 120, min: 30, max: 300, step: 1, description: 'Optional tempo reference' },
    { name: 'tempoLink', type: 'boolean', value: false, description: 'Link strobe to BPM' },
    { name: 'seed', type: 'number', value: 1337, min: 0, max: 100000, step: 1, description: 'Random seed' },
  ],
};

export default function MultiDirectionStrobeSlices({
  countX = 8,
  countY = 6,
  offsetAmount = 0.35,
  motionSpeed = 1.2,
  strobeSpeed = 2.0,
  strobeDuty = 0.5,
  directionMode = 'random',
  removeGaps = true,
  bpm = 120,
  tempoLink = false,
  seed = 1337,
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

  // Fallback canvas texture if no input is wired
  const bufferTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#111'; ctx.fillRect(0,0,64,64);
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,32,32);
      ctx.fillStyle = '#888'; ctx.fillRect(32,32,32,32);
    }
    const tex = new THREE.CanvasTexture(c);
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
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // Fragment shader:
  // - Partitions the frame into countX by countY cells.
  // - Chooses a direction per cell according to directionMode and a hash of the cell id and seed.
  // - Applies a sinusoidal offset to UVs along that direction.
  // - Computes an independent hard strobe per cell with random phase.
  // - Optionally fills gaps or leaves black using removeGaps.
  // Inspired by your VideoSliceOffset structure for uniforms and sRGB handling. :contentReference[oaicite:1]{index=1}
  const fragmentShader = `
    precision highp float;

    varying vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform float time;

    uniform float countX;
    uniform float countY;
    uniform float offsetAmount;
    uniform float motionSpeed;

    uniform float strobeSpeed;
    uniform float strobeDuty;
    uniform float bpm;
    uniform int tempoLink;

    uniform int directionMode; // 0 random, 1 alternating, 2 all H, 3 all V, 4 random diagonals
    uniform float removeGaps;
    uniform float seedU;

    uniform int inputIsSRGB;

    // Hash utilities
    float hash11(float p) {
      // Small hash, stable across GPUs
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }
    vec2 hash21(float p) {
      float x = hash11(p + 17.0);
      float y = hash11(p + 53.0);
      return vec2(x, y);
    }

    // Choose direction unit vector per cell
    vec2 pickDirection(float cellId) {
      if (directionMode == 2) return vec2(1.0, 0.0);
      if (directionMode == 3) return vec2(0.0, 1.0);
      if (directionMode == 1) {
        // alternating by id
        return mod(cellId, 2.0) < 1.0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      }
      vec2 r = hash21(cellId + seedU * 0.123);
      if (directionMode == 4) {
        // random diagonal, use 4-way diagonals
        float pick = floor(r.x * 4.0);
        if (pick < 1.0) return normalize(vec2(1.0, 1.0));
        else if (pick < 2.0) return normalize(vec2(-1.0, 1.0));
        else if (pick < 3.0) return normalize(vec2(1.0, -1.0));
        else return normalize(vec2(-1.0, -1.0));
      }
      // default random axis
      return (r.x < 0.5) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    }

    // Hard strobe with random phase per cell
    float cellStrobe(float cellId, float t) {
      float phase = hash11(cellId + seedU * 1.73) * 6.2831853;
      float freq = tempoLink == 1 ? max(0.0, bpm) / 60.0 : strobeSpeed;
      float wave = 0.5 + 0.5 * sin((t * freq) * 6.2831853 + phase);
      // Threshold for duty cycle
      return step(1.0 - strobeDuty, wave);
    }

    // Repeat uv within a cell and keep track of which cell we are in
    vec2 repeatCell(vec2 uv, float cx, float cy, out vec2 cellIndex) {
      vec2 scaled = uv * vec2(cx, cy);
      cellIndex = floor(scaled);
      return fract(scaled);
    }

    void main() {
      // Identify the cell
      vec2 cellIdx;
      vec2 uvCell = repeatCell(vUv, countX, countY, cellIdx);
      float cellId = cellIdx.y * countX + cellIdx.x;

      // Choose motion direction for this cell
      vec2 dir = pickDirection(cellId);
      // Periodic offset inside this cell space
      float phase = hash11(cellId + seedU * 2.91) * 6.2831853;
      float shift = sin(time * motionSpeed + phase) * offsetAmount;

      // Apply offset along direction inside the cell
      vec2 uvMoved = uvCell + dir * shift;

      // Optional gap fill: either wrap inside cell or let black through
      // If removeGaps > 0.5, wrap with fract. Otherwise, keep uvMoved as is and mask outside 0..1
      vec2 uvFetch;
      float visible = 1.0;
      if (removeGaps > 0.5) {
        uvFetch = fract(uvMoved);
      } else {
        uvFetch = uvMoved;
        vec2 inRange = step(vec2(0.0), uvMoved) * step(uvMoved, vec2(1.0));
        visible = inRange.x * inRange.y;
      }

      // Recompose to full-frame UVs
      vec2 uvFull = (cellIdx + uvFetch) / vec2(countX, countY);

      vec4 col = texture2D(tDiffuse, uvFull);
      if (inputIsSRGB == 1) {
        col.rgb = pow(col.rgb, vec3(2.2));
      }

      // Independent hard strobe per cell
      float on = cellStrobe(cellId, time);
      col.rgb *= on * visible;

      col.a = 1.0;
      gl_FragColor = col;
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || bufferTexture);
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture },
        time: { value: 0.0 },

        countX: { value: countX },
        countY: { value: countY },
        offsetAmount: { value: offsetAmount },
        motionSpeed: { value: motionSpeed },

        strobeSpeed: { value: strobeSpeed },
        strobeDuty: { value: strobeDuty },
        bpm: { value: bpm },
        tempoLink: { value: tempoLink ? 1 : 0 },

        directionMode: { value: ({ random:0, alternating:1, horizontal:2, vertical:3, diag:4 }[directionMode] ?? 0) },
        removeGaps: { value: removeGaps ? 1.0 : 0.0 },
        seedU: { value: seed },

        inputIsSRGB: { value: 1 },
      },
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }, [videoTexture, bufferTexture, isGlobal, renderTarget, countX, countY, offsetAmount, motionSpeed, strobeSpeed, strobeDuty, bpm, tempoLink, directionMode, removeGaps, seed]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;

    // Keep uniforms synced with live params
    materialRef.current.uniforms.countX.value = countX;
    materialRef.current.uniforms.countY.value = countY;
    materialRef.current.uniforms.offsetAmount.value = offsetAmount;
    materialRef.current.uniforms.motionSpeed.value = motionSpeed;

    materialRef.current.uniforms.strobeSpeed.value = strobeSpeed;
    materialRef.current.uniforms.strobeDuty.value = strobeDuty;
    materialRef.current.uniforms.bpm.value = bpm;
    materialRef.current.uniforms.tempoLink.value = tempoLink ? 1 : 0;

    materialRef.current.uniforms.directionMode.value = ({ random:0, alternating:1, horizontal:2, vertical:3, diag:4 }[directionMode] ?? 0);
    materialRef.current.uniforms.removeGaps.value = removeGaps ? 1.0 : 0.0;
    materialRef.current.uniforms.seedU.value = seed;

    // Input source maintenance, including global capture pass
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else {
      const nextTex = (videoTexture || bufferTexture);
      if (materialRef.current.uniforms.tDiffuse.value !== nextTex) {
        materialRef.current.uniforms.tDiffuse.value = nextTex;
      }
      const isSRGB = !!(nextTex && (nextTex.isVideoTexture || nextTex.isCanvasTexture));
      materialRef.current.uniforms.inputIsSRGB.value = isSRGB ? 1 : 0;
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
