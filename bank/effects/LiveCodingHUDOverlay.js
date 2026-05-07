const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Live Coding HUD Overlay',
  description: 'Transparent terminal-style HUD overlay with animated live coding, cursor pulses, scanlines, compile panels, and glitch accents.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'opacity', type: 'number', value: 0.82, min: 0, max: 1, step: 0.01 },
    { name: 'codeScale', type: 'number', value: 1.0, min: 0.55, max: 1.8, step: 0.01 },
    { name: 'typingSpeed', type: 'number', value: 1.0, min: 0, max: 4, step: 0.01 },
    { name: 'scrollSpeed', type: 'number', value: 0.62, min: 0, max: 3, step: 0.01 },
    { name: 'density', type: 'number', value: 0.88, min: 0.2, max: 1.4, step: 0.01 },
    { name: 'jitter', type: 'number', value: 0.18, min: 0, max: 1, step: 0.01 },
    { name: 'scanlines', type: 'number', value: 0.48, min: 0, max: 1, step: 0.01 },
    { name: 'lineWidth', type: 'number', value: 1.0, min: 0.4, max: 3, step: 0.05 },
    { name: 'primaryColor', type: 'color', value: '#7df9ff' },
    { name: 'accentColor', type: 'color', value: '#ffffff' },
    { name: 'warningColor', type: 'color', value: '#8f7dff' },
  ],
};

const CODE_LINES = [
  '#include <iostream>',
  '#include <vector>',
  '#include <cmath>',
  'using namespace std;',
  '',
  'struct FrameBuffer {',
  '  int width;',
  '  int height;',
  '  vector<float> pixels;',
  '};',
  '',
  'float hash12(vec2 p) {',
  '  float h = dot(p, vec2(127.1, 311.7));',
  '  return fract(sin(h) * 43758.5453);',
  '}',
  '',
  'void renderScanline(FrameBuffer& fb, float time) {',
  '  for (int y = 0; y < fb.height; ++y) {',
  '    for (int x = 0; x < fb.width; ++x) {',
  '      float uvx = float(x) / float(fb.width);',
  '      float uvy = float(y) / float(fb.height);',
  '      float pulse = sin(uvy * 80.0 - time * 7.0);',
  '      float edge = smoothstep(0.45, 0.5, abs(uvx - 0.5));',
  '      fb.pixels[y * fb.width + x] = pulse * edge;',
  '    }',
  '  }',
  '}',
  '',
  'for (int i = 0; i < agents.size(); ++i) {',
  '  agents[i].velocity += curlNoise(agents[i].position);',
  '  agents[i].position += agents[i].velocity * deltaTime;',
  '  if (agents[i].position.x > bounds.x) agents[i].position.x = 0.0;',
  '}',
  '',
  'if (fft.energy > threshold) {',
  '  camera.glitchAmount = 0.35;',
  '  shader.uniforms.uBloom.value += 0.08;',
  '  dispatchMidiNote(channel, root + 7);',
  '}',
  '',
  'mat4 model = translate(pos) * rotateZ(phase) * scale(size);',
  'vec3 color = mix(cyan, violet, noise(position.xy + time));',
  'gl_FragColor = vec4(color * mask, alpha);',
  '',
  'compileStatus = "OK";',
  'frameCount++;',
  'swap(frontBuffer, backBuffer);',
];

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

function drawText(ctx, text, x, y, color, alpha) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillText(text, x, y);
}

function drawCodeWindow(ctx, x, y, w, h, t, opts) {
  const { primaryColor, accentColor, warningColor, alpha, lw, codeScale, typingSpeed, scrollSpeed, jitter } = opts;
  const fontSize = Math.max(9, Math.floor(13 * codeScale));
  const lineH = Math.max(12, Math.floor(fontSize * 1.45));
  const pad = Math.max(8, Math.floor(12 * codeScale));
  const visibleRows = Math.max(4, Math.floor((h - pad * 2 - 20) / lineH));
  const totalLines = CODE_LINES.length;
  const scroll = (t * 4.0 * scrollSpeed) % totalLines;
  const start = Math.floor(scroll);
  const sub = scroll - start;
  const typedChars = Math.floor((t * 24 * typingSpeed) % 44);
  const cursorOn = Math.floor(t * 3.8) % 2 === 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  fillRect(ctx, x, y, w, h, '#000000', alpha * 0.22);
  strokeRect(ctx, x, y, w, h, primaryColor, alpha * 0.34, lw);
  fillRect(ctx, x, y, w, 2, primaryColor, alpha * 0.24);
  fillRect(ctx, x + pad, y + 9, w * 0.18, 2, accentColor, alpha * 0.58);
  drawText(ctx, 'LIVE_PATCH.cpp', x + pad, y + fontSize + 10, accentColor, alpha * 0.76);
  drawText(ctx, `FPS ${String(58 + Math.floor(seededNoise(Math.floor(t * 7)) * 5)).padStart(2, '0')}  BUILD:STREAM`, x + w - pad - 150, y + fontSize + 10, primaryColor, alpha * 0.48);

  ctx.font = `${fontSize}px Consolas, Monaco, monospace`;
  ctx.textBaseline = 'top';

  for (let i = 0; i < visibleRows + 2; i++) {
    const lineIdx = (start + i) % totalLines;
    const line = CODE_LINES[lineIdx] || '';
    const yy = y + pad + 22 + (i - sub) * lineH;
    const rowAlpha = alpha * (0.26 + 0.58 * (1 - Math.abs((i - visibleRows * 0.48) / visibleRows)));
    const lineNo = String(lineIdx + 1).padStart(3, '0');
    const isActive = i === Math.floor(visibleRows * 0.55);
    const color = /if|for|while|return|struct|void|float|vec|mat/.test(line) ? accentColor : primaryColor;
    const dx = (seededNoise(lineIdx * 11 + Math.floor(t * 18)) - 0.5) * jitter * 5;

    if (isActive) fillRect(ctx, x + pad - 5, yy - 2, w - pad * 2 + 10, lineH, primaryColor, alpha * 0.055);
    drawText(ctx, lineNo, x + pad + dx, yy, warningColor, rowAlpha * 0.46);

    const visibleText = isActive && typingSpeed > 0
      ? line.slice(0, Math.min(line.length, Math.max(1, typedChars)))
      : line;
    drawText(ctx, visibleText, x + pad + 42 + dx, yy, color, isActive ? alpha * 0.94 : rowAlpha);

    if (isActive && cursorOn) {
      const cursorX = x + pad + 42 + ctx.measureText(visibleText).width + 3 + dx;
      fillRect(ctx, cursorX, yy + 1, Math.max(2, fontSize * 0.12), lineH - 3, accentColor, alpha * 0.9);
    }
  }

  const compileY = y + h - pad - 13;
  drawText(ctx, '> compiling shader graph ... OK', x + pad, compileY, accentColor, alpha * 0.64);
  fillRect(ctx, x + w - pad - w * 0.28, compileY + 4, w * 0.25, 3, primaryColor, alpha * 0.18);
  fillRect(ctx, x + w - pad - w * 0.28, compileY + 4, w * 0.25 * (0.45 + 0.5 * Math.abs(Math.sin(t * 1.7))), 3, accentColor, alpha * 0.5);

  ctx.restore();
}

function drawMiniPanel(ctx, x, y, w, h, t, opts, seed) {
  const { primaryColor, accentColor, warningColor, alpha, lw } = opts;
  strokeRect(ctx, x, y, w, h, primaryColor, alpha * 0.28, lw);
  fillRect(ctx, x + 5, y + 5, w * 0.2, 2, accentColor, alpha * 0.5);
  ctx.font = '10px Consolas, Monaco, monospace';
  ctx.textBaseline = 'top';
  const label = seededNoise(seed) > 0.5 ? 'OSC IN' : 'MEMORY';
  drawText(ctx, label, x + 8, y + 12, accentColor, alpha * 0.55);

  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const yy = y + 28 + i * ((h - 38) / rows);
    const len = (w - 16) * (0.12 + 0.78 * Math.abs(Math.sin(t * (0.32 + seededNoise(seed + i)) + i)));
    fillRect(ctx, x + 8, yy, len, 2, i % 3 === 0 ? warningColor : primaryColor, alpha * 0.34);
  }
}

function drawScanlines(ctx, width, height, t, color, alpha, scanlines) {
  const amount = clamp01(scanlines);
  if (amount <= 0) return;
  for (let y = 0; y < height; y += 4) {
    fillRect(ctx, 0, y, width, 1, color, alpha * amount * 0.045);
  }
  const scanY = (t * 90) % height;
  fillRect(ctx, 0, scanY, width, 1.5, color, alpha * amount * 0.18);
}

export default function LiveCodingHUDOverlay({
  opacity = 0.82,
  codeScale = 1.0,
  typingSpeed = 1.0,
  scrollSpeed = 0.62,
  density = 0.88,
  jitter = 0.18,
  scanlines = 0.48,
  lineWidth = 1.0,
  primaryColor = '#7df9ff',
  accentColor = '#ffffff',
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

  const panelSeedsRef = useRef([]);
  useEffect(() => {
    if (!canvas) return;
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      if (texture) texture.needsUpdate = true;
    }
    const count = Math.max(2, Math.floor(7 * clamp(density, 0.2, 1.4)));
    panelSeedsRef.current = Array.from({ length: count }, (_, i) => i * 19.7 + 11);
  }, [canvas, texture, canvasWidth, canvasHeight, density]);

  useFrame((state) => {
    if (!canvas || !texture || !material) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const t = state && state.clock ? state.clock.elapsedTime : 0;
    const alpha = clamp01(opacity) * (0.86 + seededNoise(Math.floor(t * 18)) * 0.14);
    const lw = Math.max(0.4, lineWidth);
    const opts = {
      primaryColor,
      accentColor,
      warningColor,
      alpha,
      lw,
      codeScale: clamp(codeScale, 0.55, 1.8),
      typingSpeed: Math.max(0, typingSpeed),
      scrollSpeed: Math.max(0, scrollSpeed),
      jitter: clamp01(jitter),
    };

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.font = '10px Consolas, Monaco, monospace';

    strokeRect(ctx, 10, 10, width - 20, height - 20, primaryColor, alpha * 0.2, lw);
    strokeRect(ctx, 18, 18, width - 36, height - 36, accentColor, alpha * 0.09, lw);

    const mainW = width * (aspect > 1.35 ? 0.56 : 0.78);
    const mainH = height * 0.72;
    const mainX = width * (aspect > 1.35 ? 0.07 : 0.11);
    const mainY = height * 0.12;
    drawCodeWindow(ctx, mainX, mainY, mainW, mainH, t, opts);

    const seeds = panelSeedsRef.current || [];
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const side = i % 2;
      const w = width * (0.13 + seededNoise(s) * 0.09);
      const h = height * (0.08 + seededNoise(s + 1) * 0.08);
      const x = side ? width - w - width * 0.045 : width * (0.04 + seededNoise(s + 2) * 0.14);
      const y = height * (0.08 + seededNoise(s + 3) * 0.76);
      const overlapsMain = x < mainX + mainW && x + w > mainX && y < mainY + mainH && y + h > mainY;
      if (overlapsMain && seededNoise(s + 5) < 0.72) continue;
      drawMiniPanel(ctx, x, y, w, h, t, opts, s);
    }

    const glitchCount = Math.floor(3 + density * 7);
    for (let i = 0; i < glitchCount; i++) {
      if (seededNoise(Math.floor(t * 11) + i * 5.7) < 0.45) continue;
      const gx = width * seededNoise(i * 31.1 + Math.floor(t * 5));
      const gy = height * seededNoise(i * 17.4 + Math.floor(t * 8));
      const gw = width * (0.03 + seededNoise(i + 9) * 0.12);
      fillRect(ctx, gx, gy, gw, 1 + seededNoise(i + 10) * 3, i % 2 ? warningColor : primaryColor, alpha * 0.18);
    }

    drawScanlines(ctx, width, height, t, primaryColor, alpha, scanlines);

    texture.needsUpdate = true;
    material.opacity = clamp01(opacity);
  });

  if (!texture || !material) return null;
  return React.createElement('mesh', { renderOrder: 10024 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
