// sonomika template – concentric pulsing circles that play notes synced to BPM
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Rhythm Circles (Audio)',
  description: 'Concentric circles pulse with BPM; each ring plays a note when it pulses.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numRings', type: 'number', value: 5, min: 2, max: 12, step: 1 },
    { name: 'color', type: 'color', value: '#ff88cc' },
    { name: 'intensity', type: 'number', value: 0.8, min: 0.2, max: 1.5, step: 0.1 },
    { name: 'volume', type: 'number', value: -10, min: -24, max: 0, step: 1 },
    { name: 'soundOn', type: 'boolean', value: true },
  ],
};

// Notes for each ring (pentatonic scale)
const RING_NOTES = ['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6'];

export default function RhythmCirclesAudioSource({
  numRings = 5,
  color = '#ff88cc',
  intensity = 0.8,
  volume = -10,
  soundOn = true,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const ringRefs = useRef([]);
  const toneRef = useRef(null);
  const lastBeatRef = useRef(-1);

  useEffect(() => {
    const Tone = globalThis.Tone;
    if (!Tone) return;
    try {
      const synths = [];
      for (let i = 0; i < numRings; i++) {
        const synth = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.3 },
        }).toDestination();
        synth.volume.value = volume - i * 2;
        synths.push(synth);
      }
      toneRef.current = { Tone, synths };
    } catch (e) {
      try { console.warn('RhythmCircles Tone init failed:', e); } catch (_) {}
    }
    return () => {
      if (toneRef.current) {
        toneRef.current.synths.forEach(s => {
          try { s.dispose(); } catch (_) {}
        });
        toneRef.current = null;
      }
    };
  }, [numRings, volume]);

  if (ringRefs.current.length < numRings) {
    while (ringRefs.current.length < numRings) {
      ringRefs.current.push(React.createRef());
    }
  }

  useFrame((state) => {
    if (!groupRef.current) return;
    const bpm = (globalThis && globalThis.VJ_BPM) || 120;
    const beatsPerSecond = bpm / 60;
    const beatTime = state.clock.elapsedTime * beatsPerSecond;
    const currentBeat = Math.floor(beatTime);
    const beatPhase = beatTime % 1;

    const t = toneRef.current;
    if (t && soundOn && currentBeat !== lastBeatRef.current) {
      lastBeatRef.current = currentBeat;
      const ringIndex = currentBeat % numRings;
      try {
        if (t.Tone.context.state === 'suspended') t.Tone.context.resume();
        if (t.Tone.context.state !== 'suspended' && t.synths[ringIndex]) {
          t.synths[ringIndex].triggerAttackRelease(RING_NOTES[ringIndex] || 'C4', '8n');
        }
      } catch (_) {}
    }

    const baseRadius = 0.3;
    ringRefs.current.forEach((ref, i) => {
      const mesh = ref && ref.current;
      if (!mesh || !mesh.material) return;
      const ringPhase = (beatPhase + i / numRings) % 1;
      const pulse = Math.sin(ringPhase * Math.PI * 2) * intensity;
      const radius = baseRadius + (i * 0.15) + pulse * 0.1;
      mesh.scale.setScalar(radius / baseRadius);
      const opacity = 0.4 + Math.abs(pulse) * 0.6;
      mesh.material.opacity = opacity;
    });
  });

  const baseRadius = 0.3;
  return React.createElement(
    'group',
    { ref: groupRef },
    Array.from({ length: numRings }, (_, i) =>
      React.createElement(
        'mesh',
        {
          key: i,
          ref: ringRefs.current[i],
        },
        React.createElement('ringGeometry', {
          args: [baseRadius + i * 0.15 - 0.05, baseRadius + i * 0.15 + 0.05, 32],
        }),
        React.createElement('meshBasicMaterial', {
          color,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      )
    )
  );
}
