// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Blob Detection',
  description: 'Simple blob visualization from a hidden canvas processing pass.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'enabled', type: 'boolean', value: true },
    { name: 'threshold', type: 'number', value: 128, min: 0, max: 255, step: 1 },
    { name: 'minArea', type: 'number', value: 50, min: 1, max: 20000, step: 1 },
    { name: 'maxArea', type: 'number', value: 5000, min: 10, max: 100000, step: 10 },
    { name: 'maxBlobs', type: 'number', value: 10, min: 1, max: 64, step: 1 },
    { name: 'analysisScale', type: 'number', value: 0.25, min: 0.1, max: 1.0, step: 0.05 },
    { name: 'blobColor', type: 'color', value: '#ff0000' },
  ],
};

export default function BlobDetectionExternal({ enabled=true, threshold=128, minArea=50, maxArea=5000, maxBlobs=10, analysisScale=0.25, blobColor='#ff0000' }){
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const pointsRef = useRef(null);
  const geomRef = useRef(null);
  const colorRef = useRef(new THREE.Color(blobColor));

  const init = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(maxBlobs * 3);
    const sizes = new Float32Array(maxBlobs);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, 0);
    geomRef.current = geom;
    const mat = new THREE.PointsMaterial({ color: colorRef.current, size: 0.2, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthTest:false, depthWrite:false });
    return { geom, mat };
  }, [maxBlobs, blobColor]);

  // Simple fake blob motion to visualize behavior (no video processing in external example)
  useFrame((state) => {
    if (!enabled || !pointsRef.current || !geomRef.current) return;
    const geom = geomRef.current; const pos = geom.attributes.position.array;
    const t = state.clock.elapsedTime;
    const count = Math.min(maxBlobs, 10);
    for (let i=0;i<count;i++){
      const r = 0.5 + 0.5*Math.sin(t*0.5 + i);
      const a = t*0.6 + i; const x = Math.cos(a)*r*2.0; const y = Math.sin(a*1.3)*r*1.2; pos[i*3+0]=x; pos[i*3+1]=y; pos[i*3+2]=0;
    }
    geom.setDrawRange(0, count);
    geom.attributes.position.needsUpdate = true;
  });

  return React.createElement('group', { ref: groupRef }, React.createElement('points', { ref: pointsRef, geometry: init.geom }, React.createElement('primitive', { object: init.mat }))); 
}


