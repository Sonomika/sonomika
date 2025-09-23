// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef } = React || {};

export const metadata = {
  name: 'Portable Source Template',
  description: 'Boilerplate for converting Three.js examples to a portable source (no imports, no DOM).',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'rotationSpeed', type: 'number', value: 1.0, min: 0.0, max: 10.0, step: 0.05 },
    { name: 'color', type: 'color', value: '#66ccff' },
  ],
};

export default function PortableSourceTemplate({ rotationSpeed = 1.0, color = '#66ccff' }){
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  // Host group provided by portal. Add converted objects under this group.
  const groupRef = useRef(null);
  const meshRef = useRef(null);

  // Composition sizing (match our 2-unit-high plane convention)
  const { size } = useThree();
  const compositionAspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9);
  const targetWidth = compositionAspect * 2; // plane width if you render full-screen
  const targetHeight = 2; // plane height

  // Create materials/geometry once
  const geometry = useMemo(() => new THREE.TorusKnotGeometry(0.35, 0.12, 128, 24), []);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.35, metalness: 0.2 });
    m.toneMapped = true;
    m.transparent = false;
    m.depthTest = true;
    m.depthWrite = true;
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update material color on prop change
  useEffect(() => {
    if (material && material.color) {
      try { material.color.set(color); } catch {}
    }
  }, [material, color]);

  // One-time scene setup (replace this block with converted example objects)
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const mesh = new THREE.Mesh(geometry, material);
    meshRef.current = mesh;
    // Fit nicely within our composition volume
    const scale = Math.min(targetWidth, targetHeight) * 0.6;
    mesh.scale.set(scale, scale, scale);
    g.add(mesh);

    // Basic lighting (local to the group). Replace/extend as needed.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.9);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 1, 1);
    g.add(hemi);
    g.add(dir);

    return () => {
      try { g.remove(mesh); } catch {}
      try { geometry && geometry.dispose && geometry.dispose(); } catch {}
      try { material && material.dispose && material.dispose(); } catch {}
      try { g.remove(hemi); g.remove(dir); } catch {}
      meshRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation loop (put per-frame logic for converted examples here)
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const s = Math.max(0, rotationSpeed || 0);
    mesh.rotation.x += delta * s * 0.7;
    mesh.rotation.y += delta * s * 1.0;
  });

  // Always return a group. The app will portal this into the correct scene.
  return React.createElement('group', { ref: groupRef });
}


