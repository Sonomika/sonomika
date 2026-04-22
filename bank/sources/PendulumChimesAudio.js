// sonomika template – row of swinging bobs where each bob plays its own note when it crosses the center strike line
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Pendulum Chimes (Audio)',
  description: 'Rows of swinging bobs at harmonic frequencies. Each bob plays its own note when it crosses the center strike line, so every visible element is one voice.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numChimes', type: 'number', value: 16, min: 4, max: 32, step: 1 },
    { name: 'basePeriod', type: 'number', value: 7.0, min: 2.0, max: 18.0, step: 0.5 },
    { name: 'periodSpread', type: 'number', value: 0.16, min: 0.02, max: 0.5, step: 0.01 },
    { name: 'swingWidth', type: 'number', value: 0.85, min: 0.2, max: 1.1, step: 0.05 },
    { name: 'rootMidi', type: 'number', value: 48, min: 24, max: 72, step: 1 },
    { name: 'bobSize', type: 'number', value: 0.05, min: 0.02, max: 0.15, step: 0.005 },
    { name: 'rowOpacity', type: 'number', value: 0.18, min: 0, max: 0.6, step: 0.02 },
    { name: 'tone', type: 'number', value: 0, min: 0, max: 2, step: 1, description: '0 bell, 1 pluck, 2 soft sine' },
    { name: 'volume', type: 'number', value: -14, min: -32, max: 0, step: 1 },
    { name: 'decay', type: 'number', value: 1.4, min: 0.2, max: 4.0, step: 0.1 },
    { name: 'soundOn', type: 'boolean', value: true },
    { name: 'sendMidi', type: 'boolean', value: false, description: 'send MIDI notes to the selected MIDI output (pitch matches each pendulum)' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1 },
  ],
};

// Major pentatonic: gives endlessly consonant combinations
const PENTATONIC = [0, 2, 4, 7, 9];

function midiToNote(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return names[((midi % 12) + 12) % 12] + octave;
}

function pitchForIndex(i, rootMidi) {
  const step = PENTATONIC[i % PENTATONIC.length];
  const octaveOffset = Math.floor(i / PENTATONIC.length) * 12;
  return midiToNote(Math.round(rootMidi) + step + octaveOffset);
}

function midiForIndex(i, rootMidi) {
  const step = PENTATONIC[i % PENTATONIC.length];
  const octaveOffset = Math.floor(i / PENTATONIC.length) * 12;
  return Math.round(rootMidi) + step + octaveOffset;
}

function buildVoice(Tone, mode) {
  // Per-chime monophonic voice. Cheap, retriggers naturally without voice-stealing overhead.
  if (mode === 1 && Tone.PluckSynth) {
    return new Tone.PluckSynth({
      attackNoise: 0.5,
      dampening: 3500,
      resonance: 0.92,
    });
  }
  if (mode === 2) {
    return new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.35, release: 2.4 },
    });
  }
  // Bell-ish: triangle is much lighter than FMSynth and still musical
  return new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 0.35, sustain: 0.3, release: 2.0 },
  });
}

export default function PendulumChimesAudioSource({
  numChimes = 16,
  basePeriod = 7.0,
  periodSpread = 0.16,
  swingWidth = 0.85,
  rootMidi = 48,
  bobSize = 0.05,
  rowOpacity = 0.18,
  tone = 0,
  volume = -14,
  decay = 1.4,
  soundOn = true,
  sendMidi = false,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;

  const groupRef = useRef(null);
  const bobRefs = useRef([]);
  const rowRefs = useRef([]);
  const ringRefs = useRef([]);
  const ringStateRef = useRef([]); // {t, x, y, colorHex, active}
  const prevSignRef = useRef([]);
  const pulseRef = useRef([]);
  const toneRef = useRef(null);

  const N = Math.max(2, Math.floor(numChimes));

  // Precompute per-chime data
  const chimes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < N; i++) {
      const period = basePeriod / (1 + i * periodSpread);
      const omega = (2 * Math.PI) / period;
      const y = 1 - ((i + 0.5) / N) * 2; // from +1 (top) to -1 (bottom)
      const hue = (i / Math.max(1, N - 1)) * 0.82;
      const color = new THREE.Color().setHSL(hue, 0.75, 0.58);
      arr.push({
        period,
        omega,
        y,
        color,
        note: pitchForIndex(i, rootMidi),
        midiNote: midiForIndex(i, rootMidi),
      });
    }
    return arr;
  }, [N, basePeriod, periodSpread, rootMidi]);

  // Ensure ref arrays have correct length
  if (bobRefs.current.length !== N) {
    bobRefs.current = Array.from({ length: N }, () => React.createRef());
    rowRefs.current = Array.from({ length: N }, () => React.createRef());
    ringRefs.current = Array.from({ length: N }, () => React.createRef());
    ringStateRef.current = Array.from({ length: N }, () => ({ t: 0, x: 0, y: 0, active: false }));
    prevSignRef.current = new Array(N).fill(0);
    pulseRef.current = new Array(N).fill(0);
  }

  // --- Tone setup: one dedicated voice per chime, each straight to destination ---
  useEffect(() => {
    const Tone = globalThis.Tone;
    if (!Tone) return;
    const voices = [];
    try {
      for (let i = 0; i < N; i++) {
        const v = buildVoice(Tone, tone);
        try { v.toDestination(); } catch (_) {}
        try { v.volume.value = soundOn ? volume : -60; } catch (_) {}
        voices.push(v);
      }
      toneRef.current = { Tone, voices };
    } catch (e) {
      try { console.warn('PendulumChimes Tone init failed:', e); } catch (_) {}
    }
    return () => {
      voices.forEach((v) => {
        try { v.triggerRelease && v.triggerRelease(); } catch (_) {}
        try { v.dispose(); } catch (_) {}
      });
      toneRef.current = null;
    };
  }, [tone, N]);

  // Live updates – voice volumes follow volume + soundOn
  useEffect(() => {
    const t = toneRef.current;
    if (!t) return;
    (t.voices || []).forEach((v) => {
      try { v.volume.value = soundOn ? volume : -60; } catch (_) {}
    });
  }, [volume, soundOn]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const t = toneRef.current;
    const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
    const ch = Math.max(1, Math.min(16, Math.round(midiChannel)));

    for (let i = 0; i < N; i++) {
      const c = chimes[i];
      if (!c) continue;
      const x = swingWidth * halfW * Math.sin(c.omega * time);

      // Update bob position / glow
      const bob = bobRefs.current[i] && bobRefs.current[i].current;
      if (bob) {
        bob.position.x = x;
        bob.position.y = c.y;
        // Pulse decay
        pulseRef.current[i] = Math.max(0, pulseRef.current[i] - delta * (1.5 + 1.0 / Math.max(0.3, decay)));
        const p = pulseRef.current[i];
        const s = 1 + p * 1.6;
        bob.scale.setScalar(s);
        if (bob.material) {
          bob.material.opacity = 0.75 + p * 0.25;
        }
      }

      // Row flash
      const row = rowRefs.current[i] && rowRefs.current[i].current;
      if (row && row.material) {
        const p = pulseRef.current[i];
        row.material.opacity = rowOpacity + p * 0.7;
      }

      // Strike detection: sign change through zero
      const sign = x >= 0 ? 1 : -1;
      const prev = prevSignRef.current[i] || 0;
      if (prev !== 0 && prev !== sign) {
        // Trigger: note + visual pulse + ring ripple
        pulseRef.current[i] = 1.0;
        const ring = ringStateRef.current[i];
        if (ring) { ring.t = 0; ring.x = 0; ring.y = c.y; ring.active = true; }
        const vel = 0.5 + Math.min(0.5, c.omega * 0.1);
        const dur = Math.max(0.2, decay * (0.5 + Math.random() * 0.5));
        if (t && soundOn) {
          try {
            if (t.Tone.context.state === 'suspended') t.Tone.context.resume();
            if (t.Tone.context.state !== 'suspended') {
              const voice = t.voices && t.voices[i];
              if (voice) {
                const now = t.Tone.now();
                voice.triggerAttackRelease(c.note, dur, now, vel);
              }
            }
          } catch (_) {}
        }
        if (midi && midi.sendNote) {
          try {
            midi.sendNote(
              Math.max(0, Math.min(127, Math.round(c.midiNote))),
              vel,
              ch,
              Math.max(5, Math.round(dur * 1000))
            );
          } catch (_) {}
        }
      }
      prevSignRef.current[i] = sign;

      // Ring animation
      const ringMesh = ringRefs.current[i] && ringRefs.current[i].current;
      const rs = ringStateRef.current[i];
      if (ringMesh && rs) {
        if (rs.active) {
          rs.t += delta;
          const life = 0.7;
          const k = rs.t / life;
          if (k >= 1) {
            rs.active = false;
            ringMesh.visible = false;
          } else {
            ringMesh.visible = true;
            const scale = 0.05 + k * 0.9;
            ringMesh.scale.setScalar(scale);
            ringMesh.position.set(rs.x, rs.y, 0);
            if (ringMesh.material) {
              ringMesh.material.opacity = (1 - k) * 0.8;
            }
          }
        } else {
          ringMesh.visible = false;
        }
      }
    }
  });

  // Geometries / materials
  const bobGeom = useMemo(() => new THREE.CircleGeometry(bobSize, 24), [bobSize]);
  useEffect(() => () => { try { bobGeom.dispose(); } catch (_) {} }, [bobGeom]);

  const rowGeom = useMemo(() => {
    const positions = new Float32Array([-halfW, 0, 0, halfW, 0, 0]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [halfW]);
  useEffect(() => () => { try { rowGeom.dispose(); } catch (_) {} }, [rowGeom]);

  const ringGeom = useMemo(() => new THREE.RingGeometry(0.9, 1.0, 32), []);
  useEffect(() => () => { try { ringGeom.dispose(); } catch (_) {} }, [ringGeom]);

  const strikeGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1.05, 0, 0, 1.05, 0]), 3));
    return g;
  }, []);
  useEffect(() => () => { try { strikeGeom.dispose(); } catch (_) {} }, [strikeGeom]);

  return React.createElement('group', { ref: groupRef },
    // Center strike line
    React.createElement('line', { key: 'strike' },
      React.createElement('primitive', { object: strikeGeom, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.25,
        depthTest: false,
        depthWrite: false,
      })
    ),
    // Rows + bobs + rings
    ...chimes.map((c, i) => React.createElement('group', { key: i, position: [0, c.y, 0] },
      // Row guide line
      React.createElement('line', { ref: rowRefs.current[i] },
        React.createElement('primitive', { object: rowGeom, attach: 'geometry' }),
        React.createElement('lineBasicMaterial', {
          color: c.color,
          transparent: true,
          opacity: rowOpacity,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      ),
      // Ripple ring
      React.createElement('mesh', { ref: ringRefs.current[i], visible: false, position: [0, 0, 0] },
        React.createElement('primitive', { object: ringGeom, attach: 'geometry' }),
        React.createElement('meshBasicMaterial', {
          color: c.color,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      ),
      // Bob
      React.createElement('mesh', { ref: bobRefs.current[i], position: [0, 0, 0] },
        React.createElement('primitive', { object: bobGeom, attach: 'geometry' }),
        React.createElement('meshBasicMaterial', {
          color: c.color,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      )
    ))
  );
}
