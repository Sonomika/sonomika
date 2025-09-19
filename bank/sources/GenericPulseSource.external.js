// Portable external Generic Pulse Source (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Generic Pulse (External)',
  description: 'Pulsing geometry source with BPM-based animation.',
  category: 'Sources',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'color', type: 'color', value: '#ff6666' },
    { name: 'intensity', type: 'number', value: 0.2, min: 0.1, max: 1.0, step: 0.1 },
    { name: 'speed', type: 'number', value: 2.0, min: 0.5, max: 5.0, step: 0.1 },
    { name: 'geometryType', type: 'select', value: 'sphere', options: ['sphere','cube','plane'] },
  ],
};

export default function GenericPulseSourceExternal({ color = '#ff6666', speed = 2.0, intensity = 0.2, geometryType = 'sphere', geometryArgs = [0.5,16,16] }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const meshRef = useRef(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const bpm = (globalThis && globalThis.VJ_BPM) || 120;
    const beatsPerSecond = bpm / 60;
    const beatTime = state.clock.elapsedTime * beatsPerSecond * speed;
    const pulse = Math.sin(beatTime * Math.PI * 2) * intensity;
    const scale = 1 + pulse * 0.3;
    meshRef.current.scale.setScalar(scale);
    meshRef.current.rotation.z = beatTime * 2;
  });

  const geometry = useMemo(() => {
    try {
      if (geometryType === 'sphere') return new THREE.SphereGeometry(...geometryArgs);
      if (geometryType === 'cube') return new THREE.BoxGeometry(...geometryArgs);
      if (geometryType === 'plane') return new THREE.PlaneGeometry(...geometryArgs);
    } catch {}
    return new THREE.SphereGeometry(0.5, 16, 16);
  }, [geometryType, geometryArgs]);

  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, alphaTest: 0.01 }), [color]);

  return React.createElement('mesh', { ref: meshRef, geometry, material });
}


