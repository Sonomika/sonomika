// RadialMosaicPulse.js
// Portable external effect. Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Radial Mosaic Pulse',
  description: 'Concentric rings and angular slices rotate & pulse independently.',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'rings', type: 'number', value: 4, min: 1, max: 12, step: 1, description: 'Number of concentric rings' },
    { name: 'slices', type: 'number', value: 12, min: 3, max: 48, step: 1, description: 'Angular slices per ring' },
    { name: 'rotationAmount', type: 'number', value: 0.6, min: 0.0, max: 2.5, step: 0.01, description: 'Max rotation (radians) per tile' },
    { name: 'rotationSpeed', type: 'number', value: 0.9, min: 0.0, max: 8.0, step: 0.01, description: 'Tile rotation speed' },
    { name: 'pulseSpeed', type: 'number', value: 2.0, min: 0.0, max: 16.0, step: 0.01, description: 'Pulse (strobe) speed' },
    { name: 'pulseDuty', type: 'number', value: 0.55, min: 0.01, max: 0.99, step: 0.01, description: 'Pulse on fraction' },
    { name: 'pulseSoftness', type: 'number', value: 0.15, min: 0.0, max: 0.5, step: 0.01, description: 'Soft edge around pulses' },
    { name: 'mirror', type: 'boolean', value: false, description: 'Mirror input across Y before processing' },
    { name: 'circularMask', type: 'boolean', value: true, description: 'Mask to circle edges' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Sync pulse speed to BPM' },
    { name: 'seed', type: 'number', value: 4242, min: 0, max: 100000, step: 1, description: 'Random seed' },
  ],
};

export default function RadialMosaicPulse({
  rings = 4,
  slices = 12,
  rotationAmount = 0.6,
  rotationSpeed = 0.9,
  pulseSpeed = 2.0,
  pulseDuty = 0.55,
  pulseSoftness = 0.15,
  mirror = false,
  circularMask = true,
  bpmSync = true,
  bpm = 120,
  seed = 4242,
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

  // Fallback canvas texture if no input is wired
  const bufferTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#202020'; ctx.fillRect(0,0,64,64);
      ctx.fillStyle = '#ffcc00'; ctx.fillRect(0,0,32,64);
      ctx.fillStyle = '#0044ff'; ctx.fillRect(32,0,32,64);
    }
    const tex = new THREE.CanvasTexture(c);
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

  const resolveLinkedBpm = () => {
    try {
      const hostBpm = globalThis && globalThis.VJ_BPM;
      if (typeof hostBpm === 'number' && Number.isFinite(hostBpm) && hostBpm > 0) {
        return hostBpm;
      }
    } catch {}
    return bpm;
  };

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
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float time;

    uniform float rings;
    uniform float slices;
    uniform float rotationAmount;
    uniform float rotationSpeed;

    uniform float pulseSpeed;
    uniform float pulseDuty;
    uniform float pulseSoftness;

    uniform float mirrorU;
    uniform float circularMaskU;

    uniform float bpm;
    uniform float bpmSync;
    uniform float seedU;
    uniform int inputIsSRGB;

    // small hash functions
    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }
    vec2 hash21(float p) {
      return vec2(hash11(p + 0.7), hash11(p + 7.3));
    }

    // rotate a 2D point by angle
    vec2 rotate2(in vec2 p, in float a) {
      float c = cos(a);
      float s = sin(a);
      return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }

    // smooth pulse between 0..1 with duty and softness
    float tilePulse(float id, float t) {
      float phase = hash11(id + seedU * 0.33) * 6.2831853;
      float freq;
      if (bpmSync > 0.5) {
        // Sync to BPM: pulseSpeed acts as a multiplier
        freq = max(0.0, bpm) / 60.0 * max(0.001, pulseSpeed);
      } else {
        // Independent pulse speed (not synced to BPM)
        freq = max(0.001, pulseSpeed);
      }
      float s = 0.5 + 0.5 * sin((t * freq) * 6.2831853 + phase);
      // map s to on/off using duty with softness
      float edge = pulseSoftness;
      float threshold = 1.0 - pulseDuty;
      // smoothstep around threshold
      return smoothstep(threshold - edge, threshold + edge, s);
    }

    void main() {
      // Normalize coordinates to center at (0,0), preserve aspect by scaling Y
      vec2 uv = vUv;
      if (mirrorU > 0.5) uv.x = 1.0 - uv.x;

      // Map uv into centered -1..1 space with aspect correction
      vec2 aspect = vec2(1.0, 1.0); // aspect correction handled at plane geometry level
      vec2 pos = (uv - 0.5) * 2.0 * aspect;

      // Convert to polar coordinates
      float r = length(pos);
      float a = atan(pos.y, pos.x); // -PI..PI

      // Normalize angle to 0..1
      float angNorm = (a + 3.14159265) / (6.283185307);

      // Determine ring index and slice index
      float ringF = floor(r * rings);                             // 0..rings-1
      float sliceF = floor(angNorm * slices);                     // 0..slices-1

      // clamp ring to available range
      float ringIndex = clamp(ringF, 0.0, max(0.0, rings - 1.0));
      float sliceIndex = clamp(sliceF, 0.0, max(0.0, slices - 1.0));

      float tileId = ringIndex * slices + sliceIndex;

      // Local polar coords within tile: radius within ring [0..1) and angle within slice [0..1)
      float ringInner = ringIndex / max(1.0, rings);
      float ringOuter = (ringIndex + 1.0) / max(1.0, rings);
      float localR = (r - ringInner) / max(0.0001, (ringOuter - ringInner));
      float sliceStart = sliceIndex / max(1.0, slices);
      float sliceLocal = (angNorm - sliceStart) * max(1.0, slices);

      // Compute tile center polar coords (angle center, radius center)
      float tileAngleCenter = (sliceStart + 0.5 / max(1.0, slices)) * 6.283185307 - 3.14159265;
      float tileRadiusCenter = (ringInner + 0.5 * (ringOuter - ringInner));
      vec2 tileCenter = vec2(cos(tileAngleCenter), sin(tileAngleCenter)) * tileRadiusCenter;

      // Create a local uv for the tile by subtracting center and scaling by ring width and slice angular span
      float ringWidth = (ringOuter - ringInner);
      float angSpan = 1.0 / max(1.0, slices);
      // approximate tile size in normalized -1..1 coordinates
      vec2 local = (pos - tileCenter) / vec2(ringWidth + 0.0001, angSpan * 6.2831853 * tileRadiusCenter + 0.0001);

      // Rotation per-tile
      float phase = hash11(tileId + seedU * 2.5) * 6.2831853;
      float rot = sin(time * rotationSpeed + phase) * rotationAmount * (0.5 + 0.5 * (ringIndex / max(1.0, rings)));
      local = rotate2(local, rot);

      // Map local back to global UV for sampling:
      vec2 posReconstructed = local * vec2(ringWidth + 0.0001, angSpan * 6.2831853 * tileRadiusCenter + 0.0001) + tileCenter;

      // Convert back from -1..1 pos to uv
      vec2 uvSample = posReconstructed * 0.5 + 0.5;

      // Simple sampling (no chromatic separation)
      vec4 sampleCol = texture2D(tDiffuse, clamp(uvSample, 0.0, 1.0));
      vec3 color = sampleCol.rgb;

      // sRGB handling if necessary (assume texture is linear in shader; if inputIsSRGB set, convert)
      if (inputIsSRGB == 1) {
        color = pow(color, vec3(2.2));
      }

      // Pulse envelope
      float pulse = tilePulse(tileId, time);
      color *= pulse;

      // Circular mask
      if (circularMaskU > 0.5) {
        float mask = smoothstep(1.0, 0.98, r); // soft fade at edge if r in 0.98..1.0
        color *= mask;
      }

      // If tile is outside rings (r >= 1.0), black it out
      if (r >= 1.0) {
        color *= 0.0;
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || bufferTexture);
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture },
        time: { value: 0.0 },

        rings: { value: rings },
        slices: { value: slices },
        rotationAmount: { value: rotationAmount },
        rotationSpeed: { value: rotationSpeed },

        pulseSpeed: { value: pulseSpeed },
        pulseDuty: { value: pulseDuty },
        pulseSoftness: { value: pulseSoftness },

        mirrorU: { value: mirror ? 1.0 : 0.0 },
        circularMaskU: { value: circularMask ? 1.0 : 0.0 },

        bpm: { value: resolveLinkedBpm() },
        bpmSync: { value: bpmSync ? 1.0 : 0.0 },
        seedU: { value: seed },

        inputIsSRGB: { value: 1 },
      },
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }, [videoTexture, bufferTexture, isGlobal, renderTarget, rings, slices, rotationAmount, rotationSpeed, pulseSpeed, pulseDuty, pulseSoftness, mirror, circularMask, bpmSync, bpm, seed]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;

    // Keep uniforms synced with live params
    materialRef.current.uniforms.rings.value = rings;
    materialRef.current.uniforms.slices.value = slices;
    materialRef.current.uniforms.rotationAmount.value = rotationAmount;
    materialRef.current.uniforms.rotationSpeed.value = rotationSpeed;

    materialRef.current.uniforms.pulseSpeed.value = pulseSpeed;
    materialRef.current.uniforms.pulseDuty.value = pulseDuty;
    materialRef.current.uniforms.pulseSoftness.value = pulseSoftness;

    materialRef.current.uniforms.mirrorU.value = mirror ? 1.0 : 0.0;
    materialRef.current.uniforms.circularMaskU.value = circularMask ? 1.0 : 0.0;

    const linkedBpm = resolveLinkedBpm();
    if (materialRef.current.uniforms.bpm.value !== linkedBpm) {
      materialRef.current.uniforms.bpm.value = linkedBpm;
    }
    materialRef.current.uniforms.bpmSync.value = bpmSync ? 1.0 : 0.0;
    materialRef.current.uniforms.seedU.value = seed;

    // Input source maintenance, including global capture pass
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else {
      const nextTex = (videoTexture || bufferTexture);
      if (materialRef.current.uniforms.tDiffuse.value !== nextTex) {
        materialRef.current.uniforms.tDiffuse.value = nextTex;
      }
      const isSRGB = !!(nextTex && (nextTex.isVideoTexture || nextTex.isCanvasTexture));
      materialRef.current.uniforms.inputIsSRGB.value = isSRGB ? 1 : 0;
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
