// Portable external Snake Auto Source (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Snake Auto Source (External)', description: 'Auto-playing snake on a grid.', category: 'Sources', author: 'VJ System', version: '1.0.0', isSource: true,
  parameters: [
    { name: 'gridSize', type: 'number', value: 40, min: 10, max: 120, step: 1 },
    { name: 'cellSize', type: 'number', value: 0.05, min: 0.01, max: 0.075, step: 0.001 },
    { name: 'gameSpeed', type: 'number', value: 8, min: 1, max: 30, step: 1 },
    { name: 'snakeLength', type: 'number', value: 20, min: 5, max: 200, step: 1 },
    { name: 'growthRate', type: 'number', value: 6, min: 1, max: 40, step: 1 },
    { name: 'wrapAround', type: 'boolean', value: true },
    { name: 'colorHead', type: 'color', value: '#ffffff' },
    { name: 'colorBody', type: 'color', value: '#33ff88' },
    { name: 'colorFood', type: 'color', value: '#ff3366' },
    { name: 'turnBias', type: 'number', value: 0.7, min: 0, max: 1, step: 0.05 },
  ],
};

export default function SnakeAutoSourceExternal({ gridSize=40, cellSize=0.05, gameSpeed=8, snakeLength=20, growthRate=6, wrapAround=true, colorHead='#ffffff', colorBody='#33ff88', colorFood='#ff3366', turnBias=0.7 }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const groupRef=useRef(null); const timeAccRef=useRef(0); const dirRef=useRef({x:1,y:0}); const snakeRef=useRef([]); const foodRef=useRef({x:0,y:0}); const targetLenRef=useRef(snakeLength); const [tick,setTick]=useState(0);
  const effectiveCellSize=Math.min(cellSize, 0.075); const geom=useMemo(()=> new THREE.PlaneGeometry(effectiveCellSize, effectiveCellSize), [effectiveCellSize]);
  const matBody=useMemo(()=>{ const m=new THREE.MeshBasicMaterial({ color:new THREE.Color(colorBody), transparent:true }); m.depthTest=false; m.depthWrite=false; m.blending=THREE.AdditiveBlending; m.side=THREE.DoubleSide; return m; }, [colorBody]);
  const matHead=useMemo(()=>{ const m=new THREE.MeshBasicMaterial({ color:new THREE.Color(colorHead), transparent:true }); m.depthTest=false; m.depthWrite=false; m.blending=THREE.AdditiveBlending; m.side=THREE.DoubleSide; return m; }, [colorHead]);
  const matFood=useMemo(()=>{ const m=new THREE.MeshBasicMaterial({ color:new THREE.Color(colorFood), transparent:true }); m.depthTest=false; m.depthWrite=false; m.blending=THREE.AdditiveBlending; m.side=THREE.DoubleSide; return m; }, [colorFood]);
  const bounds=useMemo(()=>({ half:(gridSize*effectiveCellSize)/2 }), [gridSize, effectiveCellSize]);
  const initializedRef=useRef(false);
  function randomEmptyCell(exclude){ for(let i=0;i<1000;i++){ const x=Math.floor(Math.random()*gridSize); const y=Math.floor(Math.random()*gridSize); const k=`${x},${y}`; if(!exclude.has(k)) return {x,y}; } return { x:Math.floor(gridSize/2), y:Math.floor(gridSize/2)}; }
  function step(){ const head=snakeRef.current[0]; const d=dirRef.current; const options=[d, {x:-d.y,y:d.x}, {x:d.y,y:-d.x}]; const weights=[turnBias, (1-turnBias)/2, (1-turnBias)/2]; const occupied=new Set(snakeRef.current.map(c=>`${c.x},${c.y}`)); const scored=[]; for(let i=0;i<options.length;i++){ const nd=options[i]; let nx=head.x+nd.x, ny=head.y+nd.y; if (wrapAround){ nx=(nx+gridSize)%gridSize; ny=(ny+gridSize)%gridSize; } let score=weights[i]; if (nx<0||ny<0||nx>=gridSize||ny>=gridSize) score-=1.0; const k=`${nx},${ny}`; if (occupied.has(k)) score-=0.8; const fx=foodRef.current.x, fy=foodRef.current.y; const dist=Math.abs(fx-nx)+Math.abs(fy-ny); const distHead=Math.abs(fx-head.x)+Math.abs(fy-head.y); if (dist<distHead) score+=0.2; scored.push({dir:nd, score}); } scored.sort((a,b)=>b.score-a.score); dirRef.current=scored[0].dir; let nx=head.x+dirRef.current.x, ny=head.y+dirRef.current.y; if (wrapAround){ nx=(nx+gridSize)%gridSize; ny=(ny+gridSize)%gridSize; } if (!wrapAround && (nx<0||ny<0||nx>=gridSize||ny>=gridSize)){ snakeRef.current=[{x:Math.floor(gridSize/2), y:Math.floor(gridSize/2)}]; dirRef.current={x:1,y:0}; targetLenRef.current=snakeLength; return; } const k=`${nx},${ny}`; const bodyIndex=snakeRef.current.findIndex(c=>c.x===nx&&c.y===ny); if (bodyIndex>=0){ snakeRef.current = snakeRef.current.slice(0, bodyIndex); } snakeRef.current.unshift({x:nx,y:ny}); if (nx===foodRef.current.x && ny===foodRef.current.y){ targetLenRef.current += growthRate; const occNow=new Set(snakeRef.current.map(c=>`${c.x},${c.y}`)); foodRef.current = randomEmptyCell(occNow); } while (snakeRef.current.length > Math.max(targetLenRef.current, snakeLength)){ snakeRef.current.pop(); } setTick(t=> (t+1)%1000000); }
  useFrame((_,delta)=>{ if(!initializedRef.current){ initializedRef.current=true; const cx=Math.floor(gridSize/2), cy=Math.floor(gridSize/2); snakeRef.current = Array.from({length:Math.max(3, Math.min(10, snakeLength))}, (_,i)=>({x:cx-i,y:cy})); dirRef.current={x:1,y:0}; const occ=new Set(snakeRef.current.map(c=>`${c.x},${c.y}`)); foodRef.current = randomEmptyCell(occ); targetLenRef.current=snakeLength; } timeAccRef.current += delta; const interval = 1/Math.max(0.5, gameSpeed); while (timeAccRef.current >= interval){ step(); timeAccRef.current -= interval; } });
  return React.createElement('group',{ref:groupRef, position:[0,0,0]}, snakeRef.current.slice(1).map((c,i)=> React.createElement('mesh',{key:`b-${tick}-${i}-${c.x}-${c.y}`, geometry:geom, material:matBody, position:[c.x*effectiveCellSize - bounds.half + effectiveCellSize/2, c.y*effectiveCellSize - bounds.half + effectiveCellSize/2, 0]})), snakeRef.current.length>0 && React.createElement('mesh',{key:`h-${tick}-${snakeRef.current[0].x}-${snakeRef.current[0].y}`, geometry:geom, material:matHead, position:[snakeRef.current[0].x*effectiveCellSize - bounds.half + effectiveCellSize/2, snakeRef.current[0].y*effectiveCellSize - bounds.half + effectiveCellSize/2, 0]}), React.createElement('mesh',{key:`f-${tick}-${foodRef.current.x}-${foodRef.current.y}`, geometry:geom, material:matFood, position:[foodRef.current.x*effectiveCellSize - bounds.half + effectiveCellSize/2, foodRef.current.y*effectiveCellSize - bounds.half + effectiveCellSize/2, 0]}));
}


