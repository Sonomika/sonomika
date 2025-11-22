// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef } = React || {};

export const metadata = {
  name: 'Pulse Hexagon',
  description: 'Hexagonal ring pulsing with BPM.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'color', type: 'color', value: '#00ff00' },
  ],
};

export default function PulseHexagonSource({ color = '#00ff00' }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  useFrame((state) => {
    if (!materialRef.current || !meshRef.current) return;
    const bpm = (globalThis && globalThis.VJ_BPM) || 120; const beatsPerSecond = bpm/60; const beatTime = state.clock.elapsedTime * beatsPerSecond; const pulse = Math.sin(beatTime * Math.PI * 2); const opacity = Math.max(0.3, Math.min(1.0, 0.6 + pulse * 0.4)); const scale = 1 + pulse * 0.2; materialRef.current.opacity = opacity; meshRef.current.scale.setScalar(scale); meshRef.current.rotation.z += 0.01;
  });

  return React.createElement(
    'mesh', { ref: meshRef, position: [0,0,0.5] },
    React.createElement('ringGeometry', { args: [0.8, 1.0, 6] }),
    React.createElement('meshBasicMaterial', { ref: materialRef, color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.01 })
  );
}


