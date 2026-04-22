// sonomika template – bouncing particles that play a random note on impact
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Bouncing Note Particles (Audio)',
  description: 'Circles bounce off each other and the walls; a note plays only when two circles hit (not on wall bounce).',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numParticles', type: 'number', value: 24, min: 1, max: 80, step: 2 },
    { name: 'particleSize', type: 'number', value: 0.04, min: 0.01, max: 0.12, step: 0.005 },
    { name: 'speed', type: 'number', value: 1.2, min: 0.3, max: 4.0, step: 0.1 },
    { name: 'color', type: 'color', value: '#88ddff' },
    { name: 'scale', type: 'select', value: 'pentatonic', options: ['pentatonic', 'major', 'minor', 'blues', 'chromatic', 'dorian'] },
    { name: 'soundOn', type: 'boolean', value: true },
    { name: 'volume', type: 'number', value: -10, min: -24, max: 0, step: 1 },
  ],
};

// Scale definitions: note names across a couple octaves
const SCALES = {
  pentatonic: ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
  major: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
  minor: ['C3', 'D3', 'Eb3', 'F3', 'G3', 'Ab3', 'Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'Ab4', 'Bb4', 'C5'],
  blues: ['C3', 'Eb3', 'F3', 'Gb3', 'G3', 'Bb3', 'C4', 'Eb4', 'F4', 'Gb4', 'G4', 'Bb4', 'C5'],
  chromatic: ['C3', 'Db3', 'D3', 'Eb3', 'E3', 'F3', 'Gb3', 'G3', 'Ab3', 'A3', 'Bb3', 'B3', 'C4', 'Db4', 'D4', 'Eb4', 'E4', 'F4', 'Gb4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4', 'C5'],
  dorian: ['C3', 'D3', 'Eb3', 'F3', 'G3', 'A3', 'Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4', 'C5'],
};

function randomNote(scaleKey) {
  const notes = SCALES[scaleKey] || SCALES.pentatonic;
  return notes[Math.floor(Math.random() * notes.length)];
}

export default function BouncingNoteParticlesSource({
  numParticles = 24,
  particleSize = 0.04,
  speed = 1.2,
  color = '#88ddff',
  scale = 'pentatonic',
  soundOn = true,
  volume = -10,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfWidth = (aspect * 2) / 2;
  const halfHeight = 2 / 2;

  const instancedRef = useRef(null);
  const positionsRef = useRef([]);
  const velocitiesRef = useRef([]);
  const overlappingPairsRef = useRef(new Set());
  const flashRef = useRef([]);
  const frameCountRef = useRef(0);
  const toneRef = useRef(null);
  const scaleNotesRef = useRef(null); // cache scale notes array
  const soundTriggeredThisFrameRef = useRef(false); // only one sound per frame
  const normalVecRef = useRef(new THREE.Vector2()); // reuse vector to avoid allocations

  const count = useMemo(() => {
    const n = Math.max(1, Math.min(80, Math.floor(Number(numParticles) || 24)));
    return n;
  }, [numParticles]);

  useEffect(() => {
    const Tone = globalThis.Tone;
    if (!Tone) return;
    try {
      const synth = new Tone.Synth({
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.3 },
      }).toDestination();
      synth.volume.value = volume;
      toneRef.current = { Tone, synth };
    } catch (e) {
      try { console.warn('BouncingNoteParticles Tone init failed:', e); } catch (_) {}
    }
    return () => {
      if (toneRef.current) {
        try { toneRef.current.synth.dispose(); } catch (_) {}
        toneRef.current = null;
      }
    };
  }, []);

  // Cache scale notes when scale changes
  useEffect(() => {
    scaleNotesRef.current = SCALES[scale] || SCALES.pentatonic;
  }, [scale]);

  const geometry = useMemo(() => new THREE.CircleGeometry(particleSize * 0.5, 16), [particleSize]);
  const material = useMemo(
    () => {
      const m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      m.depthTest = false;
      m.depthWrite = false;
      m.blending = THREE.AdditiveBlending;
      return m;
    },
    [color]
  );

  useEffect(() => {
    const positions = [];
    const velocities = [];
    const left = -halfWidth + particleSize * 0.6;
    const right = halfWidth - particleSize * 0.6;
    const bottom = -halfHeight + particleSize * 0.6;
    const top = halfHeight - particleSize * 0.6;
    for (let i = 0; i < count; i++) {
      positions.push(new THREE.Vector3(
        left + Math.random() * (right - left),
        bottom + Math.random() * (top - bottom),
        0
      ));
      const ang = Math.random() * Math.PI * 2;
      const v = 0.4 + Math.random() * 0.5;
      velocities.push(new THREE.Vector3(Math.cos(ang) * v, Math.sin(ang) * v, 0));
    }
    positionsRef.current = positions;
    velocitiesRef.current = velocities;
    overlappingPairsRef.current = new Set();
    flashRef.current = new Array(count).fill(0);
    frameCountRef.current = 0;
  }, [count, halfWidth, halfHeight, particleSize]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  const radius = particleSize * 0.5;
  const minDist = radius * 2;
  const minDistSq = minDist * minDist; // squared distance for faster comparison
  const left = -halfWidth + radius * 1.2;
  const right = halfWidth - radius * 1.2;
  const bottom = -halfHeight + radius * 1.2;
  const top = halfHeight - radius * 1.2;

  useFrame((state, delta) => {
    if (!instancedRef.current) return;
    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;
    if (!positions.length) return;

    frameCountRef.current += 1;
    const dt = delta * speed;
    const t = toneRef.current;
    const prevOverlapping = overlappingPairsRef.current;
    const overlappingNow = new Set();
    soundTriggeredThisFrameRef.current = false; // reset sound flag each frame

    // Integrate
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const v = velocities[i];
      p.x += v.x * dt;
      p.y += v.y * dt;
      // Wall bounce (no sound)
      if (p.x <= left) { p.x = left; v.x = Math.abs(v.x); }
      if (p.x >= right) { p.x = right; v.x = -Math.abs(v.x); }
      if (p.y <= bottom) { p.y = bottom; v.y = Math.abs(v.y); }
      if (p.y >= top) { p.y = top; v.y = -Math.abs(v.y); }
    }

    // Particle–particle collision (sound only on impact)
    const n = normalVecRef.current;
    const scaleNotes = scaleNotesRef.current || SCALES.pentatonic;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq && distSq > 1e-12) {
          const dist = Math.sqrt(distSq);
          const key = `${i},${j}`;
          const v1 = velocitiesRef.current[i];
          const v2 = velocitiesRef.current[j];
          n.set(dx / dist, dy / dist); // reuse vector
          const approach = v1.x * n.x + v1.y * n.y - (v2.x * n.x + v2.y * n.y);
          overlappingNow.add(key);
          const overlap = minDist - dist;
          const halfOverlap = overlap * 0.5;
          a.x -= n.x * halfOverlap;
          a.y -= n.y * halfOverlap;
          b.x += n.x * halfOverlap;
          b.y += n.y * halfOverlap;
          const dv = approach;
          v1.x -= dv * n.x;
          v1.y -= dv * n.y;
          v2.x += dv * n.x;
          v2.y += dv * n.y;
          const isNewCollision = !prevOverlapping.has(key);
          const wasApproaching = approach > 0.02;
          if (isNewCollision && wasApproaching && frameCountRef.current > 30 && soundOn && t && !soundTriggeredThisFrameRef.current) {
            try {
              if (t.Tone.context.state === 'suspended') t.Tone.context.resume();
              if (t.Tone.context.state !== 'suspended') {
                const note = scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
                t.synth.triggerAttackRelease(note, '16n');
                soundTriggeredThisFrameRef.current = true; // only one sound per frame
              }
            } catch (_) {}
          }
          if (isNewCollision && wasApproaching) {
            if (flashRef.current.length > i) flashRef.current[i] = 1;
            if (flashRef.current.length > j) flashRef.current[j] = 1;
          }
        }
      }
    }
    overlappingPairsRef.current = overlappingNow;

    // Decay flash
    const flash = flashRef.current;
    for (let i = 0; i < flash.length; i++) flash[i] *= 0.88;

    // Update instance matrices (scale up when flashing)
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      dummy.position.set(p.x, p.y, p.z);
      const s = 1 + (flash[i] || 0) * 0.7;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      instancedRef.current.setMatrixAt(i, dummy.matrix);
    }
    instancedRef.current.instanceMatrix.needsUpdate = true;
  });

  return React.createElement('instancedMesh', {
    ref: instancedRef,
    args: [geometry, material, count],
    renderOrder: 9998,
  });
}
