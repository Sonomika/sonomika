// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Jason Webb Differential Growth',
  description:
    'A fresh differential-growth overlay based on Jason Webb\'s 2D experiments: connected nodes attract, nearby nodes repel, curved paths align, long edges split, and random injections keep the form asymmetric.',
  category: 'Effects',
  author: 'VJ, after Jason Webb',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'pathCount', type: 'number', value: 3, min: 1, max: 16, step: 1 },
    { name: 'seedShape', type: 'number', value: 2, min: 0, max: 4, step: 1 },
    { name: 'initialNodes', type: 'number', value: 18, min: 3, max: 96, step: 1 },
    { name: 'maxNodes', type: 'number', value: 2600, min: 80, max: 8000, step: 20 },
    { name: 'iterationsPerFrame', type: 'number', value: 2, min: 0, max: 12, step: 1 },
    { name: 'minDistance', type: 'number', value: 0.030, min: 0.004, max: 0.16, step: 0.001 },
    { name: 'maxDistance', type: 'number', value: 0.070, min: 0.008, max: 0.28, step: 0.001 },
    { name: 'repulsionRadius', type: 'number', value: 0.092, min: 0.01, max: 0.35, step: 0.001 },
    { name: 'attractionForce', type: 'number', value: 0.040, min: 0.0, max: 0.30, step: 0.001 },
    { name: 'repulsionForce', type: 'number', value: 0.078, min: 0.0, max: 0.36, step: 0.001 },
    { name: 'alignmentForce', type: 'number', value: 0.050, min: 0.0, max: 0.30, step: 0.001 },
    { name: 'maxVelocity', type: 'number', value: 0.420, min: 0.02, max: 0.98, step: 0.01 },
    { name: 'injectionRate', type: 'number', value: 0.20, min: 0.0, max: 3.0, step: 0.01 },
    { name: 'brownianMotion', type: 'number', value: 0.0020, min: 0.0, max: 0.04, step: 0.0005 },
    { name: 'boundsPadding', type: 'number', value: 0.08, min: 0.0, max: 0.45, step: 0.01 },
    { name: 'lineWidth', type: 'number', value: 1.75, min: 0.25, max: 10.0, step: 0.25 },
    { name: 'traceFade', type: 'number', value: 0.055, min: 0.0, max: 0.35, step: 0.005 },
    { name: 'historySteps', type: 'number', value: 8, min: 0, max: 32, step: 1 },
    { name: 'showNodes', type: 'boolean', value: false },
    { name: 'fillShapes', type: 'boolean', value: false },
    { name: 'strokeColor', type: 'color', value: '#f7f3df' },
    { name: 'nodeColor', type: 'color', value: '#55f6ff' },
    { name: 'fillColor', type: 'color', value: '#f7f3df' },
    { name: 'glow', type: 'number', value: 0.55, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'opacity', type: 'number', value: 0.88, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'resetSeed', type: 'number', value: 7, min: 1, max: 9999, step: 1 },
  ],
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function safeNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function makeRandom(seed) {
  let s = Math.floor(seed || 1) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeNode(x, y, fixed) {
  return {
    x,
    y,
    nextX: x,
    nextY: y,
    fixed: !!fixed,
  };
}

function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return `rgba(255,255,255,${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a, b) {
  return makeNode((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, false);
}

function getConnectedNodes(path, index) {
  const count = path.nodes.length;
  const previousNode = index === 0
    ? (path.closed ? path.nodes[count - 1] : undefined)
    : path.nodes[index - 1];
  const nextNode = index === count - 1
    ? (path.closed ? path.nodes[0] : undefined)
    : path.nodes[index + 1];
  return { previousNode, nextNode };
}

function buildSpatialHash(paths, cellSize) {
  const grid = new Map();
  for (let pi = 0; pi < paths.length; pi++) {
    const nodes = paths[pi].nodes;
    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni];
      const gx = Math.floor(node.x / cellSize);
      const gy = Math.floor(node.y / cellSize);
      const key = `${gx},${gy}`;
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push({ pathIndex: pi, nodeIndex: ni, node });
    }
  }
  return grid;
}

function querySpatialHash(grid, node, cellSize, radius) {
  const gx = Math.floor(node.x / cellSize);
  const gy = Math.floor(node.y / cellSize);
  const reach = Math.max(1, Math.ceil(radius / cellSize));
  const out = [];
  for (let y = gy - reach; y <= gy + reach; y++) {
    for (let x = gx - reach; x <= gx + reach; x++) {
      const bucket = grid.get(`${x},${y}`);
      if (bucket) out.push(...bucket);
    }
  }
  return out;
}

function createSeedPath(index, total, settings, rand, aspect) {
  const nodes = [];
  const count = Math.max(3, Math.floor(settings.initialNodes));
  const shape = Math.max(0, Math.floor(settings.seedShape)) % 5;
  const ring = Math.sqrt((index + 0.5) / Math.max(1, total));
  const offsetAngle = rand() * Math.PI * 2;
  const spread = total > 1 ? 0.62 : 0.0;
  const cx = Math.cos(offsetAngle) * spread * ring * aspect * 0.58;
  const cy = Math.sin(offsetAngle) * spread * ring * 0.58;
  const baseRadius = (0.13 + rand() * 0.13) * (total > 6 ? 0.78 : 1.0);
  const rotation = rand() * Math.PI * 2;
  const closed = shape !== 1;

  if (shape === 1) {
    const length = baseRadius * (2.8 + rand() * 1.5);
    const angle = rotation;
    const nx = Math.cos(angle + Math.PI * 0.5);
    const ny = Math.sin(angle + Math.PI * 0.5);
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0 : i / (count - 1);
      const wave = Math.sin(t * Math.PI * 2.0 + rand() * 0.4) * baseRadius * 0.20;
      const x = cx + Math.cos(angle) * (t - 0.5) * length + nx * wave;
      const y = cy + Math.sin(angle) * (t - 0.5) * length + ny * wave;
      nodes.push(makeNode(x, y, i === 0 || i === count - 1));
    }
    return { nodes, closed, history: [], injectClock: rand() };
  }

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const a = rotation + t * Math.PI * 2;
    let r = baseRadius;
    if (shape === 2) {
      r *= 0.72 + 0.42 * Math.abs(Math.sin(a * 3.0));
    } else if (shape === 3) {
      r *= 0.70 + 0.35 * Math.sin(a * 5.0 + index);
    } else if (shape === 4) {
      r *= 0.58 + 0.48 * (Math.sin(a * 2.0) > 0 ? 1 : 0.45);
    } else {
      r *= 0.92 + rand() * 0.16;
    }
    nodes.push(makeNode(cx + Math.cos(a) * r, cy + Math.sin(a) * r, false));
  }
  return { nodes, closed, history: [], injectClock: rand() };
}

function createPaths(settings) {
  const rand = makeRandom(settings.resetSeed);
  const count = Math.max(1, Math.floor(settings.pathCount));
  const paths = [];
  for (let i = 0; i < count; i++) {
    paths.push(createSeedPath(i, count, settings, rand, settings.aspect));
  }
  return { paths, rand };
}

function applyAttraction(path, index, settings) {
  const node = path.nodes[index];
  if (node.fixed) return;
  const connected = getConnectedNodes(path, index);
  if (connected.nextNode && distance(node, connected.nextNode) > settings.minDistance) {
    node.nextX += (connected.nextNode.x - node.nextX) * settings.attractionForce;
    node.nextY += (connected.nextNode.y - node.nextY) * settings.attractionForce;
  }
  if (connected.previousNode && distance(node, connected.previousNode) > settings.minDistance) {
    node.nextX += (connected.previousNode.x - node.nextX) * settings.attractionForce;
    node.nextY += (connected.previousNode.y - node.nextY) * settings.attractionForce;
  }
}

function applyRepulsion(paths, pathIndex, nodeIndex, grid, settings) {
  const path = paths[pathIndex];
  const node = path.nodes[nodeIndex];
  if (node.fixed) return;
  const radius = settings.repulsionRadius;
  const radius2 = radius * radius;
  const nearby = querySpatialHash(grid, node, Math.max(0.001, settings.minDistance), radius);
  for (let i = 0; i < nearby.length; i++) {
    const item = nearby[i];
    if (item.pathIndex === pathIndex) {
      const delta = Math.abs(item.nodeIndex - nodeIndex);
      const isConnected = delta === 0 || delta === 1 || (path.closed && delta === path.nodes.length - 1);
      if (isConnected) continue;
    }
    const other = item.node;
    const dx = node.x - other.x;
    const dy = node.y - other.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 0.0000001 || d2 > radius2) continue;
    const d = Math.sqrt(d2);
    const force = (1 - d / radius) * settings.repulsionForce;
    node.nextX += (dx / d) * force;
    node.nextY += (dy / d) * force;
  }
}

function applyAlignment(path, index, settings) {
  const node = path.nodes[index];
  if (node.fixed) return;
  const connected = getConnectedNodes(path, index);
  if (!connected.previousNode || !connected.nextNode) return;
  const midX = (connected.previousNode.x + connected.nextNode.x) * 0.5;
  const midY = (connected.previousNode.y + connected.nextNode.y) * 0.5;
  node.nextX += (midX - node.nextX) * settings.alignmentForce;
  node.nextY += (midY - node.nextY) * settings.alignmentForce;
}

function applyBounds(node, settings) {
  const limitX = Math.max(0.08, settings.aspect - settings.boundsPadding);
  const limitY = Math.max(0.08, 1 - settings.boundsPadding);
  if (node.nextX < -limitX || node.nextX > limitX) {
    node.nextX = clamp(node.nextX, -limitX, limitX);
    node.fixed = true;
  }
  if (node.nextY < -limitY || node.nextY > limitY) {
    node.nextY = clamp(node.nextY, -limitY, limitY);
    node.fixed = true;
  }
}

function splitEdges(path, settings) {
  if (path.nodes.length >= settings.maxNodes) return;
  for (let i = 0; i < path.nodes.length && path.nodes.length < settings.maxNodes; i++) {
    const node = path.nodes[i];
    const prev = i === 0 ? (path.closed ? path.nodes[path.nodes.length - 1] : undefined) : path.nodes[i - 1];
    if (!prev) continue;
    if (distance(node, prev) >= settings.maxDistance) {
      const nextNode = midpoint(node, prev);
      if (i === 0) {
        path.nodes.push(nextNode);
      } else {
        path.nodes.splice(i, 0, nextNode);
        i++;
      }
    }
  }
}

function pruneNodes(path, settings) {
  const minCount = path.closed ? 3 : 2;
  if (path.nodes.length <= minCount) return;
  for (let i = path.nodes.length - 1; i >= 0 && path.nodes.length > minCount; i--) {
    const node = path.nodes[i];
    const prevIndex = i === 0 ? (path.closed ? path.nodes.length - 1 : -1) : i - 1;
    if (prevIndex < 0) continue;
    const prev = path.nodes[prevIndex];
    if (!prev.fixed && distance(node, prev) < settings.minDistance * 0.62) {
      path.nodes.splice(prevIndex, 1);
      if (prevIndex < i) i--;
    }
  }
}

function injectRandomNode(path, settings, rand) {
  if (path.nodes.length >= settings.maxNodes || path.nodes.length < 2) return;
  const index = Math.max(1, Math.floor(rand() * path.nodes.length));
  const connected = getConnectedNodes(path, index);
  if (!connected.previousNode) return;
  if (distance(path.nodes[index], connected.previousNode) > settings.minDistance) {
    path.nodes.splice(index, 0, midpoint(path.nodes[index], connected.previousNode));
  }
}

function stepGrowth(state, settings, delta) {
  const paths = state.paths;
  const rand = state.rand;
  if (!paths.length) return;
  const grid = buildSpatialHash(paths, Math.max(0.001, settings.minDistance));

  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
    for (let ni = 0; ni < path.nodes.length; ni++) {
      const node = path.nodes[ni];
      node.nextX = node.x + (rand() - 0.5) * settings.brownianMotion;
      node.nextY = node.y + (rand() - 0.5) * settings.brownianMotion;
      applyAttraction(path, ni, settings);
      applyRepulsion(paths, pi, ni, grid, settings);
      applyAlignment(path, ni, settings);
      applyBounds(node, settings);
    }
  }

  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
    for (let ni = 0; ni < path.nodes.length; ni++) {
      const node = path.nodes[ni];
      if (node.fixed) continue;
      node.x += (node.nextX - node.x) * settings.maxVelocity;
      node.y += (node.nextY - node.y) * settings.maxVelocity;
    }
    splitEdges(path, settings);
    pruneNodes(path, settings);
    path.injectClock += settings.injectionRate * delta;
    while (path.injectClock >= 1) {
      injectRandomNode(path, settings, rand);
      path.injectClock -= 1;
    }
  }
}

function snapshotHistory(paths, maxHistory) {
  const keep = Math.max(0, Math.floor(maxHistory));
  if (keep <= 0) {
    for (const path of paths) path.history = [];
    return;
  }
  for (const path of paths) {
    path.history.push(path.nodes.map((node) => ({ x: node.x, y: node.y })));
    while (path.history.length > keep) path.history.shift();
  }
}

function worldToCanvas(node, width, height, aspect) {
  return {
    x: (node.x / Math.max(0.0001, aspect) * 0.5 + 0.5) * width,
    y: (0.5 - node.y * 0.5) * height,
  };
}

function drawPath(ctx, nodes, closed, width, height, aspect) {
  if (!nodes || nodes.length < 2) return;
  const first = worldToCanvas(nodes[0], width, height, aspect);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < nodes.length; i++) {
    const p = worldToCanvas(nodes[i], width, height, aspect);
    ctx.lineTo(p.x, p.y);
  }
  if (closed) ctx.closePath();
}

function drawGrowth(canvas, ctx, paths, settings) {
  const width = canvas.width;
  const height = canvas.height;
  const fade = clamp(settings.traceFade, 0, 1);
  if (fade <= 0) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.1, settings.lineWidth);
  ctx.shadowBlur = Math.max(0, settings.glow) * 24;
  ctx.shadowColor = settings.strokeColor;
  ctx.strokeStyle = hexToRgba(settings.strokeColor, clamp01(settings.opacity));
  ctx.fillStyle = hexToRgba(settings.fillColor, settings.fillShapes ? clamp01(settings.opacity) * 0.08 : 0);

  for (const path of paths) {
    for (let hi = 0; hi < path.history.length; hi++) {
      const alpha = ((hi + 1) / Math.max(1, path.history.length)) * clamp01(settings.opacity) * 0.24;
      ctx.strokeStyle = hexToRgba(settings.strokeColor, alpha);
      ctx.lineWidth = Math.max(0.1, settings.lineWidth * (0.5 + hi / Math.max(1, path.history.length)));
      drawPath(ctx, path.history[hi], path.closed, width, height, settings.aspect);
      ctx.stroke();
    }

    ctx.strokeStyle = hexToRgba(settings.strokeColor, clamp01(settings.opacity));
    ctx.lineWidth = Math.max(0.1, settings.lineWidth);
    drawPath(ctx, path.nodes, path.closed, width, height, settings.aspect);
    if (settings.fillShapes && path.closed) ctx.fill();
    ctx.stroke();
  }

  if (settings.showNodes) {
    ctx.shadowBlur = Math.max(0, settings.glow) * 10;
    ctx.fillStyle = hexToRgba(settings.nodeColor, clamp01(settings.opacity));
    const radius = Math.max(1.0, settings.lineWidth * 1.25);
    for (const path of paths) {
      for (const node of path.nodes) {
        const p = worldToCanvas(node, width, height, settings.aspect);
        ctx.beginPath();
        ctx.arc(p.x, p.y, node.fixed ? radius * 1.7 : radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export default function JasonWebbDifferentialGrowth({
  pathCount = 3,
  seedShape = 2,
  initialNodes = 18,
  maxNodes = 2600,
  iterationsPerFrame = 2,
  minDistance = 0.030,
  maxDistance = 0.070,
  repulsionRadius = 0.092,
  attractionForce = 0.040,
  repulsionForce = 0.078,
  alignmentForce = 0.050,
  maxVelocity = 0.420,
  injectionRate = 0.20,
  brownianMotion = 0.0020,
  boundsPadding = 0.08,
  lineWidth = 1.75,
  traceFade = 0.055,
  historySteps = 8,
  showNodes = false,
  fillShapes = false,
  strokeColor = '#f7f3df',
  nodeColor = '#55f6ff',
  fillColor = '#f7f3df',
  glow = 0.55,
  opacity = 0.88,
  resetSeed = 7,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const ctx3 = useThree?.() || { size: { width: 1920, height: 1080 } };
  const size = ctx3.size || { width: 1920, height: 1080 };
  const width = Math.max(2, Math.floor(compositionWidth || size.width || 1920));
  const height = Math.max(2, Math.floor(compositionHeight || size.height || 1080));
  const aspect = width / Math.max(1, height);

  const meshRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const textureRef = useRef(null);
  const stateRef = useRef(null);
  const resetKeyRef = useRef('');
  const historyClockRef = useRef(0);

  const canvasTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    canvasRef.current = canvas;
    ctxRef.current = ctx;
    textureRef.current = texture;
    return texture;
  }, [width, height]);

  useEffect(() => () => {
    try {
      canvasTexture && canvasTexture.dispose && canvasTexture.dispose();
    } catch {}
  }, [canvasTexture]);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      map: canvasTexture,
      transparent: true,
      opacity: clamp01(opacity),
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return mat;
  }, [canvasTexture]);

  useEffect(() => () => {
    try {
      material && material.dispose && material.dispose();
    } catch {}
  }, [material]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(aspect * 2, 2), [aspect]);

  useEffect(() => () => {
    try {
      geometry && geometry.dispose && geometry.dispose();
    } catch {}
  }, [geometry]);

  const settings = useMemo(() => ({
    aspect,
    pathCount: clamp(Math.floor(safeNumber(pathCount, 3)), 1, 16),
    seedShape: clamp(Math.floor(safeNumber(seedShape, 2)), 0, 4),
    initialNodes: clamp(Math.floor(safeNumber(initialNodes, 18)), 3, 96),
    maxNodes: clamp(Math.floor(safeNumber(maxNodes, 2600)), 80, 8000),
    iterationsPerFrame: clamp(Math.floor(safeNumber(iterationsPerFrame, 2)), 0, 12),
    minDistance: clamp(safeNumber(minDistance, 0.030), 0.001, 0.5),
    maxDistance: clamp(safeNumber(maxDistance, 0.070), 0.002, 0.7),
    repulsionRadius: clamp(safeNumber(repulsionRadius, 0.092), 0.002, 0.8),
    attractionForce: clamp(safeNumber(attractionForce, 0.040), 0, 1),
    repulsionForce: clamp(safeNumber(repulsionForce, 0.078), 0, 1),
    alignmentForce: clamp(safeNumber(alignmentForce, 0.050), 0, 1),
    maxVelocity: clamp(safeNumber(maxVelocity, 0.420), 0.001, 1),
    injectionRate: clamp(safeNumber(injectionRate, 0.20), 0, 10),
    brownianMotion: clamp(safeNumber(brownianMotion, 0.0020), 0, 0.1),
    boundsPadding: clamp(safeNumber(boundsPadding, 0.08), 0, 0.8),
    lineWidth: clamp(safeNumber(lineWidth, 1.75), 0.1, 40),
    traceFade: clamp(safeNumber(traceFade, 0.055), 0, 1),
    historySteps: clamp(Math.floor(safeNumber(historySteps, 8)), 0, 64),
    showNodes: !!showNodes,
    fillShapes: !!fillShapes,
    strokeColor: typeof strokeColor === 'string' ? strokeColor : '#f7f3df',
    nodeColor: typeof nodeColor === 'string' ? nodeColor : '#55f6ff',
    fillColor: typeof fillColor === 'string' ? fillColor : '#f7f3df',
    glow: clamp(safeNumber(glow, 0.55), 0, 4),
    opacity: clamp01(safeNumber(opacity, 0.88)),
    resetSeed: Math.max(1, Math.floor(safeNumber(resetSeed, 7))),
  }), [
    aspect,
    pathCount,
    seedShape,
    initialNodes,
    maxNodes,
    iterationsPerFrame,
    minDistance,
    maxDistance,
    repulsionRadius,
    attractionForce,
    repulsionForce,
    alignmentForce,
    maxVelocity,
    injectionRate,
    brownianMotion,
    boundsPadding,
    lineWidth,
    traceFade,
    historySteps,
    showNodes,
    fillShapes,
    strokeColor,
    nodeColor,
    fillColor,
    glow,
    opacity,
    resetSeed,
  ]);

  useEffect(() => {
    if (material) material.opacity = settings.opacity;
  }, [material, settings.opacity]);

  useFrame((_, delta) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const texture = textureRef.current;
    if (!canvas || !ctx || !texture) return;

    const resetKey = [
      settings.pathCount,
      settings.seedShape,
      settings.initialNodes,
      settings.maxNodes,
      settings.resetSeed,
      settings.aspect.toFixed(4),
      width,
      height,
    ].join(':');
    if (!stateRef.current || resetKeyRef.current !== resetKey) {
      stateRef.current = createPaths(settings);
      resetKeyRef.current = resetKey;
      historyClockRef.current = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const state = stateRef.current;
    const stepDelta = Math.min(0.05, Math.max(0.001, delta || 1 / 60));
    for (let i = 0; i < settings.iterationsPerFrame; i++) {
      stepGrowth(state, settings, stepDelta);
    }

    historyClockRef.current += stepDelta;
    if (historyClockRef.current > 0.16) {
      snapshotHistory(state.paths, settings.historySteps);
      historyClockRef.current = 0;
    }

    drawGrowth(canvas, ctx, state.paths, settings);
    texture.needsUpdate = true;
  });

  return React.createElement(
    'mesh',
    { ref: meshRef, geometry },
    React.createElement('primitive', { object: material, attach: 'material' }),
  );
}
