// Portable external Test Effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef } = React || {};

export const metadata = {
  name: 'Test Effect (External)', description: 'Simple rotating cube with BPM pulse.', category: 'Test', author: 'VJ System', version: '1.0.0', replacesVideo: false,
  parameters: [ { name: 'color', type: 'color', value: '#ff0000' }, { name: 'size', type: 'number', value: 0.5, min: 0.1, max: 2.0, step: 0.1 }, { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 }, { name: 'rotation', type: 'number', value: 0.5, min: 0.1, max: 2.0, step: 0.1 } ],
};

export default function TestEffectExternal({ color='#ff0000', size=0.5, speed=1.0, rotation=0.5 }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  useFrame((state)=>{ if (!meshRef.current||!materialRef.current) return; meshRef.current.rotation.x += 0.01*speed; meshRef.current.rotation.y += 0.01*speed; meshRef.current.rotation.z += 0.01*rotation; const bpm=(globalThis&&globalThis.VJ_BPM)||120; const beatsPerSecond=bpm/60; const beatTime=state.clock.elapsedTime*beatsPerSecond; const pulse=Math.sin(beatTime*6.28318)*0.3; const scale=1+pulse; meshRef.current.scale.setScalar(scale); });
  return React.createElement('mesh',{ref:meshRef, position:[0,0,0.5]}, React.createElement('boxGeometry',{args:[size,size,size]}), React.createElement('meshBasicMaterial',{ref:materialRef, color, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending, depthTest:false, depthWrite:false }));
}


