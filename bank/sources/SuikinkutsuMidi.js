// sonomika template – Suikinkutsu (水琴窟), the Japanese "water koto cave".
// A traditional Japanese garden instrument reimagined as a MIDI source: drops
// fall onto a still water surface, and each impact sends a note from a
// Japanese scale out to the selected MIDI output. Horizontal position maps to
// pitch; the visual is just drops + expanding ripples.
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Suikinkutsu (MIDI)',
  description: 'Japanese "water koto cave" as a MIDI source. Drops fall onto a still water surface; each impact sends a note from a Japanese scale to the selected MIDI output. Horizontal position maps to pitch.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'dropRate', type: 'number', value: 1.5, min: 0.2, max: 8.0, step: 0.1, description: 'average drops per second' },
    { name: 'randomness', type: 'number', value: 0.6, min: 0, max: 1, step: 0.05, description: 'timing jitter (0 = metronomic)' },
    { name: 'numTones', type: 'number', value: 9, min: 3, max: 16, step: 1 },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 2.4, min: 0.05, max: 6.0, step: 0.05, description: 'MIDI note duration in seconds' },
    { name: 'rippleLife', type: 'number', value: 2.0, min: 0.4, max: 5.0, step: 0.1 },
    { name: 'rippleMaxScale', type: 'number', value: 1.4, min: 0.3, max: 3.0, step: 0.1 },
    { name: 'dropColor', type: 'color', value: '#9fe9ff' },
    { name: 'rippleColor', type: 'color', value: '#6dd4ff' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output (pitch matches each drop)' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const WATER_Y = -0.75;
const TOP_Y = 1.1;
const DROP_FALL_SPEED = 1.9;
const RIPPLE_COUNT = 8;
const OWNER_SLOT = '__VJ_SUIKINKUTSU_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;

function midiForToneIndex(i, rootMidi) {
  return Math.round(rootMidi) + i;
}

function shouldSendMidi() {
  try {
    const slot = '__VJ_SUIKINKUTSU_MIDI_LAST_AT__';
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

function nextSpawnDelay(dropRate, randomness) {
  const rate = Math.max(0.05, dropRate);
  const base = 1 / rate;
  const jitter = (Math.random() * 2 - 1) * Math.max(0, Math.min(1, randomness)) * base;
  return Math.max(0.04, base + jitter);
}

export default function SuikinkutsuMidiSource({
  dropRate = 1.5,
  randomness = 0.6,
  numTones = 9,
  rootMidi = 57,
  noteLength = 2.4,
  rippleLife = 2.0,
  rippleMaxScale = 1.4,
  dropColor = '#9fe9ff',
  rippleColor = '#6dd4ff',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;

  const dropRef = useRef(null);
  const ringRefs = useRef([]);
  const ownerKeyRef = useRef(null);
  const stateRef = useRef({
    dropActive: false,
    x: 0,
    y: TOP_Y,
    toneIndex: 0,
    velocity: 0.8,
    timeUntilNextDrop: 0,
  });
  const rippleStateRef = useRef([]);

  const toneCount = Math.max(3, Math.floor(numTones));

  if (ringRefs.current.length !== RIPPLE_COUNT) {
    ringRefs.current = Array.from({ length: RIPPLE_COUNT }, () => React.createRef());
    rippleStateRef.current = Array.from({ length: RIPPLE_COUNT }, () => ({ active: false, t: 0, x: 0 }));
  }

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

  const spawnDrop = () => {
    const s = stateRef.current;
    const toneIndex = Math.floor(Math.random() * toneCount);
    const margin = 0.08;
    const usable = (halfW - margin) * 2;
    const xNorm = toneCount > 1 ? toneIndex / (toneCount - 1) : 0.5;
    s.dropActive = true;
    s.x = -halfW + margin + xNorm * usable;
    s.y = TOP_Y;
    s.toneIndex = toneIndex;
    s.velocity = 0.55 + Math.random() * 0.45;
  };

  const triggerRipple = (x) => {
    const ripples = rippleStateRef.current;
    for (let i = 0; i < ripples.length; i++) {
      if (!ripples[i].active) {
        ripples[i].active = true;
        ripples[i].t = 0;
        ripples[i].x = x;
        return;
      }
    }
    ripples[0].active = true;
    ripples[0].t = 0;
    ripples[0].x = x;
  };

  useEffect(() => {
    const s = stateRef.current;
    s.dropActive = false;
    s.x = 0;
    s.y = TOP_Y;
    s.toneIndex = 0;
    s.velocity = 0.8;
    s.timeUntilNextDrop = 0;
    rippleStateRef.current.forEach((r) => {
      r.active = false;
      r.t = 0;
    });
    const myKey = `suikin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    const drop = dropRef.current;

    const isMidiOwner = claimMidiOwnership();
    const midi = (sendMidi && isMidiOwner) ? (globalThis && globalThis.VJ_MIDI) : null;
    const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));

    if (!s.dropActive) {
      s.timeUntilNextDrop -= dt;
      if (s.timeUntilNextDrop <= 0) {
        spawnDrop();
      }
    } else {
      const prevY = s.y;
      s.y -= DROP_FALL_SPEED * dt;
      const impacted = prevY > WATER_Y && s.y <= WATER_Y;
      if (impacted) {
        s.y = WATER_Y;
        s.dropActive = false;
        s.timeUntilNextDrop = nextSpawnDelay(dropRate, randomness);
        triggerRipple(s.x);
        const midiNote = midiForToneIndex(s.toneIndex, rootMidi);
        const clampedMidi = Math.max(0, Math.min(127, Math.round(midiNote)));
        const vel = Math.max(0.15, Math.min(1, s.velocity));
        const dur = Math.max(0.05, noteLength * (0.6 + Math.random() * 0.4));
        if (midi && midi.sendNote && shouldSendMidi()) {
          try {
            midi.sendNote(clampedMidi, vel, channel, Math.max(5, Math.round(dur * 1000)));
          } catch (_) {}
        }
      }
    }

    if (drop) {
      if (!s.dropActive) {
        drop.visible = false;
      } else {
        drop.visible = true;
        drop.position.set(s.x, s.y, 0);
        drop.scale.set(1, 1.6, 1);
      }
    }

    const ripples = rippleStateRef.current;
    for (let i = 0; i < ripples.length; i++) {
      const ripple = ripples[i];
      const ring = ringRefs.current[i] && ringRefs.current[i].current;
      if (!ring) continue;
      if (!ripple.active) {
        ring.visible = false;
        continue;
      }
      ripple.t += dt;
      const life = Math.max(0.2, rippleLife);
      const k = ripple.t / life;
      if (k >= 1) {
        ripple.active = false;
        ring.visible = false;
        continue;
      }
      ring.visible = true;
      ring.position.set(ripple.x, WATER_Y, 0);
      ring.scale.setScalar(0.05 + k * Math.max(0.2, rippleMaxScale));
      if (ring.material) {
        ring.material.opacity = (1 - k) * 0.75;
      }
    }
  });

  const dropGeom = useMemo(() => new THREE.CircleGeometry(0.018, 16), []);
  useEffect(() => () => { try { dropGeom.dispose(); } catch (_) {} }, [dropGeom]);

  const ringGeom = useMemo(() => new THREE.RingGeometry(0.92, 1.0, 48), []);
  useEffect(() => () => { try { ringGeom.dispose(); } catch (_) {} }, [ringGeom]);

  const surfaceGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-halfW, WATER_Y, 0, halfW, WATER_Y, 0]), 3));
    return g;
  }, [halfW]);
  useEffect(() => () => { try { surfaceGeom.dispose(); } catch (_) {} }, [surfaceGeom]);

  return React.createElement('group', null,
    React.createElement('line', { key: 'surface' },
      React.createElement('primitive', { object: surfaceGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: rippleColor,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('mesh', {
      ref: dropRef,
      visible: false,
      position: [0, TOP_Y, 0],
    },
      React.createElement('primitive', { object: dropGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: dropColor,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    ),
    ...Array.from({ length: RIPPLE_COUNT }).map((_, i) => React.createElement('mesh', {
      key: `ring-${i}`,
      ref: ringRefs.current[i],
      visible: false,
      position: [0, WATER_Y, 0],
    },
      React.createElement('primitive', { object: ringGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: rippleColor,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    ))
  );
}
