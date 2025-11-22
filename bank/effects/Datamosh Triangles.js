const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Datamosh Triangles with Horizontal Glitches',
  description: 'Triangular datamosh mosaic plus horizontal band glitches (shifts & chroma separation).',
  category: 'Effects',
  icon: '',
  author: 'VJ',
  version: '1.1.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'triangleSize', type: 'number', value: 64, min: 4, max: 512, step: 1, description: 'Size in pixels of the square cell that contains two triangles (triangles are halves of this cell).' },
    { name: 'offsetMax', type: 'number', value: 10, min: 0, max: 200, step: 1, description: 'Maximum pixel offset to sample the chosen triangle from.' },
    { name: 'posterizeLevels', type: 'number', value: 16, min: 2, max: 64, step: 1, description: 'Posterization levels applied to glitched triangles.' },
    { name: 'density', type: 'number', value: 0.02, min: 0.0, max: 1.0, step: 0.005, description: 'Fraction of triangles that are glitched.' },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0.0, max: 8.0, step: 0.01, description: 'Speed at which the triangle glitch pattern changes.' },
    { name: 'seed', type: 'number', value: 0.0, min: -1000.0, max: 1000.0, step: 0.1 },
    { name: 'bpm', type: 'number', value: 120, min: 30, max: 240, step: 1 },
    // horizontal glitch parameters
    { name: 'glitchAmount', type: 'number', value: 80, min: 0, max: 1000, step: 1, description: 'Maximum horizontal shift in pixels for glitch bands.' },
    { name: 'bandHeight', type: 'number', value: 6, min: 1, max: 512, step: 1, description: 'Height in pixels of horizontal bands used for glitches.' },
    { name: 'lineDensity', type: 'number', value: 0.08, min: 0.0, max: 1.0, step: 0.005, description: 'Fraction of horizontal bands that are glitched.' },
    { name: 'lineSpeed', type: 'number', value: 2.0, min: 0.0, max: 8.0, step: 0.01, description: 'Speed at which horizontal glitch bands change.' },
    { name: 'chromaSpread', type: 'number', value: 4, min: 0, max: 64, step: 1, description: 'Pixel offset used for chromatic separation on glitched bands.' },
  ],
};

export default function DatamoshTriangles({
  triangleSize = 64,
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
  // new horizontal glitch props (also in metadata)
  glitchAmount = 80,
  bandHeight = 6,
  lineDensity = 0.08,
  lineSpeed = 2.0,
  chromaSpread = 4,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  // fallback buffer texture (simple checker)
  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillRect(32, 32, 32, 32);
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

  const fragmentShader = `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float triangleSize; // px (square cell; we use two triangles per cell)
    uniform float offsetMax; // px
    uniform float posterizeLevels;
    uniform float density;
    uniform float animationSpeed;
    uniform float seed;

    // horizontal glitch uniforms
    uniform float glitchAmount; // px maximum horizontal offset for bands
    uniform float bandHeight; // px height of each band
    uniform float lineDensity; // fraction of bands that glitch
    uniform float lineSpeed; // speed of the horizontal band decision changes
    uniform float chromaSpread; // px chromatic separation for glitched bands

    varying vec2 vUv;

    // single float hash
    float hash1(float n) {
      return fract(sin(n) * 43758.5453123);
    }
    // hash from 2D
    float hash2(vec2 p) {
      float h = dot(p, vec2(127.1, 311.7));
      return fract(sin(h + seed) * 43758.5453123);
    }

    // check if a local point (in [0,1]^2) is in the "lower-left" triangle (x+y <= 1)
    float inLowerLeftTriangle(vec2 local) {
      return step(local.x + local.y, 1.0);
    }

    void main() {
      vec2 res = resolution;
      vec2 pix = vUv * res;

      float s = max(1.0, triangleSize);
      // which square cell (each square contains two triangles)
      vec2 cell = floor(pix / s);
      vec2 local = fract(pix / s); // normalized inside the cell [0,1]

      // to create some visual variation, flip the diagonal alternatingly per cell
      float parity = mod(cell.x + cell.y, 2.0);
      float baseTri = inLowerLeftTriangle(local); // 1.0 if lower-left triangle, 0.0 otherwise
      float tri = baseTri;
      // if parity is 1, flip which half is considered lower-left
      tri = mix(baseTri, 1.0 - baseTri, parity);

      // form a unique index per triangle (two triangles per cell)
      float cols = floor((res.x + s - 1.0) / s);
      float cellIndex = cell.x + cell.y * cols;
      float triIndex = tri; // 0.0 or 1.0
      float index = cellIndex * 2.0 + triIndex;

      // time-stepped randomness so patterns can animate
      float tstep = floor(time * animationSpeed);

      // random decision for this triangle
      float r = hash1(index * 0.713 + tstep * 17.3);
      float chosen = step(0.0, density - r); // 1 when r < density

      // compute centroid of the triangle in pixel coordinates
      // lower-left triangle centroid at (1/3,1/3) in cell coords; upper-right at (2/3,2/3)
      vec2 centroidCell = mix(vec2(2.0/3.0, 2.0/3.0), vec2(1.0/3.0, 1.0/3.0), tri);
      vec2 centroidPx = (cell + centroidCell) * s;

      // per-triangle jitter offsets
      float rx = hash1(index * 1.37 + 0.123 + tstep * 5.1);
      float ry = hash1(index * 3.31 + 4.321 - tstep * 3.7);
      vec2 offsetPx = (vec2(rx, ry) - 0.5) * 2.0 * offsetMax;

      // sampling uv for the triangle (if chosen we sample the centroid + offset)
      vec2 sampleUv = vUv;
      if (chosen > 0.5) {
        vec2 samplePx = centroidPx + offsetPx;
        sampleUv = fract(samplePx / res); // wrap-around sampling
      }

      vec4 sampled = texture2D(tDiffuse, sampleUv);
      vec3 pcolor = floor(sampled.rgb * posterizeLevels) / posterizeLevels;

      // original color
      vec4 original = texture2D(tDiffuse, vUv);

      // mask: 1 inside the triangle that this fragment belongs to, else 0
      float mask = tri; // tri indicates which half this fragment belongs to (1 -> lower-left after parity flip)
      mask = step(0.5, mask);

      // Final triangular replacement
      float apply = chosen * mask;
      vec3 triColor = mix(original.rgb, pcolor, apply);

      // ---------------------------
      // Horizontal band glitch logic
      // ---------------------------
      // Determine band index & whether it is chosen this frame
      float bh = max(1.0, bandHeight);
      float bandIndex = floor(pix.y / bh);
      // use a time-stepped decision per band so bands change discretely
      float bandStep = floor(time * lineSpeed);
      float bandHash = hash1(bandIndex * 12.9898 + bandStep * 78.233 + seed);
      float bandChosen = step(bandHash, lineDensity); // 1 if bandHash <= lineDensity

      // local position inside band (0..1)
      float localY = fract(pix.y / bh);
      // soften band edges a little
      float edge = 0.06;
      float bandEdgeMask = smoothstep(0.0, edge, localY) * (1.0 - smoothstep(1.0 - edge, 1.0, localY));

      // compute horizontal offset in pixels for this band
      float bandOffsetNorm = hash2(vec2(bandIndex, bandStep)) - 0.5; // -0.5..0.5
      float offsetX = bandOffsetNorm * 2.0 * glitchAmount;

      // compose glitched UV: shift horizontally by offsetX
      vec2 glitchedUv = vUv;
      glitchedUv.x = fract((pix.x + offsetX) / res.x);

      // sample with optional chroma separation (R/G/B offsets)
      vec3 glitchedColor;
      if (chromaSpread > 0.5) {
        float cs = chromaSpread / res.x;
        // small +/- offsets for R and B
        vec4 sr = texture2D(tDiffuse, vec2(fract(glitchedUv.x + cs), glitchedUv.y));
        vec4 sg = texture2D(tDiffuse, glitchedUv);
        vec4 sb = texture2D(tDiffuse, vec2(fract(glitchedUv.x - cs), glitchedUv.y));
        glitchedColor = vec3(sr.r, sg.g, sb.b);
      } else {
        glitchedColor = texture2D(tDiffuse, glitchedUv).rgb;
      }

      // combine tri effect and band glitch: band overlay applies on top of tri result
      float bandApply = bandChosen * bandEdgeMask;
      vec3 outColor = mix(triColor, glitchedColor, bandApply);

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
        triangleSize: { value: Math.max(1, triangleSize) },
        offsetMax: { value: offsetMax },
        posterizeLevels: { value: Math.max(1, posterizeLevels) },
        density: { value: Math.max(0, Math.min(1, density)) },
        animationSpeed: { value: Math.max(0.0, animationSpeed) },
        seed: { value: seed },
        // horizontal glitch uniforms
        glitchAmount: { value: Math.max(0, glitchAmount) },
        bandHeight: { value: Math.max(1, bandHeight) },
        lineDensity: { value: Math.max(0, Math.min(1, lineDensity)) },
        lineSpeed: { value: Math.max(0.0, lineSpeed) },
        chromaSpread: { value: Math.max(0, chromaSpread) },
      },
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }, [videoTexture, bufferTexture, isGlobal, renderTarget, effectiveW, effectiveH, triangleSize, offsetMax, posterizeLevels, density, animationSpeed, seed, glitchAmount, bandHeight, lineDensity, lineSpeed, chromaSpread]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    mat.uniforms.time.value = state.clock.elapsedTime;
    mat.uniforms.triangleSize.value = Math.max(1, triangleSize);
    mat.uniforms.offsetMax.value = offsetMax;
    mat.uniforms.posterizeLevels.value = Math.max(1, posterizeLevels);
    mat.uniforms.density.value = Math.max(0, Math.min(1, density));
    mat.uniforms.animationSpeed.value = Math.max(0.0, animationSpeed);
    mat.uniforms.seed.value = seed;
    mat.uniforms.resolution.value.set(effectiveW, effectiveH);

    // update horizontal glitch uniforms
    mat.uniforms.glitchAmount.value = Math.max(0, glitchAmount);
    mat.uniforms.bandHeight.value = Math.max(1, bandHeight);
    mat.uniforms.lineDensity.value = Math.max(0, Math.min(1, lineDensity));
    mat.uniforms.lineSpeed.value = Math.max(0.0, lineSpeed);
    mat.uniforms.chromaSpread.value = Math.max(0, chromaSpread);

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
