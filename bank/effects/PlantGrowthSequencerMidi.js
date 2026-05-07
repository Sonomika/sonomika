const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Plant Growth Sequencer (MIDI OUT)',
  description: 'A circular plant sequencer where stems grow endlessly outward from the center and fire pentatonic MIDI notes as a rotating scan light passes.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'steps', type: 'number', value: 24, min: 8, max: 96, step: 1, description: 'Angular sequencer slices' },
    { name: 'lanes', type: 'number', value: 12, min: 4, max: 28, step: 1, description: 'Radial rings and note lanes' },
    { name: 'seedCount', type: 'number', value: 5, min: 1, max: 16, step: 1, description: 'Number of root sprouts' },
    { name: 'leafDensity', type: 'number', value: 0.46, min: 0.05, max: 0.95, step: 0.01, description: 'Chance of musical leaves on branches' },
    { name: 'branchChance', type: 'number', value: 0.34, min: 0, max: 0.9, step: 0.01, description: 'Chance of side branches while growing' },
    { name: 'growLoops', type: 'number', value: 5, min: 0, max: 32, step: 1, description: 'Loops for the visible growth wave to reach the outer ring; 0 = fully grown' },
    { name: 'evolveLoops', type: 'number', value: 0, min: 0, max: 32, step: 1, description: 'Regenerate the garden every N loops; 0 = endless additive growth' },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1, description: '4 = 16th-note scan movement' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM' },
    { name: 'manualBpm', type: 'number', value: 112, min: 40, max: 220, step: 1, description: 'BPM when sync is off' },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 20, min: 4, max: 48, step: 1, description: 'Pentatonic range from center to outer leaves' },
    { name: 'noteLength', type: 'number', value: 0.22, min: 0.03, max: 4, step: 0.01 },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05 },
    { name: 'maxNotesPerStep', type: 'number', value: 5, min: 1, max: 16, step: 1 },
    { name: 'stemColor', type: 'color', value: '#72ff9d' },
    { name: 'leafColor', type: 'color', value: '#ffffff' },
    { name: 'scanColor', type: 'color', value: '#7df9ff' },
    { name: 'glow', type: 'number', value: 0.75, min: 0, max: 2, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI notes when the scan reaches grown leaves' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_PLANT_GROWTH_SEQ_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_PLANT_GROWTH_SEQ_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 30;
const PENTATONIC = [0, 3, 5, 7, 10];

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

function randomInt(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

function wrapStep(step, stepCount) {
  return ((step % stepCount) + stepCount) % stepCount;
}

function setCell(pattern, step, lane, stepCount, laneCount, value) {
  if (lane < 0 || lane >= laneCount) return;
  const idx = lane * stepCount + wrapStep(step, stepCount);
  pattern[idx] = Math.max(pattern[idx], value);
}

function buildGarden(stepCount, laneCount, seedCount, leafDensity, branchChance) {
  const pattern = new Uint8Array(stepCount * laneCount);
  addSprouts(pattern, stepCount, laneCount, seedCount, leafDensity, branchChance);
  return pattern;
}

function addSprouts(pattern, stepCount, laneCount, seedCount, leafDensity, branchChance) {
  const seeds = Math.max(1, Math.floor(seedCount));
  const safeLeafDensity = clamp01(leafDensity);
  const safeBranchChance = clamp01(branchChance);

  for (let seed = 0; seed < seeds; seed++) {
    const rootStep = Math.round(((seed + 0.5) / seeds) * stepCount + randomInt(-1, 1));
    const height = randomInt(Math.max(2, Math.floor(laneCount * 0.45)), laneCount - 1);
    let bend = randomInt(-1, 1);

    for (let h = 0; h <= height; h++) {
      if (Math.random() < 0.22) bend += randomInt(-1, 1);
      bend = clamp(bend, -3, 3);

      const lane = h;
      const step = rootStep + Math.round(h * 0.55) + bend;
      const isTip = h === height;
      const isLeaf = isTip || (h > 1 && Math.random() < safeLeafDensity);
      setCell(pattern, step, lane, stepCount, laneCount, isLeaf ? 2 : 1);

      if (h > 1 && Math.random() < safeBranchChance) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const branchLength = randomInt(1, Math.max(1, Math.min(4, laneCount - h - 1)));
        for (let b = 1; b <= branchLength; b++) {
          const branchLane = lane + Math.floor(b * 0.65);
          const branchStep = step + side * b;
          const branchTip = b === branchLength;
          setCell(pattern, branchStep, branchLane, stepCount, laneCount, branchTip || Math.random() < safeLeafDensity ? 2 : 1);
        }
      }
    }
  }

  const beatStride = Math.max(1, Math.round(stepCount / 4));
  for (let step = 0; step < stepCount; step += beatStride) {
    let hasHit = false;
    for (let lane = 0; lane < laneCount; lane++) {
      if (pattern[lane * stepCount + step] > 0) {
        hasHit = true;
        break;
      }
    }
    if (!hasHit) {
      setCell(pattern, step, randomInt(1, Math.max(1, Math.floor(laneCount * 0.45))), stepCount, laneCount, 2);
    }
  }
}

function midiForLane(lane, laneCount, rootMidi, noteRange) {
  const maxLane = Math.max(1, laneCount - 1);
  const degree = Math.round((lane / maxLane) * Math.max(1, noteRange));
  const octave = Math.floor(degree / PENTATONIC.length) * 12;
  const interval = PENTATONIC[degree % PENTATONIC.length] + octave;
  return clamp(Math.round(rootMidi + interval), 0, 127);
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

export default function PlantGrowthSequencerMidi({
  steps = 24,
  lanes = 12,
  seedCount = 5,
  leafDensity = 0.46,
  branchChance = 0.34,
  growLoops = 5,
  evolveLoops = 0,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 112,
  rootMidi = 48,
  noteRange = 20,
  noteLength = 0.22,
  velocityBoost = 1.0,
  maxNotesPerStep = 5,
  stemColor = '#72ff9d',
  leafColor = '#ffffff',
  scanColor = '#7df9ff',
  glow = 0.75,
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

  const stemMeshRef = useRef(null);
  const leafMeshRef = useRef(null);
  const pulseMeshRef = useRef(null);
  const scanRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const patternRef = useRef(null);
  const pulseRef = useRef(null);
  const revealRef = useRef(null);
  const phaseRef = useRef(0);
  const lastStepRef = useRef(-1);
  const totalLoopsRef = useRef(0);
  const growthLoopsRef = useRef(0);
  const generationRef = useRef(0);

  const stepCount = Math.max(4, Math.floor(steps));
  const laneCount = Math.max(4, Math.floor(lanes));
  const cellCount = stepCount * laneCount;

  const dummyStem = useMemo(() => new THREE.Object3D(), []);
  const dummyLeaf = useMemo(() => new THREE.Object3D(), []);
  const dummyPulse = useMemo(() => new THREE.Object3D(), []);
  const stemGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const leafGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 20), []);
  const pulseGeometry = useMemo(() => new THREE.RingGeometry(0.38, 0.5, 24), []);
  const scanGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const stemMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(stemColor),
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [stemColor]);

  const leafMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(leafColor),
      transparent: true,
      opacity: 0.86,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [leafColor]);

  const pulseMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(scanColor),
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [scanColor]);

  const scanMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(scanColor),
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [scanColor]);

  useEffect(() => {
    ownerKeyRef.current = `plant-growth-seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    patternRef.current = buildGarden(stepCount, laneCount, seedCount, leafDensity, branchChance);
    pulseRef.current = new Float32Array(cellCount);
    revealRef.current = new Float32Array(cellCount);
    phaseRef.current = 0;
    lastStepRef.current = -1;
    totalLoopsRef.current = 0;
    growthLoopsRef.current = 0;
    generationRef.current = 0;
  }, [stepCount, laneCount, cellCount, seedCount, leafDensity, branchChance]);

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
    const stemMesh = stemMeshRef.current;
    const leafMesh = leafMeshRef.current;
    const pulseMesh = pulseMeshRef.current;
    const pattern = patternRef.current;
    const pulse = pulseRef.current;
    const reveal = revealRef.current;
    if (!stemMesh || !leafMesh || !pulseMesh || !pattern || !pulse || !reveal) return;

    const dt = clamp(delta || 0, 0, 0.1);
    const projectBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? projectBpm : manualBpm);
    const stepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);

    phaseRef.current += dt * stepsPerSec;
    while (phaseRef.current >= stepCount) {
      phaseRef.current -= stepCount;
      totalLoopsRef.current += 1;
      growthLoopsRef.current += 1;
      const evolveEvery = Math.max(0, Math.round(evolveLoops));
      if (evolveEvery > 0 && totalLoopsRef.current % evolveEvery === 0) {
        generationRef.current += 1;
        growthLoopsRef.current = 0;
        patternRef.current = buildGarden(stepCount, laneCount, seedCount, leafDensity, branchChance);
        pulseRef.current = new Float32Array(cellCount);
        revealRef.current = new Float32Array(cellCount);
      } else if (evolveEvery === 0) {
        const newSprouts = Math.max(1, Math.round(seedCount * 0.35));
        addSprouts(patternRef.current, stepCount, laneCount, newSprouts, leafDensity, branchChance);
      }
    }

    const growEvery = Math.max(0, Number(growLoops || 0));
    const currentStep = Math.floor(phaseRef.current);
    const loopSeconds = Math.max(0.001, stepCount / Math.max(0.001, stepsPerSec));
    const revealBase = growEvery <= 0 ? 1000 : dt / Math.max(0.001, loopSeconds * growEvery);

    if (currentStep !== lastStepRef.current) {
      lastStepRef.current = currentStep;
      const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
      const channel = clamp(Math.round(midiChannel), 1, 16);
      const durMs = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
      const maxNotes = Math.max(1, Math.floor(maxNotesPerStep));
      let sent = 0;

      for (let lane = laneCount - 1; lane >= 0 && sent < maxNotes; lane--) {
        const idx = lane * stepCount + currentStep;
        const cell = patternRef.current[idx];
        if (cell === 0) continue;

        revealRef.current[idx] = Math.max(revealRef.current[idx], 0.12);
        pulseRef.current[idx] = 1;
        const note = midiForLane(lane, laneCount, rootMidi, noteRange);
        const height = (laneCount - 1 - lane) / Math.max(1, laneCount - 1);
        const leafAccent = cell === 2 ? 0.18 : 0;
        const velocity = clamp((0.38 + height * 0.32 + leafAccent) * velocityBoost, 0.05, 1);
        const eventKey = `${generationRef.current}:${totalLoopsRef.current}:${currentStep}:${lane}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try { midi.sendNote(note, velocity, channel, durMs); } catch (_) {}
        }
        sent++;
      }
    }

    const outerRadius = Math.min(aspect, 1) * 0.92;
    const innerRadius = outerRadius * 0.12;
    const ringStep = (outerRadius - innerRadius) / Math.max(1, laneCount - 1);
    const angleStep = (Math.PI * 2) / Math.max(1, stepCount);
    const t = state && state.clock ? state.clock.elapsedTime : 0;
    let stemCount = 0;
    let leafCount = 0;
    let pulseCount = 0;

    for (let lane = 0; lane < laneCount; lane++) {
      for (let step = 0; step < stepCount; step++) {
        const idx = lane * stepCount + step;
        const cell = patternRef.current[idx];
        if (!cell) continue;

        pulseRef.current[idx] *= Math.pow(0.84, dt * 60);
        const radialGain = 0.75 + lane / Math.max(1, laneCount - 1) * 0.55;
        revealRef.current[idx] = clamp01(revealRef.current[idx] + revealBase * radialGain);
        const maturity = revealRef.current[idx];
        if (maturity <= 0.001) continue;

        const angle = (step / Math.max(1, stepCount)) * Math.PI * 2 - Math.PI * 0.5;
        const radial = innerRadius + ringStep * lane * (0.22 + maturity * 0.78);
        const sway = Math.sin(t * 0.9 + lane * 1.7 + step * 0.4) * angleStep * 0.045;
        const drawAngle = angle + sway;
        const x = Math.cos(drawAngle) * radial;
        const y = Math.sin(drawAngle) * radial;
        const radialRotation = drawAngle - Math.PI * 0.5;
        const stemLength = Math.max(0.012, ringStep * (0.36 + maturity * 0.68));
        const stemWidth = Math.max(0.004, ringStep * (0.055 + glow * 0.012));

        dummyStem.position.set(x, y, 0.02);
        dummyStem.rotation.z = radialRotation;
        dummyStem.scale.set(stemWidth, stemLength, 1);
        dummyStem.updateMatrix();
        stemMesh.setMatrixAt(stemCount, dummyStem.matrix);
        stemCount++;

        if (cell === 2) {
          const side = ((step * 17 + lane * 31) % 2) === 0 ? -1 : 1;
          const tangentX = -Math.sin(drawAngle);
          const tangentY = Math.cos(drawAngle);
          const leafOffset = ringStep * 0.16 * side;
          dummyLeaf.position.set(x + tangentX * leafOffset, y + tangentY * leafOffset, 0.04);
          dummyLeaf.rotation.z = radialRotation + side * (0.72 + Math.sin(t + step) * 0.08);
          dummyLeaf.scale.set(ringStep * (0.46 + maturity * 0.16), ringStep * (0.24 + maturity * 0.08), 1);
          dummyLeaf.updateMatrix();
          leafMesh.setMatrixAt(leafCount, dummyLeaf.matrix);
          leafCount++;
        }

        const pulseAmount = pulseRef.current[idx];
        if (pulseAmount > 0.01) {
          const pulseScale = 0.35 + (1 - pulseAmount) * 0.8 + glow * 0.08;
          dummyPulse.position.set(x, y, 0.06);
          dummyPulse.rotation.z = t * 0.7;
          dummyPulse.scale.set(ringStep * pulseScale, ringStep * pulseScale, 1);
          dummyPulse.updateMatrix();
          pulseMesh.setMatrixAt(pulseCount, dummyPulse.matrix);
          pulseCount++;
        }
      }
    }

    stemMesh.count = stemCount;
    leafMesh.count = leafCount;
    pulseMesh.count = pulseCount;
    stemMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    pulseMesh.instanceMatrix.needsUpdate = true;

    stemMaterial.color.set(stemColor);
    stemMaterial.opacity = clamp(0.46 + glow * 0.22, 0.05, 0.95);
    leafMaterial.color.set(leafColor);
    leafMaterial.opacity = clamp(0.6 + glow * 0.18, 0.05, 1);
    pulseMaterial.color.set(scanColor);
    pulseMaterial.opacity = clamp(0.48 + glow * 0.22, 0.05, 1);
    scanMaterial.color.set(scanColor);
    scanMaterial.opacity = clamp(0.12 + glow * 0.18, 0.02, 0.8);

    if (scanRef.current) {
      const scanAngle = (phaseRef.current / Math.max(1, stepCount)) * Math.PI * 2 - Math.PI * 0.5;
      scanRef.current.position.set(Math.cos(scanAngle) * outerRadius * 0.5, Math.sin(scanAngle) * outerRadius * 0.5, 0.01);
      scanRef.current.rotation.z = scanAngle - Math.PI * 0.5;
      scanRef.current.scale.set(Math.max(0.01, ringStep * 0.22), outerRadius, 1);
    }
  });

  return React.createElement('group', {},
    React.createElement('mesh', { ref: scanRef, renderOrder: 9998 },
      React.createElement('primitive', { object: scanGeometry, attach: 'geometry' }),
      React.createElement('primitive', { object: scanMaterial, attach: 'material' })
    ),
    React.createElement('instancedMesh', {
      ref: stemMeshRef,
      args: [stemGeometry, stemMaterial, Math.max(1, cellCount)],
      renderOrder: 9999,
    }),
    React.createElement('instancedMesh', {
      ref: leafMeshRef,
      args: [leafGeometry, leafMaterial, Math.max(1, cellCount)],
      renderOrder: 10000,
    }),
    React.createElement('instancedMesh', {
      ref: pulseMeshRef,
      args: [pulseGeometry, pulseMaterial, Math.max(1, cellCount)],
      renderOrder: 10001,
    })
  );
}
