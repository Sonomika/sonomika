// sonomika template
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Snake Responsive Source', description: 'Auto snake that adapts to canvas size.', category: 'Sources', author: 'AI', version: '1.0.0', isSource: true,
  parameters: [
    { name: 'cellsAcross', type: 'number', value: 40, min: 5, max: 200, step: 1 },
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

export default function SnakeResponsiveSourceExternal({ cellsAcross=40, gameSpeed=8, snakeLength=20, growthRate=6, wrapAround=true, colorHead='#ffffff', colorBody='#33ff88', colorFood='#ff3366', turnBias=0.7 }){
  if (!React || !THREE || !r3f) return null; const { useFrame, useThree } = r3f; const groupRef=useRef(null); const timeAccRef=useRef(0); const dirRef=useRef({x:1,y:0}); const snakeRef=useRef([]); const foodRef=useRef({x:0,y:0}); const targetLenRef=useRef(snakeLength); const [tick,setTick]=useState(0); const { size } = useThree?.() || { size:{width:1920,height:1080} };
  const aspect = size.width>0 && size.height>0 ? size.width/size.height : 16/9; const planeW = aspect*2, planeH=2; const shorter = Math.min(planeW, planeH); const cellWorldSize = Math.max(0.001, shorter/Math.max(2, Math.floor(cellsAcross))); const gridCols=Math.max(2, Math.floor(planeW/cellWorldSize)); const gridRows=Math.max(2, Math.floor(planeH/cellWorldSize)); const halfW=planeW/2, halfH=planeH/2;
  const geom=useMemo(()=> new THREE.PlaneGeometry(cellWorldSize, cellWorldSize), [cellWorldSize]);
  const matBody=useMemo(()=>{ const m=new THREE.MeshBasicMaterial({ color:new THREE.Color(colorBody), transparent:true }); m.depthTest=false; m.depthWrite=false; m.blending=THREE.AdditiveBlending; m.side=THREE.DoubleSide; return m; }, [colorBody]);
  const matHead=useMemo(()=>{ const m=new THREE.MeshBasicMaterial({ color:new THREE.Color(colorHead), transparent:true }); m.depthTest=false; m.depthWrite=false; m.blending=THREE.AdditiveBlending; m.side=THREE.DoubleSide; return m; }, [colorHead]);
  const matFood=useMemo(()=>{ const m=new THREE.MeshBasicMaterial({ color:new THREE.Color(colorFood), transparent:true }); m.depthTest=false; m.depthWrite=false; m.blending=THREE.AdditiveBlending; m.side=THREE.DoubleSide; return m; }, [colorFood]);
  const lastDimsRef=useRef({cols:gridCols, rows:gridRows}); const initializedRef=useRef(false);
  function randomEmptyCell(exclude){ for(let i=0;i<2000;i++){ const x=Math.floor(Math.random()*gridCols); const y=Math.floor(Math.random()*gridRows); const k=`${x},${y}`; if(!exclude.has(k)) return {x,y}; } return { x:Math.floor(gridCols/2), y:Math.floor(gridRows/2)}; }
  function resetSnake(){ const cx=Math.floor(gridCols/2), cy=Math.floor(gridRows/2); snakeRef.current = Array.from({length:Math.max(3, Math.min(10, snakeLength))}, (_,i)=>({x:cx-i,y:cy})); dirRef.current={x:1,y:0}; const occ=new Set(snakeRef.current.map(c=>`${c.x},${c.y}`)); foodRef.current = randomEmptyCell(occ); targetLenRef.current=snakeLength; }
  function step(){ const head=snakeRef.current[0]; const d=dirRef.current; const options=[d, {x:-d.y,y:d.x}, {x:d.y,y:-d.x}]; const weights=[turnBias, (1-turnBias)/2, (1-turnBias)/2]; const occupied=new Set(snakeRef.current.map(c=>`${c.x},${c.y}`)); const scored=[]; for(let i=0;i<options.length;i++){ const nd=options[i]; let nx=head.x+nd.x, ny=head.y+nd.y; if (wrapAround){ nx=(nx+gridCols)%gridCols; ny=(ny+gridRows)%gridRows; } let score=weights[i]; if (nx<0||ny<0||nx>=gridCols||ny>=gridRows) score-=1.0; const k=`${nx},${ny}`; if (occupied.has(k)) score-=0.8; const fx=foodRef.current.x, fy=foodRef.current.y; const dist=Math.abs(fx-nx)+Math.abs(fy-ny); const distHead=Math.abs(fx-head.x)+Math.abs(fy-head.y); if (dist<distHead) score+=0.2; scored.push({dir:nd, score}); } scored.sort((a,b)=>b.score-a.score); dirRef.current=scored[0].dir; let nx=head.x+dirRef.current.x, ny=head.y+dirRef.current.y; if (wrapAround){ nx=(nx+gridCols)%gridCols; ny=(ny+gridRows)%gridRows; } if (!wrapAround && (nx<0||ny<0||nx>=gridCols||ny>=gridRows)){ resetSnake(); return; } const k=`${nx},${ny}`; const bodyIndex=snakeRef.current.findIndex(c=>c.x===nx&&c.y===ny); if (bodyIndex>=0){ snakeRef.current = snakeRef.current.slice(0, bodyIndex); } snakeRef.current.unshift({x:nx,y:ny}); if (nx===foodRef.current.x && ny===foodRef.current.y){ targetLenRef.current += growthRate; const occNow=new Set(snakeRef.current.map(c=>`${c.x},${c.y}`)); foodRef.current = randomEmptyCell(occNow); } while (snakeRef.current.length > Math.max(targetLenRef.current, snakeLength)){ snakeRef.current.pop(); } setTick(t=> (t+1)%1000000); }
  function toWorld(c){ const x=(c.x+0.5)*cellWorldSize - halfW; const y=(c.y+0.5)*cellWorldSize - halfH; return [x,y,0]; }
  useFrame((_,delta)=>{ if(!initializedRef.current){ initializedRef.current=true; lastDimsRef.current={cols:gridCols, rows:gridRows}; resetSnake(); } else if (lastDimsRef.current.cols!==gridCols || lastDimsRef.current.rows!==gridRows){ lastDimsRef.current={cols:gridCols, rows:gridRows}; resetSnake(); } timeAccRef.current += delta; const interval=1/Math.max(0.5, gameSpeed); while (timeAccRef.current >= interval){ step(); timeAccRef.current -= interval; } });
  return React.createElement('group',{ref:groupRef, position:[0,0,0]}, snakeRef.current.slice(1).map((c,i)=> React.createElement('mesh',{key:`b-${tick}-${i}-${c.x}-${c.y}`, geometry:geom, material:matBody, position:toWorld(c)})), snakeRef.current.length>0 && React.createElement('mesh',{key:`h-${tick}-${snakeRef.current[0].x}-${snakeRef.current[0].y}`, geometry:geom, material:matHead, position:toWorld(snakeRef.current[0])}), React.createElement('mesh',{key:`f-${tick}-${foodRef.current.x}-${foodRef.current.y}`, geometry:geom, material:matFood, position:toWorld(foodRef.current)}));
}


