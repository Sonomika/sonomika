// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Wireframe Head Source', description: 'Edge-thickness wireframe of BufferGeometry JSON.', category: 'Sources', author: 'VJ', version: '1.0.0', isSource: true,
  parameters: [
    { name: 'modelUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/json/WaltHeadLo_buffergeometry.json' },
    { name: 'thickness', type: 'number', value: 1, min: 0, max: 4, step: 0.01 },
    { name: 'showLeftBasic', type: 'boolean', value: true },
  ],
};

function resolveUrl(url){ const u=(url||'').trim(); if (!u) return ''; if (u.startsWith('http')||u.startsWith('file://')||u.startsWith('/')) return u; if (/^[A-Za-z]:[\\/]/.test(u)) return 'file:///' + u.replace(/\\/g,'/'); return u; }

const vertexShader = `attribute vec3 center; varying vec3 vCenter; void main(){ vCenter=center; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const fragmentShader = `uniform float thickness; varying vec3 vCenter; void main(){ vec3 afwidth=fwidth(vCenter.xyz); vec3 edge3=smoothstep((thickness-1.0)*afwidth, thickness*afwidth, vCenter.xyz); float edge=1.0 - min(min(edge3.x, edge3.y), edge3.z); gl_FragColor.rgb = gl_FrontFacing ? vec3(0.9,0.9,1.0) : vec3(0.4,0.4,0.5); gl_FragColor.a = edge; }`;

export default function WireframeHeadSource({ modelUrl='https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/json/WaltHeadLo_buffergeometry.json', thickness=1, showLeftBasic=true }){
  if (!React || !THREE || !r3f) return null; const groupRef=useRef(null); const [geometry,setGeometry]=useState(null);
  useEffect(()=>{ let disposed=false; const Loader=(THREE as any).BufferGeometryLoader || (globalThis as any).BufferGeometryLoader; if (!Loader){ console.warn('BufferGeometryLoader not available'); return; } const loader=new Loader(); const url=resolveUrl(modelUrl); loader.load(url, (geo)=>{ if (disposed) return; geo.deleteAttribute?.('normal'); geo.deleteAttribute?.('uv'); const pos=geo.getAttribute('position'); const centers=new Float32Array(pos.count*3); const vectors=[new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)]; for (let i=0,l=pos.count;i<l;i++){ vectors[i%3].toArray(centers, i*3); } geo.setAttribute('center', new THREE.BufferAttribute(centers,3)); const box=new THREE.Box3().setFromObject(new THREE.Mesh(geo)); const size=new THREE.Vector3(); const center=new THREE.Vector3(); box.getSize(size); box.getCenter(center); geo.translate(-center.x,-center.y,-center.z); const maxDim=Math.max(size.x,size.y,size.z)||1; const fit=0.8/maxDim; geo.scale(fit,fit,fit); setGeometry(geo); }, undefined, (err)=>{ console.error('Wireframe head load error:', {err, url}); }); return ()=>{ disposed=true; }; }, [modelUrl]);
  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ uniforms:{ thickness:{value:thickness} }, vertexShader, fragmentShader, side:THREE.DoubleSide, transparent:true, alphaToCoverage:true }), [thickness]);
  const leftMaterial = useMemo(()=> new THREE.MeshBasicMaterial({ color:0xe0e0ff, wireframe:true }), []);
  return React.createElement('group',{ref:groupRef}, React.createElement('ambientLight',{intensity:0.8}), React.createElement('directionalLight',{position:[0,0.5,0.8], intensity:0.3}), geometry && showLeftBasic && React.createElement('mesh',{geometry, position:[-0.5,0,0], material:leftMaterial}), geometry && React.createElement('mesh',{geometry, position:[0.5,0,0]}, React.createElement('primitive',{object:shaderMaterial, attach:'material'})) );
}


