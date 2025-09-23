// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Rotating Particle',
  description: 'Central mesh with orbiting particles and BPM pulse.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'rotationSpeed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'particleCount', type: 'number', value: 100, min: 20, max: 500, step: 10 },
    { name: 'particleSize', type: 'number', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
    { name: 'particleSpeed', type: 'number', value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: 'orbitRadius', type: 'number', value: 3.0, min: 1.0, max: 8.0, step: 0.1 },
    { name: 'centralObject', type: 'select', value: 'cube', options: ['cube','sphere','torus','octahedron'] },
    { name: 'particleColor', type: 'color', value: '#ffffff' },
    { name: 'centralColor', type: 'color', value: '#ffffff' },
  ],
};

export default function RotatingParticleSourceExternal({ rotationSpeed=1.0, particleCount=100, particleSize=0.1, particleSpeed=1.0, orbitRadius=3.0, centralObject='cube', particleColor='#ffffff', centralColor='#ffffff', bpm=120 }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const centralRef = useRef(null);
  const particlesRef = useRef(null);
  const particlesMaterialRef = useRef(null);

  const centralGeometry = useMemo(() => {
    if (centralObject==='sphere') return new THREE.SphereGeometry(0.5,32,32);
    if (centralObject==='torus') return new THREE.TorusGeometry(0.3,0.1,16,100);
    if (centralObject==='octahedron') return new THREE.OctahedronGeometry(0.4);
    return new THREE.BoxGeometry(0.8,0.8,0.8);
  }, [centralObject]);

  const centralMaterial = useMemo(() => {
    if (centralObject==='cube') return new THREE.MeshBasicMaterial({ color: centralColor, wireframe: true, transparent: true, opacity: 0.8 });
    return new THREE.MeshPhongMaterial({ color: centralColor, shininess: 100, transparent: true, opacity: 0.9 });
  }, [centralColor, centralObject]);

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const color = new THREE.Color(particleColor);
    for (let i=0;i<particleCount;i++){
      const ringIndex = Math.floor(i / (particleCount/3)); const ringRadius = orbitRadius + ringIndex * 0.5; const angle = (i / (particleCount/3)) * Math.PI * 2; const height = (Math.random()-0.5) * 2;
      positions[i*3+0] = Math.cos(angle) * ringRadius; positions[i*3+1] = height; positions[i*3+2] = Math.sin(angle) * ringRadius;
      const cv = 0.2; colors[i*3+0]=color.r+(Math.random()-0.5)*cv; colors[i*3+1]=color.g+(Math.random()-0.5)*cv; colors[i*3+2]=color.b+(Math.random()-0.5)*cv;
    }
    return { positions, colors };
  }, [particleCount, orbitRadius, particleColor]);

  const particleGeometry = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(positions,3)); g.setAttribute('color', new THREE.BufferAttribute(colors,3)); return g; }, [positions, colors]);
  const particleMaterial = useMemo(() => new THREE.PointsMaterial({ size: particleSize, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }), [particleSize]);

  useFrame((state) => {
    const t = state.clock.elapsedTime; const bpmTime = (bpm/60)*t;
    if (centralRef.current){ centralRef.current.rotation.x = Math.sin(t*rotationSpeed*0.5)*0.3; centralRef.current.rotation.y = t*rotationSpeed; centralRef.current.rotation.z = Math.cos(t*rotationSpeed*0.3)*0.2; }
    if (particlesRef.current && particlesRef.current.geometry){ const pos = particlesRef.current.geometry.attributes.position.array; for (let i=0;i<particleCount;i++){ const ringIndex=Math.floor(i/(particleCount/3)); const ringRadius=orbitRadius+ringIndex*0.5; const base=(i/(particleCount/3))*Math.PI*2; const orbital=particleSpeed*(1+ringIndex*0.2); const ang=base + t*orbital; const wave=Math.sin(t*2 + i*0.1)*0.3; pos[i*3+0]=Math.cos(ang)*(ringRadius+wave); pos[i*3+1]=Math.sin(t*1.5 + i*0.05)*0.5; pos[i*3+2]=Math.sin(ang)*(ringRadius+wave); } particlesRef.current.geometry.attributes.position.needsUpdate = true; }
    if (particlesMaterialRef.current){ const pulse = Math.sin(bpmTime*6.283185307)*0.3+0.7; particlesMaterialRef.current.size = particleSize * pulse; }
  });

  return React.createElement('group', null,
    React.createElement('mesh', { ref: centralRef, geometry: centralGeometry, material: centralMaterial }),
    React.createElement('points', { ref: particlesRef, geometry: particleGeometry }, React.createElement('primitive', { object: particleMaterial, ref: particlesMaterialRef })),
    React.createElement('ambientLight', { intensity: 0.3 }),
    React.createElement('pointLight', { position: [10,10,10], intensity: 1 }),
    React.createElement('pointLight', { position: [-10,-10,-10], intensity: 0.5, color: '#00bcd4' }),
  );
}


