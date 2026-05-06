// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Invert Strobe',
  description: 'A hard rhythmic strobe that flashes the video into inverted colour with optional contrast punch and tint.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'strobeSpeed', type: 'number', value: 8.0, min: 0.0, max: 32.0, step: 0.05 },
    { name: 'duty', type: 'number', value: 0.5, min: 0.02, max: 0.98, step: 0.01 },
    { name: 'invertMix', type: 'number', value: 1.0, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'flashBrightness', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'contrast', type: 'number', value: 1.15, min: 0.0, max: 3.0, step: 0.01 },
    { name: 'tint', type: 'color', value: '#ffffff' },
    { name: 'softness', type: 'number', value: 0.0, min: 0.0, max: 0.45, step: 0.005 },
    { name: 'tempoLink', type: 'boolean', value: false },
    { name: 'bpm', type: 'number', value: 120, min: 30, max: 300, step: 1 },
  ],
};

function hexToColor(hex) {
  try {
    return new THREE.Color(hex || '#ffffff');
  } catch {
    return new THREE.Color('#ffffff');
  }
}

export default function InvertStrobe({
  videoTexture,
  isGlobal = false,
  strobeSpeed = 8.0,
  duty = 0.5,
  invertMix = 1.0,
  flashBrightness = 1.0,
  contrast = 1.15,
  tint = '#ffffff',
  softness = 0.0,
  tempoLink = false,
  bpm = 120,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try {
    const ctx = useThree();
    if (ctx) {
      gl = ctx.gl;
      scene = ctx.scene;
      camera = ctx.camera;
      size = ctx.size;
    }
  } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const fallbackTexture = useMemo(() => {
    const tx = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    tx.needsUpdate = true;
    return tx;
  }, []);

  const renderTarget = useMemo(() => {
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

  useEffect(() => () => {
    try {
      renderTarget && renderTarget.dispose && renderTarget.dispose();
      fallbackTexture && fallbackTexture.dispose && fallbackTexture.dispose();
    } catch {}
  }, [renderTarget, fallbackTexture]);

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
    uniform float uTime;
    uniform float uStrobeSpeed;
    uniform float uDuty;
    uniform float uInvertMix;
    uniform float uFlashBrightness;
    uniform float uContrast;
    uniform float uSoftness;
    uniform float uTempoLink;
    uniform float uBpm;
    uniform vec3 uTint;

    vec3 applyContrast(vec3 color, float amount) {
      return (color - 0.5) * amount + 0.5;
    }

    void main() {
      vec3 src = texture2D(tDiffuse, vUv).rgb;
      float freq = mix(uStrobeSpeed, max(uBpm, 0.0) / 60.0, step(0.5, uTempoLink));
      float phase = fract(uTime * max(freq, 0.0));
      float hardGate = step(phase, clamp(uDuty, 0.0, 1.0));
      float softGate = 1.0 - smoothstep(clamp(uDuty, 0.0, 1.0), clamp(uDuty + uSoftness, 0.0, 1.0), phase);
      float gate = mix(hardGate, softGate, step(0.001, uSoftness));

      vec3 inverted = mix(src, 1.0 - src, uInvertMix);
      inverted = applyContrast(inverted, uContrast);
      inverted *= uTint * uFlashBrightness;

      vec3 outCol = mix(src, inverted, gate);
      gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
    }
  `;

  const tintColor = useMemo(() => hexToColor(tint), [tint]);

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || fallbackTexture) },
      uTime: { value: 0.0 },
      uStrobeSpeed: { value: strobeSpeed },
      uDuty: { value: duty },
      uInvertMix: { value: invertMix },
      uFlashBrightness: { value: flashBrightness },
      uContrast: { value: contrast },
      uSoftness: { value: softness },
      uTempoLink: { value: tempoLink ? 1.0 : 0.0 },
      uBpm: { value: bpm },
      uTint: { value: tintColor },
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [videoTexture, fallbackTexture, isGlobal, renderTarget, strobeSpeed, duty, invertMix, flashBrightness, contrast, softness, tempoLink, bpm, tintColor]);

  useEffect(() => {
    if (shaderMaterial) materialRef.current = shaderMaterial;
  }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;

    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uStrobeSpeed.value = strobeSpeed;
    materialRef.current.uniforms.uDuty.value = duty;
    materialRef.current.uniforms.uInvertMix.value = invertMix;
    materialRef.current.uniforms.uFlashBrightness.value = flashBrightness;
    materialRef.current.uniforms.uContrast.value = contrast;
    materialRef.current.uniforms.uSoftness.value = softness;
    materialRef.current.uniforms.uTempoLink.value = tempoLink ? 1.0 : 0.0;
    materialRef.current.uniforms.uBpm.value = bpm;
    materialRef.current.uniforms.uTint.value.copy(hexToColor(tint));

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else {
      const nextTex = videoTexture || fallbackTexture;
      if (materialRef.current.uniforms.tDiffuse.value !== nextTex) {
        materialRef.current.uniforms.tDiffuse.value = nextTex;
      }
    }
  });

  const aspect = useMemo(() => {
    try {
      if (size && size.width > 0 && size.height > 0) return size.width / size.height;
    } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }),
  );
}
