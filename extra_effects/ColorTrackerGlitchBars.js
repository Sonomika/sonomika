// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Color Tracker Glitch Bars',
  description: 'Tracks a color and spawns jittery glitch bars that flicker across the target area.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'sensitivity', type: 'number', min: 0.1, max: 4.0, step: 0.1, value: 3.0, description: 'Contrast boost before detection' },
    { name: 'threshold', type: 'number', min: 0.0, max: 1.0, step: 0.01, value: 0.55, description: 'Brightness threshold (0-1)' },
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track (white = brightness mode)' },
    { name: 'count', type: 'number', min: 1, max: 12, step: 1, value: 8, description: 'Number of bars' },
    { name: 'barWidth', type: 'number', min: 0.02, max: 0.6, step: 0.01, value: 0.18, description: 'Bar width' },
    { name: 'barHeight', type: 'number', min: 0.01, max: 0.3, step: 0.01, value: 0.03, description: 'Bar height' },
    { name: 'jitter', type: 'number', min: 0.0, max: 0.5, step: 0.01, value: 0.15, description: 'Position jitter' },
    { name: 'flicker', type: 'number', min: 0.0, max: 1.0, step: 0.05, value: 0.5, description: 'Flicker amount' },
  ],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function parseColor(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

function insertTopN(list, item, maxN, invert) {
  const score = item.score;
  let i = 0;
  for (; i < list.length; i++) {
    const s = list[i].score;
    const better = invert ? score < s : score > s;
    if (better) break;
  }
  list.splice(i, 0, item);
  if (list.length > maxN) list.length = maxN;
}

function pickTargets({ buf, analyzeSize, count, threshold, invert, minSeparation, targetColor }) {
  const total = analyzeSize * analyzeSize;
  const topK = Math.max(count * 8, count);
  const candidates = [];

  const colorTarget = targetColor ? parseColor(targetColor) : null;
  const useColorTracking = colorTarget && (colorTarget.r !== 1 || colorTarget.g !== 1 || colorTarget.b !== 1);

  for (let i = 0; i < total; i++) {
    const r = buf[i * 4 + 0] / 255;
    const g = buf[i * 4 + 1] / 255;
    const b = buf[i * 4 + 2] / 255;

    let score;
    if (useColorTracking && colorTarget) {
      const dr = r - colorTarget.r;
      const dg = g - colorTarget.g;
      const db = b - colorTarget.b;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      score = 1.0 - (distance / Math.sqrt(3));
    } else {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      score = invert ? (1.0 - y) : y;
    }

    const pass = invert ? score >= (1.0 - threshold) : score >= threshold;
    if (!pass) continue;
    insertTopN(candidates, { idx: i, score }, topK, invert);
  }

  const picks = [];
  const minSep = Math.max(0, Math.floor(minSeparation || 0));
  const minSep2 = minSep * minSep;

  for (let c = 0; c < candidates.length && picks.length < count; c++) {
    const idx = candidates[c].idx;
    const x = idx % analyzeSize;
    const y = Math.floor(idx / analyzeSize);
    let ok = true;
    if (minSep > 0) {
      for (let p = 0; p < picks.length; p++) {
        const dx = x - picks[p].px;
        const dy = y - picks[p].py;
        if (dx * dx + dy * dy < minSep2) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    picks.push({ idx, px: x, py: y });
  }

  while (picks.length < count) picks.push({ idx: -1, px: 0, py: 0 });
  return picks;
}

export default function ColorTrackerGlitchBars({
  threshold = 0.55,
  sensitivity = 3.0,
  trackColor = '#ffffff',
  count = 8,
  barWidth = 0.18,
  barHeight = 0.03,
  jitter = 0.15,
  flicker = 0.5,
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const downscale = 96;
  const minSeparation = 6;
  const invert = false;

  const meshRef = useRef(null);
  const barRefs = useRef([]);
  const timeRef = useRef(0);

  let gl, scene, camera, sizeState;
  try {
    const ctx = useThree();
    if (ctx) {
      gl = ctx.gl;
      scene = ctx.scene;
      camera = ctx.camera;
      sizeState = ctx.size;
    }
  } catch {}

  const effectiveW = Math.max(1, compositionWidth || (sizeState && sizeState.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (sizeState && sizeState.height) || 1080);

  const trackerCount = Math.max(1, Math.min(12, Math.floor(count || 1)));
  const analyzeSize = Math.max(8, Math.min(256, Math.floor(downscale || 96)));
  const safeJitter = Math.max(0, Math.min(0.6, jitter));
  const safeFlicker = Math.max(0, Math.min(1, flicker));

  const captureTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { captureTarget && captureTarget.dispose && captureTarget.dispose(); } catch {} }, [captureTarget]);

  const analyzeTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(analyzeSize, analyzeSize, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [analyzeSize]);
  useEffect(() => () => { try { analyzeTarget && analyzeTarget.dispose && analyzeTarget.dispose(); } catch {} }, [analyzeTarget]);

  const blitMaterial = useMemo(() => {
    const vs = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
    const fs = `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uGain; void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb = clamp(c.rgb * uGain, 0.0, 1.0); gl_FragColor = c; }`;
    return new THREE.ShaderMaterial({
      vertexShader: vs,
      fragmentShader: fs,
      uniforms: { tDiffuse: { value: null }, uGain: { value: sensitivity } },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }, [sensitivity]);

  const blitScene = useMemo(() => new THREE.Scene(), []);
  const blitCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const blitQuad = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, blitMaterial);
    blitScene.add(mesh);
    return mesh;
  }, [blitMaterial, blitScene]);
  useEffect(() => () => { try { blitQuad.geometry && blitQuad.geometry.dispose(); } catch {} }, [blitQuad]);

  const aspect = useMemo(() => {
    try {
      if (sizeState && sizeState.width > 0 && sizeState.height > 0) return sizeState.width / sizeState.height;
    } catch {}
    return effectiveW / effectiveH;
  }, [sizeState, effectiveW, effectiveH]);

  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    if (videoTexture) return videoTexture;
    return null;
  };

  const barResources = useMemo(() => {
    const bars = new Array(trackerCount);
    const materials = new Array(trackerCount);
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < trackerCount; i++) {
      materials[i] = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff'),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, materials[i]);
      mesh.frustumCulled = false;
      mesh.visible = false;
      bars[i] = mesh;
    }
    return { bars, materials, geo };
  }, [trackerCount]);

  useEffect(() => () => {
    try { barResources && barResources.geo && barResources.geo.dispose && barResources.geo.dispose(); } catch {}
    try {
      if (barResources && barResources.materials) {
        for (const m of barResources.materials) {
          try { m && m.dispose && m.dispose(); } catch {}
        }
      }
    } catch {}
  }, [barResources]);

  const pixelBufferRef = useRef(null);
  if (!pixelBufferRef.current) pixelBufferRef.current = new Uint8Array(analyzeSize * analyzeSize * 4);

  useFrame((_, delta) => {
    if (!gl) return;
    timeRef.current += Math.max(0, delta || 0);

    if (isGlobal && captureTarget && scene && camera && meshRef.current) {
      const prevTarget = gl.getRenderTarget();
      const wasVisible = meshRef.current.visible;
      meshRef.current.visible = false;
      try {
        gl.setRenderTarget(captureTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prevTarget);
        meshRef.current.visible = wasVisible;
      }
    }

    const src = getSourceTexture();
    if (!src) return;

    const prevAutoClear = gl.autoClear;
    gl.autoClear = false;
    const prev = gl.getRenderTarget();
    try {
      blitMaterial.uniforms.tDiffuse.value = src;
      blitMaterial.uniforms.uGain.value = sensitivity;
      gl.setRenderTarget(analyzeTarget);
      gl.clear(true, true, true);
      gl.render(blitScene, blitCamera);
    } finally {
      gl.setRenderTarget(prev);
      gl.autoClear = prevAutoClear;
    }

    try {
      gl.readRenderTargetPixels(analyzeTarget, 0, 0, analyzeSize, analyzeSize, pixelBufferRef.current);
    } catch {}

    const picks = pickTargets({
      buf: pixelBufferRef.current,
      analyzeSize,
      count: trackerCount,
      threshold: clamp01(threshold),
      invert: !!invert,
      minSeparation,
      targetColor: trackColor,
    });

    for (let i = 0; i < trackerCount; i++) {
      const pick = picks[i];
      const bar = barResources.bars[i];
      const material = barResources.materials[i];
      if (!bar || !material) continue;

      if (pick && pick.idx >= 0) {
        const u = (pick.px + 0.5) / analyzeSize;
        const v = 1.0 - (pick.py + 0.5) / analyzeSize;
        const baseX = (u - 0.5) * 2.0 * aspect;
        const baseY = (v - 0.5) * 2.0;
        const jitterX = (Math.random() - 0.5) * safeJitter;
        const jitterY = (Math.random() - 0.5) * safeJitter * 0.5;
        bar.position.set(baseX + jitterX, baseY + jitterY, 0.1);
        const angle = (Math.random() - 0.5) * 0.3;
        bar.rotation.set(0, 0, angle);
        bar.scale.set(barWidth, barHeight, 1);
        const flick = 1.0 - safeFlicker * Math.random();
        material.opacity = clamp01(0.9 * flick);
        bar.visible = true;
      } else {
        bar.visible = false;
      }
    }
  });

  const children = [];
  for (let i = 0; i < trackerCount; i++) {
    children.push(
      React.createElement('primitive', {
        key: `bar-${i}`,
        object: barResources.bars[i],
        ref: (r) => { barRefs.current[i] = r; },
      })
    );
  }

  return React.createElement('group', { ref: meshRef }, ...children);
}
