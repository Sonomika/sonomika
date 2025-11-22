// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Blocky Bad Encode',
  description: 'Harsh low-resolution codec look. Big monochrome blocks with temporal hold and smearing.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'blockSize', type: 'number', value: 12.0, min: 4.0, max: 64.0, step: 1.0 },
    { name: 'levels', type: 'number', value: 24, min: 2, max: 128, step: 1 },
    { name: 'holdStrength', type: 'number', value: 0.85, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'holdThreshold', type: 'number', value: 0.12, min: 0.0, max: 1.0, step: 0.005 },
    { name: 'smearPixels', type: 'number', value: 1.25, min: 0.0, max: 8.0, step: 0.05 },
    { name: 'jitter', type: 'number', value: 0.35, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'macroGrain', type: 'number', value: 0.18, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'contrast', type: 'number', value: 1.15, min: 0.5, max: 2.5, step: 0.01 },
    { name: 'blackCrush', type: 'number', value: 0.06, min: 0.0, max: 0.3, step: 0.005 },
    { name: 'rightBar', type: 'number', value: 0.06, min: 0.0, max: 0.4, step: 0.005 }, // black pillar on right
    { name: 'seed', type: 'number', value: 3.0, min: 0.0, max: 1000.0, step: 1.0 },
  ],
};

export default function BlockyBadEncode({
  videoTexture,
  isGlobal = false,
  blockSize = 12.0,
  levels = 24,
  holdStrength = 0.85,
  holdThreshold = 0.12,
  smearPixels = 1.25,
  jitter = 0.35,
  macroGrain = 0.18,
  contrast = 1.15,
  blackCrush = 0.06,
  rightBar = 0.06,
  seed = 3.0,
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
      gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; clock = ctx.clock;
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

  const fbA = useMemo(() => new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
  }), [effectiveW, effectiveH]);

  const fbB = useMemo(() => new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
  }), [effectiveW, effectiveH]);

  useEffect(() => () => {
    try { captureRT && captureRT.dispose(); fbA && fbA.dispose(); fbB && fbB.dispose(); } catch {}
  }, [captureRT, fbA, fbB]);

  const pass = useMemo(() => {
    const fsScene = new THREE.Scene();
    const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geom = new THREE.PlaneGeometry(2, 2);

    const vsh = `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `;

    const fsh = `
      precision highp float;
      varying vec2 vUv;

      uniform sampler2D tPrev;
      uniform sampler2D tCurr;
      uniform vec2 uResolution;

      uniform float uBlock;
      uniform float uLevels;
      uniform float uHoldStrength;
      uniform float uHoldThreshold;
      uniform float uSmearPixels;
      uniform float uJitter;
      uniform float uMacroGrain;
      uniform float uContrast;
      uniform float uBlackCrush;
      uniform float uRightBar;
      uniform float uTime;
      uniform float uSeed;

      float hash(vec2 p){
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p.x + p.y + uSeed) * 43758.5453123);
      }

      float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      vec3 mono(float y){ return vec3(y); }

      void main(){
        vec2 texel = 1.0 / uResolution;
        vec2 px = vUv * uResolution;

        // Black pillar at right for the taped look
        if (vUv.x > 1.0 - uRightBar) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Macroblock coordinates
        vec2 bcoord = floor(px / uBlock);
        vec2 bcentrePx = (bcoord + 0.5) * uBlock;

        // Jitter per block to mimic misaligned motion vectors
        vec2 j = (vec2(hash(bcoord + floor(uTime*0.5)), hash(bcoord + 13.7 + floor(uTime*0.5))) - 0.5) * uJitter;
        vec2 currUV = (bcentrePx * texel) + j * texel;

        // Current luma sampled on coarse grid
        float yCurr = luma(texture2D(tCurr, clamp(currUV, 0.0, 1.0)).rgb);

        // Quantise luma
        float yQ = floor(yCurr * uLevels) / max(uLevels - 1.0, 1.0);

        // Previous feedback, offset slightly for smear
        vec2 smearDir = normalize(vec2(0.8, 0.2));
        vec2 smearOff = smearDir * texel * uSmearPixels;
        float yPrev = luma(texture2D(tPrev, clamp(vUv - smearOff, 0.0, 1.0)).rgb);

        // Decide whether to hold previous based on change inside the block
        float diff = abs(yQ - yPrev);
        float wHold = smoothstep(uHoldThreshold * 1.5, uHoldThreshold, diff) * uHoldStrength;

        // Macro-grain tied to the block cell
        vec2 cell = fract(px / uBlock);
        float edge = 1.0 - min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y)) * 2.0;
        float edgeMask = smoothstep(0.6, 1.0, edge);
        float grain = (hash(bcoord + floor(uTime*30.0)) - 0.5) * uMacroGrain * edgeMask;

        float yOut = mix(yQ, yPrev, wHold) + grain;

        // Contrast and black crush
        yOut = max(0.0, yOut - uBlackCrush);
        yOut = clamp(0.5 + (yOut - 0.5) * uContrast, 0.0, 1.0);

        gl_FragColor = vec4(mono(yOut), 1.0);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader: vsh,
      fragmentShader: fsh,
      uniforms: {
        tPrev: { value: null },
        tCurr: { value: null },
        uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
        uBlock: { value: blockSize },
        uLevels: { value: levels },
        uHoldStrength: { value: holdStrength },
        uHoldThreshold: { value: holdThreshold },
        uSmearPixels: { value: smearPixels },
        uJitter: { value: jitter },
        uMacroGrain: { value: macroGrain },
        uContrast: { value: contrast },
        uBlackCrush: { value: blackCrush },
        uRightBar: { value: rightBar },
        uTime: { value: 0.0 },
        uSeed: { value: seed },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    const quad = new THREE.Mesh(geom, mat);
    fsScene.add(quad);

    return { fsScene, fsCam, mat };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveW, effectiveH]); // uniforms are updated per frame

  const screenMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: fbA.texture });
    screenMatRef.current = m;
    return m;
  }, [fbA]);

  const readRef = useRef(0);
  const primedRef = useRef(false);

  useFrame((state) => {
    if (!gl || !pass || !screenMatRef.current) return;

    const w = Math.max(1, (size && size.width) || effectiveW);
    const h = Math.max(1, (size && size.height) || effectiveH);

    // Update uniforms
    pass.mat.uniforms.uResolution.value.set(w, h);
    pass.mat.uniforms.uBlock.value = blockSize;
    pass.mat.uniforms.uLevels.value = levels;
    pass.mat.uniforms.uHoldStrength.value = holdStrength;
    pass.mat.uniforms.uHoldThreshold.value = holdThreshold;
    pass.mat.uniforms.uSmearPixels.value = smearPixels;
    pass.mat.uniforms.uJitter.value = jitter;
    pass.mat.uniforms.uMacroGrain.value = macroGrain;
    pass.mat.uniforms.uContrast.value = contrast;
    pass.mat.uniforms.uBlackCrush.value = blackCrush;
    pass.mat.uniforms.uRightBar.value = rightBar;
    pass.mat.uniforms.uSeed.value = seed;
    pass.mat.uniforms.uTime.value = clock ? clock.getElapsedTime() : (state.clock ? state.clock.getElapsedTime() : 0);

    // Determine current source
    let currTex = null;
    if (isGlobal && captureRT && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(captureRT);
        gl.clear(true, true, true);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      currTex = captureRT.texture;
    } else if (videoTexture) {
      currTex = videoTexture;
    } else {
      const dt = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
      dt.needsUpdate = true;
      currTex = dt;
    }

    const readRT = readRef.current === 0 ? fbA : fbB;
    const writeRT = readRef.current === 0 ? fbB : fbA;

    // Prime once
    if (!primedRef.current) {
      const prev = gl.getRenderTarget();
      pass.mat.uniforms.tPrev.value = currTex;
      pass.mat.uniforms.tCurr.value = currTex;
      gl.setRenderTarget(readRT);
      gl.clear(true, true, true);
      gl.render(pass.fsScene, pass.fsCam);
      gl.setRenderTarget(prev);
      primedRef.current = true;
    }

    // Feedback update
    pass.mat.uniforms.tPrev.value = readRT.texture;
    pass.mat.uniforms.tCurr.value = currTex;

    const prev = gl.getRenderTarget();
    gl.setRenderTarget(writeRT);
    gl.clear(true, true, true);
    gl.render(pass.fsScene, pass.fsCam);
    gl.setRenderTarget(prev);

    // Swap
    readRef.current = 1 - readRef.current;
    const latest = readRef.current === 0 ? fbA : fbB;

    if (screenMatRef.current.map !== latest.texture) {
      screenMatRef.current.map = latest.texture;
      screenMatRef.current.needsUpdate = true;
    }
  });

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: screenMaterial, attach: 'material' }),
  );
}
