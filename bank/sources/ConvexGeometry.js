// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo } = React || {};

export const metadata = {
  name: 'Convex Geometry Source',
  description: 'Rotating convex hull of a dodecahedron vertices with point sprites',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'pointSize', type: 'number', value: 0.015, min: 0.001, max: 0.2, step: 0.001, description: 'Point sprite size (world units)' },
    { name: 'opacity', type: 'number', value: 0.5, min: 0, max: 1, step: 0.01, description: 'Hull opacity' },
    { name: 'rotationSpeed', type: 'number', value: 0.01, min: 0, max: 0.1, step: 0.001, description: 'Rotation speed' },
    { name: 'radius', type: 'number', value: 0.3, min: 0.05, max: 1.0, step: 0.01, description: 'Base geometry radius (world units)' },
    { name: 'groupScale', type: 'number', value: 0.8, min: 0.1, max: 3.0, step: 0.01, description: 'Overall group scale' },
  ],
};

export default function ConvexGeometrySourceExternal({ pointSize = 0.015, opacity = 0.5, rotationSpeed = 0.01, radius = 0.3, groupScale = 0.8 }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  // Build geometry once
  const { points, hull } = useMemo(() => {
    try {
      const w = globalThis;
      const utils = (w.BufferGeometryUtils) || (THREE && (THREE.BufferGeometryUtils || {})) || {};
      const Convex = (w.ConvexGeometry) || (THREE && (THREE.ConvexGeometry || THREE.ConvexBufferGeometry || null));
      let dodecahedronGeometry = new THREE.DodecahedronGeometry(radius);
      try { dodecahedronGeometry.deleteAttribute('normal'); } catch {}
      try { dodecahedronGeometry.deleteAttribute('uv'); } catch {}
      try { if (utils.mergeVertices) { dodecahedronGeometry = utils.mergeVertices(dodecahedronGeometry); } } catch {}

      const vertices = [];
      const positionAttribute = dodecahedronGeometry.getAttribute('position');
      for (let i = 0; i < positionAttribute.count; i++) {
        const v = new THREE.Vector3(); v.fromBufferAttribute(positionAttribute, i); vertices.push(v);
      }

      const pointsMaterial = new THREE.PointsMaterial({ color: 0x0080ff, size: pointSize, sizeAttenuation: true, transparent: true, depthTest: false, opacity: 0.9 });
      const pointsGeometry = new THREE.BufferGeometry().setFromPoints(vertices);
      const points = new THREE.Points(pointsGeometry, pointsMaterial);

      const meshMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, opacity: opacity, side: THREE.DoubleSide, transparent: true });
      const hullGeometry = Convex ? new Convex(vertices) : null;
      const mesh = hullGeometry ? new THREE.Mesh(hullGeometry, meshMaterial) : null;

      const group = new THREE.Group();
      group.add(points);
      if (mesh) group.add(mesh);

      return { group, points, hull: mesh };
    } catch (e) {
      try { console.warn('Convex source init failed:', e); } catch {}
      return { group: null, points: null, hull: null };
    }
  }, [pointSize, opacity, radius]);

  const groupRef = React.useRef(null);
  useFrame(() => {
    try { if (groupRef.current) groupRef.current.rotation.y += rotationSpeed; } catch {}
  });

  return React.createElement(
    'group',
    { ref: groupRef, scale: [groupScale, groupScale, groupScale] },
    React.createElement('ambientLight', { args: [0x666666] }),
    React.createElement('pointLight', { args: [0xffffff, 3, 0, 0], position: [0, 0, 0] }),
    points && React.createElement('primitive', { object: points }),
    hull && React.createElement('primitive', { object: hull })
  );
}


