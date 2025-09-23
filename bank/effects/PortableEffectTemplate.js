// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef } = React || {};

export const metadata = {
  name: 'Portable Effect Template',
  description: 'Boilerplate for portable video effects (no imports, no DOM).',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 0.8, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.0, max: 5.0, step: 0.05 },
    { name: 'tint', type: 'color', value: '#66ccff' },
  ],
};

export default function PortableEffectTemplate({
  videoTexture = null,
  intensity = 0.8,
  speed = 1.0,
  tint = '#66ccff',
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  // Scene layout sizing
  const { size } = useThree();
  const aspect = (compositionWidth && compositionHeight)
    ? (compositionWidth / Math.max(1, compositionHeight))
    : ((size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9));
  const planeW = aspect * 2;
  const planeH = 2;

  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const timeRef = useRef(0);

  const geometry = useMemo(() => new THREE.PlaneGeometry(planeW, planeH), [planeW, planeH]);

  // Minimal shader: samples input video (if any), applies tint and a subtle wobble
  const vertexShader = "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
  const fragmentShader = `
    uniform sampler2D uTexture; uniform float uHasTex; uniform float uTime; uniform float uIntensity; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      // mild wobble
      uv.x += 0.005 * uIntensity * sin(uTime*1.3 + uv.y*8.0);
      uv.y += 0.005 * uIntensity * cos(uTime*1.1 + uv.x*6.0);
      vec3 base = mix(vec3(0.0), uTint, 0.15);
      vec3 col = base;
      if (uHasTex > 0.5) {
        col = texture2D(uTexture, uv).rgb;
      }
      // apply tint
      col = mix(col, col * uTint, clamp(uIntensity*0.5, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: videoTexture || null },
        uHasTex: { value: videoTexture ? 1.0 : 0.0 },
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uTint: { value: new THREE.Color(tint) },
      },
      vertexShader,
      fragmentShader,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    materialRef.current = m;
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update uniforms on prop change
  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTexture.value = videoTexture || null;
    materialRef.current.uniforms.uHasTex.value = videoTexture ? 1.0 : 0.0;
  }, [videoTexture]);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uIntensity.value = intensity;
  }, [intensity]);

  useEffect(() => {
    if (!materialRef.current) return;
    try { materialRef.current.uniforms.uTint.value.set(tint); } catch {}
  }, [tint]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    timeRef.current += (delta || 0.016) * Math.max(0, speed || 0);
    materialRef.current.uniforms.uTime.value = timeRef.current;
  });

  // Cleanup
  useEffect(() => () => {
    try { geometry && geometry.dispose && geometry.dispose(); } catch {}
    try { material && material.dispose && material.dispose(); } catch {}
  }, [geometry, material]);

  return React.createElement('mesh', { ref: meshRef },
    React.createElement('primitive', { object: geometry }),
    React.createElement('primitive', { object: material })
  );
}


