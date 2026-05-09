// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'OSC Input HUD',
  description: 'Transparent HUD overlay showing recent incoming OSC addresses, values, pulse activity, and packet rate.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'hudOpacity', type: 'number', value: 0.86, min: 0, max: 1, step: 0.01, description: 'HUD Opacity' },
    { name: 'maxRows', type: 'number', value: 12, min: 3, max: 28, step: 1, description: 'Rows' },
    { name: 'panelWidth', type: 'number', value: 0.56, min: 0.25, max: 0.95, step: 0.01, description: 'Panel Width' },
    { name: 'panelHeight', type: 'number', value: 0.58, min: 0.22, max: 0.95, step: 0.01, description: 'Panel Height' },
    { name: 'fontScale', type: 'number', value: 1.0, min: 0.55, max: 2.2, step: 0.01, description: 'Font Scale' },
    { name: 'decaySeconds', type: 'number', value: 5.0, min: 0.5, max: 20, step: 0.1, description: 'Fade Time' },
    { name: 'showValues', type: 'boolean', value: true, description: 'Show Values' },
    { name: 'primaryColor', type: 'color', value: '#8fffff' },
    { name: 'accentColor', type: 'color', value: '#ffffff' },
    { name: 'alertColor', type: 'color', value: '#8cff00' },
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

function formatArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return 'no value';
  return args
    .slice(0, 4)
    .map((arg) => {
      if (typeof arg === 'number') {
        const abs = Math.abs(arg);
        return abs >= 100 ? String(Math.round(arg)) : String(Math.round(arg * 1000) / 1000);
      }
      if (typeof arg === 'boolean') return arg ? 'true' : 'false';
      if (arg == null) return 'null';
      return String(arg);
    })
    .join(', ');
}

function drawCorner(ctx, x, y, w, h, color, alpha, lw) {
  const s = Math.min(w, h) * 0.09;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x, y + s); ctx.lineTo(x, y); ctx.lineTo(x + s, y);
  ctx.moveTo(x + w - s, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + s);
  ctx.moveTo(x + w, y + h - s); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - s, y + h);
  ctx.moveTo(x + s, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - s);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export default function OSCInputHUD({
  hudOpacity = 0.86,
  maxRows = 12,
  panelWidth = 0.56,
  panelHeight = 0.58,
  fontScale = 1.0,
  decaySeconds = 5.0,
  showValues = true,
  primaryColor = '#8fffff',
  accentColor = '#ffffff',
  alertColor = '#8cff00',
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
      opacity: hudOpacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [texture]);

  const stateRef = useRef({
    messages: [],
    packetTimes: [],
    pulse: 0,
    lastAddress: '',
  });

  useEffect(() => {
    const win = globalThis.window;
    if (!win) return;
    try {
      const history = Array.isArray(win.__vj_osc_history__) ? win.__vj_osc_history__ : [];
      const messages = history.slice(0, 64).map((item) => ({
        address: String(item.address || ''),
        args: Array.isArray(item.args) ? item.args : [],
        timestamp: Number(item.timestamp || Date.now()),
      }));
      stateRef.current.messages = messages.filter((message) => message.address);
      stateRef.current.packetTimes = messages.map((item) => item.timestamp);
      stateRef.current.lastAddress = messages[0]?.address || '';
    } catch {}

    const onOsc = (event) => {
      const detail = event && event.detail ? event.detail : {};
      const message = {
        address: String(detail.address || ''),
        args: Array.isArray(detail.args) ? detail.args : [],
        timestamp: Number(detail.timestamp || Date.now()),
      };
      if (!message.address) return;
      const state = stateRef.current;
      const previous = state.messages[0];
      const exactRepeat = previous
        && previous.address === message.address
        && formatArgs(previous.args) === formatArgs(message.args)
        && message.timestamp - previous.timestamp < 45;
      if (exactRepeat) {
        previous.timestamp = message.timestamp;
        previous.count = (previous.count || 1) + 1;
      } else {
        state.messages.unshift({ ...message, count: 1 });
        state.messages = state.messages.slice(0, 96);
      }
      state.packetTimes.unshift(message.timestamp);
      state.packetTimes = state.packetTimes.filter((time) => message.timestamp - time < 5000).slice(0, 128);
      state.pulse = 1;
      state.lastAddress = message.address;
    };

    win.addEventListener('vj:osc-message', onOsc);
    return () => {
      win.removeEventListener('vj:osc-message', onOsc);
    };
  }, []);

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

  useFrame((_frameState, delta) => {
    if (!canvas || !texture || !material) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = clamp(delta || 0.016, 0, 0.08);
    const width = canvas.width;
    const height = canvas.height;
    const opacity = clamp01(Number(hudOpacity) || 0);
    const state = stateRef.current;
    const now = Date.now();
    const fadeMs = Math.max(0.5, Number(decaySeconds) || 5) * 1000;
    const rows = Math.max(3, Math.floor(Number(maxRows) || 12));
    const font = Math.max(9, Math.round(13 * (Number(fontScale) || 1)));
    const lineH = Math.max(font + 4, Math.round(font * 1.55));
    const pW = width * clamp(Number(panelWidth) || 0.56, 0.25, 0.95);
    const pH = height * clamp(Number(panelHeight) || 0.58, 0.22, 0.95);
    const x = width * 0.04;
    const y = height * 0.08;
    const pad = Math.max(10, Math.round(font * 1.15));

    state.pulse = Math.max(0, state.pulse - dt * 5.5);
    state.messages = state.messages.filter((message, index) => now - message.timestamp < fadeMs || index < rows);
    state.packetTimes = state.packetTimes.filter((time) => now - time < 5000);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = rgba('#000000', opacity * 0.28, '#000000');
    ctx.fillRect(x, y, pW, pH);
    ctx.strokeStyle = rgba(primaryColor, opacity * (0.4 + state.pulse * 0.45), '#8fffff');
    ctx.lineWidth = Math.max(1, font * 0.08);
    ctx.strokeRect(x, y, pW, pH);
    drawCorner(ctx, x - 6, y - 6, pW + 12, pH + 12, rgba(accentColor, 1, '#ffffff'), opacity * (0.42 + state.pulse * 0.42), Math.max(1, font * 0.1));

    ctx.font = `${font}px Consolas, Monaco, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(accentColor, opacity * 0.92, '#ffffff');
    ctx.fillText('OSC INPUT HUD', x + pad, y + pad);
    ctx.fillStyle = rgba(primaryColor, opacity * 0.52, '#8fffff');
    const historyCount = state.messages.length;
    ctx.fillText(`HIST ${String(historyCount).padStart(2, '0')}  PKT ${String(state.packetTimes.length).padStart(3, '0')}`, x + pW - pad - font * 15, y + pad);

    const meterX = x + pad;
    const meterY = y + pad + font + 10;
    const meterW = pW - pad * 2;
    const meterH = Math.max(5, font * 0.45);
    ctx.fillStyle = rgba(primaryColor, opacity * 0.12, '#8fffff');
    ctx.fillRect(meterX, meterY, meterW, meterH);
    ctx.fillStyle = rgba(alertColor, opacity * (0.32 + state.pulse * 0.65), '#8cff00');
    ctx.fillRect(meterX, meterY, meterW * clamp01(state.packetTimes.length / 40), meterH);

    ctx.fillStyle = rgba(primaryColor, opacity * 0.38, '#8fffff');
    ctx.fillText('ADDRESS', x + pad, meterY + meterH + 10);
    if (showValues) {
      ctx.fillText('VALUE', x + pW * 0.68, meterY + meterH + 10);
    }

    const startY = meterY + meterH + 10 + lineH;
    const visible = state.messages.slice(0, rows);
    visible.forEach((message, index) => {
      const age = now - message.timestamp;
      const fresh = clamp01(1 - age / fadeMs);
      const flash = message.address === state.lastAddress ? state.pulse : 0;
      const rowY = startY + index * lineH;
      const rowAlpha = opacity * clamp(0.18 + fresh * 0.74 + flash * 0.2, 0.08, 1);
      const color = message.address === state.lastAddress ? alertColor : primaryColor;

      if (message.address === state.lastAddress && state.pulse > 0.02) {
        ctx.fillStyle = rgba(alertColor, opacity * state.pulse * 0.16, '#8cff00');
        ctx.fillRect(x + pad * 0.7, rowY - 2, pW - pad * 1.4, lineH);
      }

      ctx.fillStyle = rgba(color, rowAlpha, '#8fffff');
      const address = String(message.address || '').slice(0, showValues ? 42 : 72);
      ctx.fillText(address, x + pad, rowY);
      if (showValues) {
        ctx.fillStyle = rgba(accentColor, rowAlpha * 0.88, '#ffffff');
        const valueText = `${formatArgs(message.args)}  x${message.count || 1}`;
        ctx.fillText(valueText.slice(0, 24), x + pW * 0.68, rowY);
      }
    });

    if (visible.length === 0) {
      ctx.fillStyle = rgba(primaryColor, opacity * 0.34, '#8fffff');
      ctx.fillText('waiting for OSC...', x + pad, startY);
      ctx.fillText('enable OSC input and send packets to this app', x + pad, startY + lineH);
    }

    const footerY = y + pH - pad - font;
    ctx.fillStyle = rgba(primaryColor, opacity * 0.4, '#8fffff');
    ctx.fillText(`LAST ${state.lastAddress || 'none'}`.slice(0, 74), x + pad, footerY);

    ctx.restore();
    texture.needsUpdate = true;
    material.opacity = opacity;
  });

  if (!texture || !material) return null;
  return React.createElement('mesh', { renderOrder: 10028 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
