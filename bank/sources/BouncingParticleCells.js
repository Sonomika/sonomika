// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef } = React || {};

export const metadata = {
  name: 'Bouncing Particle Cells',
  description: 'Instanced squares/circles/glyphs bouncing within bounds.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numParticles', type: 'number', value: 600, min: 10, max: 5000, step: 10 },
    { name: 'cellSize', type: 'number', value: 0.02, min: 0.005, max: 0.08, step: 0.001 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'color', type: 'color', value: '#66ccff' },
    { name: 'shape', type: 'select', value: 'square', options: ['square','circle'] },
  ],
};

export default function BouncingParticleCells({ numParticles=600, cellSize=0.02, speed=1.0, color='#66ccff', shape='square' }){
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = (size.width>0 && size.height>0) ? size.width/size.height : 16/9;
  const halfWidth = (aspect*2)/2; const halfHeight = 2/2;

  const instancedRef = useRef(null);
  const velocitiesRef = useRef([]);
  const positionsRef = useRef([]);

  // Sanitize particle count to a safe integer range to avoid Invalid array length
  const count = React.useMemo(()=>{
    let n = Number(numParticles);
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    if (n < 1) n = 1;
    if (n > 100000) n = 100000;
    return n;
  }, [numParticles]);

  const geometry = useMemo(()=> shape==='circle' ? new THREE.CircleGeometry(Math.max(0.0001, cellSize/2), 24) : new THREE.PlaneGeometry(cellSize, cellSize), [cellSize, shape]);
  const material = useMemo(()=>{ const m=new THREE.MeshBasicMaterial({ color:new THREE.Color(color), transparent:true }); m.depthTest=false; m.depthWrite=false; m.side=THREE.DoubleSide; m.blending=THREE.AdditiveBlending; return m; }, [color]);

  React.useEffect(()=>{ const positions=new Array(count); const velocities=new Array(count); for (let i=0;i<count;i++){ const x=(Math.random()*2-1)*(halfWidth-cellSize*0.5); const y=(Math.random()*2-1)*(halfHeight-cellSize*0.5); positions[i]=new THREE.Vector2(x,y); const ang=Math.random()*Math.PI*2; const base=.3+Math.random()*.7; const v=base*.5; velocities[i]=new THREE.Vector2(Math.cos(ang)*v, Math.sin(ang)*v); } positionsRef.current=positions; velocitiesRef.current=velocities; }, [count, halfWidth, halfHeight, cellSize]);

  const dummy = useMemo(()=> new THREE.Object3D(), []);
  useFrame((_, delta)=>{
    if (!instancedRef.current) return; const positions=positionsRef.current; const velocities=velocitiesRef.current; const left=-halfWidth+cellSize*0.5, right=halfWidth-cellSize*0.5, bottom=-halfHeight+cellSize*0.5, top=halfHeight-cellSize*0.5; for (let i=0;i<positions.length;i++){ const p=positions[i]; const v=velocities[i]; p.x += v.x * delta * speed; p.y += v.y * delta * speed; if (p.x<=left){ p.x=left; v.x=Math.abs(v.x);} if (p.x>=right){ p.x=right; v.x=-Math.abs(v.x);} if (p.y<=bottom){ p.y=bottom; v.y=Math.abs(v.y);} if (p.y>=top){ p.y=top; v.y=-Math.abs(v.y);} dummy.position.set(p.x,p.y,0); dummy.rotation.z=0; dummy.scale.set(1,1,1); dummy.updateMatrix(); instancedRef.current.setMatrixAt(i, dummy.matrix); } instancedRef.current.instanceMatrix.needsUpdate = true; });

  return React.createElement('instancedMesh', { ref: instancedRef, args:[geometry, material, count], renderOrder: 9998 });
}


