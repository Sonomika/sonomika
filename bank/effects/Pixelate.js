// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Pixelate Effect',
  description: 'Applies a pixelation filter to input content. Works as layer or global.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'pixelSize', type: 'number', min: 0.001, max: 0.2, step: 0.001, value: 0.02, description: 'Relative pixel size (fraction of width)' },
    { name: 'intensity', type: 'number', min: 0.1, max: 2.0, step: 0.1, value: 1.0, description: 'Brightness multiplier' },
  ],
};

export default function PixelateEffect({ pixelSize = 0.02, intensity = 1.0, videoTexture, isGlobal = false, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  // Renderer/scene access (guard if outside r3f)
  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  // For global mode, capture the current scene each frame
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
    varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform float uPixelSize; uniform float uIntensity; uniform vec2 uResolution; varying vec2 vUv;
    void main(){
      float minPixel = max(uPixelSize, 1.0 / max(uResolution.x, 1.0));
      vec2 pixelCount = max(vec2(1.0), uResolution * minPixel);
      vec2 snappedUv = floor(vUv * pixelCount) / pixelCount;
      vec4 color = texture2D(tDiffuse, snappedUv);
      color.rgb *= uIntensity;
      gl_FragColor = color;
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat));
    const mat = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture },
        uPixelSize: { value: pixelSize },
        uIntensity: { value: intensity },
        uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    return mat;
  }, [videoTexture, isGlobal, renderTarget, pixelSize, intensity, effectiveW, effectiveH]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame(() => {
    if (!materialRef.current) return;
    try {
      // Update resolution from renderer
      const w = (size && size.width) || effectiveW;
      const h = (size && size.height) || effectiveH;
      materialRef.current.uniforms.uResolution.value.set(Math.max(1,w), Math.max(1,h));
    } catch {}

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) {
        materialRef.current.uniforms.tDiffuse.value = videoTexture;
      }
    }
    // Keep parameters in sync
    materialRef.current.uniforms.uPixelSize.value = pixelSize;
    materialRef.current.uniforms.uIntensity.value = intensity;
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


