// SliceRotateGrid.js
// Portable effect. Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Slice Rotate Grid',
  description: 'Partition the image into a grid and rotate each slice independently (oscillate/continuous/alternating). Optional per-slice strobe and gap handling.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'countX', type: 'number', value: 8, min: 1, max: 64, step: 1, description: 'Slices across' },
    { name: 'countY', type: 'number', value: 6, min: 1, max: 64, step: 1, description: 'Slices down' },

    // Rotation controls
    { name: 'rotationAmount', type: 'number', value: 30, min: 0, max: 180, step: 1, description: 'Rotation amplitude in degrees (peak for oscillation; scale for continuous)' },
    { name: 'rotationSpeed', type: 'number', value: 0.5, min: 0.0, max: 8.0, step: 0.01, description: 'Rotation speed in Hz' },
    { name: 'rotationMode', type: 'select', value: 'oscillate', options: [
      { value: 'oscillate', label: 'Oscillate (sine)' },
      { value: 'continuous', label: 'Continuous spin' },
      { value: 'randomOsc', label: 'Random-phase oscillate' },
      { value: 'alternating', label: 'Alternating direction' },
      { value: 'syncStrobe', label: 'Synced to strobe' },
    ], description: 'How each slice rotates' },

    // Internal scaling to avoid corners being clipped when rotating
    { name: 'sliceScale', type: 'number', value: 1.0, min: 0.5, max: 2.0, step: 0.01, description: 'Scale applied inside each slice before rotating (1 = no scale). >1 zooms in to hide corners.' },

    // Gaps and fill
    { name: 'removeGaps', type: 'boolean', value: true, description: 'Wrap slice UVs to avoid empty corners when rotation moves pixels outside; disables leaves those areas black' },

    // Strobe (per-slice)
    { name: 'useStrobe', type: 'boolean', value: true, description: 'Enable per-slice hard strobe' },
    { name: 'strobeSpeed', type: 'number', value: 2.0, min: 0.0, max: 16.0, step: 0.05, description: 'Per-slice strobe rate (Hz)' },
    { name: 'strobeDuty', type: 'number', value: 0.5, min: 0.05, max: 0.95, step: 0.01, description: 'On fraction of strobe' },

    // Tempo link
    { name: 'bpm', type: 'number', value: 120, min: 30, max: 300, step: 1, description: 'Tempo for tempo-linked features' },
    { name: 'tempoLink', type: 'boolean', value: false, description: 'Link strobe speed to BPM' },

    { name: 'seed', type: 'number', value: 1337, min: 0, max: 100000, step: 1, description: 'Random seed' },
  ],
};

export default function SliceRotateGrid({
  countX = 8,
  countY = 6,
  rotationAmount = 30,
  rotationSpeed = 0.5,
  rotationMode = 'oscillate',
  sliceScale = 1.0,
  removeGaps = true,
  useStrobe = true,
  strobeSpeed = 2.0,
  strobeDuty = 0.5,
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
      ctx.fillStyle = '#101010'; ctx.fillRect(0,0,64,64);
      ctx.fillStyle = '#66bbff'; ctx.fillRect(8,8,48,48);
      ctx.fillStyle = '#111'; ctx.fillRect(20,20,24,24);
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

  // Fragment shader implements:
  // - Partition into a grid of countX x countY
  // - For each cell compute a rotation angle (oscillate, continuous, alternating, random-phase)
  // - Rotate the local UV inside the cell around its center, optionally scale prior to rotation to hide corners
  // - Optional wrapping (removeGaps) or masking outside 0..1
  // - Optional per-slice hard strobe (with tempo link)
  const fragmentShader = `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform float time;

    uniform float countX;
    uniform float countY;

    uniform float rotationAmountDeg; // degrees amplitude or scale
    uniform float rotationSpeed; // Hz
    uniform int rotationMode; // 0 oscillate, 1 continuous, 2 randomOscillate, 3 alternating, 4 syncStrobe
    uniform float sliceScale;

    uniform float removeGaps;

    uniform float useStrobe;
    uniform float strobeSpeed;
    uniform float strobeDuty;
    uniform float bpm;
    uniform int tempoLink;

    uniform float seedU;
    uniform int inputIsSRGB;

    // small stable hash
    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }
    vec2 hash21(float p) {
      return vec2(hash11(p + 1.0), hash11(p + 37.0));
    }

    // repeat uv into cells and return local uv inside 0..1 and integer cell index
    vec2 repeatCell(vec2 uv, float cx, float cy, out vec2 cellIndex) {
      vec2 scaled = uv * vec2(cx, cy);
      cellIndex = floor(scaled);
      return fract(scaled);
    }

    // Rotate a point around center (0.5,0.5) with scale applied before rotation
    vec2 rotateInCell(vec2 uvLocal, float angle, float scale) {
      // move to center
      vec2 p = uvLocal - 0.5;
      p *= scale;
      float c = cos(angle);
      float s = sin(angle);
      mat2 R = mat2(c, -s, s, c);
      p = R * p;
      return p + 0.5;
    }

    // Per-cell strobe (hard threshold)
    float cellStrobe(float cellId, float t) {
      float phase = hash11(cellId + seedU * 2.57) * 6.2831853;
      float freq = (tempoLink == 1) ? max(0.0, bpm) / 60.0 : strobeSpeed;
      float w = 0.5 + 0.5 * sin((t * freq) * 6.2831853 + phase);
      return step(1.0 - strobeDuty, w);
    }

    void main() {
      vec2 cellIdx;
      vec2 uvLocal = repeatCell(vUv, countX, countY, cellIdx);
      float cellId = cellIdx.y * countX + cellIdx.x;

      // get per-cell randomness
      float h = hash11(cellId + seedU * 0.314);
      vec2 h2 = hash21(cellId + seedU * 0.77);

      // rotation amplitude in radians
      float amp = radians(rotationAmountDeg);

      float angle = 0.0;

      if (rotationMode == 0) {
        // oscillate all with same phase (but different amplitude sign by cell seed)
        float dir = (h < 0.5) ? 1.0 : -1.0;
        angle = dir * amp * sin(time * rotationSpeed * 6.2831853);
      } else if (rotationMode == 1) {
        // continuous spin: angle increases with time. direction chosen per cell or uniform.
        float dir = (h < 0.5) ? 1.0 : -1.0;
        // rotationSpeed in Hz => cycles per second => *2pi => radians per second
        angle = time * rotationSpeed * 6.2831853 * dir * (rotationAmountDeg / 360.0);
        // rotationAmountDeg acts as fraction of full rotation per cycle (scale)
      } else if (rotationMode == 2) {
        // random-phase oscillate: each cell has random phase offset
        float phase = h2.x * 6.2831853;
        angle = amp * sin(time * rotationSpeed * 6.2831853 + phase);
      } else if (rotationMode == 3) {
        // alternating by grid parity
        float parity = mod(cellIdx.x + cellIdx.y, 2.0);
        float dir = (parity < 0.5) ? 1.0 : -1.0;
        angle = dir * amp * sin(time * rotationSpeed * 6.2831853);
      } else if (rotationMode == 4) {
        // sync to strobe: rotate when strobe is on, otherwise 0. quick step motion rather than smooth
        float on = cellStrobe(cellId, time);
        // make a stepped rotation amount based on another hash-based offset
        float stepPhase = floor(h2.y * 4.0);
        angle = (on > 0.5) ? amp * (0.25 + stepPhase * 0.25) : 0.0;
      } else {
        // fallback to a small oscillation
        angle = amp * sin(time * rotationSpeed * 6.2831853);
      }

      // Apply scale & rotation inside cell
      vec2 uvRot = rotateInCell(uvLocal, angle, sliceScale);

      // handle gaps: wrap or mask
      vec2 uvFetch;
      float visible = 1.0;
      if (removeGaps > 0.5) {
        uvFetch = fract(uvRot);
      } else {
        uvFetch = uvRot;
        vec2 inRange = step(vec2(0.0), uvRot) * step(uvRot, vec2(1.0));
        visible = inRange.x * inRange.y;
      }

      vec2 uvFull = (cellIdx + uvFetch) / vec2(countX, countY);

      vec4 col = texture2D(tDiffuse, uvFull);
      if (inputIsSRGB == 1) {
        // approximate linearization for sRGB-like inputs
        col.rgb = pow(col.rgb, vec3(2.2));
      }

      // optional strobe per cell
      if (useStrobe > 0.5) {
        float on = cellStrobe(cellId, time);
        col.rgb *= on * visible;
      } else {
        col.rgb *= visible;
      }

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

        rotationAmountDeg: { value: rotationAmount },
        rotationSpeed: { value: rotationSpeed },
        rotationMode: { value: ({ oscillate:0, continuous:1, randomOsc:2, alternating:3, syncStrobe:4 }[rotationMode] ?? 0) },
        sliceScale: { value: sliceScale },

        removeGaps: { value: removeGaps ? 1.0 : 0.0 },

        useStrobe: { value: useStrobe ? 1.0 : 0.0 },
        strobeSpeed: { value: strobeSpeed },
        strobeDuty: { value: strobeDuty },
        bpm: { value: bpm },
        tempoLink: { value: tempoLink ? 1 : 0 },

        seedU: { value: seed },

        inputIsSRGB: { value: 1 },
      },
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }, [videoTexture, bufferTexture, isGlobal, renderTarget, countX, countY, rotationAmount, rotationSpeed, rotationMode, sliceScale, removeGaps, useStrobe, strobeSpeed, strobeDuty, bpm, tempoLink, seed]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;

    // keep uniforms synced with live params
    materialRef.current.uniforms.countX.value = countX;
    materialRef.current.uniforms.countY.value = countY;

    materialRef.current.uniforms.rotationAmountDeg.value = rotationAmount;
    materialRef.current.uniforms.rotationSpeed.value = rotationSpeed;
    materialRef.current.uniforms.rotationMode.value = ({ oscillate:0, continuous:1, randomOsc:2, alternating:3, syncStrobe:4 }[rotationMode] ?? 0);
    materialRef.current.uniforms.sliceScale.value = sliceScale;

    materialRef.current.uniforms.removeGaps.value = removeGaps ? 1.0 : 0.0;

    materialRef.current.uniforms.useStrobe.value = useStrobe ? 1.0 : 0.0;
    materialRef.current.uniforms.strobeSpeed.value = strobeSpeed;
    materialRef.current.uniforms.strobeDuty.value = strobeDuty;
    materialRef.current.uniforms.bpm.value = bpm;
    materialRef.current.uniforms.tempoLink.value = tempoLink ? 1 : 0;

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