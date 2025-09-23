// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'SSS Model Source', description: 'FBX model using Subsurface Scattering shader.', category: 'Sources', author: 'AI', version: '1.0.0', isSource: true,
  parameters: [
    { name: 'modelUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/fbx/stanford-bunny.fbx' },
    { name: 'albedoMapUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/fbx/white.jpg' },
    { name: 'thicknessMapUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/fbx/bunny_thickness.jpg' },
    { name: 'rotationSpeed', type: 'number', value: 0.2, min: 0, max: 5, step: 0.01 },
    { name: 'scale', type: 'number', value: 1, min: 0.01, max: 10, step: 0.01 },
  ],
};

function resolveUrl(url){ if (!url) return ''; const u=(url+'').trim(); if (u.startsWith('http')||u.startsWith('file://')||u.startsWith('/')) return u; if (/^[A-Za-z]:[\\/]/.test(u)) return 'file:///' + u.replace(/\\/g,'/'); return u; }
function solidTexture(r,g,b,a=255){ const data=new Uint8Array([r,g,b,a]); const tex=new THREE.DataTexture(data,1,1,THREE.RGBAFormat); tex.needsUpdate=true; tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter; return tex; }

export default function SSSModelSourceExternal({ modelUrl='', albedoMapUrl='', thicknessMapUrl='', rotationSpeed=0.2, scale=1 }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const groupRef=useRef(null); const modelRef=useRef(null); const [material,setMaterial]=useState(null); const texLoader=useMemo(()=> new THREE.TextureLoader(), []);
  useEffect(()=>{ const shader = (THREE as any).SubsurfaceScatteringShader || (globalThis as any).SubsurfaceScatteringShader; if (!shader){ setMaterial(null); return; } const uniforms = THREE.UniformsUtils.clone(shader.uniforms); let albedo=null, thickness=null; try{ if (albedoMapUrl){ albedo = texLoader.load(resolveUrl(albedoMapUrl)); (albedo as any).colorSpace = (THREE as any).SRGBColorSpace || undefined; } }catch{} try{ if (thicknessMapUrl){ thickness = texLoader.load(resolveUrl(thicknessMapUrl)); } }catch{} if (!albedo) albedo=solidTexture(255,255,255,255); if (!thickness) thickness=solidTexture(0,0,0,255); uniforms['map'].value=albedo; uniforms['diffuse'].value=new THREE.Vector3(1.0,0.2,0.2); uniforms['shininess'].value=500; uniforms['thicknessMap'].value=thickness; uniforms['thicknessColor'].value=new THREE.Vector3(0.5,0.3,0.0); uniforms['thicknessDistortion'].value=0.1; uniforms['thicknessAmbient'].value=0.4; uniforms['thicknessAttenuation'].value=0.8; uniforms['thicknessPower'].value=2.0; uniforms['thicknessScale'].value=16.0; const mat=new THREE.ShaderMaterial({ uniforms, vertexShader:shader.vertexShader, fragmentShader:shader.fragmentShader, lights:true, transparent:false }); setMaterial(mat); return ()=>{ mat.dispose(); }; }, [albedoMapUrl, thicknessMapUrl, texLoader]);
  useEffect(()=>{ if (!modelUrl || !material) return; let disposed=false; const FBXLoader=((THREE as any).FBXLoader) || ((globalThis as any).FBXLoader); if (!FBXLoader){ console.warn('FBXLoader not available on global THREE'); return; } const loader = new FBXLoader(); const url=resolveUrl(modelUrl); try{ const m=url.match(/^(.*)[/\\][^/\\]*$/); if (m) loader.setResourcePath?.(m[1]+'/'); }catch{} loader.load(url, (object)=>{ if (disposed) return; const root=object; try{ (root as any).traverse?.((child)=>{ if (child.isMesh){ child.material=material; child.castShadow=false; child.receiveShadow=false; } }); }catch{} const box=new THREE.Box3().setFromObject(root); const size=new THREE.Vector3(); const center=new THREE.Vector3(); box.getSize(size); box.getCenter(center); root.position.sub(center); const target=0.6; const maxDim=Math.max(size.x,size.y,size.z)||1; const fit=target/maxDim; root.scale.multiplyScalar(fit*scale); root.position.z += 0.05; modelRef.current=root; if (groupRef.current) groupRef.current.add(root); }, undefined, (err)=>{ console.error('FBX load error:', { err, url }); }); return ()=>{ disposed=true; if (groupRef.current && modelRef.current){ try{ groupRef.current.remove(modelRef.current);}catch{} } modelRef.current=null; }; }, [modelUrl, material, scale]);
  useFrame((state)=>{ if (modelRef.current) modelRef.current.rotation.y = state.clock.elapsedTime * rotationSpeed; });
  return React.createElement('group',{ref:groupRef}, React.createElement('ambientLight',{color:0xc1c1c1, intensity:1.0}), React.createElement('directionalLight',{color:0xffffff, intensity:0.1, position:[0,0.5,0.5]}), React.createElement('pointLight',{color:0xc1c1c1, intensity:4.0, distance:3, position:[0,-0.05,0.35]}), React.createElement('pointLight',{color:0xc1c100, intensity:0.75, distance:5, position:[-0.1,0.02,-0.26]}), !modelRef.current && material && React.createElement('mesh',{position:[0,0,0.05]}, React.createElement('sphereGeometry',{args:[0.3,32,32]}), React.createElement('meshStandardMaterial',{color:0xaa4444})) );
}


