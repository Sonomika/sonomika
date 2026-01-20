// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Color Tracker Shards',
  description: 'Tracks a color and spawns glitchy shard planes that pop and twist.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'sensitivity', type: 'number', min: 0.1, max: 4.0, step: 0.1, value: 3.1, description: 'Contrast boost before detection' },
    { name: 'threshold', type: 'number', min: 0.0, max: 1.0, step: 0.01, value: 0.57, description: 'Brightness threshold (0-1)' },
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track (white = brightness mode)' },
    { name: 'count', type: 'number', min: 1, max: 16, step: 1, value: 10, description: 'Number of shards' },
    { name: 'shardSize', type: 'number', min: 0.04, max: 0.5, step: 0.01, value: 0.14, description: 'Shard size' },
    { name: 'twist', type: 'number', min: 0.0, max: 4.0, step: 0.1, value: 1.8, description: 'Twist speed' },
    { name: 'pulse', type: 'number', min: 0.0, max: 2.0, step: 0.05, value: 0.7, description: 'Pulse amount' },
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

export default function ColorTrackerShards({
  threshold = 0.57,
  sensitivity = 3.1,
  trackColor = '#ffffff',
  count = 10,
  shardSize = 0.14,
  twist = 1.8,
  pulse = 0.7,
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
  const safeShard = Math.max(0.02, shardSize);
  const safeTwist = Math.max(0.0, twist);
  const safePulse = Math.max(0.0, pulse);

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

  const shardResources = useMemo(() => {
    const shards = new Array(trackerCount);
    const materials = new Array(trackerCount);
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < trackerCount; i++) {
      materials[i] = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff'),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, materials[i]);
      mesh.frustumCulled = false;
      mesh.visible = false;
      shards[i] = mesh;
    }
    return { shards, materials, geo };
  }, [trackerCount]);

  useEffect(() => () => {
    try { shardResources && shardResources.geo && shardResources.geo.dispose && shardResources.geo.dispose(); } catch {}
    try {
      if (shardResources && shardResources.materials) {
        for (const m of shardResources.materials) {
          try { m && m.dispose && m.dispose(); } catch {}
        }
      }
    } catch {}
  }, [shardResources]);

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
      const shard = shardResources.shards[i];
      const material = shardResources.materials[i];
      if (!shard || !material) continue;
      if (pick && pick.idx >= 0) {
        const u = (pick.px + 0.5) / analyzeSize;
        const v = 1.0 - (pick.py + 0.5) / analyzeSize;
        const baseX = (u - 0.5) * 2.0 * aspect;
        const baseY = (v - 0.5) * 2.0;
        const pulseScale = 1 + safePulse * Math.sin(timeRef.current * 6 + i);
        shard.position.set(baseX, baseY, 0.12);
        shard.scale.set(safeShard * pulseScale, safeShard * (0.6 + 0.4 * Math.sin(i)), 1);
        shard.rotation.set(0, 0, timeRef.current * safeTwist + i * 0.5);
        material.opacity = clamp01(0.85);
        shard.visible = true;
      } else {
        shard.visible = false;
      }
    }
  });

  const children = [];
  for (let i = 0; i < trackerCount; i++) {
    children.push(
      React.createElement('primitive', {
        key: `shard-${i}`,
        object: shardResources.shards[i],
      })
    );
  }

  return React.createElement('group', { ref: meshRef }, ...children);
}
