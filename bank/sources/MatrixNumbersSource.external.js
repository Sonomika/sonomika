// Portable external Matrix Numbers Source (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Matrix Numbers (External)',
  description: 'Floating numbers with dynamic connections in 3D space.',
  category: 'Sources',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'nodeCount', type: 'number', value: 100, min: 30, max: 200, step: 10 },
    { name: 'connectionDistance', type: 'number', value: 4.0, min: 2.0, max: 8.0, step: 0.5 },
    { name: 'numberSize', type: 'number', value: 0.5, min: 0.2, max: 1.5, step: 0.1 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: 'colorIntensity', type: 'number', value: 1.0, min: 0.3, max: 2.0, step: 0.1 },
    { name: 'spaceSize', type: 'number', value: 8, min: 4, max: 15, step: 1 },
    { name: 'numberChangeSpeed', type: 'number', value: 1.0, min: 0.2, max: 3.0, step: 0.1 },
  ],
};

export default function MatrixNumbersSourceExternal({ opacity = 1, nodeCount = 100, connectionDistance = 4.0, numberSize = 0.5, animationSpeed = 1.0, colorIntensity = 1.0, spaceSize = 8, flowSpeed = 2.0, numberChangeSpeed = 1.0 }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const nodesRef = useRef([]);
  const linesRef = useRef(null);

  const initialNodes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < nodeCount; i++) {
      const position = new THREE.Vector3((Math.random()-0.5)*spaceSize, (Math.random()-0.5)*spaceSize, (Math.random()-0.5)*spaceSize);
      const velocity = new THREE.Vector3((Math.random()-0.5)*animationSpeed*0.5, (Math.random()-0.5)*animationSpeed*0.5, (Math.random()-0.5)*animationSpeed*0.5);
      const number = Math.floor(Math.random()*10);
      const color = new THREE.Color().setHSL(0.3 + Math.random()*0.1, 0.8, 0.5 + Math.random()*0.3);
      arr.push({ id: i, position, velocity, number, color, phase: Math.random()*Math.PI*2, lastNumberChange: 0, size: numberSize*(0.8+Math.random()*0.4) });
    }
    nodesRef.current = arr; return arr;
  }, [nodeCount, spaceSize, numberSize, animationSpeed]);

  const connectionLines = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, alphaTest: 0.01 });
    const positions = new Float32Array(nodeCount * nodeCount * 6);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.LineSegments(geometry, material);
  }, [nodeCount]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    if (!nodesRef.current.length) return;
    nodesRef.current.forEach((node, idx) => {
      node.position.add(node.velocity.clone().multiplyScalar(delta));
      const floating = new THREE.Vector3(
        Math.sin(time*animationSpeed + node.phase)*0.1,
        Math.cos(time*animationSpeed*1.3 + node.phase)*0.1,
        Math.sin(time*animationSpeed*0.7 + node.phase)*0.1
      );
      if (Math.abs(node.position.x) > spaceSize/2) { node.velocity.x *= -1; node.position.x = Math.sign(node.position.x) * (spaceSize/2 - 0.1); }
      if (Math.abs(node.position.y) > spaceSize/2) { node.velocity.y *= -1; node.position.y = Math.sign(node.position.y) * (spaceSize/2 - 0.1); }
      if (Math.abs(node.position.z) > spaceSize/2) { node.velocity.z *= -1; node.position.z = Math.sign(node.position.z) * (spaceSize/2 - 0.1); }
      if (time - node.lastNumberChange > numberChangeSpeed) { node.number = Math.floor(Math.random()*10); node.lastNumberChange = time; }
      const bpm = (globalThis && globalThis.VJ_BPM) || 120;
      const bpmPulse = Math.sin(time * (bpm/60) * Math.PI * 2 + idx * 0.5) * 0.3 + 0.7;
      node.currentOpacity = opacity * bpmPulse * colorIntensity;
    });

    if (linesRef.current) {
      const positions = [];
      for (let i=0;i<nodesRef.current.length;i++) {
        for (let j=i+1;j<nodesRef.current.length;j++) {
          const a = nodesRef.current[i]; const b = nodesRef.current[j]; const dist = a.position.distanceTo(b.position);
          if (dist < connectionDistance) { positions.push(a.position.x,a.position.y,a.position.z,b.position.x,b.position.y,b.position.z); }
        }
      }
      const attr = linesRef.current.geometry.getAttribute('position');
      if (attr) { for (let i=0;i<positions.length && i<attr.array.length;i++) { attr.array[i] = positions[i]; } attr.needsUpdate = true; linesRef.current.geometry.setDrawRange(0, positions.length/3); }
      if (linesRef.current.material && linesRef.current.material.opacity !== undefined) { linesRef.current.material.opacity = 0.3 * opacity * colorIntensity; }
    }
  });

  // Since external environment may not have drei Text, render points instead
  const points = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const arr = new Float32Array(nodesRef.current.length * 3);
    for (let i=0;i<nodesRef.current.length;i++){ arr[i*3+0]=nodesRef.current[i].position.x; arr[i*3+1]=nodesRef.current[i].position.y; arr[i*3+2]=nodesRef.current[i].position.z; }
    geom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: 0x00ff44, size: numberSize*0.1, sizeAttenuation: true, transparent: true, opacity: 0.9, depthTest:false, depthWrite:false });
    return new THREE.Points(geom, mat);
  }, []);

  return React.createElement('group', { ref: groupRef }, React.createElement('primitive', { object: connectionLines, ref: linesRef }), React.createElement('primitive', { object: points }));
}


