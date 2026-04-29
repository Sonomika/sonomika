// sonomika template – Glitch Codex: self-composing Ikeda-style polyrhythmic glitch drum system. Songs are generated as a sequence of algorithmic sections and auto-regenerated when they finish.
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Glitch Codex (MIDI)',
  description: 'Auto-composing glitch drum machine in the spirit of Ryoji Ikeda. A bank of 8 polyrhythmic voices (sub, click, blip, noise burst, stutter, metal, ring, grain) is arranged into multi-section songs that re-generate automatically. Rhythms are built from Euclidean patterns with per-section moods (null / grid / poly / wall / signal / reduction).',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'steps', type: 'number', value: 16, min: 8, max: 32, step: 1, description: 'steps per bar' },
    { name: 'barsPerSection', type: 'number', value: 8, min: 2, max: 32, step: 1 },
    { name: 'sectionsPerSong', type: 'number', value: 4, min: 2, max: 8, step: 1 },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 2, max: 8, step: 1, description: '4 = 16ths, 2 = 8ths' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 128, min: 60, max: 220, step: 1 },
    { name: 'intensity', type: 'number', value: 1.0, min: 0, max: 1.0, step: 0.05, description: 'hit probability multiplier' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output (route a virtual port into Ableton)' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
    { name: 'midiNoteBase', type: 'number', value: 36, min: 0, max: 108, step: 1, description: 'lowest voice note (ascending chromatically per row)' },
  ],
};

const VOICE_COUNT = 8;

function randInt(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); }

function euclid(k, n) {
  const pat = new Uint8Array(n);
  if (k <= 0) return pat;
  if (k >= n) { pat.fill(1); return pat; }
  for (let i = 0; i < k; i++) {
    pat[Math.floor((i * n) / k)] = 1;
  }
  return pat;
}

function shiftPattern(pat, offset) {
  const n = pat.length;
  const out = new Uint8Array(n);
  const o = ((offset % n) + n) % n;
  for (let i = 0; i < n; i++) {
    out[(i + o) % n] = pat[i];
  }
  return out;
}

// Per mood, per voice: [minK, maxK] range (at n=16), offset range, active probability.
const MOODS = [
  {
    name: 'null',
    voices: [
      { k: [1, 2], o: 0, p: 1.0 },  // SUB
      { k: [0, 1], o: 2, p: 0.3 },  // CLK
      { k: [0, 1], o: 0, p: 0.2 },  // BLP
      { k: [0, 0], o: 0, p: 0.0 },  // NZB
      { k: [0, 0], o: 0, p: 0.0 },  // STR
      { k: [0, 1], o: 4, p: 0.2 },  // MTL
      { k: [0, 0], o: 0, p: 0.0 },  // RNG
      { k: [2, 4], o: 0, p: 0.7 },  // GRN
    ],
  },
  {
    name: 'grid',
    voices: [
      { k: [4, 4], o: 0, p: 1.0 },
      { k: [12, 16], o: 0, p: 1.0 },
      { k: [2, 4], o: 0, p: 0.6 },
      { k: [2, 4], o: 2, p: 0.7 },
      { k: [0, 2], o: 4, p: 0.3 },
      { k: [1, 3], o: 0, p: 0.4 },
      { k: [0, 2], o: 0, p: 0.2 },
      { k: [10, 16], o: 1, p: 0.9 },
    ],
  },
  {
    name: 'poly',
    voices: [
      { k: [3, 3], o: 0, p: 1.0 },   // 3 in 16
      { k: [5, 5], o: 2, p: 1.0 },   // 5 in 16
      { k: [7, 7], o: 1, p: 0.8 },   // 7 in 16
      { k: [2, 2], o: 5, p: 0.5 },
      { k: [0, 1], o: 0, p: 0.3 },
      { k: [3, 5], o: 3, p: 0.6 },
      { k: [0, 2], o: 0, p: 0.3 },
      { k: [11, 11], o: 0, p: 0.6 },  // 11 in 16
    ],
  },
  {
    name: 'wall',
    voices: [
      { k: [4, 8], o: 0, p: 1.0 },
      { k: [10, 16], o: 0, p: 1.0 },
      { k: [6, 12], o: 2, p: 1.0 },
      { k: [4, 8], o: 1, p: 1.0 },
      { k: [2, 4], o: 0, p: 1.0 },
      { k: [4, 8], o: 3, p: 1.0 },
      { k: [2, 5], o: 0, p: 0.7 },
      { k: [14, 16], o: 0, p: 1.0 },
    ],
  },
  {
    name: 'signal',
    voices: [
      { k: [0, 2], o: 0, p: 0.3 },
      { k: [12, 16], o: 0, p: 1.0 },
      { k: [0, 0], o: 0, p: 0.0 },
      { k: [0, 0], o: 0, p: 0.0 },
      { k: [0, 0], o: 0, p: 0.0 },
      { k: [0, 0], o: 0, p: 0.0 },
      { k: [0, 0], o: 0, p: 0.0 },
      { k: [8, 12], o: 0, p: 0.7 },
    ],
  },
  {
    name: 'reduction',
    voices: [
      { k: [1, 4], o: 0, p: 0.8 },
      { k: [2, 5], o: 0, p: 0.6 },
      { k: [1, 3], o: 2, p: 0.5 },
      { k: [1, 3], o: 1, p: 0.4 },
      { k: [0, 2], o: 0, p: 0.3 },
      { k: [1, 3], o: 0, p: 0.5 },
      { k: [0, 2], o: 0, p: 0.3 },
      { k: [3, 7], o: 0, p: 0.6 },
    ],
  },
];

function genSection(steps) {
  const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
  const scale = steps / 16;
  const voicePatterns = [];
  for (let v = 0; v < VOICE_COUNT; v++) {
    const cfg = mood.voices[v];
    if (!cfg || Math.random() > cfg.p) {
      voicePatterns.push(new Uint8Array(steps));
      continue;
    }
    const minK = Math.max(0, Math.floor(cfg.k[0] * scale));
    const maxK = Math.max(minK, Math.ceil(cfg.k[1] * scale));
    const k = randInt(minK, maxK);
    let pat = euclid(k, steps);
    if (cfg.o > 0) pat = shiftPattern(pat, randInt(0, cfg.o));
    // Small per-step mutation: 4% chance to flip a bit
    for (let i = 0; i < steps; i++) {
      if (Math.random() < 0.04) pat[i] = pat[i] ? 0 : 1;
    }
    voicePatterns.push(pat);
  }
  return { mood: mood.name, voicePatterns };
}

function genSong(steps, sectionsPerSong) {
  const sections = [];
  for (let i = 0; i < sectionsPerSong; i++) {
    sections.push(genSection(steps));
  }
  return { sections };
}

export default function GlitchCodexAudioSource({
  steps = 16,
  barsPerSection = 8,
  sectionsPerSong = 4,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 128,
  intensity = 1.0,
  sendMidi = true,
  midiChannel = 10,
  midiNoteBase = 36,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;
  const halfH = 1;

  const S = Math.max(4, Math.floor(steps));
  const BPS = Math.max(1, Math.floor(barsPerSection));
  const SPS = Math.max(1, Math.floor(sectionsPerSong));

  const songRef = useRef(null);
  const posRef = useRef({ step: 0, bar: 0, section: 0, fractional: 0 });
  const lastStepRef = useRef(-1);
  const pulseRef = useRef(null);

  // Song init / regen when layout changes
  useEffect(() => {
    songRef.current = genSong(S, SPS);
    posRef.current = { step: 0, bar: 0, section: 0, fractional: 0 };
    lastStepRef.current = -1;
    pulseRef.current = new Float32Array(VOICE_COUNT * S);
  }, [S, SPS]);

  // --- Visual layout ---
  const trackTop = 0.72 * halfH;
  const trackBottom = -0.78 * halfH;
  const trackAreaH = trackTop - trackBottom;
  const rowH = trackAreaH / VOICE_COUNT;

  const gridLeft = -halfW * 0.9;
  const gridRight = halfW * 0.9;
  const gridWidth = gridRight - gridLeft;
  const cellW = gridWidth / S;
  const cellSize = Math.min(cellW, rowH) * 0.7;

  const instGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { instGeom.dispose(); } catch (_) {} }, [instGeom]);

  const instMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), []);
  useEffect(() => () => { try { instMat.dispose(); } catch (_) {} }, [instMat]);

  const totalCells = VOICE_COUNT * S;
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  const instRef = useRef(null);
  const scanRef = useRef(null);
  const progressFillRef = useRef(null);
  const sectionTickGroupRef = useRef(null);

  // Set matrices once
  useEffect(() => {
    const mesh = instRef.current;
    if (!mesh) return;
    for (let v = 0; v < VOICE_COUNT; v++) {
      for (let s = 0; s < S; s++) {
        const i = v * S + s;
        dummyObj.position.set(
          gridLeft + (s + 0.5) * cellW,
          trackBottom + rowH * (v + 0.5),
          0
        );
        dummyObj.scale.set(0, 0, 1);
        dummyObj.updateMatrix();
        mesh.setMatrixAt(i, dummyObj.matrix);
        mesh.setColorAt(i, new THREE.Color(0, 0, 0));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = totalCells;
  }, [S, cellW, rowH, gridLeft, trackBottom, totalCells, dummyObj]);

  // Voice-row guide lines (thin dim horizontal lines at each row bottom)
  const rowGuideGeom = useMemo(() => {
    const positions = [];
    for (let v = 0; v <= VOICE_COUNT; v++) {
      const y = trackBottom + v * rowH;
      positions.push(gridLeft - 0.02, y, 0, gridRight + 0.02, y, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [gridLeft, gridRight, trackBottom, rowH]);
  useEffect(() => () => { try { rowGuideGeom.dispose(); } catch (_) {} }, [rowGuideGeom]);

  // Section tick marks on progress bar
  const progressY = trackTop + 0.12;
  const progressBarW = (gridRight - gridLeft);
  const sectionTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= SPS; i++) {
      ticks.push({
        key: i,
        x: gridLeft + (i / SPS) * progressBarW,
      });
    }
    return ticks;
  }, [SPS, gridLeft, progressBarW]);

  useFrame((state, delta) => {
    const mesh = instRef.current;
    const pulse = pulseRef.current;
    const song = songRef.current;
    if (!mesh || !pulse || !song) return;

    const pos = posRef.current;

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 128;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(30, Math.min(260, bpmRaw));
    const stepRate = (bpm * Math.max(1, stepsPerBeat)) / 60;

    pos.fractional += Math.min(delta * stepRate, S * 2);
    while (pos.fractional >= 1.0) {
      pos.fractional -= 1.0;
      pos.step += 1;
      if (pos.step >= S) {
        pos.step = 0;
        pos.bar += 1;
        if (pos.bar >= BPS) {
          pos.bar = 0;
          pos.section += 1;
          if (pos.section >= SPS) {
            pos.section = 0;
            songRef.current = genSong(S, SPS);
          }
        }
      }
    }

    const curStep = pos.step;
    if (curStep !== lastStepRef.current) {
      lastStepRef.current = curStep;

      const section = songRef.current && songRef.current.sections[pos.section];
      if (section) {
        const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
        const ch = Math.max(1, Math.min(16, Math.round(midiChannel)));
        const baseNote = Math.max(0, Math.min(108, Math.round(midiNoteBase)));
        for (let v = 0; v < VOICE_COUNT; v++) {
          const pat = section.voicePatterns[v];
          if (pat && pat[curStep] === 1 && Math.random() < intensity) {
            const cellIdx = v * S + curStep;
            pulse[cellIdx] = 1.0;
            const vel = 0.5 + Math.random() * 0.5;
            if (midi && midi.sendNote) {
              try { midi.sendNote(baseNote + v, vel, ch, 40); } catch (_) {}
            }
          }
        }
      }
    }

    // Pulse decay + cell visuals
    const section = songRef.current && songRef.current.sections[pos.section];
    const decay = delta * 6.5;
    const baseSize = cellSize;
    for (let v = 0; v < VOICE_COUNT; v++) {
      const pat = section ? section.voicePatterns[v] : null;
      for (let s = 0; s < S; s++) {
        const i = v * S + s;
        let p = pulse[i] - decay;
        if (p < 0) p = 0;
        pulse[i] = p;
        const on = pat && pat[s] === 1;
        const scale = on ? baseSize * (0.95 + p * 0.55) : 0;
        dummyObj.position.set(
          gridLeft + (s + 0.5) * cellW,
          trackBottom + rowH * (v + 0.5),
          0
        );
        dummyObj.scale.set(scale, scale, 1);
        dummyObj.updateMatrix();
        mesh.setMatrixAt(i, dummyObj.matrix);
        const bright = on ? (0.26 + p * 0.74) : 0;
        tmpColor.setRGB(bright, bright, bright);
        mesh.setColorAt(i, tmpColor);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (scanRef.current) {
      const smoothStep = pos.step + pos.fractional;
      scanRef.current.position.x = gridLeft + (smoothStep + 0.5) * cellW;
    }

    if (progressFillRef.current) {
      const progress = (pos.section + (pos.bar + (pos.step + pos.fractional) / S) / BPS) / SPS;
      const w = Math.max(0.0001, progress * progressBarW);
      progressFillRef.current.scale.x = w;
      progressFillRef.current.position.x = gridLeft + w / 2;
    }
  });

  return React.createElement('group', null,
    React.createElement('mesh', { position: [0, 0, -0.02] },
      React.createElement('planeGeometry', { args: [halfW * 2 + 0.2, halfH * 2 + 0.2] }),
      React.createElement('meshBasicMaterial', {
        color: '#000000',
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      })
    ),

    // Voice row guide lines
    React.createElement('lineSegments', null,
      React.createElement('primitive', { object: rowGuideGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.1,
        depthTest: false,
        depthWrite: false,
      })
    ),

    // Instanced cell grid
    React.createElement('instancedMesh', {
      ref: instRef,
      args: [instGeom, instMat, totalCells],
    }),

    // Scan line across the grid
    React.createElement('mesh', { ref: scanRef, position: [gridLeft, (trackTop + trackBottom) / 2, 0.04] },
      React.createElement('planeGeometry', { args: [Math.max(0.003, cellW * 0.1), trackAreaH + 0.04] }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        depthWrite: false,
      })
    ),

    // Progress bar — dim background
    React.createElement('mesh', { position: [0, progressY, 0.02] },
      React.createElement('planeGeometry', { args: [progressBarW, 0.014] }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false,
      })
    ),

    // Progress bar — fill
    React.createElement('mesh', { ref: progressFillRef, position: [gridLeft, progressY, 0.03] },
      React.createElement('planeGeometry', { args: [1, 0.014] }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      })
    ),

    // Section dividers (small vertical ticks above progress bar)
    React.createElement('group', { ref: sectionTickGroupRef, position: [0, progressY, 0.04] },
      ...sectionTicks.map((t) =>
        React.createElement('mesh', { key: t.key, position: [t.x, 0, 0] },
          React.createElement('planeGeometry', { args: [0.006, 0.04] }),
          React.createElement('meshBasicMaterial', {
            color: '#ffffff',
            transparent: true,
            opacity: 0.55,
            depthTest: false,
            depthWrite: false,
          })
        )
      )
    )
  );
}
