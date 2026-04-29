// sonomika template – Ryoji Ikeda-inspired scanning binary grid. Each lit cell triggers a pure sine pulse when the playhead crosses it.
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Data Matrix (MIDI)',
  description: 'Scanning binary grid in the tradition of Ryoji Ikeda test-pattern works. A vertical playhead sweeps left to right; every lit cell it crosses fires a precisely pitched sine pulse (row = frequency).',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'gridCols', type: 'number', value: 48, min: 12, max: 96, step: 1 },
    { name: 'gridRows', type: 'number', value: 12, min: 4, max: 24, step: 1 },
    { name: 'scanRate', type: 'number', value: 12.0, min: 1.0, max: 40.0, step: 0.5, description: 'columns per second' },
    { name: 'density', type: 'number', value: 0.22, min: 0.03, max: 0.7, step: 0.02 },
    { name: 'freqLow', type: 'number', value: 120, min: 20, max: 800, step: 5 },
    { name: 'freqHigh', type: 'number', value: 9000, min: 1000, max: 18000, step: 100 },
    { name: 'pulseMs', type: 'number', value: 18, min: 4, max: 120, step: 1 },
    { name: 'evolveSec', type: 'number', value: 0, min: 0, max: 30, step: 0.5, description: 're-randomize pattern every N seconds (0 = static)' },
    { name: 'jitter', type: 'number', value: 0, min: 0, max: 1, step: 0.02, description: 'pitch jitter (cents scatter per strike)' },
    { name: 'accent', type: 'color', value: '#ffffff' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output (notes match each row frequency)' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

function hzToMidi(hz) {
  if (!(hz > 0)) return 60;
  return 69 + 12 * Math.log2(hz / 440);
}

function buildPattern(cols, rows, density) {
  const arr = new Uint8Array(cols * rows);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.random() < density ? 1 : 0;
  }
  return arr;
}

// Logarithmic row -> frequency map (row 0 = bottom = lowest freq)
function rowFreq(r, rows, low, high) {
  const t = rows > 1 ? r / (rows - 1) : 0;
  return low * Math.pow(Math.max(1, high) / Math.max(1, low), t);
}

export default function DataMatrixAudioSource({
  gridCols = 48,
  gridRows = 12,
  scanRate = 12,
  density = 0.22,
  freqLow = 120,
  freqHigh = 9000,
  pulseMs = 18,
  evolveSec = 0,
  jitter = 0,
  accent = '#ffffff',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;
  const halfH = 1;

  const cols = Math.max(2, Math.floor(gridCols));
  const rows = Math.max(2, Math.floor(gridRows));

  const instRef = useRef(null);
  const scanRef = useRef(null);
  const bgRef = useRef(null);

  const scanPosRef = useRef(0);
  const lastColRef = useRef(-1);
  const evolveTimerRef = useRef(0);
  const patternRef = useRef(null);
  const pulseRef = useRef(null);

  // (Re)build pattern and pulse buffers when grid shape or density changes meaningfully
  useEffect(() => {
    patternRef.current = buildPattern(cols, rows, density);
    pulseRef.current = new Float32Array(cols * rows);
    lastColRef.current = -1;
    evolveTimerRef.current = 0;
  }, [cols, rows, density]);

  // --- Instance geometry / material ---
  const cellW = (2 * halfW) / cols;
  const cellH = (2 * halfH) / rows;
  const cellSize = Math.min(cellW, cellH) * 0.82;

  const instGeom = useMemo(() => new THREE.PlaneGeometry(cellSize, cellSize), [cellSize]);
  useEffect(() => () => { try { instGeom.dispose(); } catch (_) {} }, [instGeom]);

  const instMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  }), []);
  useEffect(() => () => { try { instMat.dispose(); } catch (_) {} }, [instMat]);

  const totalCells = cols * rows;
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const baseColor = useMemo(() => new THREE.Color('#ffffff'), []);
  const accentColor = useMemo(() => new THREE.Color(accent), [accent]);

  // Pre-seed instance positions + hide all (scale 0) — state is then driven from pattern/pulse in useFrame
  useEffect(() => {
    const mesh = instRef.current;
    if (!mesh) return;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i = c * rows + r;
        dummyObj.position.set(
          -halfW + (c + 0.5) * cellW,
          -halfH + (r + 0.5) * cellH,
          0
        );
        dummyObj.scale.setScalar(0);
        dummyObj.updateMatrix();
        mesh.setMatrixAt(i, dummyObj.matrix);
        mesh.setColorAt(i, baseColor);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = totalCells;
  }, [cols, rows, cellW, cellH, halfW, halfH, totalCells, dummyObj, baseColor]);

  useFrame((state, delta) => {
    const mesh = instRef.current;
    const pattern = patternRef.current;
    const pulse = pulseRef.current;
    if (!mesh || !pattern || !pulse) return;

    // Advance scan
    scanPosRef.current += delta * scanRate;
    while (scanPosRef.current >= cols) scanPosRef.current -= cols;
    const scanPos = scanPosRef.current;
    const curCol = Math.floor(scanPos);

    // Pattern evolution
    if (evolveSec > 0) {
      evolveTimerRef.current += delta;
      if (evolveTimerRef.current >= evolveSec) {
        evolveTimerRef.current = 0;
        patternRef.current = buildPattern(cols, rows, density);
      }
    }

    // When the scan crosses a new integer column, fire pulses for lit cells in that column
    if (curCol !== lastColRef.current) {
      lastColRef.current = curCol;
      const dur = Math.max(0.005, pulseMs / 1000);
      const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
      const ch = Math.max(1, Math.min(16, Math.round(midiChannel)));
      const midiDurMs = Math.max(5, Math.round(dur * 1000));
      for (let r = 0; r < rows; r++) {
        const idx = curCol * rows + r;
        if (pattern[idx] === 1) {
          pulse[idx] = 1.0;
          let f = rowFreq(r, rows, freqLow, freqHigh);
          if (jitter > 0) {
            const cents = (Math.random() * 2 - 1) * 100 * jitter;
            f *= Math.pow(2, cents / 1200);
          }
          if (midi && midi.sendNote) {
            try {
              const midiNote = Math.max(0, Math.min(127, Math.round(hzToMidi(f))));
              midi.sendNote(midiNote, 0.9, ch, midiDurMs);
            } catch (_) {}
          }
        }
      }
    }

    // Decay pulse values and update visual state for every cell
    const decay = delta * 9.0;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i = c * rows + r;
        let p = pulse[i] - decay;
        if (p < 0) p = 0;
        pulse[i] = p;

        const on = pattern[i] === 1;
        const s = on ? (1 + p * 0.6) : 0;
        dummyObj.position.set(
          -halfW + (c + 0.5) * cellW,
          -halfH + (r + 0.5) * cellH,
          0
        );
        dummyObj.scale.setScalar(s);
        dummyObj.rotation.z = 0;
        dummyObj.updateMatrix();
        mesh.setMatrixAt(i, dummyObj.matrix);

        if (on) {
          // Mix base white with accent based on pulse
          tmpColor.copy(baseColor).lerp(accentColor, 0.5 + p * 0.5);
          const bright = 0.55 + p * 0.45;
          tmpColor.multiplyScalar(bright);
          mesh.setColorAt(i, tmpColor);
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Move scan line
    if (scanRef.current) {
      const x = -halfW + (scanPos + 0.5) * cellW;
      scanRef.current.position.x = x;
    }
  });

  return React.createElement('group', null,
    // Pure black background so the cells read as data on a screen
    React.createElement('mesh', { ref: bgRef, position: [0, 0, -0.02] },
      React.createElement('planeGeometry', { args: [halfW * 2 + 0.2, halfH * 2 + 0.2] }),
      React.createElement('meshBasicMaterial', {
        color: '#000000',
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      })
    ),
    // Instanced cell grid
    React.createElement('instancedMesh', {
      ref: instRef,
      args: [instGeom, instMat, totalCells],
    }),
    // Scan playhead
    React.createElement('mesh', { ref: scanRef, position: [-halfW, 0, 0.01] },
      React.createElement('planeGeometry', { args: [Math.max(0.003, cellW * 0.12), 2 * halfH + 0.04] }),
      React.createElement('meshBasicMaterial', {
        color: '#ffffff',
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      })
    )
  );
}
