// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'White Tracker Stroke Trails',
  description: 'Tracks bright/white regions or a specific color and draws thin, light stroke trails.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'sensitivity', type: 'number', min: 0.1, max: 4.0, step: 0.1, value: 3.2, description: 'Contrast boost before detection' },
    { name: 'threshold', type: 'number', min: 0.0, max: 1.0, step: 0.01, value: 0.58, description: 'Brightness threshold (0-1)' },
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track (white = brightness mode)' },
    { name: 'count', type: 'number', min: 1, max: 16, step: 1, value: 8, description: 'Number of trails to track' },
    { name: 'trailLength', type: 'number', min: 6, max: 120, step: 1, value: 33, description: 'Trail length (points)' },
    { name: 'trailSmoothing', type: 'number', min: 0.0, max: 0.98, step: 0.01, value: 0.8, description: 'Position smoothing' },
    { name: 'driftAmount', type: 'number', min: 0.0, max: 0.12, step: 0.005, value: 0.12, description: 'Trail drift amount' },
    { name: 'driftSpeed', type: 'number', min: 0.0, max: 4.0, step: 0.1, value: 4.0, description: 'Trail drift speed' },
    { name: 'strokeWidth', type: 'number', min: 1, max: 8, step: 1, value: 1, description: 'Stroke width' },
    { name: 'strokeOpacity', type: 'number', min: 0.05, max: 1.0, step: 0.05, value: 1.0, description: 'Stroke opacity' },
    { name: 'strokeColor', type: 'color', value: '#ffffff', description: 'Stroke color' },
  ],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function parseColor(hex) {
  // Parse hex color to RGB [0-1]
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

function buildTubeGeometry(points, radius) {
  if (!points || points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = Math.max(2, points.length * 2);
  return new THREE.TubeGeometry(curve, segments, radius, 6, false);
}

export default function WhiteTrackerStrokeTrails({
  threshold = 0.58,
  sensitivity = 3.2,
  trackColor = '#ffffff',
  count = 8,
  trailLength = 33,
  trailSmoothing = 0.8,
  driftAmount = 0.12,
  driftSpeed = 4.0,
  strokeWidth = 1,
  strokeOpacity = 1.0,
  strokeColor = '#ffffff',
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
  const lineRefs = useRef([]);
  const historyRefs = useRef([]);
  const stateRefs = useRef([]);
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

  const trackerCount = Math.max(1, Math.min(16, Math.floor(count || 1)));
  const analyzeSize = Math.max(8, Math.min(256, Math.floor(downscale || 96)));
  const sTrail = Math.max(0.0, Math.min(0.99, trailSmoothing));
  const safeTrailLength = Math.max(6, Math.min(200, Math.floor(trailLength || 6)));
  const safeOpacity = clamp01(strokeOpacity);
  const safeDrift = Math.max(0.0, Math.min(0.2, driftAmount || 0));
  const safeDriftSpeed = Math.max(0.0, driftSpeed || 0);
  const safeStrokeWidth = Math.max(1, Math.min(16, Math.floor(strokeWidth || 1)));
  const strokeRadius = safeStrokeWidth * 0.004;

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

  const trailResources = useMemo(() => {
    const lines = new Array(trackerCount);
    const materials = new Array(trackerCount);
    for (let i = 0; i < trackerCount; i++) {
      const g = buildTubeGeometry(
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.001)],
        strokeRadius
      );
      materials[i] = new THREE.MeshBasicMaterial({
        color: new THREE.Color(strokeColor),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const line = new THREE.Mesh(g, materials[i]);
      line.frustumCulled = false;
      line.visible = false;
      lines[i] = line;
    }
    return { lines, materials };
  }, [trackerCount, safeTrailLength, strokeColor, strokeRadius]);

  useEffect(() => {
    lineRefs.current = new Array(trackerCount);
    historyRefs.current = new Array(trackerCount).fill(0).map(() => []);
    stateRefs.current = new Array(trackerCount)
      .fill(0)
      .map(() => ({ x: 0, y: 0, alpha: 0, initialized: false }));
  }, [trackerCount]);

  useEffect(() => {
    return () => {
      try {
        if (trailResources && trailResources.materials) {
          for (const m of trailResources.materials) {
            try { m && m.dispose && m.dispose(); } catch {}
          }
        }
        if (trailResources && trailResources.lines) {
          for (const line of trailResources.lines) {
            try { line && line.geometry && line.geometry.dispose && line.geometry.dispose(); } catch {}
          }
        }
      } catch {}
    };
  }, [trailResources]);

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

    const buf = pixelBufferRef.current;
    if (!buf) return;

    const picks = pickTargets({
      buf,
      analyzeSize,
      count: trackerCount,
      threshold: clamp01(threshold),
      invert: !!invert,
      minSeparation,
      targetColor: trackColor,
    });

    for (let i = 0; i < trackerCount; i++) {
      const pick = picks[i];
      const st = stateRefs.current[i];
      const history = historyRefs.current[i];
      if (!st || !history) continue;

      let targetX = 0;
      let targetY = 0;
      const hasHit = pick && pick.idx >= 0;
      if (hasHit) {
        const u = (pick.px + 0.5) / analyzeSize;
        const v = 1.0 - (pick.py + 0.5) / analyzeSize;
        targetX = (u - 0.5) * 2.0 * aspect;
        targetY = (v - 0.5) * 2.0;
      }

      if (hasHit) {
        if (!st.initialized) {
          st.x = targetX;
          st.y = targetY;
          st.initialized = true;
        } else {
          st.x = st.x * sTrail + targetX * (1.0 - sTrail);
          st.y = st.y * sTrail + targetY * (1.0 - sTrail);
        }
        st.alpha = Math.min(1, st.alpha + 0.2);
      } else {
        st.alpha = st.alpha * 0.9;
        if (st.alpha < 0.01) st.alpha = 0;
      }

      if (st.alpha > 0) {
        history.push({ x: st.x, y: st.y });
        if (history.length > safeTrailLength) history.shift();
      } else if (history.length > 0) {
        history.shift();
      }

      const line = lineRefs.current[i];
      if (!line) continue;

      const countPts = history.length;
      if (countPts >= 2) {
        const t = timeRef.current;
        const points = new Array(countPts);
        for (let p = 0; p < countPts; p++) {
          const pt = history[p];
          const wobbleX = safeDrift * Math.sin(t * safeDriftSpeed + i * 1.3 + p * 0.35);
          const wobbleY = safeDrift * Math.cos(t * safeDriftSpeed * 0.9 + i * 0.9 + p * 0.28);
          points[p] = new THREE.Vector3(pt.x + wobbleX, pt.y + wobbleY, 0.05);
        }
        const newGeom = buildTubeGeometry(points, strokeRadius);
        if (newGeom) {
          const prevGeom = line.geometry;
          line.geometry = newGeom;
          if (prevGeom && prevGeom.dispose) {
            try { prevGeom.dispose(); } catch {}
          }
          line.visible = true;
          if (line.material) line.material.opacity = clamp01(st.alpha * safeOpacity);
        }
      } else {
        line.visible = false;
      }
    }
  });

  const children = [];
  for (let i = 0; i < trackerCount; i++) {
    children.push(
      React.createElement('primitive', {
        key: `trail-${i}`,
        object: trailResources.lines[i],
        ref: (r) => { lineRefs.current[i] = r; },
      })
    );
  }

  return React.createElement('group', { ref: meshRef }, ...children);
}
