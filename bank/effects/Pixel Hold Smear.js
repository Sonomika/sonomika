// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Pixel Hold Smear',
  description: 'Datamosh-like temporal smear. Holds macroblock colours and advects previous frame pixels.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'blockSize', type: 'number', value: 8.0, min: 1.0, max: 64.0, step: 1.0 },
    { name: 'hold', type: 'number', value: 0.85, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'threshold', type: 'number', value: 0.1, min: 0.0, max: 1.0, step: 0.005 },
    { name: 'smearAngle', type: 'number', value: 0.0, min: 0.0, max: Math.PI * 2.0, step: 0.01 },
    { name: 'smearPixels', type: 'number', value: 2.0, min: 0.0, max: 32.0, step: 0.25 },
    { name: 'decay', type: 'number', value: 0.02, min: 0.0, max: 1.0, step: 0.005 },
    { name: 'jitter', type: 'number', value: 0.25, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'seed', type: 'number', value: 1.0, min: 0.0, max: 1000.0, step: 1.0 },
  ],
};

export default function PixelHoldSmear({
  videoTexture,
  isGlobal = false,
  blockSize = 8.0,
  hold = 0.85,
  threshold = 0.1,
  smearAngle = 0.0,
  smearPixels = 2.0,
  decay = 0.02,
  jitter = 0.25,
  seed = 1.0,
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

  // Source capture target when running globally
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

  // Two ping-pong feedback buffers
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

  // Fullscreen pass to update feedback = f(prev, current)
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
      uniform float uBlock;
      uniform float uHold;
      uniform float uThreshold;
      uniform float uSmearAngle;
      uniform float uSmearPixels;
      uniform float uDecay;
      uniform float uJitter;
      uniform float uTime;
      uniform float uSeed;

      float hash(vec2 p) {
        // Stable per-block noise
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p.x + p.y * 1e3 + uSeed) * 43758.5453123);
      }

      vec2 rand2(vec2 p) {
        float n = hash(p);
        float a = 6.2831853 * n;
        return vec2(cos(a), sin(a));
      }

      void main() {
        vec2 texel = 1.0 / uResolution;

        // Quantise to macroblocks like MPEG
        vec2 px = vUv * uResolution;
        vec2 blockCoord = floor(px / uBlock);
        vec2 blockCentrePx = (blockCoord + 0.5) * uBlock;
        vec2 blockUV = blockCentrePx * texel;

        // Jitter per block to mimic broken motion vectors
        vec2 jitterVec = rand2(blockCoord + floor(uTime * 0.25)) * uJitter;
        vec2 jitterUV = jitterVec * texel;

        // Current frame sampled at macroblock centre
        vec3 cCurr = texture2D(tCurr, clamp(blockUV + jitterUV, 0.0, 1.0)).rgb;

        // Previous feedback, advected along a direction to create smear
        vec2 dir = vec2(cos(uSmearAngle), sin(uSmearAngle));
        vec2 smearOffset = dir * texel * uSmearPixels;

        vec3 cPrev = texture2D(tPrev, clamp(vUv - smearOffset, 0.0, 1.0)).rgb;

        // Luma difference to decide whether to hold previous
        float lCurr = dot(cCurr, vec3(0.2126, 0.7152, 0.0722));
        float lPrev = dot(cPrev, vec3(0.2126, 0.7152, 0.0722));
        float diff = abs(lCurr - lPrev);

        // When difference is small, prefer previous to create stuck blocks
        float wHold = smoothstep(uThreshold * 1.5, uThreshold, diff);

        // Blend with decay so things eventually recover
        vec3 held = mix(cCurr, cPrev, uHold * wHold);
        vec3 outCol = mix(held, cCurr, uDecay);

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
        uBlock: { value: blockSize },
        uHold: { value: hold },
        uThreshold: { value: threshold },
        uSmearAngle: { value: smearAngle },
        uSmearPixels: { value: smearPixels },
        uDecay: { value: decay },
        uJitter: { value: jitter },
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveW, effectiveH]); // material uniforms will be updated each frame

  // Screen material simply displays the latest feedback texture
  const screenMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: feedbackA.texture, // temporary, will be swapped
      transparent: false,
    });
    screenMatRef.current = m;
    return m;
  }, [feedbackA]);

  // Track which feedback buffer is read or write
  const readIndexRef = useRef(0);
  const initialisedRef = useRef(false);

  useFrame((state) => {
    if (!gl || !pass || !screenMatRef.current) return;

    const w = Math.max(1, (size && size.width) || effectiveW);
    const h = Math.max(1, (size && size.height) || effectiveH);

    // Keep uniforms fresh
    pass.mat.uniforms.uResolution.value.set(w, h);
    pass.mat.uniforms.uBlock.value = blockSize;
    pass.mat.uniforms.uHold.value = hold;
    pass.mat.uniforms.uThreshold.value = threshold;
    pass.mat.uniforms.uSmearAngle.value = smearAngle;
    pass.mat.uniforms.uSmearPixels.value = smearPixels;
    pass.mat.uniforms.uDecay.value = decay;
    pass.mat.uniforms.uJitter.value = jitter;
    pass.mat.uniforms.uSeed.value = seed;
    pass.mat.uniforms.uTime.value = clock ? clock.getElapsedTime() : (state.clock ? state.clock.getElapsedTime() : 0);

    // Determine current source texture
    let currTex = null;

    if (isGlobal && captureRT && scene && camera) {
      // Hide our mesh while capturing the scene
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
      // Fallback to black
      currTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
      currTex.needsUpdate = true;
    }

    const readRT = readIndexRef.current === 0 ? feedbackA : feedbackB;
    const writeRT = readIndexRef.current === 0 ? feedbackB : feedbackA;

    // Prime the feedback once so we do not start from black
    if (!initialisedRef.current) {
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(readRT);
      gl.clear(true, true, true);
      // Draw currTex directly into readRT
      pass.mat.uniforms.tPrev.value = currTex; // harmless for init
      pass.mat.uniforms.tCurr.value = currTex;
      gl.render(pass.fsScene, pass.fsCam);
      gl.setRenderTarget(prev);
      initialisedRef.current = true;
    }

    // Update feedback: write = f(prev, current)
    pass.mat.uniforms.tPrev.value = readRT.texture;
    pass.mat.uniforms.tCurr.value = currTex;

    const prevRT = gl.getRenderTarget();
    gl.setRenderTarget(writeRT);
    gl.clear(true, true, true);
    gl.render(pass.fsScene, pass.fsCam);
    gl.setRenderTarget(prevRT);

    // Swap
    readIndexRef.current = 1 - readIndexRef.current;
    const latest = readIndexRef.current === 0 ? feedbackA : feedbackB;

    // Present
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
