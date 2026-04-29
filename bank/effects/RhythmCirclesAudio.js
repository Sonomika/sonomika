// sonomika template – concentric pulsing circles that play notes synced to BPM
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Rhythm Circles (MIDI)',
  description: 'Concentric circles pulse with BPM; each ring plays a note when it pulses.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'numRings', type: 'number', value: 5, min: 2, max: 12, step: 1 },
    { name: 'color', type: 'color', value: '#ff88cc' },
    { name: 'intensity', type: 'number', value: 0.8, min: 0.2, max: 1.5, step: 0.1 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

function noteNameToMidi(note) {
  const match = String(note || '').match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!match) return 60;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number(match[3]);
  return Math.max(0, Math.min(127, Math.round((octave + 1) * 12 + base + accidental)));
}

// Notes for each ring (pentatonic scale)
const RING_NOTES = ['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6'];

export default function RhythmCirclesMidiEffect({
  numRings = 5,
  color = '#ff88cc',
  intensity = 0.8,
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const ringRefs = useRef([]);
  const lastBeatRef = useRef(-1);


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

    if (currentBeat !== lastBeatRef.current) {
      lastBeatRef.current = currentBeat;
      const ringIndex = currentBeat % numRings;
      const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
      if (midi && midi.sendNote) {
        try {
          const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
          midi.sendNote(noteNameToMidi(RING_NOTES[ringIndex] || 'C4'), 0.8, channel, 240);
        } catch (_) {}
      }
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
