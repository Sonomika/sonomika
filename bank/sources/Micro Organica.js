// sonomika: MicroOrganica — smooth flowing cell-like worms with continuous organic motion
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useState, useEffect } = React || {};

export const metadata = {
  name: 'MicroOrganica',
  description:
    'Smooth organic worms and cell-like threads that flow with continuous undulation and drift. A more fluid, lifelike variant of MicroCaterpillars.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.1',
  isSource: true,
  parameters: [
    { name: 'count', type: 'number', value: 24, min: 1, max: 200, step: 1 },
    { name: 'segments', type: 'number', value: 40, min: 4, max: 200, step: 1 },
    { name: 'spacing', type: 'number', value: 0.025, min: 0.005, max: 0.1, step: 0.001 },
    { name: 'speed', type: 'number', value: 0.7, min: 0.01, max: 3, step: 0.01 },
    { name: 'undulation', type: 'number', value: 0.4, min: 0, max: 1.5, step: 0.01 },
    { name: 'waveFreq', type: 'number', value: 1.8, min: 0.1, max: 8, step: 0.01 },
    { name: 'wander', type: 'number', value: 0.8, min: 0, max: 2, step: 0.01 },
    { name: 'size', type: 'number', value: 0.9, min: 0.1, max: 2, step: 0.01 },
    { name: 'baseHue', type: 'number', value: 180, min: 0, max: 360, step: 1 },
    { name: 'hueVariance', type: 'number', value: 90, min: 0, max: 360, step: 1 },
    { name: 'trailOpacity', type: 'number', value: 0.45, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'wrapAround', type: 'boolean', value: true },
    { name: 'gameSpeed', type: 'number', value: 30, min: 1, max: 120, step: 1 },
  ],
};

export default function MicroOrganica(params) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const {
    count = 24,
    segments = 40,
    spacing = 0.025,
    speed = 0.7,
    undulation = 0.4,
    waveFreq = 1.8,
    wander = 0.8,
    size = 0.9,
    baseHue = 180,
    hueVariance = 90,
    trailOpacity = 0.45,
    wrapAround = true,
    gameSpeed = 30,
  } = params;

  // sanitise numeric inputs
  const safe = n => (Number.isFinite(n) && n > 0 ? n : 1);
  const segCount = Math.max(4, Math.min(200, Math.floor(safe(segments))));
  const wormCount = Math.max(1, Math.min(200, Math.floor(safe(count))));
  const safeSpacing = Math.max(0.001, safe(spacing));

  const { size: viewport } =
    typeof useThree === 'function' ? useThree() : { size: { width: 1920, height: 1080 } };

  const aspect = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 16 / 9;
  const planeH = 2;
  const planeW = aspect * planeH;
  const halfW = planeW / 2;
  const halfH = planeH / 2;

  const groupRef = useRef(null);
  const wormsRef = useRef([]);
  const tickRef = useRef(0);
  const timeAccRef = useRef(0);
  const [, setTick] = useState(0);

  const materials = useMemo(() => {
    const mats = [];
    for (let i = 0; i < wormCount; i++) {
      const hue = (baseHue + ((i / Math.max(1, wormCount - 1)) - 0.5) * hueVariance + 360) % 360;
      const col = new THREE.Color(`hsl(${hue}, 90%, 55%)`);
      mats.push(
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: trailOpacity,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
    }
    return mats;
  }, [wormCount, baseHue, hueVariance, trailOpacity]);

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function initWorms() {
    wormsRef.current = [];
    for (let i = 0; i < wormCount; i++) {
      const sr = seededRandom(i + 1);
      const x = (sr() - 0.5) * planeW * 0.8;
      const y = (sr() - 0.5) * planeH * 0.8;
      const angle = sr() * Math.PI * 2;
      wormsRef.current.push({
        head: { x, y, angle, speed: speed * (0.6 + sr() * 0.7) },
        phase: sr() * Math.PI * 2,
        wanderSeed: sr() * 1000,
        hueIdx: i % materials.length,
      });
    }
  }

  function wrapCoord(v, halfSize, total) {
    if (v < -halfSize) return v + total;
    if (v > halfSize) return v - total;
    return v;
  }

  function step(dt = 1, t = 0) {
    tickRef.current++;
    for (let w of wormsRef.current) {
      const h = w.head;
      const ws = w.wanderSeed;

      const wobble = Math.sin(t * 0.6 + ws * 0.004) * 0.5 + Math.cos(t * 1.2 + ws * 0.01) * 0.35;
      const steer = wobble * wander * 0.2;
      const dist = Math.sqrt(h.x * h.x + h.y * h.y) || 0.001;
      const towardCentre = -Math.atan2(h.y, h.x) * Math.max(0, 1 - dist / halfW) * 0.05;

      h.angle += (steer + towardCentre) * dt;
      h.x += Math.cos(h.angle) * h.speed * dt;
      h.y += Math.sin(h.angle) * h.speed * dt;

      if (wrapAround) {
        h.x = wrapCoord(h.x, halfW, planeW);
        h.y = wrapCoord(h.y, halfH, planeH);
      }
      w.phase += 0.05 * dt;
    }
    setTick(s => (s + 1) % 1000000);
  }

  useEffect(() => {
    initWorms();
  }, [wormCount, planeW, planeH]);

  useFrame((_, delta) => {
    timeAccRef.current += delta;
    const interval = 1 / Math.max(1, gameSpeed);
    while (timeAccRef.current >= interval) {
      step(1, tickRef.current * interval);
      timeAccRef.current -= interval;
    }
  });

  const meshes = [];
  const now = tickRef.current / Math.max(1, gameSpeed);

  for (let wi = 0; wi < wormsRef.current.length; wi++) {
    const w = wormsRef.current[wi];
    if (!w) continue;
    const head = w.head;
    const mat = materials[w.hueIdx];

    const points = [];
    const dirX = Math.cos(head.angle);
    const dirY = Math.sin(head.angle);

    for (let si = 0; si < segCount; si++) {
      const frac = si / Math.max(1, segCount - 1);
      const dist = si * safeSpacing * size;
      let x = head.x - dirX * dist;
      let y = head.y - dirY * dist;
      const amp = undulation * (1 - frac);
      const offset = Math.sin(w.phase + now * waveFreq - frac * waveFreq * 4.0 + wi * 0.3) * amp * 0.25;
      const nx = -dirY;
      const ny = dirX;
      x += nx * offset;
      y += ny * offset;
      if (wrapAround) {
        x = wrapCoord(x, halfW, planeW);
        y = wrapCoord(y, halfH, planeH);
      }
      points.push(new THREE.Vector3(x, y, 0));
    }

    // guard against invalid arrays
    if (points.length < 4 || !Number.isFinite(points[0].x)) continue;

    const curve = new THREE.CatmullRomCurve3(points);
    const tubularSegments = Math.max(10, Math.min(400, Math.floor(segCount * 2)));
    const radius = Math.max(0.002, 0.01 * size);
    let tubeGeom;
    try {
      tubeGeom = new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false);
    } catch {
      continue; // skip bad geometry
    }

    meshes.push(
      React.createElement('mesh', {
        key: `worm-${wi}-${tickRef.current}`,
        geometry: tubeGeom,
        material: mat,
      }),
    );
  }

  return React.createElement('group', { ref: groupRef, position: [0, 0, 0] }, ...meshes);
}
