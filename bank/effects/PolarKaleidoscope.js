// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Polar Kaleidoscope',
  description: 'Polar kaleidoscope with segment mirroring, rotation, swirl, radial scale.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'segments', type: 'number', value: 8, min: 2, max: 24, step: 1 },
    { name: 'rotate', type: 'number', value: 0.2, min: -2.0, max: 2.0, step: 0.01 },
    { name: 'swirl', type: 'number', value: 0.0, min: -3.0, max: 3.0, step: 0.05 },
    { name: 'radialScale', type: 'number', value: 1.0, min: 0.2, max: 2.5, step: 0.01 },
    { name: 'bpmSync', type: 'boolean', value: false },
  ],
};

export default function PolarKaleidoscope({ videoTexture, isGlobal = false, segments = 8, rotate = 0.2, swirl = 0.0, radialScale = 1.0, bpmSync = false, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}
  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const renderTarget = useMemo(() => { if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uTime; uniform float uSegments; uniform float uRotate; uniform float uSwirl; uniform float uRadialScale; uniform float uBpm; uniform float uBpmSync; varying vec2 vUv;
    void main(){ 
      vec2 p = vUv*2.0 - 1.0; 
      float r = length(p); 
      float a = atan(p.y,p.x); 
      float effectiveRotate = uRotate;
      if (uBpmSync > 0.5) {
        float beatTime = uTime * (uBpm / 60.0);
        float pulse = sin(beatTime * 6.283185307) * 0.5 + 0.5;
        effectiveRotate = uRotate * (0.5 + pulse * 1.5);
      }
      float ang = a + uTime*effectiveRotate + r*uSwirl; 
      float segAng = 6.28318530718 / max(1.0, uSegments); 
      ang = mod(ang, segAng); 
      ang = abs(ang - segAng*0.5); 
      vec2 q = vec2(cos(ang), sin(ang)) * r * uRadialScale; 
      vec2 uv = (q + 1.0)*0.5; 
      vec3 col = texture2D(tDiffuse, uv).rgb; 
      gl_FragColor = vec4(col,1.0); 
    }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat)) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) }, uTime: { value: 0 }, uSegments: { value: segments }, uRotate: { value: rotate }, uSwirl: { value: swirl }, uRadialScale: { value: radialScale }, uBpm: { value: (globalThis && globalThis.VJ_BPM) || 120 }, uBpmSync: { value: bpmSync ? 1.0 : 0.0 },
    }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, segments, rotate, swirl, radialScale, bpmSync]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uSegments.value = segments;
    materialRef.current.uniforms.uRotate.value = rotate;
    materialRef.current.uniforms.uSwirl.value = swirl;
    materialRef.current.uniforms.uRadialScale.value = radialScale;
    materialRef.current.uniforms.uBpm.value = (globalThis && globalThis.VJ_BPM) || 120;
    materialRef.current.uniforms.uBpmSync.value = bpmSync ? 1.0 : 0.0;
    const w = (size && size.width) || effectiveW; const h = (size && size.height) || effectiveH; materialRef.current.uniforms.uResolution.value.set(Math.max(1,w), Math.max(1,h));
    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget(); const wasVisible = meshRef.current ? meshRef.current.visible : undefined; if (meshRef.current) meshRef.current.visible=false; try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible!==undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture) {
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspect = useMemo(() => { try { if (size && size.width>0 && size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}


