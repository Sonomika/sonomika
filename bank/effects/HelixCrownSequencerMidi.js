const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Helix Crown Sequencer (MIDI)',
  description: 'A 3D orbital sequencer: glowing note nodes spiral around stacked rings while a rotating light blade sweeps the crown and fires MIDI notes.',
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
    { name: 'twist', type: 'number', value: 0.45, min: -1.5, max: 1.5, step: 0.05, description: 'spiral offset between rings' },
    { name: 'orbColor', type: 'color', value: '#7ce7ff' },
    { name: 'bladeColor', type: 'color', value: '#ff66cc' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const TAU = Math.PI * 2;
const OWNER_SLOT = '__VJ_HELIX_CROWN_SEQ_OWNER__';
const OWNER_LEASE_MS = 250;

function midiForLane(lane, rootMidi) {
  return Math.round(rootMidi) + lane;
}

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_HELIX_CROWN_SEQ_LAST__';
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
    const laneBias = 0.7 + 0.3 * (1 - lane / Math.max(1, laneCount - 1));
    for (let step = 0; step < stepCount; step++) {
      const idx = lane * stepCount + step;
      const quarterAccent = (step % stride) === 0;
      const offbeatAccent = (step % (stride * 2)) === Math.floor(stride / 2);
      const probability = density * laneBias + (quarterAccent ? 0.18 : 0) + (offbeatAccent ? 0.08 : 0);
      pat[idx] = Math.random() < Math.min(0.92, probability) ? 1 : 0;
    }
  }

  // Guarantee at least one note per step so the crown always feels alive.
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

export default function HelixCrownSequencerMidiSource({
  lanes = 6,
  steps = 12,
  density = 0.34,
  stepsPerBeat = 2,
  bpmSync = true,
  manualBpm = 122,
  evolveLoops = 4,
  rootMidi = 48,
  noteLength = 0.22,
  twist = 0.45,
  orbColor = '#7ce7ff',
  bladeColor = '#ff66cc',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const laneCount = Math.max(3, Math.floor(lanes));
  const stepCount = Math.max(6, Math.floor(steps));
  const totalNodes = laneCount * stepCount;

  const worldRef = useRef(null);
  const bladePivotRef = useRef(null);
  const bladeGlowRef = useRef(null);
  const coreRef = useRef(null);
  const nodesRef = useRef(null);
  const ringRefs = useRef([]);
  const beamRefs = useRef([]);
  const flashRefs = useRef([]);
  const ownerKeyRef = useRef(null);

  const patternRef = useRef(null);
  const pulseRef = useRef(null);
  const lanePulseRef = useRef(null);
  const hitStateRef = useRef([]);
  const phaseRef = useRef(0);
  const lastStepRef = useRef(-1);
  const loopCountRef = useRef(0);
  const bladePulseRef = useRef(0);

  if (ringRefs.current.length !== laneCount) {
    ringRefs.current = Array.from({ length: laneCount }, () => React.createRef());
  }
  if (beamRefs.current.length !== laneCount) {
    beamRefs.current = Array.from({ length: laneCount }, () => React.createRef());
  }
  if (flashRefs.current.length !== laneCount) {
    flashRefs.current = Array.from({ length: laneCount }, () => React.createRef());
  }

  useEffect(() => {
    patternRef.current = buildPattern(stepCount, laneCount, density);
    pulseRef.current = new Float32Array(totalNodes);
    lanePulseRef.current = new Float32Array(laneCount);
    hitStateRef.current = Array.from({ length: laneCount }, () => ({ active: false, t: 0, x: 0, y: 0, z: 0 }));
    phaseRef.current = 0;
    lastStepRef.current = -1;
    loopCountRef.current = 0;
    bladePulseRef.current = 0;
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
    const myKey = `helix-crown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const nodeGeom = useMemo(() => new THREE.IcosahedronGeometry(0.06, 1), []);
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

  const bladeGeom = useMemo(() => new THREE.BoxGeometry(1.7, 0.03, 0.1), []);
  useEffect(() => () => { try { bladeGeom.dispose(); } catch (_) {} }, [bladeGeom]);

  const ringGeom = useMemo(() => new THREE.TorusGeometry(0.5, 0.008, 10, 96), []);
  useEffect(() => () => { try { ringGeom.dispose(); } catch (_) {} }, [ringGeom]);

  const coreGeom = useMemo(() => new THREE.OctahedronGeometry(0.12, 1), []);
  useEffect(() => () => { try { coreGeom.dispose(); } catch (_) {} }, [coreGeom]);

  const beamGeom = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), []);
  useEffect(() => () => { try { beamGeom.dispose(); } catch (_) {} }, [beamGeom]);

  const flashGeom = useMemo(() => new THREE.IcosahedronGeometry(0.12, 1), []);
  useEffect(() => () => { try { flashGeom.dispose(); } catch (_) {} }, [flashGeom]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offColor = useMemo(() => new THREE.Color('#102030'), []);
  const nodeBaseColor = useMemo(() => new THREE.Color(orbColor), [orbColor]);
  const bladeBaseColor = useMemo(() => new THREE.Color(bladeColor), [bladeColor]);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const unitY = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state, delta) => {
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
      bladePulseRef.current = 1;
      const isMidiOwner = claimMidiOwnership();
      const midi = (sendMidi && isMidiOwner) ? (globalThis && globalThis.VJ_MIDI) : null;
      const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));

      for (let lane = 0; lane < laneCount; lane++) {
        const idx = lane * stepCount + currentStep;
        if (pattern[idx] !== 1) continue;
        pulse[idx] = 1;
        lanePulse[lane] = 1;
        const laneT = laneCount > 1 ? lane / (laneCount - 1) : 0;
        const radius = 0.34 + laneT * 0.46;
        const y = -0.72 + laneT * 1.44;
        const lanePhase = twist * lane;
        const stepAngle = (currentStep / stepCount) * TAU + lanePhase;
        const hit = hitStateRef.current[lane];
        if (hit) {
          hit.active = true;
          hit.t = 1;
          hit.x = Math.cos(stepAngle) * radius;
          hit.y = y;
          hit.z = Math.sin(stepAngle) * radius;
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

    const time = state.clock.elapsedTime;
    if (worldRef.current) {
      worldRef.current.rotation.x = 0.78;
      worldRef.current.rotation.z = Math.sin(time * 0.23) * 0.12;
      worldRef.current.rotation.y = time * 0.18;
    }
    if (bladePivotRef.current) {
      bladePivotRef.current.rotation.y = sweepAngle;
    }
    if (bladeGlowRef.current && bladeGlowRef.current.material) {
      bladePulseRef.current = Math.max(0, bladePulseRef.current - dt * 3.4);
      bladeGlowRef.current.material.opacity = 0.32 + bladePulseRef.current * 0.55 + 0.18 * Math.sin(time * 4.5);
      bladeGlowRef.current.scale.set(1 + bladePulseRef.current * 0.24, 1 + bladePulseRef.current * 3.5, 1 + bladePulseRef.current * 1.2);
    }
    if (coreRef.current) {
      const pulseScale = 1 + Math.sin(time * 2.2) * 0.08 + bladePulseRef.current * 0.18;
      coreRef.current.scale.setScalar(pulseScale);
      coreRef.current.rotation.x = time * 0.8;
      coreRef.current.rotation.y = time * 1.1;
    }

    for (let lane = 0; lane < laneCount; lane++) {
      lanePulse[lane] = Math.max(0, lanePulse[lane] - dt * 2.6);
      const ring = ringRefs.current[lane] && ringRefs.current[lane].current;
      if (ring) {
        const laneT = laneCount > 1 ? lane / (laneCount - 1) : 0;
        const radius = 0.34 + laneT * 0.46;
        ring.position.y = -0.72 + laneT * 1.44;
        ring.scale.set(radius / 0.5, radius / 0.5, 1);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = lane * twist * 0.12;
        if (ring.material) {
          ring.material.opacity = 0.12 + lanePulse[lane] * 0.6;
        }
      }
    }

    for (let lane = 0; lane < laneCount; lane++) {
      const laneT = laneCount > 1 ? lane / (laneCount - 1) : 0;
      const radius = 0.34 + laneT * 0.46;
      const y = -0.72 + laneT * 1.44;
      const lanePhase = twist * lane;
      for (let step = 0; step < stepCount; step++) {
        const i = lane * stepCount + step;
        pulse[i] = Math.max(0, pulse[i] - dt * 5.2);
        const active = pattern[i] === 1;
        const stepAngle = (step / stepCount) * TAU + lanePhase;
        const x = Math.cos(stepAngle) * radius;
        const z = Math.sin(stepAngle) * radius;
        const p = pulse[i];
        const stepDistance = Math.abs(((stepAngle - sweepAngle + Math.PI) % TAU) - Math.PI);
        const sweepGlow = Math.max(0, 1 - stepDistance / 0.38);
        const scaleValue = (active ? 0.38 : 0.14) + p * 0.32 + sweepGlow * (active ? 0.1 : 0.03);
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(scaleValue);
        dummy.lookAt(0, y, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        if (active) {
          tmpColor.copy(nodeBaseColor).lerp(bladeBaseColor, Math.min(1, p * 0.8 + sweepGlow * 0.45));
          tmpColor.multiplyScalar(0.55 + p * 0.8 + sweepGlow * 0.35);
        } else {
          tmpColor.copy(offColor).lerp(nodeBaseColor, sweepGlow * 0.18);
        }
        mesh.setColorAt(i, tmpColor);
      }
    }

    for (let lane = 0; lane < laneCount; lane++) {
      const hit = hitStateRef.current[lane];
      const beam = beamRefs.current[lane] && beamRefs.current[lane].current;
      const flash = flashRefs.current[lane] && flashRefs.current[lane].current;
      if (hit && hit.active) {
        hit.t = Math.max(0, hit.t - dt * 4.6);
        if (hit.t <= 0) hit.active = false;
      }
      if (beam) {
        if (!hit || !hit.active) {
          beam.visible = false;
        } else {
          const beamT = hit.t;
          const length = Math.max(0.001, Math.sqrt(hit.x * hit.x + hit.y * hit.y + hit.z * hit.z));
          beam.visible = true;
          beam.position.set(hit.x * 0.5, hit.y * 0.5, hit.z * 0.5);
          beam.scale.set(0.02 + beamT * 0.035, length, 0.02 + beamT * 0.035);
          tmpDir.set(hit.x, hit.y, hit.z).normalize();
          beam.quaternion.setFromUnitVectors(unitY, tmpDir);
          if (beam.material) beam.material.opacity = beamT * 0.95;
        }
      }
      if (flash) {
        if (!hit || !hit.active) {
          flash.visible = false;
        } else {
          const flashT = hit.t;
          flash.visible = true;
          flash.position.set(hit.x, hit.y, hit.z);
          flash.scale.setScalar(0.35 + (1 - flashT) * 0.65 + flashT * 0.35);
          if (flash.material) flash.material.opacity = flashT;
        }
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return React.createElement('group', { ref: worldRef },
    React.createElement('mesh', { ref: coreRef, position: [0, 0, 0] },
      React.createElement('primitive', { object: coreGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: bladeColor,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ),
    React.createElement('group', { ref: bladePivotRef },
      React.createElement('mesh', { ref: bladeGlowRef, position: [0, 0, 0] },
        React.createElement('primitive', { object: bladeGeom, attach: 'geometry' }),
        React.createElement('meshBasicMaterial', {
          color: bladeColor,
          transparent: true,
          opacity: 0.32,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    ),
    ...Array.from({ length: laneCount }).map((_, lane) => React.createElement('mesh', {
      key: `beam-${lane}`,
      ref: beamRefs.current[lane],
      visible: false,
      position: [0, 0, 0],
    },
      React.createElement('primitive', { object: beamGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: bladeColor,
        transparent: true,
        opacity: 0,
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
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )),
    ...Array.from({ length: laneCount }).map((_, lane) => React.createElement('mesh', {
      key: `ring-${lane}`,
      ref: ringRefs.current[lane],
      position: [0, 0, 0],
    },
      React.createElement('primitive', { object: ringGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: orbColor,
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )),
    React.createElement('instancedMesh', {
      ref: nodesRef,
      args: [nodeGeom, nodeMat, totalNodes],
    })
  );
}
