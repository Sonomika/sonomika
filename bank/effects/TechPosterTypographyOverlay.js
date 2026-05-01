const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Tech Poster Typography Overlay',
  description: 'Animated futuristic poster overlay with bold typography panels, wire objects, labels, arrows, grids, and editorial tech graphics.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'opacity', type: 'number', value: 0.76, min: 0, max: 1, step: 0.01 },
    { name: 'density', type: 'number', value: 0.88, min: 0.25, max: 1.5, step: 0.01 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0, max: 4, step: 0.01 },
    { name: 'posterScale', type: 'number', value: 1.0, min: 0.6, max: 1.6, step: 0.01 },
    { name: 'lineWidth', type: 'number', value: 1.2, min: 0.4, max: 4, step: 0.05 },
    { name: 'word', type: 'string', value: '////' },
    { name: 'textAmount', type: 'number', value: 0.82, min: 0, max: 1, step: 0.01 },
    { name: 'motion', type: 'number', value: 0.65, min: 0, max: 2, step: 0.01 },
    { name: 'flicker', type: 'number', value: 0.12, min: 0, max: 1, step: 0.01 },
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

function cleanWord(value) {
  const raw = String(value || '////').trim();
  const first = raw.split(/\s+/)[0] || '////';
  return first.slice(0, 64).toUpperCase();
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

function line(ctx, x1, y1, x2, y2, color, alpha, lw) {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawTextBlock(ctx, x, y, w, h, t, colors, alpha, seed, textAmount, displayWord) {
  const { primaryColor, accentColor } = colors;
  const word = cleanWord(displayWord);
  const size = Math.max(13, Math.min(h * 0.32, w / Math.max(4, word.length) * 1.35));
  ctx.save();
  ctx.font = `900 ${size}px Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = rgba(primaryColor, alpha * 0.9);
  ctx.fillText(word, x, y);

  const subSize = Math.max(7, size * 0.22);
  ctx.font = `700 ${subSize}px Arial, sans-serif`;
  ctx.fillStyle = rgba(accentColor, alpha * 0.62);
  ctx.fillText(word, x + 2, y + size * 0.9);

  const rows = Math.floor(4 + textAmount * 8);
  ctx.font = `${Math.max(6, subSize * 0.68)}px monospace`;
  ctx.fillStyle = rgba(primaryColor, alpha * 0.28);
  for (let i = 0; i < rows; i++) {
    const yy = y + size * 1.25 + i * subSize * 0.68;
    if (yy > y + h - 5) break;
    const repeat = `${word} `.repeat(12);
    const len = Math.floor(8 + seededNoise(seed + i) * 24);
    ctx.fillText(repeat.slice(0, Math.max(4, len)), x, yy);
  }

  const scan = ((t * 24 + seed * 3) % Math.max(1, h));
  fillRect(ctx, x, y + scan, w * 0.55, 1, accentColor, alpha * 0.22);
  ctx.restore();
}

function drawWireTorus(ctx, cx, cy, w, h, t, color, alpha, lw, seed) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.25 + seed) * 0.16);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  for (let i = 0; i < 11; i++) {
    const k = (i - 5) / 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.44, h * (0.12 + Math.abs(k) * 0.18), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + t * 0.08;
    line(ctx, Math.cos(a) * w * 0.42, Math.sin(a) * h * 0.12, Math.cos(a) * w * 0.18, Math.sin(a) * h * 0.42, color, alpha * 0.4, lw * 0.7);
  }
  ctx.restore();
}

function drawWirePyramid(ctx, x, y, w, h, t, color, accent, alpha, lw, seed) {
  const cx = x + w * 0.5;
  const top = y + h * 0.12;
  const baseY = y + h * 0.82;
  const drift = Math.sin(t * 0.45 + seed) * w * 0.04;
  const pts = [
    [cx + drift, top],
    [x + w * 0.16, baseY],
    [x + w * 0.84, baseY],
    [cx + w * 0.18, y + h * 0.68],
    [cx - w * 0.2, y + h * 0.66],
  ];
  for (let i = 1; i < pts.length; i++) line(ctx, pts[0][0], pts[0][1], pts[i][0], pts[i][1], color, alpha, lw);
  line(ctx, pts[1][0], pts[1][1], pts[2][0], pts[2][1], color, alpha, lw);
  line(ctx, pts[2][0], pts[2][1], pts[3][0], pts[3][1], color, alpha * 0.6, lw);
  line(ctx, pts[3][0], pts[3][1], pts[4][0], pts[4][1], color, alpha * 0.6, lw);
  line(ctx, pts[4][0], pts[4][1], pts[1][0], pts[1][1], color, alpha * 0.6, lw);
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    line(ctx, x + w * (0.2 + k * 0.6), baseY - k * h * 0.44, x + w * (0.8 - k * 0.5), baseY - k * h * 0.2, accent, alpha * 0.22, lw * 0.7);
  }
}

function drawPlanet(ctx, cx, cy, r, t, color, accent, alpha, lw, seed) {
  ctx.strokeStyle = rgba(color, alpha * 0.65);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.45 + Math.sin(t * 0.2 + seed) * 0.12);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.55, r * 0.32, 0, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(accent, alpha * 0.72);
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * (0.35 + i * 0.14), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(color, alpha * 0.16);
    ctx.stroke();
  }
}

function drawArrows(ctx, x, y, w, h, t, color, alpha, lw, seed) {
  const count = 3 + Math.floor(seededNoise(seed) * 5);
  const yy = y + h * (0.35 + seededNoise(seed + 2) * 0.3);
  for (let i = 0; i < count; i++) {
    const xx = x + w * (0.12 + i / count * 0.72) + Math.sin(t * 0.6 + i) * w * 0.015;
    line(ctx, xx, yy, xx + w * 0.07, yy, color, alpha, lw);
    line(ctx, xx + w * 0.07, yy, xx + w * 0.045, yy - h * 0.06, color, alpha, lw);
    line(ctx, xx + w * 0.07, yy, xx + w * 0.045, yy + h * 0.06, color, alpha, lw);
  }
}

function drawMiniGrid(ctx, x, y, w, h, t, colors, alpha, lw, seed) {
  const { primaryColor, accentColor, secondaryColor } = colors;
  const cols = 4 + Math.floor(seededNoise(seed) * 6);
  const rows = 3 + Math.floor(seededNoise(seed + 4) * 5);
  for (let yy = 0; yy < rows; yy++) {
    for (let xx = 0; xx < cols; xx++) {
      const on = seededNoise(seed + xx * 7.7 + yy * 12.1) > 0.42;
      const sweep = (Math.sin(t * 1.4 + xx * 0.65 + seed) + 1) * 0.5;
      const pulse = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.25 + xx + yy * 0.7 + seed));
      const rise = 0.45 + sweep * 0.55;
      fillRect(
        ctx,
        x + xx * (w / cols),
        y + yy * (h / rows) + (1 - rise) * (h / rows) * 0.35,
        Math.max(2, w / cols * 0.5),
        Math.max(2, h / rows * 0.18 + h / rows * 0.18 * rise),
        on ? accentColor : (yy % 2 ? secondaryColor : primaryColor),
        alpha * (on ? 0.38 * pulse : 0.13)
      );
    }
  }
}

function drawAnimatedChart(ctx, x, y, w, h, t, colors, alpha, lw, seed) {
  const { primaryColor, accentColor, secondaryColor } = colors;
  const bars = 14;
  const gap = Math.max(1, w * 0.012);
  const barW = (w - gap * (bars - 1)) / bars;

  strokeRect(ctx, x, y, w, h, primaryColor, alpha * 0.18, lw * 0.7);
  for (let i = 0; i < bars; i++) {
    const n = seededNoise(seed + i * 2.31);
    const v = 0.12 + 0.88 * Math.abs(Math.sin(t * (0.7 + n * 1.6) + i * 0.58 + seed));
    const bh = h * (0.15 + v * 0.78);
    fillRect(ctx, x + i * (barW + gap), y + h - bh, barW, bh, i % 3 === 0 ? accentColor : primaryColor, alpha * (0.18 + v * 0.36));
  }

  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const p = i / 64;
    const xx = x + p * w;
    const yy = y + h * 0.5
      + Math.sin(p * Math.PI * 4 + t * 1.8 + seed) * h * 0.2
      + Math.sin(p * Math.PI * 13 - t * 1.1) * h * 0.06;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.strokeStyle = rgba(secondaryColor, alpha * 0.56);
  ctx.lineWidth = lw;
  ctx.stroke();

  const scan = (t * 44 + seed * 9) % Math.max(1, w);
  fillRect(ctx, x + scan, y, Math.max(1, lw), h, accentColor, alpha * 0.18);
}

function drawCard(ctx, card, t, colors, opts) {
  const { x, y, w, h, type, seed } = card;
  const { primaryColor, accentColor, secondaryColor } = colors;
  const alpha = opts.alpha * (0.75 + seededNoise(seed) * 0.25);
  const lw = opts.lineWidth;

  strokeRect(ctx, x, y, w, h, primaryColor, alpha * 0.42, lw);
  fillRect(ctx, x + 6, y + 6, w * 0.24, 2, primaryColor, alpha * 0.36);
  fillRect(ctx, x + w - 22, y + 6, 12, 2, accentColor, alpha * 0.48);
  fillRect(ctx, x + 6, y + h - 9, w * 0.16, 2, secondaryColor, alpha * 0.28);

  if (type === 0) {
    drawTextBlock(ctx, x + 10, y + 10, w - 20, h - 20, t, colors, alpha, seed, opts.textAmount, opts.word);
  } else if (type === 1) {
    drawWireTorus(ctx, x + w * 0.5, y + h * 0.55, w * 0.76, h * 0.6, t, primaryColor, alpha * 0.68, lw, seed);
  } else if (type === 2) {
    drawWirePyramid(ctx, x + 8, y + 8, w - 16, h - 16, t, primaryColor, accentColor, alpha * 0.7, lw, seed);
  } else if (type === 3) {
    drawPlanet(ctx, x + w * 0.5, y + h * 0.52, Math.min(w, h) * 0.24, t, primaryColor, accentColor, alpha * 0.72, lw, seed);
  } else if (type === 4) {
    drawArrows(ctx, x + 8, y + 10, w - 16, h - 20, t, accentColor, alpha * 0.72, lw, seed);
    drawAnimatedChart(ctx, x + w * 0.12, y + h * 0.55, w * 0.76, h * 0.3, t, colors, alpha, lw, seed);
  } else {
    drawAnimatedChart(ctx, x + 10, y + 12, w - 20, h * 0.42, t, colors, alpha, lw, seed);
    drawTextBlock(ctx, x + 10, y + h * 0.58, w - 20, h * 0.34, t, colors, alpha * 0.72, seed + 4, opts.textAmount * 0.55, opts.word);
  }
}

function buildCards(width, height, density, scale) {
  const cards = [];
  const aspect = width / Math.max(1, height);
  const aspectRoot = Math.sqrt(Math.max(0.25, aspect));
  const cols = Math.max(3, Math.floor(5.6 * density * aspectRoot));
  const rows = Math.max(3, Math.floor(4.2 * density / aspectRoot));
  const margin = 20;
  const cellW = (width - margin * 2) / cols;
  const cellH = (height - margin * 2) / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const seed = row * 47.1 + col * 17.3 + cols * 3.9;
      if (seededNoise(seed) < 0.12 / density) continue;
      const spanX = seededNoise(seed + 2) > 0.84 && col < cols - 1 ? 2 : 1;
      const px = margin + col * cellW + 4;
      const py = margin + row * cellH + 4;
      const w = Math.min(cellW * spanX - 8, width - margin - px);
      const h = cellH - 8;
      if (w < 58 || h < 42) continue;
      cards.push({
        x: px,
        y: py,
        w: w * scale,
        h: h * scale,
        type: Math.floor(seededNoise(seed + 6) * 6),
        seed,
      });
    }
  }

  return cards;
}

export default function TechPosterTypographyOverlay({
  opacity = 0.76,
  density = 0.88,
  animationSpeed = 1.0,
  posterScale = 1.0,
  lineWidth = 1.2,
  word = '////',
  textAmount = 0.82,
  motion = 0.65,
  flicker = 0.12,
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

  const cardsRef = useRef([]);
  useEffect(() => {
    if (!canvas) return;
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      if (texture) texture.needsUpdate = true;
    }
    cardsRef.current = buildCards(canvas.width, canvas.height, clamp(density, 0.25, 1.5), clamp(posterScale, 0.6, 1.6));
  }, [canvas, texture, canvasWidth, canvasHeight, density, posterScale]);

  useFrame((state) => {
    if (!canvas || !texture || !material) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const t = (state && state.clock ? state.clock.elapsedTime : 0) * Math.max(0, animationSpeed);
    const alpha = clamp01(opacity) * (1 - clamp01(flicker) * 0.18 + seededNoise(Math.floor(t * 18)) * clamp01(flicker) * 0.18);
    const lw = Math.max(0.4, lineWidth);
    const colors = { primaryColor, accentColor, secondaryColor };
    const displayWord = cleanWord(word);
    const opts = {
      alpha,
      lineWidth: lw,
      textAmount: clamp01(textAmount),
      word: displayWord,
    };

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    strokeRect(ctx, 10, 10, width - 20, height - 20, primaryColor, alpha * 0.3, lw);
    strokeRect(ctx, 18, 18, width - 36, height - 36, primaryColor, alpha * 0.12, lw);

    const cards = cardsRef.current;
    for (let i = 0; i < cards.length; i++) {
      drawCard(ctx, cards[i], t * Math.max(0, motion), colors, opts);
    }

    const scanX = (t * 42 * Math.max(0, motion)) % width;
    const scanY = (t * 31 * Math.max(0, motion)) % height;
    fillRect(ctx, scanX, 0, 1.5, height, accentColor, alpha * 0.08);
    fillRect(ctx, 0, scanY, width, 1.5, secondaryColor, alpha * 0.08);

    ctx.font = `900 ${Math.max(12, Math.min(width, height) * 0.028)}px Arial, sans-serif`;
    ctx.fillStyle = rgba(primaryColor, alpha * 0.34);
    ctx.fillText(displayWord, width * 0.04, height - 30);
    ctx.fillStyle = rgba(accentColor, alpha * 0.28);
    ctx.fillText(displayWord, width * 0.34, height - 30);

    texture.needsUpdate = true;
    material.opacity = clamp01(opacity);
  });

  if (!texture || !material) return null;
  return React.createElement('mesh', { renderOrder: 10022 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
