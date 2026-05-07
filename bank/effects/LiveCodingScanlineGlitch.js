const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Live Coding Scanline Glitch',
  description: 'Live-coding mask that uses only the layer underneath as a source and tears it into held horizontal pixel stretches.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 0.82, min: 0, max: 2, step: 0.01 },
    { name: 'bandDensity', type: 'number', value: 0.34, min: 0, max: 1, step: 0.01 },
    { name: 'bandHeight', type: 'number', value: 12, min: 2, max: 80, step: 1 },
    { name: 'stretch', type: 'number', value: 0.68, min: 0, max: 1, step: 0.01 },
    { name: 'hold', type: 'number', value: 0.72, min: 0, max: 1, step: 0.01 },
    { name: 'glitchSpeed', type: 'number', value: 1.0, min: 0, max: 6, step: 0.01 },
    { name: 'rgbSplit', type: 'number', value: 0.0, min: 0, max: 0.08, step: 0.001 },
    { name: 'overlayOpacity', type: 'number', value: 0.82, min: 0, max: 1, step: 0.01 },
    { name: 'codeScale', type: 'number', value: 1.0, min: 0.55, max: 1.8, step: 0.01 },
    { name: 'typingSpeed', type: 'number', value: 1.0, min: 0, max: 4, step: 0.01 },
    { name: 'scrollSpeed', type: 'number', value: 0.62, min: 0, max: 3, step: 0.01 },
    { name: 'jitter', type: 'number', value: 0.28, min: 0, max: 1, step: 0.01 },
    { name: 'maskOpacity', type: 'number', value: 0.9, min: 0, max: 1, step: 0.01 },
  ],
};

const CODE_LINES = [
  'mutable Mutemut_',
  '// more data',
  'X&tof_cst Xx)',
  '{',
  '  if (this != &x)',
  '  {',
  '    alloc(v.x, x->m_d, x->c, u->a);',
  '    std::lock_guard<Mutex> lock(ptr_u);',
  '    assign_data();',
  '  }',
  '  return *this;',
  '}',
  '',
  'template<class T> inline void operator()(T&& input) {',
  '  const int line = scanlineIndex++ & 255;',
  '  auto ptr = input.data() + line * stride;',
  '  memcpy(holdBuffer + phase, ptr, width);',
  '  stretchPixels(holdBuffer, output, phase);',
  '}',
  '',
  'if (signal.energy > gate) {',
  '  shader.uniforms.glitch.value = 1.0;',
  '  timeline.push_back(Event::TEAR);',
  '  midi.send(note + 12, velocity);',
  '}',
  '',
  'vec2 uv = gl_FragCoord.xy / resolution.xy;',
  'float row = floor(uv.y * resolution.y / bandSize);',
  'float held = floor(time * holdRate + hash(row));',
  'vec2 src = vec2(anchor + local * stretch, uv.y);',
  'fragColor = texture(sourceBuffer, src);',
  '',
  'compile: ok',
  'copy: front -> back',
  'swap: back -> display',
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

function fillRect(ctx, x, y, w, h, color, alpha) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillRect(x, y, w, h);
}

function strokeRect(ctx, x, y, w, h, color, alpha, lw) {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

function drawText(ctx, text, x, y, color, alpha) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillText(text, x, y);
}

function drawCode(ctx, width, height, t, opts) {
  const { alpha, codeScale, typingSpeed, scrollSpeed, jitter } = opts;
  const fontSize = Math.max(10, Math.floor(15 * codeScale));
  const lineH = Math.max(12, Math.floor(fontSize * 1.28));
  const left = width * 0.07;
  const top = height * 0.06;
  const maxW = width * 0.56;
  const rows = Math.max(8, Math.floor(height * 0.72 / lineH));
  const total = CODE_LINES.length;
  const scroll = (t * 3.8 * scrollSpeed) % total;
  const start = Math.floor(scroll);
  const sub = scroll - start;
  const activeRow = Math.floor(rows * 0.38);
  const typedChars = Math.floor((t * 28 * typingSpeed) % 42);
  const cursorOn = Math.floor(t * 4.2) % 2 === 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, maxW + left, height);
  ctx.clip();
  ctx.font = `700 ${fontSize}px Consolas, Monaco, monospace`;
  ctx.textBaseline = 'top';

  for (let i = 0; i < rows + 3; i++) {
    const idx = (start + i) % total;
    const line = CODE_LINES[idx] || '';
    const y = top + (i - sub) * lineH;
    const rowAlpha = alpha * (0.26 + 0.74 * (1 - Math.abs(i - rows * 0.45) / rows));
    const isActive = i === activeRow;
    const dx = (seededNoise(idx * 8.33 + Math.floor(t * 20)) - 0.5) * jitter * 10;
    const color = '#ffffff';

    if (isActive) fillRect(ctx, left - 4, y - 1, maxW * 0.54, lineH, '#ffffff', alpha * 0.04);
    const text = isActive && typingSpeed > 0
      ? line.slice(0, Math.min(line.length, Math.max(1, typedChars)))
      : line;
    drawText(ctx, text, left + dx, y, color, isActive ? alpha * 0.94 : rowAlpha);

    if (isActive && cursorOn) {
      const cursorX = left + ctx.measureText(text).width + 4 + dx;
      fillRect(ctx, cursorX, y + 1, Math.max(2, fontSize * 0.14), lineH - 2, '#ffffff', alpha * 0.8);
    }
  }

  ctx.restore();
}

function drawOverlay(ctx, width, height, t, opts) {
  const { alpha, jitter } = opts;
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  drawCode(ctx, width, height, t, opts);

  const frameAlpha = alpha * 0.18;
  strokeRect(ctx, 12, 12, width - 24, height - 24, '#ffffff', frameAlpha, 1);
  strokeRect(ctx, 20, 20, width - 40, height - 40, '#ffffff', frameAlpha * 0.5, 1);

  ctx.font = '11px Consolas, Monaco, monospace';
  ctx.textBaseline = 'top';
  drawText(ctx, 'SOURCE_BUFFER // HOLD_SCANLINE', width * 0.62, height * 0.08, '#ffffff', alpha * 0.6);
  drawText(ctx, 'PIXEL_STRETCH: armed', width * 0.62, height * 0.12, '#ffffff', alpha * 0.45);

  const barCount = 10;
  const step = Math.floor(t * 12);
  for (let i = 0; i < barCount; i++) {
    const n = seededNoise(step + i * 17.21);
    if (n < 0.34) continue;
    const y = height * seededNoise(i * 9.7 + step * 0.4);
    const h = 2 + seededNoise(i * 11.1 + step) * 14;
    const x = width * seededNoise(i * 5.3 + step);
    const w = width * (0.12 + seededNoise(i * 15.9 + step) * 0.72);
    fillRect(ctx, x, y, w, h, '#ffffff', alpha * (0.2 + n * 0.36));
    if (jitter > 0.2) fillRect(ctx, Math.max(0, x - 18), y + h + 2, w * 0.24, 2, '#ffffff', alpha * 0.18);
  }
}

export default function LiveCodingScanlineGlitch({
  videoTexture,
  isGlobal = false,
  intensity = 0.82,
  bandDensity = 0.34,
  bandHeight = 12,
  stretch = 0.68,
  hold = 0.72,
  glitchSpeed = 1.0,
  rgbSplit = 0.0,
  overlayOpacity = 0.82,
  codeScale = 1.0,
  typingSpeed = 1.0,
  scrollSpeed = 0.62,
  jitter = 0.28,
  maskOpacity = 0.9,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try {
    const ctx3 = useThree();
    if (ctx3) {
      gl = ctx3.gl;
      scene = ctx3.scene;
      camera = ctx3.camera;
      size = ctx3.size;
    }
  } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);
  const aspect = effectiveW / effectiveH;
  const overlayW = aspect >= 1 ? 1280 : Math.max(360, Math.round(1280 * aspect));
  const overlayH = aspect >= 1 ? Math.max(360, Math.round(1280 / aspect)) : 1280;

  const fallbackTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const overlayCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c;
  }, []);

  const overlayTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(overlayCanvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [overlayCanvas]);

  const renderTarget = useMemo(() => {
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

  useEffect(() => () => {
    try {
      fallbackTexture && fallbackTexture.dispose && fallbackTexture.dispose();
      overlayTexture && overlayTexture.dispose && overlayTexture.dispose();
      renderTarget && renderTarget.dispose && renderTarget.dispose();
    } catch {}
  }, [fallbackTexture, overlayTexture, renderTarget]);

  useEffect(() => {
    if (overlayCanvas.width !== overlayW || overlayCanvas.height !== overlayH) {
      overlayCanvas.width = overlayW;
      overlayCanvas.height = overlayH;
      overlayTexture.needsUpdate = true;
    }
  }, [overlayCanvas, overlayTexture, overlayW, overlayH]);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tOverlay;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uBandDensity;
    uniform float uBandHeight;
    uniform float uStretch;
    uniform float uHold;
    uniform float uGlitchSpeed;
    uniform float uRgbSplit;
    uniform float uOverlayOpacity;
    varying vec2 vUv;

    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }

    float hash2(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    vec4 sampleSource(vec2 uv) {
      return texture2D(tDiffuse, clamp(uv, vec2(0.0), vec2(1.0)));
    }

    void main() {
      vec2 uv = vUv;
      vec2 px = uv * uResolution;
      float bandPx = max(2.0, uBandHeight);
      float band = floor(px.y / bandPx);
      float heldRate = mix(20.0, 1.5, clamp(uHold, 0.0, 1.0));
      float heldTime = floor(uTime * heldRate * max(0.0, uGlitchSpeed) + hash(band * 2.31));
      float n = hash(band * 19.17 + heldTime * 7.13);
      float bandOn = step(1.0 - clamp(uBandDensity, 0.0, 1.0), n);
      vec4 overlay = texture2D(tOverlay, uv);
      float overlayMask = overlay.a * uOverlayOpacity;

      float localY = fract(px.y / bandPx);
      float scanEdge = smoothstep(0.0, 0.16, localY) * (1.0 - smoothstep(0.82, 1.0, localY));
      float pulse = max(bandOn * scanEdge, overlayMask) * clamp(uIntensity, 0.0, 2.0);

      float rowOffset = (hash(band * 5.7 + heldTime) - 0.5) * 0.52 * uIntensity;
      float cellPx = mix(1.0, 42.0, clamp(uStretch, 0.0, 1.0));
      float sourceX = floor((px.x + rowOffset * uResolution.x) / cellPx) * cellPx / uResolution.x;
      float smearAnchor = hash(band * 44.9 + heldTime * 3.0);
      float smearMix = clamp(uStretch, 0.0, 1.0) * pulse;
      vec2 heldUv = vec2(mix(sourceX, smearAnchor, smearMix * 0.55), uv.y);
      heldUv.x += rowOffset * pulse;

      vec2 split = vec2(uRgbSplit * pulse, 0.0);
      vec4 srcBase = sampleSource(uv);
      vec4 heldR = sampleSource(heldUv + split);
      vec4 heldG = sampleSource(heldUv);
      vec4 heldB = sampleSource(heldUv - split);
      vec3 glitched = vec3(heldR.r, heldG.g, heldB.b);

      vec3 color = mix(srcBase.rgb, glitched, clamp(pulse, 0.0, 1.0));

      // Add hard digital tear bars that preserve and stretch source pixels.
      float tear = step(0.965, hash2(vec2(band, heldTime + floor(uv.x * 12.0))));
      color = mix(color, sampleSource(vec2(fract(uv.x + rowOffset * 1.8), uv.y)).rgb, tear * max(bandOn, overlayMask) * 0.72);

      gl_FragColor = vec4(color, srcBase.a);
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || fallbackTexture);
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture },
        tOverlay: { value: overlayTexture },
        uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uBandDensity: { value: bandDensity },
        uBandHeight: { value: bandHeight },
        uStretch: { value: stretch },
        uHold: { value: hold },
        uGlitchSpeed: { value: glitchSpeed },
        uRgbSplit: { value: rgbSplit },
        uOverlayOpacity: { value: overlayOpacity },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    materialRef.current = mat;
    return mat;
  }, [videoTexture, fallbackTexture, overlayTexture, isGlobal, renderTarget, effectiveW, effectiveH, intensity, bandDensity, bandHeight, stretch, hold, glitchSpeed, rgbSplit, overlayOpacity]);

  useEffect(() => () => { try { shaderMaterial && shaderMaterial.dispose && shaderMaterial.dispose(); } catch {} }, [shaderMaterial]);

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;

    const t = state && state.clock ? state.clock.elapsedTime : 0;
    const ctx = overlayCanvas.getContext('2d');
    if (ctx) {
      drawOverlay(ctx, overlayCanvas.width, overlayCanvas.height, t, {
        alpha: clamp01(overlayOpacity) * clamp01(maskOpacity),
        codeScale: clamp(codeScale, 0.55, 1.8),
        typingSpeed: Math.max(0, typingSpeed),
        scrollSpeed: Math.max(0, scrollSpeed),
        jitter: clamp01(jitter),
      });
      overlayTexture.needsUpdate = true;
    }

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.clear(true, true, true);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      mat.uniforms.tDiffuse.value = renderTarget.texture;
    } else {
      const nextTex = videoTexture || fallbackTexture;
      if (mat.uniforms.tDiffuse.value !== nextTex) mat.uniforms.tDiffuse.value = nextTex;
    }

    mat.uniforms.tOverlay.value = overlayTexture;
    mat.uniforms.uResolution.value.set(Math.max(1, effectiveW), Math.max(1, effectiveH));
    mat.uniforms.uTime.value = t;
    mat.uniforms.uIntensity.value = intensity;
    mat.uniforms.uBandDensity.value = clamp01(bandDensity);
    mat.uniforms.uBandHeight.value = Math.max(2, bandHeight);
    mat.uniforms.uStretch.value = clamp01(stretch);
    mat.uniforms.uHold.value = clamp01(hold);
    mat.uniforms.uGlitchSpeed.value = Math.max(0, glitchSpeed);
    mat.uniforms.uRgbSplit.value = Math.max(0, rgbSplit);
    mat.uniforms.uOverlayOpacity.value = clamp01(overlayOpacity);
  });

  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef, renderOrder: 10025 },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material' }),
  );
}
