// sonomika template – step-sequencer drum machine. A BPM-locked playhead sweeps across a grid; each lit cell fires its row's drum voice.
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Drum Matrix (Audio)',
  description: '16-step drum-machine grid locked to the project BPM. Rows are fixed drum voices (kick, snare, toms, rim, clap, closed hat, open hat). A playhead sweeps left to right and triggers every lit cell.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'steps', type: 'number', value: 16, min: 4, max: 32, step: 1 },
    { name: 'density', type: 'number', value: 0.2, min: 0, max: 0.8, step: 0.02, description: 'random fills on top of base pattern' },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1, description: '4 = 16th notes, 2 = 8th notes' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 120, min: 40, max: 220, step: 1, description: 'used when BPM sync is off' },
    { name: 'swing', type: 'number', value: 0.0, min: 0, max: 0.5, step: 0.02 },
    { name: 'evolveBars', type: 'number', value: 0, min: 0, max: 16, step: 1, description: 're-randomize every N bars (0 = static)' },
    { name: 'showBeats', type: 'boolean', value: true },
    { name: 'volume', type: 'number', value: -10, min: -30, max: 0, step: 1 },
    { name: 'soundOn', type: 'boolean', value: true },
    { name: 'sendMidi', type: 'boolean', value: false, description: 'send MIDI notes to the selected MIDI output (e.g. Ableton via loopMIDI)' },
    { name: 'midiChannel', type: 'number', value: 10, min: 1, max: 16, step: 1, description: '10 = standard GM drum channel' },
  ],
};

const ROWS = 8;
const ROW_COLORS = [
  '#ff4a3a', // kick    (row 0 = bottom)
  '#ff8a30', // snare
  '#ffd040', // low tom
  '#a3ff4a', // hi tom
  '#40ffc8', // rim
  '#40b0ff', // clap
  '#a080ff', // closed hat
  '#ff6ac8', // open hat (row 7 = top)
];

// GM-style drum map. Row order (0 = bottom) lines up with the voices above.
const ROW_MIDI_NOTES = [
  36, // kick     (C1)
  38, // snare    (D1)
  41, // low tom  (F1)
  48, // hi tom   (C2)
  37, // rim      (C#1)
  39, // clap     (D#1)
  42, // closed hat (F#1)
  46, // open hat  (A#1)
];

function buildBasePattern(steps) {
  const pat = new Uint8Array(steps * ROWS);
  const stride = Math.max(1, Math.round(steps / 4)); // beat stride
  // Kick (row 0): 4-on-the-floor
  for (let i = 0; i < steps; i += stride) pat[i * ROWS + 0] = 1;
  // Snare (row 1): beats 2 and 4
  for (let i = stride; i < steps; i += stride * 2) pat[i * ROWS + 1] = 1;
  // Closed hat (row 6): 8th notes
  const halfStride = Math.max(1, Math.round(stride / 2));
  for (let i = 0; i < steps; i += halfStride) pat[i * ROWS + 6] = 1;
  // Open hat (row 7): offbeats
  for (let i = halfStride; i < steps; i += stride) pat[i * ROWS + 7] = 1;
  return pat;
}

function addDensity(pat, steps, density) {
  if (density <= 0) return;
  for (let s = 0; s < steps; s++) {
    for (let r = 0; r < ROWS; r++) {
      const idx = s * ROWS + r;
      if (pat[idx] === 0 && Math.random() < density * 0.4) {
        pat[idx] = 1;
      }
    }
  }
}

function buildPattern(steps, density) {
  const pat = buildBasePattern(steps);
  addDensity(pat, steps, density);
  return pat;
}

function buildKit(Tone) {
  // All voices connect directly to destination via a shared master gain.
  const master = new Tone.Gain(1).toDestination();

  // 0: Kick
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 },
  });
  kick.volume.value = -3;
  kick.connect(master);

  // 1: Snare (body + noise)
  const snBody = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.02 },
  });
  snBody.volume.value = -16;
  snBody.connect(master);
  const snNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.02 },
  });
  const snHP = new Tone.Filter(1800, 'highpass');
  snNoise.connect(snHP);
  snHP.connect(master);
  snNoise.volume.value = -8;

  // 2: Low tom
  const loTom = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.2 },
  });
  loTom.volume.value = -6;
  loTom.connect(master);

  // 3: Hi tom
  const hiTom = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 2.5,
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.15 },
  });
  hiTom.volume.value = -6;
  hiTom.connect(master);

  // 4: Rim / click
  const rim = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.005 },
  });
  rim.volume.value = -10;
  rim.connect(master);

  // 5: Clap (two very close noise bursts)
  const clNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.02 },
  });
  const clBP = new Tone.Filter(1100, 'bandpass');
  clBP.Q.value = 1.2;
  clNoise.connect(clBP);
  clBP.connect(master);
  clNoise.volume.value = -6;

  // 6: Closed hat (short filtered noise)
  const chNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 },
  });
  const chHP = new Tone.Filter(7000, 'highpass');
  chNoise.connect(chHP);
  chHP.connect(master);
  chNoise.volume.value = -14;

  // 7: Open hat (long filtered noise)
  const ohNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.06 },
  });
  const ohHP = new Tone.Filter(6000, 'highpass');
  ohNoise.connect(ohHP);
  ohHP.connect(master);
  ohNoise.volume.value = -16;

  const triggers = [
    (now, vel) => kick.triggerAttackRelease('C1', '8n', now, vel),
    (now, vel) => {
      snBody.triggerAttackRelease(220, 0.02, now, vel);
      snNoise.triggerAttackRelease(0.08, now, vel);
    },
    (now, vel) => loTom.triggerAttackRelease('F1', '8n', now, vel),
    (now, vel) => hiTom.triggerAttackRelease('A2', '8n', now, vel),
    (now, vel) => rim.triggerAttackRelease(1600, 0.015, now, vel),
    (now, vel) => {
      clNoise.triggerAttackRelease(0.04, now, vel);
      clNoise.triggerAttackRelease(0.04, now + 0.015, vel * 0.9);
      clNoise.triggerAttackRelease(0.04, now + 0.03, vel * 0.8);
    },
    (now, vel) => chNoise.triggerAttackRelease(0.03, now, vel * 0.6),
    (now, vel) => ohNoise.triggerAttackRelease(0.26, now, vel * 0.55),
  ];

  const nodes = [
    kick,
    snBody, snNoise, snHP,
    loTom,
    hiTom,
    rim,
    clNoise, clBP,
    chNoise, chHP,
    ohNoise, ohHP,
    master,
  ];

  return { triggers, nodes, master };
}

export default function DrumMatrixAudioSource({
  steps = 16,
  density = 0.2,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 120,
  swing = 0.0,
  evolveBars = 0,
  showBeats = true,
  volume = -10,
  soundOn = true,
  sendMidi = false,
  midiChannel = 10,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;
  const halfH = 1;

  const S = Math.max(2, Math.floor(steps));

  const instRef = useRef(null);
  const scanRef = useRef(null);
  const bgRef = useRef(null);
  const beatMarkersRef = useRef(null);
  const kitRef = useRef(null);

  const scanPosRef = useRef(0);
  const lastColRef = useRef(-1);
  const barsSinceEvolveRef = useRef(0);
  const patternRef = useRef(null);
  const pulseRef = useRef(null);

  // Pattern lifecycle
  useEffect(() => {
    patternRef.current = buildPattern(S, density);
    pulseRef.current = new Float32Array(S * ROWS);
    lastColRef.current = -1;
    barsSinceEvolveRef.current = 0;
  }, [S, density]);

  // --- Tone kit setup ---
  useEffect(() => {
    const Tone = globalThis.Tone;
    if (!Tone) return;
    let kit = null;
    try {
      kit = buildKit(Tone);
      try { kit.master.gain.value = soundOn ? Tone.dbToGain(volume) : 0.0001; } catch (_) {}
      kitRef.current = { Tone, kit };
    } catch (e) {
      try { console.warn('DrumMatrix Tone init failed:', e); } catch (_) {}
    }
    return () => {
      if (kit && kit.nodes) {
        kit.nodes.forEach((n) => {
          try { n.triggerRelease && n.triggerRelease(); } catch (_) {}
          try { n.dispose && n.dispose(); } catch (_) {}
        });
      }
      kitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const k = kitRef.current;
    if (!k || !k.kit) return;
    try {
      k.kit.master.gain.rampTo(
        soundOn ? k.Tone.dbToGain(volume) : 0.0001,
        0.08
      );
    } catch (_) {}
  }, [volume, soundOn]);

  // --- Grid visuals: instanced cells ---
  const cellW = (2 * halfW) / S;
  const cellH = (2 * halfH) / ROWS;
  const cellSize = Math.min(cellW, cellH) * 0.82;

  const instGeom = useMemo(() => new THREE.PlaneGeometry(cellSize, cellSize), [cellSize]);
  useEffect(() => () => { try { instGeom.dispose(); } catch (_) {} }, [instGeom]);

  const instMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  }), []);
  useEffect(() => () => { try { instMat.dispose(); } catch (_) {} }, [instMat]);

  const totalCells = S * ROWS;
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const rowColorObjs = useMemo(() => ROW_COLORS.map((hex) => new THREE.Color(hex)), []);

  useEffect(() => {
    const mesh = instRef.current;
    if (!mesh) return;
    for (let c = 0; c < S; c++) {
      for (let r = 0; r < ROWS; r++) {
        const i = c * ROWS + r;
        dummyObj.position.set(
          -halfW + (c + 0.5) * cellW,
          -halfH + (r + 0.5) * cellH,
          0
        );
        dummyObj.scale.setScalar(0);
        dummyObj.updateMatrix();
        mesh.setMatrixAt(i, dummyObj.matrix);
        mesh.setColorAt(i, rowColorObjs[r]);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = totalCells;
  }, [S, cellW, cellH, halfW, halfH, totalCells, dummyObj, rowColorObjs]);

  // --- Beat markers (vertical lines every stepsPerBeat columns) ---
  const beatGeom = useMemo(() => {
    const positions = [];
    const spb = Math.max(1, Math.floor(stepsPerBeat));
    for (let c = 0; c <= S; c += spb) {
      const x = -halfW + c * cellW;
      positions.push(x, -halfH - 0.03, 0, x, halfH + 0.03, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [S, stepsPerBeat, cellW, halfW, halfH]);
  useEffect(() => () => { try { beatGeom.dispose(); } catch (_) {} }, [beatGeom]);

  useFrame((state, delta) => {
    const mesh = instRef.current;
    const pattern = patternRef.current;
    const pulse = pulseRef.current;
    if (!mesh || !pattern || !pulse) return;

    const k = kitRef.current;

    // Compute scan rate from BPM
    const bpmRaw = bpmSync
      ? (Number.isFinite(globalThis && globalThis.VJ_BPM) ? globalThis.VJ_BPM : 120)
      : manualBpm;
    const bpm = Math.max(30, Math.min(260, bpmRaw));
    const scanRate = (bpm * Math.max(1, stepsPerBeat)) / 60;

    // Swing adjustment on alternating steps: odd steps are delayed
    // Effective advance per frame: base advance, but reduce/accelerate based on which step we're on
    const prevPos = scanPosRef.current;
    const baseAdvance = delta * scanRate;
    let nextPos = prevPos + baseAdvance;

    if (swing > 0) {
      const swingAmount = Math.min(0.45, swing);
      const curStep = Math.floor(nextPos) % 2;
      const factor = curStep === 1 ? (1.0 - swingAmount) : (1.0 + swingAmount);
      nextPos = prevPos + baseAdvance * factor;
    }

    if (nextPos >= S) {
      nextPos -= S;
      barsSinceEvolveRef.current += 1;
      if (evolveBars > 0 && barsSinceEvolveRef.current >= evolveBars) {
        barsSinceEvolveRef.current = 0;
        patternRef.current = buildPattern(S, density);
      }
    }
    scanPosRef.current = nextPos;
    const curCol = Math.floor(nextPos);

    // Trigger drums on column boundary crossing
    if (curCol !== lastColRef.current) {
      lastColRef.current = curCol;
      let ready = false;
      let now = 0;
      if (k && k.Tone) {
        try {
          if (k.Tone.context.state === 'suspended') k.Tone.context.resume();
          ready = k.Tone.context.state !== 'suspended';
          if (ready) now = k.Tone.now();
        } catch (_) {}
      }
      const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
      const ch = Math.max(1, Math.min(16, Math.round(midiChannel)));
      for (let r = 0; r < ROWS; r++) {
        const idx = curCol * ROWS + r;
        if (pattern[idx] === 1) {
          pulse[idx] = 1.0;
          const vel = 0.7 + Math.random() * 0.3;
          if (soundOn && ready && k && k.kit) {
            try {
              const trig = k.kit.triggers[r];
              if (trig) trig(now, vel);
            } catch (_) {}
          }
          if (midi && midi.sendNote) {
            try { midi.sendNote(ROW_MIDI_NOTES[r], vel, ch, 40); } catch (_) {}
          }
        }
      }
    }

    // Decay pulse values + update cell visuals
    const decay = delta * 8.0;
    for (let c = 0; c < S; c++) {
      for (let r = 0; r < ROWS; r++) {
        const i = c * ROWS + r;
        let p = pulse[i] - decay;
        if (p < 0) p = 0;
        pulse[i] = p;
        const on = pattern[i] === 1;
        const s = on ? (1 + p * 0.7) : 0;
        dummyObj.position.set(
          -halfW + (c + 0.5) * cellW,
          -halfH + (r + 0.5) * cellH,
          0
        );
        dummyObj.scale.setScalar(s);
        dummyObj.updateMatrix();
        mesh.setMatrixAt(i, dummyObj.matrix);
        if (on) {
          tmpColor.copy(rowColorObjs[r]);
          const bright = 0.55 + p * 0.55;
          tmpColor.multiplyScalar(bright);
          mesh.setColorAt(i, tmpColor);
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (scanRef.current) {
      scanRef.current.position.x = -halfW + (nextPos + 0.5) * cellW;
    }
  });

  return React.createElement('group', null,
    React.createElement('mesh', { ref: bgRef, position: [0, 0, -0.02] },
      React.createElement('planeGeometry', { args: [halfW * 2 + 0.2, halfH * 2 + 0.2] }),
      React.createElement('meshBasicMaterial', {
        color: '#000000',
        depthTest: false,
        depthWrite: false,
      })
    ),
    showBeats ? React.createElement('lineSegments', { ref: beatMarkersRef },
      React.createElement('primitive', { object: beatGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false,
      })
    ) : null,
    React.createElement('instancedMesh', {
      ref: instRef,
      args: [instGeom, instMat, totalCells],
    }),
    React.createElement('mesh', { ref: scanRef, position: [-halfW, 0, 0.01] },
      React.createElement('planeGeometry', { args: [Math.max(0.003, cellW * 0.14), 2 * halfH + 0.08] }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      })
    )
  );
}
