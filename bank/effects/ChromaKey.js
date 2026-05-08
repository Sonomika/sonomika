// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Chroma Key',
  description: 'Resolume-style hue chroma key with white/black protection, spill suppression, and edge refinement.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'showMask', type: 'boolean', value: false },
    { name: 'invert', type: 'boolean', value: true },
    { name: 'keyHue', type: 'number', value: 360.0, min: 0, max: 360, step: 0.01 },
    { name: 'hueThreshold', type: 'number', value: 0.117, min: 0, max: 0.5, step: 0.001 },
    { name: 'hueSoftness', type: 'number', value: 0.311, min: 0, max: 0.5, step: 0.001 },
    { name: 'whiteThreshold', type: 'number', value: 0.808, min: 0, max: 1, step: 0.001 },
    { name: 'whiteSoftness', type: 'number', value: 0.286, min: 0, max: 1, step: 0.001 },
    { name: 'blackThreshold', type: 'number', value: 0.686, min: 0, max: 1, step: 0.001 },
    { name: 'blackSoftness', type: 'number', value: 0.466, min: 0, max: 1, step: 0.001 },
    { name: 'spillThreshold', type: 'number', value: 0.0, min: 0, max: 1, step: 0.001 },
    { name: 'spillSoftness', type: 'number', value: 0.0, min: 0, max: 1, step: 0.001 },
    { name: 'edgeShrink', type: 'number', value: 0.0, min: 0, max: 2, step: 0.001 },
    { name: 'edgeBlur', type: 'number', value: 0.0, min: 0, max: 2, step: 0.001 },
  ],
};

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export default function ChromaKey({
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
  showMask = false,
  invert = true,
  keyHue = 360.0,
  hueThreshold = 0.117,
  hueSoftness = 0.311,
  whiteThreshold = 0.808,
  whiteSoftness = 0.286,
  blackThreshold = 0.686,
  blackSoftness = 0.466,
  spillThreshold = 0.0,
  spillSoftness = 0.0,
  edgeShrink = 0.0,
  edgeBlur = 0.0,
}) {
  if (!React || !THREE || !r3f) return null;
  if (!isGlobal && !videoTexture) return null;

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

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }, [isGlobal, effectiveW, effectiveH]);

  useEffect(() => () => {
    try {
      renderTarget && renderTarget.dispose && renderTarget.dispose();
    } catch {}
  }, [renderTarget]);

  const transparentTexture = useMemo(
    () => new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat),
    []
  );

  useEffect(() => () => {
    try {
      transparentTexture && transparentTexture.dispose && transparentTexture.dispose();
    } catch {}
  }, [transparentTexture]);

  const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

  const fragmentShader = `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uShowMask;
uniform float uInvert;
uniform float uKeyHue;
uniform float uHueThreshold;
uniform float uHueSoftness;
uniform float uWhiteThreshold;
uniform float uWhiteSoftness;
uniform float uBlackThreshold;
uniform float uBlackSoftness;
uniform float uSpillThreshold;
uniform float uSpillSoftness;
uniform float uEdgeShrink;
uniform float uEdgeBlur;
varying vec2 vUv;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -0.3333333333, 0.6666666666, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 0.3333333333, 0.6666666666)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float hueDistance(float a, float b) {
  float d = abs(a - b);
  return min(d, 1.0 - d);
}

float matteAt(vec2 uv) {
  vec4 color = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
  vec3 hsv = rgb2hsv(color.rgb);
  float hueMatch = 1.0 - smoothstep(uHueThreshold, uHueThreshold + max(uHueSoftness, 0.0001), hueDistance(hsv.x, uKeyHue));
  float chroma = smoothstep(0.02, 0.35, hsv.y);

  float whiteness = hsv.z * (1.0 - hsv.y);
  float whiteProtect = smoothstep(uWhiteThreshold, uWhiteThreshold + max(uWhiteSoftness, 0.0001), whiteness);
  float blackness = 1.0 - hsv.z;
  float blackProtect = smoothstep(uBlackThreshold, uBlackThreshold + max(uBlackSoftness, 0.0001), blackness);

  float keyStrength = hueMatch * chroma * (1.0 - whiteProtect) * (1.0 - blackProtect);
  return color.a * (1.0 - clamp(keyStrength, 0.0, 1.0));
}

float refinedMatte(vec2 uv) {
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  float shrinkRadius = max(0.0, uEdgeShrink) * 4.0;
  float blurRadius = max(0.0, uEdgeBlur) * 4.0;

  vec2 shrinkStep = texel * shrinkRadius;
  float alpha = matteAt(uv);
  if (shrinkRadius > 0.001) {
    alpha = min(alpha, matteAt(uv + vec2(shrinkStep.x, 0.0)));
    alpha = min(alpha, matteAt(uv - vec2(shrinkStep.x, 0.0)));
    alpha = min(alpha, matteAt(uv + vec2(0.0, shrinkStep.y)));
    alpha = min(alpha, matteAt(uv - vec2(0.0, shrinkStep.y)));
    alpha = min(alpha, matteAt(uv + shrinkStep));
    alpha = min(alpha, matteAt(uv - shrinkStep));
    alpha = min(alpha, matteAt(uv + vec2(shrinkStep.x, -shrinkStep.y)));
    alpha = min(alpha, matteAt(uv + vec2(-shrinkStep.x, shrinkStep.y)));
  }

  if (blurRadius > 0.001) {
    vec2 blurStep = texel * blurRadius;
    alpha = (
      alpha * 4.0 +
      matteAt(uv + vec2(blurStep.x, 0.0)) +
      matteAt(uv - vec2(blurStep.x, 0.0)) +
      matteAt(uv + vec2(0.0, blurStep.y)) +
      matteAt(uv - vec2(0.0, blurStep.y)) +
      matteAt(uv + blurStep) * 0.5 +
      matteAt(uv - blurStep) * 0.5 +
      matteAt(uv + vec2(blurStep.x, -blurStep.y)) * 0.5 +
      matteAt(uv + vec2(-blurStep.x, blurStep.y)) * 0.5
    ) / 10.0;
  }

  return clamp(alpha, 0.0, 1.0);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float alpha = refinedMatte(vUv);
  alpha = mix(alpha, 1.0 - alpha, step(0.5, uInvert));
  vec3 hsv = rgb2hsv(color.rgb);
  float spillMatch = 1.0 - smoothstep(uSpillThreshold, uSpillThreshold + max(uSpillSoftness, 0.0001), hueDistance(hsv.x, uKeyHue));
  float edge = 1.0 - smoothstep(0.15, 0.95, alpha);
  hsv.y *= 1.0 - clamp(spillMatch * edge * 0.75, 0.0, 0.75);

  vec3 keyedColor = hsv2rgb(hsv);
  vec4 result = vec4(keyedColor, alpha);
  vec4 mask = vec4(vec3(alpha), 1.0);
  gl_FragColor = mix(result, mask, step(0.5, uShowMask));
}`;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || transparentTexture) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
      uShowMask: { value: showMask ? 1 : 0 },
      uInvert: { value: invert ? 1 : 0 },
      uKeyHue: { value: clamp(keyHue, 0, 360) / 360 },
      uHueThreshold: { value: clamp(hueThreshold, 0, 0.5) },
      uHueSoftness: { value: clamp(hueSoftness, 0, 0.5) },
      uWhiteThreshold: { value: clamp(whiteThreshold, 0, 1) },
      uWhiteSoftness: { value: clamp(whiteSoftness, 0, 1) },
      uBlackThreshold: { value: clamp(blackThreshold, 0, 1) },
      uBlackSoftness: { value: clamp(blackSoftness, 0, 1) },
      uSpillThreshold: { value: clamp(spillThreshold, 0, 1) },
      uSpillSoftness: { value: clamp(spillSoftness, 0, 1) },
      uEdgeShrink: { value: clamp(edgeShrink, 0, 2) },
      uEdgeBlur: { value: clamp(edgeBlur, 0, 2) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), [
    videoTexture,
    isGlobal,
    renderTarget,
    transparentTexture,
    effectiveW,
    effectiveH,
    showMask,
    invert,
    keyHue,
    hueThreshold,
    hueSoftness,
    whiteThreshold,
    whiteSoftness,
    blackThreshold,
    blackSoftness,
    spillThreshold,
    spillSoftness,
    edgeShrink,
    edgeBlur,
  ]);

  useEffect(() => {
    if (shaderMaterial) materialRef.current = shaderMaterial;
  }, [shaderMaterial]);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    const w = Math.max(1, (size && size.width) || effectiveW);
    const h = Math.max(1, (size && size.height) || effectiveH);
    material.uniforms.uResolution.value.set(w, h);
    material.uniforms.uShowMask.value = showMask ? 1 : 0;
    material.uniforms.uInvert.value = invert ? 1 : 0;
    material.uniforms.uKeyHue.value = clamp(keyHue, 0, 360) / 360;
    material.uniforms.uHueThreshold.value = clamp(hueThreshold, 0, 0.5);
    material.uniforms.uHueSoftness.value = clamp(hueSoftness, 0, 0.5);
    material.uniforms.uWhiteThreshold.value = clamp(whiteThreshold, 0, 1);
    material.uniforms.uWhiteSoftness.value = clamp(whiteSoftness, 0, 1);
    material.uniforms.uBlackThreshold.value = clamp(blackThreshold, 0, 1);
    material.uniforms.uBlackSoftness.value = clamp(blackSoftness, 0, 1);
    material.uniforms.uSpillThreshold.value = clamp(spillThreshold, 0, 1);
    material.uniforms.uSpillSoftness.value = clamp(spillSoftness, 0, 1);
    material.uniforms.uEdgeShrink.value = clamp(edgeShrink, 0, 2);
    material.uniforms.uEdgeBlur.value = clamp(edgeBlur, 0, 2);

    if (isGlobal && renderTarget && gl && scene && camera) {
      const previousTarget = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try {
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(previousTarget);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      if (material.uniforms.tDiffuse.value !== renderTarget.texture) {
        material.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else if (!isGlobal && videoTexture) {
      if (material.uniforms.tDiffuse.value !== videoTexture) {
        material.uniforms.tDiffuse.value = videoTexture;
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
    React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef })
  );
}
