// Portable external Polar Kaleido Slice effect. Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Polar Kaleido Slice',
  description: 'Radial slices with kaleidoscope mirroring, beat-locked offsets and optional chromatic split.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'sliceCount', type: 'number', value: 24, min: 3, max: 96, step: 1 },
    { name: 'kaleidoSegments', type: 'number', value: 6, min: 1, max: 16, step: 1 },
    { name: 'offsetAmount', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'rotateSpeed', type: 'number', value: 0.25, min: 0.0, max: 3.0, step: 0.01 },
    { name: 'mode', type: 'select', value: 'radial', options: [
      { value: 'radial', label: 'Radial' },
      { value: 'spiral', label: 'Spiral' },
      { value: 'ripple', label: 'Ripple' }
    ]},
    { name: 'feather', type: 'number', value: 0.08, min: 0.0, max: 0.5, step: 0.005 },
    { name: 'beatSnap', type: 'boolean', value: true },
    { name: 'glitchOnBeat', type: 'boolean', value: true },
    { name: 'angleJitter', type: 'number', value: 0.15, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'radiusJitter', type: 'number', value: 0.05, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'chromaSplit', type: 'number', value: 0.003, min: 0.0, max: 0.02, step: 0.0005 },
    { name: 'mirror', type: 'boolean', value: true },
    { name: 'removeGaps', type: 'boolean', value: true },
    { name: 'bpm', type: 'number', value: 128, min: 30, max: 300, step: 1 },
  ],
};

export default function PolarKaleidoSlice({
  sliceCount = 24,
  kaleidoSegments = 6,
  offsetAmount = 0.35,
  rotateSpeed = 0.25,
  mode = 'radial',
  feather = 0.08,
  beatSnap = true,
  glitchOnBeat = true,
  angleJitter = 0.15,
  radiusJitter = 0.05,
  chromaSplit = 0.003,
  mirror = true,
  removeGaps = true,
  bpm = 128,
  videoTexture,
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
    const ctx2 = canvas.getContext('2d');
    if (ctx2) {
      ctx2.fillStyle = '#1a1a1a';
      ctx2.fillRect(0,0,64,64);
      ctx2.fillStyle = '#4a4a4a';
      for (let i = 0; i < 6; i++) {
        ctx2.beginPath();
        ctx2.arc(32, 32, 6 + i * 4, 0, Math.PI * 2);
        ctx2.stroke();
      }
      ctx2.fillStyle = '#ffffff';
      ctx2.fillRect(30, 30, 4, 4);
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
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float sliceCount;
    uniform float kaleidoSegments;
    uniform float offsetAmount;
    uniform float rotateSpeed;
    uniform int mode; // 0 radial, 1 spiral, 2 ripple
    uniform float feather;
    uniform float angleJitter;
    uniform float radiusJitter;
    uniform float chromaSplit;
    uniform int mirror;
    uniform float removeGaps;
    uniform float bpm;
    uniform int inputIsSRGB;
    varying vec2 vUv;

    // Hash utilities
    float hash11(float p){ return fract(sin(p*127.1)*43758.5453); }
    float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    // Beat phase and snapping
    float beatPhase(float t, float bpmVal){
      float beats = t * (bpmVal / 60.0);
      return fract(beats);
    }

    // Simple rotation
    mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

    // Kaleidoscope reflection around N angular segments
    vec2 kaleido(vec2 p, float segments){
      float ang = atan(p.y, p.x);
      float r = length(p);
      float seg = 6.28318530718 / max(1.0, segments);
      ang = mod(ang, seg);
      if (mirror == 1) {
        ang = min(ang, seg - ang);
      }
      return vec2(cos(ang), sin(ang)) * r;
    }

    // Convert screen uv to polar space around centre with aspect correction
    vec2 toPolar(vec2 uv, float aspect){
      vec2 centred = (uv - 0.5) * vec2(aspect, 1.0);
      float r = length(centred);
      float a = atan(centred.y, centred.x); // [-pi, pi]
      a = (a + 3.14159265359) / 6.28318530718; // [0,1)
      return vec2(a, r); // x = angle, y = radius
    }

    vec2 fromPolar(vec2 ar, float aspect){
      float a = ar.x * 6.28318530718 - 3.14159265359;
      float r = ar.y;
      vec2 p = vec2(cos(a), sin(a)) * r;
      p /= vec2(aspect, 1.0);
      return p + 0.5;
    }

    // Soft slice mask using smoothstep feather
    float sliceMask(float coord, float slices, float featherW){
      float f = fract(coord * slices);
      float edge = 0.5 / max(1.0, slices);
      float lo = smoothstep(0.0, featherW + edge, f);
      float hi = 1.0 - smoothstep(1.0 - featherW - edge, 1.0, f);
      return lo * hi;
    }

    vec2 applyMode(vec2 ar, float t, float slices, float off, int m){
      // ar.x is angle [0,1), ar.y is radius
      float idx = floor(ar.x * slices);
      float j = hash11(idx + 13.0);
      float base = t;
      // beat snap for chunky motion
      float beats = t * (bpm / 60.0);
      float snapped = floor(beats) + fract(beats) * float(${beatSnap ? 0 : 1}); // compile-time default
      float useT = ${beatSnap ? 'snapped' : 'beats'};
      // Runtime switch for snap controlled by uniform: emulate by mixing
      // We cannot branch on boolean easily, so we will approximate below in main using a uniform.

      if (m == 0){
        // radial wiggle of angle
        ar.x = fract(ar.x + sin(useT + idx * 0.37) * off + j * angleJitter * 0.25);
      } else if (m == 1){
        // spiral: angle depends on radius
        ar.x = fract(ar.x + ar.y * off + sin(useT * 0.5 + idx * 0.21) * off * 0.25);
      } else {
        // ripple: radius shifts with time
        ar.y = fract(ar.y + cos(useT * 0.9 + idx * 0.31) * off);
      }
      return ar;
    }

    vec4 fetchColor(vec2 uv, float isSRGB){
      vec4 c = texture2D(tDiffuse, uv);
      if (isSRGB > 0.5) c.rgb = pow(c.rgb, vec3(2.2));
      return c;
    }

    void main(){
      float aspect = 1.0; // will be baked by geometry aspect
      // Centre and aspect corrections are handled in toPolar/fromPolar
      float t = time;
      float beats = t * (bpm / 60.0);
      float snappedBeats = floor(beats) + step(0.5, fract(beats)) * 0.0; // half-beat hold
      float useBeats = mix(beats, snappedBeats, ${beatSnap ? '1.0' : '0.0'});

      // Base rotation
      float baseRot = rotateSpeed * t * 6.28318530718;

      // Map to polar, apply kaleido
      vec2 p = (vUv - 0.5);
      p = rot(baseRot) * p + 0.5;

      vec2 ar = toPolar(p, 1.0);
      // Jitter
      float idx = floor(ar.x * max(1.0, sliceCount));
      float aJ = (hash11(idx + 7.0) - 0.5) * angleJitter;
      float rJ = (hash11(idx + 19.0) - 0.5) * radiusJitter;
      ar.x = fract(ar.x + aJ);
      ar.y = clamp(ar.y + rJ, 0.0, 1.0);

      // Kaleidoscope
      vec2 cart = vec2(cos(ar.x * 6.28318530718), sin(ar.x * 6.28318530718)) * ar.y;
      cart = kaleido(cart, max(1.0, kaleidoSegments));
      // Back to polar after kaleido reflect
      float ang = atan(cart.y, cart.x);
      float rad = length(cart);
      ar = vec2((ang + 3.14159265359) / 6.28318530718, rad);

      // Apply slice behaviour
      int m = mode;
      ar = applyMode(ar, useBeats, max(1.0, sliceCount), offsetAmount, m);

      // Slice mask along angle bands
      float mask = sliceMask(ar.x, max(1.0, sliceCount), feather);

      // Optional gaps
      float show = mix(1.0 - step(0.0001, 1.0 - mask), 1.0, step(0.5, removeGaps));

      // Map back to UV
      vec2 samplUV = fromPolar(ar, 1.0);

      // Glitch on beat: small random warp for a short window after each beat
      float beatFrac = beatPhase(t, bpm);
      float gAmt = ${glitchOnBeat ? 'smoothstep(0.0, 0.08, 0.08 - beatFrac)' : '0.0'};
      float jitter = (hash21(vec2(idx, floor(beats))) - 0.5) * gAmt * 0.02;
      samplUV += vec2(jitter, -jitter);

      // Chromatic split
      vec2 ofsR = vec2(chromaSplit, 0.0);
      vec2 ofsB = -ofsR;

      vec4 cR = fetchColor(samplUV + ofsR, float(inputIsSRGB));
      vec4 cG = fetchColor(samplUV, float(inputIsSRGB));
      vec4 cB = fetchColor(samplUV + ofsB, float(inputIsSRGB));
      vec3 col = vec3(cR.r, cG.g, cB.b);

      // Final composite
      vec4 outC = vec4(col, 1.0);
      outC.rgb *= show;

      gl_FragColor = outC;
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || bufferTexture);
    return new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture },
        time: { value: 0.0 },
        sliceCount: { value: sliceCount },
        kaleidoSegments: { value: kaleidoSegments },
        offsetAmount: { value: offsetAmount },
        rotateSpeed: { value: rotateSpeed },
        mode: { value: mode === 'radial' ? 0 : mode === 'spiral' ? 1 : 2 },
        feather: { value: feather },
        angleJitter: { value: angleJitter },
        radiusJitter: { value: radiusJitter },
        chromaSplit: { value: chromaSplit },
        mirror: { value: mirror ? 1 : 0 },
        removeGaps: { value: removeGaps ? 1.0 : 0.0 },
        bpm: { value: bpm },
        inputIsSRGB: { value: 1 },
      },
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }, [
    videoTexture, bufferTexture, isGlobal, renderTarget,
    sliceCount, kaleidoSegments, offsetAmount, rotateSpeed,
    mode, feather, angleJitter, radiusJitter, chromaSplit, mirror, removeGaps, bpm
  ]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const u = materialRef.current.uniforms;
    u.time.value = state.clock.elapsedTime;

    // Keep params synced
    u.sliceCount.value = sliceCount;
    u.kaleidoSegments.value = kaleidoSegments;
    u.offsetAmount.value = offsetAmount;
    u.rotateSpeed.value = rotateSpeed;
    u.mode.value = mode === 'radial' ? 0 : mode === 'spiral' ? 1 : 2;
    u.feather.value = feather;
    u.angleJitter.value = angleJitter;
    u.radiusJitter.value = radiusJitter;
    u.chromaSplit.value = chromaSplit;
    u.mirror.value = mirror ? 1 : 0;
    u.removeGaps.value = removeGaps ? 1.0 : 0.0;
    u.bpm.value = bpm;

    // Global input capture
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (u.tDiffuse.value !== renderTarget.texture) u.tDiffuse.value = renderTarget.texture;
    } else {
      const nextTex = (videoTexture || bufferTexture);
      if (u.tDiffuse.value !== nextTex) u.tDiffuse.value = nextTex;
      const isSRGB = !!((nextTex && (nextTex.isVideoTexture || nextTex.isCanvasTexture)));
      u.inputIsSRGB.value = isSRGB ? 1 : 0;
    }
  });

  // Match plane to viewport aspect
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
