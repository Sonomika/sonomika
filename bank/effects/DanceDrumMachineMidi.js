const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Dance Drum Machine (MIDI OUT)',
  description: 'Simple automatic drum MIDI machine with house, techno, breakbeat, DnB, garage, disco, and trap patterns.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    {
      name: 'genre',
      type: 'select',
      value: 'auto',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'house', label: 'House' },
        { value: 'techno', label: 'Techno' },
        { value: 'breakbeat', label: 'Breakbeat' },
        { value: 'drumAndBass', label: 'Drum & Bass' },
        { value: 'garage', label: 'Garage' },
        { value: 'disco', label: 'Disco' },
        { value: 'trap', label: 'Trap' },
      ],
    },
    { name: 'autoBars', type: 'number', value: 4, min: 1, max: 32, step: 1, description: 'Bars before Auto changes genre' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM' },
    { name: 'manualBpm', type: 'number', value: 128, min: 40, max: 220, step: 1 },
    { name: 'swing', type: 'number', value: 0.08, min: 0, max: 0.45, step: 0.01 },
    { name: 'density', type: 'number', value: 0.55, min: 0, max: 1, step: 0.01, description: 'Extra ghost notes and percussion' },
    { name: 'fillAmount', type: 'number', value: 0.28, min: 0, max: 1, step: 0.01, description: 'End-of-bar fills' },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2.0, step: 0.05 },
    { name: 'noteLength', type: 'number', value: 0.08, min: 0.02, max: 1.0, step: 0.01 },
    { name: 'gridColor', type: 'color', value: '#ffffff' },
    { name: 'accentColor', type: 'color', value: '#7df9ff' },
    { name: 'gridGlow', type: 'number', value: 0.72, min: 0, max: 2, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI drum notes' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_DANCE_DRUM_MACHINE_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_DANCE_DRUM_MACHINE_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 20;
const STEPS = 16;
const LANES = [
  { name: 'kick', note: 36, weight: 1.0 },
  { name: 'snare', note: 38, weight: 0.92 },
  { name: 'clap', note: 39, weight: 0.82 },
  { name: 'closedHat', note: 42, weight: 0.58 },
  { name: 'openHat', note: 46, weight: 0.64 },
  { name: 'perc', note: 45, weight: 0.52 },
  { name: 'tom', note: 43, weight: 0.7 },
  { name: 'ride', note: 51, weight: 0.48 },
];
const GENRES = ['house', 'techno', 'breakbeat', 'drumAndBass', 'garage', 'disco', 'trap'];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

function laneIndex(name) {
  return Math.max(0, LANES.findIndex((lane) => lane.name === name));
}

function setHit(pattern, lane, step, velocity) {
  const idx = laneIndex(lane) * STEPS + (step % STEPS);
  pattern[idx] = Math.max(pattern[idx], clamp(velocity, 0, 1));
}

function maybeHit(pattern, lane, step, chance, velocity) {
  if (Math.random() < chance) setHit(pattern, lane, step, velocity);
}

function addCommonHats(pattern, density, genre) {
  for (let step = 0; step < STEPS; step++) {
    if (step % 2 === 0) setHit(pattern, 'closedHat', step, genre === 'trap' ? 0.44 : 0.5);
    maybeHit(pattern, 'closedHat', step, density * 0.18, 0.34);
  }
  setHit(pattern, 'openHat', 6, 0.58);
  setHit(pattern, 'openHat', 14, 0.62);
}

function buildPattern(genreName, density, fillAmount, loopCount) {
  const pattern = new Float32Array(STEPS * LANES.length);
  const genre = GENRES.includes(genreName) ? genreName : 'house';
  const fill = clamp(fillAmount, 0, 1);
  const extra = clamp(density, 0, 1);

  if (genre === 'house') {
    [0, 4, 8, 12].forEach((s) => setHit(pattern, 'kick', s, 1));
    [4, 12].forEach((s) => setHit(pattern, 'clap', s, 0.86));
    addCommonHats(pattern, extra, genre);
    [3, 7, 11, 15].forEach((s) => maybeHit(pattern, 'perc', s, extra * 0.55, 0.42));
  } else if (genre === 'techno') {
    [0, 4, 8, 12].forEach((s) => setHit(pattern, 'kick', s, 1));
    [4, 12].forEach((s) => setHit(pattern, 'snare', s, 0.72));
    for (let s = 0; s < STEPS; s += 2) setHit(pattern, 'closedHat', s, 0.58);
    [2, 6, 10, 14].forEach((s) => setHit(pattern, 'openHat', s, 0.62));
    [1, 5, 9, 13].forEach((s) => maybeHit(pattern, 'perc', s, extra * 0.7, 0.5));
  } else if (genre === 'breakbeat') {
    [0, 6, 10].forEach((s) => setHit(pattern, 'kick', s, s === 0 ? 1 : 0.82));
    [4, 12].forEach((s) => setHit(pattern, 'snare', s, 0.95));
    [2, 5, 8, 11, 14].forEach((s) => setHit(pattern, 'closedHat', s, 0.52));
    [7, 15].forEach((s) => maybeHit(pattern, 'tom', s, extra * 0.8, 0.62));
  } else if (genre === 'drumAndBass') {
    [0, 7, 10].forEach((s) => setHit(pattern, 'kick', s, s === 0 ? 1 : 0.86));
    [4, 12].forEach((s) => setHit(pattern, 'snare', s, 1));
    for (let s = 0; s < STEPS; s++) maybeHit(pattern, 'closedHat', s, 0.28 + extra * 0.35, 0.38 + (s % 2) * 0.14);
    [3, 11, 15].forEach((s) => maybeHit(pattern, 'perc', s, extra * 0.55, 0.48));
  } else if (genre === 'garage') {
    [0, 5, 10, 14].forEach((s) => setHit(pattern, 'kick', s, s === 0 ? 1 : 0.78));
    [4, 12].forEach((s) => setHit(pattern, 'clap', s, 0.9));
    [2, 6, 9, 13].forEach((s) => setHit(pattern, 'closedHat', s, 0.55));
    [7, 15].forEach((s) => setHit(pattern, 'openHat', s, 0.62));
    [3, 11].forEach((s) => maybeHit(pattern, 'perc', s, extra * 0.75, 0.5));
  } else if (genre === 'disco') {
    [0, 4, 8, 12].forEach((s) => setHit(pattern, 'kick', s, 0.95));
    [4, 12].forEach((s) => setHit(pattern, 'clap', s, 0.86));
    for (let s = 0; s < STEPS; s += 2) setHit(pattern, 'closedHat', s, 0.5);
    [2, 6, 10, 14].forEach((s) => setHit(pattern, 'openHat', s, 0.76));
    [0, 4, 8, 12].forEach((s) => maybeHit(pattern, 'ride', s, extra * 0.65, 0.46));
  } else if (genre === 'trap') {
    [0, 7, 11].forEach((s) => setHit(pattern, 'kick', s, s === 0 ? 1 : 0.84));
    [4, 12].forEach((s) => setHit(pattern, 'snare', s, 0.96));
    for (let s = 0; s < STEPS; s++) maybeHit(pattern, 'closedHat', s, 0.38 + extra * 0.45, s % 2 ? 0.34 : 0.5);
    [6, 14, 15].forEach((s) => maybeHit(pattern, 'closedHat', s, fill * 0.8, 0.72));
    [13, 15].forEach((s) => maybeHit(pattern, 'tom', s, fill * 0.65, 0.58));
  }

  const fillActive = ((loopCount + 1) % 4) === 0;
  if (fillActive) {
    [13, 14, 15].forEach((s) => {
      maybeHit(pattern, 'snare', s, fill * 0.5, 0.62);
      maybeHit(pattern, 'tom', s, fill * 0.7, 0.68);
      maybeHit(pattern, 'closedHat', s, fill * 0.9, 0.78);
    });
  }

  return pattern;
}

function shouldSendMidiEvent(eventKey) {
  try {
    const now = nowMs();
    const store = globalThis[LAST_EVENT_SLOT] || {};
    const lastAt = typeof store[eventKey] === 'number' ? store[eventKey] : -Infinity;
    if ((now - lastAt) < MIN_EVENT_GAP_MS) return false;
    store[eventKey] = now;
    globalThis[LAST_EVENT_SLOT] = store;
    return true;
  } catch (_) {
    return true;
  }
}

export default function DanceDrumMachineMidi({
  genre = 'auto',
  autoBars = 4,
  bpmSync = true,
  manualBpm = 128,
  swing = 0.08,
  density = 0.55,
  fillAmount = 0.28,
  velocityBoost = 1.0,
  noteLength = 0.08,
  gridColor = '#ffffff',
  accentColor = '#7df9ff',
  gridGlow = 0.72,
  sendMidi = true,
  midiChannel = 1,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const ctx = useThree();
  const size = ctx && ctx.size ? ctx.size : { width: 1920, height: 1080 };
  const effectiveW = Math.max(1, compositionWidth || size.width || 1920);
  const effectiveH = Math.max(1, compositionHeight || size.height || 1080);
  const aspect = effectiveW / effectiveH;

  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const patternRef = useRef(null);
  const pulseRef = useRef(null);
  const phaseRef = useRef(0);
  const lastStepRef = useRef(-1);
  const loopRef = useRef(0);
  const activeGenreRef = useRef('house');

  const patternTexture = useMemo(() => {
    const data = new Uint8Array(STEPS * LANES.length * 4);
    const texture = new THREE.DataTexture(data, STEPS, LANES.length, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => { try { patternTexture.dispose(); } catch (_) {} }, [patternTexture]);

  const resolveGenre = () => {
    if (genre !== 'auto') return GENRES.includes(genre) ? genre : 'house';
    const bars = Math.max(1, Math.floor(autoBars));
    return GENRES[Math.floor(loopRef.current / bars) % GENRES.length];
  };

  const rebuildPattern = () => {
    const nextGenre = resolveGenre();
    activeGenreRef.current = nextGenre;
    patternRef.current = buildPattern(nextGenre, density, fillAmount, loopRef.current);
    if (!pulseRef.current) pulseRef.current = new Float32Array(STEPS * LANES.length);
  };

  useEffect(() => {
    loopRef.current = 0;
    phaseRef.current = 0;
    lastStepRef.current = -1;
    pulseRef.current = new Float32Array(STEPS * LANES.length);
    rebuildPattern();
  }, [genre, autoBars, density, fillAmount]);

  useEffect(() => {
    ownerKeyRef.current = `dance-drum-machine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  const claimMidiOwnership = () => {
    try {
      const now = nowMs();
      const current = globalThis[OWNER_SLOT];
      if (!current || current.key === ownerKeyRef.current || current.expiresAt <= now) {
        globalThis[OWNER_SLOT] = {
          key: ownerKeyRef.current,
          expiresAt: now + OWNER_LEASE_MS,
        };
        return true;
      }
      return current.key === ownerKeyRef.current;
    } catch (_) {
      return false;
    }
  };

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    uniform sampler2D uPattern;
    uniform vec3 uGridColor;
    uniform vec3 uAccentColor;
    uniform float uStep;
    uniform float uGridGlow;
    varying vec2 vUv;

    float boxFill(vec2 cell, float inset) {
      vec2 lo = step(vec2(inset), cell);
      vec2 hi = step(cell, vec2(1.0 - inset));
      return lo.x * lo.y * hi.x * hi.y;
    }

    float gridLine(vec2 cell) {
      vec2 edge = min(cell, 1.0 - cell);
      return 1.0 - smoothstep(0.0, 0.035, min(edge.x, edge.y));
    }

    void main() {
      vec2 gridUv = vec2(vUv.x * 16.0, (1.0 - vUv.y) * 8.0);
      vec2 cellId = floor(gridUv);
      vec2 local = fract(gridUv);
      vec2 sampleUv = (cellId + 0.5) / vec2(16.0, 8.0);
      vec4 state = texture2D(uPattern, sampleUv);
      float hit = state.r;
      float pulse = state.g;
      float vel = state.b;
      float scanDist = abs(fract((cellId.x + 0.5) / 16.0 - uStep + 0.5) - 0.5);
      float scan = 1.0 - smoothstep(0.0, 1.2 / 16.0, scanDist);
      float quarter = 1.0 - step(0.5, mod(cellId.x, 4.0));
      float cell = boxFill(local, 0.07);
      float grid = gridLine(local) * uGridGlow;
      float laneFade = 0.62 + (1.0 - cellId.y / 7.0) * 0.38;

      vec3 color = uGridColor * cell * laneFade * (hit * (0.28 + vel * 0.7) + pulse * 1.05);
      color += uAccentColor * (scan * (0.15 + hit * 0.35 + pulse * 0.7) + grid * 0.26 + quarter * 0.08 * uGridGlow);
      float alpha = clamp(grid * 0.25 + quarter * 0.06 + scan * 0.14 + cell * (hit * 0.62 + pulse * 0.34), 0.0, 0.95);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
    }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uPattern: { value: patternTexture },
      uGridColor: { value: new THREE.Color(gridColor) },
      uAccentColor: { value: new THREE.Color(accentColor) },
      uStep: { value: 0 },
      uGridGlow: { value: gridGlow },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), [patternTexture]);
  useEffect(() => () => { try { shaderMaterial.dispose(); } catch (_) {} }, [shaderMaterial]);
  useEffect(() => { materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    const pattern = patternRef.current;
    const pulse = pulseRef.current;
    if (!material || !pattern || !pulse) return;

    const dt = clamp(delta || 0, 0, 0.1);
    const projectBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? projectBpm : manualBpm);
    const stepsPerSec = 4 * (bpm / 60);
    const currentStepBefore = Math.floor(phaseRef.current) % STEPS;
    const swingOffset = (currentStepBefore % 2 === 1 ? clamp(swing, 0, 0.48) : 0);
    phaseRef.current += dt * stepsPerSec * (1 - swingOffset * 0.42);

    while (phaseRef.current >= STEPS) {
      phaseRef.current -= STEPS;
      loopRef.current += 1;
      rebuildPattern();
    }

    const currentStep = Math.floor(phaseRef.current) % STEPS;
    if (currentStep !== lastStepRef.current) {
      lastStepRef.current = currentStep;
      const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
      const channel = clamp(Math.round(midiChannel), 1, 16);
      const durMs = Math.max(5, Math.round(Math.max(0.02, noteLength) * 1000));

      for (let lane = 0; lane < LANES.length; lane++) {
        const idx = lane * STEPS + currentStep;
        const strength = pattern[idx];
        if (strength <= 0) continue;
        pulse[idx] = 1;
        const laneInfo = LANES[lane];
        const downbeat = currentStep % 4 === 0 ? 0.12 : 0;
        const velocity = clamp((strength * laneInfo.weight + downbeat) * velocityBoost, 0.05, 1);
        const eventKey = `${loopRef.current}:${currentStep}:${lane}:${activeGenreRef.current}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try { midi.sendNote(laneInfo.note, velocity, channel, durMs); } catch (_) {}
        }
      }
    }

    const data = patternTexture.image && patternTexture.image.data;
    if (data) {
      for (let i = 0; i < pattern.length; i++) {
        pulse[i] *= Math.pow(0.78, dt * 60);
        const offset = i * 4;
        const hit = pattern[i];
        data[offset] = hit > 0 ? 255 : 0;
        data[offset + 1] = Math.max(0, Math.min(255, Math.round(pulse[i] * 255)));
        data[offset + 2] = Math.max(0, Math.min(255, Math.round(hit * 255)));
        data[offset + 3] = 255;
      }
      patternTexture.needsUpdate = true;
    }

    material.uniforms.uGridColor.value.set(gridColor);
    material.uniforms.uAccentColor.value.set(accentColor);
    material.uniforms.uStep.value = phaseRef.current / STEPS;
    material.uniforms.uGridGlow.value = Math.max(0, gridGlow);
  });

  return React.createElement('mesh', { ref: meshRef, renderOrder: 10000 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material' })
  );
}
