// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'White Tracker Squares',
  description: 'Tracks bright/white regions or a specific color and draws square outlines with a random number label on each.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    // Keep controls intentionally minimal.
    { name: 'sensitivity', type: 'number', min: 0.1, max: 4.0, step: 0.1, value: 4.0, description: 'Contrast boost before detection' },
    { name: 'threshold', type: 'number', min: 0.0, max: 1.0, step: 0.01, value: 0.56, description: 'Brightness threshold (0-1)' },
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track (white = brightness mode)' },
    { name: 'count', type: 'number', min: 1, max: 16, step: 1, value: 12, description: 'Number of squares to track' },
    { name: 'squareSize', type: 'number', min: 0.02, max: 0.8, step: 0.01, value: 0.12, description: 'Size (box + text)' },
    { name: 'showNumbers', type: 'boolean', value: true, description: 'Show number label' },
    { name: 'fontBold', type: 'boolean', value: true, description: 'Bold numbers' },
    { name: 'connectLine', type: 'boolean', value: true, description: 'Connect squares with a line' },
  ],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function drawCenteredNumber(ctx, size, { text, color, bold }) {
  const pad = Math.floor(size * 0.06);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Use Inter Regular (400) if available (it is bundled by Sonomika); fall back to sans-serif.
  const weight = bold ? 700 : 400;
  ctx.font = `${weight} ${Math.floor(size * 0.46)}px Inter, sans-serif`;
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(String(text), size * 0.5, size * 0.5, size - pad * 2);
}

function makeNumberTexture({ text, color, size = 128, bold = false }) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);

  drawCenteredNumber(ctx, size, { text, color, bold });

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  return { canvas, tex };
}

function updateNumberTexture(canvas, tex, { text, color, bold }) {
  if (!canvas || !tex) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width || 128;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);
  drawCenteredNumber(ctx, size, { text, color, bold });
  tex.needsUpdate = true;
}

function randomIntInclusive(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function insertTopN(list, item, maxN, invert) {
  // list sorted best->worst
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

function pickTargets({ buf, analyzeSize, count, threshold, invert, minSeparation, targetColor }) {
  const total = analyzeSize * analyzeSize;
  const topK = Math.max(count * 8, count);
  const candidates = [];
  
  // Parse target color if provided
  const colorTarget = targetColor ? parseColor(targetColor) : null;
  const useColorTracking = colorTarget && (colorTarget.r !== 1 || colorTarget.g !== 1 || colorTarget.b !== 1);

  for (let i = 0; i < total; i++) {
    const r = buf[i * 4 + 0] / 255;
    const g = buf[i * 4 + 1] / 255;
    const b = buf[i * 4 + 2] / 255;
    
    let score;
    if (useColorTracking && colorTarget) {
      // Color similarity: calculate distance in RGB space, invert so closer = higher score
      const dr = r - colorTarget.r;
      const dg = g - colorTarget.g;
      const db = b - colorTarget.b;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      // Score is 1 - distance (closer colors get higher scores)
      // Normalize: max distance in RGB space is sqrt(3)
      score = 1.0 - (distance / Math.sqrt(3));
    } else {
      // Brightness mode (original behavior)
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

export default function WhiteTrackerSquares({
  threshold = 0.56,
  sensitivity = 4.0,
  trackColor = '#ffffff',
  count = 12,
  squareSize = 0.12,
  showNumbers = true,
  fontBold = true,
  connectLine = true,
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  // Simplified UI: everything not exposed as a parameter is fixed here.
  const downscale = 96;
  const minSeparation = 6;
  const lineColor = '#ffffff';
  const lineOpacity = 0.9;
  const trail = 0.75;
  const invert = false;
  const numberMax = 9999;
  const numberColor = '#ffffff';
  const numberOpacity = 0.95;
  const changeNumberOnJump = true;

  const meshRef = useRef(null);

  const squareRefs = useRef([]);
  const spriteRefs = useRef([]);
  const positionStatesRef = useRef([]);
  const prevIdxRef = useRef([]);

  let gl, scene, camera, size;
  try {
    const ctx = useThree();
    if (ctx) {
      gl = ctx.gl;
      scene = ctx.scene;
      camera = ctx.camera;
      size = ctx.size;
    }
  } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const trackerCount = Math.max(1, Math.min(16, Math.floor(count || 1)));
  const analyzeSize = Math.max(8, Math.min(256, Math.floor(downscale || 96)));
  const sTrail = Math.max(0.0, Math.min(0.99, trail));

  // Offscreen capture for global mode
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

  // Downscale render target for CPU readback
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

  // Fullscreen quad material to blit source into analyzeTarget
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
      if (size && size.width > 0 && size.height > 0) return size.width / size.height;
    } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    if (videoTexture) return videoTexture;
    return null;
  };

  // Shared outline resources
  const outlineMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(lineColor),
      transparent: true,
      opacity: clamp01(lineOpacity),
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });
  }, [lineColor, lineOpacity]);
  useEffect(() => () => { try { outlineMaterial && outlineMaterial.dispose && outlineMaterial.dispose(); } catch {} }, [outlineMaterial]);

  const outlineGeometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const edges = new THREE.EdgesGeometry(base);
    try { base.dispose(); } catch {}
    return edges;
  }, []);
  useEffect(() => () => { try { outlineGeometry && outlineGeometry.dispose && outlineGeometry.dispose(); } catch {} }, [outlineGeometry]);

  const lineObjects = useMemo(() => {
    const arr = new Array(trackerCount);
    for (let i = 0; i < trackerCount; i++) {
      arr[i] = new THREE.LineSegments(outlineGeometry, outlineMaterial);
      arr[i].frustumCulled = false;
      arr[i].visible = false; // Start hidden until detection
    }
    return arr;
  }, [trackerCount, outlineGeometry, outlineMaterial]);

  const connectLineRef = useRef(null);
  const connectLineGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(trackerCount * 3);
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setDrawRange(0, 0);
    return g;
  }, [trackerCount]);
  useEffect(() => () => { try { connectLineGeometry && connectLineGeometry.dispose && connectLineGeometry.dispose(); } catch {} }, [connectLineGeometry]);

  const connectLineObject = useMemo(() => {
    const line = new THREE.Line(connectLineGeometry, outlineMaterial);
    line.frustumCulled = false;
    line.renderOrder = 10;
    return line;
  }, [connectLineGeometry, outlineMaterial]);

  // Number sprite resources (per tracker)
  const numberResources = useMemo(() => {
    if (!showNumbers) {
      return { canvases: [], textures: [], materials: [], values: [] };
    }
    const canvases = new Array(trackerCount);
    const textures = new Array(trackerCount);
    const materials = new Array(trackerCount);
    const values = new Array(trackerCount);
    const maxV = Math.max(1, Math.floor(numberMax || 9999));
    for (let i = 0; i < trackerCount; i++) {
      const v = randomIntInclusive(0, maxV);
      values[i] = v;
      const { canvas, tex } = makeNumberTexture({ text: v, color: numberColor, size: 128, bold: !!fontBold });
      canvases[i] = canvas;
      textures[i] = tex;
      materials[i] = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: clamp01(numberOpacity),
        depthTest: false,
        depthWrite: false,
      });
    }
    return { canvases, textures, materials, values };
  }, [showNumbers, trackerCount, numberMax, numberColor, numberOpacity, fontBold]);

  useEffect(() => {
    // Ensure refs arrays have correct length
    squareRefs.current = new Array(trackerCount);
    spriteRefs.current = new Array(trackerCount);
    positionStatesRef.current = new Array(trackerCount).fill(0).map(() => ({ x: 0, y: 0, initialized: false }));
    prevIdxRef.current = new Array(trackerCount).fill(-2);
    return () => {
      try {
        if (numberResources && numberResources.materials) {
          for (const m of numberResources.materials) {
            try { m && m.dispose && m.dispose(); } catch {}
          }
        }
        if (numberResources && numberResources.textures) {
          for (const t of numberResources.textures) {
            try { t && t.dispose && t.dispose(); } catch {}
          }
        }
      } catch {}
    };
  }, [trackerCount, numberResources]);

  const pixelBufferRef = useRef(null);
  if (!pixelBufferRef.current) pixelBufferRef.current = new Uint8Array(analyzeSize * analyzeSize * 4);

  useFrame(() => {
    if (!gl) return;

    // For global mode, capture scene first
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

    // Blit into analyzeTarget
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

    // Read pixels
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

    // First, hide all objects to ensure clean state
    for (let i = 0; i < trackerCount; i++) {
      const obj = squareRefs.current[i];
      if (obj) obj.visible = false;
      const spr = spriteRefs.current[i];
      if (spr) spr.visible = false;
    }

    for (let i = 0; i < trackerCount; i++) {
      const pick = picks[i];
      if (!pick) continue;

      let targetX = 0;
      let targetY = 0;
      if (pick.idx >= 0) {
        const u = (pick.px + 0.5) / analyzeSize;
        const v = 1.0 - (pick.py + 0.5) / analyzeSize;
        targetX = (u - 0.5) * 2.0 * aspect;
        targetY = (v - 0.5) * 2.0;
      } else {
        // No detection for this slot: reset to center and hide
        targetX = 0;
        targetY = 0;
      }

      const st = positionStatesRef.current[i];
      if (!st) continue;

      // Only update position and show objects when there's valid detection
      if (pick.idx >= 0) {
        if (!st.initialized) {
          st.x = targetX;
          st.y = targetY;
          st.initialized = true;
        } else {
          st.x = st.x * sTrail + targetX * (1.0 - sTrail);
          st.y = st.y * sTrail + targetY * (1.0 - sTrail);
        }

        const obj = squareRefs.current[i];
        if (obj) {
          if (obj.position) obj.position.set(st.x, st.y, 0.1);
          obj.visible = true;
        }

        const spr = spriteRefs.current[i];
        if (spr) {
          if (spr.position) spr.position.set(st.x, st.y, 0.12);
          spr.visible = showNumbers;
        }
      } else {
        // No detection: hide objects immediately
        const obj = squareRefs.current[i];
        if (obj) obj.visible = false;

        const spr = spriteRefs.current[i];
        if (spr) spr.visible = false;
      }

      // Change number on jump / retarget
      if (showNumbers && changeNumberOnJump && pick.idx >= 0) {
        const prevIdx = prevIdxRef.current[i];
        const changed = prevIdx !== pick.idx;
        prevIdxRef.current[i] = pick.idx;
        if (!changed) continue;
        const maxV = Math.max(1, Math.floor(numberMax || 9999));
        const newV = randomIntInclusive(0, maxV);
        if (numberResources && numberResources.values) numberResources.values[i] = newV;
        if (numberResources && numberResources.canvases && numberResources.textures) {
          updateNumberTexture(numberResources.canvases[i], numberResources.textures[i], { text: newV, color: numberColor, bold: !!fontBold });
        }
      }
    }

    // Update optional connecting line using the latest smoothed positions.
    if (connectLine && connectLineRef.current && connectLineGeometry) {
      // Start hidden, only show if we have valid points
      connectLineRef.current.visible = false;
      let n = 0;
      const posAttr = connectLineGeometry.getAttribute('position');
      const arr = posAttr && posAttr.array;
      if (arr) {
        for (let i = 0; i < trackerCount; i++) {
          const pick = picks[i];
          if (!pick || pick.idx < 0) continue;
          const st = positionStatesRef.current[i];
          if (!st || !st.initialized) continue;
          arr[n * 3 + 0] = st.x;
          arr[n * 3 + 1] = st.y;
          arr[n * 3 + 2] = 0.05;
          n++;
        }
        if (n >= 2) {
          posAttr.needsUpdate = true;
          connectLineGeometry.setDrawRange(0, n);
          connectLineRef.current.visible = true;
        } else {
          connectLineGeometry.setDrawRange(0, 0);
        }
      }
    } else if (connectLineRef.current) {
      connectLineRef.current.visible = false;
    }
  });

  const safeSquareSize = Math.max(0.001, squareSize);
  // Keep the number comfortably inside the outline.
  const spriteScale = safeSquareSize * 0.75;

  const children = [];

  if (connectLine) {
    children.push(
      React.createElement('primitive', {
        key: 'connect-line',
        object: connectLineObject,
        ref: (r) => { connectLineRef.current = r; },
      })
    );
  }

  for (let i = 0; i < trackerCount; i++) {
    const outline = React.createElement('primitive', {
      key: `sq-${i}`,
      object: lineObjects[i],
      ref: (r) => { squareRefs.current[i] = r; },
      scale: [safeSquareSize, safeSquareSize, safeSquareSize],
    });
    children.push(outline);

    if (showNumbers && numberResources && numberResources.materials && numberResources.materials[i]) {
      children.push(
        React.createElement('sprite', {
          key: `num-${i}`,
          ref: (r) => { spriteRefs.current[i] = r; },
          scale: [spriteScale, spriteScale, 1],
          material: numberResources.materials[i],
        })
      );
    }
  }

  return React.createElement('group', { ref: meshRef }, ...children);
}

