const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Mirror Crash Sequencer (MIDI)',
  description: 'A stark monochrome sequencer where mirrored packets crash at the center and split outward like data impacts.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 7, min: 3, max: 12, step: 1 },
    { name: 'steps', type: 'number', value: 20, min: 8, max: 40, step: 1 },
    { name: 'density', type: 'number', value: 0.34, min: 0.05, max: 0.85, step: 0.02 },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1, description: '4 = 16th-note impacts' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 126, min: 40, max: 220, step: 1 },
    { name: 'evolveLoops', type: 'number', value: 4, min: 0, max: 16, step: 1, description: 'rebuild the crash map every N cycles (0 = static)' },
    { name: 'flowMode', type: 'select', value: 'cutup', options: ['forward', 'pendulum', 'cutup'], description: 'how the step cursor moves through the memory bands' },
    { name: 'glitchChance', type: 'number', value: 0.2, min: 0, max: 1, step: 0.02, description: 'chance of step holds, jumps, and reversals' },
    { name: 'noteMode', type: 'select', value: 'single', options: ['row', 'single'], description: 'play all active lanes or just one crash per step' },
    { name: 'gapChance', type: 'number', value: 0.12, min: 0, max: 1, step: 0.02, description: 'chance that the current impact is silent and blank' },
    { name: 'spread', type: 'number', value: 0.72, min: 0.2, max: 1, step: 0.02, description: 'how far the packets split from the center' },
    { name: 'decay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.02, description: 'how long impact flashes persist' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.16, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_MIRROR_CRASH_SEQ_OWNER__';
const OWNER_LEASE_MS = 250;
const MAX_DT = 0.1;
const MAX_STEP_EVENTS_PER_FRAME = 16;

function midiForLane(lane, rootMidi) {
  return Math.round(rootMidi) + lane;
}

function wrapStep(step, stepCount) {
  const mod = step % stepCount;
  return mod < 0 ? mod + stepCount : mod;
}

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_MIRROR_CRASH_SEQ_LAST__';
    const now = (globalThis.performance && typeof globalThis.performance.now === 'function')
      ? globalThis.performance.now()
      : Date.now();
    const store = globalThis[slot] || {};
    const lastAt = typeof store[eventKey] === 'number' ? store[eventKey] : -Infinity;
    if ((now - lastAt) < 120) return false;
    store[eventKey] = now;
    globalThis[slot] = store;
    return true;
  } catch (_) {
    return true;
  }
}

function buildPattern(stepCount, laneCount, density) {
  const pat = new Uint8Array(stepCount * laneCount);
  const beatStride = Math.max(1, Math.round(stepCount / 4));
  for (let step = 0; step < stepCount; step++) {
    let lit = false;
    for (let lane = 0; lane < laneCount; lane++) {
      const idx = step * laneCount + lane;
      const accent = (step % beatStride) === 0 ? 0.2 : 0;
      const chance = Math.min(0.94, Math.max(0.04, density + accent - lane * 0.018));
      pat[idx] = Math.random() < chance ? 1 : 0;
      if (pat[idx]) lit = true;
    }
    if (!lit) {
      pat[step * laneCount + Math.floor(Math.random() * laneCount)] = 1;
    }
  }
  return pat;
}

function advanceStep(currentStep, direction, stepCount, flowMode, glitchChance) {
  const hasGlitch = Math.random() < glitchChance;
  let nextDir = direction >= 0 ? 1 : -1;

  if (flowMode === 'forward') {
    if (hasGlitch && Math.random() < 0.3) {
      return { step: currentStep, direction: 1, travelUnits: 1 };
    }
    const jump = hasGlitch ? Math.max(2, Math.min(5, 2 + Math.floor(Math.random() * 4))) : 1;
    return {
      step: wrapStep(currentStep + jump, stepCount),
      direction: 1,
      travelUnits: jump,
    };
  }

  if (flowMode === 'cutup') {
    if (hasGlitch && Math.random() < 0.32) {
      return {
        step: Math.floor(Math.random() * stepCount),
        direction: Math.random() < 0.5 ? -1 : 1,
        travelUnits: Math.max(1, Math.floor(stepCount * 0.5)),
      };
    }
    if (hasGlitch && Math.random() < 0.28) nextDir = -nextDir;
    if (hasGlitch && Math.random() < 0.22) {
      return { step: currentStep, direction: nextDir, travelUnits: 1 };
    }
    const jump = hasGlitch ? Math.max(2, Math.min(4, 2 + Math.floor(Math.random() * 3))) : 1;
    return {
      step: wrapStep(currentStep + nextDir * jump, stepCount),
      direction: nextDir,
      travelUnits: jump,
    };
  }

  if (currentStep <= 0) nextDir = 1;
  else if (currentStep >= stepCount - 1) nextDir = -1;
  if (hasGlitch && Math.random() < 0.28) nextDir = -nextDir;
  if (hasGlitch && Math.random() < 0.2) {
    return { step: currentStep, direction: nextDir, travelUnits: 1 };
  }
  const jump = hasGlitch ? Math.max(2, Math.min(4, 2 + Math.floor(Math.random() * 3))) : 1;
  let nextStep = currentStep;
  let travelUnits = 0;
  for (let i = 0; i < jump; i++) {
    if (nextStep <= 0 && nextDir < 0) nextDir = 1;
    else if (nextStep >= stepCount - 1 && nextDir > 0) nextDir = -1;
    nextStep += nextDir;
    travelUnits += 1;
  }
  return {
    step: Math.max(0, Math.min(stepCount - 1, nextStep)),
    direction: nextDir,
    travelUnits,
  };
}

function createPreview(stepCount, laneCount, halfW) {
  const cells = [];
  const bandOuter = halfW * 0.92;
  const bandInner = halfW * 0.68;
  for (let step = 0; step < stepCount; step++) {
    const tStep = stepCount > 1 ? step / (stepCount - 1) : 0;
    const xLeft = -bandOuter + (bandOuter - bandInner) * tStep;
    const xRight = bandInner + (bandOuter - bandInner) * tStep;
    for (let lane = 0; lane < laneCount; lane++) {
      const tLane = laneCount > 1 ? lane / (laneCount - 1) : 0.5;
      const y = 0.82 - tLane * 1.64;
      const h = 0.045 + (1 - Math.abs(tLane - 0.5) * 2) * 0.01;
      cells.push({ step, lane, side: 0, x: xLeft, y, w: 0.008, h });
      cells.push({ step, lane, side: 1, x: xRight, y, w: 0.008, h });
    }
  }
  return cells;
}

export default function MirrorCrashSequencerMidiSource({
  lanes = 7,
  steps = 20,
  density = 0.34,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 126,
  evolveLoops = 4,
  flowMode = 'cutup',
  glitchChance = 0.2,
  noteMode = 'single',
  gapChance = 0.12,
  spread = 0.72,
  decay = 0.4,
  rootMidi = 36,
  noteLength = 0.16,
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;

  const laneCount = Math.max(3, Math.floor(lanes));
  const stepCount = Math.max(8, Math.floor(steps));
  const edgeX = halfW * Math.max(0.24, Math.min(0.82, spread));
  const laneYs = useMemo(
    () => Array.from({ length: laneCount }, (_, lane) => {
      const t = laneCount > 1 ? lane / (laneCount - 1) : 0.5;
      return 0.82 - t * 1.64;
    }),
    [laneCount]
  );

  const previewCells = useMemo(
    () => createPreview(stepCount, laneCount, halfW),
    [stepCount, laneCount, halfW]
  );

  const bgRef = useRef(null);
  const packetRef = useRef(null);
  const flashRef = useRef(null);
  const previewRef = useRef(null);
  const centerRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const pulseRef = useRef(null);
  const activeLanesRef = useRef([]);
  const currentStepRef = useRef(0);
  const fromStepRef = useRef(0);
  const stepElapsedRef = useRef(0);
  const directionRef = useRef(1);
  const travelUnitsRef = useRef(0);
  const loopCountRef = useRef(0);
  const stepPulseRef = useRef(0);
  const gapStepRef = useRef(-1);
  const singleLaneRef = useRef(-1);
  const needsInitialStepRef = useRef(true);

  const patternRef = useRef(buildPattern(stepCount, laneCount, density));

  useEffect(() => {
    pulseRef.current = new Float32Array(laneCount);
    activeLanesRef.current = [];
    currentStepRef.current = 0;
    fromStepRef.current = 0;
    stepElapsedRef.current = 0;
    directionRef.current = 1;
    travelUnitsRef.current = 0;
    loopCountRef.current = 0;
    stepPulseRef.current = 0;
    gapStepRef.current = -1;
    singleLaneRef.current = -1;
    needsInitialStepRef.current = true;
  }, [laneCount]);

  useEffect(() => {
    patternRef.current = buildPattern(stepCount, laneCount, density);
    if (pulseRef.current) pulseRef.current.fill(0);
    activeLanesRef.current = [];
    currentStepRef.current = 0;
    fromStepRef.current = 0;
    stepElapsedRef.current = 0;
    directionRef.current = 1;
    travelUnitsRef.current = 0;
    loopCountRef.current = 0;
    stepPulseRef.current = 0;
    gapStepRef.current = -1;
    singleLaneRef.current = -1;
    needsInitialStepRef.current = true;
  }, [stepCount, laneCount, density, flowMode, glitchChance, noteMode, gapChance]);

  const claimMidiOwnership = () => {
    try {
      const now = (globalThis.performance && typeof globalThis.performance.now === 'function')
        ? globalThis.performance.now()
        : Date.now();
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

  useEffect(() => {
    const myKey = `mirror-crash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ownerKeyRef.current = myKey;
    try {
      if (!globalThis[OWNER_SLOT]) {
        globalThis[OWNER_SLOT] = {
          key: myKey,
          expiresAt: ((globalThis.performance && typeof globalThis.performance.now === 'function')
            ? globalThis.performance.now()
            : Date.now()) + OWNER_LEASE_MS,
        };
      }
    } catch (_) {}
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  const planeGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { planeGeom.dispose(); } catch (_) {} }, [planeGeom]);

  const bgGeom = useMemo(() => new THREE.PlaneGeometry(halfW * 2, 2), [halfW]);
  useEffect(() => () => { try { bgGeom.dispose(); } catch (_) {} }, [bgGeom]);

  const packetMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { packetMat.dispose(); } catch (_) {} }, [packetMat]);

  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { flashMat.dispose(); } catch (_) {} }, [flashMat]);

  const previewMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  }), []);
  useEffect(() => () => { try { previewMat.dispose(); } catch (_) {} }, [previewMat]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    const dt = Math.min(MAX_DT, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const packetMesh = packetRef.current;
    const flashMesh = flashRef.current;
    const previewMesh = previewRef.current;
    const pulse = pulseRef.current;
    if (!packetMesh || !flashMesh || !previewMesh || !pulse) return;

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 126;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(1, bpmRaw);
    const stepDurationSec = 1 / Math.max(0.25, Math.max(0.25, stepsPerBeat) * (bpm / 60));
    const glitchChanceClamped = Math.max(0, Math.min(1, glitchChance));
    const gapChanceClamped = Math.max(0, Math.min(1, gapChance));
    const decayRate = 2.5 + (1 - Math.max(0, Math.min(1, decay))) * 5.2;
    const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
    const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));

    const triggerStep = (stepIndex) => {
      stepPulseRef.current = 1;
      gapStepRef.current = -1;
      activeLanesRef.current = [];
      singleLaneRef.current = -1;

      if (Math.random() < gapChanceClamped) {
        gapStepRef.current = stepIndex;
        return;
      }

      const activeEntries = [];
      for (let lane = 0; lane < laneCount; lane++) {
        if (!patternRef.current[stepIndex * laneCount + lane]) continue;
        activeEntries.push(lane);
      }
      if (activeEntries.length === 0) return;

      const lanesToPlay = noteMode === 'single'
        ? [activeEntries[(loopCountRef.current + stepIndex) % activeEntries.length]]
        : activeEntries;

      activeLanesRef.current = lanesToPlay;
      singleLaneRef.current = noteMode === 'single' ? lanesToPlay[0] : -1;

      for (let i = 0; i < lanesToPlay.length; i++) {
        const lane = lanesToPlay[i];
        pulse[lane] = 1;
        const note = Math.max(0, Math.min(127, midiForLane(lane, rootMidi)));
        const velocity = Math.max(0.35, Math.min(1, 0.78 + (1 - lane / laneCount) * 0.16));
        const durMs = Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000));
        const eventKey = `${loopCountRef.current}:${stepIndex}:${lane}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try {
            midi.sendNote(note, velocity, channel, durMs);
          } catch (_) {}
        }
      }
    };

    if (needsInitialStepRef.current) {
      triggerStep(currentStepRef.current);
      needsInitialStepRef.current = false;
    }

    stepElapsedRef.current += dt;
    let stepEvents = 0;
    while (stepElapsedRef.current >= stepDurationSec && stepEvents < MAX_STEP_EVENTS_PER_FRAME) {
      stepElapsedRef.current -= stepDurationSec;
      const fromStep = currentStepRef.current;
      const next = advanceStep(fromStep, directionRef.current, stepCount, flowMode, glitchChanceClamped);
      fromStepRef.current = fromStep;
      currentStepRef.current = next.step;
      directionRef.current = next.direction;
      travelUnitsRef.current += Math.max(1, next.travelUnits);
      while (travelUnitsRef.current >= stepCount) {
        travelUnitsRef.current -= stepCount;
        loopCountRef.current += 1;
        if (evolveLoops > 0 && (loopCountRef.current % Math.max(1, Math.round(evolveLoops))) === 0) {
          patternRef.current = buildPattern(stepCount, laneCount, density);
        }
      }
      triggerStep(next.step);
      stepEvents += 1;
    }
    if (stepEvents >= MAX_STEP_EVENTS_PER_FRAME && stepElapsedRef.current >= stepDurationSec) {
      stepElapsedRef.current = 0;
    }

    const progress = stepDurationSec > 0
      ? Math.max(0, Math.min(1, stepElapsedRef.current / stepDurationSec))
      : 0;
    const spreadPhase = Math.sin(progress * Math.PI);
    const splitAmount = spreadPhase * edgeX;

    stepPulseRef.current = Math.max(0, stepPulseRef.current - dt * 3.4);
    for (let lane = 0; lane < laneCount; lane++) {
      pulse[lane] = Math.max(0, pulse[lane] - dt * decayRate);
    }

    if (centerRef.current && centerRef.current.material) {
      centerRef.current.material.opacity = 0.08 + stepPulseRef.current * 0.28;
    }

    const activeLaneSet = new Set(activeLanesRef.current);
    for (let lane = 0; lane < laneCount; lane++) {
      const y = laneYs[lane];
      const isActiveLane = activeLaneSet.has(lane);
      const lanePulse = pulse[lane];
      const activeOpacity = isActiveLane ? (0.28 + stepPulseRef.current * 0.4 + lanePulse * 0.36) : 0;
      for (let side = 0; side < 2; side++) {
        const packetIndex = lane * 2 + side;
        const dir = side === 0 ? -1 : 1;
        const x = dir * splitAmount;
        const width = isActiveLane ? 0.045 + lanePulse * 0.08 + stepPulseRef.current * 0.02 : 0.001;
        const height = isActiveLane ? 0.018 + lanePulse * 0.012 : 0.001;
        dummy.position.set(x, y, 0.01);
        dummy.scale.set(width, height, 1);
        dummy.updateMatrix();
        packetMesh.setMatrixAt(packetIndex, dummy.matrix);
        tmpColor.setScalar(activeOpacity);
        packetMesh.setColorAt(packetIndex, tmpColor);
      }

      const flashWidth = isActiveLane ? (0.02 + (1 - spreadPhase) * 0.12 + lanePulse * 0.08) : 0.001;
      const flashHeight = isActiveLane ? (0.018 + lanePulse * 0.02) : 0.001;
      dummy.position.set(0, y, 0.02);
      dummy.scale.set(flashWidth, flashHeight, 1);
      dummy.updateMatrix();
      flashMesh.setMatrixAt(lane, dummy.matrix);
      tmpColor.setScalar(isActiveLane ? (0.35 + lanePulse * 0.65 + (1 - spreadPhase) * 0.2) : 0);
      flashMesh.setColorAt(lane, tmpColor);
    }

    for (let i = 0; i < previewCells.length; i++) {
      const cell = previewCells[i];
      const patternOn = patternRef.current[cell.step * laneCount + cell.lane] === 1;
      const currentColumn = cell.step === currentStepRef.current;
      const gapColumn = cell.step === gapStepRef.current;
      const selected = noteMode === 'single' && currentColumn && cell.lane === singleLaneRef.current;
      const rowCurrent = noteMode === 'row' && currentColumn && activeLaneSet.has(cell.lane);
      const visible = patternOn && !gapColumn;
      const width = visible ? cell.w : 0.001;
      const height = visible ? cell.h : 0.001;
      dummy.position.set(cell.x, cell.y, -0.02);
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix();
      previewMesh.setMatrixAt(i, dummy.matrix);

      if (selected) {
        tmpColor.setScalar(0.95);
      } else if (rowCurrent) {
        tmpColor.setScalar(0.72);
      } else if (currentColumn && visible) {
        tmpColor.setScalar(0.22);
      } else if (visible) {
        tmpColor.setScalar(0.1);
      } else {
        tmpColor.setScalar(currentColumn ? 0.025 : 0.01);
      }
      previewMesh.setColorAt(i, tmpColor);
    }

    packetMesh.instanceMatrix.needsUpdate = true;
    if (packetMesh.instanceColor) packetMesh.instanceColor.needsUpdate = true;
    flashMesh.instanceMatrix.needsUpdate = true;
    if (flashMesh.instanceColor) flashMesh.instanceColor.needsUpdate = true;
    previewMesh.instanceMatrix.needsUpdate = true;
    if (previewMesh.instanceColor) previewMesh.instanceColor.needsUpdate = true;
  });

  return React.createElement('group', null,
    React.createElement('mesh', { ref: bgRef, position: [0, 0, -0.12] },
      React.createElement('primitive', { object: bgGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: '#000000',
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('mesh', {
      ref: centerRef,
      position: [0, 0, -0.03],
      scale: [0.004, 1.86, 1],
    },
      React.createElement('primitive', { object: planeGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('instancedMesh', {
      ref: previewRef,
      args: [planeGeom, previewMat, previewCells.length],
    }),
    React.createElement('instancedMesh', {
      ref: packetRef,
      args: [planeGeom, packetMat, laneCount * 2],
    }),
    React.createElement('instancedMesh', {
      ref: flashRef,
      args: [planeGeom, flashMat, laneCount],
    })
  );
}
