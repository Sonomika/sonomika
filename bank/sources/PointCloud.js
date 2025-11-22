// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect, useState } = React || {};

export const metadata = {
  name: 'Point Cloud',
  description: '3D point cloud with BPM sync rotation and pulse.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'pointSize', type: 'number', value: 0.005, min: 0.001, max: 0.02, step: 0.001 },
    { name: 'color', type: 'color', value: '#00ff00' },
    { name: 'rotationSpeed', type: 'number', value: 1.0, min: 0.0, max: 5.0, step: 0.1 },
    { name: 'scale', type: 'number', value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: 'density', type: 'number', value: 0.5, min: 0.1, max: 1.0, step: 0.1 },
    { name: 'bpmSync', type: 'boolean', value: true },
  ],
};

export default function PointCloudSource({ pointSize=0.005, color='#00ff00', rotationSpeed=1.0, scale=1.0, density=0.5, bpmSync=true }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    const geom = new THREE.BufferGeometry();
    const points = []; const colors = []; const numPoints = Math.floor(10000 * density); const colorObj = new THREE.Color(color);
    for (let i=0;i<numPoints;i++){ const phi = Math.acos(-1 + (2*i)/numPoints); const theta = Math.sqrt(numPoints*Math.PI) * phi; const x = Math.cos(theta)*Math.sin(phi)*scale; const y = Math.sin(theta)*Math.sin(phi)*scale; const z = Math.cos(phi)*scale; points.push(x,y,z); const intensity=(Math.sin(x*10)+Math.cos(y*10)+Math.sin(z*10))/3; const c=colorObj.clone().multiplyScalar(0.5 + intensity*0.5); colors.push(c.r,c.g,c.b); }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); setGeometry(geom);
    return () => { try { geom.dispose(); } catch {} };
  }, [color, scale, density]);

  const material = useMemo(() => new THREE.PointsMaterial({ size: pointSize, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthTest:false, depthWrite:false }), [pointSize]);

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return;
    const time = state.clock.elapsedTime; const bpm = (globalThis && globalThis.VJ_BPM) || 120; const beatsPerSecond = bpm/60; const beatTime = time*beatsPerSecond; const rot = bpmSync ? rotationSpeed*(1+Math.sin(beatTime*6.283185307)*0.3) : rotationSpeed;
    meshRef.current.rotation.x += rot*0.01; meshRef.current.rotation.y += rot*0.015; meshRef.current.rotation.z += rot*0.02; if (bpmSync){ const pulse = Math.sin(beatTime*6.283185307)*0.3+0.7; materialRef.current.opacity = 0.6 + pulse*0.4; materialRef.current.size = pointSize*(0.8 + pulse*0.4); }
    const scalePulse = Math.sin(time*2)*0.1 + 1.0; meshRef.current.scale.setScalar(scale * scalePulse);
  });

  if (!geometry) return null;
  return React.createElement('points', { ref: meshRef, position: [0,0,0] }, React.createElement('primitive', { object: geometry }), React.createElement('primitive', { object: material, ref: materialRef }));
}


