// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Pulse Firework Explosion (PULSE)',
  description: 'Layered firework bursts. Press Pulse repeatedly to spawn overlapping explosions.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'pulse', type: 'button', value: 0, description: 'Pulse Explosion' },
    { name: 'particleCount', type: 'number', value: 180, min: 24, max: 420, step: 1 },
    { name: 'life', type: 'number', value: 2.2, min: 0.4, max: 5.0, step: 0.05 },
    { name: 'spread', type: 'number', value: 1.0, min: 0.1, max: 2.4, step: 0.01 },
    { name: 'gravity', type: 'number', value: 0.55, min: -0.4, max: 2.0, step: 0.01 },
    { name: 'sparkSize', type: 'number', value: 0.018, min: 0.004, max: 0.08, step: 0.001 },
    { name: 'originX', type: 'number', value: 0, min: -1, max: 1, step: 0.01 },
    { name: 'originY', type: 'number', value: 0.15, min: -1, max: 1, step: 0.01 },
    { name: 'randomPosition', type: 'boolean', value: false },
    { name: 'primaryColor', type: 'color', value: '#ffffff' },
    { name: 'accentColor', type: 'color', value: '#ffd16a' },
    { name: 'coolColor', type: 'color', value: '#6ff6ff' },
    { name: 'twinkle', type: 'number', value: 0.55, min: 0, max: 1, step: 0.01 },
    { name: 'maxBursts', type: 'number', value: 10, min: 1, max: 24, step: 1 },
  ],
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);

function colorFromHex(hex, fallback) {
  try {
    return new THREE.Color(hex || fallback);
  } catch (_) {
    return new THREE.Color(fallback);
  }
}

export default function PulseFireworkExplosion({
  pulse = 0,
  particleCount = 180,
  life = 2.2,
  spread = 1.0,
  gravity = 0.55,
  sparkSize = 0.018,
  originX = 0,
  originY = 0.15,
  randomPosition = false,
  primaryColor = '#ffffff',
  accentColor = '#ffd16a',
  coolColor = '#6ff6ff',
  twinkle = 0.55,
  maxBursts = 10,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const sparkRef = useRef(null);
  const coreRef = useRef(null);
  const burstsRef = useRef([]);
  const lastPulseRef = useRef(Number(pulse) || 0);

  const effectiveW = Math.max(1, Number(compositionWidth) || 1920);
  const effectiveH = Math.max(1, Number(compositionHeight) || 1080);
  const aspect = effectiveW / effectiveH;
  const burstLimit = Math.max(1, Math.floor(Number(maxBursts) || 10));
  const perBurst = Math.max(1, Math.floor(Number(particleCount) || 180));
  const maxInstances = Math.max(1, burstLimit * perBurst);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const white = useMemo(() => new THREE.Color('#ffffff'), []);
  const primary = useMemo(() => colorFromHex(primaryColor, '#ffffff'), [primaryColor]);
  const warm = useMemo(() => colorFromHex(accentColor, '#ffd16a'), [accentColor]);
  const cool = useMemo(() => colorFromHex(coolColor, '#6ff6ff'), [coolColor]);

  const sparkGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 10), []);
  const coreGeometry = useMemo(() => new THREE.RingGeometry(0.35, 0.5, 36), []);
  const sparkMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, []);
  const coreMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.65,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    material.blending = THREE.AdditiveBlending;
    return material;
  }, []);

  useEffect(() => () => {
    try { sparkGeometry.dispose(); } catch (_) {}
    try { coreGeometry.dispose(); } catch (_) {}
    try { sparkMaterial.dispose(); } catch (_) {}
    try { coreMaterial.dispose(); } catch (_) {}
  }, [sparkGeometry, coreGeometry, sparkMaterial, coreMaterial]);

  const spawnBurst = () => {
    const count = Math.max(12, Math.floor(Number(particleCount) || 180));
    const lifeSec = Math.max(0.1, Number(life) || 2.2);
    const spreadScale = Math.max(0.01, Number(spread) || 1);
    const ox = randomPosition ? rand(-0.75, 0.75) : clamp(Number(originX) || 0, -1, 1);
    const oy = randomPosition ? rand(-0.45, 0.75) : clamp(Number(originY) || 0, -1, 1);
    const palette = [primary, warm, cool, white];
    const particles = [];

    for (let i = 0; i < count; i++) {
      const ringBias = Math.random();
      const angle = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
      const speed = (0.28 + Math.pow(ringBias, 0.28) * 1.35) * spreadScale;
      const branch = Math.random() < 0.18;
      particles.push({
        x: ox * aspect,
        y: oy,
        vx: Math.cos(angle) * speed * (branch ? rand(0.35, 0.7) : 1),
        vy: Math.sin(angle) * speed * (branch ? rand(0.35, 0.7) : 1) + rand(0.04, 0.22),
        age: 0,
        life: lifeSec * rand(0.55, 1.25),
        size: Math.max(0.001, Number(sparkSize) || 0.018) * rand(0.45, 1.6),
        drag: rand(0.72, 0.91),
        flicker: rand(4, 18),
        color: palette[Math.floor(Math.random() * palette.length)].clone(),
      });
    }

    burstsRef.current.push({ age: 0, life: lifeSec, x: ox * aspect, y: oy, particles });
    while (burstsRef.current.length > burstLimit) burstsRef.current.shift();
  };

  useEffect(() => {
    const next = Number(pulse) || 0;
    if (next !== lastPulseRef.current) {
      lastPulseRef.current = next;
      spawnBurst();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  useFrame((_state, delta) => {
    const sparks = sparkRef.current;
    const cores = coreRef.current;
    if (!sparks || !cores) return;

    const dt = clamp(delta || 0.016, 0, 0.08);
    const g = Number(gravity) || 0;
    const tw = clamp(Number(twinkle) || 0, 0, 1);

    let sparkIndex = 0;
    let coreIndex = 0;
    const aliveBursts = [];

    burstsRef.current.forEach((burst) => {
      burst.age += dt;
      const burstNorm = clamp(burst.age / Math.max(0.001, burst.life), 0, 1);

      if (burst.age < burst.life && coreIndex < burstLimit) {
        const coreScale = 0.08 + burstNorm * 0.9;
        dummy.position.set(burst.x, burst.y - burstNorm * 0.04, 0.08);
        dummy.rotation.z = burst.age * 1.7;
        dummy.scale.set(coreScale * aspect, coreScale, 1);
        dummy.updateMatrix();
        cores.setMatrixAt(coreIndex, dummy.matrix);
        color.copy(warm).multiplyScalar((1 - burstNorm) * 0.9);
        cores.setColorAt(coreIndex, color);
        coreIndex++;
      }

      const aliveParticles = [];
      burst.particles.forEach((p) => {
        p.age += dt;
        if (p.age >= p.life) return;
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy = p.vy * Math.pow(p.drag, dt * 60) - g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        aliveParticles.push(p);

        if (sparkIndex >= maxInstances) return;
        const n = clamp(p.age / Math.max(0.001, p.life), 0, 1);
        const fade = Math.pow(1 - n, 1.55);
        const flash = 1 - tw + tw * (0.45 + 0.55 * Math.abs(Math.sin((p.age + p.flicker) * p.flicker)));
        const scale = p.size * (0.7 + fade * 1.6);

        dummy.position.set(p.x, p.y, 0.12);
        dummy.rotation.z = p.age * p.flicker;
        dummy.scale.set(scale * aspect, scale, 1);
        dummy.updateMatrix();
        sparks.setMatrixAt(sparkIndex, dummy.matrix);

        color.copy(p.color).multiplyScalar(fade * flash * 1.4);
        sparks.setColorAt(sparkIndex, color);
        sparkIndex++;
      });

      burst.particles = aliveParticles;
      if (burst.particles.length > 0 || burst.age < burst.life) aliveBursts.push(burst);
    });

    burstsRef.current = aliveBursts;

    for (let i = sparkIndex; i < maxInstances; i++) {
      dummy.position.set(9999, 9999, 0);
      dummy.scale.set(0.0001, 0.0001, 1);
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
      sparks.setColorAt(i, new THREE.Color(0, 0, 0));
    }
    for (let i = coreIndex; i < burstLimit; i++) {
      dummy.position.set(9999, 9999, 0);
      dummy.scale.set(0.0001, 0.0001, 1);
      dummy.updateMatrix();
      cores.setMatrixAt(i, dummy.matrix);
      cores.setColorAt(i, new THREE.Color(0, 0, 0));
    }

    sparks.count = maxInstances;
    cores.count = burstLimit;
    sparks.instanceMatrix.needsUpdate = true;
    cores.instanceMatrix.needsUpdate = true;
    if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
  });

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('instancedMesh', {
      ref: coreRef,
      args: [coreGeometry, coreMaterial, burstLimit],
      renderOrder: 9800,
    }),
    React.createElement('instancedMesh', {
      ref: sparkRef,
      args: [sparkGeometry, sparkMaterial, maxInstances],
      renderOrder: 9900,
    })
  );
}
