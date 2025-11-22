// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Inverted Radial Mask', description: 'Inverted animated ring mask with wobble.', category: 'Effects', author: 'AI', version: '1.0.0', replacesVideo: true, canBeGlobal: true,
  parameters: [ { name: 'radius', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 }, { name: 'width', type: 'number', value: 0.2, min: 0.01, max: 1.0, step: 0.01 }, { name: 'speed', type: 'number', value: 0.5, min: 0.0, max: 5.0, step: 0.05 }, { name: 'wobble', type: 'number', value: 0.15, min: 0.0, max: 1.0, step: 0.01 }, { name: 'centerX', type: 'number', value: 0.0, min: -0.5, max: 0.5, step: 0.01 }, { name: 'centerY', type: 'number', value: 0.0, min: -0.5, max: 0.5, step: 0.01 } ],
};

export default function InvertedRadialMask({ videoTexture, isGlobal=false, radius=0.35, width=0.2, speed=0.5, wobble=0.15, centerX=0.0, centerY=0.0, compositionWidth, compositionHeight }){
  if (!React || !THREE || !r3f) return null; const { useThree, useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  let gl, scene, camera, size; try{ const ctx=useThree(); if (ctx){ gl=ctx.gl; scene=ctx.scene; camera=ctx.camera; size=ctx.size; } } catch{}
  const effectiveW=Math.max(1, compositionWidth || (size&&size.width) || 1920); const effectiveH=Math.max(1, compositionHeight || (size&&size.height) || 1080);
  const renderTarget = useMemo(()=>{ if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW,effectiveH,{ format:THREE.RGBAFormat, type:THREE.UnsignedByteType, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(()=>()=>{ try{ renderTarget&&renderTarget.dispose&&renderTarget.dispose(); }catch{} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uTime; uniform float uRadius; uniform float uWidth; uniform float uSpeed; uniform float uWobble; uniform vec2 uCenter; varying vec2 vUv; void main(){ vec2 uv=vUv; vec2 c=uCenter + vec2(0.5,0.5); vec2 p=uv - c; float r=length(p); float ang=atan(p.y,p.x); float w=uRadius + 0.25*uWidth*(sin(ang*4. + uTime*uSpeed)*uWobble); float inner=w - uWidth*0.5; float outer=w + uWidth*0.5; float band = smoothstep(0.0, 0.01, r-inner) * (1.0 - smoothstep(0.0, 0.01, r-outer)); float inv=1.0 - band; vec3 base=texture2D(tDiffuse, uv).rgb; vec3 invc=1.0-base; vec3 col=mix(base, invc, clamp(inv,0.0,1.0)); gl_FragColor=vec4(col,1.0);} `;

  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ uniforms:{ tDiffuse:{ value: (isGlobal&&renderTarget)?renderTarget.texture:(videoTexture||null) }, uResolution:{ value:new THREE.Vector2(effectiveW,effectiveH) }, uTime:{ value:0 }, uRadius:{ value:radius }, uWidth:{ value:width }, uSpeed:{ value:speed }, uWobble:{ value:wobble }, uCenter:{ value:new THREE.Vector2(centerX, centerY) } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, radius, width, speed, wobble, centerX, centerY]);

  useEffect(()=>{ if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state)=>{ if (!materialRef.current) return; materialRef.current.uniforms.uResolution.value.set(Math.max(1,(size&&size.width)||effectiveW), Math.max(1,(size&&size.height)||effectiveH)); materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; materialRef.current.uniforms.uRadius.value=radius; materialRef.current.uniforms.uWidth.value=width; materialRef.current.uniforms.uSpeed.value=speed; materialRef.current.uniforms.uWobble.value=wobble; materialRef.current.uniforms.uCenter.value.set(centerX, centerY); if (isGlobal && renderTarget && gl && scene && camera){ const prev=gl.getRenderTarget(); const was=meshRef.current?meshRef.current.visible:undefined; if (meshRef.current) meshRef.current.visible=false; try{ gl.setRenderTarget(renderTarget); gl.render(scene,camera);} finally { gl.setRenderTarget(prev); if (meshRef.current && was!==undefined) meshRef.current.visible=was; } if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture; } else if (!isGlobal && videoTexture){ if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture; } });

  const aspect = useMemo(()=>{ try { if (size&&size.width>0&&size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]); if (!shaderMaterial) return null;
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


