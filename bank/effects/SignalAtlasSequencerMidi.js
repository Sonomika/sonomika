const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Signal Atlas Sequencer (MIDI)',
  description: 'A hyper-dense technical sequencer made of numbered nodes, scan rows, grid lines, and cross-linked signal webs. A descending scan band triggers nodes and sends MIDI.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 6, min: 3, max: 10, step: 1 },
    { name: 'steps', type: 'number', value: 14, min: 6, max: 24, step: 1 },
    { name: 'density', type: 'number', value: 0.36, min: 0.05, max: 0.85, step: 0.02 },
    { name: 'stepsPerBeat', type: 'number', value: 2, min: 1, max: 8, step: 1, description: '2 = 8th-note rows, 4 = 16th-note rows' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 122, min: 40, max: 220, step: 1 },
    { name: 'evolveLoops', type: 'number', value: 4, min: 0, max: 16, step: 1, description: 'rebuild the atlas every N full scan cycles (0 = static)' },
    { name: 'scanMode', type: 'select', value: 'bounce', options: ['down', 'bounce', 'chaos'], description: 'how the scan line travels through the atlas' },
    { name: 'scanGlitchChance', type: 'number', value: 0.22, min: 0, max: 1, step: 0.02, description: 'chance that the scan line skips, repeats, or reverses unexpectedly' },
    { name: 'noteMode', type: 'select', value: 'row', options: ['row', 'single'], description: 'play the full row or only one note per scan step' },
    { name: 'gapChance', type: 'number', value: 0.14, min: 0, max: 1, step: 0.02, description: 'chance that a scan step becomes a silent gap' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.18, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'jitter', type: 'number', value: 0.38, min: 0, max: 1, step: 0.02, description: 'position disorder inside each scan row' },
    { name: 'lineDensity', type: 'number', value: 0.58, min: 0.1, max: 1, step: 0.02, description: 'how many cross-links and scan lines are visible' },
    { name: 'inkColor', type: 'color', value: '#f4f6fb' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_SIGNAL_ATLAS_SEQ_OWNER__';
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

function advanceScanStep(currentStep, direction, stepCount, scanMode, glitchChance) {
  const hasGlitch = Math.random() < glitchChance;
  let nextDir = direction >= 0 ? 1 : -1;

  if (scanMode === 'down') {
    nextDir = 1;
    if (hasGlitch && Math.random() < 0.34) nextDir = -1;
    if (hasGlitch && Math.random() < 0.34) {
      return { step: currentStep, direction: nextDir, travelUnits: 1 };
    }
    const jump = hasGlitch ? Math.max(2, Math.min(4, 2 + Math.floor(Math.random() * 3))) : 1;
    return {
      step: wrapStep(currentStep + nextDir * jump, stepCount),
      direction: nextDir,
      travelUnits: jump,
    };
  }

  if (scanMode === 'chaos') {
    if (hasGlitch && Math.random() < 0.45) nextDir = -nextDir;
    if (hasGlitch && Math.random() < 0.45) nextDir = Math.random() < 0.5 ? -1 : 1;
    if (hasGlitch && Math.random() < 0.34) {
      return { step: currentStep, direction: nextDir, travelUnits: 1 };
    }
    const chaosJump = hasGlitch
      ? Math.max(2, 2 + Math.floor(Math.random() * Math.max(1, Math.min(5, stepCount - 1))))
      : 1;
    return {
      step: wrapStep(currentStep + nextDir * chaosJump, stepCount),
      direction: nextDir,
      travelUnits: chaosJump,
    };
  }

  if (currentStep <= 0) nextDir = 1;
  else if (currentStep >= stepCount - 1) nextDir = -1;
  if (hasGlitch && Math.random() < 0.34) nextDir = -nextDir;
  if (hasGlitch && Math.random() < 0.34) {
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

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_SIGNAL_ATLAS_SEQ_LAST__';
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
      const accent = (step % beatStride) === 0 ? 0.22 : 0;
      const chance = Math.min(0.92, density + accent - lane * 0.02);
      pat[idx] = Math.random() < chance ? 1 : 0;
      if (pat[idx]) lit = true;
    }
    if (!lit) {
      pat[step * laneCount + Math.floor(Math.random() * laneCount)] = 1;
    }
  }
  return pat;
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

function createAtlas(stepCount, laneCount, halfW, jitter, lineDensity) {
  const rand = mulberry32(stepCount * 4099 + laneCount * 131 + Math.round(jitter * 1000));
  const nodes = [];
  const sideSpread = halfW * 0.88;
  for (let step = 0; step < stepCount; step++) {
    const tStep = stepCount > 1 ? step / (stepCount - 1) : 0;
    const y = 0.86 - tStep * 1.72 + (rand() * 2 - 1) * 0.03;
    const shape = 0.38 + 0.62 * Math.sin(tStep * Math.PI);
    for (let lane = 0; lane < laneCount; lane++) {
      const tLane = laneCount > 1 ? lane / (laneCount - 1) : 0.5;
      const laneCenter = (tLane * 2 - 1) * sideSpread;
      const disorder = (rand() * 2 - 1) * halfW * 0.24 * jitter;
      const x = laneCenter * shape + disorder + Math.sin((step + 1) * 0.65 + lane * 1.17) * halfW * 0.06;
      nodes.push({
        index: nodes.length,
        step,
        lane,
        x,
        y,
        id: 22000 + step * 117 + lane * 7 + Math.floor(rand() * 80),
        labelDx: (rand() * 2 - 1) * 0.09,
        labelDy: 0.03 + rand() * 0.025,
      });
    }
  }

  const edges = [];
  const edgeSet = new Set();
  const pushEdge = (a, b) => {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([lo, hi]);
  };

  for (let step = 0; step < stepCount; step++) {
    for (let lane = 0; lane < laneCount; lane++) {
      const i = step * laneCount + lane;
      if (step < stepCount - 1) {
        pushEdge(i, (step + 1) * laneCount + lane);
        if (lane < laneCount - 1) pushEdge(i, (step + 1) * laneCount + lane + 1);
        if (lane > 0) pushEdge(i, (step + 1) * laneCount + lane - 1);
      }
      if (lane < laneCount - 1 && rand() < 0.7 * lineDensity) {
        pushEdge(i, step * laneCount + lane + 1);
      }
      if (rand() < 0.18 * lineDensity) {
        const jumpStep = Math.min(stepCount - 1, step + 2 + Math.floor(rand() * Math.max(1, stepCount / 3)));
        const jumpLane = Math.floor(rand() * laneCount);
        pushEdge(i, jumpStep * laneCount + jumpLane);
      }
    }
  }

  return { nodes, edges };
}

function makeLabelTexture(text) {
  if (!globalThis.document || !THREE) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(4, 9, 10, 10);
  ctx.font = '18px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), 20, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export default function SignalAtlasSequencerMidiSource({
  lanes = 6,
  steps = 14,
  density = 0.36,
  stepsPerBeat = 2,
  bpmSync = true,
  manualBpm = 122,
  evolveLoops = 4,
  scanMode = 'bounce',
  scanGlitchChance = 0.22,
  noteMode = 'row',
  gapChance = 0.14,
  rootMidi = 36,
  noteLength = 0.18,
  jitter = 0.38,
  lineDensity = 0.58,
  inkColor = '#f4f6fb',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;

  const laneCount = Math.max(3, Math.floor(lanes));
  const stepCount = Math.max(6, Math.floor(steps));
  const totalNodes = laneCount * stepCount;

  const scanRef = useRef(null);
  const nodesRef = useRef(null);
  const edgeRef = useRef(null);
  const tracerRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const labelRefs = useRef([]);
  const liveNodePosRef = useRef([]);
  const pulseRef = useRef(null);
  const singleVisualIndexRef = useRef(-1);
  const gapStepRef = useRef(-1);
  const scanStepRef = useRef(0);
  const scanFromStepRef = useRef(0);
  const stepElapsedRef = useRef(0);
  const scanDirectionRef = useRef(1);
  const travelUnitsRef = useRef(0);
  const needsInitialStepRef = useRef(true);
  const loopCountRef = useRef(0);
  const scanPulseRef = useRef(0);

  const atlas = useMemo(
    () => createAtlas(stepCount, laneCount, halfW, jitter, lineDensity),
    [stepCount, laneCount, halfW, jitter, lineDensity]
  );
  const nodes = atlas.nodes;
  const edges = atlas.edges;

  if (labelRefs.current.length !== nodes.length) {
    labelRefs.current = Array.from({ length: nodes.length }, () => React.createRef());
  }

  useEffect(() => {
    liveNodePosRef.current = Array.from({ length: nodes.length }, () => ({ x: 0, y: 0 }));
    pulseRef.current = new Float32Array(totalNodes);
    singleVisualIndexRef.current = -1;
    gapStepRef.current = -1;
    scanStepRef.current = 0;
    scanFromStepRef.current = 0;
    stepElapsedRef.current = 0;
    scanDirectionRef.current = 1;
    travelUnitsRef.current = 0;
    needsInitialStepRef.current = true;
    loopCountRef.current = 0;
    scanPulseRef.current = 0;
  }, [totalNodes, nodes.length]);

  const patternRef = useRef(buildPattern(stepCount, laneCount, density));
  useEffect(() => {
    patternRef.current = buildPattern(stepCount, laneCount, density);
    if (pulseRef.current) pulseRef.current.fill(0);
    singleVisualIndexRef.current = -1;
    gapStepRef.current = -1;
    scanStepRef.current = 0;
    scanFromStepRef.current = 0;
    stepElapsedRef.current = 0;
    scanDirectionRef.current = 1;
    travelUnitsRef.current = 0;
    needsInitialStepRef.current = true;
    loopCountRef.current = 0;
    scanPulseRef.current = 0;
  }, [stepCount, laneCount, density, scanMode, scanGlitchChance]);

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
    const myKey = `signal-atlas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const nodeGeom = useMemo(() => new THREE.CircleGeometry(0.014, 16), []);
  useEffect(() => () => { try { nodeGeom.dispose(); } catch (_) {} }, [nodeGeom]);

  const tracerGeom = useMemo(() => new THREE.CircleGeometry(0.012, 12), []);
  useEffect(() => () => { try { tracerGeom.dispose(); } catch (_) {} }, [tracerGeom]);

  const nodeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { nodeMat.dispose(); } catch (_) {} }, [nodeMat]);

  const tracerMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { tracerMat.dispose(); } catch (_) {} }, [tracerMat]);

  const labelGeom = useMemo(() => new THREE.PlaneGeometry(0.18, 0.045), []);
  useEffect(() => () => { try { labelGeom.dispose(); } catch (_) {} }, [labelGeom]);

  const scanGeom = useMemo(() => new THREE.PlaneGeometry(halfW * 2, 0.1), [halfW]);
  useEffect(() => () => { try { scanGeom.dispose(); } catch (_) {} }, [scanGeom]);

  const gridGeom = useMemo(() => {
    const points = [];
    const cols = Math.max(8, Math.round(halfW * 6));
    const rows = 12;
    for (let i = 0; i <= cols; i++) {
      const x = -halfW + (i / cols) * halfW * 2;
      points.push(x, -1, 0, x, 1, 0);
    }
    for (let i = 0; i <= rows; i++) {
      const y = -1 + (i / rows) * 2;
      points.push(-halfW, y, 0, halfW, y, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [halfW]);
  useEffect(() => () => { try { gridGeom.dispose(); } catch (_) {} }, [gridGeom]);

  const scanlineGeom = useMemo(() => {
    const points = [];
    const count = Math.max(18, Math.round(28 * lineDensity));
    for (let i = 0; i < count; i++) {
      const y = 0.94 - (i / Math.max(1, count - 1)) * 1.88;
      points.push(-halfW, y, 0, halfW, y, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [halfW, lineDensity]);
  useEffect(() => () => { try { scanlineGeom.dispose(); } catch (_) {} }, [scanlineGeom]);

  const edgeGeom = useMemo(() => {
    const points = [];
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const a = nodes[edge[0]];
      const b = nodes[edge[1]];
      if (!a || !b) continue;
      points.push(a.x, a.y, 0, b.x, b.y, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [edges, nodes]);
  useEffect(() => () => { try { edgeGeom.dispose(); } catch (_) {} }, [edgeGeom]);

  const tracerCount = useMemo(
    () => Math.min(96, Math.max(24, Math.round(edges.length * (0.12 + lineDensity * 0.18)))),
    [edges.length, lineDensity]
  );
  const tracerSpecs = useMemo(() => {
    const rand = mulberry32(edges.length * 313 + stepCount * 41 + laneCount * 17);
    return Array.from({ length: tracerCount }, () => ({
      edgeIndex: Math.floor(rand() * Math.max(1, edges.length)),
      speed: 0.12 + rand() * 0.45,
      offset: rand(),
      dir: rand() < 0.5 ? -1 : 1,
      scale: 0.12 + rand() * 0.18,
    }));
  }, [tracerCount, edges.length, stepCount, laneCount]);

  const labelTextures = useMemo(
    () => nodes.map((node) => makeLabelTexture(node.id)),
    [nodes]
  );
  useEffect(() => () => {
    labelTextures.forEach((tex) => { try { tex && tex.dispose(); } catch (_) {} });
  }, [labelTextures]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tracerDummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const baseColor = useMemo(() => new THREE.Color(inkColor), [inkColor]);
  const dimColor = useMemo(() => new THREE.Color(inkColor).multiplyScalar(0.2), [inkColor]);

  useFrame((_, delta) => {
    const dt = Math.min(MAX_DT, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const mesh = nodesRef.current;
    const pulse = pulseRef.current;
    if (!mesh || !pulse) return;

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(1, bpmRaw);
    const stepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);
    const stepDurationSec = 1 / Math.max(0.25, stepsPerSec);
    const glitchChanceClamped = Math.max(0, Math.min(1, scanGlitchChance));
    const gapChanceClamped = Math.max(0, Math.min(1, gapChance));
    const isMidiOwner = claimMidiOwnership();
    const midi = (sendMidi && isMidiOwner) ? (globalThis && globalThis.VJ_MIDI) : null;
    const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));

    const triggerStep = (stepIndex) => {
      scanPulseRef.current = 1;
      if (Math.random() < gapChanceClamped) {
        gapStepRef.current = stepIndex;
        pulse.fill(0);
        if (noteMode === 'single') {
          singleVisualIndexRef.current = -1;
        }
        return;
      }
      gapStepRef.current = -1;
      const activeEntries = [];
      for (let lane = 0; lane < laneCount; lane++) {
        const idx = stepIndex * laneCount + lane;
        if (!patternRef.current[idx]) continue;
        activeEntries.push({ idx, lane });
      }
      if (activeEntries.length === 0) return;

      const entriesToPlay = noteMode === 'single'
        ? [activeEntries[(loopCountRef.current + stepIndex) % activeEntries.length]]
        : activeEntries;

      if (noteMode === 'single') {
        pulse.fill(0);
        singleVisualIndexRef.current = entriesToPlay[0] ? entriesToPlay[0].idx : -1;
      } else {
        singleVisualIndexRef.current = -1;
      }

      for (let i = 0; i < entriesToPlay.length; i++) {
        const entry = entriesToPlay[i];
        const idx = entry.idx;
        const lane = entry.lane;
        pulse[idx] = 1;
        const note = Math.max(0, Math.min(127, midiForLane(lane, rootMidi)));
        const vel = Math.max(0.35, Math.min(1, 0.7 + (1 - lane / laneCount) * 0.25));
        const durMs = Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000));
        const node = nodes[idx];
        const eventBaseKey = `${loopCountRef.current}:${stepIndex}:${lane}:${node ? node.id : idx}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(`${eventBaseKey}:main`)) {
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
      const next = advanceScanStep(
        fromStep,
        scanDirectionRef.current,
        stepCount,
        scanMode,
        glitchChanceClamped
      );
      scanFromStepRef.current = fromStep;
      scanStepRef.current = next.step;
      scanDirectionRef.current = next.direction;
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

    const interp = stepDurationSec > 0 ? Math.max(0, Math.min(1, stepElapsedRef.current / stepDurationSec)) : 0;
    const eased = interp * interp * (3 - 2 * interp);
    const visualStep = scanFromStepRef.current + (scanStepRef.current - scanFromStepRef.current) * eased;
    const phase = visualStep;
    const scanY = 0.92 - ((visualStep + 0.5) / stepCount) * 1.84;

    scanPulseRef.current = Math.max(0, scanPulseRef.current - dt * 3.6);

    if (scanRef.current) {
      scanRef.current.position.y = scanY;
      if (scanRef.current.material) {
        scanRef.current.material.opacity = 0.12 + scanPulseRef.current * 0.3;
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      pulse[i] = Math.max(0, pulse[i] - dt * 4.8);
      const node = nodes[i];
      const patternVisible = patternRef.current[i] === 1 && node.step !== gapStepRef.current;
      const active = noteMode === 'single'
        ? i === singleVisualIndexRef.current
        : patternVisible;
      const driftX = Math.sin(loopCountRef.current * 0.1 + phase * 0.35 + node.index * 0.73) * halfW * 0.008
        + Math.cos(phase * 0.6 + node.index * 0.31) * halfW * 0.005 * jitter;
      const driftY = Math.cos(loopCountRef.current * 0.12 + phase * 0.4 + node.index * 0.47) * 0.012
        + Math.sin(phase * 0.8 + node.index * 0.19) * 0.008 * jitter;
      const liveX = node.x + driftX;
      const liveY = node.y + driftY;
      if (liveNodePosRef.current[i]) {
        liveNodePosRef.current[i].x = liveX;
        liveNodePosRef.current[i].y = liveY;
      }
      const rowDist = Math.abs(liveY - scanY);
      const scanGlow = Math.max(0, 1 - rowDist / 0.08);
      const visualScanGlow = noteMode === 'single' && !active ? scanGlow * 0.12 : scanGlow;
      const p = pulse[i];
      const baseScale = active ? 0.55 : (patternVisible ? 0.34 : 0.18);
      const scanGlowScale = active ? 0.28 : (patternVisible ? 0.14 : 0.08);
      const scaleValue = baseScale + p * 0.75 + visualScanGlow * scanGlowScale;
      dummy.position.set(liveX, liveY, 0);
      dummy.scale.setScalar(scaleValue);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (active) {
        tmpColor.copy(baseColor).multiplyScalar(0.45 + p * 0.9 + visualScanGlow * 0.35);
      } else if (patternVisible) {
        tmpColor.copy(baseColor).multiplyScalar(0.2 + visualScanGlow * 0.12);
      } else {
        tmpColor.copy(dimColor).lerp(baseColor, visualScanGlow * 0.18);
      }
      mesh.setColorAt(i, tmpColor);

      const labelMesh = labelRefs.current[i] && labelRefs.current[i].current;
      if (labelMesh) {
        labelMesh.position.set(liveX + node.labelDx, liveY + node.labelDy, 0);
        labelMesh.visible = active || (patternVisible && noteMode === 'single') || p > 0.06 || visualScanGlow > 0.12;
        if (labelMesh.material) {
          const labelBase = active ? 0.18 : ((patternVisible && noteMode === 'single') ? 0.08 : 0);
          labelMesh.material.opacity = Math.max(0.18, Math.min(1, 0.24 + labelBase + p * 0.75 + visualScanGlow * 0.28));
        }
      }
    }

    const edgeMesh = edgeRef.current;
    if (edgeMesh && edgeMesh.geometry) {
      const positionAttr = edgeMesh.geometry.getAttribute('position');
      const arr = positionAttr && positionAttr.array;
      if (arr) {
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          const a = liveNodePosRef.current[edge[0]];
          const b = liveNodePosRef.current[edge[1]];
          if (!a || !b) continue;
          const j = i * 6;
          arr[j] = a.x;
          arr[j + 1] = a.y;
          arr[j + 2] = 0;
          arr[j + 3] = b.x;
          arr[j + 4] = b.y;
          arr[j + 5] = 0;
        }
        positionAttr.needsUpdate = true;
      }
      if (edgeMesh.material) {
        edgeMesh.material.opacity = 0.36 * lineDensity + scanPulseRef.current * 0.18;
      }
    }

    const tracerMesh = tracerRef.current;
    if (tracerMesh) {
      const tNow = phase + loopCountRef.current * stepCount;
      for (let i = 0; i < tracerSpecs.length; i++) {
        const spec = tracerSpecs[i];
        const edge = edges[spec.edgeIndex];
        const a = edge && liveNodePosRef.current[edge[0]];
        const b = edge && liveNodePosRef.current[edge[1]];
        if (!a || !b) continue;
        let t = (tNow * spec.speed + spec.offset) % 1;
        if (spec.dir < 0) t = 1 - t;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        tracerDummy.position.set(x, y, 0.01);
        tracerDummy.scale.setScalar(spec.scale + scanPulseRef.current * 0.08);
        tracerDummy.updateMatrix();
        tracerMesh.setMatrixAt(i, tracerDummy.matrix);
      }
      tracerMesh.instanceMatrix.needsUpdate = true;
      if (tracerMesh.material) {
        tracerMesh.material.opacity = 0.45 + scanPulseRef.current * 0.35;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return React.createElement('group', null,
    React.createElement('lineSegments', null,
      React.createElement('primitive', { object: gridGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: inkColor,
        transparent: true,
        opacity: 0.08,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('lineSegments', null,
      React.createElement('primitive', { object: scanlineGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: inkColor,
        transparent: true,
        opacity: 0.12 + lineDensity * 0.1,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('lineSegments', { ref: edgeRef },
      React.createElement('primitive', { object: edgeGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: inkColor,
        transparent: true,
        opacity: 0.36 * lineDensity,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('mesh', {
      ref: scanRef,
      position: [0, 0, -0.005],
    },
      React.createElement('primitive', { object: scanGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: inkColor,
        transparent: true,
        opacity: 0.14,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ),
    React.createElement('instancedMesh', {
      ref: nodesRef,
      args: [nodeGeom, nodeMat, totalNodes],
    }),
    React.createElement('instancedMesh', {
      ref: tracerRef,
      args: [tracerGeom, tracerMat, tracerCount],
    }),
    ...nodes.map((node, i) => React.createElement('mesh', {
      key: `label-${node.id}`,
      ref: labelRefs.current[i],
      geometry: labelGeom,
      position: [node.x + node.labelDx, node.y + node.labelDy, 0],
      visible: false,
    },
      React.createElement('meshBasicMaterial', {
        map: labelTextures[i],
        transparent: true,
        opacity: 0.24,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ))
  );
}
