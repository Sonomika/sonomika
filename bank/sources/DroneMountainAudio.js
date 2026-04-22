// sonomika template – rotating 3D wireframe mountain with layered glitch-drone audio
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Drone Mountain (Audio)',
  description: '3D line mountain rotating and glitching with a layered drone + noise + crackle audio feedback texture.',
  category: 'Sources',
  author: 'VJ',
  version: '1.1.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'gridSize', type: 'number', value: 40, min: 12, max: 80, step: 2 },
    { name: 'mountainHeight', type: 'number', value: 0.55, min: 0.1, max: 1.5, step: 0.05 },
    { name: 'rotationSpeed', type: 'number', value: 0.35, min: 0, max: 2.0, step: 0.05 },
    { name: 'glitchAmount', type: 'number', value: 0.8, min: 0, max: 2.0, step: 0.05 },
    { name: 'colorA', type: 'color', value: '#ff0070' },
    { name: 'colorB', type: 'color', value: '#00e8ff' },
    { name: 'volume', type: 'number', value: -16, min: -36, max: 0, step: 1 },
    { name: 'droneLevel', type: 'number', value: 0.7, min: 0, max: 1, step: 0.05 },
    { name: 'noiseLevel', type: 'number', value: 0.8, min: 0, max: 1, step: 0.05 },
    { name: 'crackleLevel', type: 'number', value: 0.5, min: 0, max: 1, step: 0.05 },
    { name: 'feedback', type: 'number', value: 0.72, min: 0, max: 0.92, step: 0.01 },
    { name: 'filterFreq', type: 'number', value: 1200, min: 200, max: 4000, step: 50 },
    { name: 'crush', type: 'number', value: 6, min: 2, max: 16, step: 1 },
    { name: 'soundOn', type: 'boolean', value: true },
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

    // Pulse the height slightly on each audio burst so mountain "breathes" with sound
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

export default function DroneMountainAudioSource({
  gridSize = 40,
  mountainHeight = 0.55,
  rotationSpeed = 0.35,
  glitchAmount = 0.8,
  colorA = '#ff0070',
  colorB = '#00e8ff',
  volume = -16,
  droneLevel = 0.7,
  noiseLevel = 0.8,
  crackleLevel = 0.5,
  feedback = 0.72,
  filterFreq = 1200,
  crush = 6,
  soundOn = true,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const groupRef = useRef(null);
  const lineRef = useRef(null);
  const materialRef = useRef(null);
  const toneRef = useRef(null);
  const nextDroneChangeRef = useRef(0);
  const stoppedRef = useRef(false);
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

  useEffect(() => {
    const Tone = globalThis.Tone;
    if (!Tone) return;
    const nodes = {};
    try {
      // Master bus: mixBus -> crusher -> master -> destination
      const master = new Tone.Gain(Tone.dbToGain(volume)).toDestination();
      const crusher = new Tone.BitCrusher(crush);
      crusher.connect(master);
      const mixBus = new Tone.Gain(1.0);
      mixBus.connect(crusher);
      // Parallel dry so the bitcrusher doesn't swallow too much
      const dry = new Tone.Gain(0.35);
      dry.connect(master);
      mixBus.connect(dry);

      // Shared feedback delay across layers (sends only)
      const delay = new Tone.FeedbackDelay({ delayTime: 0.28, feedback, wet: 1 });
      delay.connect(mixBus);
      const delaySend = new Tone.Gain(0.35);
      delaySend.connect(delay);

      // --- Drone layer: two detuned saws + sub sine -> resonant LP filter (LFO swept)
      const droneGain = new Tone.Gain(droneLevel * 0.22);
      droneGain.connect(mixBus);
      droneGain.connect(delaySend);

      const droneFilter = new Tone.Filter(500, 'lowpass');
      droneFilter.Q.value = 5;
      droneFilter.connect(droneGain);

      const filterLFO = new Tone.LFO({ frequency: 0.07, min: 180, max: 1200, type: 'sine' });
      filterLFO.connect(droneFilter.frequency);
      filterLFO.start();

      const droneRoot = DRONE_ROOTS[Math.floor(Math.random() * DRONE_ROOTS.length)];
      const osc1 = new Tone.Oscillator(droneRoot, 'sawtooth');
      const osc2 = new Tone.Oscillator(droneRoot * 1.005, 'sawtooth');
      const osc3 = new Tone.Oscillator(droneRoot * 0.5, 'sine');
      osc2.detune.value = -9;
      osc1.volume.value = -6;
      osc2.volume.value = -6;
      osc3.volume.value = -3;
      osc1.connect(droneFilter);
      osc2.connect(droneFilter);
      osc3.connect(droneGain);
      try { osc1.start(); osc2.start(); osc3.start(); } catch (_) {}

      const detuneLFO = new Tone.LFO({ frequency: 0.11, min: -20, max: 20, type: 'triangle' });
      detuneLFO.connect(osc1.detune);
      detuneLFO.start();

      // --- Noise burst layer: pink noise -> bandpass -> envelope
      const noise = new Tone.Noise('pink');
      const noiseBurstGain = new Tone.Gain(0);
      const noiseBandpass = new Tone.Filter(filterFreq, 'bandpass');
      noiseBandpass.Q.value = 6;
      const noiseLevelGain = new Tone.Gain(noiseLevel);

      noise.connect(noiseBurstGain);
      noiseBurstGain.connect(noiseBandpass);
      noiseBandpass.connect(noiseLevelGain);
      noiseLevelGain.connect(mixBus);
      noiseLevelGain.connect(delaySend);
      try { noise.start(); } catch (_) {}

      // --- Crackle grains: short filtered noise ticks (no pitched hits)
      const crackleLevelGain = new Tone.Gain(crackleLevel * 0.5);
      crackleLevelGain.connect(mixBus);
      // No delay send for crackle – keeps it dry and avoids ringing tails
      const crackleFilter = new Tone.Filter(2500, 'highpass');
      crackleFilter.Q.value = 0.5;
      crackleFilter.connect(crackleLevelGain);
      const crackle = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.015, sustain: 0, release: 0.02 },
      });
      crackle.volume.value = -10;
      crackle.connect(crackleFilter);

      Object.assign(nodes, {
        Tone, master, crusher, mixBus, dry, delay, delaySend,
        droneGain, droneFilter, filterLFO, detuneLFO, osc1, osc2, osc3,
        noise, noiseBurstGain, noiseBandpass, noiseLevelGain,
        crackle, crackleFilter, crackleLevelGain,
        droneRoot,
      });
      toneRef.current = nodes;
    } catch (e) {
      try { console.warn('GlitchMountain Tone init failed:', e); } catch (_) {}
    }
    return () => {
      const t = nodes;
      const disp = (obj, method = 'dispose') => { try { if (obj && obj[method]) obj[method](); } catch (_) {} };
      disp(t.osc1, 'stop'); disp(t.osc2, 'stop'); disp(t.osc3, 'stop'); disp(t.noise, 'stop');
      disp(t.osc1); disp(t.osc2); disp(t.osc3);
      disp(t.noise); disp(t.noiseBurstGain); disp(t.noiseBandpass); disp(t.noiseLevelGain);
      disp(t.crackle); disp(t.crackleFilter); disp(t.crackleLevelGain);
      disp(t.filterLFO); disp(t.detuneLFO);
      disp(t.droneFilter); disp(t.droneGain);
      disp(t.delay); disp(t.delaySend);
      disp(t.mixBus); disp(t.crusher); disp(t.dry); disp(t.master);
      toneRef.current = null;
    };
  }, []);

  const silenceAudio = (immediate) => {
    const t = toneRef.current;
    if (!t) return;
    try {
      const now = t.Tone.now();
      t.master.gain.cancelScheduledValues(now);
      if (immediate) {
        t.master.gain.setValueAtTime(0.0001, now);
      } else {
        t.master.gain.rampTo(0.0001, 0.05);
      }
      t.noiseBurstGain.gain.cancelScheduledValues(now);
      t.noiseBurstGain.gain.setValueAtTime(0.0001, now);
    } catch (_) {}
    try { t.delay.wet.rampTo(0, 0.05); } catch (_) {}
  };

  const restoreAudio = () => {
    const t = toneRef.current;
    if (!t) return;
    try { t.master.gain.rampTo(t.Tone.dbToGain(volume), 0.15); } catch (_) {}
    try { t.delay.wet.rampTo(1, 0.1); } catch (_) {}
  };

  useEffect(() => {
    const t = toneRef.current;
    if (!t) return;
    const active = soundOn && !stoppedRef.current;
    const targetMaster = active ? t.Tone.dbToGain(volume) : 0.0001;
    try { t.master.gain.rampTo(targetMaster, active ? 0.15 : 0.05); } catch (_) {}
    try { t.droneGain.gain.rampTo(droneLevel * 0.22, 0.2); } catch (_) {}
    try { t.noiseLevelGain.gain.rampTo(noiseLevel, 0.15); } catch (_) {}
    try { t.crackleLevelGain.gain.rampTo(crackleLevel * 0.5, 0.15); } catch (_) {}
    try { t.delay.feedback.rampTo(feedback, 0.2); } catch (_) {}
    try { t.noiseBandpass.frequency.rampTo(filterFreq, 0.15); } catch (_) {}
    try { if (t.crusher.bits && t.crusher.bits.rampTo) t.crusher.bits.rampTo(crush, 0.15); } catch (_) {}

    if (!active) {
      try {
        const now = t.Tone.now();
        t.noiseBurstGain.gain.cancelScheduledValues(now);
        t.noiseBurstGain.gain.setValueAtTime(0.0001, now);
      } catch (_) {}
      try { t.delay.wet.rampTo(0, 0.05); } catch (_) {}
    } else {
      try { t.delay.wet.rampTo(1, 0.1); } catch (_) {}
    }
  }, [soundOn, volume, droneLevel, noiseLevel, crackleLevel, feedback, filterFreq, crush]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onStop = () => {
      stoppedRef.current = true;
      silenceAudio(true);
    };
    const onPlay = () => {
      stoppedRef.current = false;
      if (soundOn) restoreAudio();
    };
    document.addEventListener('globalStop', onStop);
    document.addEventListener('globalPause', onStop);
    document.addEventListener('columnStop', onStop);
    document.addEventListener('timelineStop', onStop);
    document.addEventListener('globalPlay', onPlay);
    return () => {
      document.removeEventListener('globalStop', onStop);
      document.removeEventListener('globalPause', onStop);
      document.removeEventListener('columnStop', onStop);
      document.removeEventListener('timelineStop', onStop);
      document.removeEventListener('globalPlay', onPlay);
    };
  }, [soundOn, volume]);

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

    // Decay the audio pulse toward 0 (envelope for visuals & rotation wobble)
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

    if (!soundOn || stoppedRef.current) return;
    const t = toneRef.current;
    if (!t) return;
    try {
      if (t.Tone.context.state === 'suspended') t.Tone.context.resume();
      if (t.Tone.context.state === 'suspended') return;
    } catch (_) { return; }

    // --- Burst on the shared beat clock: fires exactly when visual glitch beat hits
    if (beatIndex !== lastBeatRef.current) {
      lastBeatRef.current = beatIndex;
      if (isBurstBeat) {
        audioPulseRef.current = 1.0;
        try {
          const now = t.Tone.now();
          const amp = Math.min(1.0, 0.25 + glitchAmount * 0.55) * (0.7 + (frac * 10 % 1) * 0.3);
          t.noiseBurstGain.gain.cancelScheduledValues(now);
          t.noiseBurstGain.gain.setValueAtTime(0.0001, now);
          t.noiseBurstGain.gain.exponentialRampToValueAtTime(amp, now + 0.005);
          // Decay length scales with beat period so bursts breathe with tempo
          t.noiseBurstGain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + Math.min(beatPeriod * 0.7, 0.35)
          );

          // Filter sweep seeded by the same beat hash => visible glitch = audible glitch
          const sweep = 0.3 + (frac * 7 % 1) * 2.2;
          const fDrift = filterFreq * sweep;
          t.noiseBandpass.frequency.cancelScheduledValues(now);
          t.noiseBandpass.frequency.setValueAtTime(fDrift, now);
          t.noiseBandpass.frequency.exponentialRampToValueAtTime(
            Math.max(150, filterFreq * (0.4 + (frac * 3 % 1))),
            now + Math.min(beatPeriod, 0.4)
          );
        } catch (_) {}
      } else {
        // Small pulse on every beat for subtle pulsing life
        audioPulseRef.current = Math.max(audioPulseRef.current, 0.18);
      }
    }

    // --- Crackle grains locked to 16th-note sub-beats, density driven by glitch
    if (subBeatIndex !== lastSubBeatRef.current) {
      lastSubBeatRef.current = subBeatIndex;
      const subHash = Math.abs(Math.sin(subBeatIndex * 34.129 + 9.7));
      const subFrac = subHash - Math.floor(subHash);
      const prob = 0.12 + glitchAmount * 0.38 + (isBurstBeat ? 0.25 : 0);
      if (subFrac < prob) {
        try {
          const now = t.Tone.now();
          // Cutoff derived from subFrac so click timbre correlates with click timing
          const cutoff = 1500 + subFrac * 5500;
          t.crackleFilter.frequency.setValueAtTime(cutoff, now);
          const vel = 0.35 + subFrac * 0.5 + (isBurstBeat ? 0.15 : 0);
          t.crackle.triggerAttackRelease(0.01 + subFrac * 0.02, now, Math.min(1, vel));
          audioPulseRef.current = Math.max(audioPulseRef.current, 0.25 * vel);
        } catch (_) {}
      }
    }

    // --- Drone pitch drift (re-pitch root occasionally on downbeats only)
    if (time >= nextDroneChangeRef.current && beatPhase < 0.05) {
      nextDroneChangeRef.current = time + 6 + Math.random() * 10;
      try {
        const root = DRONE_ROOTS[Math.floor(Math.random() * DRONE_ROOTS.length)];
        const now = t.Tone.now();
        // Ramp over 2 beats so it moves musically
        const ramp = Math.max(0.4, beatPeriod * 2);
        t.osc1.frequency.rampTo(root, ramp, now);
        t.osc2.frequency.rampTo(root * 1.005, ramp, now);
        t.osc3.frequency.rampTo(root * 0.5, ramp, now);
      } catch (_) {}
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
