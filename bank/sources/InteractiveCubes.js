// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Interactive Cubes',
  description: 'Many cubes with hover highlight via raycaster; rotates slowly',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'count', type: 'number', value: 300, min: 50, max: 2000, step: 50, description: 'Number of cubes' },
    { name: 'radius', type: 'number', value: 0.50, min: 0.2, max: 3.0, step: 0.05, description: 'Scatter radius (world units)' },
    { name: 'groupScale', type: 'number', value: 0.70, min: 0.01, max: 3.0, step: 0.01, description: 'Overall group scale' },
    { name: 'rotationSpeed', type: 'number', value: 0.010, min: 0, max: 0.1, step: 0.001, description: 'Group rotation speed' },
    { name: 'highlightColor', type: 'string', value: '#ff0000', description: 'Hover highlight emissive color' },
    { name: 'cubeSize', type: 'number', value: 0.10, min: 0.01, max: 2.0, step: 0.01, description: 'Multiply per-cube size' },
  ],
};

export default function InteractiveCubesSourceExternal({ count = 300, radius = 0.50, groupScale = 0.70, rotationSpeed = 0.010, highlightColor = '#ff0000', cubeSize = 0.10 }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const groupRef = useRef(null);
  const cubesRef = useRef([]);
  const raycasterRef = useRef(null);
  const intersectedRef = useRef(null);
  const prevHexRef = useRef(0x000000);

  const { camera, pointer, scene } = (useThree && useThree()) || {};

  // Create cubes
  const cubesGroup = useMemo(() => {
    try {
      const group = new THREE.Group();
      const geometry = new THREE.BoxGeometry();
      const rng = Math.random;
      const list = [];
      const N = Math.max(1, Math.floor(count));
      for (let i = 0; i < N; i++) {
        const color = new THREE.Color().setHex(Math.floor(rng() * 0xffffff));
        const material = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          (rng() * 2 - 1) * radius,
          (rng() * 2 - 1) * radius,
          (rng() * 2 - 1) * radius
        );
        mesh.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
        const scaleFactor = (rng() + 0.5) * cubeSize;
        mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        group.add(mesh);
        list.push(mesh);
      }
      cubesRef.current = list;
      return group;
    } catch (e) {
      try { console.warn('InteractiveCubes init failed:', e); } catch {}
      return null;
    }
  }, [count, radius, cubeSize]);

  // Lights
  const lights = useMemo(() => ({
    ambient: new THREE.AmbientLight(0x666666),
    directional: (() => { const l = new THREE.DirectionalLight(0xffffff, 1.5); l.position.set(1,1,1).normalize(); return l; })(),
  }), []);

  // Raycaster
  useEffect(() => { raycasterRef.current = new THREE.Raycaster(); return () => { raycasterRef.current = null; }; }, []);

  // Attach built group & lights into React tree via primitives
  useEffect(() => {
    // no-op; primitives are returned in JSX below
  }, [cubesGroup, lights]);

  // Per-frame: rotate and hover highlight
  useFrame(() => {
    try {
      if (groupRef.current) groupRef.current.rotation.y += rotationSpeed;
      const raycaster = raycasterRef.current; if (!raycaster || !camera) return;
      const p = pointer || { x: 0, y: 0 };
      raycaster.setFromCamera({ x: p.x || 0, y: p.y || 0 }, camera);
      const intersects = cubesRef.current && cubesRef.current.length ? raycaster.intersectObjects(cubesRef.current, false) : [];
      if (intersects && intersects.length > 0) {
        const obj = intersects[0].object;
        if (intersectedRef.current !== obj) {
          if (intersectedRef.current && intersectedRef.current.material && intersectedRef.current.material.emissive) {
            intersectedRef.current.material.emissive.setHex(prevHexRef.current);
          }
          intersectedRef.current = obj;
          if (obj.material && obj.material.emissive) {
            prevHexRef.current = obj.material.emissive.getHex();
            obj.material.emissive.set(new THREE.Color(highlightColor));
          }
        }
      } else {
        if (intersectedRef.current && intersectedRef.current.material && intersectedRef.current.material.emissive) {
          intersectedRef.current.material.emissive.setHex(prevHexRef.current);
        }
        intersectedRef.current = null;
      }
    } catch {}
  });

  return React.createElement(
    'group',
    { ref: groupRef, scale: [groupScale, groupScale, groupScale] },
    React.createElement('primitive', { object: lights.ambient }),
    React.createElement('primitive', { object: lights.directional }),
    cubesGroup && React.createElement('primitive', { object: cubesGroup })
  );
}


