const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Butterfly Flower Chase (MIDI OUT)',
  description: 'Butterflies flutter through a flower field and send melodic MIDI notes when they sip nectar.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'butterflyCount', type: 'number', value: 9, min: 1, max: 90, step: 1 },
    { name: 'flowerCount', type: 'number', value: 18, min: 1, max: 180, step: 1 },
    { name: 'flutterSpeed', type: 'number', value: 1.15, min: 0.1, max: 4, step: 0.05 },
    { name: 'turnSpeed', type: 'number', value: 2.0, min: 0.2, max: 12, step: 0.1 },
    { name: 'wander', type: 'number', value: 1.7, min: 0, max: 3, step: 0.05 },
    { name: 'vision', type: 'number', value: 2.4, min: 0.1, max: 4, step: 0.05 },
    { name: 'sipRadius', type: 'number', value: 0.075, min: 0.01, max: 0.25, step: 0.005 },
    { name: 'butterflySize', type: 'number', value: 0.052, min: 0.012, max: 0.16, step: 0.002 },
    { name: 'flowerSize', type: 'number', value: 0.026, min: 0.008, max: 0.14, step: 0.002 },
    { name: 'butterflyColor', type: 'color', value: '#ffffff' },
    { name: 'flowerColor', type: 'color', value: '#ff7df3' },
    { name: 'nectarColor', type: 'color', value: '#7df9ff' },
    { name: 'rootMidi', type: 'number', value: 52, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 18, min: 1, max: 48, step: 1, description: 'Pentatonic range from bottom flowers to top flowers' },
    { name: 'noteLength', type: 'number', value: 0.2, min: 0.03, max: 2, step: 0.01 },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI when a butterfly sips nectar' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_BUTTERFLY_FLOWER_CHASE_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_BUTTERFLY_FLOWER_CHASE_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 35;
const PENTATONIC = [0, 2, 4, 7, 9];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

function randomIn(a, b) {
  return lerp(a, b, Math.random());
}

function midiForY(y, bottom, top, rootMidi, noteRange) {
  const amount = clamp01((y - bottom) / Math.max(0.0001, top - bottom));
  const degree = Math.round(amount * Math.max(1, noteRange));
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

export default function ButterflyFlowerChaseMidi({
  butterflyCount = 9,
  flowerCount = 18,
  flutterSpeed = 1.15,
  turnSpeed = 2.0,
  wander = 1.7,
  vision = 2.4,
  sipRadius = 0.075,
  butterflySize = 0.052,
  flowerSize = 0.026,
  butterflyColor = '#ffffff',
  flowerColor = '#ff7df3',
  nectarColor = '#7df9ff',
  rootMidi = 52,
  noteRange = 18,
  noteLength = 0.2,
  velocityBoost = 1.0,
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const ctx = useThree();
  const size = ctx && ctx.size ? ctx.size : { width: 1920, height: 1080 };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfWidth = aspect;
  const halfHeight = 1;

  const butterfliesRef = useRef([]);
  const flowersRef = useRef([]);
  const nectarBurstsRef = useRef([]);
  const consumedFlowerIdsRef = useRef(new Set());
  const ownerKeyRef = useRef(null);
  const flowerIdRef = useRef(1);

  const bodyMeshRef = useRef(null);
  const wingMeshRef = useRef(null);
  const flowerMeshRef = useRef(null);
  const burstMeshRef = useRef(null);

  const dummyBody = useMemo(() => new THREE.Object3D(), []);
  const dummyWing = useMemo(() => new THREE.Object3D(), []);
  const dummyFlower = useMemo(() => new THREE.Object3D(), []);
  const dummyBurst = useMemo(() => new THREE.Object3D(), []);
  const dummyBurstColor = useMemo(() => new THREE.Color(), []);

  const bodyGeometry = useMemo(() => new THREE.CircleGeometry(butterflySize * 0.28, 16), [butterflySize]);
  const wingGeometry = useMemo(() => new THREE.CircleGeometry(butterflySize * 0.5, 20), [butterflySize]);
  const flowerGeometry = useMemo(() => new THREE.CircleGeometry(flowerSize * 0.5, 18), [flowerSize]);
  const burstGeometry = useMemo(() => new THREE.RingGeometry(flowerSize * 0.45, flowerSize * 0.62, 24), [flowerSize]);

  const bodyMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(butterflyColor),
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [butterflyColor]);

  const wingMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(butterflyColor),
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [butterflyColor]);

  const flowerMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(flowerColor),
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [flowerColor]);

  const burstMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(nectarColor),
      transparent: true,
      opacity: 0.95,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [nectarColor]);

  const butterflyLimit = Math.max(1, Math.min(120, Math.floor(butterflyCount)));
  const flowerLimit = Math.max(1, Math.min(240, Math.floor(flowerCount)));
  const maxNectarBursts = 160;
  const maxWingInstances = butterflyLimit * 2;
  const pad = Math.max(butterflySize, flowerSize) * 2.2;
  const left = -halfWidth + pad;
  const right = halfWidth - pad;
  const bottom = -halfHeight + pad;
  const top = halfHeight - pad;

  const makeFlower = () => ({
    id: flowerIdRef.current++,
    x: randomIn(left, right),
    y: randomIn(bottom, top),
    phase: Math.random() * Math.PI * 2,
    nectar: 0.35 + Math.random() * 0.65,
  });

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

  useEffect(() => {
    ownerKeyRef.current = `butterfly-flower-chase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const butterflies = [];
    const flowers = [];

    for (let i = 0; i < butterflyLimit; i++) {
      const a = Math.random() * Math.PI * 2;
      butterflies.push({
        x: randomIn(left, right),
        y: randomIn(bottom, top),
        vx: Math.cos(a) * 0.28,
        vy: Math.sin(a) * 0.28,
        phase: Math.random() * Math.PI * 2,
        wingPhase: Math.random() * Math.PI * 2,
      });
    }

    for (let i = 0; i < flowerLimit; i++) flowers.push(makeFlower());

    butterfliesRef.current = butterflies;
    flowersRef.current = flowers;
    nectarBurstsRef.current = [];
    consumedFlowerIdsRef.current = new Set();
  }, [butterflyLimit, flowerLimit, left, right, bottom, top]);

  function fireMidiForFlower(butterflyIndex, flower) {
    if (!flower || consumedFlowerIdsRef.current.has(flower.id)) return;
    consumedFlowerIdsRef.current.add(flower.id);

    const note = midiForY(flower.y, bottom, top, rootMidi, noteRange);
    const velocity = clamp((0.38 + flower.nectar * 0.62) * velocityBoost, 0.05, 1);
    const channel = clamp(Math.round(midiChannel), 1, 16);
    const duration = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
    const eventKey = `flower:${flower.id}`;

    if (sendMidi && claimMidiOwnership() && shouldSendMidiEvent(eventKey)) {
      const midiOut = globalThis && globalThis.VJ_MIDI;
      if (midiOut && midiOut.sendNote) {
        try { midiOut.sendNote(note, velocity, channel, duration); } catch (_) {}
      }
    }

    nectarBurstsRef.current.push({
      x: flower.x,
      y: flower.y,
      age: 0,
      life: 0.42,
      velocity,
      nectar: flower.nectar,
      butterflyIndex,
    });
    if (nectarBurstsRef.current.length > maxNectarBursts) {
      nectarBurstsRef.current.splice(0, nectarBurstsRef.current.length - maxNectarBursts);
    }
  }

  useFrame((state, delta) => {
    const bodyMesh = bodyMeshRef.current;
    const wingMesh = wingMeshRef.current;
    const flowerMesh = flowerMeshRef.current;
    const burstMesh = burstMeshRef.current;
    if (!bodyMesh || !wingMesh || !flowerMesh || !burstMesh) return;

    const dt = clamp(delta || 0, 0, 0.05);
    const t = state && state.clock ? state.clock.elapsedTime : 0;
    const butterflies = butterfliesRef.current;
    const flowers = flowersRef.current;
    const nectarBursts = nectarBurstsRef.current;
    const speed = Math.max(0.02, flutterSpeed);
    const turn = Math.max(0.02, turnSpeed);
    const visionDist = Math.max(0.02, vision);
    const vision2 = visionDist * visionDist;
    const sipDist = Math.max(0.005, sipRadius);

    while (flowers.length < flowerLimit) flowers.push(makeFlower());
    while (flowers.length > flowerLimit) flowers.pop();

    for (let i = 0; i < butterflies.length; i++) {
      const b = butterflies[i];
      b.phase += dt * (3.4 + i * 0.03);
      b.wingPhase += dt * (14 + speed * 5 + Math.sin(b.phase) * 2);

      let bestIndex = -1;
      let bestD2 = Infinity;
      for (let j = 0; j < flowers.length; j++) {
        const fl = flowers[j];
        const dx = fl.x - b.x;
        const dy = fl.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < vision2 && d2 < bestD2) {
          bestD2 = d2;
          bestIndex = j;
        }
      }

      let ax = Math.sin(t * 1.2 + b.phase + i * 1.9) * wander;
      let ay = Math.cos(t * 1.1 + b.phase * 0.8 + i * 2.3) * wander;
      if (bestIndex >= 0) {
        const fl = flowers[bestIndex];
        const dx = fl.x - b.x;
        const dy = fl.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        ax += (dx / d) * turn * 1.55;
        ay += (dy / d) * turn * 1.55;

        if (d < sipDist) {
          const sipped = flowers.splice(bestIndex, 1)[0];
          fireMidiForFlower(i, sipped);
        }
      }

      const bx = clamp01((b.x - left) / Math.max(0.0001, right - left));
      const by = clamp01((b.y - bottom) / Math.max(0.0001, top - bottom));
      ax += ((1 - clamp01(bx / 0.14)) - clamp01((bx - 0.86) / 0.14)) * turn * 0.85;
      ay += ((1 - clamp01(by / 0.14)) - clamp01((by - 0.86) / 0.14)) * turn * 0.85;

      b.vx += ax * dt;
      b.vy += ay * dt;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) + 1e-6;
      const maxSpeed = speed * (0.72 + Math.sin(b.wingPhase) * 0.07);
      if (sp > maxSpeed) {
        b.vx = (b.vx / sp) * maxSpeed;
        b.vy = (b.vy / sp) * maxSpeed;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt + Math.sin(b.phase * 2.1) * dt * 0.04;
      if (b.x < left) { b.x = left; b.vx = Math.abs(b.vx) * 0.9 + 0.03; }
      if (b.x > right) { b.x = right; b.vx = -Math.abs(b.vx) * 0.9 - 0.03; }
      if (b.y < bottom) { b.y = bottom; b.vy = Math.abs(b.vy) * 0.9 + 0.03; }
      if (b.y > top) { b.y = top; b.vy = -Math.abs(b.vy) * 0.9 - 0.03; }
    }

    for (let i = nectarBursts.length - 1; i >= 0; i--) {
      nectarBursts[i].age += dt;
      if (nectarBursts[i].age >= nectarBursts[i].life) nectarBursts.splice(i, 1);
    }

    for (let i = 0; i < butterflies.length; i++) {
      const b = butterflies[i];
      const angle = Math.atan2(b.vy, b.vx);
      const bodyStretch = 1.7 + Math.sin(b.phase) * 0.16;
      dummyBody.position.set(b.x, b.y, 0.04);
      dummyBody.rotation.z = angle + Math.PI * 0.5;
      dummyBody.scale.set(0.55, bodyStretch, 1);
      dummyBody.updateMatrix();
      bodyMesh.setMatrixAt(i, dummyBody.matrix);

      const flap = 0.55 + Math.abs(Math.sin(b.wingPhase)) * 0.75;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const wingIndex = i * 2 + side;
        const offsetX = Math.cos(angle + Math.PI * 0.5) * sign * butterflySize * 0.28;
        const offsetY = Math.sin(angle + Math.PI * 0.5) * sign * butterflySize * 0.28;
        dummyWing.position.set(b.x + offsetX, b.y + offsetY, 0.03);
        dummyWing.rotation.z = angle + sign * (0.52 + flap * 0.28);
        dummyWing.scale.set(0.78 * flap, 1.18, 1);
        dummyWing.updateMatrix();
        wingMesh.setMatrixAt(wingIndex, dummyWing.matrix);
      }
    }
    bodyMesh.count = butterflies.length;
    wingMesh.count = Math.min(maxWingInstances, butterflies.length * 2);
    bodyMesh.instanceMatrix.needsUpdate = true;
    wingMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < flowers.length; i++) {
      const fl = flowers[i];
      fl.phase += dt * (1.0 + fl.nectar);
      const pulse = 1 + Math.sin(fl.phase * 2.4) * 0.14;
      dummyFlower.position.set(fl.x, fl.y, 0.02);
      dummyFlower.rotation.z = fl.phase * 0.3;
      dummyFlower.scale.set(pulse * (0.9 + fl.nectar * 0.35), pulse * (0.9 + Math.sin(fl.phase) * 0.08), 1);
      dummyFlower.updateMatrix();
      flowerMesh.setMatrixAt(i, dummyFlower.matrix);
    }
    flowerMesh.count = flowers.length;
    flowerMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < nectarBursts.length; i++) {
      const burst = nectarBursts[i];
      const k = clamp01(burst.age / burst.life);
      const fade = 1 - k;
      const scale = (0.6 + (1 - fade) * 2.8) * (0.65 + burst.velocity * 0.55 + burst.nectar * 0.38);
      dummyBurst.position.set(burst.x, burst.y, 0.07);
      dummyBurst.rotation.z = t * 1.4;
      dummyBurst.scale.set(scale, scale, 1);
      dummyBurst.updateMatrix();
      burstMesh.setMatrixAt(i, dummyBurst.matrix);
      dummyBurstColor.set(nectarColor).multiplyScalar(0.12 + fade * 1.25);
      burstMesh.setColorAt(i, dummyBurstColor);
    }
    burstMesh.count = nectarBursts.length;
    burstMesh.instanceMatrix.needsUpdate = true;
    if (burstMesh.instanceColor) burstMesh.instanceColor.needsUpdate = true;
    burstMesh.material.opacity = nectarBursts.length > 0 ? 0.95 : 0;
  });

  return React.createElement(
    'group',
    {},
    React.createElement('instancedMesh', {
      ref: flowerMeshRef,
      args: [flowerGeometry, flowerMaterial, Math.max(1, flowerLimit)],
      renderOrder: 9998,
    }),
    React.createElement('instancedMesh', {
      ref: wingMeshRef,
      args: [wingGeometry, wingMaterial, Math.max(1, maxWingInstances)],
      renderOrder: 9999,
    }),
    React.createElement('instancedMesh', {
      ref: bodyMeshRef,
      args: [bodyGeometry, bodyMaterial, Math.max(1, butterflyLimit)],
      renderOrder: 10000,
    }),
    React.createElement('instancedMesh', {
      ref: burstMeshRef,
      args: [burstGeometry, burstMaterial, maxNectarBursts],
      renderOrder: 10001,
    })
  );
}
