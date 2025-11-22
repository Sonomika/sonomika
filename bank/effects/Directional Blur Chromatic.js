// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Chromatic Directional Blur',
  description: 'Directional motion blur with chromatic separation and decay control.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'angle', type: 'number', value: Math.PI * 0.25, min: 0, max: Math.PI * 2, step: 0.01 },
    { name: 'radius', type: 'number', value: 8.0, min: 0.0, max: 64.0, step: 0.25 },
    { name: 'samples', type: 'number', value: 20, min: 3, max: 96, step: 1 },
    { name: 'chroma', type: 'number', value: 0.6, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'decay', type: 'number', value: 1.5, min: 0.0, max: 4.0, step: 0.01 },
  ],
};

export default function ChromaticDirectionalBlur({
  videoTexture,
  isGlobal = false,
  angle = Math.PI * 0.25,
  radius = 8.0,
  samples = 20,
  chroma = 0.6,
  decay = 1.5,
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
    try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {}
  }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

  const fragmentShader = `
    precision mediump float;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uAngle;
    uniform float uRadius;
    uniform float uSamples;
    uniform float uChroma;
    uniform float uDecay;
    varying vec2 vUv;

    void main() {
      vec2 dir = vec2(cos(uAngle), sin(uAngle));
      vec2 perp = vec2(-dir.y, dir.x);
      vec2 texel = dir / uResolution * uRadius;

      float count = max(1.0, uSamples);
      float halfC = floor(0.5 * (count - 1.0));

      vec3 accum = vec3(0.0);
      float wsum = 0.0;

      // iterate with a fixed loop upper bound; break/continue to respect actual sample count
      for (float i = -64.0; i <= 64.0; i += 1.0) {
        if (i > halfC) break;
        if (-i > halfC) continue;

        float fi = i;
        // normalized distance from center [0..1]
        float t = abs(fi) / max(1.0, halfC);
        // weight falls off with distance; use decay to control curve
        float weight = pow(1.0 - t, max(0.0, uDecay));

        vec2 baseOff = texel * fi;

        // chromatic separation: shift R and B slightly along perpendicular,
        // scaled by chroma and by t (farther samples get stronger separation)
        vec2 offR = baseOff + perp * uChroma * t;
        vec2 offG = baseOff;
        vec2 offB = baseOff - perp * uChroma * t;

        accum.r += texture2D(tDiffuse, vUv + offR).r * weight;
        accum.g += texture2D(tDiffuse, vUv + offG).g * weight;
        accum.b += texture2D(tDiffuse, vUv + offB).b * weight;

        wsum += weight;
      }

      accum /= max(1e-6, wsum);
      gl_FragColor = vec4(accum, 1.0);
    }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: {
        value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat))
      },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
      uAngle: { value: angle },
      uRadius: { value: radius },
      uSamples: { value: samples },
      uChroma: { value: chroma },
      uDecay: { value: decay },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, angle, radius, samples, chroma, decay]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const w = (size && size.width) || effectiveW;
    const h = (size && size.height) || effectiveH;
    materialRef.current.uniforms.uResolution.value.set(Math.max(1, w), Math.max(1, h));
    materialRef.current.uniforms.uAngle.value = angle;
    materialRef.current.uniforms.uRadius.value = radius;
    materialRef.current.uniforms.uSamples.value = samples;
    materialRef.current.uniforms.uChroma.value = chroma;
    materialRef.current.uniforms.uDecay.value = decay;

    if (isGlobal && renderTarget && gl && scene && camera) {
      // render scene into renderTarget while hiding this quad
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;
      }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
    }
  });

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef })
  );
}
