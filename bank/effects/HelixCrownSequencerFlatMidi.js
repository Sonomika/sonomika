const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Helix Crown Sequencer Flat (MIDI)',
  description: 'A flat minimal overlay sequencer: concentric rings of note dots with a clean radial sweep that fires MIDI notes.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 6, min: 3, max: 10, step: 1 },
    { name: 'steps', type: 'number', value: 12, min: 6, max: 24, step: 1 },
    { name: 'density', type: 'number', value: 0.34, min: 0.05, max: 0.8, step: 0.02 },
    { name: 'stepsPerBeat', type: 'number', value: 2, min: 1, max: 8, step: 1, description: '2 = 8th-note steps, 4 = 16th-note steps' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 122, min: 40, max: 220, step: 1 },
    { name: 'evolveLoops', type: 'number', value: 4, min: 0, max: 16, step: 1, description: 'rebuild the sequence every N full revolutions (0 = static)' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.22, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'rotateOffset', type: 'number', value: 0.18, min: -1.5, max: 1.5, step: 0.05, description: 'angular offset between rings' },
    { name: 'overallScale', type: 'number', value: 0.72, min: 0.2, max: 1.5, step: 0.01, description: 'overall overlay size' },
    { name: 'lineThickness', type: 'number', value: 0.5, min: 0.15, max: 3.0, step: 0.05, description: 'thickness multiplier for rings and sweep line' },
    { name: 'dotColor', type: 'color', value: '#ffffff' },
    { name: 'sweepColor', type: 'color', value: '#ffffff' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const TAU = Math.PI * 2;
const OWNER_SLOT = '__VJ_HELIX_CROWN_FLAT_SEQ_OWNER__';
const OWNER_LEASE_MS = 250;

function midiForLane(lane, rootMidi) {
  return Math.round(rootMidi) + lane;
}

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_HELIX_CROWN_FLAT_SEQ_LAST__';
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

  for (let lane = 0; lane < laneCount; lane++) {
    const laneBias = 0.65 + 0.35 * (1 - lane / Math.max(1, laneCount - 1));
    for (let step = 0; step < stepCount; step++) {
      const idx = lane * stepCount + step;
      const quarterAccent = (step % stride) === 0;
      const offbeatAccent = (step % (stride * 2)) === Math.floor(stride / 2);
      const probability = density * laneBias + (quarterAccent ? 0.18 : 0) + (offbeatAccent ? 0.08 : 0);
      pat[idx] = Math.random() < Math.min(0.92, probability) ? 1 : 0;
    }
  }

  for (let step = 0; step < stepCount; step++) {
    let found = false;
    for (let lane = 0; lane < laneCount; lane++) {
      if (pat[lane * stepCount + step]) {
        found = true;
        break;
      }
    }
    if (!found) {
      const lane = Math.floor(Math.random() * laneCount);
      pat[lane * stepCount + step] = 1;
    }
  }

  return pat;
}

export default function HelixCrownSequencerFlatMidiEffect({
  lanes = 6,
  steps = 12,
  density = 0.34,
  stepsPerBeat = 2,
  bpmSync = true,
  manualBpm = 122,
  evolveLoops = 4,
  rootMidi = 48,
  noteLength = 0.22,
  rotateOffset = 0.18,
  overallScale = 0.72,
  lineThickness = 0.5,
  dotColor = '#ffffff',
  sweepColor = '#ffffff',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const laneCount = Math.max(3, Math.floor(lanes));
  const stepCount = Math.max(6, Math.floor(steps));
  const totalNodes = laneCount * stepCount;
  const scaleValue = Math.max(0.2, Math.min(1.5, Number(overallScale) || 0.72));
  const thicknessValue = Math.max(0.15, Math.min(3, Number(lineThickness) || 0.5));

  const sweepPivotRef = useRef(null);
  const sweepRef = useRef(null);
  const coreRef = useRef(null);
  const nodesRef = useRef(null);
  const ringRefs = useRef([]);
  const flashRefs = useRef([]);
  const ownerKeyRef = useRef(null);

  const patternRef = useRef(null);
  const pulseRef = useRef(null);
  const lanePulseRef = useRef(null);
  const hitStateRef = useRef([]);
  const phaseRef = useRef(0);
  const lastStepRef = useRef(-1);
  const loopCountRef = useRef(0);
  const sweepPulseRef = useRef(0);

  if (ringRefs.current.length !== laneCount) {
    ringRefs.current = Array.from({ length: laneCount }, () => React.createRef());
  }
  if (flashRefs.current.length !== laneCount) {
    flashRefs.current = Array.from({ length: laneCount }, () => React.createRef());
  }

  useEffect(() => {
    patternRef.current = buildPattern(stepCount, laneCount, density);
    pulseRef.current = new Float32Array(totalNodes);
    lanePulseRef.current = new Float32Array(laneCount);
    hitStateRef.current = Array.from({ length: laneCount }, () => ({ active: false, t: 0, x: 0, y: 0 }));
    phaseRef.current = 0;
    lastStepRef.current = -1;
    loopCountRef.current = 0;
    sweepPulseRef.current = 0;
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
    const myKey = `helix-crown-flat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const dotGeom = useMemo(() => new THREE.CircleGeometry(0.055, 24), []);
  useEffect(() => () => { try { dotGeom.dispose(); } catch (_) {} }, [dotGeom]);

  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { dotMat.dispose(); } catch (_) {} }, [dotMat]);

  const ringGeom = useMemo(() => {
    const width = 0.015 * thicknessValue;
    return new THREE.RingGeometry(Math.max(0.001, 1 - width), 1.0, 96);
  }, [thicknessValue]);
  useEffect(() => () => { try { ringGeom.dispose(); } catch (_) {} }, [ringGeom]);

  const sweepGeom = useMemo(() => new THREE.PlaneGeometry(1.65, 0.035 * thicknessValue), [thicknessValue]);
  useEffect(() => () => { try { sweepGeom.dispose(); } catch (_) {} }, [sweepGeom]);

  const coreGeom = useMemo(() => new THREE.CircleGeometry(0.05 * thicknessValue, 24), [thicknessValue]);
  useEffect(() => () => { try { coreGeom.dispose(); } catch (_) {} }, [coreGeom]);

  const flashGeom = useMemo(() => {
    const width = 0.08 * thicknessValue;
    return new THREE.RingGeometry(Math.max(0.001, 1 - width), 1.0, 48);
  }, [thicknessValue]);
  useEffect(() => () => { try { flashGeom.dispose(); } catch (_) {} }, [flashGeom]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offColor = useMemo(() => new THREE.Color('#182028'), []);
  const dotBaseColor = useMemo(() => new THREE.Color(dotColor), [dotColor]);
  const sweepBaseColor = useMemo(() => new THREE.Color(sweepColor), [sweepColor]);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    try {
      if (state && state.scene) state.scene.background = null;
      if (state && state.gl) {
        state.gl.setClearColor(0x000000, 0);
        if (typeof state.gl.setClearAlpha === 'function') state.gl.setClearAlpha(0);
        if (state.gl.domElement) state.gl.domElement.style.background = 'transparent';
      }
    } catch (_) {}

    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const mesh = nodesRef.current;
    const pattern = patternRef.current;
    const pulse = pulseRef.current;
    const lanePulse = lanePulseRef.current;
    if (!mesh || !pattern || !pulse || !lanePulse) return;

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(1, bpmRaw);
    const stepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);

    phaseRef.current += dt * stepsPerSec;
    while (phaseRef.current >= stepCount) {
      phaseRef.current -= stepCount;
      loopCountRef.current += 1;
      if (evolveLoops > 0 && (loopCountRef.current % Math.max(1, Math.round(evolveLoops))) === 0) {
        patternRef.current = buildPattern(stepCount, laneCount, density);
      }
    }

    const phase = phaseRef.current;
    const currentStep = Math.floor(phase);
    const sweepAngle = (phase / stepCount) * TAU;

    if (currentStep !== lastStepRef.current) {
      lastStepRef.current = currentStep;
      sweepPulseRef.current = 1;
      const isMidiOwner = claimMidiOwnership();
      const midi = (sendMidi && isMidiOwner) ? (globalThis && globalThis.VJ_MIDI) : null;
      const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));

      for (let lane = 0; lane < laneCount; lane++) {
        const idx = lane * stepCount + currentStep;
        if (pattern[idx] !== 1) continue;
        pulse[idx] = 1;
        lanePulse[lane] = 1;
        const laneT = laneCount > 1 ? lane / (laneCount - 1) : 0;
        const radius = 0.24 + laneT * 0.62;
        const angle = (currentStep / stepCount) * TAU + rotateOffset * lane;
        const hit = hitStateRef.current[lane];
        if (hit) {
          hit.active = true;
          hit.t = 1;
          hit.x = Math.cos(angle) * radius;
          hit.y = Math.sin(angle) * radius;
        }
        const note = Math.max(0, Math.min(127, midiForLane(lane, rootMidi)));
        const velocity = Math.max(0.35, Math.min(1, 0.72 + (1 - lane / laneCount) * 0.24));
        const durMs = Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000));
        const eventKey = `${loopCountRef.current}:${currentStep}:${lane}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try {
            midi.sendNote(note, velocity, channel, durMs);
          } catch (_) {}
        }
      }
    }

    sweepPulseRef.current = Math.max(0, sweepPulseRef.current - dt * 3.4);
    if (sweepPivotRef.current) {
      sweepPivotRef.current.rotation.z = sweepAngle;
    }
    if (sweepRef.current && sweepRef.current.material) {
      sweepRef.current.material.opacity = 0.3 + sweepPulseRef.current * 0.55;
      sweepRef.current.scale.set(1 + sweepPulseRef.current * 0.12, 1 + sweepPulseRef.current * 3.2, 1);
    }
    if (coreRef.current && coreRef.current.material) {
      coreRef.current.scale.setScalar(1 + sweepPulseRef.current * 0.45);
      coreRef.current.material.opacity = 0.5 + sweepPulseRef.current * 0.45;
    }

    for (let lane = 0; lane < laneCount; lane++) {
      lanePulse[lane] = Math.max(0, lanePulse[lane] - dt * 2.6);
      const laneT = laneCount > 1 ? lane / (laneCount - 1) : 0;
      const radius = 0.24 + laneT * 0.62;
      const ring = ringRefs.current[lane] && ringRefs.current[lane].current;
      if (ring) {
        ring.scale.set(radius, radius, 1);
        if (ring.material) {
          ring.material.opacity = 0.08 + lanePulse[lane] * 0.32;
        }
      }
    }

    for (let lane = 0; lane < laneCount; lane++) {
      const laneT = laneCount > 1 ? lane / (laneCount - 1) : 0;
      const radius = 0.24 + laneT * 0.62;
      const lanePhase = rotateOffset * lane;
      for (let step = 0; step < stepCount; step++) {
        const i = lane * stepCount + step;
        pulse[i] = Math.max(0, pulse[i] - dt * 5.4);
        const active = pattern[i] === 1;
        const angle = (step / stepCount) * TAU + lanePhase;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const p = pulse[i];
        const stepDistance = Math.abs(((angle - sweepAngle + Math.PI) % TAU) - Math.PI);
        const sweepGlow = Math.max(0, 1 - stepDistance / 0.24);
        const nodeScale = (active ? 0.34 : 0.12) + p * 0.4 + sweepGlow * (active ? 0.08 : 0.02);
        dummy.position.set(x, y, 0);
        dummy.scale.setScalar(nodeScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        if (active) {
          tmpColor.copy(dotBaseColor).lerp(sweepBaseColor, Math.min(1, p * 0.95 + sweepGlow * 0.45));
          tmpColor.multiplyScalar(0.5 + p * 0.95 + sweepGlow * 0.25);
        } else {
          tmpColor.copy(offColor).lerp(dotBaseColor, sweepGlow * 0.12);
        }
        mesh.setColorAt(i, tmpColor);
      }
    }

    for (let lane = 0; lane < laneCount; lane++) {
      const hit = hitStateRef.current[lane];
      const flash = flashRefs.current[lane] && flashRefs.current[lane].current;
      if (hit && hit.active) {
        hit.t = Math.max(0, hit.t - dt * 4.8);
        if (hit.t <= 0) hit.active = false;
      }
      if (!flash) continue;
      if (!hit || !hit.active) {
        flash.visible = false;
        continue;
      }
      flash.visible = true;
      flash.position.set(hit.x, hit.y, 0);
      flash.scale.setScalar(0.08 + (1 - hit.t) * 0.22);
      if (flash.material) {
        flash.material.opacity = hit.t * 0.95;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return React.createElement('group', { scale: [scaleValue, scaleValue, scaleValue] },
    React.createElement('group', { ref: sweepPivotRef },
      React.createElement('mesh', { ref: sweepRef, position: [0.82, 0, 0] },
        React.createElement('primitive', { object: sweepGeom, attach: 'geometry' }),
        React.createElement('meshBasicMaterial', {
          color: sweepColor,
          transparent: true,
          opacity: 0.3,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    ),
    ...Array.from({ length: laneCount }).map((_, lane) => React.createElement('mesh', {
      key: `ring-${lane}`,
      ref: ringRefs.current[lane],
      position: [0, 0, 0],
    },
      React.createElement('primitive', { object: ringGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: dotColor,
        transparent: true,
        opacity: 0.08,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    )),
    ...Array.from({ length: laneCount }).map((_, lane) => React.createElement('mesh', {
      key: `flash-${lane}`,
      ref: flashRefs.current[lane],
      visible: false,
      position: [0, 0, 0],
    },
      React.createElement('primitive', { object: flashGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: sweepColor,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    )),
    React.createElement('instancedMesh', {
      ref: nodesRef,
      args: [dotGeom, dotMat, totalNodes],
    }),
    React.createElement('mesh', { ref: coreRef, position: [0, 0, 0] },
      React.createElement('primitive', { object: coreGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: sweepColor,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
}
