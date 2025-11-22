// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Ink Bloom — Reactive Diffusion & Viscous Flow',
  description:
    'A viscous ink-and-water style feedback effect: advective flow, diffusion-like bloom, staining/bleed, viscous hug, and glowing highlights. Produces organic spreading ink that reacts to scene changes and forms luminous blooms at high contrast.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'flowSpeed', type: 'number', value: 0.9, min: 0.0, max: 4.0, step: 0.01 },
    { name: 'diffusion', type: 'number', value: 0.7, min: 0.0, max: 2.5, step: 0.01 },
    { name: 'stain', type: 'number', value: 0.6, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'bleed', type: 'number', value: 0.8, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'viscosity', type: 'number', value: 0.45, min: 0.0, max: 1.5, step: 0.01 },
    { name: 'glow', type: 'number', value: 0.35, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'decay', type: 'number', value: 0.03, min: 0.0, max: 1.0, step: 0.005 },
    { name: 'grain', type: 'number', value: 0.025, min: 0.0, max: 0.2, step: 0.001 },
    { name: 'hueShift', type: 'number', value: 0.12, min: -1.0, max: 1.0, step: 0.001 },
    { name: 'seed', type: 'number', value: 42.0, min: 0.0, max: 1000.0, step: 1.0 },
  ],
};

export default function InkBloomReactive({
  videoTexture,
  isGlobal = false,
  flowSpeed = 0.9,
  diffusion = 0.7,
  stain = 0.6,
  bleed = 0.8,
  viscosity = 0.45,
  glow = 0.35,
  decay = 0.03,
  grain = 0.025,
  hueShift = 0.12,
  seed = 42.0,
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

  const feedbackA = useMemo(
    () =>
      new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),
    [effectiveW, effectiveH],
  );

  const feedbackB = useMemo(
    () =>
      new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),
    [effectiveW, effectiveH],
  );

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
      uniform float uTime;
      uniform float uSeed;
      uniform float uFlowSpeed;
      uniform float uDiffusion;
      uniform float uStain;
      uniform float uBleed;
      uniform float uViscosity;
      uniform float uGlow;
      uniform float uDecay;
      uniform float uGrain;
      uniform float uHueShift;

      // small helpers
      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7) + uSeed);
        p = p * (p + 34.345);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.6;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      // simple curl noise for advection
      vec2 curl(vec2 p) {
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

      // small hue rotate in RGB by angle (approx)
      vec3 hueRotate(vec3 color, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        mat3 m = mat3(
          0.299 + 0.701 * c + 0.168 * s, 0.587 - 0.587 * c + 0.330 * s, 0.114 - 0.114 * c - 0.497 * s,
          0.299 - 0.299 * c - 0.328 * s, 0.587 + 0.413 * c + 0.035 * s, 0.114 - 0.114 * c + 0.292 * s,
          0.299 - 0.3 * c + 1.25 * s,   0.587 - 0.588 * c - 1.05 * s,    0.114 + 0.886 * c - 0.203 * s
        );
        return clamp(m * color, 0.0, 1.0);
      }

      void main() {
        vec2 uv = vUv;
        vec2 res = uResolution;
        vec2 uvn = uv * res / min(res.x, res.y);

        // flow field
        vec2 pf = uvn * 0.9 + vec2(uTime * 0.05);
        vec2 f = curl(pf) * (0.5 + fbm(pf * 0.6) * 0.6);

        // advect previous feedback (viscous advection)
        vec2 adv = f * uFlowSpeed * 0.0018;
        vec2 prevUV = clamp(uv - adv, 0.0, 1.0);

        // fetch previous and current
        vec3 prevC = texture2D(tPrev, prevUV).rgb;
        vec3 currC = texture2D(tCurr, uv).rgb;

        // discrete Laplacian on prev (for diffusion)
        vec2 e = 1.0 / uResolution;
        vec3 nC = texture2D(tPrev, prevUV + vec2(0.0, e.y)).rgb;
        vec3 sC = texture2D(tPrev, prevUV - vec2(0.0, e.y)).rgb;
        vec3 eC = texture2D(tPrev, prevUV + vec2(e.x, 0.0)).rgb;
        vec3 wC = texture2D(tPrev, prevUV - vec2(e.x, 0.0)).rgb;
        vec3 lap = (nC + sC + eC + wC - 4.0 * prevC);

        // diffusion-like spread
        vec3 spread = prevC + lap * uDiffusion * 0.5;

        // reaction: interact with new frame luminance to stain / seed ink
        float currL = luma(currC);
        float prevL = luma(prevC);
        // activation where scene has contrast/change: pushes ink to form
        float activation = smoothstep(0.02, 0.25, abs(currL - prevL)) * uStain;

        // bleed: allow ink to pick color from current frame where strong
        vec3 stained = mix(spread, mix(spread, currC * 1.15, activation * 0.9), clamp(uBleed + activation * 0.5, 0.0, 1.0));

        // viscosity dampens small variations to create thick flow
        stained = mix(stained, prevC, clamp(uViscosity, 0.0, 1.0));

        // add directional smear along flow to emulate dragging of wet ink
        vec3 smearA = texture2D(tPrev, clamp(prevUV + adv * 2.5, 0.0, 1.0)).rgb;
        stained = mix(stained, smearA, clamp(length(f) * 0.6 * uFlowSpeed, 0.0, 0.9));

        // subtle chromatic bleed: shift channels based on flow direction
        vec2 chrOff = normalize(f + 1e-5) * (0.0012 + 0.0009 * uBleed);
        vec3 cR = texture2D(tPrev, clamp(prevUV + chrOff * 1.2, 0.0, 1.0)).rgb;
        vec3 cB = texture2D(tPrev, clamp(prevUV - chrOff * 1.2, 0.0, 1.0)).rgb;
        vec3 chroma = vec3(cR.r, stained.g, cB.b);
        stained = mix(stained, chroma, 0.08 * uBleed);

        // glow: create luminous bloom where luminance is high or contrast is high
        float lum = luma(stained);
        float glowMask = smoothstep(0.35, 0.75, pow(lum, 1.5)) * uGlow;
        // cheap blurred bloom by sampling around
        vec3 bA = texture2D(tPrev, clamp(prevUV + vec2(e.x, e.y) * 3.0, 0.0, 1.0)).rgb;
        vec3 bB = texture2D(tPrev, clamp(prevUV - vec2(e.x, e.y) * 3.0, 0.0, 1.0)).rgb;
        vec3 bloom = (bA + bB) * 0.5 * glowMask;

        // combine stain + bloom
        vec3 combined = stained + bloom * 0.9;

        // hue shift to give richer ink colors controlled by param
        combined = hueRotate(combined, uHueShift * 3.14159);

        // introduce small procedural speckle for wet breakup
        float n = noise(uvn * 7.0 + vec2(uTime * 0.2));
        combined += (n - 0.5) * uGrain * 0.8;

        // clamp and final decay towards the current direct frame so feedback refreshes
        vec3 outDirect = currC;
        vec3 outCol = mix(combined, outDirect, uDecay);

        // ensure no NaNs or negatives
        outCol = clamp(outCol, 0.0, 1.0);

        gl_FragColor = vec4(outCol, 1.0);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tPrev: { value: null },
        tCurr: { value: null },
        uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
        uTime: { value: 0.0 },
        uSeed: { value: seed },
        uFlowSpeed: { value: flowSpeed },
        uDiffusion: { value: diffusion },
        uStain: { value: stain },
        uBleed: { value: bleed },
        uViscosity: { value: viscosity },
        uGlow: { value: glow },
        uDecay: { value: decay },
        uGrain: { value: grain },
        uHueShift: { value: hueShift },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    const quad = new THREE.Mesh(fsGeom, mat);
    fsScene.add(quad);

    return { fsScene, fsCam, mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // update uniforms
    pass.mat.uniforms.uResolution.value.set(w, h);
    pass.mat.uniforms.uTime.value = clock ? clock.getElapsedTime() : (state.clock ? state.clock.getElapsedTime() : 0);
    pass.mat.uniforms.uSeed.value = seed;
    pass.mat.uniforms.uFlowSpeed.value = flowSpeed;
    pass.mat.uniforms.uDiffusion.value = diffusion;
    pass.mat.uniforms.uStain.value = stain;
    pass.mat.uniforms.uBleed.value = bleed;
    pass.mat.uniforms.uViscosity.value = viscosity;
    pass.mat.uniforms.uGlow.value = glow;
    pass.mat.uniforms.uDecay.value = decay;
    pass.mat.uniforms.uGrain.value = grain;
    pass.mat.uniforms.uHueShift.value = hueShift;

    // determine current source texture
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
      const tx = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
      tx.needsUpdate = true;
      currTex = tx;
    }

    const readRT = readIndexRef.current === 0 ? feedbackA : feedbackB;
    const writeRT = readIndexRef.current === 0 ? feedbackB : feedbackA;

    // prime feedback to avoid black start
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

    // write new feedback frame
    pass.mat.uniforms.tPrev.value = readRT.texture;
    pass.mat.uniforms.tCurr.value = currTex;

    const prevRT = gl.getRenderTarget();
    gl.setRenderTarget(writeRT);
    gl.clear(true, true, true);
    gl.render(pass.fsScene, pass.fsCam);
    gl.setRenderTarget(prevRT);

    // swap
    readIndexRef.current = 1 - readIndexRef.current;
    const latest = readIndexRef.current === 0 ? feedbackA : feedbackB;

    // present
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