// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: '3D Video Slices',
  description: 'Splits input into animated 3D horizontal slices.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'sliceCount', type: 'number', value: 10, min: 3, max: 30, step: 1 },
    { name: 'separationDistance', type: 'number', value: 0.5, min: 0, max: 2, step: 0.1 },
    { name: 'rotationIntensity', type: 'number', value: 1, min: 0, max: 3, step: 0.1 },
    { name: 'depthSpread', type: 'number', value: 2, min: 0, max: 5, step: 0.1 },
    { name: 'animationSpeed', type: 'number', value: 1, min: 0, max: 3, step: 0.1 },
    { name: 'chaosLevel', type: 'number', value: 0.5, min: 0, max: 1, step: 0.1 },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.01 },
  ],
};

export default function Video3DSlice({ videoTexture, opacity=1, sliceCount=10, separationDistance=0.5, rotationIntensity=1, depthSpread=2, animationSpeed=1, chaosLevel=0.5, isGlobal=false, compositionWidth, compositionHeight }){
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const groupRef = useRef(null); const timeRef = useRef(0);
  let gl, scene, camera, size; try { const ctx=useThree(); if (ctx){ gl=ctx.gl; scene=ctx.scene; camera=ctx.camera; size=ctx.size; } } catch {}
  const effectiveW = Math.max(1, compositionWidth || (size&&size.width) || 1920); const effectiveH = Math.max(1, compositionHeight || (size&&size.height) || 1080);

  const blackTexture = useMemo(()=>{ const tex=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat); tex.needsUpdate=true; return tex; }, []);
  const renderTarget = useMemo(()=>{ if(!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW,effectiveH,{ format:THREE.RGBAFormat, type:THREE.UnsignedByteType, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(()=>()=>{ try{ renderTarget&&renderTarget.dispose&&renderTarget.dispose(); }catch{} }, [renderTarget]);

  const slices = useMemo(()=>{
    const arr = []; const sliceH = 2.1 / sliceCount; const startY = 1 - sliceH/2;
    for (let i=0;i<sliceCount;i++){
      const geometry = new THREE.PlaneGeometry(2.1, sliceH);
      const uvAttr = geometry.attributes.uv; const uvs = uvAttr.array; const uvOffsetY = i / sliceCount; const uvScale = 1 / sliceCount; for (let j=0;j<uvs.length; j+=2){ uvs[j+1] = uvOffsetY + uvs[j+1]*uvScale; } uvAttr.needsUpdate = true;
      const material = new THREE.ShaderMaterial({
        uniforms: { tDiffuse:{ value:blackTexture }, uTime:{ value:0 }, uSliceIndex:{ value:i }, uSliceCount:{ value:sliceCount }, uSeparationDistance:{ value:separationDistance }, uRotationIntensity:{ value:rotationIntensity }, uDepthSpread:{ value:depthSpread }, uAnimationSpeed:{ value:animationSpeed }, uChaosLevel:{ value:chaosLevel }, uOpacity:{ value:opacity }, uRandomSeed:{ value: Math.random()*1000 } },
        vertexShader: `uniform float uTime; uniform float uSliceIndex; uniform float uSliceCount; uniform float uSeparationDistance; uniform float uRotationIntensity; uniform float uDepthSpread; uniform float uAnimationSpeed; uniform float uChaosLevel; uniform float uRandomSeed; varying vec2 vUv; float noise(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); } void main(){ vUv=uv; vec3 pos=position; float aT=uTime*uAnimationSpeed; float sProg=uSliceIndex/uSliceCount; float sNoise=noise(vec2(uSliceIndex*123.456, uRandomSeed)); float sep=(sProg-0.5)*uSeparationDistance*2.0; pos.x += sep; float cX=sin(aT*3. + uSliceIndex*.5 + uRandomSeed)*uChaosLevel*.5; pos.x += cX*sNoise; float dZ=sin(aT*2. + uSliceIndex*.3)*uDepthSpread*sNoise; pos.z += dZ; float cZ=cos(aT*4. + uSliceIndex*.7 + uRandomSeed)*uChaosLevel; pos.z += cZ; float cY=sin(aT*5. + uSliceIndex*.9)*uChaosLevel*.3; pos.y += cY*sNoise; gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uSliceIndex; uniform float uSliceCount; uniform float uOpacity; uniform float uChaosLevel; uniform float uRandomSeed; varying vec2 vUv; float noise(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); } void main(){ vec4 color = texture2D(tDiffuse, vUv); if (color.a < 0.1) color.a = 1.0; float sNoise = noise(vec2(uSliceIndex*234.567, uRandomSeed)); if (uChaosLevel>0.3){ float cShift = sin(uTime*10. + uSliceIndex)*uChaosLevel*.1; color.r += cShift*sNoise; color.g -= cShift*.5; color.b += cShift*sNoise*.7; } if (sNoise>0.9 && uChaosLevel>0.5){ float f=sin(uTime*50. + uSliceIndex*10.); color.rgb *= 0.5 + 0.5*f; } gl_FragColor = vec4(color.rgb, max(color.a*uOpacity, 0.95)); }`,
        transparent:true, side:THREE.DoubleSide, depthTest:false, depthWrite:false,
      });
      arr.push({ geometry, material, position:[0, startY - i*sliceH, 0], rotation:[0,0,0], sliceIndex:i, randomSeed:Math.random()*1000 });
    }
    return arr;
  }, [sliceCount, separationDistance, rotationIntensity, depthSpread, animationSpeed, chaosLevel, opacity, blackTexture]);

  useFrame((state, delta)=>{
    timeRef.current += delta;
    if (isGlobal && renderTarget && gl && scene && camera){ const prev=gl.getRenderTarget(); const was=groupRef.current?groupRef.current.visible:undefined; if (groupRef.current) groupRef.current.visible=false; try{ gl.setRenderTarget(renderTarget); gl.render(scene,camera);} finally { gl.setRenderTarget(prev); if (groupRef.current && was!==undefined) groupRef.current.visible=was; } }
    if (groupRef.current){ groupRef.current.rotation.y += delta*animationSpeed*0.1; groupRef.current.children.forEach((child, idx)=>{ const mesh=child; const slice=slices[idx]; if (!mesh||!slice) return; mesh.rotation.x += delta*animationSpeed*rotationIntensity*0.5; mesh.rotation.y += delta*animationSpeed*rotationIntensity*0.3; mesh.rotation.z += delta*animationSpeed*rotationIntensity*0.2; const mat=mesh.material; if (mat && mat.uniforms){ mat.uniforms.uTime.value = timeRef.current; const inputTex = isGlobal ? (renderTarget?renderTarget.texture:null) : (videoTexture||null); if (inputTex && mat.uniforms.tDiffuse.value !== inputTex) mat.uniforms.tDiffuse.value = inputTex; mat.uniforms.uOpacity.value = opacity; mat.uniforms.uSeparationDistance && (mat.uniforms.uSeparationDistance.value = separationDistance); mat.uniforms.uRotationIntensity && (mat.uniforms.uRotationIntensity.value = rotationIntensity); mat.uniforms.uDepthSpread && (mat.uniforms.uDepthSpread.value = depthSpread); mat.uniforms.uAnimationSpeed && (mat.uniforms.uAnimationSpeed.value = animationSpeed); mat.uniforms.uChaosLevel && (mat.uniforms.uChaosLevel.value = chaosLevel); }
    }); }
  });

  const compositionAspect = useMemo(()=>{ try { if (size&&size.width>0&&size.height>0) return size.width/size.height; } catch {} return 16/9; }, [size]);
  return React.createElement('group', { ref: groupRef, scale: [compositionAspect, 1, 1] }, slices.map((s, i)=> React.createElement('mesh', { key:i, geometry:s.geometry, material:s.material, position:s.position, rotation:s.rotation })));
}


