// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Pulse Orb Trail 3D (PULSE)',
  description: 'A solid orb moves through simulated 3D space with a depth trail. Press Pulse to send it in a new random direction.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'pulse', type: 'button', value: 0, description: 'Pulse Direction' },
    { name: 'speed', type: 'number', value: 1.15, min: 0.1, max: 5.0, step: 0.01 },
    { name: 'drift', type: 'number', value: 0.18, min: 0.0, max: 1.5, step: 0.01 },
    { name: 'damping', type: 'number', value: 0.90, min: 0.65, max: 0.995, step: 0.001 },
    { name: 'trailLength', type: 'number', value: 90, min: 12, max: 220, step: 1 },
    { name: 'orbSize', type: 'number', value: 0.105, min: 0.02, max: 0.35, step: 0.001 },
    { name: 'bounds', type: 'number', value: 0.82, min: 0.2, max: 1.4, step: 0.01 },
    { name: 'depthAmount', type: 'number', value: 1.0, min: 0.0, max: 1.8, step: 0.01 },
    { name: 'orbColor', type: 'color', value: '#bfffff' },
    { name: 'hotColor', type: 'color', value: '#ffffff' },
    { name: 'trailColor', type: 'color', value: '#28d8ff' },
    { name: 'sparkle', type: 'number', value: 0.35, min: 0, max: 1, step: 0.01 },
  ],
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);

function safeColor(value, fallback) {
  try {
    return new THREE.Color(value || fallback);
  } catch (_) {
    return new THREE.Color(fallback);
  }
}

function randomUnitVector() {
  const z = rand(-0.75, 0.75);
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0.0001, 1 - z * z));
  return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z).normalize();
}

const ORB_STATE_CACHE = (() => {
  try {
    const root = globalThis;
    root.__SONOMIKA_PULSE_ORB_STATE__ = root.__SONOMIKA_PULSE_ORB_STATE__ || new Map();
    return root.__SONOMIKA_PULSE_ORB_STATE__;
  } catch (_) {
    return new Map();
  }
})();

function getPersistentOrbState(key) {
  const stateKey = String(key || 'default');
  let state = ORB_STATE_CACHE.get(stateKey);
  if (!state) {
    state = {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0.45, 0.25, 0.12),
      trailPoints: [],
      seed: Math.random() * 1000,
      lastPulse: 0,
    };
    ORB_STATE_CACHE.set(stateKey, state);
  }
  return state;
}

export default function PulseOrbTrail3D({
  pulse = 0,
  speed = 1.15,
  drift = 0.18,
  damping = 0.90,
  trailLength = 90,
  orbSize = 0.105,
  bounds = 0.82,
  depthAmount = 1.0,
  orbColor = '#bfffff',
  hotColor = '#ffffff',
  trailColor = '#28d8ff',
  sparkle = 0.35,
  compositionWidth,
  compositionHeight,
  __layerId,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const persistentStateRef = useRef(getPersistentOrbState(__layerId || 'unassigned'));
  const orbRef = useRef(null);
  const trailRef = useRef(null);
  const lastPulseRef = useRef(Number.isFinite(Number(persistentStateRef.current.lastPulse)) ? Number(persistentStateRef.current.lastPulse) : (Number(pulse) || 0));
  const positionRef = useRef(persistentStateRef.current.position);
  const velocityRef = useRef(persistentStateRef.current.velocity);
  const trailPointsRef = useRef(persistentStateRef.current.trailPoints);
  const seedRef = useRef(persistentStateRef.current.seed);

  const effectiveW = Math.max(1, Number(compositionWidth) || 1920);
  const effectiveH = Math.max(1, Number(compositionHeight) || 1080);
  const aspect = effectiveW / effectiveH;
  const maxTrail = Math.max(1, Math.floor(Number(trailLength) || 90));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const orbC = useMemo(() => safeColor(orbColor, '#bfffff'), [orbColor]);
  const hotC = useMemo(() => safeColor(hotColor, '#ffffff'), [hotColor]);
  const trailC = useMemo(() => safeColor(trailColor, '#28d8ff'), [trailColor]);

  const orbGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 32, 16), []);
  const trailGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 12, 8), []);

  const orbMaterial = useMemo(() => {
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

  const trailMaterial = useMemo(() => {
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

  useEffect(() => () => {
    try { orbGeometry.dispose(); } catch (_) {}
    try { trailGeometry.dispose(); } catch (_) {}
    try { orbMaterial.dispose(); } catch (_) {}
    try { trailMaterial.dispose(); } catch (_) {}
  }, [orbGeometry, trailGeometry, orbMaterial, trailMaterial]);

  const applyPulse = () => {
    const dir = randomUnitVector();
    const impulse = Math.max(0.01, Number(speed) || 1.15);
    velocityRef.current.copy(dir.multiplyScalar(impulse));
    seedRef.current = Math.random() * 1000;
    persistentStateRef.current.seed = seedRef.current;
    trailPointsRef.current.unshift({
      p: positionRef.current.clone(),
      age: 0,
      z: positionRef.current.z,
      hot: 1,
    });
    persistentStateRef.current.trailPoints = trailPointsRef.current;
  };

  useEffect(() => {
    const next = Number(pulse) || 0;
    if (next !== lastPulseRef.current) {
      lastPulseRef.current = next;
      persistentStateRef.current.lastPulse = next;
      applyPulse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  useFrame((state, delta) => {
    const orb = orbRef.current;
    const trail = trailRef.current;
    if (!orb || !trail) return;

    const dt = clamp(delta || 0.016, 0, 0.08);
    const t = state && state.clock ? state.clock.elapsedTime : Date.now() * 0.001;
    const pos = positionRef.current;
    const vel = velocityRef.current;
    const limit = Math.max(0.05, Number(bounds) || 0.82);
    const depth = Math.max(0, Number(depthAmount) || 0.55);
    const driftAmt = Math.max(0, Number(drift) || 0);
    const damp = clamp(Number(damping) || 0.90, 0.65, 0.995);

    vel.x += Math.sin(t * 0.72 + seedRef.current) * driftAmt * dt * 0.18;
    vel.y += Math.cos(t * 0.61 + seedRef.current * 0.7) * driftAmt * dt * 0.18;
    vel.z += Math.sin(t * 0.49 + seedRef.current * 1.3) * driftAmt * dt * 0.14;

    pos.addScaledVector(vel, dt);
    vel.multiplyScalar(Math.pow(damp, dt * 60));

    if (pos.x > limit * aspect || pos.x < -limit * aspect) {
      pos.x = clamp(pos.x, -limit * aspect, limit * aspect);
      vel.x *= -0.82;
    }
    if (pos.y > limit || pos.y < -limit) {
      pos.y = clamp(pos.y, -limit, limit);
      vel.y *= -0.82;
    }
    if (pos.z > depth || pos.z < -depth) {
      pos.z = clamp(pos.z, -depth, depth);
      vel.z *= -0.82;
    }

    const depthNorm = depth > 0 ? (pos.z / depth + 1) * 0.5 : 0.5;
    const perspective = 0.38 + depthNorm * 1.45;
    const parallax = 0.72 + depthNorm * 0.62;
    const screenX = pos.x * parallax;
    const screenY = pos.y * parallax + pos.z * 0.18;
    const baseSize = Math.max(0.001, Number(orbSize) || 0.105) * perspective;
    const sparkleAmt = clamp(Number(sparkle) || 0, 0, 1);
    const flicker = 1 - sparkleAmt + sparkleAmt * (0.65 + 0.35 * Math.abs(Math.sin(t * 14.0 + seedRef.current)));

    orb.position.set(screenX, screenY, 0.14 + pos.z * 0.18);
    orb.scale.set(baseSize * aspect, baseSize, baseSize * (0.75 + depthNorm * 0.5));
    orb.rotation.y = t * 1.2;
    orb.rotation.x = t * 0.77;
    orb.material.color.copy(orbC).lerp(hotC, 0.18 + depthNorm * 0.35).multiplyScalar(flicker * (0.75 + depthNorm * 0.55));
    orb.material.opacity = 0.95;

    trailPointsRef.current.unshift({
      p: pos.clone(),
      age: 0,
      z: pos.z,
      hot: flicker,
    });
    trailPointsRef.current = trailPointsRef.current.slice(0, maxTrail);
    persistentStateRef.current.trailPoints = trailPointsRef.current;

    const points = trailPointsRef.current;
    for (let i = 0; i < maxTrail; i++) {
      const point = points[i];
      if (!point) {
        dummy.position.set(9999, 9999, 0);
        dummy.scale.set(0.0001, 0.0001, 1);
        dummy.updateMatrix();
        trail.setMatrixAt(i, dummy.matrix);
        color.setRGB(0, 0, 0);
        trail.setColorAt(i, color);
        continue;
      }

      point.age += dt;
      const n = i / Math.max(1, maxTrail - 1);
      const fade = Math.pow(1 - n, 1.8);
      const pointDepthNorm = depth > 0 ? (point.z / depth + 1) * 0.5 : 0.5;
      const pointPerspective = 0.36 + pointDepthNorm * 1.25;
      const pointParallax = 0.72 + pointDepthNorm * 0.62;
      const s = Math.max(0.001, Number(orbSize) || 0.105) * (0.18 + fade * 0.72) * pointPerspective;
      const p = point.p;
      dummy.position.set(p.x * pointParallax, p.y * pointParallax + p.z * 0.18, 0.08 + p.z * 0.16 - n * 0.04);
      dummy.scale.set(s * aspect, s, s * (0.75 + pointDepthNorm * 0.5));
      dummy.updateMatrix();
      trail.setMatrixAt(i, dummy.matrix);

      color.copy(trailC).lerp(orbC, fade * 0.65).multiplyScalar(fade * (0.28 + pointDepthNorm * 0.75) * (0.65 + point.hot * 0.35));
      trail.setColorAt(i, color);
    }

    trail.count = maxTrail;
    trail.instanceMatrix.needsUpdate = true;
    if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
  });

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('instancedMesh', {
      ref: trailRef,
      args: [trailGeometry, trailMaterial, maxTrail],
      renderOrder: 9850,
    }),
    React.createElement(
      'mesh',
      { ref: orbRef, renderOrder: 9950 },
      React.createElement('primitive', { object: orbGeometry, attach: 'geometry' }),
      React.createElement('primitive', { object: orbMaterial, attach: 'material' })
    )
  );
}
