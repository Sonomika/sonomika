// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Voronoi Glass', description: 'Voronoi refraction with dispersion and edges.', category: 'Effects', author: 'AI', version: '1.0.0', replacesVideo: true, canBeGlobal: true,
  parameters: [
    { name: 'refractionStrength', type: 'number', value: 0.07, min: 0.0, max: 0.2, step: 0.005 },
    { name: 'cellScale', type: 'number', value: 3.0, min: 2.0, max: 60.0, step: 0.5 },
    { name: 'edgeSharpness', type: 'number', value: 0.4, min: 0.0, max: 8.0, step: 0.1 },
    { name: 'dispersion', type: 'number', value: 0.003, min: 0.0, max: 0.02, step: 0.0005 },
    { name: 'edgeBrightness', type: 'number', value: 0.0, min: 0.0, max: 2.0, step: 0.05 },
    { name: 'speed', type: 'number', value: 1.75, min: 0.0, max: 3.0, step: 0.05 },
    { name: 'mixOriginal', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
  ],
};

export default function VoronoiGlassExternal({ videoTexture, isGlobal=false, refractionStrength=0.07, cellScale=3.0, edgeSharpness=0.4, dispersion=0.003, edgeBrightness=0.0, speed=1.75, mixOriginal=0.0, compositionWidth, compositionHeight }){
  if (!React || !THREE || !r3f) return null; const { useThree, useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  let gl, scene, camera, size; try{ const ctx=useThree(); if (ctx){ gl=ctx.gl; scene=ctx.scene; camera=ctx.camera; size=ctx.size; } } catch{}
  const effectiveW=Math.max(1, compositionWidth || (size&&size.width) || 1920); const effectiveH=Math.max(1, compositionHeight || (size&&size.height) || 1080);
  const renderTarget = useMemo(()=>{ if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW,effectiveH,{ format:THREE.RGBAFormat, type:THREE.UnsignedByteType, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(()=>()=>{ try{ renderTarget&&renderTarget.dispose&&renderTarget.dispose(); }catch{} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `precision highp float; uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float time; uniform float refractionStrength; uniform float cellScale; uniform float edgeSharpness; uniform float dispersion; uniform float edgeBrightness; uniform float speed; uniform float mixOriginal; varying vec2 vUv; float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p);} vec2 hash22(vec2 p){ float n = sin(dot(p, vec2(127.1,311.7))); return fract(vec2(262144.0,32768.0)*n);} struct Voro{ float d1; float d2; vec2 nearestVec; }; Voro voronoi(vec2 x){ vec2 cell=floor(x); vec2 frac=fract(x); float d1=1e9; float d2=1e9; vec2 nearest=vec2(0.); for(int j=-1;j<=1;j++){ for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=hash22(cell+g); o = 0.5 + 0.5 * sin(6.2831*(o + 0.25 * sin(time*speed + dot(cell+g, vec2(1.7,9.2))))); vec2 r = g + o - frac; float d = dot(r,r); if (d<d1){ d2=d1; d1=d; nearest=r; } else if (d<d2){ d2=d; } } } Voro v; v.d1=sqrt(d1); v.d2=sqrt(d2); v.nearestVec=nearest; return v; } void main(){ vec2 uv=vUv; float scale=max(0.001, cellScale); Voro vd = voronoi(uv * scale); float edge = clamp((vd.d2 - vd.d1) * scale, 0.0, 1.0); edge = pow(edge, edgeSharpness); vec2 dir = normalize(vd.nearestVec + 1e-6); float bend=(1.0-edge)*refractionStrength; vec2 uvR=uv + dir*(bend+dispersion); vec2 uvG=uv + dir*bend; vec2 uvB=uv + dir*(bend-dispersion); vec3 col; col.r = texture2D(tDiffuse, uvR).r; col.g = texture2D(tDiffuse, uvG).g; col.b = texture2D(tDiffuse, uvB).b; float h = smoothstep(0.0, 0.6, edge)*edgeBrightness; col += h; vec3 base = texture2D(tDiffuse, uv).rgb; col = mix(col, base, clamp(mixOriginal,0.0,1.0)); gl_FragColor = vec4(col, 1.0); }`;

  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ uniforms:{ tDiffuse:{ value: (isGlobal&&renderTarget)?renderTarget.texture:(videoTexture||null) }, uResolution:{ value:new THREE.Vector2(effectiveW,effectiveH) }, time:{ value:0 }, refractionStrength:{ value:refractionStrength }, cellScale:{ value:cellScale }, edgeSharpness:{ value:edgeSharpness }, dispersion:{ value:dispersion }, edgeBrightness:{ value:edgeBrightness }, speed:{ value:speed }, mixOriginal:{ value:mixOriginal } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, refractionStrength, cellScale, edgeSharpness, dispersion, edgeBrightness, speed, mixOriginal]);

  useEffect(()=>{ if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame((state)=>{ if (!materialRef.current) return; materialRef.current.uniforms.time.value = state.clock.elapsedTime; materialRef.current.uniforms.uResolution.value.set(Math.max(1,(size&&size.width)||effectiveW), Math.max(1,(size&&size.height)||effectiveH)); materialRef.current.uniforms.refractionStrength.value = refractionStrength; materialRef.current.uniforms.cellScale.value = cellScale; materialRef.current.uniforms.edgeSharpness.value = edgeSharpness; materialRef.current.uniforms.dispersion.value = dispersion; materialRef.current.uniforms.edgeBrightness.value = edgeBrightness; materialRef.current.uniforms.speed.value = speed; materialRef.current.uniforms.mixOriginal.value = mixOriginal; if (isGlobal && renderTarget && gl && scene && camera){ const prev=gl.getRenderTarget(); const was=meshRef.current?meshRef.current.visible:undefined; if (meshRef.current) meshRef.current.visible=false; try{ gl.setRenderTarget(renderTarget); gl.render(scene,camera);} finally { gl.setRenderTarget(prev); if (meshRef.current && was!==undefined) meshRef.current.visible=was; } if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture; } else if (!isGlobal && videoTexture){ if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture; } });

  const aspect = useMemo(()=>{ try { if (size&&size.width>0&&size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]); if (!shaderMaterial) return null;
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


