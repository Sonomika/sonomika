// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Inverted Stripe Mask', description: 'Scrolling angled stripes as inverted mask.', category: 'Effects', author: 'VJ', version: '1.0.0', replacesVideo: true, canBeGlobal: true,
  parameters: [ { name: 'stripes', type: 'number', value: 24, min: 2, max: 200, step: 1 }, { name: 'angle', type: 'number', value: Math.PI*0.25, min: 0, max: Math.PI*2, step: 0.01 }, { name: 'speed', type: 'number', value: 0.25, min: 0.0, max: 5.0, step: 0.01 }, { name: 'duty', type: 'number', value: 0.5, min: 0.05, max: 0.95, step: 0.01 }, { name: 'soften', type: 'number', value: 0.02, min: 0.0, max: 0.25, step: 0.005 } ],
};

export default function InvertedStripeMask({ videoTexture, isGlobal=false, stripes=24, angle=Math.PI*0.25, speed=0.25, duty=0.5, soften=0.02, compositionWidth, compositionHeight }){
  if (!React || !THREE || !r3f) return null; const { useThree, useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  let gl, scene, camera, size; try{ const ctx=useThree(); if (ctx){ gl=ctx.gl; scene=ctx.scene; camera=ctx.camera; size=ctx.size; } } catch{}
  const effectiveW=Math.max(1, compositionWidth || (size&&size.width) || 1920); const effectiveH=Math.max(1, compositionHeight || (size&&size.height) || 1080);
  const renderTarget = useMemo(()=>{ if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW,effectiveH,{ format:THREE.RGBAFormat, type:THREE.UnsignedByteType, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(()=>()=>{ try{ renderTarget&&renderTarget.dispose&&renderTarget.dispose(); }catch{} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uTime; uniform float uStripes; uniform float uAngle; uniform float uSpeed; uniform float uDuty; uniform float uSoften; varying vec2 vUv; void main(){ vec2 uv0=vUv; vec2 uv=uv0-0.5; float c=cos(uAngle), s=sin(uAngle); vec2 r=mat2(c,-s,s,c)*uv; float phase=uTime*uSpeed; float g=fract(r.x*uStripes + phase); float band = smoothstep(0.0, uSoften, g) * (1.0 - smoothstep(uDuty, uDuty+uSoften, g)); float inv=1.0 - band; vec3 base=texture2D(tDiffuse, uv0).rgb; vec3 invc=1.0-base; vec3 col=mix(base, invc, clamp(inv,0.0,1.0)); gl_FragColor=vec4(col,1.0);} `;

  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ uniforms:{ tDiffuse:{ value: (isGlobal&&renderTarget)?renderTarget.texture:(videoTexture||null) }, uResolution:{ value:new THREE.Vector2(effectiveW,effectiveH) }, uTime:{ value:0 }, uStripes:{ value:stripes }, uAngle:{ value:angle }, uSpeed:{ value:speed }, uDuty:{ value:duty }, uSoften:{ value:soften } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, stripes, angle, speed, duty, soften]);

  useEffect(()=>{ if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state)=>{ if (!materialRef.current) return; materialRef.current.uniforms.uResolution.value.set(Math.max(1,(size&&size.width)||effectiveW), Math.max(1,(size&&size.height)||effectiveH)); materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; materialRef.current.uniforms.uStripes.value=stripes; materialRef.current.uniforms.uAngle.value=angle; materialRef.current.uniforms.uSpeed.value=speed; materialRef.current.uniforms.uDuty.value=duty; materialRef.current.uniforms.uSoften.value=soften; if (isGlobal && renderTarget && gl && scene && camera){ const prev=gl.getRenderTarget(); const was=meshRef.current?meshRef.current.visible:undefined; if (meshRef.current) meshRef.current.visible=false; try{ gl.setRenderTarget(renderTarget); gl.render(scene,camera);} finally { gl.setRenderTarget(prev); if (meshRef.current && was!==undefined) meshRef.current.visible=was; } if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture; } else if (!isGlobal && videoTexture){ if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture; } });

  const aspect = useMemo(()=>{ try { if (size&&size.width>0&&size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]); if (!shaderMaterial) return null;
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


