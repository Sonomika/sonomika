const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Game of Life Drum Machine (MIDI OUT)',
  description: 'A Conway-style 16-step drum machine where living cells trigger drum MIDI notes and mutate each loop.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'columns', type: 'number', value: 16, min: 8, max: 64, step: 1 },
    { name: 'rows', type: 'number', value: 8, min: 4, max: 32, step: 1 },
    { name: 'density', type: 'number', value: 0.26, min: 0.02, max: 0.8, step: 0.02, description: 'Starting live cell density' },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 1, max: 8, step: 1, description: '4 = 16th-note scan movement' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM' },
    { name: 'manualBpm', type: 'number', value: 128, min: 40, max: 220, step: 1 },
    { name: 'wrapEdges', type: 'boolean', value: true, description: 'Wrap Game of Life neighbors around the edges' },
    { name: 'evolveEveryStep', type: 'boolean', value: false, description: 'Advance the Life grid on each sequencer step instead of each full loop' },
    { name: 'mutateChance', type: 'number', value: 0.006, min: 0, max: 0.2, step: 0.001, description: 'Tiny random changes to keep the groove alive' },
    { name: 'maxNotesPerStep', type: 'number', value: 8, min: 1, max: 16, step: 1 },
    { name: 'rootMidi', type: 'number', value: 36, min: 0, max: 108, step: 1, lockDefault: true, description: 'Kick lane base note; drum lanes transpose from this' },
    { name: 'noteRange', type: 'number', value: 16, min: 1, max: 48, step: 1, description: 'Fallback chromatic range for extra rows' },
    { name: 'noteLength', type: 'number', value: 0.1, min: 0.03, max: 2, step: 0.01 },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05 },
    { name: 'cellColor', type: 'color', value: '#ffffff' },
    { name: 'scanColor', type: 'color', value: '#7df9ff' },
    { name: 'gridGlow', type: 'number', value: 0.75, min: 0, max: 2, step: 0.01 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI notes from alive cells in the scan column' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_GAME_OF_LIFE_SEQ_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_GAME_OF_LIFE_SEQ_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 25;
const DRUM_NOTES_FROM_BOTTOM = [36, 38, 42, 46, 41, 43, 45, 49, 51, 37, 39, 56, 60, 62, 64, 67];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

function buildGrid(columns, rows, density) {
  const grid = new Uint8Array(columns * rows);
  const chance = clamp(density, 0, 1);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.random() < chance ? 1 : 0;
  }

  const setRowFromBottom = (rowFromBottom, step, value) => {
    const row = rows - 1 - rowFromBottom;
    if (row < 0 || row >= rows) return;
    grid[row * columns + (step % columns)] = value ? 1 : 0;
  };

  if (columns >= 8 && rows >= 4) {
    for (let step = 0; step < columns; step++) {
      const beat = step % 4;
      if (beat === 0) setRowFromBottom(0, step, 1); // kick
      if (beat === 2 && step % 8 !== 6) setRowFromBottom(1, step, 1); // snare-like backbeat
      if (step % 2 === 0) setRowFromBottom(2, step, 1); // closed hat
      if (step % 8 === 6) setRowFromBottom(3, step, 1); // open hat / accent
    }
  }

  return grid;
}

function countNeighbors(grid, x, y, columns, rows, wrapEdges) {
  let count = 0;
  for (let yy = -1; yy <= 1; yy++) {
    for (let xx = -1; xx <= 1; xx++) {
      if (xx === 0 && yy === 0) continue;
      let nx = x + xx;
      let ny = y + yy;
      if (wrapEdges) {
        nx = (nx + columns) % columns;
        ny = (ny + rows) % rows;
      } else if (nx < 0 || nx >= columns || ny < 0 || ny >= rows) {
        continue;
      }
      count += grid[ny * columns + nx] ? 1 : 0;
    }
  }
  return count;
}

function evolveGrid(grid, columns, rows, wrapEdges, mutateChance, pulse) {
  const next = new Uint8Array(columns * rows);
  let aliveCount = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const idx = y * columns + x;
      const alive = grid[idx] === 1;
      const neighbors = countNeighbors(grid, x, y, columns, rows, wrapEdges);
      let nextAlive = alive ? (neighbors === 2 || neighbors === 3) : neighbors === 3;
      if (Math.random() < mutateChance) nextAlive = !nextAlive;
      next[idx] = nextAlive ? 1 : 0;
      if (nextAlive) aliveCount++;
      if (!alive && nextAlive && pulse) pulse[idx] = Math.max(pulse[idx], 0.7);
    }
  }

  if (aliveCount === 0) return buildGrid(columns, rows, 0.25);
  return next;
}

function midiForRow(row, rows, rootMidi, noteRange) {
  const bottomToTop = Math.max(0, rows - 1 - row);
  if (bottomToTop < DRUM_NOTES_FROM_BOTTOM.length) {
    return clamp(Math.round(DRUM_NOTES_FROM_BOTTOM[bottomToTop] + (rootMidi - 36)), 0, 127);
  }
  const semitone = Math.round((bottomToTop / Math.max(1, rows - 1)) * Math.max(1, noteRange));
  return clamp(Math.round(rootMidi + semitone), 0, 127);
}

function shouldSendMidiEvent(eventKey) {
  try {
    const now = nowMs();
    const store = globalThis[LAST_EVENT_SLOT] || {};
    const lastAt = typeof store[eventKey] === 'number' ? store[eventKey] : -Infinity;
    if ((now - lastAt) < MIN_EVENT_GAP_MS) return false;
    store[eventKey] = now;
    globalThis[LAST_EVENT_SLOT] = store;
    return true;
  } catch (_) {
    return true;
  }
}

export default function GameOfLifeSequencerMidi({
  columns = 16,
  rows = 8,
  density = 0.26,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 128,
  wrapEdges = true,
  evolveEveryStep = false,
  mutateChance = 0.006,
  maxNotesPerStep = 8,
  rootMidi = 36,
  noteRange = 16,
  noteLength = 0.1,
  velocityBoost = 1.0,
  cellColor = '#ffffff',
  scanColor = '#7df9ff',
  gridGlow = 0.75,
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

  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const gridRef = useRef(null);
  const pulseRef = useRef(null);
  const phaseRef = useRef(0);
  const lastColumnRef = useRef(-1);
  const generationRef = useRef(0);

  const columnCount = Math.max(8, Math.floor(columns));
  const rowCount = Math.max(4, Math.floor(rows));
  const cellCount = columnCount * rowCount;

  const gridTexture = useMemo(() => {
    const data = new Uint8Array(cellCount * 4);
    const texture = new THREE.DataTexture(data, columnCount, rowCount, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, [columnCount, rowCount, cellCount]);
  useEffect(() => () => { try { gridTexture.dispose(); } catch (_) {} }, [gridTexture]);

  useEffect(() => {
    ownerKeyRef.current = `game-of-life-seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    gridRef.current = buildGrid(columnCount, rowCount, density);
    pulseRef.current = new Float32Array(cellCount);
    phaseRef.current = 0;
    lastColumnRef.current = -1;
    generationRef.current = 0;
  }, [columnCount, rowCount, cellCount, density]);

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

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    uniform sampler2D uGrid;
    uniform vec3 uCellColor;
    uniform vec3 uScanColor;
    uniform float uColumns;
    uniform float uRows;
    uniform float uScan;
    uniform float uGridGlow;
    varying vec2 vUv;

    float boxFill(vec2 cell, float inset) {
      vec2 lo = smoothstep(vec2(inset), vec2(inset + 0.018), cell);
      vec2 hi = 1.0 - smoothstep(vec2(1.0 - inset - 0.018), vec2(1.0 - inset), cell);
      return lo.x * lo.y * hi.x * hi.y;
    }

    float gridLine(vec2 cell) {
      vec2 edge = min(cell, 1.0 - cell);
      return 1.0 - smoothstep(0.0, 0.035, min(edge.x, edge.y));
    }

    void main() {
      vec2 gridUv = vec2(vUv.x * uColumns, (1.0 - vUv.y) * uRows);
      vec2 cellId = floor(gridUv);
      vec2 local = fract(gridUv);
      vec2 sampleUv = (cellId + 0.5) / vec2(max(1.0, uColumns), max(1.0, uRows));
      vec4 state = texture2D(uGrid, sampleUv);
      float alive = state.r;
      float pulse = state.g;
      float birth = state.b;

      float scanDist = abs(fract((cellId.x + 0.5) / max(1.0, uColumns) - uScan + 0.5) - 0.5);
      float scan = 1.0 - smoothstep(0.0, 1.25 / max(1.0, uColumns), scanDist);
      float cellFill = boxFill(local, 0.055);
      float grid = gridLine(local) * uGridGlow * 0.32;
      float beatColumn = 1.0 - step(0.5, mod(cellId.x, 4.0));
      float barColumn = 1.0 - step(0.5, mod(cellId.x, 16.0));
      float laneWeight = 0.55 + (1.0 - cellId.y / max(1.0, uRows - 1.0)) * 0.45;
      float beatShade = (beatColumn * 0.12 + barColumn * 0.16) * uGridGlow;

      vec3 color = uCellColor * cellFill * laneWeight * (alive * 0.86 + pulse * 1.1 + birth * 0.35);
      color += uScanColor * (scan * (0.12 + alive * 0.34 + pulse * 0.65) + grid + beatShade * 0.32);
      float alpha = clamp(grid * 0.35 + beatShade * 0.18 + cellFill * (alive * 0.78 + pulse * 0.24 + birth * 0.18) + scan * 0.12, 0.0, 0.96);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
    }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uGrid: { value: gridTexture },
      uCellColor: { value: new THREE.Color(cellColor) },
      uScanColor: { value: new THREE.Color(scanColor) },
      uColumns: { value: columnCount },
      uRows: { value: rowCount },
      uScan: { value: 0 },
      uGridGlow: { value: gridGlow },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), [gridTexture, columnCount, rowCount]);
  useEffect(() => () => { try { shaderMaterial.dispose(); } catch (_) {} }, [shaderMaterial]);
  useEffect(() => { materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    const grid = gridRef.current;
    const pulse = pulseRef.current;
    if (!material || !grid || !pulse) return;

    const dt = clamp(delta || 0, 0, 0.1);
    const projectBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? projectBpm : manualBpm);
    const columnsPerSec = Math.max(0.25, stepsPerBeat) * (bpm / 60);

    phaseRef.current += dt * columnsPerSec;
    while (phaseRef.current >= columnCount) {
      phaseRef.current -= columnCount;
      if (!evolveEveryStep) {
        generationRef.current += 1;
        gridRef.current = evolveGrid(
          gridRef.current,
          columnCount,
          rowCount,
          !!wrapEdges,
          clamp(mutateChance, 0, 0.5),
          pulse
        );
      }
    }

    const currentColumn = Math.floor(phaseRef.current);
    if (currentColumn !== lastColumnRef.current) {
      lastColumnRef.current = currentColumn;
      const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
      const channel = clamp(Math.round(midiChannel), 1, 16);
      const durMs = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
      const maxNotes = Math.max(1, Math.floor(maxNotesPerStep));
      let sent = 0;

      for (let row = 0; row < rowCount && sent < maxNotes; row++) {
        const idx = row * columnCount + currentColumn;
        if (gridRef.current[idx] !== 1) continue;
        pulse[idx] = 1;
        const note = midiForRow(row, rowCount, rootMidi, noteRange);
        const rowFromBottom = rowCount - 1 - row;
        const beatAccent = currentColumn % 4 === 0 ? 0.18 : 0;
        const backbeatAccent = rowFromBottom === 1 && currentColumn % 8 === 4 ? 0.16 : 0;
        const drumWeight = rowFromBottom <= 1 ? 0.18 : rowFromBottom === 2 ? 0.04 : 0;
        const velocity = clamp((0.48 + drumWeight + beatAccent + backbeatAccent) * velocityBoost, 0.05, 1);
        const eventKey = `${generationRef.current}:${currentColumn}:${row}`;
        if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
          try { midi.sendNote(note, velocity, channel, durMs); } catch (_) {}
        }
        sent++;
      }

      if (evolveEveryStep) {
        generationRef.current += 1;
        gridRef.current = evolveGrid(
          gridRef.current,
          columnCount,
          rowCount,
          !!wrapEdges,
          clamp(mutateChance, 0, 0.5),
          pulse
        );
      }
    }

    const data = gridTexture.image && gridTexture.image.data;
    if (data) {
      const currentGrid = gridRef.current;
      for (let i = 0; i < cellCount; i++) {
        pulse[i] *= Math.pow(0.82, dt * 60);
        const offset = i * 4;
        data[offset] = currentGrid[i] ? 255 : 0;
        data[offset + 1] = Math.max(0, Math.min(255, Math.round(pulse[i] * 255)));
        data[offset + 2] = Math.max(0, Math.min(255, Math.round(Math.max(0, pulse[i] - 0.55) * 180)));
        data[offset + 3] = 255;
      }
      gridTexture.needsUpdate = true;
    }

    material.uniforms.uCellColor.value.set(cellColor);
    material.uniforms.uScanColor.value.set(scanColor);
    material.uniforms.uColumns.value = columnCount;
    material.uniforms.uRows.value = rowCount;
    material.uniforms.uScan.value = phaseRef.current / Math.max(1, columnCount);
    material.uniforms.uGridGlow.value = Math.max(0, gridGlow);
  });

  return React.createElement('mesh', { ref: meshRef, renderOrder: 10000 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material' })
  );
}
