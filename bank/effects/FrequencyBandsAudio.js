// sonomika template – frequency band bars that play notes when they pulse
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Frequency Bands (MIDI)',
  description: 'Vertical bars representing frequency bands; each bar plays a note when it pulses.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'numBands', type: 'number', value: 8, min: 4, max: 16, step: 1 },
    { name: 'color', type: 'color', value: '#88ff66' },
    { name: 'intensity', type: 'number', value: 0.7, min: 0.2, max: 1.5, step: 0.1 },
    { name: 'pulseSpeed', type: 'number', value: 2.0, min: 0.5, max: 5.0, step: 0.1 },
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

// Notes for each band (chromatic scale C3-C5)
const BAND_NOTES = ['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4'];

export default function FrequencyBandsMidiEffect({
  numBands = 8,
  color = '#88ff66',
  intensity = 0.7,
  pulseSpeed = 2.0,
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const bandRefs = useRef([]);
  const lastPulseRef = useRef([]);


  if (bandRefs.current.length < numBands) {
    while (bandRefs.current.length < numBands) {
      bandRefs.current.push(React.createRef());
    }
  }

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    const bandWidth = 0.12;
    const gap = 0.02;
    const startX = -((numBands - 1) * (bandWidth + gap)) / 2;
    const baseHeight = 0.3;

    bandRefs.current.forEach((ref, i) => {
      const mesh = ref && ref.current;
      if (!mesh || !mesh.material) return;
      const phase = (time * pulseSpeed + i * 0.3) % (Math.PI * 2);
      const pulse = Math.sin(phase) * intensity;
      const height = baseHeight + pulse * 0.4;
      const pulseCycle = Math.floor((time * pulseSpeed + i * 0.3) / (Math.PI * 2));
      
      mesh.scale.y = height / baseHeight;
      mesh.position.y = (height - baseHeight) * 0.5;
      const opacity = 0.5 + Math.abs(pulse) * 0.5;
      mesh.material.opacity = opacity;

      if (pulseCycle !== lastPulseRef.current[i] && pulse > 0.8) {
        lastPulseRef.current[i] = pulseCycle;
        const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
        if (midi && midi.sendNote) {
          try {
            const note = BAND_NOTES[i % BAND_NOTES.length];
            const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
            midi.sendNote(noteNameToMidi(note), 0.75, channel, 120);
          } catch (_) {}
        }
      }
    });
  });

  const bandWidth = 0.12;
  const gap = 0.02;
  const startX = -((numBands - 1) * (bandWidth + gap)) / 2;
  const baseHeight = 0.3;

  return React.createElement(
    'group',
    { ref: groupRef },
    Array.from({ length: numBands }, (_, i) =>
      React.createElement(
        'mesh',
        {
          key: i,
          ref: bandRefs.current[i],
          position: [startX + i * (bandWidth + gap), 0, 0],
        },
        React.createElement('boxGeometry', {
          args: [bandWidth, baseHeight, 0.01],
        }),
        React.createElement('meshBasicMaterial', {
          color,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      )
    )
  );
}
