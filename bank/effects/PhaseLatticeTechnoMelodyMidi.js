const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Phase Lattice Techno Melody (MIDI)',
  description: 'A minimal hypnotic techno melody generator: sparse notes on a grid are played by several offset clocks that slowly phase against each other.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'steps', type: 'number', value: 16, min: 8, max: 64, step: 1, description: 'Horizontal lattice steps' },
    { name: 'notes', type: 'number', value: 8, min: 3, max: 16, step: 1, description: 'Vertical melody notes' },
    { name: 'clocks', type: 'number', value: 3, min: 1, max: 6, step: 1, description: 'Independent phased playheads' },
    { name: 'density', type: 'number', value: 0.28, min: 0.04, max: 0.85, step: 0.01, description: 'How many points are active' },
    { name: 'complexity', type: 'number', value: 0.68, min: 0, max: 1, step: 0.01, description: 'More phasing and row variation' },
    { name: 'mutation', type: 'number', value: 0.025, min: 0, max: 0.35, step: 0.005, description: 'Slow pattern changes per loop' },
    { name: 'phaseSpread', type: 'number', value: 5, min: 0, max: 16, step: 1, description: 'Clock offsets in steps' },
    { name: 'transposeDrift', type: 'boolean', value: true, description: 'Slowly shift the scale root for long hypnosis' },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1, description: '4 = 16th-note primary clock' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM' },
    { name: 'manualBpm', type: 'number', value: 134, min: 40, max: 220, step: 1 },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 19, min: 4, max: 48, step: 1, description: 'Scale range from low to high rows' },
    { name: 'gate', type: 'number', value: 0.13, min: 0.03, max: 1.5, step: 0.01, description: 'MIDI note length in seconds' },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05 },
    { name: 'maxNotesPerStep', type: 'number', value: 3, min: 1, max: 12, step: 1 },
    { name: 'dotColor', type: 'color', value: '#ffffff' },
    { name: 'cursorColor', type: 'color', value: '#7df9ff' },
    { name: 'pulseColor', type: 'color', value: '#ffffff' },
    { name: 'glow', type: 'number', value: 0.78, min: 0, max: 2, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI notes from lattice hits' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_PHASE_LATTICE_TECHNO_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_PHASE_LATTICE_TECHNO_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 22;
const SCALE = [0, 2, 3, 5, 7, 10, 12, 14, 15, 17, 19, 22];
const CLOCK_RATIOS = [1, 1.5, 0.75, 1.25, 1.75, 0.5];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

function wrapIndex(value, count) {
  return ((value % count) + count) % count;
}

function euclideanHit(step, pulses, steps, offset) {
  if (pulses <= 0) return false;
  if (pulses >= steps) return true;
  const a = Math.floor(((step + offset) * pulses) / steps);
  const b = Math.floor((((step + offset) - 1) * pulses) / steps);
  return a !== b;
}

function buildPattern(stepCount, rowCount, density, complexity) {
  const pattern = new Uint8Array(stepCount * rowCount);
  const d = clamp01(density);
  const c = clamp01(complexity);

  for (let row = 0; row < rowCount; row++) {
    const rowLift = row / Math.max(1, rowCount - 1);
    const pulses = clamp(Math.round(stepCount * d * (0.45 + rowLift * 0.5 + c * 0.25)), 1, stepCount);
    const offset = Math.floor(Math.random() * stepCount);
    const accentEvery = Math.max(2, Math.round(stepCount / (2 + ((row + 1) % 4))));

    for (let step = 0; step < stepCount; step++) {
      const stable = euclideanHit(step, pulses, stepCount, offset);
      const ghost = Math.random() < d * c * 0.18;
      if (!stable && !ghost) continue;

      const idx = row * stepCount + step;
      pattern[idx] = step % accentEvery === 0 || Math.random() < 0.08 + rowLift * 0.08 ? 2 : 1;
    }
  }

  return pattern;
}

function mutatePattern(pattern, stepCount, rowCount, density, mutation) {
  const chance = clamp01(mutation);
  const d = clamp01(density);
  for (let row = 0; row < rowCount; row++) {
    for (let step = 0; step < stepCount; step++) {
      if (Math.random() >= chance) continue;
      const idx = row * stepCount + step;
      if (pattern[idx]) {
        pattern[idx] = Math.random() < 0.62 ? 0 : (pattern[idx] === 1 ? 2 : 1);
      } else if (Math.random() < d) {
        pattern[idx] = Math.random() < 0.22 ? 2 : 1;
      }
    }
  }
}

function midiForRow(row, rowCount, rootMidi, noteRange, transpose) {
  const amount = row / Math.max(1, rowCount - 1);
  const degree = Math.round(amount * Math.max(1, noteRange));
  const octave = Math.floor(degree / SCALE.length) * 12;
  const interval = SCALE[degree % SCALE.length] + octave;
  return clamp(Math.round(rootMidi + transpose + interval), 0, 127);
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

export default function PhaseLatticeTechnoMelodyMidi({
  steps = 16,
  notes = 8,
  clocks = 3,
  density = 0.28,
  complexity = 0.68,
  mutation = 0.025,
  phaseSpread = 5,
  transposeDrift = true,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 134,
  rootMidi = 48,
  noteRange = 19,
  gate = 0.13,
  velocityBoost = 1.0,
  maxNotesPerStep = 3,
  dotColor = '#ffffff',
  cursorColor = '#7df9ff',
  pulseColor = '#ffffff',
  glow = 0.78,
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

  const dotMeshRef = useRef(null);
  const accentMeshRef = useRef(null);
  const pulseMeshRef = useRef(null);
  const cursorMeshRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const patternRef = useRef(null);
  const pulseRef = useRef(null);
  const phasesRef = useRef(null);
  const lastStepsRef = useRef(null);
  const loopRef = useRef(0);
  const transposeRef = useRef(0);

  const stepCount = Math.max(8, Math.floor(steps));
  const rowCount = Math.max(3, Math.floor(notes));
  const clockCount = Math.max(1, Math.floor(clocks));
  const cellCount = stepCount * rowCount;

  const dummyDot = useMemo(() => new THREE.Object3D(), []);
  const dummyAccent = useMemo(() => new THREE.Object3D(), []);
  const dummyPulse = useMemo(() => new THREE.Object3D(), []);
  const dummyCursor = useMemo(() => new THREE.Object3D(), []);
  const dotGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 18), []);
  const accentGeometry = useMemo(() => new THREE.RingGeometry(0.36, 0.5, 24), []);
  const pulseGeometry = useMemo(() => new THREE.RingGeometry(0.34, 0.5, 28), []);
  const cursorGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const dotMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(dotColor),
      transparent: true,
      opacity: 0.68,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [dotColor]);

  const accentMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cursorColor),
      transparent: true,
      opacity: 0.78,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [cursorColor]);

  const pulseMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(pulseColor),
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [pulseColor]);

  const cursorMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cursorColor),
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [cursorColor]);

  useEffect(() => {
    ownerKeyRef.current = `phase-lattice-techno-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    patternRef.current = buildPattern(stepCount, rowCount, density, complexity);
    pulseRef.current = new Float32Array(cellCount);
    phasesRef.current = new Float32Array(clockCount);
    lastStepsRef.current = new Int16Array(clockCount);
    for (let i = 0; i < clockCount; i++) {
      phasesRef.current[i] = i * Math.max(0, phaseSpread);
      lastStepsRef.current[i] = -1;
    }
    loopRef.current = 0;
    transposeRef.current = 0;
  }, [stepCount, rowCount, clockCount, cellCount, density, complexity, phaseSpread]);

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

  useFrame((state, delta) => {
    const dotMesh = dotMeshRef.current;
    const accentMesh = accentMeshRef.current;
    const pulseMesh = pulseMeshRef.current;
    const cursorMesh = cursorMeshRef.current;
    const pattern = patternRef.current;
    const pulse = pulseRef.current;
    const phases = phasesRef.current;
    const lastSteps = lastStepsRef.current;
    if (!dotMesh || !accentMesh || !pulseMesh || !cursorMesh || !pattern || !pulse || !phases || !lastSteps) return;

    const dt = clamp(delta || 0, 0, 0.1);
    const projectBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? projectBpm : manualBpm);
    const baseStepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);
    const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
    const channel = clamp(Math.round(midiChannel), 1, 16);
    const durMs = Math.max(5, Math.round(Math.max(0.03, gate) * 1000));
    let notesThisFrame = 0;

    for (let clock = 0; clock < clockCount; clock++) {
      const before = Math.floor(phases[clock]);
      const ratio = CLOCK_RATIOS[clock % CLOCK_RATIOS.length] + clock * 0.005 * clamp01(complexity);
      phases[clock] += dt * baseStepsPerSec * ratio;
      while (phases[clock] >= stepCount) {
        phases[clock] -= stepCount;
        if (clock === 0) {
          loopRef.current += 1;
          mutatePattern(patternRef.current, stepCount, rowCount, density, mutation);
          if (transposeDrift && loopRef.current % 8 === 0) {
            transposeRef.current = wrapIndex(transposeRef.current + (Math.random() < 0.5 ? 5 : 7), 12);
          }
        }
      }

      const currentStep = Math.floor(phases[clock]);
      if (currentStep === before || currentStep === lastSteps[clock]) continue;
      lastSteps[clock] = currentStep;

      for (let row = rowCount - 1; row >= 0 && notesThisFrame < Math.max(1, Math.floor(maxNotesPerStep)); row--) {
        const idx = row * stepCount + currentStep;
        const cell = patternRef.current[idx];
        if (!cell) continue;

        pulseRef.current[idx] = 1;
        const accent = cell === 2 || clock === 0;
        const note = midiForRow(row, rowCount, rootMidi, noteRange, transposeRef.current + (clock > 0 && accent ? 12 : 0));
        const rowLift = row / Math.max(1, rowCount - 1);
        const velocity = clamp((0.36 + rowLift * 0.28 + (accent ? 0.22 : 0) + clock * 0.025) * velocityBoost, 0.05, 1);
        const eventKey = `${loopRef.current}:${clock}:${currentStep}:${row}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try { midi.sendNote(note, velocity, channel, durMs); } catch (_) {}
        }
        notesThisFrame++;
      }
    }

    const gridW = Math.min(aspect * 1.55, 1.78);
    const gridH = 1.32;
    const cellW = gridW / Math.max(1, stepCount - 1);
    const cellH = gridH / Math.max(1, rowCount - 1);
    const left = -gridW * 0.5;
    const bottom = -gridH * 0.5;
    const t = state && state.clock ? state.clock.elapsedTime : 0;
    let dotCount = 0;
    let accentCount = 0;
    let pulseCount = 0;

    for (let row = 0; row < rowCount; row++) {
      for (let step = 0; step < stepCount; step++) {
        const idx = row * stepCount + step;
        const cell = patternRef.current[idx];
        if (!cell) continue;

        pulseRef.current[idx] *= Math.pow(0.8, dt * 60);
        const x = left + step * cellW;
        const y = bottom + row * cellH;
        const breathe = 1 + Math.sin(t * 1.9 + row * 1.3 + step * 0.21) * 0.055;
        const size = Math.min(cellW, cellH) * (0.28 + glow * 0.045) * breathe;

        dummyDot.position.set(x, y, 0.03);
        dummyDot.rotation.z = t * 0.08;
        dummyDot.scale.set(size, size, 1);
        dummyDot.updateMatrix();
        dotMesh.setMatrixAt(dotCount, dummyDot.matrix);
        dotCount++;

        if (cell === 2) {
          dummyAccent.position.set(x, y, 0.04);
          dummyAccent.rotation.z = -t * 0.18;
          dummyAccent.scale.set(size * 2.0, size * 2.0, 1);
          dummyAccent.updateMatrix();
          accentMesh.setMatrixAt(accentCount, dummyAccent.matrix);
          accentCount++;
        }

        const pulseAmount = pulseRef.current[idx];
        if (pulseAmount > 0.01) {
          const pulseSize = size * (2.2 + (1 - pulseAmount) * 4.2);
          dummyPulse.position.set(x, y, 0.06);
          dummyPulse.rotation.z = t * 0.5;
          dummyPulse.scale.set(pulseSize, pulseSize, 1);
          dummyPulse.updateMatrix();
          pulseMesh.setMatrixAt(pulseCount, dummyPulse.matrix);
          pulseCount++;
        }
      }
    }

    for (let clock = 0; clock < clockCount; clock++) {
      const step = Math.floor(phases[clock]);
      const x = left + step * cellW;
      dummyCursor.position.set(x, 0, 0.01 + clock * 0.002);
      dummyCursor.rotation.z = 0;
      dummyCursor.scale.set(cellW * (0.13 + clock * 0.025), gridH * (1.0 - clock * 0.045), 1);
      dummyCursor.updateMatrix();
      cursorMesh.setMatrixAt(clock, dummyCursor.matrix);
    }

    dotMesh.count = dotCount;
    accentMesh.count = accentCount;
    pulseMesh.count = pulseCount;
    cursorMesh.count = clockCount;
    dotMesh.instanceMatrix.needsUpdate = true;
    accentMesh.instanceMatrix.needsUpdate = true;
    pulseMesh.instanceMatrix.needsUpdate = true;
    cursorMesh.instanceMatrix.needsUpdate = true;

    dotMaterial.color.set(dotColor);
    dotMaterial.opacity = clamp(0.34 + glow * 0.2, 0.05, 0.9);
    accentMaterial.color.set(cursorColor);
    accentMaterial.opacity = clamp(0.44 + glow * 0.24, 0.05, 1);
    pulseMaterial.color.set(pulseColor);
    pulseMaterial.opacity = clamp(0.48 + glow * 0.24, 0.05, 1);
    cursorMaterial.color.set(cursorColor);
    cursorMaterial.opacity = clamp(0.08 + glow * 0.16, 0.02, 0.65);
  });

  return React.createElement('group', {},
    React.createElement('instancedMesh', {
      ref: cursorMeshRef,
      args: [cursorGeometry, cursorMaterial, Math.max(1, clockCount)],
      renderOrder: 9998,
    }),
    React.createElement('instancedMesh', {
      ref: dotMeshRef,
      args: [dotGeometry, dotMaterial, Math.max(1, cellCount)],
      renderOrder: 9999,
    }),
    React.createElement('instancedMesh', {
      ref: accentMeshRef,
      args: [accentGeometry, accentMaterial, Math.max(1, cellCount)],
      renderOrder: 10000,
    }),
    React.createElement('instancedMesh', {
      ref: pulseMeshRef,
      args: [pulseGeometry, pulseMaterial, Math.max(1, cellCount)],
      renderOrder: 10001,
    })
  );
}
