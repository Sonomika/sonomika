const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Bio Scan Wireframe HUD Overlay',
  description: 'Animated biometric sci-fi overlay with wireframe body scans, geodesic diagrams, radar scopes, waveforms, and diagnostic panels.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'opacity', type: 'number', value: 0.74, min: 0, max: 1, step: 0.01 },
    { name: 'density', type: 'number', value: 0.82, min: 0.2, max: 1.5, step: 0.01 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0, max: 4, step: 0.01 },
    { name: 'scanSpeed', type: 'number', value: 1.0, min: 0, max: 4, step: 0.01 },
    { name: 'bodyCount', type: 'number', value: 2, min: 0, max: 3, step: 1 },
    { name: 'lineWidth', type: 'number', value: 1.0, min: 0.4, max: 3, step: 0.05 },
    { name: 'diagramScale', type: 'number', value: 1.0, min: 0.6, max: 1.5, step: 0.01 },
    { name: 'flicker', type: 'number', value: 0.14, min: 0, max: 1, step: 0.01 },
    { name: 'primaryColor', type: 'color', value: '#ffffff' },
    { name: 'accentColor', type: 'color', value: '#7df9ff' },
    { name: 'warningColor', type: 'color', value: '#8f7dff' },
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
  ctx.beginPath();
  for (let i = 0; i <= 128; i++) {
    const n = i / 128;
    const yy = y + h * 0.5
      + Math.sin(n * Math.PI * 8 + t * 1.6 + seed) * h * 0.24
      + Math.sin(n * Math.PI * 23 - t * 0.8 + seed) * h * 0.07;
    const xx = x + n * w;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawBody(ctx, cx, y, h, t, colors, alpha, lw, seed) {
  const { primaryColor, accentColor } = colors;
  const w = h * 0.26;
  const headR = h * 0.055;
  const neckY = y + h * 0.14;
  const torsoTop = y + h * 0.2;
  const hipY = y + h * 0.55;
  const footY = y + h * 0.98;

  ctx.strokeStyle = rgba(primaryColor, alpha);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.07, headR, 0, Math.PI * 2);
  ctx.stroke();

  const joints = [
    [cx, neckY],
    [cx - w * 0.38, torsoTop],
    [cx + w * 0.38, torsoTop],
    [cx - w * 0.28, hipY],
    [cx + w * 0.28, hipY],
    [cx, y + h * 0.36],
    [cx - w * 0.72, y + h * 0.34],
    [cx + w * 0.72, y + h * 0.34],
    [cx - w * 0.9, y + h * 0.52],
    [cx + w * 0.9, y + h * 0.52],
    [cx - w * 0.22, y + h * 0.76],
    [cx + w * 0.22, y + h * 0.76],
    [cx - w * 0.26, footY],
    [cx + w * 0.26, footY],
  ];

  const edges = [
    [0, 1], [0, 2], [1, 5], [2, 5], [1, 3], [2, 4], [3, 4],
    [1, 6], [6, 8], [2, 7], [7, 9], [3, 10], [10, 12], [4, 11], [11, 13],
    [5, 3], [5, 4], [6, 7], [10, 11],
  ];

  for (let i = 0; i < edges.length; i++) {
    const a = joints[edges[i][0]];
    const b = joints[edges[i][1]];
    line(ctx, a[0], a[1], b[0], b[1], primaryColor, alpha * 0.72, lw);
  }

  for (let i = 0; i < joints.length; i++) {
    const p = joints[i];
    ctx.beginPath();
    ctx.arc(p[0], p[1], Math.max(1.5, h * 0.007), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(accentColor, alpha * 0.62);
    ctx.stroke();
  }

  for (let i = 0; i < 38; i++) {
    const a = seededNoise(seed + i * 2.7);
    const b = seededNoise(seed + i * 6.1);
    const p1 = joints[Math.floor(a * joints.length) % joints.length];
    const p2 = joints[Math.floor(b * joints.length) % joints.length];
    if (p1 === p2) continue;
    line(ctx, p1[0], p1[1], p2[0], p2[1], primaryColor, alpha * 0.14, lw * 0.75);
  }

  const scanY = y + ((t * 0.22 + seededNoise(seed)) % 1) * h;
  fillRect(ctx, cx - w, scanY, w * 2, Math.max(1, h * 0.006), accentColor, alpha * 0.42);
}

function drawGeoSphere(ctx, cx, cy, r, t, colors, alpha, lw, seed) {
  const { primaryColor, accentColor } = colors;
  const points = [];
  const count = 14;

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + t * (0.05 + seededNoise(seed) * 0.07);
    const rr = r * (0.45 + seededNoise(seed + i * 4.1) * 0.52);
    points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }

  ctx.strokeStyle = rgba(primaryColor, alpha * 0.55);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (seededNoise(seed + i * 7.2 + j * 13.4) < 0.58) continue;
      line(ctx, points[i][0], points[i][1], points[j][0], points[j][1], primaryColor, alpha * 0.22, lw * 0.75);
    }
  }

  for (let i = 0; i < points.length; i++) {
    ctx.beginPath();
    ctx.arc(points[i][0], points[i][1], Math.max(1.2, r * 0.026), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(accentColor, alpha * 0.48);
    ctx.stroke();
  }
}

function drawRadar(ctx, cx, cy, r, t, colors, alpha, lw, seed) {
  const { primaryColor, accentColor } = colors;
  ctx.strokeStyle = rgba(primaryColor, alpha * 0.42);
  ctx.lineWidth = lw;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * i / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    line(ctx, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, primaryColor, alpha * 0.22, lw * 0.75);
  }
  const sweep = t * (0.65 + seededNoise(seed) * 0.28);
  line(ctx, cx, cy, cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r, accentColor, alpha * 0.82, lw * 1.2);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.54, sweep - 0.2, sweep);
  ctx.strokeStyle = rgba(accentColor, alpha * 0.4);
  ctx.stroke();
}

function drawDiagnosticPanel(ctx, x, y, w, h, t, colors, alpha, lw, seed) {
  const { primaryColor, accentColor, warningColor } = colors;
  strokeRect(ctx, x, y, w, h, primaryColor, alpha * 0.34, lw);
  fillRect(ctx, x + 5, y + 5, w * 0.22, 2, accentColor, alpha * 0.55);
  const kind = Math.floor(seededNoise(seed) * 4);

  if (kind === 0) {
    drawWave(ctx, x + 8, y + h * 0.18, w - 16, h * 0.62, t, primaryColor, alpha * 0.78, lw, seed);
  } else if (kind === 1) {
    const cx = x + w * 0.5;
    const cy = y + h * 0.56;
    drawRadar(ctx, cx, cy, Math.min(w, h) * 0.34, t, colors, alpha * 0.78, lw, seed);
  } else if (kind === 2) {
    const cols = 7;
    const rows = 5;
    for (let yy = 0; yy < rows; yy++) {
      for (let xx = 0; xx < cols; xx++) {
        const on = seededNoise(seed + xx * 4.2 + yy * 11.6) > 0.44;
        fillRect(ctx, x + 8 + xx * ((w - 16) / cols), y + 14 + yy * ((h - 24) / rows), Math.max(2, w / cols * 0.42), Math.max(2, h / rows * 0.3), on ? accentColor : primaryColor, alpha * (on ? 0.42 : 0.13));
      }
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const yy = y + 13 + i * ((h - 24) / 9);
      const len = (w - 18) * (0.2 + 0.75 * Math.abs(Math.sin(t * 0.5 + seed + i)));
      fillRect(ctx, x + 8, yy, len, 2, i % 3 === 0 ? warningColor : primaryColor, alpha * 0.36);
    }
  }
}

function buildPanels(width, height, density) {
  const panels = [];
  const aspect = width / Math.max(1, height);
  const aspectRoot = Math.sqrt(Math.max(0.25, aspect));
  const cols = Math.max(4, Math.floor(8 * density * aspectRoot));
  const rows = Math.max(3, Math.floor(5 * density / aspectRoot));
  const margin = 18;
  const cellW = (width - margin * 2) / cols;
  const cellH = (height - margin * 2) / rows;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const seed = x * 19.1 + y * 37.7 + rows;
      if (seededNoise(seed) < 0.24 / density) continue;
      const px = margin + x * cellW + 4;
      const py = margin + y * cellH + 4;
      const w = cellW - 8;
      const h = cellH - 8;
      if (w < 48 || h < 34) continue;
      panels.push({ x: px, y: py, w, h, seed });
    }
  }

  return panels;
}

export default function BioScanWireframeHUDOverlay({
  opacity = 0.74,
  density = 0.82,
  animationSpeed = 1.0,
  scanSpeed = 1.0,
  bodyCount = 2,
  lineWidth = 1.0,
  diagramScale = 1.0,
  flicker = 0.14,
  primaryColor = '#ffffff',
  accentColor = '#7df9ff',
  warningColor = '#8f7dff',
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

  const panelsRef = useRef([]);
  useEffect(() => {
    if (!canvas) return;
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      if (texture) texture.needsUpdate = true;
    }
    panelsRef.current = buildPanels(canvas.width, canvas.height, clamp(density, 0.2, 1.5));
  }, [canvas, texture, canvasWidth, canvasHeight, density]);

  useFrame((state) => {
    if (!canvas || !texture || !material) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const t = (state && state.clock ? state.clock.elapsedTime : 0) * Math.max(0, animationSpeed);
    const scanT = t * Math.max(0, scanSpeed);
    const alpha = clamp01(opacity) * (1 - clamp01(flicker) * 0.2 + seededNoise(Math.floor(t * 20)) * clamp01(flicker) * 0.2);
    const lw = Math.max(0.4, lineWidth);
    const colors = { primaryColor, accentColor, warningColor };

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.font = '10px monospace';

    strokeRect(ctx, 10, 10, width - 20, height - 20, primaryColor, alpha * 0.28, lw);
    strokeRect(ctx, 18, 18, width - 36, height - 36, primaryColor, alpha * 0.12, lw);

    const bodies = Math.max(0, Math.floor(bodyCount));
    for (let i = 0; i < bodies; i++) {
      const bx = bodies === 1 ? width * 0.5 : width * (0.23 + i * 0.33);
      const bh = height * (0.56 + (i % 2) * 0.08) * clamp(diagramScale, 0.6, 1.5);
      drawBody(ctx, bx, height * 0.16, bh, scanT, colors, alpha * 0.78, lw, 100 + i * 50);
    }

    const panels = panelsRef.current;
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const nearBody = p.x > width * 0.18 && p.x < width * 0.78 && p.y > height * 0.12 && p.y < height * 0.78;
      if (nearBody && seededNoise(p.seed) < 0.46) continue;
      drawDiagnosticPanel(ctx, p.x, p.y, p.w, p.h, scanT, colors, alpha * 0.82, lw, p.seed);
    }

    const sphereCount = Math.max(4, Math.floor(7 * clamp(density, 0.2, 1.5)));
    for (let i = 0; i < sphereCount; i++) {
      const nx = seededNoise(300 + i * 9.1);
      const ny = seededNoise(380 + i * 7.4);
      const x = width * (0.08 + nx * 0.84);
      const y = height * (0.08 + ny * 0.84);
      const r = Math.min(width, height) * (0.035 + seededNoise(440 + i) * 0.055) * clamp(diagramScale, 0.6, 1.5);
      drawGeoSphere(ctx, x, y, r, scanT, colors, alpha * 0.42, lw, 500 + i * 11);
    }

    drawRadar(ctx, width * 0.82, height * 0.34, Math.min(width, height) * 0.13, scanT, colors, alpha * 0.58, lw, 20);
    drawRadar(ctx, width * 0.73, height * 0.69, Math.min(width, height) * 0.1, -scanT * 0.8, colors, alpha * 0.42, lw, 42);
    drawWave(ctx, width * 0.04, height * 0.84, width * 0.22, height * 0.08, scanT, primaryColor, alpha * 0.64, lw, 13);
    drawWave(ctx, width * 0.63, height * 0.18, width * 0.22, height * 0.07, -scanT * 1.2, primaryColor, alpha * 0.58, lw, 17);

    const scanY = (scanT * 72) % height;
    fillRect(ctx, 0, scanY, width, 1.5, accentColor, alpha * 0.14);
    fillRect(ctx, 0, (scanY + height * 0.5) % height, width, 1, warningColor, alpha * 0.08);

    texture.needsUpdate = true;
    material.opacity = clamp01(opacity);
  });

  if (!texture || !material) return null;
  return React.createElement('mesh', { renderOrder: 10021 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
