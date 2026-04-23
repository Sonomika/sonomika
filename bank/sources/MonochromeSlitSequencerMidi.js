const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Monochrome Slit Sequencer (MIDI)',
  description: 'A minimal black-and-white glitch sequencer made of barcode slits, scan beams, and jump-cut motion.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 7, min: 3, max: 12, step: 1 },
    { name: 'steps', type: 'number', value: 24, min: 8, max: 48, step: 1 },
    { name: 'density', type: 'number', value: 0.32, min: 0.05, max: 0.85, step: 0.02 },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1, description: '4 = 16th-note scan movement' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 128, min: 40, max: 220, step: 1 },
    { name: 'evolveLoops', type: 'number', value: 4, min: 0, max: 16, step: 1, description: 'rebuild the slit pattern every N full cycles (0 = static)' },
    { name: 'scanMode', type: 'select', value: 'cutup', options: ['forward', 'bounce', 'cutup'], description: 'how the slit scanner traverses the pattern' },
    { name: 'glitchChance', type: 'number', value: 0.22, min: 0, max: 1, step: 0.02, description: 'chance of scan jumps, holds, and reversals' },
    { name: 'noteMode', type: 'select', value: 'single', options: ['row', 'single'], description: 'fire the full active column or just one slit per step' },
    { name: 'gapChance', type: 'number', value: 0.1, min: 0, max: 1, step: 0.02, description: 'chance that the current scan column is silent and blank' },
    { name: 'persistence', type: 'number', value: 0.34, min: 0, max: 1, step: 0.02, description: 'how long hit slits stay bright' },
    { name: 'scanWidth', type: 'number', value: 0.12, min: 0.03, max: 0.45, step: 0.01, description: 'width of the white scan slit' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.14, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_MONOCHROME_SLIT_SEQ_OWNER__';
const OWNER_LEASE_MS = 250;
const MAX_DT = 0.1;
const MAX_SCAN_EVENTS_PER_FRAME = 16;

function midiForLane(lane, rootMidi) {
  return Math.round(rootMidi) + lane;
}

function wrapStep(step, stepCount) {
  const mod = step % stepCount;
  return mod < 0 ? mod + stepCount : mod;
}

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_MONOCHROME_SLIT_SEQ_LAST__';
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

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPattern(stepCount, laneCount, density) {
  const pat = new Uint8Array(stepCount * laneCount);
  const beatStride = Math.max(1, Math.round(stepCount / 4));
  for (let step = 0; step < stepCount; step++) {
    let lit = false;
    for (let lane = 0; lane < laneCount; lane++) {
      const idx = step * laneCount + lane;
      const accent = (step % beatStride) === 0 ? 0.18 : 0;
      const chance = Math.min(0.95, Math.max(0.03, density + accent - lane * 0.018));
      pat[idx] = Math.random() < chance ? 1 : 0;
      if (pat[idx]) lit = true;
    }
    if (!lit) {
      pat[step * laneCount + Math.floor(Math.random() * laneCount)] = 1;
    }
  }
  return pat;
}

function advanceScanStep(currentStep, direction, stepCount, scanMode, glitchChance) {
  const hasGlitch = Math.random() < glitchChance;
  let nextDir = direction >= 0 ? 1 : -1;

  if (scanMode === 'forward') {
    if (hasGlitch && Math.random() < 0.34) {
      return { step: currentStep, direction: 1, travelUnits: 1, ghost: 0.55 };
    }
    const jump = hasGlitch ? Math.max(2, Math.min(6, 2 + Math.floor(Math.random() * 5))) : 1;
    return {
      step: wrapStep(currentStep + jump, stepCount),
      direction: 1,
      travelUnits: jump,
      ghost: hasGlitch ? 0.8 : 0.18,
    };
  }

  if (scanMode === 'cutup') {
    if (hasGlitch && Math.random() < 0.34) {
      return {
        step: Math.floor(Math.random() * stepCount),
        direction: Math.random() < 0.5 ? -1 : 1,
        travelUnits: Math.max(1, Math.floor(stepCount * 0.5)),
        ghost: 1,
      };
    }
    if (hasGlitch && Math.random() < 0.3) nextDir = -nextDir;
    if (hasGlitch && Math.random() < 0.25) {
      return { step: currentStep, direction: nextDir, travelUnits: 1, ghost: 0.5 };
    }
    const jump = hasGlitch ? Math.max(2, Math.min(5, 2 + Math.floor(Math.random() * 4))) : 1;
    return {
      step: wrapStep(currentStep + nextDir * jump, stepCount),
      direction: nextDir,
      travelUnits: jump,
      ghost: hasGlitch ? 0.85 : 0.16,
    };
  }

  if (currentStep <= 0) nextDir = 1;
  else if (currentStep >= stepCount - 1) nextDir = -1;
  if (hasGlitch && Math.random() < 0.3) nextDir = -nextDir;
  if (hasGlitch && Math.random() < 0.22) {
    return { step: currentStep, direction: nextDir, travelUnits: 1, ghost: 0.48 };
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
    ghost: hasGlitch ? 0.72 : 0.16,
  };
}

function createCells(stepCount, laneCount, left, right) {
  const rand = mulberry32(stepCount * 92821 + laneCount * 7193);
  const cells = [];
  const columns = [];
  for (let step = 0; step < stepCount; step++) {
    const tStep = stepCount > 1 ? step / (stepCount - 1) : 0;
    const x = left + (right - left) * tStep;
    columns.push({ x });
    for (let lane = 0; lane < laneCount; lane++) {
      const tLane = laneCount > 1 ? lane / (laneCount - 1) : 0.5;
      const y = 0.82 - tLane * 1.64;
      cells.push({
        index: cells.length,
        step,
        lane,
        x: x + (rand() * 2 - 1) * 0.012,
        y,
        w: 0.006 + rand() * 0.014,
        h: 0.08 + rand() * 0.12,
      });
    }
  }
  return { cells, columns };
}

export default function MonochromeSlitSequencerMidiSource({
  lanes = 7,
  steps = 24,
  density = 0.32,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 128,
  evolveLoops = 4,
  scanMode = 'cutup',
  glitchChance = 0.22,
  noteMode = 'single',
  gapChance = 0.1,
  persistence = 0.34,
  scanWidth = 0.12,
  rootMidi = 36,
  noteLength = 0.14,
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;
  const left = -halfW * 0.84;
  const right = halfW * 0.84;

  const laneCount = Math.max(3, Math.floor(lanes));
  const stepCount = Math.max(8, Math.floor(steps));
  const totalCells = laneCount * stepCount;

  const bgRef = useRef(null);
  const scanRef = useRef(null);
  const ghostRef = useRef(null);
  const cellsRef = useRef(null);
  const columnsRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const pulseRef = useRef(null);
  const singleVisualIndexRef = useRef(-1);
  const gapStepRef = useRef(-1);
  const ghostStepRef = useRef(-1);
  const ghostPulseRef = useRef(0);
  const scanStepRef = useRef(0);
  const scanFromStepRef = useRef(0);
  const stepElapsedRef = useRef(0);
  const scanDirectionRef = useRef(1);
  const travelUnitsRef = useRef(0);
  const needsInitialStepRef = useRef(true);
  const loopCountRef = useRef(0);
  const scanPulseRef = useRef(0);

  const layout = useMemo(
    () => createCells(stepCount, laneCount, left, right),
    [stepCount, laneCount, left, right]
  );
  const cells = layout.cells;
  const columns = layout.columns;

  const patternRef = useRef(buildPattern(stepCount, laneCount, density));

  useEffect(() => {
    pulseRef.current = new Float32Array(totalCells);
    singleVisualIndexRef.current = -1;
    gapStepRef.current = -1;
    ghostStepRef.current = -1;
    ghostPulseRef.current = 0;
    scanStepRef.current = 0;
    scanFromStepRef.current = 0;
    stepElapsedRef.current = 0;
    scanDirectionRef.current = 1;
    travelUnitsRef.current = 0;
    needsInitialStepRef.current = true;
    loopCountRef.current = 0;
    scanPulseRef.current = 0;
  }, [totalCells]);

  useEffect(() => {
    patternRef.current = buildPattern(stepCount, laneCount, density);
    if (pulseRef.current) pulseRef.current.fill(0);
    singleVisualIndexRef.current = -1;
    gapStepRef.current = -1;
    ghostStepRef.current = -1;
    ghostPulseRef.current = 0;
    scanStepRef.current = 0;
    scanFromStepRef.current = 0;
    stepElapsedRef.current = 0;
    scanDirectionRef.current = 1;
    travelUnitsRef.current = 0;
    needsInitialStepRef.current = true;
    loopCountRef.current = 0;
    scanPulseRef.current = 0;
  }, [stepCount, laneCount, density, scanMode, glitchChance, noteMode, gapChance]);

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
    const myKey = `monochrome-slit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const cellMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  }), []);
  useEffect(() => () => { try { cellMat.dispose(); } catch (_) {} }, [cellMat]);

  const columnMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  }), []);
  useEffect(() => () => { try { columnMat.dispose(); } catch (_) {} }, [columnMat]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    const dt = Math.min(MAX_DT, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const cellMesh = cellsRef.current;
    const columnMesh = columnsRef.current;
    const pulse = pulseRef.current;
    if (!cellMesh || !columnMesh || !pulse) return;

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 128;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(1, bpmRaw);
    const stepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);
    const stepDurationSec = 1 / Math.max(0.25, stepsPerSec);
    const glitchChanceClamped = Math.max(0, Math.min(1, glitchChance));
    const gapChanceClamped = Math.max(0, Math.min(1, gapChance));
    const persistenceDecay = 2.4 + (1 - Math.max(0, Math.min(1, persistence))) * 5.5;
    const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
    const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));

    const triggerStep = (stepIndex) => {
      scanPulseRef.current = 1;
      if (Math.random() < gapChanceClamped) {
        gapStepRef.current = stepIndex;
        if (noteMode === 'single') singleVisualIndexRef.current = -1;
        return;
      }
      gapStepRef.current = -1;
      const activeEntries = [];
      for (let lane = 0; lane < laneCount; lane++) {
        const idx = stepIndex * laneCount + lane;
        if (!patternRef.current[idx]) continue;
        activeEntries.push({ idx, lane });
      }
      if (activeEntries.length === 0) {
        singleVisualIndexRef.current = -1;
        return;
      }

      const entriesToPlay = noteMode === 'single'
        ? [activeEntries[(loopCountRef.current + stepIndex) % activeEntries.length]]
        : activeEntries;
      singleVisualIndexRef.current = noteMode === 'single' && entriesToPlay[0] ? entriesToPlay[0].idx : -1;

      for (let i = 0; i < entriesToPlay.length; i++) {
        const entry = entriesToPlay[i];
        const idx = entry.idx;
        const lane = entry.lane;
        pulse[idx] = 1;
        const note = Math.max(0, Math.min(127, midiForLane(lane, rootMidi)));
        const vel = Math.max(0.35, Math.min(1, 0.76 + (1 - lane / laneCount) * 0.18));
        const durMs = Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000));
        const eventKey = `${loopCountRef.current}:${stepIndex}:${lane}:${idx}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try {
            midi.sendNote(note, vel, channel, durMs);
          } catch (_) {}
        }
      }
    };

    if (needsInitialStepRef.current) {
      triggerStep(scanStepRef.current);
      needsInitialStepRef.current = false;
    }

    stepElapsedRef.current += dt;
    let scanEvents = 0;
    while (stepElapsedRef.current >= stepDurationSec && scanEvents < MAX_SCAN_EVENTS_PER_FRAME) {
      stepElapsedRef.current -= stepDurationSec;
      const fromStep = scanStepRef.current;
      const next = advanceScanStep(fromStep, scanDirectionRef.current, stepCount, scanMode, glitchChanceClamped);
      scanFromStepRef.current = fromStep;
      scanStepRef.current = next.step;
      scanDirectionRef.current = next.direction;
      ghostStepRef.current = fromStep;
      ghostPulseRef.current = Math.max(ghostPulseRef.current, next.ghost);
      travelUnitsRef.current += Math.max(1, next.travelUnits);
      while (travelUnitsRef.current >= stepCount) {
        travelUnitsRef.current -= stepCount;
        loopCountRef.current += 1;
        if (evolveLoops > 0 && (loopCountRef.current % Math.max(1, Math.round(evolveLoops))) === 0) {
          patternRef.current = buildPattern(stepCount, laneCount, density);
          pulse.fill(0);
          singleVisualIndexRef.current = -1;
          gapStepRef.current = -1;
        }
      }
      triggerStep(next.step);
      scanEvents += 1;
    }
    if (scanEvents >= MAX_SCAN_EVENTS_PER_FRAME && stepElapsedRef.current >= stepDurationSec) {
      stepElapsedRef.current = 0;
    }

    ghostPulseRef.current = Math.max(0, ghostPulseRef.current - dt * 3.6);
    scanPulseRef.current = Math.max(0, scanPulseRef.current - dt * 3.2);

    const interp = stepDurationSec > 0 ? Math.max(0, Math.min(1, stepElapsedRef.current / stepDurationSec)) : 0;
    const eased = interp * interp * (3 - 2 * interp);
    const visualStep = scanFromStepRef.current + (scanStepRef.current - scanFromStepRef.current) * eased;
    const scanX = left + ((right - left) * (visualStep / Math.max(1, stepCount - 1)));
    const ghostX = ghostStepRef.current >= 0
      ? left + ((right - left) * (ghostStepRef.current / Math.max(1, stepCount - 1)))
      : scanX;

    if (bgRef.current && bgRef.current.material) {
      bgRef.current.material.opacity = 1;
    }
    if (scanRef.current) {
      scanRef.current.position.x = scanX;
      if (scanRef.current.material) {
        scanRef.current.material.opacity = 0.18 + scanPulseRef.current * 0.52;
      }
    }
    if (ghostRef.current) {
      ghostRef.current.position.x = ghostX;
      if (ghostRef.current.material) {
        ghostRef.current.material.opacity = ghostPulseRef.current * 0.18;
      }
    }

    for (let step = 0; step < columns.length; step++) {
      const column = columns[step];
      const dist = Math.abs(column.x - scanX);
      const scanGlow = Math.max(0, 1 - dist / Math.max(0.04, scanWidth * 2.4));
      const isGapColumn = step === gapStepRef.current;
      dummy.position.set(column.x, 0, -0.01);
      dummy.scale.set(0.002 + scanGlow * 0.008, 1.78, 1);
      dummy.updateMatrix();
      columnMesh.setMatrixAt(step, dummy.matrix);
      tmpColor.setScalar(isGapColumn ? 0.03 : (0.06 + scanGlow * 0.22 + scanPulseRef.current * 0.04));
      columnMesh.setColorAt(step, tmpColor);
    }

    for (let i = 0; i < cells.length; i++) {
      pulse[i] = Math.max(0, pulse[i] - dt * persistenceDecay);
      const cell = cells[i];
      const patternVisible = patternRef.current[i] === 1 && cell.step !== gapStepRef.current;
      const active = noteMode === 'single'
        ? i === singleVisualIndexRef.current
        : patternVisible && cell.step === scanStepRef.current;
      const preview = patternVisible && !active;
      const scanGlow = Math.max(0, 1 - Math.abs(cell.x - scanX) / Math.max(0.04, scanWidth * 2.2));
      const p = pulse[i];
      const width = active ? cell.w * 2.2 : (preview ? cell.w : cell.w * 0.22);
      const height = active
        ? cell.h * (1.5 + p * 0.8)
        : preview
          ? cell.h * (0.8 + scanGlow * 0.18)
          : cell.h * 0.06;
      dummy.position.set(cell.x, cell.y, 0.02);
      dummy.scale.set(width + scanGlow * 0.01, height + p * 0.08, 1);
      dummy.updateMatrix();
      cellMesh.setMatrixAt(i, dummy.matrix);

      if (active) {
        tmpColor.setScalar(Math.min(1, 0.82 + p * 0.18 + scanGlow * 0.08));
      } else if (preview) {
        tmpColor.setScalar(0.14 + scanGlow * 0.1);
      } else {
        tmpColor.setScalar(scanGlow * 0.03);
      }
      cellMesh.setColorAt(i, tmpColor);
    }

    cellMesh.instanceMatrix.needsUpdate = true;
    if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
    columnMesh.instanceMatrix.needsUpdate = true;
    if (columnMesh.instanceColor) columnMesh.instanceColor.needsUpdate = true;
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
    React.createElement('instancedMesh', {
      ref: columnsRef,
      args: [planeGeom, columnMat, columns.length],
    }),
    React.createElement('mesh', {
      ref: ghostRef,
      position: [0, 0, -0.03],
      scale: [Math.max(0.01, scanWidth * 1.9), 1.92, 1],
    },
      React.createElement('primitive', { object: planeGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('mesh', {
      ref: scanRef,
      position: [0, 0, -0.02],
      scale: [Math.max(0.01, scanWidth), 1.92, 1],
    },
      React.createElement('primitive', { object: planeGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.18,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('instancedMesh', {
      ref: cellsRef,
      args: [planeGeom, cellMat, totalCells],
    })
  );
}
