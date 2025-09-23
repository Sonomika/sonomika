// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Dots Overlay Glitch', description: 'Animated dot overlay with simple glitch motion.', category: 'Effects', author: 'AI', version: '1.0.0', replacesVideo: false, canBeGlobal: true,
  parameters: [ { name: 'uDotSize', type: 'number', value: 5.0, min: 1.0, max: 20.0, step: 0.1 }, { name: 'uGlitchIntensity', type: 'number', value: 0.5, min: 0.0, max: 1.0, step: 0.01 }, { name: 'uOpacity', type: 'number', value: 1.0, min: 0.0, max: 1.0, step: 0.01 } ],
};

export default function DotsOverlayGlitchExternal({ videoTexture, isGlobal=false, compositionWidth, compositionHeight, uDotSize=5.0, uGlitchIntensity=0.5, uOpacity=1.0 }){
  if (!React || !THREE || !r3f) return null; const { useThree, useFrame } = r3f; const { gl, scene, camera, size } = useThree?.() || { gl:null, scene:null, camera:null, size:{ width:1920, height:1080 } }; const meshRef=useRef(null); const materialRef=useRef(null);
  const fallback=useMemo(()=> new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat), []);
  const target=useMemo(()=> (isGlobal && gl && size ? new THREE.WebGLRenderTarget(Math.max(1,size.width), Math.max(1,size.height)) : null), [isGlobal, gl, size?.width, size?.height]); useEffect(()=>()=> target?.dispose(), [target]);
  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ uniforms:{ inputBuffer:{ value:fallback }, resolution:{ value:new THREE.Vector2(Math.max(1,size?.width||1920), Math.max(1,size?.height||1080)) }, uTime:{ value:0 }, uBpm:{ value:(globalThis&&globalThis.VJ_BPM)||120 }, uOpacity:{ value:uOpacity }, uDotSize:{ value:uDotSize }, uGlitchIntensity:{ value:uGlitchIntensity } }, vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader:`uniform sampler2D inputBuffer; uniform vec2 resolution; uniform float uTime; uniform float uBpm; uniform float uOpacity; uniform float uDotSize; uniform float uGlitchIntensity; varying vec2 vUv; void main(){ vec2 uv=vUv; float time=uTime*0.001; uv.x += sin(time*uBpm*0.1) * uGlitchIntensity; uv.y += cos(time*uBpm*0.1) * uGlitchIntensity; vec4 color=texture2D(inputBuffer, uv); float dots=step(0.5, mod(floor(uv.x*resolution.x/uDotSize) + floor(uv.y*resolution.y/uDotSize), 2.0)); color.rgb *= dots; gl_FragColor=vec4(color.rgb, color.a*uOpacity); }`, transparent:true, depthTest:false, depthWrite:false }), [size?.width, size?.height, uOpacity, uDotSize, uGlitchIntensity]);
  useEffect(()=>{ if (shaderMaterial) materialRef.current=shaderMaterial; }, [shaderMaterial]);
  useFrame((state)=>{ if (!materialRef.current) return; if (isGlobal && target && gl && scene && camera){ const prev=gl.getRenderTarget(); const vis=meshRef.current?.visible; if (meshRef.current) meshRef.current.visible=false; try{ gl.setRenderTarget(target); gl.render(scene,camera);} finally { gl.setRenderTarget(prev); if (meshRef.current && vis!==undefined) meshRef.current.visible=vis; } materialRef.current.uniforms.inputBuffer.value = target.texture; } else if (!isGlobal && videoTexture){ materialRef.current.uniforms.inputBuffer.value = videoTexture; } materialRef.current.uniforms.uTime.value = state.clock.elapsedTime*1000; materialRef.current.uniforms.uBpm.value = (globalThis&&globalThis.VJ_BPM)||120; });
  useEffect(()=>{ if (!materialRef.current) return; materialRef.current.uniforms.resolution.value.set(Math.max(1,size?.width||1920), Math.max(1,size?.height||1080)); if (isGlobal && target) target.setSize(Math.max(1,size?.width||1920), Math.max(1,size?.height||1080)); }, [size, isGlobal, target]);
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef, attach:'material'}));
}


