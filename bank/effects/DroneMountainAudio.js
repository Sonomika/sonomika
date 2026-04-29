// sonomika template – rotating 3D wireframe mountain with layered glitch-drone audio
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Drone Mountain (MIDI)',
  description: '3D line mountain rotating and glitching with a beat-locked MIDI burst and crackle texture.',
  category: 'Effects',
  author: 'VJ',
  version: '1.1.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'gridSize', type: 'number', value: 40, min: 12, max: 80, step: 2 },
    { name: 'mountainHeight', type: 'number', value: 0.55, min: 0.1, max: 1.5, step: 0.05 },
    { name: 'rotationSpeed', type: 'number', value: 0.35, min: 0, max: 2.0, step: 0.05 },
    { name: 'glitchAmount', type: 'number', value: 0.8, min: 0, max: 2.0, step: 0.05 },
    { name: 'colorA', type: 'color', value: '#ff0070' },
    { name: 'colorB', type: 'color', value: '#00e8ff' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes on visual burst events' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const DRONE_ROOTS = [32.7, 34.65, 38.89, 41.2, 43.65, 49.0]; // C1, C#1, D#1, E1, F1, G1

function buildMountainGeometry(gridSize) {
  const n = Math.max(4, Math.floor(gridSize));
  const size = 2.6;
  const step = size / (n - 1);
  const H = new Array(n);
  for (let i = 0; i < n; i++) {
    H[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      const x = -size / 2 + i * step;
      const z = -size / 2 + j * step;
      let h = 0;
      let f = 1.1;
      let a = 1.0;
      for (let k = 0; k < 5; k++) {
        h += a * (
          Math.sin(x * f * 1.3 + 0.7) * Math.cos(z * f * 1.1 + 1.3) +
          Math.sin(x * f * 0.7 - 0.4) * Math.sin(z * f * 1.9 + 2.1)
        );
        f *= 2.0;
        a *= 0.5;
      }
      const rad = Math.sqrt(x * x + z * z) / (size * 0.5);
      const falloff = Math.max(0, 1 - rad * 0.7);
      H[i][j] = h * 0.22 * falloff;
    }
  }

  const positions = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n - 1; i++) {
      const x1 = -size / 2 + i * step;
      const x2 = -size / 2 + (i + 1) * step;
      const z = -size / 2 + j * step;
      positions.push(x1, H[i][j], z, x2, H[i + 1][j], z);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - 1; j++) {
      const x = -size / 2 + i * step;
      const z1 = -size / 2 + j * step;
      const z2 = -size / 2 + (j + 1) * step;
      positions.push(x, H[i][j], z1, x, H[i][j + 1], z2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uGlitch;
  uniform float uHeight;
  uniform float uBeatPhase;    // 0..1 within current beat
  uniform float uBeatIndex;    // monotonically increasing beat number
  uniform float uAudioPulse;   // 0..1, spikes on audio burst, decays
  uniform float uBurstFlag;    // 1.0 if this beat is a glitch-burst beat
  varying float vY;
  varying float vGlitch;
  varying float vBand;
  varying float vPulse;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main(){
    vec3 p = position;

    // Pulse the height slightly on each MIDI burst so mountain "breathes" with sound
    float heightPulse = 1.0 + uAudioPulse * 0.35;
    p.y *= uHeight * heightPulse;

    // Shared beat-locked tick so visual glitches line up with audio events
    float band = floor((p.y + 1.0) * 6.0 + uBeatIndex * 0.25);
    float tick = uBeatIndex;
    float seed = hash(vec2(band, tick));
    // Only glitch when this beat is flagged as a burst beat, scaled by envelope
    float burst = step(0.55, seed) * uBurstFlag;
    // Envelope within the beat: sharp attack, fast decay aligned to audio pulse
    float env = max(uAudioPulse, exp(-uBeatPhase * 14.0) * uBurstFlag);
    float g = burst * uGlitch * env;

    float ox = (hash(vec2(band,       tick + 1.7)) - 0.5) * 0.55 * g;
    float oz = (hash(vec2(band + 3.7, tick + 5.3)) - 0.5) * 0.35 * g;
    p.x += ox;
    p.z += oz;

    float jitter = (hash(vec2(p.x * 17.0 + p.z * 9.0, tick)) - 0.5) * 0.04 * uGlitch * env;
    p.y += jitter;

    // Big tear on strong burst beats
    float tear = step(0.8, hash(vec2(tick, 7.3))) * uBurstFlag * uAudioPulse;
    p.x += tear * (hash(vec2(band, tick + 0.1)) - 0.5) * 1.1 * uGlitch;

    vY = p.y;
    vGlitch = g;
    vBand = band;
    vPulse = uAudioPulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uBeatPhase;
  uniform float uAudioPulse;
  varying float vY;
  varying float vGlitch;
  varying float vBand;
  varying float vPulse;

  void main(){
    float t = clamp(vY * 1.4 + 0.5, 0.0, 1.0);
    vec3 col = mix(uColorA, uColorB, t);

    // Glitch flash (same band hash) scaled by audio pulse
    col += vec3(1.0, 0.35, 0.8) * vGlitch * (1.2 + vPulse * 1.8);

    // Breathing color shimmer in sync with the beat
    float breathe = 0.22 * sin(uBeatPhase * 6.28318 - 1.5708) + 0.78;
    col *= breathe;

    // Extra bright band flicker right on a burst
    float flicker = step(0.88, fract(sin(vBand * 9.17 + uBeatPhase * 13.0) * 43758.5));
    col += flicker * vec3(0.7, 0.9, 1.0) * 0.5 * vPulse;

    // Global brightness lifts on each burst
    col += vec3(0.05, 0.15, 0.3) * vPulse;

    gl_FragColor = vec4(col, 0.95);
  }
`;

export default function DroneMountainMidiEffect({
  gridSize = 40,
  mountainHeight = 0.55,
  rotationSpeed = 0.35,
  glitchAmount = 0.8,
  colorA = '#ff0070',
  colorB = '#00e8ff',
  rootMidi = 36,
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const groupRef = useRef(null);
  const lineRef = useRef(null);
  const materialRef = useRef(null);
  const audioPulseRef = useRef(0);
  const lastBeatRef = useRef(-1);
  const lastSubBeatRef = useRef(-1);

  const geometry = useMemo(() => buildMountainGeometry(gridSize), [gridSize]);

  useEffect(() => {
    return () => {
      try { geometry.dispose(); } catch (_) {}
    };
  }, [geometry]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGlitch: { value: glitchAmount },
      uHeight: { value: mountainHeight },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uBeatPhase: { value: 0 },
      uBeatIndex: { value: 0 },
      uAudioPulse: { value: 0 },
      uBurstFlag: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => {
    return () => { try { material.dispose(); } catch (_) {} };
  }, [material]);


  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;

    // --- Shared beat clock (BPM-locked, falls back to 120)
    const bpmRaw = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? globalThis.VJ_BPM : 120;
    const bpm = Math.max(30, Math.min(240, bpmRaw));
    const beatPeriod = 60.0 / bpm;
    const beatIndexFloat = time / beatPeriod;
    const beatIndex = Math.floor(beatIndexFloat);
    const beatPhase = beatIndexFloat - beatIndex; // 0..1 within current beat
    const subBeatIndex = Math.floor(beatIndexFloat * 4); // 16th notes

    // Per-beat deterministic hash -> is this beat a glitch/burst beat?
    const beatHash = Math.abs(Math.sin(beatIndex * 12.9898 + 78.233));
    const frac = beatHash - Math.floor(beatHash);
    const burstThreshold = 0.78 - Math.min(0.55, glitchAmount * 0.3);
    const isBurstBeat = frac > burstThreshold;

    // Decay the MIDI pulse toward 0 (envelope for visuals & rotation wobble)
    audioPulseRef.current = Math.max(0, audioPulseRef.current - delta * 3.0);

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      materialRef.current.uniforms.uGlitch.value = glitchAmount;
      materialRef.current.uniforms.uHeight.value = mountainHeight;
      materialRef.current.uniforms.uColorA.value.set(colorA);
      materialRef.current.uniforms.uColorB.value.set(colorB);
      materialRef.current.uniforms.uBeatPhase.value = beatPhase;
      materialRef.current.uniforms.uBeatIndex.value = beatIndex;
      materialRef.current.uniforms.uAudioPulse.value = audioPulseRef.current;
      materialRef.current.uniforms.uBurstFlag.value = isBurstBeat ? 1.0 : 0.0;
    }

    // Rotation gets a kick on each burst so camera motion feels the hit
    if (groupRef.current) {
      const extra = audioPulseRef.current * 1.8;
      groupRef.current.rotation.y += delta * (rotationSpeed + extra);
    }

    const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
    const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
    const baseNote = Math.max(0, Math.min(108, Math.round(rootMidi)));

    // Burst on the shared beat clock: fires exactly when the visual glitch beat hits.
    if (beatIndex !== lastBeatRef.current) {
      lastBeatRef.current = beatIndex;
      if (isBurstBeat) {
        audioPulseRef.current = 1.0;
        if (midi && midi.sendNote) {
          const note = Math.max(0, Math.min(127, baseNote + 12 + Math.floor((frac * 10 % 1) * 12)));
          const velocity = Math.min(1.0, 0.35 + glitchAmount * 0.45);
          try { midi.sendNote(note, velocity, channel, Math.max(80, Math.round(beatPeriod * 350))); } catch (_) {}
        }
      } else {
        audioPulseRef.current = Math.max(audioPulseRef.current, 0.18);
      }
    }

    // Crackle grains become short MIDI sparks on 16th-note sub-beats.
    if (subBeatIndex !== lastSubBeatRef.current) {
      lastSubBeatRef.current = subBeatIndex;
      const subHash = Math.abs(Math.sin(subBeatIndex * 34.129 + 9.7));
      const subFrac = subHash - Math.floor(subHash);
      const prob = 0.12 + glitchAmount * 0.38 + (isBurstBeat ? 0.25 : 0);
      if (subFrac < prob) {
        const vel = 0.35 + subFrac * 0.5 + (isBurstBeat ? 0.15 : 0);
        audioPulseRef.current = Math.max(audioPulseRef.current, 0.25 * vel);
        if (midi && midi.sendNote) {
          const note = Math.max(0, Math.min(127, baseNote + 24 + Math.floor(subFrac * 24)));
          try { midi.sendNote(note, Math.min(1, vel), channel, 60); } catch (_) {}
        }
      }
    }
  });

  return React.createElement(
    'group',
    { ref: groupRef, rotation: [-0.35, 0, 0], position: [0, -0.15, 0] },
    React.createElement('lineSegments', {
      ref: lineRef,
    },
      React.createElement('primitive', { object: geometry, attach: 'geometry' }),
      React.createElement('primitive', { object: material, ref: materialRef, attach: 'material' })
    )
  );
}
