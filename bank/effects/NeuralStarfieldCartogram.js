const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Neural Starfield Cartogram',
  description: 'Animated constellation-map overlay with drifting nodes, pulsing routes, contour fields, signal packets, warped grids, and luminous scanner detail.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'opacity', type: 'number', value: 0.68, min: 0, max: 1, step: 0.01 },
    { name: 'density', type: 'number', value: 0.95, min: 0.2, max: 2.0, step: 0.01 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0, max: 4, step: 0.01 },
    { name: 'lineWidth', type: 'number', value: 1.0, min: 0.35, max: 3.0, step: 0.05 },
    { name: 'nodeSize', type: 'number', value: 1.0, min: 0.35, max: 2.5, step: 0.01 },
    { name: 'pulseStrength', type: 'number', value: 0.85, min: 0, max: 2, step: 0.01 },
    { name: 'mapWarp', type: 'number', value: 0.72, min: 0, max: 2, step: 0.01 },
    { name: 'gridIntensity', type: 'number', value: 0.42, min: 0, max: 1.5, step: 0.01 },
    { name: 'primaryColor', type: 'color', value: '#eaffff' },
    { name: 'accentColor', type: 'color', value: '#00ffd0' },
    { name: 'tertiaryColor', type: 'color', value: '#ff4df8' },
  ],
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function parseHex(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgba(hex, alpha) {
  const c = parseHex(hex);
  return `rgba(${c.r},${c.g},${c.b},${clamp01(alpha)})`;
}

function seededNoise(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function line(ctx, x1, y1, x2, y2, color, alpha, lw) {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx, x, y, r, color, alpha, lw, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = rgba(color, alpha);
    ctx.fill();
  } else {
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function fillRect(ctx, x, y, w, h, color, alpha) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillRect(x, y, w, h);
}

function quadPoint(ax, ay, cx, cy, bx, by, p) {
  const q = 1 - p;
  return {
    x: q * q * ax + 2 * q * p * cx + p * p * bx,
    y: q * q * ay + 2 * q * p * cy + p * p * by,
  };
}

function nodePosition(node, t, warp, width, height) {
  const drift = Math.min(width, height) * 0.011 * warp * node.drift;
  return {
    x: node.x + Math.sin(t * node.speed + node.phase) * drift,
    y: node.y + Math.cos(t * node.speed * 0.83 + node.phase * 1.7) * drift,
  };
}

function drawWarpedGrid(ctx, width, height, t, colors, alpha, lw, density, gridIntensity, warp) {
  const step = clamp(68 / Math.max(0.25, density), 28, 96);
  const offsetX = (t * 9) % step;
  const offsetY = (t * 6) % step;
  const { primaryColor, accentColor } = colors;

  ctx.save();
  ctx.lineCap = 'square';

  for (let x = -step + offsetX; x <= width + step; x += step) {
    ctx.beginPath();
    for (let y = 0; y <= height; y += 18) {
      const wobble = Math.sin(y * 0.012 + t * 0.6 + x * 0.01) * 7 * warp;
      const px = x + wobble;
      if (y === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.strokeStyle = rgba(primaryColor, alpha * gridIntensity * 0.07);
    ctx.lineWidth = lw * 0.65;
    ctx.stroke();
  }

  for (let y = -step + offsetY; y <= height + step; y += step) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += 18) {
      const wobble = Math.cos(x * 0.011 - t * 0.55 + y * 0.014) * 6 * warp;
      const py = y + wobble;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.strokeStyle = rgba(accentColor, alpha * gridIntensity * 0.045);
    ctx.lineWidth = lw * 0.55;
    ctx.stroke();
  }

  ctx.restore();
}

function drawContour(ctx, cx, cy, baseR, t, color, alpha, lw, seed, warp) {
  const rings = 4 + Math.floor(seededNoise(seed) * 4);
  for (let ring = 0; ring < rings; ring++) {
    const r = baseR * (0.38 + ring * 0.24);
    const phase = seed + ring * 1.83;
    ctx.beginPath();

    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const wobble =
        1 +
        Math.sin(a * 3 + t * 0.32 + phase) * 0.075 * warp +
        Math.sin(a * 7 - t * 0.21 + phase * 1.9) * 0.048 * warp +
        Math.sin(a * 11 + phase * 0.7) * 0.025 * warp;

      const x = cx + Math.cos(a) * r * wobble;
      const y = cy + Math.sin(a) * r * wobble;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.strokeStyle = rgba(color, alpha * (0.16 - ring * 0.012));
    ctx.lineWidth = lw * 0.75;
    ctx.stroke();
  }
}

function drawLink(ctx, a, b, link, t, colors, alpha, lw, pulseStrength, width, height) {
  const { primaryColor, accentColor, tertiaryColor } = colors;
  const mx = (a.x + b.x) * 0.5;
  const my = (a.y + b.y) * 0.5;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / d;
  const ny = dx / d;
  const bend = (seededNoise(link.seed + 8.1) - 0.5) * Math.min(width, height) * 0.08;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;

  const pulse = 0.5 + 0.5 * Math.sin(t * (0.9 + link.rate) + link.seed);
  const routeAlpha = alpha * link.strength * (0.12 + pulse * 0.18 * pulseStrength);

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(cx, cy, b.x, b.y);
  ctx.strokeStyle = rgba(primaryColor, routeAlpha);
  ctx.lineWidth = lw * (0.5 + link.strength * 0.8);
  ctx.stroke();

  if (pulse > 0.72) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.strokeStyle = rgba(accentColor, alpha * link.strength * 0.08 * pulseStrength);
    ctx.lineWidth = lw * 3.2;
    ctx.stroke();
  }

  if (link.packet) {
    const p = (t * (0.08 + link.rate * 0.075) + seededNoise(link.seed + 2.2)) % 1;
    const pt = quadPoint(a.x, a.y, cx, cy, b.x, b.y, p);
    const pc = link.hot ? tertiaryColor : accentColor;
    circle(ctx, pt.x, pt.y, 1.6 + link.strength * 2.2, pc, alpha * 0.72 * pulseStrength, lw, true);
    circle(ctx, pt.x, pt.y, 4.5 + link.strength * 5, pc, alpha * 0.16 * pulseStrength, lw, false);
  }
}

function drawNode(ctx, node, pos, t, colors, alpha, lw, nodeSize) {
  const { primaryColor, accentColor, tertiaryColor } = colors;
  const pulse = 0.5 + 0.5 * Math.sin(t * (1.2 + node.speed) + node.phase);
  const r = node.r * nodeSize * (0.82 + pulse * 0.28);
  const color = node.layer === 2 ? tertiaryColor : node.layer === 1 ? accentColor : primaryColor;

  circle(ctx, pos.x, pos.y, r * 3.2, color, alpha * 0.055 * node.energy, lw, false);
  circle(ctx, pos.x, pos.y, r, color, alpha * (0.42 + pulse * 0.35) * node.energy, lw, true);

  if (node.major) {
    circle(ctx, pos.x, pos.y, r * 5.5, color, alpha * 0.18, lw, false);
    line(ctx, pos.x - r * 7, pos.y, pos.x - r * 3, pos.y, color, alpha * 0.28, lw);
    line(ctx, pos.x + r * 3, pos.y, pos.x + r * 7, pos.y, color, alpha * 0.28, lw);
    line(ctx, pos.x, pos.y - r * 7, pos.x, pos.y - r * 3, color, alpha * 0.28, lw);
    line(ctx, pos.x, pos.y + r * 3, pos.x, pos.y + r * 7, color, alpha * 0.28, lw);
  }
}

function drawCompass(ctx, width, height, t, colors, alpha, lw, pulseStrength) {
  const { primaryColor, accentColor, tertiaryColor } = colors;
  const cx = width * 0.5;
  const cy = height * 0.52;
  const r = Math.min(width, height) * 0.095;
  const spin = t * 0.18;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const rr = r * (0.72 + i * 0.22);
    const start = t * (0.22 + i * 0.09) + i * Math.PI * 0.7;
    ctx.arc(0, 0, rr, start, start + Math.PI * (0.42 + i * 0.12));
    ctx.strokeStyle = rgba(i === 2 ? tertiaryColor : accentColor, alpha * (0.22 + i * 0.08) * pulseStrength);
    ctx.lineWidth = lw * (1.1 + i * 0.25);
    ctx.stroke();
  }

  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const inner = r * (i % 4 === 0 ? 0.55 : 0.72);
    const outer = r * (i % 4 === 0 ? 1.12 : 0.94);
    line(
      ctx,
      Math.cos(a) * inner,
      Math.sin(a) * inner,
      Math.cos(a) * outer,
      Math.sin(a) * outer,
      primaryColor,
      alpha * (i % 4 === 0 ? 0.24 : 0.12),
      lw
    );
  }

  circle(ctx, 0, 0, r * 0.17, primaryColor, alpha * 0.26, lw, false);
  circle(ctx, 0, 0, r * 0.04, accentColor, alpha * 0.58, lw, true);

  ctx.restore();
}

function buildMap(width, height, density) {
  const nodes = [];
  const links = [];
  const contours = [];

  const minDim = Math.min(width, height);
  const count = Math.floor(42 + 112 * density);
  const marginX = width * 0.055;
  const marginY = height * 0.07;

  for (let i = 0; i < count; i++) {
    const s = i * 17.173 + 91.7;
    const x = marginX + seededNoise(s) * (width - marginX * 2);
    const y = marginY + seededNoise(s + 4.4) * (height - marginY * 2);
    const layerRoll = seededNoise(s + 12.9);
    const major = seededNoise(s + 22.5) > 0.88;

    nodes.push({
      x,
      y,
      r: (major ? 2.3 : 1.15) + seededNoise(s + 2.2) * (major ? 1.8 : 1.4),
      phase: seededNoise(s + 7.1) * Math.PI * 2,
      speed: 0.18 + seededNoise(s + 9.8) * 0.72,
      drift: 0.35 + seededNoise(s + 13.6) * 1.4,
      energy: 0.5 + seededNoise(s + 16.2) * 0.75,
      layer: layerRoll > 0.86 ? 2 : layerRoll > 0.62 ? 1 : 0,
      major,
      seed: s,
    });
  }

  const maxDist = minDim * clamp(0.145 + density * 0.045, 0.14, 0.26);
  const maxDistSq = maxDist * maxDist;
  const maxLinks = Math.floor(110 + density * 170);

  for (let i = 0; i < nodes.length; i++) {
    let local = 0;

    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dsq = dx * dx + dy * dy;

      if (dsq > maxDistSq) continue;

      const linkSeed = i * 31.9 + j * 7.7;
      const chance = seededNoise(linkSeed);
      const favored = a.major || b.major ? 0.28 : 0.5;

      if (chance < favored || local > 4) continue;

      const distanceStrength = 1 - Math.sqrt(dsq) / maxDist;
      links.push({
        a: i,
        b: j,
        strength: clamp(0.18 + distanceStrength * 0.82, 0.08, 1),
        seed: linkSeed,
        rate: 0.25 + seededNoise(linkSeed + 4.6) * 1.1,
        packet: seededNoise(linkSeed + 8.8) > 0.42,
        hot: seededNoise(linkSeed + 9.9) > 0.82,
      });

      local++;
      if (links.length >= maxLinks) break;
    }

    if (links.length >= maxLinks) break;
  }

  const contourCount = Math.floor(4 + density * 5);
  for (let i = 0; i < contourCount; i++) {
    const s = 300 + i * 24.41;
    contours.push({
      x: width * (0.16 + seededNoise(s) * 0.68),
      y: height * (0.15 + seededNoise(s + 5.5) * 0.7),
      r: minDim * (0.055 + seededNoise(s + 9.1) * 0.1),
      seed: s,
      colorPick: seededNoise(s + 11.3),
    });
  }

  return { nodes, links, contours };
}

export default function NeuralStarfieldCartogram({
  opacity = 0.68,
  density = 0.95,
  animationSpeed = 1.0,
  lineWidth = 1.0,
  nodeSize = 1.0,
  pulseStrength = 0.85,
  mapWarp = 0.72,
  gridIntensity = 0.42,
  primaryColor = '#eaffff',
  accentColor = '#00ffd0',
  tertiaryColor = '#ff4df8',
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const ctx3 = useThree();
  const size = ctx3 && ctx3.size ? ctx3.size : { width: 1920, height: 1080 };
  const effectiveW = Math.max(1, compositionWidth || size.width || 1920);
  const effectiveH = Math.max(1, compositionHeight || size.height || 1080);
  const aspect = effectiveW / effectiveH;

  const canvasWidth = aspect >= 1 ? 1280 : Math.max(360, Math.round(1280 * aspect));
  const canvasHeight = aspect >= 1 ? Math.max(360, Math.round(1280 / aspect)) : 1280;

  const meshRef = useRef(null);
  const mapRef = useRef({ nodes: [], links: [], contours: [] });

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

  useEffect(() => () => {
    try {
      texture && texture.dispose();
    } catch (_) {}
  }, [texture]);

  const material = useMemo(() => {
    if (!texture) return null;
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    });
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [texture]);

  useEffect(() => () => {
    try {
      material && material.dispose();
    } catch (_) {}
  }, [material]);

  useEffect(() => {
    if (!canvas) return;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      if (texture) texture.needsUpdate = true;
    }

    mapRef.current = buildMap(
      canvas.width,
      canvas.height,
      clamp(density, 0.2, 2.0)
    );
  }, [canvas, texture, canvasWidth, canvasHeight, density]);

  useFrame((state) => {
    if (!canvas || !texture || !material) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const time = ((state && state.clock ? state.clock.elapsedTime : 0) * Math.max(0, animationSpeed));

    const alpha = clamp01(opacity);
    const lw = Math.max(0.35, lineWidth);
    const warp = clamp(mapWarp, 0, 2);
    const pulse = clamp(pulseStrength, 0, 2);
    const dens = clamp(density, 0.2, 2.0);

    const colors = { primaryColor, accentColor, tertiaryColor };

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.font = `${Math.max(8, Math.round(width / 150))}px monospace`;
    ctx.globalCompositeOperation = 'lighter';

    drawWarpedGrid(ctx, width, height, time, colors, alpha, lw, dens, clamp(gridIntensity, 0, 1.5), warp);

    const map = mapRef.current;
    const nodePositions = new Array(map.nodes.length);

    for (let i = 0; i < map.contours.length; i++) {
      const c = map.contours[i];
      const col = c.colorPick > 0.72 ? tertiaryColor : c.colorPick > 0.42 ? accentColor : primaryColor;
      drawContour(ctx, c.x, c.y, c.r, time, col, alpha, lw, c.seed, warp);
    }

    for (let i = 0; i < map.nodes.length; i++) {
      nodePositions[i] = nodePosition(map.nodes[i], time, warp, width, height);
    }

    for (let i = 0; i < map.links.length; i++) {
      const l = map.links[i];
      drawLink(
        ctx,
        nodePositions[l.a],
        nodePositions[l.b],
        l,
        time,
        colors,
        alpha,
        lw,
        pulse,
        width,
        height
      );
    }

    for (let i = 0; i < map.nodes.length; i++) {
      drawNode(ctx, map.nodes[i], nodePositions[i], time, colors, alpha, lw, clamp(nodeSize, 0.35, 2.5));
    }

    drawCompass(ctx, width, height, time, colors, alpha, lw, pulse);

    const scanY = (time * 46) % height;
    const scanX = width - ((time * 31) % width);

    fillRect(ctx, 0, scanY, width, 1.2, accentColor, alpha * 0.09 * pulse);
    fillRect(ctx, scanX, 0, 1.2, height, tertiaryColor, alpha * 0.055 * pulse);

    const corner = Math.min(width, height) * 0.055;
    line(ctx, 18, 18, 18 + corner, 18, primaryColor, alpha * 0.28, lw);
    line(ctx, 18, 18, 18, 18 + corner, primaryColor, alpha * 0.28, lw);
    line(ctx, width - 18, 18, width - 18 - corner, 18, primaryColor, alpha * 0.28, lw);
    line(ctx, width - 18, 18, width - 18, 18 + corner, primaryColor, alpha * 0.28, lw);
    line(ctx, 18, height - 18, 18 + corner, height - 18, primaryColor, alpha * 0.22, lw);
    line(ctx, 18, height - 18, 18, height - 18 - corner, primaryColor, alpha * 0.22, lw);
    line(ctx, width - 18, height - 18, width - 18 - corner, height - 18, primaryColor, alpha * 0.22, lw);
    line(ctx, width - 18, height - 18, width - 18, height - 18 - corner, primaryColor, alpha * 0.22, lw);

    ctx.fillStyle = rgba(accentColor, alpha * 0.33);
    ctx.fillText(`NODES ${map.nodes.length}`, 26, height - 32);
    ctx.fillStyle = rgba(tertiaryColor, alpha * 0.28);
    ctx.fillText(`ROUTES ${map.links.length}`, 26, height - 18);

    ctx.globalCompositeOperation = 'source-over';

    texture.needsUpdate = true;
    material.opacity = alpha;
  });

  if (!texture || !material) return null;

  return React.createElement(
    'mesh',
    { ref: meshRef, renderOrder: 10030 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
