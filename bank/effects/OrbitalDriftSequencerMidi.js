const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Orbital Drift Sequencer (MIDI OUT)',
  description:
    'A circular MIDI sequencer where orbiting particles drift across a scan beam and trigger evolving pentatonic notes.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'steps', type: 'number', value: 32, min: 8, max: 128, step: 1 },
    { name: 'lanes', type: 'number', value: 12, min: 4, max: 32, step: 1 },
    { name: 'particleDensity', type: 'number', value: 0.55, min: 0.05, max: 1, step: 0.01 },
    { name: 'driftSpeed', type: 'number', value: 1.0, min: 0.05, max: 4, step: 0.01 },
    { name: 'orbitJitter', type: 'number', value: 0.28, min: 0, max: 1.5, step: 0.01 },
    { name: 'scanWidth', type: 'number', value: 0.72, min: 0.1, max: 2.5, step: 0.01 },
    { name: 'mutationRate', type: 'number', value: 0.18, min: 0, max: 1, step: 0.01 },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1 },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 112, min: 40, max: 220, step: 1 },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 24, min: 4, max: 60, step: 1 },
    { name: 'noteLength', type: 'number', value: 0.18, min: 0.03, max: 4, step: 0.01 },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05 },
    { name: 'maxNotesPerStep', type: 'number', value: 6, min: 1, max: 24, step: 1 },
    { name: 'particleColor', type: 'color', value: '#ffffff' },
    { name: 'trailColor', type: 'color', value: '#8f7dff' },
    { name: 'scanColor', type: 'color', value: '#7df9ff' },
    { name: 'glow', type: 'number', value: 0.85, min: 0, max: 2, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_ORBITAL_DRIFT_SEQ_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_ORBITAL_DRIFT_SEQ_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 34;
const PENTATONIC = [0, 3, 5, 7, 10];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function nowMs() {
  return globalThis.performance && typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function angleDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function midiForLane(lane, laneCount, rootMidi, noteRange) {
  const maxLane = Math.max(1, laneCount - 1);
  const degree = Math.round((lane / maxLane) * Math.max(1, noteRange));
  const octave = Math.floor(degree / PENTATONIC.length) * 12;
  const interval = PENTATONIC[degree % PENTATONIC.length] + octave;
  return clamp(Math.round(rootMidi + interval), 0, 127);
}

function shouldSendMidiEvent(eventKey) {
  try {
    const now = nowMs();
    const store = globalThis[LAST_EVENT_SLOT] || {};
    const lastAt = typeof store[eventKey] === 'number' ? store[eventKey] : -Infinity;
    if (now - lastAt < MIN_EVENT_GAP_MS) return false;
    store[eventKey] = now;
    globalThis[LAST_EVENT_SLOT] = store;
    return true;
  } catch (_) {
    return true;
  }
}

function buildOrbitals(stepCount, laneCount, particleDensity, driftSpeed, orbitJitter) {
  const particles = [];
  const density = clamp01(particleDensity);
  const basePerLane = Math.max(1, Math.round(1 + density * 7));

  for (let lane = 0; lane < laneCount; lane++) {
    const laneBias = 0.65 + lane / Math.max(1, laneCount - 1) * 0.7;
    const count = Math.max(1, Math.round(basePerLane * laneBias));

    for (let i = 0; i < count; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const speed = dir * (0.12 + Math.random() * 0.65) * driftSpeed;

      particles.push({
        id: `${lane}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        lane,
        angle: Math.random() * Math.PI * 2,
        speed,
        radiusOffset: (Math.random() - 0.5) * orbitJitter,
        size: 0.55 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        pulse: 0,
        lastStep: -1,
      });
    }
  }

  return particles;
}

export default function OrbitalDriftSequencerMidi({
  steps = 32,
  lanes = 12,
  particleDensity = 0.55,
  driftSpeed = 1.0,
  orbitJitter = 0.28,
  scanWidth = 0.72,
  mutationRate = 0.18,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 112,
  rootMidi = 48,
  noteRange = 24,
  noteLength = 0.18,
  velocityBoost = 1.0,
  maxNotesPerStep = 6,
  particleColor = '#ffffff',
  trailColor = '#8f7dff',
  scanColor = '#7df9ff',
  glow = 0.85,
  sendMidi = true,
  midiChannel = 1,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const ctx = useThree();
  const size = ctx && ctx.size ? ctx.size : { width: 1920, height: 1080 };
  const effectiveW = Math.max(1, compositionWidth || size.width || 1920);
  const effectiveH = Math.max(1, compositionHeight || size.height || 1080);
  const aspect = effectiveW / effectiveH;

  const particleMeshRef = useRef(null);
  const trailMeshRef = useRef(null);
  const pulseMeshRef = useRef(null);
  const scanRef = useRef(null);
  const particlesRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const phaseRef = useRef(0);
  const lastStepRef = useRef(-1);

  const stepCount = Math.max(4, Math.floor(steps));
  const laneCount = Math.max(4, Math.floor(lanes));

  const dummyParticle = useMemo(() => new THREE.Object3D(), []);
  const dummyTrail = useMemo(() => new THREE.Object3D(), []);
  const dummyPulse = useMemo(() => new THREE.Object3D(), []);

  const particleGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 24), []);
  const trailGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const pulseGeometry = useMemo(() => new THREE.RingGeometry(0.38, 0.5, 24), []);
  const scanGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const particleMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(particleColor),
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [particleColor]);

  const trailMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(trailColor),
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [trailColor]);

  const pulseMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(scanColor),
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [scanColor]);

  const scanMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(scanColor),
      transparent: true,
      opacity: 0.24,
      depthTest: false,
      depthWrite: false,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, [scanColor]);

  useEffect(() => {
    ownerKeyRef.current = `orbital-drift-seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    particlesRef.current = buildOrbitals(
      stepCount,
      laneCount,
      particleDensity,
      driftSpeed,
      orbitJitter
    );
    phaseRef.current = 0;
    lastStepRef.current = -1;
  }, [stepCount, laneCount, particleDensity, driftSpeed, orbitJitter]);

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

  useFrame((state, delta) => {
    const particleMesh = particleMeshRef.current;
    const trailMesh = trailMeshRef.current;
    const pulseMesh = pulseMeshRef.current;
    const particles = particlesRef.current;
    if (!particleMesh || !trailMesh || !pulseMesh || !particles) return;

    const dt = clamp(delta || 0, 0, 0.1);
    const projectBpm = globalThis && Number.isFinite(globalThis.VJ_BPM)
      ? Number(globalThis.VJ_BPM)
      : 120;

    const bpm = Math.max(1, bpmSync ? projectBpm : manualBpm);
    const stepsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);

    phaseRef.current += dt * stepsPerSec;
    while (phaseRef.current >= stepCount) phaseRef.current -= stepCount;

    const currentStep = Math.floor(phaseRef.current);
    const scanAngle = (phaseRef.current / Math.max(1, stepCount)) * Math.PI * 2 - Math.PI * 0.5;
    const angleStep = (Math.PI * 2) / Math.max(1, stepCount);
    const hitWidth = angleStep * Math.max(0.1, scanWidth);

    const outerRadius = Math.min(aspect, 1) * 0.92;
    const innerRadius = outerRadius * 0.13;
    const ringStep = (outerRadius - innerRadius) / Math.max(1, laneCount - 1);
    const t = state && state.clock ? state.clock.elapsedTime : 0;

    if (currentStep !== lastStepRef.current) {
      lastStepRef.current = currentStep;

      const midi = sendMidi && claimMidiOwnership() ? globalThis && globalThis.VJ_MIDI : null;
      const channel = clamp(Math.round(midiChannel), 1, 16);
      const durMs = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
      const maxNotes = Math.max(1, Math.floor(maxNotesPerStep));
      let sent = 0;

      const hits = [];

      for (const p of particles) {
        const diff = angleDistance(p.angle, scanAngle);
        if (diff <= hitWidth && p.lastStep !== currentStep) {
          hits.push({ particle: p, diff });
        }
      }

      hits.sort((a, b) => {
        if (b.particle.lane !== a.particle.lane) return b.particle.lane - a.particle.lane;
        return a.diff - b.diff;
      });

      for (const hit of hits) {
        if (sent >= maxNotes) break;

        const p = hit.particle;
        p.lastStep = currentStep;
        p.pulse = 1;

        const note = midiForLane(p.lane, laneCount, rootMidi, noteRange);
        const laneNorm = p.lane / Math.max(1, laneCount - 1);
        const speedAccent = clamp(Math.abs(p.speed) * 0.25, 0, 0.25);
        const centerAccent = 1 - Math.abs(laneNorm - 0.5) * 0.45;
        const velocity = clamp((0.32 + laneNorm * 0.34 + speedAccent) * centerAccent * velocityBoost, 0.05, 1);

        const eventKey = `${currentStep}:${p.id}`;

        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try {
            midi.sendNote(note, velocity, channel, durMs);
          } catch (_) {}
        }

        sent++;
      }
    }

    const mutate = clamp01(mutationRate);
    const speedScale = Math.max(0.01, driftSpeed);

    let particleCount = 0;
    let trailCount = 0;
    let pulseCount = 0;

    for (const p of particles) {
      const wobble = Math.sin(t * 0.7 + p.phase) * orbitJitter * 0.15;
      const mutation = Math.sin(t * 0.19 + p.phase * 2.1) * mutate * 0.08;

      p.angle += p.speed * speedScale * dt + mutation * dt;
      p.pulse *= Math.pow(0.82, dt * 60);

      if (Math.random() < mutate * dt * 0.04) {
        p.speed += (Math.random() - 0.5) * 0.08;
        p.speed = clamp(p.speed, -1.6, 1.6);
      }

      const laneRadius = innerRadius + ringStep * p.lane;
      const radius = laneRadius + ringStep * (p.radiusOffset + wobble);
      const x = Math.cos(p.angle) * radius;
      const y = Math.sin(p.angle) * radius;
      const tangentRotation = p.angle + Math.PI * 0.5;

      const baseSize = ringStep * (0.24 + p.size * 0.15);
      const pulseSize = 1 + p.pulse * (0.55 + glow * 0.15);

      dummyTrail.position.set(
        x - Math.cos(p.angle) * ringStep * 0.08,
        y - Math.sin(p.angle) * ringStep * 0.08,
        0.03
      );
      dummyTrail.rotation.z = tangentRotation;
      dummyTrail.scale.set(
        ringStep * clamp(0.08 + Math.abs(p.speed) * 0.08, 0.04, 0.28),
        ringStep * clamp(0.7 + Math.abs(p.speed) * 1.5, 0.4, 2.4),
        1
      );
      dummyTrail.updateMatrix();
      trailMesh.setMatrixAt(trailCount, dummyTrail.matrix);
      trailCount++;

      dummyParticle.position.set(x, y, 0.05);
      dummyParticle.rotation.z = t * 0.6 + p.phase;
      dummyParticle.scale.set(baseSize * pulseSize, baseSize * pulseSize, 1);
      dummyParticle.updateMatrix();
      particleMesh.setMatrixAt(particleCount, dummyParticle.matrix);
      particleCount++;

      if (p.pulse > 0.01) {
        const pulseScale = ringStep * (0.35 + (1 - p.pulse) * 0.85 + glow * 0.1);
        dummyPulse.position.set(x, y, 0.07);
        dummyPulse.rotation.z = t;
        dummyPulse.scale.set(pulseScale, pulseScale, 1);
        dummyPulse.updateMatrix();
        pulseMesh.setMatrixAt(pulseCount, dummyPulse.matrix);
        pulseCount++;
      }
    }

    particleMesh.count = particleCount;
    trailMesh.count = trailCount;
    pulseMesh.count = pulseCount;

    particleMesh.instanceMatrix.needsUpdate = true;
    trailMesh.instanceMatrix.needsUpdate = true;
    pulseMesh.instanceMatrix.needsUpdate = true;

    particleMaterial.color.set(particleColor);
    particleMaterial.opacity = clamp(0.62 + glow * 0.18, 0.05, 1);

    trailMaterial.color.set(trailColor);
    trailMaterial.opacity = clamp(0.14 + glow * 0.14, 0.02, 0.7);

    pulseMaterial.color.set(scanColor);
    pulseMaterial.opacity = clamp(0.48 + glow * 0.22, 0.05, 1);

    scanMaterial.color.set(scanColor);
    scanMaterial.opacity = clamp(0.12 + glow * 0.18, 0.02, 0.8);

    if (scanRef.current) {
      scanRef.current.position.set(
        Math.cos(scanAngle) * outerRadius * 0.5,
        Math.sin(scanAngle) * outerRadius * 0.5,
        0.01
      );
      scanRef.current.rotation.z = scanAngle - Math.PI * 0.5;
      scanRef.current.scale.set(Math.max(0.01, ringStep * 0.22), outerRadius, 1);
    }
  });

  const maxParticles = Math.max(1, laneCount * Math.max(1, Math.round(1 + clamp01(particleDensity) * 7)) * 2);

  return React.createElement(
    'group',
    {},
    React.createElement(
      'mesh',
      { ref: scanRef, renderOrder: 9998 },
      React.createElement('primitive', { object: scanGeometry, attach: 'geometry' }),
      React.createElement('primitive', { object: scanMaterial, attach: 'material' })
    ),
    React.createElement('instancedMesh', {
      ref: trailMeshRef,
      args: [trailGeometry, trailMaterial, maxParticles],
      renderOrder: 9999,
    }),
    React.createElement('instancedMesh', {
      ref: particleMeshRef,
      args: [particleGeometry, particleMaterial, maxParticles],
      renderOrder: 10000,
    }),
    React.createElement('instancedMesh', {
      ref: pulseMeshRef,
      args: [pulseGeometry, pulseMaterial, maxParticles],
      renderOrder: 10001,
    })
  );
}
