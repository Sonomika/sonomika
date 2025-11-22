// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Chromatic Drift & Edge Dissolve',
  description: 'A feedback-based flowing drift with chromatic separation and edge-aware dissolve creates drifting colour ribbons that break on scene edits.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'driftScale', type: 'number', value: 0.50, min: 0.0, max: 3.0, step: 0.01 },
    { name: 'speed', type: 'number', value: 6.00, min: 0.0, max: 6.0, step: 0.01 },
    { name: 'frequency', type: 'number', value: 4.59, min: 0.1, max: 8.0, step: 0.01 },
    { name: 'chroma', type: 'number', value: 0.000, min: 0.0, max: 0.05, step: 0.0005 },
    { name: 'edgeThreshold', type: 'number', value: 1.000, min: 0.0, max: 1.0, step: 0.005 },
    { name: 'dissolve', type: 'number', value: 1.00, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'decay', type: 'number', value: 0.210, min: 0.0, max: 1.0, step: 0.005 },
    { name: 'grain', type: 'number', value: 0.059, min: 0.0, max: 0.2, step: 0.001 },
    { name: 'seed', type: 'number', value: 96.0, min: 0.0, max: 1000.0, step: 1.0 },
  ],
};

export default function ChromaticDriftEdgeDissolve({
  videoTexture,
  isGlobal = false,
  driftScale = 0.50,
  speed = 6.00,
  frequency = 4.59,
  chroma = 0.000,
  edgeThreshold = 1.000,
  dissolve = 1.00,
  decay = 0.210,
  grain = 0.059,
  seed = 96.0,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const screenMatRef = useRef(null);

  let gl, scene, camera, size, clock;
  try {
    const ctx = useThree();
    if (ctx) {
      gl = ctx.gl;
      scene = ctx.scene;
      camera = ctx.camera;
      size = ctx.size;
      clock = ctx.clock;
    }
  } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const captureRT = useMemo(() => {
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

  const feedbackA = useMemo(() => new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [effectiveW, effectiveH]);

  const feedbackB = useMemo(() => new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [effectiveW, effectiveH]);

  useEffect(() => () => {
    try {
      captureRT && captureRT.dispose && captureRT.dispose();
      feedbackA && feedbackA.dispose && feedbackA.dispose();
      feedbackB && feedbackB.dispose && feedbackB.dispose();
    } catch {}
  }, [captureRT, feedbackA, feedbackB]);

  const pass = useMemo(() => {
    const fsScene = new THREE.Scene();
    const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const fsGeom = new THREE.PlaneGeometry(2, 2);

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D tPrev;
      uniform sampler2D tCurr;
      uniform vec2 uResolution;
      uniform float uDriftScale;
      uniform float uSpeed;
      uniform float uFreq;
      uniform float uChroma;
      uniform float uEdgeThreshold;
      uniform float uDissolve;
      uniform float uDecay;
      uniform float uGrain;
      uniform float uTime;
      uniform float uSeed;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21) + uSeed);
        p += dot(p, p + 78.233);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i + vec2(0.0, 0.0));
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        for (int i = 0; i < 5; i++) {
          v += amp * noise(p * freq);
          freq *= 2.0;
          amp *= 0.5;
        }
        return v;
      }

      vec2 curlNoise(vec2 p) {
        float e = 0.0015;
        float n1 = fbm(p + vec2(e, 0.0));
        float n2 = fbm(p - vec2(e, 0.0));
        float n3 = fbm(p + vec2(0.0, e));
        float n4 = fbm(p - vec2(0.0, e));
        float dx = (n1 - n2) / (2.0 * e);
        float dy = (n3 - n4) / (2.0 * e);
        return vec2(dy, -dx);
      }

      float luma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      void main() {
        vec2 uv = vUv;
        vec2 res = uResolution;
        vec2 uvn = uv * res / min(res.x, res.y);
        vec2 p = uvn * uFreq + vec2(uTime * 0.08);
        vec2 flow = curlNoise(p);
        vec2 adv = flow * uDriftScale * uSpeed * 0.0015;
        vec2 prevUV = clamp(uv + adv, 0.0, 1.0);
        float angle = atan(flow.y, flow.x);
        vec2 ortho = vec2(cos(angle), sin(angle));
        vec3 prevR = texture2D(tPrev, clamp(prevUV + ortho * uChroma * 1.0, 0.0, 1.0)).rgb;
        vec3 prevG = texture2D(tPrev, clamp(prevUV, 0.0, 1.0)).rgb;
        vec3 prevB = texture2D(tPrev, clamp(prevUV - ortho * uChroma * 1.0, 0.0, 1.0)).rgb;
        vec3 prevColor = vec3(prevR.r, prevG.g, prevB.b);
        vec3 softPrev = (
          texture2D(tPrev, clamp(prevUV + vec2(0.0, uChroma*2.0), 0.0, 1.0)).rgb +
          texture2D(tPrev, clamp(prevUV + vec2(uChroma*2.0, 0.0), 0.0, 1.0)).rgb +
          prevColor
        ) / 3.0;
        vec3 curr = texture2D(tCurr, uv).rgb;
        float dl = abs(luma(curr) - luma(softPrev));
        float edgeW = smoothstep(uEdgeThreshold * 0.5, uEdgeThreshold, dl);
        float reveal = mix(1.0 - uDissolve, 1.0, edgeW);
        vec3 mixed = mix(prevColor, curr, reveal);
        mixed = mix(mixed, softPrev, 0.08);
        float g = (hash(uv * (uTime + uSeed)) - 0.5) * uGrain;
        mixed += g;
        vec3 outCol = mix(mixed, curr, uDecay);
        gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tPrev: { value: null },
        tCurr: { value: null },
        uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
        uDriftScale: { value: driftScale },
        uSpeed: { value: speed },
        uFreq: { value: frequency },
        uChroma: { value: chroma },
        uEdgeThreshold: { value: edgeThreshold },
        uDissolve: { value: dissolve },
        uDecay: { value: decay },
        uGrain: { value: grain },
        uTime: { value: 0.0 },
        uSeed: { value: seed },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    const quad = new THREE.Mesh(fsGeom, mat);
    fsScene.add(quad);

    return { fsScene, fsCam, mat };
  }, [effectiveW, effectiveH]);

  const screenMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: feedbackA.texture,
      transparent: false,
    });
    screenMatRef.current = m;
    return m;
  }, [feedbackA]);

  const readIndexRef = useRef(0);
  const initialisedRef = useRef(false);

  useFrame((state) => {
    if (!gl || !pass || !screenMatRef.current) return;

    const w = Math.max(1, (size && size.width) || effectiveW);
    const h = Math.max(1, (size && size.height) || effectiveH);

    pass.mat.uniforms.uResolution.value.set(w, h);
    pass.mat.uniforms.uDriftScale.value = driftScale;
    pass.mat.uniforms.uSpeed.value = speed;
    pass.mat.uniforms.uFreq.value = frequency;
    pass.mat.uniforms.uChroma.value = chroma;
    pass.mat.uniforms.uEdgeThreshold.value = edgeThreshold;
    pass.mat.uniforms.uDissolve.value = dissolve;
    pass.mat.uniforms.uDecay.value = decay;
    pass.mat.uniforms.uGrain.value = grain;
    pass.mat.uniforms.uSeed.value = seed;
    pass.mat.uniforms.uTime.value = clock ? clock.getElapsedTime() : (state.clock ? state.clock.getElapsedTime() : 0);

    let currTex = null;

    if (isGlobal && captureRT && scene && camera) {
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      const prevRT = gl.getRenderTarget();
      try {
        gl.setRenderTarget(captureRT);
        gl.clear(true, true, true);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prevRT);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      currTex = captureRT.texture;
    } else if (videoTexture) {
      currTex = videoTexture;
    } else {
      currTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
      currTex.needsUpdate = true;
    }

    const readRT = readIndexRef.current === 0 ? feedbackA : feedbackB;
    const writeRT = readIndexRef.current === 0 ? feedbackB : feedbackA;

    if (!initialisedRef.current) {
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(readRT);
      gl.clear(true, true, true);
      pass.mat.uniforms.tPrev.value = currTex;
      pass.mat.uniforms.tCurr.value = currTex;
      gl.render(pass.fsScene, pass.fsCam);
      gl.setRenderTarget(prev);
      initialisedRef.current = true;
    }

    pass.mat.uniforms.tPrev.value = readRT.texture;
    pass.mat.uniforms.tCurr.value = currTex;

    const prevRT = gl.getRenderTarget();
    gl.setRenderTarget(writeRT);
    gl.clear(true, true, true);
    gl.render(pass.fsScene, pass.fsCam);
    gl.setRenderTarget(prevRT);

    readIndexRef.current = 1 - readIndexRef.current;
    const latest = readIndexRef.current === 0 ? feedbackA : feedbackB;

    if (screenMatRef.current.map !== latest.texture) {
      screenMatRef.current.map = latest.texture;
      screenMatRef.current.needsUpdate = true;
    }
  });

  const aspect = useMemo(() => {
    try {
      if (size && size.width > 0 && size.height > 0) return size.width / size.height;
    } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: screenMaterial, attach: 'material' }),
  );
}
