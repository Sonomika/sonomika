// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Pulse Strobe Bars (PULSE)',
  description: 'Press Pulse to fire random high-contrast strobe bars across the frame.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'pulseOne', type: 'button', value: 0, description: 'Pulse One' },
    { name: 'barOpacity', type: 'number', value: 0.9, min: 0, max: 1, step: 0.01, description: 'Bar Opacity' },
    { name: 'barCount', type: 'number', value: 14, min: 1, max: 80, step: 1, description: 'Bars Per Pulse' },
    { name: 'barThickness', type: 'number', value: 0.08, min: 0.01, max: 0.35, step: 0.005, description: 'Bar Thickness' },
    { name: 'flashDuration', type: 'number', value: 0.45, min: 0.05, max: 2.5, step: 0.01, description: 'Flash Duration' },
    { name: 'strobeRate', type: 'number', value: 22, min: 0, max: 80, step: 0.5, description: 'Strobe Rate' },
    { name: 'jitterAmount', type: 'number', value: 0.025, min: 0, max: 0.18, step: 0.005, description: 'Screen Jitter' },
    { name: 'horizontalMix', type: 'number', value: 0.72, min: 0, max: 1, step: 0.01, description: 'Horizontal Mix' },
  ],
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function bw(alpha, white) {
  const v = white ? 255 : 0;
  return `rgba(${v},${v},${v},${clamp01(alpha)})`;
}

function makeBar(horizontal, thickness) {
  const main = clamp(Number(thickness) || 0.08, 0.01, 0.35);
  const scale = rand(0.35, 1.85);
  if (horizontal) {
    const h = clamp(main * scale, 0.006, 0.42);
    return {
      x: rand(-0.12, 0.12),
      y: rand(-0.08, 1.04),
      w: rand(0.42, 1.35),
      h,
      horizontal: true,
    };
  }
  const w = clamp(main * scale, 0.006, 0.42);
  return {
    x: rand(-0.08, 1.04),
    y: rand(-0.12, 0.12),
    w,
    h: rand(0.42, 1.35),
    horizontal: false,
  };
}

export default function PulseStrobeBars({
  pulseOne = 0,
  barOpacity = 0.9,
  barCount = 14,
  barThickness = 0.08,
  flashDuration = 0.45,
  strobeRate = 22,
  jitterAmount = 0.025,
  horizontalMix = 0.72,
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
      opacity: barOpacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [texture]);

  const stateRef = useRef({
    bars: [],
    flash: 0,
    pulseIndex: 0,
    jitterX: 0,
    jitterY: 0,
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
    const state = stateRef.current;
    const count = Math.max(1, Math.floor(Number(barCount) || 14));
    const mix = clamp01(Number(horizontalMix) || 0);
    const duration = Math.max(0.05, Number(flashDuration) || 0.45);
    const bars = [];

    state.pulseIndex += 1;
    state.flash = 1;
    state.jitterX = rand(-1, 1);
    state.jitterY = rand(-1, 1);

    for (let i = 0; i < count; i++) {
      bars.push({
        ...makeBar(Math.random() < mix, barThickness),
        age: rand(0, duration * 0.18),
        duration: duration * rand(0.65, 1.35),
        seed: rand(0, 1000),
        white: Math.random() < 0.64,
        offset: rand(-0.08, 0.08),
      });
    }

    state.bars = bars;
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
    const state = stateRef.current;
    const opacity = clamp01(Number(barOpacity) || 0);
    const rate = Math.max(0, Number(strobeRate) || 0);
    const jitter = clamp(Number(jitterAmount) || 0, 0, 0.18);

    ctx.clearRect(0, 0, width, height);
    state.flash = Math.max(0, state.flash - dt / Math.max(0.05, Number(flashDuration) || 0.45));
    state.jitterX *= Math.pow(0.15, dt);
    state.jitterY *= Math.pow(0.15, dt);

    if (state.bars.length > 0 || state.flash > 0.001) {
      ctx.save();
      ctx.translate(state.jitterX * jitter * width, state.jitterY * jitter * height);

      state.bars = state.bars
        .map((bar) => ({ ...bar, age: bar.age + dt }))
        .filter((bar) => bar.age < bar.duration);

      state.bars.forEach((bar) => {
        const life = clamp01(bar.age / Math.max(0.001, bar.duration));
        const gate = rate <= 0 ? 1 : (Math.sin((bar.age * rate + bar.seed) * Math.PI * 2) > 0 ? 1 : 0);
        if (life >= 1 || gate <= 0 || opacity <= 0) return;

        const slide = bar.offset * life;
        const x = (bar.x + (bar.horizontal ? slide : 0)) * width;
        const y = (bar.y + (bar.horizontal ? 0 : slide)) * height;
        const w = bar.w * width;
        const h = bar.h * height;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = bw(1, bar.white);
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
        ctx.globalAlpha = 1;
      });

      ctx.restore();
    }

    texture.needsUpdate = true;
    material.opacity = opacity;
  });

  if (!texture || !material) return null;
  return React.createElement('mesh', { renderOrder: 10027 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}
