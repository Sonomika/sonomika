// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useState } = React || {};

export const metadata = {
  name: 'Data Visualization', description: 'Animated HUD-style text and lines with BPM pulse.', category: 'Sources', author: 'AI', version: '1.0.0', folder: 'sources', isSource: true,
  parameters: [ { name: 'color', type: 'color', value: '#00ff00' }, { name: 'intensity', type: 'number', value: 1.0, min: 0.1, max: 3.0, step: 0.1 }, { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 }, { name: 'textCount', type: 'number', value: 24, min: 5, max: 50, step: 1 }, { name: 'lineCount', type: 'number', value: 16, min: 4, max: 32, step: 1 } ],
};

export default function DataVisualizationSourceExternal({ color='#00ff00', intensity=1.0, speed=1.0, textCount=24, lineCount=16 }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const groupRef=useRef(null); const [dynamicTexts, setDynamicTexts] = useState([]);
  const dataTexts = useMemo(()=>['FPS: 60','CPU: 23%','GPU: 45%','RAM: 2.1GB','TEMP: 67C','BPM: 128','TIME: 03:42','LAYER: 5','BLEND: ADD','OPACITY: 85%','X: 1920','Y: 1080','Z: 0.5','ROT: 45','SCALE: 1.2x','MIDI: CH1','CC64: 127','NOTE: C4','VEL: 100','PITCH: +12','BUFFER: 512','RATE: 44.1k','BITS: 24','CHANNELS: 2','LATENCY: 12ms'], []);
  const textElements = useMemo(()=> Array.from({length: Math.min(textCount, dataTexts.length)}, (_,i)=>({ id:i, text:dataTexts[i%dataTexts.length], position:[(Math.random()-0.5)*8, (Math.random()-0.5)*6, (Math.random()-0.5)*2], phase:Math.random()*Math.PI*2, speed:0.5+Math.random()*2 })), [textCount, dataTexts]);
  const lineElements = useMemo(()=> Array.from({length: lineCount}, (_,i)=>({ id:i, start:[(Math.random()-0.5)*8,(Math.random()-0.5)*6,(Math.random()-0.5)*2], end:[(Math.random()-0.5)*8,(Math.random()-0.5)*6,(Math.random()-0.5)*2], phase:Math.random()*Math.PI*2, speed:0.3+Math.random()*1.5 })), [lineCount]);
  const generateRandomValues = ()=>{ const bpm=(globalThis&&globalThis.VJ_BPM)||120; const now=new Date(); const newTexts=[`FPS: ${Math.floor(Math.random()*60+30)}`,`CPU: ${Math.floor(Math.random()*100)}%`,`GPU: ${Math.floor(Math.random()*100)}%`,`RAM: ${(Math.random()*4+1).toFixed(1)}GB`,`TEMP: ${Math.floor(Math.random()*40+50)}C`,`BPM: ${bpm}`,`TIME: ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`,`X: ${Math.floor(Math.random()*2000)}`,`Y: ${Math.floor(Math.random()*1200)}`,`VU: ${Math.floor(Math.random()*40-60)}dB`]; setDynamicTexts(newTexts); };
  useFrame((state)=>{ if (groupRef.current){ const bpm=(globalThis&&globalThis.VJ_BPM)||120; const beatTime=state.clock.elapsedTime*(bpm/60)*speed; groupRef.current.rotation.z = Math.sin(beatTime*0.1)*0.1; if (Math.floor(beatTime*4)%8===0 && Math.random()<0.1) generateRandomValues(); } });

  return React.createElement('group',{ref:groupRef},
    textElements.map((e,i)=> React.createElement(ExternalHUDText,{ key:e.id, position:e.position, text: (i<dynamicTexts.length?dynamicTexts[i]:e.text), color, intensity, speed, phase:e.phase, elementSpeed:e.speed })),
    lineElements.map((e)=> React.createElement(ExternalHUDLine,{ key:e.id, start:e.start, end:e.end, color, intensity, speed, phase:e.phase, elementSpeed:e.speed })),
    React.createElement('mesh',{position:[0,0,0]}, React.createElement('ringGeometry',{args:[0.5,0.6,16]}), React.createElement('meshBasicMaterial',{ color, transparent:true, opacity:0.3, blending:THREE.AdditiveBlending, depthTest:false, depthWrite:false }))
  );
}

function ExternalHUDText({ position, text, color, intensity, speed, phase, elementSpeed }){
  const meshRef=useRef(null); const materialRef=useRef(null);
  const tex = useMemo(()=>{ const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d'); canvas.width=256; canvas.height=64; if (ctx){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.font='16px monospace'; ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text, canvas.width/2, canvas.height/2); } const t=new THREE.CanvasTexture(canvas); t.needsUpdate=true; return t; }, [text, color]);
  r3f.useFrame((state)=>{ const bpm=(globalThis&&globalThis.VJ_BPM)||120; if (!meshRef.current||!materialRef.current) return; const beatTime=state.clock.elapsedTime*(bpm/60)*speed*elementSpeed; const flash=Math.sin(beatTime*6.28318 + phase); const op=Math.max(0.1, Math.min(1.0, 0.5 + flash*0.5*intensity)); const jit=Math.sin(beatTime*12.566 + phase)*0.02*intensity; materialRef.current.opacity=op; meshRef.current.position.x = position[0] + jit; meshRef.current.position.y = position[1] + Math.cos(beatTime + phase)*0.01; });
  return React.createElement('mesh',{ref:meshRef, position}, React.createElement('planeGeometry',{args:[0.8,0.2]}), React.createElement('meshBasicMaterial',{ ref:materialRef, map:tex, transparent:true, opacity:0.7, blending:THREE.AdditiveBlending, depthTest:false, depthWrite:false }));
}

function ExternalHUDLine({ start, end, color, intensity, speed, phase, elementSpeed }){
  const lineRef=useRef(null); const geom=useMemo(()=>{ const pts=[new THREE.Vector3(...start), new THREE.Vector3(...end)]; return new THREE.BufferGeometry().setFromPoints(pts); }, [start,end]);
  r3f.useFrame((state)=>{ const bpm=(globalThis&&globalThis.VJ_BPM)||120; if (!lineRef.current||!lineRef.current.material) return; const beatTime=state.clock.elapsedTime*(bpm/60)*speed*elementSpeed; const flash=Math.sin(beatTime*6.28318 + phase); const op=Math.max(0.05, Math.min(0.8, 0.3 + flash*0.3*intensity)); lineRef.current.material.opacity=op; });
  return React.createElement('primitive',{ object:new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent:true, opacity:0.3, blending:THREE.AdditiveBlending, depthTest:false, depthWrite:false })), ref:lineRef });
}


