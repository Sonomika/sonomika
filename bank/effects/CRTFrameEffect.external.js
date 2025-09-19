// Portable external CRT Frame effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'CRT Frame (External)',
  description: 'CRT-style curved screen with scanlines, vignette, and bloom.',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'vignette', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'curvature', type: 'number', value: 0.15, min: 0.0, max: 0.6, step: 0.01 },
    { name: 'bloom', type: 'number', value: 0.1, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'scanlineMix', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 },
  ],
};

export default function CRTFrameExternal({ videoTexture, isGlobal=false, vignette=0.35, curvature=0.15, bloom=0.1, scanlineMix=0.35, compositionWidth, compositionHeight }){
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null); const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx=useThree(); if (ctx){ gl=ctx.gl; scene=ctx.scene; camera=ctx.camera; size=ctx.size; } } catch {}
  const effectiveW=Math.max(1, compositionWidth || (size&&size.width) || 1920);
  const effectiveH=Math.max(1, compositionHeight || (size&&size.height) || 1080);

  const renderTarget = useMemo(() => { if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uVignette; uniform float uCurvature; uniform float uBloom; uniform float uScanlineMix; uniform float uTime; varying vec2 vUv;
    vec2 barrel(vec2 coord,float amt){ vec2 cc=coord-0.5; float dist=dot(cc,cc); return coord + cc*dist*amt; }
    void main(){ vec2 uv=vUv; uv = barrel(uv, uCurvature*0.25); vec3 color=texture2D(tDiffuse, uv).rgb; color += smoothstep(0.6,1.0,color)*uBloom; float scan = sin(uv.y*uResolution.y)*0.5+0.5; color *= mix(1.0, scan, uScanlineMix); vec2 p = uv-0.5; float vig = 1.0 - dot(p,p)*2.0*uVignette; color *= clamp(vig,0.0,1.0); gl_FragColor = vec4(color,1.0); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { tDiffuse:{ value: (isGlobal&&renderTarget)?renderTarget.texture:(videoTexture||null) }, uResolution:{ value:new THREE.Vector2(effectiveW,effectiveH) }, uVignette:{ value:vignette }, uCurvature:{ value:curvature }, uBloom:{ value:bloom }, uScanlineMix:{ value:scanlineMix }, uTime:{ value:0 } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, vignette, curvature, bloom, scanlineMix]);

  useEffect(()=>{ if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state)=>{
    if (!materialRef.current) return; materialRef.current.uniforms.uResolution.value.set(Math.max(1,(size&&size.width)||effectiveW), Math.max(1,(size&&size.height)||effectiveH)); materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; materialRef.current.uniforms.uVignette.value = vignette; materialRef.current.uniforms.uCurvature.value = curvature; materialRef.current.uniforms.uBloom.value = bloom; materialRef.current.uniforms.uScanlineMix.value = scanlineMix; if (isGlobal && renderTarget && gl && scene && camera){ const prev=gl.getRenderTarget(); const was=meshRef.current?meshRef.current.visible:undefined; if (meshRef.current) meshRef.current.visible=false; try { gl.setRenderTarget(renderTarget); gl.render(scene,camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && was!==undefined) meshRef.current.visible=was; } if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture; } else if (!isGlobal && videoTexture){ if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture; }
  });

  const aspect = useMemo(()=>{ try { if (size&&size.width>0&&size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


