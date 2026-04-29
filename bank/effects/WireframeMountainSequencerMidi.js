const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Wireframe Mountain Sequencer (MIDI)',
  description: 'A rotating layered contour mountain where a vertical scan slice lights ridge points and sends MIDI.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 7, min: 3, max: 12, step: 1 },
    { name: 'steps', type: 'number', value: 18, min: 8, max: 32, step: 1 },
    { name: 'density', type: 'number', value: 0.34, min: 0.05, max: 0.85, step: 0.02 },
    { name: 'stepsPerBeat', type: 'number', value: 2, min: 1, max: 8, step: 1, description: '2 = 8th-note terrain slices, 4 = 16th-note terrain slices' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 124, min: 40, max: 220, step: 1 },
    { name: 'evolveLoops', type: 'number', value: 4, min: 0, max: 16, step: 1, description: 'rebuild the mountain sequence every N slice cycles (0 = static)' },
    { name: 'noteMode', type: 'select', value: 'row', options: ['row', 'single'], description: 'play all active ridge points in the current slice or only one note' },
    { name: 'gapChance', type: 'number', value: 0.1, min: 0, max: 1, step: 0.02, description: 'chance that the current slice is silent' },
    { name: 'glitchChance', type: 'number', value: 0.18, min: 0, max: 1, step: 0.02, description: 'chance that the slice holds, skips, or reverses' },
    { name: 'height', type: 'number', value: 1.15, min: 0.4, max: 2.2, step: 0.02, description: 'mountain peak height' },
    { name: 'roughness', type: 'number', value: 0.42, min: 0, max: 1, step: 0.02, description: 'ridge irregularity in the wireframe' },
    { name: 'rotationSpeed', type: 'number', value: 0.12, min: 0, max: 0.8, step: 0.02, description: 'constant mountain rotation speed' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.18, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'wireColor', type: 'color', value: '#d8d8d8' },
    { name: 'pulseColor', type: 'color', value: '#ffffff' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_WIREFRAME_MOUNTAIN_SEQ_OWNER__';
const OWNER_LEASE_MS = 250;
const MAX_DT = 0.1;

function midiForLane(lane, rootMidi) {
  return Math.round(rootMidi) + lane;
}

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_WIREFRAME_MOUNTAIN_SEQ_LAST__';
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
  const stride = Math.max(1, Math.round(stepCount / 4));
  for (let step = 0; step < stepCount; step++) {
    let lit = false;
    for (let lane = 0; lane < laneCount; lane++) {
      const idx = step * laneCount + lane;
      const accent = (step % stride) === 0 ? 0.18 : 0;
      const laneBias = 0.84 - (lane / Math.max(1, laneCount - 1)) * 0.22;
      const chance = Math.min(0.94, Math.max(0.03, density * laneBias + accent));
      pat[idx] = Math.random() < chance ? 1 : 0;
      if (pat[idx]) lit = true;
    }
    if (!lit) {
      pat[step * laneCount + Math.floor(Math.random() * laneCount)] = 1;
    }
  }
  return pat;
}

function advanceStep(currentStep, direction, stepCount, glitchChance) {
  const hasGlitch = Math.random() < glitchChance;
  let nextDir = direction >= 0 ? 1 : -1;
  if (hasGlitch && Math.random() < 0.22) {
    return { step: currentStep, direction: nextDir, travelUnits: 1 };
  }
  if (hasGlitch && Math.random() < 0.28) nextDir = -nextDir;
  const jump = hasGlitch ? Math.max(2, Math.min(4, 2 + Math.floor(Math.random() * 3))) : 1;
  const nextStep = ((currentStep + nextDir * jump) % stepCount + stepCount) % stepCount;
  return {
    step: nextStep,
    direction: nextDir,
    travelUnits: jump,
  };
}

function createMountain(stepCount, laneCount, height, roughness) {
  const nodes = [];
  const linePoints = [];
  const renderCols = Math.max(56, stepCount * 6);
  const renderRows = Math.max(32, laneCount * 5);
  const halfWidth = 1.75;
  const halfDepth = 1.15;
  const peakHeight = Math.max(0.2, height);

  const heightAt = (x, z) => {
    const peakA = Math.exp(-(((x + 0.62) / 0.46) ** 2 + ((z + 0.12) / 0.52) ** 2)) * 0.72;
    const peakB = Math.exp(-(((x + 0.08) / 0.28) ** 2 + ((z + 0.1) / 0.34) ** 2)) * 1.35;
    const peakC = Math.exp(-(((x - 0.42) / 0.38) ** 2 + ((z - 0.02) / 0.44) ** 2)) * 1.02;
    const peakD = Math.exp(-(((x - 0.02) / 0.56) ** 2 + ((z - 0.48) / 0.34) ** 2)) * 0.58;
    const ridge = Math.sin(x * 7.2 + z * 2.8) * 0.06 + Math.cos(x * 3.7 - z * 6.4) * 0.045;
    const taper = Math.max(0, 1 - (Math.abs(x) / halfWidth) ** 1.8) * Math.max(0, 1 - (Math.abs(z) / halfDepth) ** 1.6);
    return (peakA + peakB + peakC + peakD) * peakHeight * taper + ridge * roughness * peakHeight * taper;
  };

  const samplePoint = (col, row, colCount, rowCount) => {
    const tx = colCount > 1 ? col / (colCount - 1) : 0.5;
    const tz = rowCount > 1 ? row / (rowCount - 1) : 0.5;
    const x = -halfWidth + tx * halfWidth * 2;
    const z = -halfDepth + tz * halfDepth * 2;
    const y = Math.max(0, heightAt(x, z));
    return { x, y, z };
  };

  for (let row = 0; row < renderRows; row++) {
    for (let col = 0; col < renderCols - 1; col++) {
      const a = samplePoint(col, row, renderCols, renderRows);
      const b = samplePoint(col + 1, row, renderCols, renderRows);
      linePoints.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const columnStride = Math.max(3, Math.floor(renderCols / 18));
  for (let col = 0; col < renderCols; col += columnStride) {
    for (let row = 0; row < renderRows - 1; row++) {
      const a = samplePoint(col, row, renderCols, renderRows);
      const b = samplePoint(col, row + 1, renderCols, renderRows);
      linePoints.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  for (let lane = 0; lane < laneCount; lane++) {
    const rowT = laneCount > 1 ? lane / (laneCount - 1) : 0.5;
    const row = Math.round(rowT * (renderRows - 1));
    for (let step = 0; step < stepCount; step++) {
      const colT = stepCount > 1 ? step / (stepCount - 1) : 0.5;
      const col = Math.round(colT * (renderCols - 1));
      const p = samplePoint(col, row, renderCols, renderRows);
      nodes.push({ lane, step, x: p.x, y: p.y, z: p.z });
    }
  }

  return {
    nodes,
    linePositions: new Float32Array(linePoints),
    halfWidth,
  };
}

export default function WireframeMountainSequencerMidiSource({
  lanes = 7,
  steps = 18,
  density = 0.34,
  stepsPerBeat = 2,
  bpmSync = true,
  manualBpm = 124,
  evolveLoops = 4,
  noteMode = 'row',
  gapChance = 0.1,
  glitchChance = 0.18,
  height = 1.15,
  roughness = 0.42,
  rotationSpeed = 0.12,
  rootMidi = 36,
  noteLength = 0.18,
  wireColor = '#d8d8d8',
  pulseColor = '#ffffff',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const laneCount = Math.max(3, Math.floor(lanes));
  const stepCount = Math.max(8, Math.floor(steps));
  const totalNodes = laneCount * stepCount;

  const worldRef = useRef(null);
  const cursorRef = useRef(null);
  const glowRef = useRef(null);
  const nodesRef = useRef(null);
  const ownerKeyRef = useRef(null);

  const patternRef = useRef(buildPattern(stepCount, laneCount, density));
  const pulseRef = useRef(null);
  const phaseRef = useRef(0);
  const lastStepRef = useRef(-1);
  const loopCountRef = useRef(0);
  const cursorPulseRef = useRef(0);
  const singleLaneRef = useRef(-1);
  const gapStepRef = useRef(-1);
  const directionRef = useRef(1);

  const mountain = useMemo(
    () => createMountain(stepCount, laneCount, height, roughness),
    [stepCount, laneCount, height, roughness]
  );

  useEffect(() => {
    patternRef.current = buildPattern(stepCount, laneCount, density);
    pulseRef.current = new Float32Array(totalNodes);
    phaseRef.current = 0;
    lastStepRef.current = -1;
    loopCountRef.current = 0;
    cursorPulseRef.current = 0;
    singleLaneRef.current = -1;
    gapStepRef.current = -1;
    directionRef.current = 1;
  }, [stepCount, laneCount, density, totalNodes]);

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
    const myKey = `wireframe-mountain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const wireGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mountain.linePositions, 3));
    return g;
  }, [mountain.linePositions]);
  useEffect(() => () => { try { wireGeom.dispose(); } catch (_) {} }, [wireGeom]);

  const nodeGeom = useMemo(() => new THREE.IcosahedronGeometry(0.045, 1), []);
  useEffect(() => () => { try { nodeGeom.dispose(); } catch (_) {} }, [nodeGeom]);

  const nodeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { nodeMat.dispose(); } catch (_) {} }, [nodeMat]);

  const cursorGeom = useMemo(() => new THREE.PlaneGeometry(0.16, 2.4), []);
  useEffect(() => () => { try { cursorGeom.dispose(); } catch (_) {} }, [cursorGeom]);

  const glowGeom = useMemo(() => new THREE.CylinderGeometry(0.06, 0.18, 1.9, 12, 1, true), []);
  useEffect(() => () => { try { glowGeom.dispose(); } catch (_) {} }, [glowGeom]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const baseWire = useMemo(() => new THREE.Color(wireColor), [wireColor]);
  const pulseWire = useMemo(() => new THREE.Color(pulseColor), [pulseColor]);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    const dt = Math.min(MAX_DT, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const nodesMesh = nodesRef.current;
    const pulse = pulseRef.current;
    if (!nodesMesh || !pulse) return;

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 124;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(1, bpmRaw);
    const stepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);

    if (worldRef.current) {
      worldRef.current.rotation.x = -0.58;
      worldRef.current.rotation.y += dt * (0.18 + Math.max(0, rotationSpeed) * 1.1);
    }

    phaseRef.current += dt * stepsPerSec;
    while (phaseRef.current >= stepCount) {
      phaseRef.current -= stepCount;
      loopCountRef.current += 1;
      if (evolveLoops > 0 && (loopCountRef.current % Math.max(1, Math.round(evolveLoops))) === 0) {
        patternRef.current = buildPattern(stepCount, laneCount, density);
        pulse.fill(0);
      }
    }

    const currentStep = Math.floor(phaseRef.current);
    const seamX = stepCount > 1
      ? -mountain.halfWidth + (currentStep / (stepCount - 1)) * mountain.halfWidth * 2
      : 0;

    if (currentStep !== lastStepRef.current) {
      lastStepRef.current = currentStep;
      cursorPulseRef.current = 1;
      gapStepRef.current = -1;
      singleLaneRef.current = -1;

      if (Math.random() < Math.max(0, Math.min(1, gapChance))) {
        gapStepRef.current = currentStep;
      } else {
        const activeLanes = [];
        for (let lane = 0; lane < laneCount; lane++) {
          if (patternRef.current[currentStep * laneCount + lane]) activeLanes.push(lane);
        }
        if (activeLanes.length > 0) {
          const lanesToPlay = noteMode === 'single'
            ? [activeLanes[(loopCountRef.current + currentStep) % activeLanes.length]]
            : activeLanes;
          if (noteMode === 'single') singleLaneRef.current = lanesToPlay[0];

          const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
          const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
          for (let i = 0; i < lanesToPlay.length; i++) {
            const lane = lanesToPlay[i];
            const idx = currentStep * laneCount + lane;
            pulse[idx] = 1;
            const note = Math.max(0, Math.min(127, midiForLane(lane, rootMidi)));
            const velocity = Math.max(0.35, Math.min(1, 0.74 + (1 - lane / laneCount) * 0.18));
            const durMs = Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000));
            const eventKey = `${loopCountRef.current}:${currentStep}:${lane}`;
            if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
              try {
                midi.sendNote(note, velocity, channel, durMs);
              } catch (_) {}
            }
          }
        }
      }

      if (Math.random() < Math.max(0, Math.min(1, glitchChance))) {
        const next = advanceStep(currentStep, directionRef.current, stepCount, 1);
        directionRef.current = next.direction;
        phaseRef.current = next.step + 0.001;
      }
    }

    cursorPulseRef.current = Math.max(0, cursorPulseRef.current - dt * 3.4);

    if (cursorRef.current) {
      cursorRef.current.position.x = seamX;
      if (cursorRef.current.material) {
        cursorRef.current.material.opacity = gapStepRef.current === currentStep
          ? 0.04 + cursorPulseRef.current * 0.06
          : 0.08 + cursorPulseRef.current * 0.16;
      }
    }

    if (glowRef.current) {
      glowRef.current.position.x = seamX;
      if (glowRef.current.material) {
        glowRef.current.material.opacity = gapStepRef.current === currentStep
          ? 0.03
          : 0.05 + cursorPulseRef.current * 0.16;
      }
      glowRef.current.scale.setScalar(1 + cursorPulseRef.current * 0.12);
    }

    for (let i = 0; i < mountain.nodes.length; i++) {
      pulse[i] = Math.max(0, pulse[i] - dt * 4.8);
      const node = mountain.nodes[i];
      const patternVisible = patternRef.current[node.step * laneCount + node.lane] === 1 && node.step !== gapStepRef.current;
      const stepActive = node.step === currentStep;
      const active = noteMode === 'single'
        ? stepActive && node.lane === singleLaneRef.current
        : stepActive && patternVisible;
      const preview = patternVisible && !active;
      const seamGlow = stepActive ? 1 : Math.max(0, 1 - Math.abs(node.x - seamX) / 0.32);
      const p = pulse[i];
      const scale = active
        ? 0.55 + p * 0.8 + seamGlow * 0.14
        : preview
          ? 0.18 + seamGlow * 0.08
          : 0.06 + seamGlow * 0.03;

      dummy.position.set(node.x, node.y, node.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      nodesMesh.setMatrixAt(i, dummy.matrix);

      if (active) {
        tmpColor.copy(baseWire).lerp(pulseWire, Math.min(1, 0.65 + p * 0.35));
      } else if (preview) {
        tmpColor.copy(baseWire).multiplyScalar(0.22 + seamGlow * 0.22);
      } else {
        tmpColor.copy(baseWire).multiplyScalar(0.06 + seamGlow * 0.06);
      }
      nodesMesh.setColorAt(i, tmpColor);
    }

    nodesMesh.instanceMatrix.needsUpdate = true;
    if (nodesMesh.instanceColor) nodesMesh.instanceColor.needsUpdate = true;
  });

  return React.createElement('group', null,
    React.createElement('group', { ref: worldRef, position: [0, -0.82, 0] },
      React.createElement('lineSegments', null,
        React.createElement('primitive', { object: wireGeom, attach: 'geometry' }),
        React.createElement('lineBasicMaterial', {
          color: wireColor,
          transparent: true,
          opacity: 0.62,
          depthTest: false,
          depthWrite: false,
        })
      ),
      React.createElement('mesh', {
        ref: glowRef,
        rotation: [0, Math.PI * 0.5, 0],
        position: [0, 0.48, 0],
      },
        React.createElement('primitive', { object: glowGeom, attach: 'geometry' }),
        React.createElement('meshBasicMaterial', {
          color: pulseColor,
          transparent: true,
          opacity: 0.1,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      ),
      React.createElement('mesh', {
        ref: cursorRef,
        rotation: [0, Math.PI * 0.5, 0],
        position: [0, 0.58, 0],
      },
        React.createElement('primitive', { object: cursorGeom, attach: 'geometry' }),
        React.createElement('meshBasicMaterial', {
          color: pulseColor,
          transparent: true,
          opacity: 0.12,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      ),
      React.createElement('instancedMesh', {
        ref: nodesRef,
        args: [nodeGeom, nodeMat, totalNodes],
      })
    )
  );
}
