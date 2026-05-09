// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Pulse Network Mapper (PULSE)',
  description: 'Press Pulse to fire random center dots, connect them with lines, and shift the HUD position.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'pulseOne', type: 'button', value: 0, description: 'Pulse One' },
    { name: 'networkOpacity', type: 'number', value: 0.88, min: 0, max: 1, step: 0.01, description: 'Network Opacity' },
    { name: 'maxDots', type: 'number', value: 18, min: 3, max: 64, step: 1 },
    { name: 'connections', type: 'number', value: 3, min: 1, max: 8, step: 1 },
    { name: 'dotSize', type: 'number', value: 7, min: 2, max: 24, step: 0.5 },
    { name: 'lineWidth', type: 'number', value: 1.2, min: 0.25, max: 5, step: 0.05 },
    { name: 'rotateSpeed', type: 'number', value: 0.9, min: -3, max: 3, step: 0.01 },
    { name: 'helixRadius', type: 'number', value: 0.18, min: 0.04, max: 0.38, step: 0.01 },
    { name: 'depthAmount', type: 'number', value: 0.62, min: 0, max: 1, step: 0.01 },
    { name: 'shiftAmount', type: 'number', value: 0.12, min: 0, max: 0.35, step: 0.01 },
    { name: 'decay', type: 'number', value: 8.5, min: 1.5, max: 24, step: 0.1 },
    { name: 'primaryColor', type: 'color', value: '#b8fff8' },
    { name: 'accentColor', type: 'color', value: '#8cff00' },
    { name: 'lineColor', type: 'color', value: '#ffffff' },
  ],
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function parseHex(hex, fallback) {
  const value = String(hex || fallback || '#ffffff');
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
  if (!match) return parseHex(fallback || '#ffffff', '#ffffff');
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgba(hex, alpha, fallback) {
  const c = parseHex(hex, fallback);
  return `rgba(${c.r},${c.g},${c.b},${clamp01(alpha)})`;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function nearestNodeIds(nodes, node, count) {
  return nodes
    .filter((item) => item.id !== node.id)
    .map((item) => ({
      id: item.id,
      d: Math.hypot(item.y - node.y, Math.sin(item.phase - node.phase) * 0.22),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((item) => item.id);
}

function projectHelixNode(node, panelX, panelY, panelW, panelH, rotation, radius, depthAmount) {
  const angle = node.phase + rotation;
  const z = Math.sin(angle);
  const depth = 1 + z * clamp(depthAmount, 0, 1) * 0.45;
  return {
    x: panelX + panelW * (0.5 + Math.cos(angle) * radius),
    y: panelY + panelH * node.y,
    z,
    depth,
    alpha: clamp(0.35 + depth * 0.48, 0.18, 1),
  };
}

export default function PulseNetworkMapper({
  pulseOne = 0,
  networkOpacity = 0.88,
  maxDots = 18,
  connections = 3,
  dotSize = 7,
  lineWidth = 1.2,
  rotateSpeed = 0.9,
  helixRadius = 0.18,
  depthAmount = 0.62,
  shiftAmount = 0.12,
  decay = 8.5,
  primaryColor = '#b8fff8',
  accentColor = '#8cff00',
  lineColor = '#ffffff',
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const ctx3 = useThree();
  const size = ctx3 && ctx3.size ? ctx3.size : { width: 1920, height: 1080 };
  const effectiveW = Math.max(1, Number(compositionWidth) || size.width || 1920);
  const effectiveH = Math.max(1, Number(compositionHeight) || size.height || 1080);
  const aspect = effectiveW / effectiveH;
  const canvasWidth = aspect >= 1 ? 1280 : Math.max(360, Math.round(1280 * aspect));
  const canvasHeight = aspect >= 1 ? Math.max(360, Math.round(1280 / aspect)) : 1280;

  const canvas = useMemo(() => {
    const doc = globalThis.document;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const c = doc.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c;
  }, []);

  const texture = useMemo(() => {
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [canvas]);

  const material = useMemo(() => {
    if (!texture) return null;
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: networkOpacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [texture]);

  const graphRef = useRef({
    nodes: [],
    edges: [],
    bursts: [],
    nextId: 1,
    offsetX: 0,
    offsetY: 0,
    targetX: 0,
    targetY: 0,
    rotation: 0,
  });
  const lastPulseRef = useRef(Number(pulseOne) || 0);

  useEffect(() => {
    if (!canvas) return;
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      if (texture) texture.needsUpdate = true;
    }
  }, [canvas, texture, canvasWidth, canvasHeight]);

  useEffect(() => () => {
    try { texture && texture.dispose(); } catch (_) {}
    try { material && material.dispose(); } catch (_) {}
  }, [texture, material]);

  const spawnPulse = () => {
    const graph = graphRef.current;
    const limit = Math.max(1, Math.floor(Number(maxDots) || 18));
    const id = graph.nextId++;
    const strand = id % 2;
    const y = rand(0.22, 0.78);
    const node = {
      id,
      y,
      phase: y * Math.PI * 7.5 + strand * Math.PI + rand(-0.24, 0.24),
      strand,
      born: 0,
      energy: 1,
      driftY: rand(-0.004, 0.004),
    };

    const links = nearestNodeIds(graph.nodes, node, Math.max(1, Math.floor(Number(connections) || 3)));
    graph.nodes.push(node);
    links.forEach((to) => graph.edges.push({ from: id, to, age: 0 }));
    graph.bursts.push({ nodeId: id, y: node.y, phase: node.phase, age: 0 });

    while (graph.nodes.length > limit) {
      const removed = graph.nodes.shift();
      if (!removed) break;
      graph.edges = graph.edges.filter((edge) => edge.from !== removed.id && edge.to !== removed.id);
    }

    const shift = clamp(Number(shiftAmount) || 0, 0, 0.35);
    graph.targetX = rand(-shift, shift);
    graph.targetY = rand(-shift, shift);
  };

  useEffect(() => {
    const next = Number(pulseOne) || 0;
    if (next !== lastPulseRef.current) {
      lastPulseRef.current = next;
      spawnPulse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseOne]);

  useFrame((_state, delta) => {
    if (!canvas || !texture || !material) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = clamp(delta || 0.016, 0, 0.08);
    const width = canvas.width;
    const height = canvas.height;
    const alpha = clamp01(Number(networkOpacity) || 0);
    const graph = graphRef.current;
    const fadeRate = Math.max(0.2, Number(decay) || 8.5);
    const radius = clamp(Number(helixRadius) || 0.18, 0.04, 0.38);
    const depth = clamp(Number(depthAmount) || 0, 0, 1);

    graph.offsetX += (graph.targetX - graph.offsetX) * clamp(dt * 7, 0, 1);
    graph.offsetY += (graph.targetY - graph.offsetY) * clamp(dt * 7, 0, 1);
    graph.rotation += dt * (Number(rotateSpeed) || 0);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(graph.offsetX * width, graph.offsetY * height);

    const panelX = width * 0.18;
    const panelY = height * 0.13;
    const panelW = width * 0.64;
    const panelH = height * 0.74;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(primaryColor, alpha * 0.2, '#b8fff8');
    ctx.lineWidth = Math.max(0.5, Number(lineWidth) || 1.2);
    drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.stroke();

    ctx.strokeStyle = rgba(accentColor, alpha * 0.42, '#8cff00');
    ctx.beginPath();
    ctx.moveTo(panelX + panelW * 0.08, panelY + panelH + 14);
    ctx.lineTo(panelX + panelW * 0.38, panelY + panelH + 14);
    ctx.lineTo(panelX + panelW * 0.43, panelY + panelH + 34);
    ctx.lineTo(panelX + panelW * 0.74, panelY + panelH + 34);
    ctx.stroke();

    const findNode = (id) => graph.nodes.find((node) => node.id === id);
    const toPx = (node) => projectHelixNode(node, panelX, panelY, panelW, panelH, graph.rotation, radius, depth);

    graph.edges = graph.edges
      .map((edge) => ({ ...edge, age: edge.age + dt }))
      .filter((edge) => Boolean(findNode(edge.from)) && Boolean(findNode(edge.to)));

    graph.edges.forEach((edge) => {
      const from = findNode(edge.from);
      const to = findNode(edge.to);
      if (!from || !to) return;
      const a = toPx(from);
      const b = toPx(to);
      const fresh = Math.exp(-edge.age * 2.2);
      const depthAlpha = (a.alpha + b.alpha) * 0.5;
      ctx.strokeStyle = rgba(lineColor, alpha * depthAlpha * (0.16 + fresh * 0.5), '#ffffff');
      ctx.lineWidth = Math.max(0.35, Number(lineWidth) || 1.2) * (0.65 + depthAlpha + fresh);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    [0, 1].forEach((strand) => {
      const strandNodes = graph.nodes
        .filter((node) => node.strand === strand)
        .slice()
        .sort((a, b) => a.y - b.y);
      ctx.strokeStyle = rgba(strand ? accentColor : primaryColor, alpha * 0.18, strand ? '#8cff00' : '#b8fff8');
      ctx.lineWidth = Math.max(0.3, Number(lineWidth) || 1.2) * 0.75;
      ctx.beginPath();
      strandNodes.forEach((node, index) => {
        const p = toPx(node);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });

    const nextNodes = [];
    graph.nodes.forEach((node) => {
      node.born += dt;
      node.energy = Math.max(0.18, node.energy - dt / fadeRate);
      node.y = clamp(node.y + node.driftY * dt, 0.18, 0.82);
      nextNodes.push(node);

      const p = toPx(node);
      const fresh = Math.exp(-node.born * 2.6);
      const r = Math.max(1, Number(dotSize) || 7) * p.depth * (0.62 + fresh * 1.55);

      ctx.fillStyle = rgba(accentColor, alpha * p.alpha * (0.1 + fresh * 0.2), '#8cff00');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(node.strand ? accentColor : primaryColor, alpha * p.alpha * (0.54 + fresh * 0.42), node.strand ? '#8cff00' : '#b8fff8');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba('#ffffff', alpha * (0.55 + fresh * 0.35), '#ffffff');
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.2, r * 0.36), 0, Math.PI * 2);
      ctx.fill();
    });
    graph.nodes = nextNodes;

    graph.bursts = graph.bursts
      .map((burst) => ({ ...burst, age: burst.age + dt }))
      .filter((burst) => burst.age < 1.15);

    graph.bursts.forEach((burst) => {
      const n = clamp01(burst.age / 1.15);
      const sourceNode = findNode(burst.nodeId);
      const projected = sourceNode
        ? toPx(sourceNode)
        : projectHelixNode(burst, panelX, panelY, panelW, panelH, graph.rotation, radius, depth);
      const x = projected.x;
      const y = projected.y;
      ctx.strokeStyle = rgba(accentColor, alpha * (1 - n) * 0.82, '#8cff00');
      ctx.lineWidth = Math.max(0.5, Number(lineWidth) || 1.2) * (1.5 - n);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, Number(dotSize) || 7) * (2 + n * 9), 0, Math.PI * 2);
      ctx.stroke();
    });

    const labelAlpha = alpha * 0.55;
    ctx.font = `${Math.max(10, Math.round(width / 110))}px Consolas, Monaco, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(primaryColor, labelAlpha, '#b8fff8');
    ctx.fillText('PULSE NODE MAP', panelX + 14, panelY + 12);
    ctx.fillStyle = rgba(accentColor, labelAlpha * 0.85, '#8cff00');
    ctx.fillText(String(graph.nodes.length).padStart(2, '0'), panelX + panelW - 44, panelY + 12);

    ctx.restore();
    texture.needsUpdate = true;
    material.opacity = alpha;
  });

  if (!texture || !material) return null;
  return React.createElement('mesh', { renderOrder: 10026 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
