const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Impact MIDI Probe',
  description: 'Single bouncing ball test source. Each floor impact should send exactly one MIDI note.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'gravity', type: 'number', value: 2.8, min: 0.5, max: 8.0, step: 0.1 },
    { name: 'bounce', type: 'number', value: 0.72, min: 0.2, max: 0.95, step: 0.01 },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 84, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.25, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send one MIDI note on each visible impact' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
    { name: 'ballColor', type: 'color', value: '#ffd166' },
    { name: 'impactColor', type: 'color', value: '#ffffff' },
  ],
};

const FLOOR_Y = -0.78;
const START_Y = 0.9;
const BALL_RADIUS = 0.06;
const OWNER_SLOT = '__VJ_IMPACT_MIDI_PROBE_OWNER__';
const OWNER_LEASE_MS = 250;

function canSendImpactMidi() {
  try {
    const slot = '__VJ_IMPACT_MIDI_PROBE_LAST_AT__';
    const now = (globalThis.performance && typeof globalThis.performance.now === 'function')
      ? globalThis.performance.now()
      : Date.now();
    const lastAt = typeof globalThis[slot] === 'number' ? globalThis[slot] : -Infinity;
    if ((now - lastAt) < 80) return false;
    globalThis[slot] = now;
    return true;
  } catch (_) {
    return true;
  }
}

export default function ImpactMidiProbeSource({
  gravity = 2.8,
  bounce = 0.72,
  rootMidi = 60,
  noteLength = 0.25,
  sendMidi = true,
  midiChannel = 1,
  ballColor = '#ffd166',
  impactColor = '#ffffff',
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;

  const ballRef = useRef(null);
  const floorRef = useRef(null);
  const ringRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const stateRef = useRef({
    y: START_Y,
    vy: 0,
    impactPulse: 0,
  });

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
    stateRef.current.y = START_Y;
    stateRef.current.vy = 0;
    stateRef.current.impactPulse = 0;
    const myKey = `impact-midi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  useFrame((state, delta) => {
    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const s = stateRef.current;
    const ball = ballRef.current;
    const floor = floorRef.current;
    const ring = ringRef.current;

    const isMidiOwner = claimMidiOwnership();
    const midi = (sendMidi && isMidiOwner) ? (globalThis && globalThis.VJ_MIDI) : null;
    const clampedBounce = Math.max(0.2, Math.min(0.95, bounce));
    const g = Math.max(0.2, gravity);

    s.vy -= g * dt;
    s.y += s.vy * dt;

    let impactHappened = false;
    if (s.y <= FLOOR_Y) {
      s.y = FLOOR_Y;
      if (s.vy < 0) {
        s.vy = -s.vy * clampedBounce;
        s.impactPulse = 1;
        impactHappened = true;
        if (Math.abs(s.vy) < 0.18) {
          s.vy = 1.05;
        }
      }
    }

    s.impactPulse = Math.max(0, s.impactPulse - dt * 3.5);

    if (ball) {
      ball.visible = true;
      ball.position.set(0, s.y, 0);
      const ballScale = 1 + s.impactPulse * 0.2;
      ball.scale.set(ballScale, ballScale, 1);
    }

    if (floor && floor.material) {
      floor.material.opacity = 0.28 + s.impactPulse * 0.65;
    }

    if (ring) {
      if (s.impactPulse <= 0.001) {
        ring.visible = false;
      } else {
        ring.visible = true;
        const ringScale = 0.16 + (1 - s.impactPulse) * 0.7;
        ring.position.set(0, FLOOR_Y, 0);
        ring.scale.set(ringScale, ringScale, 1);
        if (ring.material) {
          ring.material.opacity = s.impactPulse * 0.85;
        }
      }
    }

    if (impactHappened && midi && midi.sendNote && canSendImpactMidi()) {
      const note = Math.max(0, Math.min(127, Math.round(rootMidi)));
      const ch = Math.max(1, Math.min(16, Math.round(midiChannel)));
      const durMs = Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000));
      try {
        midi.sendNote(note, 0.9, ch, durMs);
      } catch (_) {}
    }
  });

  const ballGeom = useMemo(() => new THREE.CircleGeometry(BALL_RADIUS, 24), []);
  useEffect(() => () => { try { ballGeom.dispose(); } catch (_) {} }, [ballGeom]);

  const ringGeom = useMemo(() => new THREE.RingGeometry(0.92, 1.0, 48), []);
  useEffect(() => () => { try { ringGeom.dispose(); } catch (_) {} }, [ringGeom]);

  const floorGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -halfW, FLOOR_Y, 0,
      halfW, FLOOR_Y, 0,
    ]), 3));
    return g;
  }, [halfW]);
  useEffect(() => () => { try { floorGeom.dispose(); } catch (_) {} }, [floorGeom]);

  return React.createElement('group', null,
    React.createElement('line', { ref: floorRef },
      React.createElement('primitive', { object: floorGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: impactColor,
        transparent: true,
        opacity: 0.28,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('mesh', {
      ref: ballRef,
      visible: false,
      position: [0, START_Y, 0],
    },
      React.createElement('primitive', { object: ballGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: ballColor,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    ),
    React.createElement('mesh', {
      ref: ringRef,
      visible: false,
      position: [0, FLOOR_Y, 0],
    },
      React.createElement('primitive', { object: ringGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: impactColor,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    )
  );
}
