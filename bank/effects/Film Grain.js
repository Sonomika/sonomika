// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Film Grain',
  description: 'A stylized glass / lens distortion effect with chromatic separation, scanlines, vignette and film grain. Works as layer or global.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'shift', type: 'number', value: 0.0, min: 0.0, max: 30.0, step: 0.1, description: 'Chromatic shift in pixels' },
    { name: 'angle', type: 'number', value: 289.0, min: 0.0, max: 360.0, step: 1.0, description: 'Shift direction (degrees)' },
    { name: 'scanIntensity', type: 'number', value: 0.29, min: 0.0, max: 1.0, step: 0.01, description: 'Strength of horizontal scanline modulation' },
    { name: 'scanFreq', type: 'number', value: 4.6, min: 0.1, max: 10.0, step: 0.1, description: 'Scanline frequency (lines per screen height)' },
    { name: 'vignette', type: 'number', value: 0.26, min: 0.0, max: 1.0, step: 0.01, description: 'Vignette amount' },
    { name: 'grain', type: 'number', value: 0.42, min: 0.0, max: 0.5, step: 0.01, description: 'Film grain strength' },
    { name: 'mix', type: 'number', value: 0.24, min: 0.0, max: 1.0, step: 0.01, description: 'Blend between original and effect (1 = full effect)' },
  ],
};

export default function FilmGrain({
  videoTexture,
  isGlobal = false,
  shift = 0.0,
  angle = 289.0,
  scanIntensity = 0.29,
  scanFreq = 4.6,
  vignette = 0.26,
  grain = 0.42,
  mix = 0.24,
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

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

  const fragmentShader = `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uShift;       // pixels
    uniform float uAngle;       // radians
    uniform float uScanIntensity;
    uniform float uScanFreq;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uMix;
    uniform float uTime;
    varying vec2 vUv;

    // Simple pseudo-random based on UV + time
    float rand(vec2 co){
      float t = uTime * 0.1234;
      return fract(sin(dot(co * (1.0 + t*0.01), vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main(){
      vec2 res = max(uResolution, vec2(1.0,1.0));
      // direction of chromatic shift (in uv units)
      vec2 dir = vec2(cos(uAngle), sin(uAngle));
      vec2 offset = dir * (uShift / res); // convert pixel shift to uv

      // chromatic separation: sample R and B shifted, keep G centered
      float r = texture2D(tDiffuse, vUv + offset).r;
      vec2 gSample = texture2D(tDiffuse, vUv).rg; // we will use g component from center
      float g = gSample.g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      vec3 chroma = vec3(r, g, b);

      // scanline modulation (horizontal lines) - depends on screen Y
      float line = sin((vUv.y * res.y) * (uScanFreq) * 3.14159 + uTime * 6.2831);
      // normalize line between 0..1
      float scanMod = 0.5 + 0.5 * line;
      chroma *= mix(1.0, scanMod, uScanIntensity);

      // vignette (circular)
      vec2 centered = (vUv - 0.5) * vec2(res.x / res.y, 1.0); // correct aspect for circular vignette
      float dist = length(centered);
      float vig = smoothstep(0.5, 0.5 - uVignette * 0.5, dist); // 1.0 inside, 0.0 outside
      chroma *= vig;

      // grain
      float gNoise = (rand(vUv * res + vec2(uTime)) - 0.5) * 2.0; // -1..1
      chroma += gNoise * uGrain;

      // original color
      vec3 original = texture2D(tDiffuse, vUv).rgb;

      // final mix between original and effect
      vec3 outCol = mix(original, chroma, clamp(uMix, 0.0, 1.0));

      gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat));
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: inputTexture },
        uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
        uShift: { value: shift },
        uAngle: { value: (angle * Math.PI) / 180.0 }, // convert to radians
        uScanIntensity: { value: scanIntensity },
        uScanFreq: { value: scanFreq },
        uVignette: { value: vignette },
        uGrain: { value: grain },
        uMix: { value: mix },
        uTime: { value: 0.0 },
      },
      vertexShader,
      fragmentShader,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });
  }, [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, shift, angle, scanIntensity, scanFreq, vignette, grain, mix]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    const w = (size && size.width) || effectiveW; const h = (size && size.height) || effectiveH;
    const mat = materialRef.current;
    mat.uniforms.uResolution.value.set(Math.max(1, w), Math.max(1, h));
    mat.uniforms.uShift.value = shift;
    mat.uniforms.uAngle.value = (angle * Math.PI) / 180.0;
    mat.uniforms.uScanIntensity.value = scanIntensity;
    mat.uniforms.uScanFreq.value = scanFreq;
    mat.uniforms.uVignette.value = vignette;
    mat.uniforms.uGrain.value = grain;
    mat.uniforms.uMix.value = mix;
    mat.uniforms.uTime.value += delta;

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (mat.uniforms.tDiffuse.value !== renderTarget.texture) mat.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (mat.uniforms.tDiffuse.value !== videoTexture) mat.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspect = useMemo(() => { try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {} return effectiveW / effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}
