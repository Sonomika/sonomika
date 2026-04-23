const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useState, useEffect } = React || {};

export const metadata = {
  name: 'Snake Note Hunter (MIDI)',
  description: 'A snake patrols a board and eats glowing note pellets. Every pellet eaten sends one MIDI note.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 6, min: 3, max: 10, step: 1, description: 'number of pitch lanes / pellet colors' },
    { name: 'boardCols', type: 'number', value: 18, min: 8, max: 32, step: 1 },
    { name: 'boardRows', type: 'number', value: 10, min: 6, max: 20, step: 1 },
    { name: 'density', type: 'number', value: 0.22, min: 0.05, max: 0.7, step: 0.02, description: 'how many pellets stay on the board' },
    { name: 'stepsPerBeat', type: 'number', value: 2, min: 1, max: 8, step: 1, description: 'snake movement rate in notes per beat' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 122, min: 40, max: 220, step: 1 },
    { name: 'evolveLoops', type: 'number', value: 4, min: 0, max: 16, step: 1, description: 're-seed the board every N full snake loops (0 = static)' },
    { name: 'rootMidi', type: 'number', value: 36, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.2, min: 0.03, max: 2.0, step: 0.01 },
    { name: 'snakeColor', type: 'color', value: '#ffffff' },
    { name: 'boardColor', type: 'color', value: '#1b2430' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const LANE_COLORS = ['#7ce7ff', '#8aff7a', '#ffd166', '#ff8fab', '#b794ff', '#ff6b6b', '#66ffd8', '#ffe66d', '#9ad1ff', '#f7a8ff'];
const OWNER_SLOT = '__VJ_SNAKE_NOTE_HUNTER_OWNER__';
const OWNER_LEASE_MS = 250;
const MAX_FRAME_DT = 0.1;
const MAX_SNAKE_STEPS_PER_FRAME = 8;

function midiForLane(lane, rootMidi) {
  return Math.round(rootMidi) + lane;
}

function shouldSendMidiEvent(eventKey) {
  try {
    const slot = '__VJ_SNAKE_NOTE_HUNTER_LAST__';
    const now = (globalThis.performance && typeof globalThis.performance.now === 'function')
      ? globalThis.performance.now()
      : Date.now();
    const store = globalThis[slot] || {};
    const lastAt = typeof store[eventKey] === 'number' ? store[eventKey] : -Infinity;
    if ((now - lastAt) < 120) return false;
    store[eventKey] = now;
    globalThis[slot] = store;
    return true;
  } catch (_) {
    return true;
  }
}

function randomEmptyCell(cols, rows, occupied) {
  for (let i = 0; i < 2000; i++) {
    const x = Math.floor(Math.random() * cols);
    const y = Math.floor(Math.random() * rows);
    const key = `${x},${y}`;
    if (!occupied.has(key)) return { x, y };
  }
  return { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
}

function buildPellets(cols, rows, pelletCount, laneCount, snakeCells) {
  const occupied = new Set((snakeCells || []).map((c) => `${c.x},${c.y}`));
  const pellets = [];
  for (let i = 0; i < pelletCount; i++) {
    const cell = randomEmptyCell(cols, rows, occupied);
    occupied.add(`${cell.x},${cell.y}`);
    pellets.push({
      x: cell.x,
      y: cell.y,
      lane: i % laneCount,
      pulse: 0,
    });
  }
  return pellets;
}

export default function SnakeNoteHunterMidiSource({
  lanes = 6,
  boardCols = 18,
  boardRows = 10,
  density = 0.22,
  stepsPerBeat = 2,
  bpmSync = true,
  manualBpm = 122,
  evolveLoops = 4,
  rootMidi = 48,
  noteLength = 0.2,
  snakeColor = '#ffffff',
  boardColor = '#1b2430',
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const [tick, setTick] = useState(0);

  const cols = Math.max(8, Math.floor(boardCols));
  const rows = Math.max(6, Math.floor(boardRows));
  const laneCount = Math.max(3, Math.floor(lanes));

  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const boardW = aspect * 2;
  const boardH = 2;
  const cellW = boardW / cols;
  const cellH = boardH / rows;
  const cellSize = Math.min(cellW, cellH);
  const halfW = boardW / 2;
  const halfH = boardH / 2;

  const ownerKeyRef = useRef(null);
  const timeAccRef = useRef(0);
  const lastLoopRef = useRef(0);
  const moveCountRef = useRef(0);
  const hitFlashRef = useRef({ active: false, t: 0, x: 0, y: 0, lane: 0 });
  const snakeRef = useRef([]);
  const pelletsRef = useRef([]);
  const headingRef = useRef({ x: 1, y: 0 });
  const targetLengthRef = useRef(5);

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

  const pelletCount = Math.max(3, Math.min(cols * rows - 4, Math.round(cols * rows * Math.max(0.05, density) * 0.18)));

  const resetGame = () => {
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    snakeRef.current = [
      { x: cx, y: cy },
      { x: Math.max(0, cx - 1), y: cy },
      { x: Math.max(0, cx - 2), y: cy },
    ];
    headingRef.current = { x: 1, y: 0 };
    targetLengthRef.current = 5;
    pelletsRef.current = buildPellets(cols, rows, pelletCount, laneCount, snakeRef.current);
    hitFlashRef.current = { active: false, t: 0, x: 0, y: 0, lane: 0 };
    moveCountRef.current = 0;
    lastLoopRef.current = 0;
  };

  useEffect(() => {
    const myKey = `snake-note-hunter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    resetGame();
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, [cols, rows, pelletCount, laneCount]);

  const planeGeom = useMemo(() => new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9), [cellSize]);
  useEffect(() => () => { try { planeGeom.dispose(); } catch (_) {} }, [planeGeom]);

  const pelletGeom = useMemo(() => new THREE.CircleGeometry(cellSize * 0.26, 20), [cellSize]);
  useEffect(() => () => { try { pelletGeom.dispose(); } catch (_) {} }, [pelletGeom]);

  const flashGeom = useMemo(() => new THREE.RingGeometry(cellSize * 0.18, cellSize * 0.34, 24), [cellSize]);
  useEffect(() => () => { try { flashGeom.dispose(); } catch (_) {} }, [flashGeom]);

  const boardMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(boardColor), transparent: true, opacity: 0.18 });
    m.depthTest = false;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    return m;
  }, [boardColor]);
  useEffect(() => () => { try { boardMat.dispose(); } catch (_) {} }, [boardMat]);

  const snakeMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(snakeColor), transparent: true, opacity: 0.95 });
    m.depthTest = false;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [snakeColor]);
  useEffect(() => () => { try { snakeMat.dispose(); } catch (_) {} }, [snakeMat]);

  const headMat = useMemo(() => {
    const c = new THREE.Color(snakeColor).multiplyScalar(1.15);
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 });
    m.depthTest = false;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [snakeColor]);
  useEffect(() => () => { try { headMat.dispose(); } catch (_) {} }, [headMat]);

  const toWorld = (x, y, z = 0) => ([
    -halfW + (x + 0.5) * cellW,
    -halfH + (y + 0.5) * cellH,
    z,
  ]);

  const chooseDirection = () => {
    const head = snakeRef.current[0];
    if (!head || pelletsRef.current.length === 0) return headingRef.current;
    let bestPellet = pelletsRef.current[0];
    let bestDist = Infinity;
    for (let i = 0; i < pelletsRef.current.length; i++) {
      const p = pelletsRef.current[i];
      const dist = Math.abs(p.x - head.x) + Math.abs(p.y - head.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestPellet = p;
      }
    }

    const options = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const reverse = { x: -headingRef.current.x, y: -headingRef.current.y };
    const occupied = new Set(snakeRef.current.slice(0, -1).map((c) => `${c.x},${c.y}`));
    let bestDir = headingRef.current;
    let bestScore = -Infinity;

    for (let i = 0; i < options.length; i++) {
      const dir = options[i];
      if (dir.x === reverse.x && dir.y === reverse.y && snakeRef.current.length > 2) continue;
      const nx = (head.x + dir.x + cols) % cols;
      const ny = (head.y + dir.y + rows) % rows;
      const key = `${nx},${ny}`;
      let score = 0;
      if (occupied.has(key)) score -= 10;
      const distToTarget = Math.abs(bestPellet.x - nx) + Math.abs(bestPellet.y - ny);
      score -= distToTarget * 1.4;
      if (dir.x === headingRef.current.x && dir.y === headingRef.current.y) score += 0.35;
      if (nx === bestPellet.x && ny === bestPellet.y) score += 4;
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestDir;
  };

  const stepSnake = () => {
    if (snakeRef.current.length === 0) resetGame();
    const head = snakeRef.current[0];
    if (!head) return;
    const dir = chooseDirection();
    headingRef.current = dir;
    const nx = (head.x + dir.x + cols) % cols;
    const ny = (head.y + dir.y + rows) % rows;

    const bodyHit = snakeRef.current.slice(0, -1).findIndex((c) => c.x === nx && c.y === ny) >= 0;
    if (bodyHit) {
      resetGame();
      setTick((t) => t + 1);
      return;
    }

    snakeRef.current.unshift({ x: nx, y: ny });
    moveCountRef.current += 1;

    let ateLane = -1;
    let ateIndex = -1;
    for (let i = 0; i < pelletsRef.current.length; i++) {
      const pellet = pelletsRef.current[i];
      if (pellet.x === nx && pellet.y === ny) {
        ateLane = pellet.lane;
        ateIndex = i;
        break;
      }
    }

    if (ateIndex >= 0) {
      const eaten = pelletsRef.current[ateIndex];
      targetLengthRef.current = Math.min(cols * rows - 1, targetLengthRef.current + 1);
      hitFlashRef.current = { active: true, t: 1, x: nx, y: ny, lane: eaten.lane };

      const occupied = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`));
      pelletsRef.current.splice(ateIndex, 1);
      const newCell = randomEmptyCell(cols, rows, occupied);
      pelletsRef.current.push({
        x: newCell.x,
        y: newCell.y,
        lane: Math.floor(Math.random() * laneCount),
        pulse: 1,
      });

      const loopLength = Math.max(1, cols * rows);
      const currentLoop = Math.floor(moveCountRef.current / loopLength);
      if (evolveLoops > 0 && currentLoop > lastLoopRef.current && (currentLoop % Math.max(1, Math.round(evolveLoops))) === 0) {
        lastLoopRef.current = currentLoop;
        pelletsRef.current = buildPellets(cols, rows, pelletCount, laneCount, snakeRef.current);
      }

      const isMidiOwner = claimMidiOwnership();
      const midi = (sendMidi && isMidiOwner) ? (globalThis && globalThis.VJ_MIDI) : null;
      const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
      const note = Math.max(0, Math.min(127, midiForLane(ateLane, rootMidi)));
      const eventKey = `${moveCountRef.current}:${nx}:${ny}:${ateLane}`;
      if (midi && midi.sendNote && shouldSendMidiEvent(eventKey)) {
        try {
          midi.sendNote(note, 0.9, channel, Math.max(10, Math.round(Math.max(0.03, noteLength) * 1000)));
        } catch (_) {}
      }
    }

    while (snakeRef.current.length > targetLengthRef.current) {
      snakeRef.current.pop();
    }

    setTick((t) => t + 1);
  };

  useFrame((_, delta) => {
    const rawDt = Number.isFinite(delta) ? delta : 0;
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, rawDt));
    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpmRaw = bpmSync ? setBpm : manualBpm;
    const bpm = Math.max(1, bpmRaw);
    const interval = 1 / (Math.max(0.25, stepsPerBeat) * (bpm / 60));

    // Never try to "catch up" an arbitrarily large paused/stopped frame gap.
    // That can translate into a burst of thousands of game steps/MIDI notes.
    if (rawDt > 0.25) {
      timeAccRef.current = 0;
    } else {
      timeAccRef.current = Math.min(interval * MAX_SNAKE_STEPS_PER_FRAME, timeAccRef.current + dt);
    }

    let stepsProcessed = 0;
    while (timeAccRef.current >= interval && stepsProcessed < MAX_SNAKE_STEPS_PER_FRAME) {
      stepSnake();
      timeAccRef.current -= interval;
      stepsProcessed += 1;
    }
    if (stepsProcessed >= MAX_SNAKE_STEPS_PER_FRAME) {
      timeAccRef.current = 0;
    }

    const hit = hitFlashRef.current;
    if (hit.active) {
      hit.t = Math.max(0, hit.t - dt * 4.8);
      if (hit.t <= 0) hit.active = false;
    }
    for (let i = 0; i < pelletsRef.current.length; i++) {
      pelletsRef.current[i].pulse = Math.max(0, (pelletsRef.current[i].pulse || 0) - dt * 2.4);
    }
  });

  const boardBgGeom = useMemo(() => new THREE.PlaneGeometry(boardW, boardH), [boardW, boardH]);
  useEffect(() => () => { try { boardBgGeom.dispose(); } catch (_) {} }, [boardBgGeom]);

  const gridLines = useMemo(() => {
    const points = [];
    for (let x = 0; x <= cols; x++) {
      const wx = -halfW + x * cellW;
      points.push(wx, -halfH, 0, wx, halfH, 0);
    }
    for (let y = 0; y <= rows; y++) {
      const wy = -halfH + y * cellH;
      points.push(-halfW, wy, 0, halfW, wy, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [cols, rows, halfW, halfH, cellW, cellH]);
  useEffect(() => () => { try { gridLines.dispose(); } catch (_) {} }, [gridLines]);

  const hit = hitFlashRef.current;
  const hitWorld = toWorld(hit.x, hit.y, 0.02);
  const hitColor = LANE_COLORS[hit.lane % LANE_COLORS.length];

  return React.createElement('group', { key: `snake-board-${tick}` },
    React.createElement('mesh', {
      geometry: boardBgGeom,
      material: boardMat,
      position: [0, 0, -0.01],
    }),
    React.createElement('lineSegments', null,
      React.createElement('primitive', { object: gridLines, attach: 'geometry' }),
      React.createElement('lineBasicMaterial', {
        color: boardColor,
        transparent: true,
        opacity: 0.42,
        depthTest: false,
        depthWrite: false,
      })
    ),
    snakeRef.current.slice(1).map((c, i) => React.createElement('mesh', {
      key: `body-${tick}-${i}-${c.x}-${c.y}`,
      geometry: planeGeom,
      material: snakeMat,
      position: toWorld(c.x, c.y, 0.01),
      scale: [0.82 - Math.min(0.3, i * 0.012), 0.82 - Math.min(0.3, i * 0.012), 1],
    })),
    snakeRef.current[0] && React.createElement('mesh', {
      key: `head-${tick}-${snakeRef.current[0].x}-${snakeRef.current[0].y}`,
      geometry: planeGeom,
      material: headMat,
      position: toWorld(snakeRef.current[0].x, snakeRef.current[0].y, 0.02),
      scale: [0.92, 0.92, 1],
    }),
    pelletsRef.current.map((pellet, i) => {
      const pulse = pellet.pulse || 0;
      return React.createElement('mesh', {
        key: `pellet-${i}-${pellet.x}-${pellet.y}-${pellet.lane}`,
        geometry: pelletGeom,
        position: toWorld(pellet.x, pellet.y, 0.03),
        scale: [1 + pulse * 0.8, 1 + pulse * 0.8, 1],
      },
        React.createElement('meshBasicMaterial', {
          color: LANE_COLORS[pellet.lane % LANE_COLORS.length],
          transparent: true,
          opacity: 0.8 + pulse * 0.2,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
    }),
    hit.active && React.createElement('mesh', {
      key: `hit-${tick}-${hit.x}-${hit.y}-${hit.lane}`,
      geometry: flashGeom,
      position: hitWorld,
      scale: [1 + (1 - hit.t) * 1.6, 1 + (1 - hit.t) * 1.6, 1],
    },
      React.createElement('meshBasicMaterial', {
        color: hitColor,
        transparent: true,
        opacity: hit.t * 0.95,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    )
  );
}
