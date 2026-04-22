// sonomika template – particles fall and play notes based on X position when hitting bottom
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Musical Rain (Audio)',
  description: 'Particles fall from top; when they hit bottom, play a note based on their X position (pitch).',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numParticles', type: 'number', value: 30, min: 5, max: 100, step: 5 },
    { name: 'fallSpeed', type: 'number', value: 1.5, min: 0.5, max: 5.0, step: 0.1 },
    { name: 'spawnRate', type: 'number', value: 2.0, min: 0.5, max: 10.0, step: 0.5 },
    { name: 'color', type: 'color', value: '#66aaff' },
    { name: 'particleSize', type: 'number', value: 0.03, min: 0.01, max: 0.1, step: 0.005 },
    { name: 'volume', type: 'number', value: -12, min: -24, max: 0, step: 1 },
    { name: 'soundOn', type: 'boolean', value: true },
  ],
};

// Map X position (-1 to 1) to note (C3 to C6)
function positionToNote(x, minX, maxX) {
  const normalized = (x - minX) / (maxX - minX); // 0 to 1
  const octave = 3 + Math.floor(normalized * 3); // 3, 4, or 5
  const noteInOctave = Math.floor((normalized * 3 - Math.floor(normalized * 3)) * 12); // 0-11
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return notes[noteInOctave] + octave;
}

export default function MusicalRainAudioSource({
  numParticles = 30,
  fallSpeed = 1.5,
  spawnRate = 2.0,
  color = '#66aaff',
  particleSize = 0.03,
  volume = -12,
  soundOn = true,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfWidth = (aspect * 2) / 2;
  const halfHeight = 2 / 2;

  const instancedRef = useRef(null);
  const particlesRef = useRef([]);
  const toneRef = useRef(null);
  const spawnTimerRef = useRef(0);
  const soundTriggeredThisFrameRef = useRef(false);
  const dummy = useMemo(() => THREE ? new THREE.Object3D() : null, []);

  useEffect(() => {
    const Tone = globalThis.Tone;
    if (!Tone) return;
    try {
      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4 },
      }).toDestination();
      synth.volume.value = volume;
      toneRef.current = { Tone, synth };
    } catch (e) {
      try { console.warn('MusicalRain Tone init failed:', e); } catch (_) {}
    }
    return () => {
      if (toneRef.current) {
        try { toneRef.current.synth.dispose(); } catch (_) {}
        toneRef.current = null;
      }
    };
  }, []);

  const geometry = useMemo(() => new THREE.CircleGeometry(particleSize * 0.5, 12), [particleSize]);
  const material = useMemo(
    () => {
      const m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      m.depthTest = false;
      m.depthWrite = false;
      m.blending = THREE.AdditiveBlending;
      return m;
    },
    [color]
  );

  const bottomY = -halfHeight + particleSize * 0.6;
  const topY = halfHeight - particleSize * 0.6;
  const leftX = -halfWidth + particleSize * 0.6;
  const rightX = halfWidth - particleSize * 0.6;

  useFrame((state, delta) => {
    if (!instancedRef.current) return;
    const particles = particlesRef.current;
    const t = toneRef.current;
    soundTriggeredThisFrameRef.current = false;

    spawnTimerRef.current += delta * spawnRate;
    while (spawnTimerRef.current >= 1.0 && particles.length < numParticles) {
      spawnTimerRef.current -= 1.0;
      particles.push({
        x: leftX + Math.random() * (rightX - leftX),
        y: topY,
        active: true,
      });
    }

    const dt = delta * fallSpeed;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (!p.active) continue;
      p.y -= dt;
      if (p.y <= bottomY) {
        p.y = bottomY;
        p.active = false;
        if (soundOn && t && !soundTriggeredThisFrameRef.current) {
          try {
            if (t.Tone.context.state === 'suspended') t.Tone.context.resume();
            if (t.Tone.context.state !== 'suspended') {
              const note = positionToNote(p.x, leftX, rightX);
              t.synth.triggerAttackRelease(note, '8n');
              soundTriggeredThisFrameRef.current = true;
            }
          } catch (_) {}
        }
        particles.splice(i, 1);
      }
    }

    if (!dummy) return;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      dummy.position.set(p.x, p.y, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      instancedRef.current.setMatrixAt(i, dummy.matrix);
    }
    instancedRef.current.instanceMatrix.needsUpdate = true;
    instancedRef.current.count = particles.length;
  });

  return React.createElement('instancedMesh', {
    ref: instancedRef,
    args: [geometry, material, numParticles],
    renderOrder: 9998,
  });
}
