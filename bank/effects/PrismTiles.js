// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};
const useThree = (r3f && r3f.useThree) || (() => null);
const useFrame = (r3f && r3f.useFrame) || (() => {});

export const metadata = {
  name: 'Prism Tiles',
  description: 'Animated chromatic glass-tile refraction with glowing seams',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'cellSize', type: 'number', value: 72, min: 8, max: 240, step: 1 },
    { name: 'distortion', type: 'number', value: 0.45, min: 0, max: 1.5, step: 0.01 },
    { name: 'speed', type: 'number', value: 0.55, min: 0, max: 3, step: 0.01 },
    { name: 'chromatic', type: 'number', value: 0.009, min: 0, max: 0.05, step: 0.001 },
    { name: 'edgeGlow', type: 'number', value: 0.65, min: 0, max: 2, step: 0.01 },
    { name: 'posterize', type: 'number', value: 7, min: 1, max: 32, step: 1 },
    { name: 'tint', type: 'color', value: '#7df9ff' },
    { name: 'tintStrength', type: 'number', value: 0.22, min: 0, max: 1, step: 0.01 },
    { name: 'mirror', type: 'boolean', value: true },
    { name: 'invert', type: 'boolean', value: false },
  ],
};

function normalizeColor(input) {
  try {
    if (typeof input === 'string') {
      if (input.startsWith('#')) return input;
      if (input.startsWith('rgb')) {
        const m = input.match(/rgba?\(([^)]+)\)/i);
        if (m) {
          const [r, g, b] = m[1].split(',').map((p) => parseFloat(p.trim()));
          const toHex = (n) =>
            Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
      }
      const c = new THREE.Color(input);
      return `#${c.getHexString()}`;
    }
  } catch {}
  return '#7df9ff';
}

export default function PrismTiles({
  videoTexture,
  cellSize = 72,
  distortion = 0.45,
  speed = 0.55,
  chromatic = 0.009,
  edgeGlow = 0.65,
  posterize = 7,
  tint = '#7df9ff',
  tintStrength = 0.22,
  mirror = true,
  invert = false,
  opacity = 1,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;

  const effectiveW = compositionWidth || 1920;
  const effectiveH = compositionHeight || 1080;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

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

  const nCellSize = useMemo(() => Math.max(1, Number.isFinite(+cellSize) ? +cellSize : 72), [cellSize]);
  const nDistortion = useMemo(() => Math.max(0, Number.isFinite(+distortion) ? +distortion : 0.45), [distortion]);
  const nSpeed = useMemo(() => Math.max(0, Number.isFinite(+speed) ? +speed : 0.55), [speed]);
  const nChromatic = useMemo(() => Math.max(0, Number.isFinite(+chromatic) ? +chromatic : 0.009), [chromatic]);
  const nEdgeGlow = useMemo(() => Math.max(0, Number.isFinite(+edgeGlow) ? +edgeGlow : 0.65), [edgeGlow]);
  const nPosterize = useMemo(() => Math.max(1, Number.isFinite(+posterize) ? +posterize : 7), [posterize]);
  const nTintStrength = useMemo(() => {
    const v = Number(tintStrength);
    if (!Number.isFinite(v)) return 0.22;
    return Math.max(0, Math.min(1, v));
  }, [tintStrength]);
  const nOpacity = useMemo(() => {
    const v = Number(opacity);
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(1, v));
  }, [opacity]);

  const normalizedTint = useMemo(() => normalizeColor(tint), [tint]);

  const defaultTexture = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => () => {
    try { defaultTexture && defaultTexture.dispose && defaultTexture.dispose(); } catch {}
  }, [defaultTexture]);

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(
      Math.max(1, effectiveW),
      Math.max(1, effectiveH),
      {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
      }
    );
  }, [isGlobal, effectiveW, effectiveH]);

  useEffect(() => () => {
    try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {}
  }, [renderTarget]);

  const frag = `
uniform sampler2D inputBuffer;
uniform vec2 resolution;
uniform float uTime;
uniform float uCellSize;
uniform float uDistortion;
uniform float uSpeed;
uniform float uChromatic;
uniform float uEdgeGlow;
uniform float uPosterize;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uOpacity;
uniform bool uMirror;
uniform bool uInvert;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

vec3 posterizeColor(vec3 c, float levels) {
  levels = max(1.0, levels);
  return floor(c * levels + 0.5) / levels;
}

void main() {
  vec2 uv = vUv;
  vec2 cells = max(vec2(1.0), resolution / max(1.0, uCellSize));

  vec2 gridUv = uv * cells;
  vec2 id = floor(gridUv);
  vec2 f = fract(gridUv);
  vec2 local = f - 0.5;

  float rnd = hash21(id);
  float rnd2 = hash21(id + 19.19);
  float t = uTime * uSpeed;

  float steppedAngle = floor(rnd * 4.0) * 1.57079632679;
  float livingAngle = sin(t * 1.35 + rnd * 6.28318530718) * 0.75 * uDistortion;
  local = rot(steppedAngle + livingAngle) * local;

  if (uMirror) {
    local = abs(local) - 0.25;
    local *= 1.65;
  }

  float waveX = sin((id.y * 0.73 + local.y * 7.0 + t * 1.8 + rnd * 6.28318530718));
  float waveY = cos((id.x * 0.61 + local.x * 7.0 - t * 1.4 + rnd2 * 6.28318530718));
  local += vec2(waveX, waveY) * 0.055 * uDistortion;

  vec2 sampleUv = (id + local + 0.5) / cells;

  vec2 radial = uv - 0.5;
  sampleUv += radial * sin(t + length(radial) * 18.0) * 0.018 * uDistortion;

  sampleUv = clamp(sampleUv, vec2(0.001), vec2(0.999));

  vec2 prismDir = normalize(local + vec2(0.001, -0.002));
  float prismAmount = uChromatic * (0.45 + rnd * 1.35);

  vec4 centerSample = texture2D(inputBuffer, sampleUv);
  float r = texture2D(inputBuffer, clamp(sampleUv + prismDir * prismAmount, vec2(0.001), vec2(0.999))).r;
  float g = centerSample.g;
  float b = texture2D(inputBuffer, clamp(sampleUv - prismDir * prismAmount, vec2(0.001), vec2(0.999))).b;

  vec3 col = vec3(r, g, b);

  col = posterizeColor(col, uPosterize);

  float edgeDist = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float gridLine = 1.0 - smoothstep(0.0, 0.055, edgeDist);

  float diagA = abs(f.x - f.y);
  float diagB = abs((1.0 - f.x) - f.y);
  float diag = mix(diagA, diagB, step(0.5, rnd));
  float diagLine = 1.0 - smoothstep(0.0, 0.035, diag);

  float seam = max(gridLine, diagLine * 0.55);
  float pulse = 0.65 + 0.35 * sin(t * 3.0 + rnd * 6.28318530718);

  vec3 tinted = mix(col, col * uTint * 1.8, uTintStrength);
  col = tinted + uTint * seam * uEdgeGlow * pulse;

  float vignette = smoothstep(0.95, 0.15, length(uv - 0.5));
  col *= mix(0.72, 1.08, vignette);

  if (uInvert) {
    col = 1.0 - col;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), centerSample.a * uOpacity);
}
`;

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: defaultTexture },
        resolution: { value: new THREE.Vector2(Math.max(1, effectiveW), Math.max(1, effectiveH)) },
        uTime: { value: 0 },
        uCellSize: { value: nCellSize },
        uDistortion: { value: nDistortion },
        uSpeed: { value: nSpeed },
        uChromatic: { value: nChromatic },
        uEdgeGlow: { value: nEdgeGlow },
        uPosterize: { value: nPosterize },
        uTint: { value: new THREE.Color(normalizedTint) },
        uTintStrength: { value: nTintStrength },
        uOpacity: { value: nOpacity },
        uMirror: { value: !!mirror },
        uInvert: { value: !!invert },
      },
      vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
      fragmentShader: frag,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
  }, [defaultTexture, effectiveW, effectiveH]);

  useEffect(() => {
    if (!shaderMaterial) return;
    materialRef.current = shaderMaterial;
    return () => {
      try { shaderMaterial.dispose && shaderMaterial.dispose(); } catch {}
    };
  }, [shaderMaterial]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !shaderMaterial) return;
    mesh.material = shaderMaterial;
  }, [shaderMaterial]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;

    m.uniforms.uCellSize.value = nCellSize;
    m.uniforms.uDistortion.value = nDistortion;
    m.uniforms.uSpeed.value = nSpeed;
    m.uniforms.uChromatic.value = nChromatic;
    m.uniforms.uEdgeGlow.value = nEdgeGlow;
    m.uniforms.uPosterize.value = nPosterize;
    m.uniforms.uTintStrength.value = nTintStrength;
    m.uniforms.uOpacity.value = nOpacity;
    m.uniforms.uMirror.value = !!mirror;
    m.uniforms.uInvert.value = !!invert;
  }, [
    nCellSize,
    nDistortion,
    nSpeed,
    nChromatic,
    nEdgeGlow,
    nPosterize,
    nTintStrength,
    nOpacity,
    mirror,
    invert,
  ]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    m.uniforms.uTint.value.set(normalizedTint);
  }, [normalizedTint]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;

    m.uniforms.resolution.value.set(Math.max(1, effectiveW), Math.max(1, effectiveH));

    if (isGlobal && renderTarget) {
      renderTarget.setSize(Math.max(1, effectiveW), Math.max(1, effectiveH));
    }
  }, [effectiveW, effectiveH, isGlobal, renderTarget]);

  useFrame((state, delta) => {
    const m = materialRef.current;
    if (!m) return;

    const dt = Number.isFinite(delta) ? delta : 1 / 60;
    m.uniforms.uTime.value += dt;

    if (isGlobal && renderTarget && gl && scene && camera) {
      const currentRT = gl.getRenderTarget();
      const mesh = meshRef.current;
      const wasVisible = mesh ? mesh.visible : undefined;

      if (mesh) mesh.visible = false;

      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
        m.uniforms.inputBuffer.value = renderTarget.texture;
      } finally {
        gl.setRenderTarget(currentRT);
        if (mesh && wasVisible !== undefined) mesh.visible = wasVisible;
      }
    } else if (!isGlobal && videoTexture) {
      if (m.uniforms.inputBuffer.value !== videoTexture) {
        m.uniforms.inputBuffer.value = videoTexture;
      }
    }
  });

  const aspect = useMemo(() => {
    try {
      if (size && size.width > 0 && size.height > 0) return size.width / size.height;
    } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;

  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material' })
  );
}
