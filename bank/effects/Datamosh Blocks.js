// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Datamosh Blocks',
  description: 'Redraws small image regions with slight random offsets and posterization to produce a datamosh-like glitch effect.',
  category: 'Effects',
  icon: '',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'regionSize', type: 'number', value: 64, min: 4, max: 512, step: 1 },
    { name: 'offsetMax', type: 'number', value: 10, min: 0, max: 200, step: 1 },
    { name: 'posterizeLevels', type: 'number', value: 16, min: 2, max: 64, step: 1 },
    { name: 'density', type: 'number', value: 0.02, min: 0.0, max: 1.0, step: 0.005 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0.0, max: 8.0, step: 0.01 },
    { name: 'seed', type: 'number', value: 0.0, min: -1000.0, max: 1000.0, step: 0.1 },
    { name: 'bpm', type: 'number', value: 120, min: 30, max: 240, step: 1 },
  ],
};

export default function DatamoshBlocks({
  regionSize = 64,
  offsetMax = 10,
  posterizeLevels = 16,
  density = 0.02,
  animationSpeed = 1.0,
  seed = 0.0,
  videoTexture,
  bpm = 120,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 8, 48, 48);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // Shader: divide into blocks of size regionSize (px). Randomly choose some blocks (density)
  // and sample them with a small pixel offset. Posterize the sampled block colors.
  const fragmentShader = `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution; // in pixels
    uniform float time;
    uniform float regionSize; // px
    uniform float offsetMax; // px
    uniform float posterizeLevels;
    uniform float density;
    uniform float animationSpeed;
    uniform float seed;
    varying vec2 vUv;

    // cheap random from float
    float hash1(float n) {
      return fract(sin(n) * 43758.5453123);
    }
    // random from vec2
    float hash2(vec2 p){
      float h = dot(p, vec2(127.1, 311.7));
      return fract(sin(h + seed) * 43758.5453123);
    }

    void main() {
      vec2 res = resolution;
      vec2 pix = vUv * res;

      // compute block coordinate and index
      float rs = max(1.0, regionSize);
      vec2 block = floor(pix / rs);
      float cols = floor((res.x + rs - 1.0) / rs); // ~ceil
      float index = block.x + block.y * cols;

      // time stepping so blocks change at integer intervals scaled by animationSpeed
      float tstep = floor(time * animationSpeed);

      // randomness per-block (changes with time)
      float r = hash1(index * 0.717 + tstep * 13.3);

      // decide whether this block is "glitched"
      float chosen = step(1.0 - density, r); // 1.0 when r >= 1-density -> roughly density true
      // alternate formulation clearer: chosen if r < density
      chosen = step(0.0, density - r);

      // compute offset in pixels for this block if chosen
      float rx = hash1(index * 1.37 + 0.123 + tstep * 7.1);
      float ry = hash1(index * 3.31 + 4.321 - tstep * 5.3);
      // center offsets in range [-0.5, 0.5]
      vec2 offsetPx = (vec2(rx, ry) - 0.5) * 2.0 * offsetMax;

      // compute sample UV
      vec2 offsetUV = offsetPx / res;
      vec2 sampleUv = vUv;
      if (chosen > 0.5) {
        sampleUv = fract(vUv + offsetUV); // wrap edges
      }

      // sample the texture (posterize applied to the sampled color)
      vec4 sampled = texture2D(tDiffuse, sampleUv);
      vec3 pcolor = floor(sampled.rgb * posterizeLevels) / posterizeLevels;

      // get original color for blocks not chosen (or to blend)
      vec4 original = texture2D(tDiffuse, vUv);

      // output: chosen blocks use posterized, offset sample; others keep original
      vec3 outColor = mix(original.rgb, pcolor, chosen);

      gl_FragColor = vec4(outColor, 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || bufferTexture);
    return new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture },
        time: { value: 0.0 },
        resolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
        regionSize: { value: Math.max(1, regionSize) },
        offsetMax: { value: offsetMax },
        posterizeLevels: { value: Math.max(1, posterizeLevels) },
        density: { value: Math.max(0, Math.min(1, density)) },
        animationSpeed: { value: Math.max(0.0, animationSpeed) },
        seed: { value: seed },
      },
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }, [videoTexture, bufferTexture, isGlobal, renderTarget, effectiveW, effectiveH, regionSize, offsetMax, posterizeLevels, density, animationSpeed, seed]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    mat.uniforms.time.value = state.clock.elapsedTime;
    mat.uniforms.regionSize.value = Math.max(1, regionSize);
    mat.uniforms.offsetMax.value = offsetMax;
    mat.uniforms.posterizeLevels.value = Math.max(1, posterizeLevels);
    mat.uniforms.density.value = Math.max(0, Math.min(1, density));
    mat.uniforms.animationSpeed.value = Math.max(0.0, animationSpeed);
    mat.uniforms.seed.value = seed;
    mat.uniforms.resolution.value.set(effectiveW, effectiveH);

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (mat.uniforms.tDiffuse.value !== renderTarget.texture) {
        mat.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else {
      const nextTex = (videoTexture || bufferTexture);
      if (mat.uniforms.tDiffuse.value !== nextTex) {
        mat.uniforms.tDiffuse.value = nextTex;
      }
    }
  });

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef })
  );
}