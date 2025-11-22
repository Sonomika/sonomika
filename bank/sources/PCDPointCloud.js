// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useEffect, useState } = React || {};

export const metadata = {
  name: 'PCD Point Cloud', description: 'Animated 3D point cloud with BPM sync.', category: 'Sources', author: 'VJ', version: '1.0.0', replacesVideo: false, isSource: true,
  parameters: [
    { name: 'pointSize', type: 'number', value: 0.005, min: 0.001, max: 0.02, step: 0.001 },
    { name: 'pointColor', type: 'color', value: '#ffffff' },
    { name: 'rotationSpeed', type: 'number', value: 0.5, min: 0.0, max: 2.0, step: 0.1 },
    { name: 'scale', type: 'number', value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: 'autoRotate', type: 'boolean', value: true },
    { name: 'bpmSync', type: 'boolean', value: false },
    { name: 'intensity', type: 'number', value: 0.5, min: 0.0, max: 1.0, step: 0.05 },
  ],
};

export default function PCDPointCloudSource({ pointSize=0.005, pointColor='#ffffff', rotationSpeed=0.5, scale=1.0, autoRotate=true, bpmSync=false, intensity=0.5 }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const groupRef=useRef(null); const pointsRef=useRef(null); const [pointCloud,setPointCloud]=useState(null); const [loading,setLoading]=useState(true);
  const geometry = useMemo(()=>{ const g=new THREE.BufferGeometry(); const count=10000; const positions=new Float32Array(count*3); const colors=new Float32Array(count*3); const base=new THREE.Color(pointColor); for(let i=0;i<count;i++){ const theta=Math.random()*Math.PI*2; const phi=Math.acos(Math.random()*2-1); const radius=0.5+Math.random()*0.5; positions[i*3] = radius*Math.sin(phi)*Math.cos(theta); positions[i*3+1]= radius*Math.sin(phi)*Math.sin(theta); positions[i*3+2]= radius*Math.cos(phi); const varAmt=0.3; colors[i*3] = Math.min(1, Math.max(0, base.r + (Math.random()-0.5)*varAmt)); colors[i*3+1]= Math.min(1, Math.max(0, base.g + (Math.random()-0.5)*varAmt)); colors[i*3+2]= Math.min(1, Math.max(0, base.b + (Math.random()-0.5)*varAmt)); } g.setAttribute('position', new THREE.BufferAttribute(positions,3)); g.setAttribute('color', new THREE.BufferAttribute(colors,3)); return g; }, [pointColor]);
  const material = useMemo(()=> new THREE.PointsMaterial({ size:pointSize, vertexColors:true, transparent:true, opacity:0.8, sizeAttenuation:true, blending:THREE.AdditiveBlending }), [pointSize]);
  useEffect(()=>{ if (!geometry||!material) return; const pts=new THREE.Points(geometry, material); setPointCloud(pts); setLoading(false); return ()=>{ geometry.dispose?.(); material.dispose?.(); }; }, [geometry, material]);
  useFrame((state)=>{ if (!groupRef.current || !pointCloud) return; const time=state.clock.elapsedTime; const bpm=(globalThis&&globalThis.VJ_BPM)||120; const currentSpeed = bpmSync ? rotationSpeed*(bpm/60.0) : rotationSpeed; if (autoRotate){ groupRef.current.rotation.x = Math.sin(time*currentSpeed*0.5)*0.3; groupRef.current.rotation.y = time*currentSpeed; groupRef.current.rotation.z = Math.cos(time*currentSpeed*0.3)*0.2; } if (bpmSync){ const beatTime=time*(bpm/60.0); const pulse=1.0 + Math.sin(beatTime*6.28318)*intensity*0.3; groupRef.current.scale.setScalar(scale*pulse); } else { groupRef.current.scale.setScalar(scale); } const colors = pointCloud.geometry.attributes.color; if (colors){ for (let i=0;i<colors.count;i++){ const offs = Math.sin(time*2.0 + i*0.01)*0.1; colors.setXYZ(i, Math.min(1, Math.max(0, colors.getX(i)+offs)), Math.min(1, Math.max(0, colors.getY(i)+offs*0.5)), Math.min(1, Math.max(0, colors.getZ(i)+offs*0.3))); } colors.needsUpdate=true; } });
  if (loading) return null;
  return React.createElement('group',{ref:groupRef}, pointCloud && React.createElement('primitive',{object:pointCloud, ref:pointsRef}));
}


