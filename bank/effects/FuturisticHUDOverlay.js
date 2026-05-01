const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Futuristic HUD Overlay',
  description: 'Animated quasi-futuristic interface overlay with modular panels, waveforms, meters, rings, grids, and scanning UI detail.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'opacity', type: 'number', value: 0.72, min: 0, max: 1, step: 0.01 },
    { name: 'density', type: 'number', value: 0.78, min: 0.15, max: 1.5, step: 0.01 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0, max: 4, step: 0.01 },
    { name: 'panelScale', type: 'number', value: 1.0, min: 0.6, max: 1.6, step: 0.01 },
    { name: 'lineWidth', type: 'number', value: 1.0, min: 0.4, max: 3, step: 0.05 },
    { name: 'flicker', type: 'number', value: 0.18, min: 0, max: 1, step: 0.01 },
    { name: 'scanGlow', type: 'number', value: 0.45, min: 0, max: 2, step: 0.01 },
    { name: 'primaryColor', type: 'color', value: '#ffffff' },
    { name: 'accentColor', type: 'color', value: '#7df9ff' },
    { name: 'secondaryColor', type: 'color', value: '#8f7dff' },
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

function strokeRect(ctx, x, y, w, h, color, alpha, lw) {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

function fillRect(ctx, x, y, w, h, color, alpha) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillRect(x, y, w, h);
}

function drawWave(ctx, x, y, w, h, t, color, alpha, lw, seed) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const n = i / 96;
    const yy = y + h * 0.5
      + Math.sin(n * Math.PI * 6 + t * 1.4 + seed) * h * 0.22
      + Math.sin(n * Math.PI * 17 - t * 0.9 + seed * 2.1) * h * 0.08;
    const xx = x + n * w;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

function drawBars(ctx, x, y, w, h, t, color, alpha, count, seed) {
  const gap = 2;
  const barW = Math.max(1, (w - gap * (count - 1)) / count);
  for (let i = 0; i < count; i++) {
    const n = seededNoise(seed + i * 3.17);
    const v = 0.12 + 0.88 * Math.abs(Math.sin(t * (0.55 + n) + i * 0.63 + seed));
    const bh = h * v;
    fillRect(ctx, x + i * (barW + gap), y + h - bh, barW, bh, color, alpha * (0.45 + v * 0.55));
  }
}

function drawRing(ctx, x, y, r, t, color, accent, alpha, lw, seed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * (0.12 + seededNoise(seed) * 0.24));
  ctx.strokeStyle = rgba(color, alpha * 0.55);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI * 0.5 + seed;
    ctx.strokeStyle = rgba(accent, alpha * (0.55 + i * 0.08));
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.72 + i * 0.08), a + t * 0.7, a + t * 0.7 + Math.PI * 0.35);
    ctx.stroke();
  }

  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const inner = r * 0.88;
    const outer = r * (0.94 + (i % 3) * 0.03);
    ctx.strokeStyle = rgba(color, alpha * 0.32);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPanel(ctx, panel, t, colors, opts) {
  const { x, y, w, h, type, seed } = panel;
  const { primaryColor, accentColor, secondaryColor } = colors;
  const alpha = opts.baseAlpha * (0.72 + seededNoise(seed) * 0.28);
  const lw = opts.lineWidth;

  strokeRect(ctx, x, y, w, h, primaryColor, alpha * 0.38, lw);
  fillRect(ctx, x, y, w, 2, primaryColor, alpha * 0.22);
  fillRect(ctx, x + 5, y + 5, Math.max(8, w * 0.18), 2, accentColor, alpha * 0.6);

  if (type === 0) {
    drawWave(ctx, x + 8, y + h * 0.2, w - 16, h * 0.52, t, primaryColor, alpha * 0.9, lw, seed);
    drawWave(ctx, x + 8, y + h * 0.25, w - 16, h * 0.42, -t * 0.7, accentColor, alpha * 0.45, lw, seed + 9);
  } else if (type === 1) {
    drawBars(ctx, x + 8, y + 12, w - 16, h - 20, t, primaryColor, alpha, 12 + Math.floor(seededNoise(seed) * 12), seed);
  } else if (type === 2) {
    const cx = x + w * 0.5;
    const cy = y + h * 0.54;
    drawRing(ctx, cx, cy, Math.min(w, h) * 0.33, t, primaryColor, accentColor, alpha, lw, seed);
  } else if (type === 3) {
    const cols = 5 + Math.floor(seededNoise(seed) * 5);
    const rows = 3 + Math.floor(seededNoise(seed + 5) * 5);
    for (let yy = 0; yy < rows; yy++) {
      for (let xx = 0; xx < cols; xx++) {
        const hit = seededNoise(seed + xx * 8 + yy * 19) > 0.38;
        const px = x + 8 + xx * ((w - 16) / cols);
        const py = y + 13 + yy * ((h - 22) / rows);
        fillRect(ctx, px, py, Math.max(2, (w - 24) / cols * 0.55), Math.max(2, (h - 28) / rows * 0.36), hit ? accentColor : primaryColor, alpha * (hit ? 0.5 : 0.18));
      }
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const yy = y + 14 + i * ((h - 24) / 6);
      const len = (w - 16) * (0.25 + 0.7 * Math.abs(Math.sin(t * 0.4 + seed + i)));
      fillRect(ctx, x + 8, yy, len, 2, i % 2 ? secondaryColor : primaryColor, alpha * 0.42);
      fillRect(ctx, x + w - 18, yy - 2, 10, 5, accentColor, alpha * 0.28);
    }
  }
}

function buildPanels(width, height, density, scale) {
  const panels = [];
  const aspect = width / Math.max(1, height);
  const aspectRoot = Math.sqrt(Math.max(0.2, aspect));
  const cols = Math.max(3, Math.floor(7 * density * aspectRoot));
  const rows = Math.max(3, Math.floor(5.5 * density / aspectRoot));
  const margin = 24;
  const cellW = (width - margin * 2) / cols;
  const cellH = (height - margin * 2) / rows;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const seed = x * 13.3 + y * 41.7 + cols * 2.1;
      if (seededNoise(seed) < 0.18 / density) continue;
      const spanX = seededNoise(seed + 1) > 0.82 ? 2 : 1;
      const spanY = seededNoise(seed + 2) > 0.88 ? 2 : 1;
      const px = margin + x * cellW + 4;
      const py = margin + y * cellH + 4;
      const w = Math.min(cellW * spanX - 8, width - margin - px);
      const h = Math.min(cellH * spanY - 8, height - margin - py);
      if (w < 42 || h < 28) continue;
      panels.push({
        x: px,
        y: py,
        w: w * scale,
        h: h * scale,
        type: Math.floor(seededNoise(seed + 3) * 5),
        seed,
      });
    }
  }

  return panels;
}

export default function FuturisticHUDOverlay({
  opacity = 0.72,
  density = 0.78,
  animationSpeed = 1.0,
  panelScale = 1.0,
  lineWidth = 1.0,
  flicker = 0.18,
  scanGlow = 0.45,
  primaryColor = '#ffffff',
  accentColor = '#7df9ff',
  secondaryColor = '#8f7dff',
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
  const meshRef = useRef(null);
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
  useEffect(() => () => { try { texture && texture.dispose(); } catch (_) {} }, [texture]);

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
  useEffect(() => () => { try { material && material.dispose(); } catch (_) {} }, [material]);

  const panelsRef = useRef([]);
  useEffect(() => {
    if (!canvas) return;
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      if (texture) texture.needsUpdate = true;
    }
    panelsRef.current = buildPanels(canvas.width, canvas.height, clamp(density, 0.15, 1.5), clamp(panelScale, 0.6, 1.6));
  }, [canvas, texture, canvasWidth, canvasHeight, density, panelScale]);

  useFrame((state) => {
    if (!canvas || !texture || !material) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const time = ((state && state.clock ? state.clock.elapsedTime : 0) * Math.max(0, animationSpeed));
    const flick = 1 - clamp01(flicker) * 0.25 + seededNoise(Math.floor(time * 18)) * clamp01(flicker) * 0.25;
    const baseAlpha = clamp01(opacity) * flick;

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.font = '10px monospace';

    const lw = Math.max(0.4, lineWidth);
    const colors = { primaryColor, accentColor, secondaryColor };
    const opts = { baseAlpha, lineWidth: lw };

    strokeRect(ctx, 10, 10, width - 20, height - 20, primaryColor, baseAlpha * 0.3, lw);
    strokeRect(ctx, 18, 18, width - 36, height - 36, primaryColor, baseAlpha * 0.16, lw);

    for (let x = 28; x < width - 28; x += 32) {
      fillRect(ctx, x, 14, 14, 1, primaryColor, baseAlpha * 0.28);
      fillRect(ctx, x, height - 15, 14, 1, primaryColor, baseAlpha * 0.2);
    }
    for (let y = 32; y < height - 32; y += 32) {
      fillRect(ctx, 14, y, 1, 12, primaryColor, baseAlpha * 0.2);
      fillRect(ctx, width - 15, y, 1, 12, primaryColor, baseAlpha * 0.2);
    }

    const panels = panelsRef.current;
    for (let i = 0; i < panels.length; i++) {
      drawPanel(ctx, panels[i], time, colors, opts);
    }

    const scanY = (time * 58) % height;
    const scanX = (time * 41) % width;
    fillRect(ctx, 0, scanY, width, 1.5, accentColor, baseAlpha * scanGlow * 0.16);
    fillRect(ctx, scanX, 0, 1.5, height, accentColor, baseAlpha * scanGlow * 0.11);

    const cx = width * 0.5;
    const cy = height * 0.52;
    drawRing(ctx, cx, cy, Math.min(width, height) * 0.09, time * 0.65, primaryColor, accentColor, baseAlpha * 0.58, lw, 77);
    drawWave(ctx, width * 0.04, height * 0.88, width * 0.18, height * 0.07, time * 1.7, primaryColor, baseAlpha * 0.7, lw, 100);
    drawBars(ctx, width * 0.78, height * 0.78, width * 0.16, height * 0.12, time, primaryColor, baseAlpha * 0.72, 18, 201);

    texture.needsUpdate = true;
    material.opacity = clamp01(opacity);
  });

  if (!texture || !material) return null;
  return React.createElement('mesh', { ref: meshRef, renderOrder: 10020 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
