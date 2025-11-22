// sonomika template (derived version)
// "Orbital Nebula" - layered translucent rings of particles with BPM pulse and central glow (middle dot removed, angle option added)
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Orbital Nebula',
  description: 'Layered particle rings forming a nebula with swirl motion and BPM-synced pulse.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.1',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'rotationSpeed', type: 'number', value: 0.6, min: 0.0, max: 3.0, step: 0.01 },
    { name: 'angle', type: 'number', value: 0, min: -180, max: 180, step: 1 }, // new angle option (degrees)
    { name: 'layers', type: 'number', value: 4, min: 1, max: 8, step: 1 },
    { name: 'particlesPerLayer', type: 'number', value: 150, min: 20, max: 1000, step: 10 },
    { name: 'layerRadius', type: 'number', value: 2.5, min: 0.5, max: 10.0, step: 0.1 },
    { name: 'particleSize', type: 'number', value: 0.06, min: 0.01, max: 0.5, step: 0.01 },
    { name: 'swirl', type: 'number', value: 1.2, min: 0.0, max: 5.0, step: 0.01 },
    { name: 'nebulaColorA', type: 'color', value: '#ff6bcb' },
    { name: 'nebulaColorB', type: 'color', value: '#3bb9ff' },
    { name: 'pulseIntensity', type: 'number', value: 0.6, min: 0.0, max: 2.0, step: 0.01 },
  ],
};

export default function OrbitalNebulaSource({
  rotationSpeed = 0.6,
  angle = 0, // degrees
  layers = 4,
  particlesPerLayer = 150,
  layerRadius = 2.5,
  particleSize = 0.06,
  swirl = 1.2,
  nebulaColorA = '#ff6bcb',
  nebulaColorB = '#3bb9ff',
  pulseIntensity = 0.6,
  bpm = 120,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const pointsRef = useRef(null);
  const pointsMaterialRef = useRef(null);

  // total particles
  const total = Math.max(1, Math.floor(layers)) * Math.max(1, Math.floor(particlesPerLayer));

  // precompute base attributes for efficient updates
  const { positions, colors, baseAngles, baseRadii, layerIndexFor } = useMemo(() => {
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const baseAngles = new Float32Array(total);
    const baseRadii = new Float32Array(total);
    const layerIndexFor = new Uint8Array(total);

    const colA = new THREE.Color(nebulaColorA);
    const colB = new THREE.Color(nebulaColorB);

    let idx = 0;
    for (let L = 0; L < layers; L++) {
      const layerFactor = L / Math.max(1, layers - 1); // 0..1
      const radius = layerRadius + L * 0.6;
      const spread = 0.25 + 0.25 * Math.random();
      for (let p = 0; p < particlesPerLayer; p++) {
        const i = idx++;
        const t = p / particlesPerLayer;
        const angle = t * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const r = radius + (Math.random() - 0.5) * spread;
        baseAngles[i] = angle;
        baseRadii[i] = r;
        layerIndexFor[i] = L;

        const x = Math.cos(angle) * r;
        const y = (Math.random() - 0.5) * 1.2 * (0.5 + layerFactor);
        const z = Math.sin(angle) * r;
        positions[i * 3 + 0] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // color gradient between A and B with slight noise
        const c = colA.clone().lerp(colB, layerFactor + (Math.random() - 0.5) * 0.05);
        const noise = 0.08 * (Math.random() - 0.5);
        colors[i * 3 + 0] = THREE.MathUtils.clamp(c.r + noise, 0, 1);
        colors[i * 3 + 1] = THREE.MathUtils.clamp(c.g + noise, 0, 1);
        colors[i * 3 + 2] = THREE.MathUtils.clamp(c.b + noise, 0, 1);
      }
    }

    return { positions, colors, baseAngles, baseRadii, layerIndexFor };
  }, [layers, particlesPerLayer, layerRadius, nebulaColorA, nebulaColorB]);

  const particleGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  const particleMaterial = useMemo(() => new THREE.PointsMaterial({
    size: particleSize,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [particleSize]);

  // animate positions and sizes
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const bpmTime = (bpm / 60) * t;
    const pulse = 1 + Math.sin(bpmTime * 2 * Math.PI) * pulseIntensity; // 1 +/- pulseIntensity

    // apply global angle (degrees -> radians) to the whole group
    if (groupRef.current) {
      groupRef.current.rotation.z = (angle * Math.PI) / 180;
      // gentle additional rotations for motion
      groupRef.current.rotation.y = t * rotationSpeed * 0.2;
      groupRef.current.rotation.x = Math.sin(t * rotationSpeed * 0.15) * 0.08;
    }

    // update particle positions
    if (pointsRef.current && pointsRef.current.geometry && pointsRef.current.geometry.attributes.position) {
      const pos = pointsRef.current.geometry.attributes.position.array;
      for (let i = 0; i < total; i++) {
        const L = layerIndexFor[i];
        const layerFactor = L / Math.max(1, layers - 1 || 1);
        const spin = swirl * (1 + layerFactor * 0.6);
        const ang = baseAngles[i] + t * 0.3 * spin + L * 0.2 * Math.sin(t * 0.5 + i * 0.01);
        const radialJitter = Math.sin(t * 0.7 + i * 0.13) * 0.12 * (1 + layerFactor);
        const r = baseRadii[i] + radialJitter;
        pos[i * 3 + 0] = Math.cos(ang) * r;
        pos[i * 3 + 1] = Math.sin(t * 0.6 + baseAngles[i] * 0.5 + L) * (0.4 + layerFactor * 0.6);
        pos[i * 3 + 2] = Math.sin(ang) * r;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // pulse particle size
    if (pointsMaterialRef.current) {
      pointsMaterialRef.current.size = particleSize * Math.max(0.1, pulse);
    }
  });

  return React.createElement('group', { ref: groupRef },
    // particle cloud (middle dot removed)
    React.createElement('points', { ref: pointsRef, geometry: particleGeometry },
      React.createElement('primitive', { object: particleMaterial, ref: pointsMaterialRef })
    ),

    // subtle lighting to complement additive particles
    React.createElement('ambientLight', { intensity: 0.25 }),
    React.createElement('pointLight', { position: [6, 6, 6], intensity: 0.7, color: nebulaColorB }),
    React.createElement('pointLight', { position: [-6, -4, -6], intensity: 0.4, color: nebulaColorA })
  );
}
