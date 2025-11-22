// sonomika: Riders Arena (based on Snake Responsive Source template)
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Riders Arena',
  description: 'Autonomous lightcycle arena with fading trails and responsive grid.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  isSource: true,
  parameters: [
    { name: 'cellsAcross', type: 'number', value: 40, min: 6, max: 300, step: 1 },
    { name: 'gameSpeed', type: 'number', value: 10, min: 1, max: 60, step: 1 },
    { name: 'players', type: 'number', value: 6, min: 1, max: 32, step: 1 },
    { name: 'trailLength', type: 'number', value: 80, min: 4, max: 600, step: 1 },
    { name: 'wrapAround', type: 'boolean', value: true },
    { name: 'baseHue', type: 'number', value: 200, min: 0, max: 360, step: 1 },
    { name: 'hueSpread', type: 'number', value: 120, min: 0, max: 360, step: 1 },
    { name: 'turnBias', type: 'number', value: 0.75, min: 0, max: 1, step: 0.05 },
    { name: 'randomness', type: 'number', value: 0.06, min: 0, max: 0.5, step: 0.01 },
  ],
};

export default function RidersArena({
  cellsAcross = 40, gameSpeed = 10, players = 6, trailLength = 80, wrapAround = true,
  baseHue = 200, hueSpread = 120, turnBias = 0.75, randomness = 0.06,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const groupRef = useRef(null);
  const timeAccRef = useRef(0);
  const tickRef = useRef(0);
  const ridersRef = useRef([]);
  const trailsRef = useRef([]); // array of {x,y,colorIdx,tick}
  const occMapRef = useRef(new Map()); // key -> latest tick occupied
  const lastDimsRef = useRef({ cols: 0, rows: 0 });
  const initializedRef = useRef(false);
  const [, setTickState] = useState(0);
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };

  // Responsive grid sizing similar to template
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const planeW = aspect * 2, planeH = 2;
  const shorter = Math.min(planeW, planeH);
  const cellWorldSize = Math.max(0.001, shorter / Math.max(2, Math.floor(cellsAcross)));
  const gridCols = Math.max(2, Math.floor(planeW / cellWorldSize));
  const gridRows = Math.max(2, Math.floor(planeH / cellWorldSize));
  const halfW = planeW / 2, halfH = planeH / 2;

  // Geometry and cached materials per player hue
  const geom = useMemo(() => new THREE.PlaneGeometry(cellWorldSize, cellWorldSize), [cellWorldSize]);
  const materials = useMemo(() => {
    const arr = [];
    for (let i = 0; i < players; i++) {
      const hue = (baseHue + (i / Math.max(1, players - 1)) * hueSpread) % 360;
      const color = new THREE.Color(`hsl(${hue}, 90%, 55%)`);
      const m = new THREE.MeshBasicMaterial({ color, transparent: true });
      m.depthTest = false; m.depthWrite = false; m.blending = THREE.AdditiveBlending; m.side = THREE.DoubleSide;
      arr.push(m);
    }
    // bright head material (white) reused
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff'), transparent: true });
    headMat.depthTest = false; headMat.depthWrite = false; headMat.blending = THREE.AdditiveBlending; headMat.side = THREE.DoubleSide;
    return { arr, headMat };
  }, [players, baseHue, hueSpread]);

  function keyOf(x, y) { return `${x},${y}`; }
  function clampPos(x, y) {
    if (wrapAround) {
      x = (x % gridCols + gridCols) % gridCols;
      y = (y % gridRows + gridRows) % gridRows;
      return [x, y];
    }
    return [x, y];
  }

  function randomEmptyCell(excludeMap) {
    for (let i = 0; i < 2000; i++) {
      const x = Math.floor(Math.random() * gridCols);
      const y = Math.floor(Math.random() * gridRows);
      const k = keyOf(x, y);
      if (!excludeMap.has(k)) return { x, y };
    }
    return { x: Math.floor(gridCols / 2), y: Math.floor(gridRows / 2) };
  }

  function initArena() {
    trailsRef.current = [];
    occMapRef.current = new Map();
    ridersRef.current = [];
    const occ = new Map();
    for (let i = 0; i < players; i++) {
      const pos = randomEmptyCell(occ);
      occ.set(keyOf(pos.x, pos.y), true);
      // random direction from four cardinal dirs
      const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      const d = dirs[Math.floor(Math.random() * dirs.length)];
      ridersRef.current.push({
        x: pos.x, y: pos.y, dir: d, alive: true, colorIdx: i, age: 0,
      });
      // initial small trail so heads don't overlap
      trailsRef.current.push({ x: pos.x, y: pos.y, colorIdx: i, tick: tickRef.current });
      occMapRef.current.set(keyOf(pos.x, pos.y), tickRef.current);
    }
  }

  function respawnRider(i) {
    const exclude = new Map(occMapRef.current);
    const cell = randomEmptyCell(exclude);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    ridersRef.current[i] = { x: cell.x, y: cell.y, dir: d, alive: true, colorIdx: i % players, age: 0 };
    trailsRef.current.push({ x: cell.x, y: cell.y, colorIdx: i % players, tick: tickRef.current });
    occMapRef.current.set(keyOf(cell.x, cell.y), tickRef.current);
  }

  // A simple "open space" scoring measure: count empties in straight line up to range
  function opennessScore(x, y, dx, dy, range = 5) {
    let s = 0;
    for (let r = 1; r <= range; r++) {
      let nx = x + dx * r, ny = y + dy * r;
      if (!wrapAround && (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows)) break;
      [nx, ny] = clampPos(nx, ny);
      if (!occMapRef.current.has(keyOf(nx, ny))) s += 1;
      else break;
    }
    return s / range; // 0..1
  }

  function step() {
    tickRef.current++;
    const newTrails = [];
    const localOcc = new Map(occMapRef.current); // snapshot for this tick decisions

    for (let i = 0; i < ridersRef.current.length; i++) {
      let r = ridersRef.current[i];
      if (!r || !r.alive) {
        respawnRider(i);
        r = ridersRef.current[i];
      }

      // possible moves: straight, left, right (relative)
      const d = r.dir;
      const options = [
        { dx: d.x, dy: d.y, weight: turnBias },
        { dx: -d.y, dy: d.x, weight: (1 - turnBias) / 2 }, // left
        { dx: d.y, dy: -d.x, weight: (1 - turnBias) / 2 }, // right
      ];
      // evaluate each option with occupancy and openness, small randomness
      const scored = options.map(opt => {
        let nx = r.x + opt.dx, ny = r.y + opt.dy;
        if (!wrapAround && (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows)) {
          return { opt, score: -9999, nx, ny, collide: true };
        }
        [nx, ny] = clampPos(nx, ny);
        const k = keyOf(nx, ny);
        let occPenalty = localOcc.has(k) ? 1.0 : 0.0; // big penalty for occupied
        const open = opennessScore(r.x, r.y, opt.dx, opt.dy, 5);
        let score = opt.weight + open * 0.8 - occPenalty * 1.4;
        // slight random factor
        score += (Math.random() - 0.5) * randomness;
        return { opt, score, nx, ny, collide: localOcc.has(k) };
      });
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0];
      if (!pick || pick.score < -500) {
        // dead: hit wall or no moves
        r.alive = false;
        // create a small explosion fade (by short local trail)
        for (let t = 0; t < 3; t++) {
          trailsRef.current.push({ x: r.x, y: r.y, colorIdx: r.colorIdx, tick: tickRef.current - t });
          localOcc.set(keyOf(r.x, r.y), tickRef.current - t);
        }
        // schedule respawn next loop iteration
        continue;
      }

      // apply move
      const ndx = pick.opt.dx, ndy = pick.opt.dy;
      let nx = pick.nx, ny = pick.ny;
      // if collided with existing trail -> die (but leave a final head)
      const collided = pick.collide;
      if (collided) {
        // move into collision cell then die
        r.x = nx; r.y = ny; r.dir = { x: ndx, y: ndy };
        trailsRef.current.push({ x: r.x, y: r.y, colorIdx: r.colorIdx, tick: tickRef.current });
        localOcc.set(keyOf(r.x, r.y), tickRef.current);
        r.alive = false;
        continue;
      }

      // normal move: append trail and update occupancy
      r.x = nx; r.y = ny; r.dir = { x: ndx, y: ndy }; r.age++;
      trailsRef.current.push({ x: r.x, y: r.y, colorIdx: r.colorIdx, tick: tickRef.current });
      localOcc.set(keyOf(r.x, r.y), tickRef.current);
    }

    // commit occupancy snapshot
    occMapRef.current = localOcc;

    // prune trails older than trailLength
    const keepSince = tickRef.current - trailLength;
    // keep some extra head markers for a short time for visuals
    trailsRef.current = trailsRef.current.filter(t => t.tick >= keepSince);

    // force re-render by bumping state
    setTickState(t => (t + 1) % 1000000);
  }

  function toWorld(c) {
    const x = (c.x + 0.5) * cellWorldSize - halfW;
    const y = (c.y + 0.5) * cellWorldSize - halfH;
    return [x, y, 0];
  }

  useFrame((_, delta) => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastDimsRef.current = { cols: gridCols, rows: gridRows };
      tickRef.current = 0;
      initArena();
    } else if (lastDimsRef.current.cols !== gridCols || lastDimsRef.current.rows !== gridRows) {
      lastDimsRef.current = { cols: gridCols, rows: gridRows };
      tickRef.current = 0;
      initArena();
    }

    timeAccRef.current += delta;
    const interval = 1 / Math.max(0.25, gameSpeed);
    while (timeAccRef.current >= interval) {
      step();
      timeAccRef.current -= interval;
    }
  });

  // Rendering: trails then heads
  const trailMeshes = trailsRef.current.map((t, i) => {
    const pos = toWorld(t);
    const mat = materials.arr[t.colorIdx % materials.arr.length];
    // key includes tick so meshes update as trails age / change
    return React.createElement('mesh', { key: `trail-${i}-${t.x}-${t.y}-${t.tick}`, geometry: geom, material: mat, position: pos });
  });

  const headMeshes = ridersRef.current.map((r, i) => {
    if (!r) return null;
    const pos = toWorld(r);
    const mat = materials.headMat;
    // give head slight offset in z to render above trails
    const headPos = [pos[0], pos[1], 0.01];
    return React.createElement('mesh', { key: `head-${i}-${r.x}-${r.y}-${r.alive}-${r.age}`, geometry: geom, material: mat, position: headPos, scale: [0.9, 0.9, 1] });
  });

  return React.createElement('group', { ref: groupRef, position: [0, 0, 0] }, ...trailMeshes, ...headMeshes);
}
