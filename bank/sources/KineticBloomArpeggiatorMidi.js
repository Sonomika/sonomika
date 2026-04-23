const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Kinetic Bloom Arpeggiator (MIDI)',
  description: 'An arpeggiator visualized as a clear flat note chart with a moving playhead.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'notes', type: 'number', value: 4, min: 2, max: 8, step: 1, description: 'notes per octave in the arpeggio pool' },
    { name: 'octaves', type: 'number', value: 2, min: 1, max: 4, step: 1, description: 'how many octaves the arpeggio spans' },
    { name: 'interval', type: 'number', value: 2, min: 1, max: 7, step: 1, description: 'semitone distance between notes in the base cluster' },
    { name: 'arpMode', type: 'select', value: 'insideOut', options: ['up', 'down', 'upDown', 'insideOut', 'random'], description: 'arpeggio playback order' },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1, description: '4 = 16th-note arpeggiation' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 126, min: 40, max: 220, step: 1 },
    { name: 'gapChance', type: 'number', value: 0.1, min: 0, max: 1, step: 0.02, description: 'chance that an arpeggio step is silent' },
    { name: 'bloomRadius', type: 'number', value: 1.05, min: 0.4, max: 1.8, step: 0.02, description: 'overall width of the flat note chart' },
    { name: 'rotationSpeed', type: 'number', value: 0.24, min: 0, max: 1.2, step: 0.02, description: 'constant bloom rotation speed' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.18, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'bloomColor', type: 'color', value: '#80d8ff' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_KINETIC_BLOOM_ARP_OWNER__';
const OWNER_LEASE_MS = 250;
const MAX_DT = 0.1;
const MAX_ARP_EVENTS_PER_FRAME = 8;

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_KINETIC_BLOOM_ARP_LAST__';
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

function buildNotePool(noteCount, octaves, interval, rootMidi) {
  const pool = [];
  const base = Math.round(rootMidi);
  const notesPerOctave = Math.max(2, Math.floor(noteCount));
  const octaveCount = Math.max(1, Math.floor(octaves));
  const gap = Math.max(1, Math.floor(interval));
  for (let oct = 0; oct < octaveCount; oct++) {
    for (let i = 0; i < notesPerOctave; i++) {
      pool.push(Math.max(0, Math.min(127, base + i * gap + oct * 12)));
    }
  }
  return pool;
}

function buildPlayOrder(length, mode) {
  if (length <= 0) return [];
  if (mode === 'random') return [];
  if (mode === 'down') return Array.from({ length }, (_, i) => length - 1 - i);
  if (mode === 'upDown') {
    if (length === 1) return [0];
    return [
      ...Array.from({ length }, (_, i) => i),
      ...Array.from({ length: length - 2 }, (_, i) => length - 2 - i),
    ];
  }
  if (mode === 'insideOut') {
    const centerLeft = Math.floor((length - 1) / 2);
    const centerRight = length % 2 === 0 ? centerLeft + 1 : centerLeft;
    const order = [];
    const seen = new Set();
    let spread = 0;
    while (order.length < length) {
      const a = centerLeft - spread;
      const b = centerRight + spread;
      if (a >= 0 && !seen.has(a)) {
        seen.add(a);
        order.push(a);
      }
      if (b < length && !seen.has(b)) {
        seen.add(b);
        order.push(b);
      }
      spread += 1;
    }
    return order;
  }
  return Array.from({ length }, (_, i) => i);
}

function createSpecs(notePool, bloomRadius) {
  const count = notePool.length;
  const specs = [];
  const span = Math.max(0.8, bloomRadius * 1.7);
  const baselineY = -0.7;
  const minNote = count > 0 ? Math.min(...notePool) : 36;
  const maxNote = count > 0 ? Math.max(...notePool) : 48;
  const noteRange = Math.max(1, maxNote - minNote);

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const x = -span + t * span * 2;
    const normalized = (notePool[i] - minNote) / noteRange;
    const y = baselineY + 0.28 + normalized * 1.22;
    specs.push({ x, y, baselineY, t });
  }
  return specs;
}

export default function KineticBloomArpeggiatorMidiSource({
  notes = 4,
  octaves = 2,
  interval = 2,
  arpMode = 'insideOut',
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 126,
  gapChance = 0.1,
  bloomRadius = 1.05,
  rotationSpeed = 0.24,
  rootMidi = 36,
  noteLength = 0.18,
  bloomColor = '#80d8ff',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const notePool = useMemo(
    () => buildNotePool(notes, octaves, interval, rootMidi),
    [notes, octaves, interval, rootMidi]
  );
  const playOrder = useMemo(
    () => buildPlayOrder(notePool.length, arpMode),
    [notePool.length, arpMode]
  );
  const specs = useMemo(
    () => createSpecs(notePool, bloomRadius),
    [notePool, bloomRadius]
  );

  const worldRef = useRef(null);
  const railRef = useRef(null);
  const coreRef = useRef(null);
  const haloRef = useRef(null);
  const petalsRef = useRef(null);
  const tipsRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const pulseRef = useRef(null);
  const seqPosRef = useRef(0);
  const activeIndexRef = useRef(-1);
  const phaseRef = useRef(0);
  const stepCountRef = useRef(0);
  const bloomPulseRef = useRef(0);

  useEffect(() => {
    pulseRef.current = new Float32Array(notePool.length || 1);
    seqPosRef.current = 0;
    activeIndexRef.current = -1;
    phaseRef.current = 0;
    stepCountRef.current = 0;
    bloomPulseRef.current = 0;
  }, [notePool.length, arpMode, bloomRadius]);

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
    const myKey = `kinetic-bloom-arp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const petalGeom = useMemo(() => new THREE.PlaneGeometry(0.08, 1), []);
  useEffect(() => () => { try { petalGeom.dispose(); } catch (_) {} }, [petalGeom]);

  const tipGeom = useMemo(() => new THREE.CircleGeometry(0.08, 24), []);
  useEffect(() => () => { try { tipGeom.dispose(); } catch (_) {} }, [tipGeom]);

  const coreGeom = useMemo(() => new THREE.CircleGeometry(0.18, 32), []);
  useEffect(() => () => { try { coreGeom.dispose(); } catch (_) {} }, [coreGeom]);

  const haloGeom = useMemo(() => new THREE.PlaneGeometry(0.05, 1), []);
  useEffect(() => () => { try { haloGeom.dispose(); } catch (_) {} }, [haloGeom]);

  const railGeom = useMemo(() => new THREE.PlaneGeometry(3.8, 0.018), []);
  useEffect(() => () => { try { railGeom.dispose(); } catch (_) {} }, [railGeom]);

  const petalMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { petalMat.dispose(); } catch (_) {} }, [petalMat]);

  const tipMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { tipMat.dispose(); } catch (_) {} }, [tipMat]);

  const bloomBase = useMemo(() => new THREE.Color(bloomColor), [bloomColor]);
  const bloomWhite = useMemo(() => new THREE.Color('#ffffff'), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    const dt = Math.min(MAX_DT, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const petalMesh = petalsRef.current;
    const tipMesh = tipsRef.current;
    const pulse = pulseRef.current;
    if (!petalMesh || !tipMesh || !pulse || notePool.length === 0) return;

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 126;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(1, bpmRaw);
    const stepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);
    const timeNow = (globalThis.performance && typeof globalThis.performance.now === 'function')
      ? globalThis.performance.now()
      : Date.now();

    if (worldRef.current) {
      worldRef.current.rotation.set(0, 0, Math.sin(timeNow * 0.00012) * Math.max(0, rotationSpeed) * 0.08);
    }
    if (railRef.current && railRef.current.material) {
      railRef.current.material.opacity = 0.14 + bloomPulseRef.current * 0.08;
    }

    phaseRef.current += dt * stepsPerSec;
    let events = 0;
    while (phaseRef.current >= 1 && events < MAX_ARP_EVENTS_PER_FRAME) {
      phaseRef.current -= 1;
      let nextIndex = -1;
      if (arpMode === 'random') {
        nextIndex = Math.floor(Math.random() * notePool.length);
      } else if (playOrder.length > 0) {
        nextIndex = playOrder[seqPosRef.current % playOrder.length];
        seqPosRef.current = (seqPosRef.current + 1) % Math.max(1, playOrder.length);
      }

      stepCountRef.current += 1;
      activeIndexRef.current = -1;
      if (nextIndex >= 0 && Math.random() >= Math.max(0, Math.min(1, gapChance))) {
        activeIndexRef.current = nextIndex;
        pulse[nextIndex] = 1;
        bloomPulseRef.current = 1;
        const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
        const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
        const note = notePool[nextIndex];
        const eventKey = `${stepCountRef.current}:${nextIndex}:${note}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try {
            midi.sendNote(note, 0.85, channel, Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000)));
          } catch (_) {}
        }
      }
      events += 1;
    }
    if (events >= MAX_ARP_EVENTS_PER_FRAME && phaseRef.current >= 1) {
      phaseRef.current = 0;
    }

    bloomPulseRef.current = Math.max(0, bloomPulseRef.current - dt * 3.6);

    if (coreRef.current) {
      const coreScale = 1 + bloomPulseRef.current * 0.18;
      coreRef.current.scale.set(coreScale, coreScale, coreScale);
      const activeSpec = activeIndexRef.current >= 0 ? specs[activeIndexRef.current] : null;
      coreRef.current.position.set(activeSpec ? activeSpec.x : 0, activeSpec ? activeSpec.y : -0.7, 0.03);
      if (coreRef.current.material) {
        coreRef.current.material.opacity = activeSpec ? (0.22 + bloomPulseRef.current * 0.4) : 0.04;
      }
    }
    if (haloRef.current) {
      const activeSpec = activeIndexRef.current >= 0 ? specs[activeIndexRef.current] : null;
      const haloHeight = activeSpec ? Math.max(0.24, activeSpec.y - activeSpec.baselineY + 0.16) : 0.2;
      haloRef.current.position.set(activeSpec ? activeSpec.x : 0, activeSpec ? ((activeSpec.y + activeSpec.baselineY) * 0.5) : -0.6, 0.01);
      haloRef.current.scale.set(1 + bloomPulseRef.current * 0.4, haloHeight, 1);
      if (haloRef.current.material) {
        haloRef.current.material.opacity = activeSpec ? (0.12 + bloomPulseRef.current * 0.2) : 0.03;
      }
    }

    for (let i = 0; i < specs.length; i++) {
      pulse[i] = Math.max(0, pulse[i] - dt * 4.6);
      const spec = specs[i];
      const p = pulse[i];
      const isActive = i === activeIndexRef.current;
      const stemHeight = Math.max(0.16, spec.y - spec.baselineY);
      const width = 0.02 + spec.t * 0.016 + p * 0.025 + (isActive ? 0.018 : 0);

      dummy.position.set(spec.x, spec.baselineY + stemHeight * 0.5, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(width, stemHeight + p * 0.08, 1);
      dummy.updateMatrix();
      petalMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(spec.x, spec.y, 0.02);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.11 + p * 0.1 + (isActive ? 0.08 : 0));
      dummy.updateMatrix();
      tipMesh.setMatrixAt(i, dummy.matrix);

      if (isActive) {
        tmpColor.copy(bloomBase).lerp(bloomWhite, Math.min(1, 0.72 + p * 0.28));
      } else {
        tmpColor.copy(bloomBase).multiplyScalar(0.22 + p * 0.28);
      }
      petalMesh.setColorAt(i, tmpColor);
      tipMesh.setColorAt(i, tmpColor);
    }

    petalMesh.instanceMatrix.needsUpdate = true;
    tipMesh.instanceMatrix.needsUpdate = true;
    if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;
    if (tipMesh.instanceColor) tipMesh.instanceColor.needsUpdate = true;
  });

  return React.createElement('group', { ref: worldRef },
    React.createElement('mesh', {
      ref: railRef,
      position: [0, -0.7, -0.02],
    },
      React.createElement('primitive', { object: railGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: bloomColor,
        transparent: true,
        opacity: 0.14,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('mesh', {
      ref: coreRef,
    },
      React.createElement('primitive', { object: coreGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: bloomColor,
        transparent: true,
        opacity: 0.22,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ),
    React.createElement('mesh', {
      ref: haloRef,
    },
      React.createElement('primitive', { object: haloGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: bloomColor,
        transparent: true,
        opacity: 0.14,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ),
    React.createElement('instancedMesh', {
      ref: petalsRef,
      args: [petalGeom, petalMat, Math.max(1, specs.length)],
    }),
    React.createElement('instancedMesh', {
      ref: tipsRef,
      args: [tipGeom, tipMat, Math.max(1, specs.length)],
    })
  );
}
