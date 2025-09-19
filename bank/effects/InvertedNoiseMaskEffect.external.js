// Portable external Inverted Noise Mask effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Inverted Noise Mask (External)', description: 'FBM noise inverted mask with soft edges.', category: 'Video Effects', author: 'VJ System', version: '1.0.0', replacesVideo: true, canBeGlobal: true,
  parameters: [ { name: 'scale', type: 'number', value: 3.0, min: 0.5, max: 12.0, step: 0.1 }, { name: 'threshold', type: 'number', value: 0.5, min: 0.0, max: 1.0, step: 0.01 }, { name: 'contrast', type: 'number', value: 2.0, min: 0.5, max: 4.0, step: 0.05 }, { name: 'speed', type: 'number', value: 0.5, min: 0.0, max: 5.0, step: 0.05 }, { name: 'softness', type: 'number', value: 0.05, min: 0.0, max: 0.3, step: 0.005 } ],
};

export default function InvertedNoiseMaskExternal({ videoTexture, isGlobal=false, scale=3.0, threshold=0.5, contrast=2.0, speed=0.5, softness=0.05, compositionWidth, compositionHeight }){
  if (!React || !THREE || !r3f) return null; const { useThree, useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  let gl, scene, camera, size; try{ const ctx=useThree(); if (ctx){ gl=ctx.gl; scene=ctx.scene; camera=ctx.camera; size=ctx.size; } } catch{}
  const effectiveW=Math.max(1, compositionWidth || (size&&size.width) || 1920); const effectiveH=Math.max(1, compositionHeight || (size&&size.height) || 1080);
  const renderTarget = useMemo(()=>{ if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW,effectiveH,{ format:THREE.RGBAFormat, type:THREE.UnsignedByteType, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(()=>()=>{ try{ renderTarget&&renderTarget.dispose&&renderTarget.dispose(); }catch{} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uTime; uniform float uScale; uniform float uThreshold; uniform float uContrast; uniform float uSpeed; uniform float uSoftness; varying vec2 vUv; float hash(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p.x+p.y)*43758.5453);} float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i); float b=hash(i+vec2(1.,0.)); float c=hash(i+vec2(0.,1.)); float d=hash(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y; } float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.; a*=.5; } return v; } void main(){ vec2 uv=vUv; vec2 p=uv*uScale + vec2(0., uTime*uSpeed); float n=fbm(p); float t=uThreshold; float s=uSoftness; float c=uContrast; float edge=smoothstep(t-s, t+s, pow(n, c)); float inv=1.0-edge; vec3 base=texture2D(tDiffuse, uv).rgb; vec3 invc = 1.0-base; vec3 col=mix(base, invc, clamp(inv,0.0,1.0)); gl_FragColor=vec4(col,1.0);} `;

  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ uniforms:{ tDiffuse:{ value: (isGlobal&&renderTarget)?renderTarget.texture:(videoTexture||null) }, uResolution:{ value:new THREE.Vector2(effectiveW,effectiveH) }, uTime:{ value:0 }, uScale:{ value:scale }, uThreshold:{ value:threshold }, uContrast:{ value:contrast }, uSpeed:{ value:speed }, uSoftness:{ value:softness } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, scale, threshold, contrast, speed, softness]);

  useEffect(()=>{ if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state)=>{ if (!materialRef.current) return; materialRef.current.uniforms.uResolution.value.set(Math.max(1,(size&&size.width)||effectiveW), Math.max(1,(size&&size.height)||effectiveH)); materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; materialRef.current.uniforms.uScale.value=scale; materialRef.current.uniforms.uThreshold.value=threshold; materialRef.current.uniforms.uContrast.value=contrast; materialRef.current.uniforms.uSpeed.value=speed; materialRef.current.uniforms.uSoftness.value=softness; if (isGlobal && renderTarget && gl && scene && camera){ const prev=gl.getRenderTarget(); const was=meshRef.current?meshRef.current.visible:undefined; if (meshRef.current) meshRef.current.visible=false; try{ gl.setRenderTarget(renderTarget); gl.render(scene,camera);} finally { gl.setRenderTarget(prev); if (meshRef.current && was!==undefined) meshRef.current.visible=was; } if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture; } else if (!isGlobal && videoTexture){ if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture; } });

  const aspect = useMemo(()=>{ try { if (size&&size.width>0&&size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]); if (!shaderMaterial) return null;
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


