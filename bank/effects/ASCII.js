// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};
const useThree = (r3f && r3f.useThree) || (() => null);
const useFrame = (r3f && r3f.useFrame) || (() => {});

export const metadata = {
  name: 'ASCII',
  description: 'ASCII',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'characters', type: 'string', value: " .:,'-^=*+?!|0#X%WM@" },
    { name: 'fontSize', type: 'number', value: 72, min: 8, max: 120, step: 1 },
    { name: 'cellSize', type: 'number', value: 36, min: 4, max: 48, step: 1 },
    { name: 'color', type: 'color', value: '#ffffff' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'preserveColors', type: 'boolean', value: false },
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
          const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
      }
      const c = new THREE.Color(input);
      return `#${c.getHexString()}`;
    }
  } catch {}
  return '#ffffff';
}

export default function ASCII({
  videoTexture,
  characters = " .:,'-^=*+?!|0#X%WM@",
  fontSize = 72,
  cellSize = 36,
  color = '#ffffff',
  invert = false,
  opacity = 1,
  preserveColors = false,
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
    if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; }
  } catch {}

  const effectiveChars = useMemo(() => (typeof characters === 'string' && characters.length > 0 ? characters : ' .'), [characters]);
  const nFontSize = useMemo(() => Math.max(8, Number.isFinite(+fontSize) ? +fontSize : 72), [fontSize]);
  const nCellSize = useMemo(() => Math.max(1, Number.isFinite(+cellSize) ? +cellSize : 36), [cellSize]);
  const nOpacity = useMemo(() => {
    const v = Number(opacity); if (!Number.isFinite(v)) return 1; return Math.max(0, Math.min(1, v));
  }, [opacity]);
  const normalizedColor = useMemo(() => normalizeColor(color), [color]);

  const createCharactersTexture = (chars, fs) => {
    const canvas = document.createElement('canvas');
    const SIZE = 1024; const MAX_PER_ROW = 16; const CELL = SIZE / MAX_PER_ROW;
    canvas.width = canvas.height = SIZE;
    const texture = new THREE.CanvasTexture(canvas, undefined, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestFilter);
    const ctx = canvas.getContext('2d'); if (!ctx) return texture;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.font = `${fs}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    for (let i = 0; i < chars.length; i++) {
      const x = i % MAX_PER_ROW; const y = Math.floor(i / MAX_PER_ROW);
      ctx.fillText(chars[i], x * CELL + CELL / 2, y * CELL + CELL / 2);
    }
    texture.needsUpdate = true; return texture;
  };

  const asciiTexture = useMemo(() => createCharactersTexture(effectiveChars, nFontSize), [effectiveChars, nFontSize]);
  useEffect(() => () => { try { asciiTexture && asciiTexture.dispose && asciiTexture.dispose(); } catch {} }, [asciiTexture]);

  // Ping-pong targets to avoid framebuffer-texture feedback
  const renderTargetA = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(
      Math.max(1, effectiveW), Math.max(1, effectiveH),
      { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    );
  }, [isGlobal, effectiveW, effectiveH]);
  const renderTargetB = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(
      Math.max(1, effectiveW), Math.max(1, effectiveH),
      { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    );
  }, [isGlobal, effectiveW, effectiveH]);
  const pingPongRef = useRef(true);
  useEffect(() => () => { try { renderTargetA && renderTargetA.dispose && renderTargetA.dispose(); } catch {} }, [renderTargetA]);
  useEffect(() => () => { try { renderTargetB && renderTargetB.dispose && renderTargetB.dispose(); } catch {} }, [renderTargetB]);

  const frag = `
uniform sampler2D inputBuffer;
uniform sampler2D uCharacters;
uniform float uCharactersCount;
uniform float uCellSize;
uniform bool uInvert;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPreserveColors;
uniform vec2 resolution;
varying vec2 vUv;
const vec2 SIZE = vec2(16.);
vec3 greyscale(vec3 color, float strength) { float g = dot(color, vec3(0.299, 0.587, 0.114)); return mix(color, vec3(g), strength); }
vec3 greyscale(vec3 color) { return greyscale(color, 1.0); }
void main() {
  vec2 uv = vUv;
  vec2 cell = resolution / uCellSize;
  vec2 grid = 1.0 / cell;
  vec2 pixelizedUV = grid * (0.5 + floor(uv / grid));
  vec4 pixelized = texture2D(inputBuffer, pixelizedUV);
  float greyscaled = greyscale(pixelized.rgb).r;
  if (uInvert) { greyscaled = 1.0 - greyscaled; }
  float characterIndex = floor((uCharactersCount - 1.0) * greyscaled);
  vec2 characterPosition = vec2(mod(characterIndex, SIZE.x), floor(characterIndex / SIZE.y));
  vec2 offset = vec2(characterPosition.x, -characterPosition.y) / SIZE;
  vec2 charUV = mod(uv * (cell / SIZE), 1.0 / SIZE) - vec2(0., 1.0 / SIZE) + offset;
  vec4 asciiCharacter = texture2D(uCharacters, charUV);
  vec3 baseColor = mix(uColor, pixelized.rgb, uPreserveColors);
  asciiCharacter.rgb = baseColor * asciiCharacter.r;
  asciiCharacter.a = pixelized.a * uOpacity;
  gl_FragColor = asciiCharacter;
}`;

  const shaderMaterial = useMemo(() => {
    if (!asciiTexture) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat) },
        uCharacters: { value: asciiTexture },
        uCellSize: { value: nCellSize },
        uCharactersCount: { value: Math.max(1, effectiveChars.length) },
        uColor: { value: new THREE.Color(normalizedColor) },
        uInvert: { value: !!invert },
        uOpacity: { value: nOpacity },
        uPreserveColors: { value: preserveColors ? 1 : 0 },
        resolution: { value: new THREE.Vector2(Math.max(1, effectiveW), Math.max(1, effectiveH)) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: frag,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
  }, [asciiTexture, nCellSize, effectiveChars.length, normalizedColor, invert, nOpacity, preserveColors, effectiveW, effectiveH]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useEffect(() => {
    const mesh = meshRef.current; if (!mesh || !shaderMaterial) return; mesh.material = shaderMaterial;
  }, [shaderMaterial]);

  useEffect(() => { const m = materialRef.current; if (!m) return; m.uniforms.uCharacters.value = asciiTexture; }, [asciiTexture]);
  useEffect(() => { const m = materialRef.current; if (!m) return; m.uniforms.uColor.value.set(normalizedColor); }, [normalizedColor]);
  useEffect(() => {
    const m = materialRef.current; if (!m) return;
    m.uniforms.uCellSize.value = nCellSize;
    m.uniforms.uCharactersCount.value = Math.max(1, effectiveChars.length);
    m.uniforms.uInvert.value = !!invert;
    m.uniforms.uOpacity.value = nOpacity;
    m.uniforms.uPreserveColors.value = preserveColors ? 1 : 0;
  }, [nCellSize, effectiveChars.length, invert, nOpacity, preserveColors]);

  useFrame(() => {
    const m = materialRef.current; if (!m || !shaderMaterial) return;
    if (isGlobal && renderTargetA && renderTargetB && gl && scene && camera) {
      const currentRT = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        const writeRT = pingPongRef.current ? renderTargetA : renderTargetB;
        const readRT = pingPongRef.current ? renderTargetB : renderTargetA;
        gl.setRenderTarget(writeRT); gl.render(scene, camera);
        if (m.uniforms.inputBuffer.value !== readRT.texture) m.uniforms.inputBuffer.value = readRT.texture;
        pingPongRef.current = !pingPongRef.current;
      }
      finally { gl.setRenderTarget(currentRT); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
    } else if (!isGlobal && videoTexture) {
      if (m.uniforms.inputBuffer.value !== videoTexture) m.uniforms.inputBuffer.value = videoTexture;
    }
  });

  useEffect(() => {
    const m = materialRef.current; if (!m) return;
    m.uniforms.resolution.value.set(Math.max(1, effectiveW), Math.max(1, effectiveH));
    if (isGlobal && renderTargetA && renderTargetB) {
      renderTargetA.setSize(Math.max(1, effectiveW), Math.max(1, effectiveH));
      renderTargetB.setSize(Math.max(1, effectiveW), Math.max(1, effectiveH));
    }
  }, [effectiveW, effectiveH, isGlobal, renderTargetA, renderTargetB]);

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial || !asciiTexture) return null;
  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] })
  );
}


