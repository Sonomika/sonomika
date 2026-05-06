const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Fish Food Chase 3D (MIDI)',
  description: 'A 3D version of Fish Food Chase: fish swim through depth, hunt glowing food, and fire MIDI notes when they eat.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'fishCount', type: 'number', value: 7, min: 1, max: 80, step: 1 },
    { name: 'foodCount', type: 'number', value: 14, min: 1, max: 160, step: 1 },
    { name: 'fishSpeed', type: 'number', value: 1.15, min: 0.1, max: 4, step: 0.05 },
    { name: 'turnSpeed', type: 'number', value: 2.15, min: 0.2, max: 12, step: 0.1 },
    { name: 'wander', type: 'number', value: 1.25, min: 0, max: 2, step: 0.05 },
    { name: 'vision', type: 'number', value: 2.4, min: 0.1, max: 4, step: 0.05 },
    { name: 'eatRadius', type: 'number', value: 0.09, min: 0.01, max: 0.3, step: 0.005 },
    { name: 'fishSize', type: 'number', value: 0.052, min: 0.01, max: 0.16, step: 0.002 },
    { name: 'foodSize', type: 'number', value: 0.025, min: 0.008, max: 0.14, step: 0.002 },
    { name: 'depth', type: 'number', value: 1.15, min: 0.0, max: 3.0, step: 0.05 },
    { name: 'depthDrift', type: 'number', value: 0.72, min: 0.0, max: 2.0, step: 0.05 },
    { name: 'sceneTilt', type: 'number', value: 0.22, min: -1.2, max: 1.2, step: 0.01 },
    { name: 'sceneSpin', type: 'number', value: 0.08, min: -2.0, max: 2.0, step: 0.01 },
    { name: 'fishColor', type: 'color', value: '#ffffff' },
    { name: 'foodColor', type: 'color', value: '#7cfffb' },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 12, min: 1, max: 48, step: 1, description: 'Chromatic range from bottom/back food to top/front food' },
    { name: 'noteLength', type: 'number', value: 0.16, min: 0.03, max: 2, step: 0.01 },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI when a fish eats food' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_FISH_FOOD_CHASE_3D_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_FISH_FOOD_CHASE_3D_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 30;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

function randomIn(a, b) {
  return lerp(a, b, Math.random());
}

function midiForPosition(y, z, bounds, rootMidi, noteRange) {
  const yNorm = clamp01((y - bounds.bottom) / Math.max(0.0001, bounds.top - bounds.bottom));
  const zNorm = clamp01((z - bounds.back) / Math.max(0.0001, bounds.front - bounds.back));
  const semitone = Math.round((yNorm * 0.72 + zNorm * 0.28) * Math.max(1, noteRange));
  return clamp(Math.round(rootMidi + semitone), 0, 127);
}

function shouldSendMidiEvent(eventKey) {
  try {
    const now = nowMs();
    const store = globalThis[LAST_EVENT_SLOT] || {};
    const lastAt = typeof store[eventKey] === 'number' ? store[eventKey] : -Infinity;
    if ((now - lastAt) < MIN_EVENT_GAP_MS) return false;
    store[eventKey] = now;
    globalThis[LAST_EVENT_SLOT] = store;
    return true;
  } catch (_) {
    return true;
  }
}

export default function FishFoodChase3DMidi({
  fishCount = 7,
  foodCount = 14,
  fishSpeed = 1.15,
  turnSpeed = 2.15,
  wander = 1.25,
  vision = 2.4,
  eatRadius = 0.09,
  fishSize = 0.052,
  foodSize = 0.025,
  depth = 1.15,
  depthDrift = 0.72,
  sceneTilt = 0.22,
  sceneSpin = 0.08,
  fishColor = '#ffffff',
  foodColor = '#7cfffb',
  rootMidi = 48,
  noteRange = 12,
  noteLength = 0.16,
  velocityBoost = 1.0,
  sendMidi = true,
  midiChannel = 1,
  __layerId,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const ctx = useThree();
  const size = ctx && ctx.size ? ctx.size : { width: 1920, height: 1080 };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfWidth = aspect;
  const halfHeight = 1;

  const fishRef = useRef([]);
  const foodRef = useRef([]);
  const foodFlashesRef = useRef([]);
  const consumedFoodIdsRef = useRef(new Set());
  const ownerKeyRef = useRef(null);
  const foodIdRef = useRef(1);

  const groupRef = useRef(null);
  const fishMeshRef = useRef(null);
  const foodMeshRef = useRef(null);
  const flashMeshRef = useRef(null);

  const dummyFish = useMemo(() => new THREE.Object3D(), []);
  const dummyFood = useMemo(() => new THREE.Object3D(), []);
  const dummyFlash = useMemo(() => new THREE.Object3D(), []);
  const dummyColor = useMemo(() => new THREE.Color(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const baseForward = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  const fishGeometry = useMemo(() => {
    const g = new THREE.ConeGeometry(0.5, 1.65, 18, 1, false);
    g.rotateZ(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);
  const foodGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 18, 12), []);
  const flashGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 20, 12), []);

  const fishMaterial = useMemo(() => {
    const m = new THREE.MeshPhongMaterial({
      color: new THREE.Color('#ffffff'),
      emissive: new THREE.Color('#1a1a1a'),
      shininess: 90,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    m.depthTest = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  const foodMaterial = useMemo(() => {
    const m = new THREE.MeshPhongMaterial({
      color: new THREE.Color('#7cfffb'),
      emissive: new THREE.Color('#7cfffb'),
      shininess: 120,
      transparent: true,
      opacity: 0.9,
    });
    m.depthTest = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  const flashMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.95,
      vertexColors: true,
    });
    m.depthTest = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  useEffect(() => {
    try {
      fishMaterial.color.set(fishColor);
      fishMaterial.emissive.set(fishColor).multiplyScalar(0.18);
    } catch (_) {}
  }, [fishMaterial, fishColor]);
  useEffect(() => {
    try {
      foodMaterial.color.set(foodColor);
      foodMaterial.emissive.set(foodColor).multiplyScalar(0.7);
    } catch (_) {}
  }, [foodMaterial, foodColor]);

  const fishLimit = Math.max(1, Math.min(120, Math.floor(fishCount)));
  const foodLimit = Math.max(1, Math.min(220, Math.floor(foodCount)));
  const maxFlashes = 128;
  const sizeRef = useRef({ fish: fishSize, food: foodSize });
  const boundsRef = useRef({ left: 0, right: 0, bottom: 0, top: 0, back: 0, front: 0 });
  const halfWidthRef = useRef(halfWidth);
  const halfHeightRef = useRef(halfHeight);
  halfWidthRef.current = halfWidth;
  halfHeightRef.current = halfHeight;

  const computeBounds = (fSize, fdSize, d) => {
    const p = Math.max(fSize, fdSize) * 2.2;
    const z = Math.max(0.02, d);
    return {
      left: -halfWidthRef.current + p,
      right: halfWidthRef.current - p,
      bottom: -halfHeightRef.current + p,
      top: halfHeightRef.current - p,
      back: -z,
      front: z,
    };
  };

  const readLiveSize = (paramName, fallback) => {
    if (!__layerId) return fallback;
    try {
      const live = globalThis.__VJ_LIVE_MOD__;
      const v = live && live.get ? live.get(__layerId, paramName) : undefined;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    } catch (_) {}
    return fallback;
  };

  sizeRef.current.fish = fishSize;
  sizeRef.current.food = foodSize;
  boundsRef.current = computeBounds(fishSize, foodSize, depth);

  const makeFood = () => {
    const b = boundsRef.current;
    return {
      id: foodIdRef.current++,
      x: randomIn(b.left, b.right),
      y: randomIn(b.bottom, b.top),
      z: randomIn(b.back, b.front),
      phase: Math.random() * Math.PI * 2,
      energy: 0.35 + Math.random() * 0.65,
    };
  };

  const claimMidiOwnership = () => {
    try {
      const now = nowMs();
      const current = globalThis[OWNER_SLOT];
      if (!current || current.key === ownerKeyRef.current || current.expiresAt <= now) {
        globalThis[OWNER_SLOT] = { key: ownerKeyRef.current, expiresAt: now + OWNER_LEASE_MS };
        return true;
      }
      return current.key === ownerKeyRef.current;
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    ownerKeyRef.current = `fish-food-chase-3d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (fishRef.current.length === 0) {
      const fish = [];
      const food = [];
      const b = boundsRef.current;
      for (let i = 0; i < fishLimit; i++) {
        const a = Math.random() * Math.PI * 2;
        const zA = randomIn(-0.8, 0.8);
        fish.push({
          x: randomIn(b.left, b.right),
          y: randomIn(b.bottom, b.top),
          z: randomIn(b.back, b.front),
          vx: Math.cos(a) * 0.3,
          vy: Math.sin(a) * 0.3,
          vz: zA * 0.2,
          phase: Math.random() * Math.PI * 2,
        });
      }
      for (let i = 0; i < foodLimit; i++) food.push(makeFood());
      fishRef.current = fish;
      foodRef.current = food;
      foodFlashesRef.current = [];
      consumedFoodIdsRef.current = new Set();
      return;
    }
    const fish = fishRef.current;
    if (fish.length < fishLimit) {
      const b = boundsRef.current;
      for (let i = fish.length; i < fishLimit; i++) {
        const a = Math.random() * Math.PI * 2;
        fish.push({
          x: randomIn(b.left, b.right),
          y: randomIn(b.bottom, b.top),
          z: randomIn(b.back, b.front),
          vx: Math.cos(a) * 0.3,
          vy: Math.sin(a) * 0.3,
          vz: randomIn(-0.2, 0.2),
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (fish.length > fishLimit) {
      fish.length = fishLimit;
    }
  }, [fishLimit, foodLimit]);

  function fireMidiForFood(eatenFood) {
    if (!eatenFood || consumedFoodIdsRef.current.has(eatenFood.id)) return;
    consumedFoodIdsRef.current.add(eatenFood.id);

    const b = boundsRef.current;
    const note = midiForPosition(eatenFood.y, eatenFood.z, b, rootMidi, noteRange);
    const velocity = clamp((0.45 + eatenFood.energy * 0.55) * velocityBoost, 0.05, 1);
    const channel = clamp(Math.round(midiChannel), 1, 16);
    const duration = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
    const eventKey = `food3d:${eatenFood.id}`;

    if (sendMidi && claimMidiOwnership() && shouldSendMidiEvent(eventKey)) {
      const midiOut = globalThis && globalThis.VJ_MIDI;
      if (midiOut && midiOut.sendNote) {
        try { midiOut.sendNote(note, velocity, channel, duration); } catch (_) {}
      }
    }

    foodFlashesRef.current.push({
      x: eatenFood.x,
      y: eatenFood.y,
      z: eatenFood.z,
      age: 0,
      life: 0.34,
      velocity,
      energy: eatenFood.energy,
    });
    if (foodFlashesRef.current.length > maxFlashes) {
      foodFlashesRef.current.splice(0, foodFlashesRef.current.length - maxFlashes);
    }
  }

  useFrame((state, delta) => {
    const fishMesh = fishMeshRef.current;
    const foodMesh = foodMeshRef.current;
    const flashMesh = flashMeshRef.current;
    if (!fishMesh || !foodMesh || !flashMesh) return;

    const dt = clamp(delta || 0, 0, 0.05);
    const t = state && state.clock ? state.clock.elapsedTime : 0;
    const fish = fishRef.current;
    const food = foodRef.current;
    const flashes = foodFlashesRef.current;
    const speed = Math.max(0.02, fishSpeed);
    const turn = Math.max(0.02, turnSpeed);
    const visionDist = Math.max(0.02, vision);
    const vision2 = visionDist * visionDist;
    const eatDist = Math.max(0.005, eatRadius);

    const liveFishSize = readLiveSize('fishSize', sizeRef.current.fish);
    const liveFoodSize = readLiveSize('foodSize', sizeRef.current.food);
    sizeRef.current.fish = liveFishSize;
    sizeRef.current.food = liveFoodSize;
    boundsRef.current = computeBounds(liveFishSize, liveFoodSize, depth);
    const b = boundsRef.current;

    while (food.length < foodLimit) food.push(makeFood());
    while (food.length > foodLimit) food.pop();

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      f.phase += dt * 8.5;

      let bestIndex = -1;
      let bestD2 = Infinity;
      for (let j = 0; j < food.length; j++) {
        const fd = food[j];
        const dx = fd.x - f.x;
        const dy = fd.y - f.y;
        const dz = fd.z - f.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < vision2 && d2 < bestD2) {
          bestD2 = d2;
          bestIndex = j;
        }
      }

      let ax = 0;
      let ay = 0;
      let az = 0;
      if (bestIndex >= 0) {
        const fd = food[bestIndex];
        const dx = fd.x - f.x;
        const dy = fd.y - f.y;
        const dz = fd.z - f.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
        ax += (dx / d) * turn * 1.7;
        ay += (dy / d) * turn * 1.7;
        az += (dz / d) * turn * 1.35;
        if (d < eatDist) {
          const eaten = food.splice(bestIndex, 1)[0];
          fireMidiForFood(eaten);
        }
      } else {
        ax += Math.sin(t * 0.9 + f.phase + i * 1.7) * wander;
        ay += Math.cos(t * 0.8 + f.phase * 0.7 + i * 2.1) * wander;
        az += Math.sin(t * 0.65 + f.phase * 0.5 + i) * wander * depthDrift;
      }

      const bx = clamp01((f.x - b.left) / Math.max(0.0001, b.right - b.left));
      const by = clamp01((f.y - b.bottom) / Math.max(0.0001, b.top - b.bottom));
      const bz = clamp01((f.z - b.back) / Math.max(0.0001, b.front - b.back));
      ax += ((1 - clamp01(bx / 0.14)) - clamp01((bx - 0.86) / 0.14)) * turn * 0.9;
      ay += ((1 - clamp01(by / 0.14)) - clamp01((by - 0.86) / 0.14)) * turn * 0.9;
      az += ((1 - clamp01(bz / 0.14)) - clamp01((bz - 0.86) / 0.14)) * turn * 0.8;

      f.vx += ax * dt;
      f.vy += ay * dt;
      f.vz += az * dt;
      const sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy + f.vz * f.vz) + 1e-6;
      const maxSpeed = speed * (1 + Math.sin(f.phase) * 0.04);
      if (sp > maxSpeed) {
        f.vx = (f.vx / sp) * maxSpeed;
        f.vy = (f.vy / sp) * maxSpeed;
        f.vz = (f.vz / sp) * maxSpeed;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      if (f.x < b.left) { f.x = b.left; f.vx = Math.abs(f.vx) * 0.9 + 0.04; }
      if (f.x > b.right) { f.x = b.right; f.vx = -Math.abs(f.vx) * 0.9 - 0.04; }
      if (f.y < b.bottom) { f.y = b.bottom; f.vy = Math.abs(f.vy) * 0.9 + 0.04; }
      if (f.y > b.top) { f.y = b.top; f.vy = -Math.abs(f.vy) * 0.9 - 0.04; }
      if (f.z < b.back) { f.z = b.back; f.vz = Math.abs(f.vz) * 0.9 + 0.04; }
      if (f.z > b.front) { f.z = b.front; f.vz = -Math.abs(f.vz) * 0.9 - 0.04; }
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].age += dt;
      if (flashes[i].age >= flashes[i].life) flashes.splice(i, 1);
    }

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const swimScale = 1 + Math.sin(f.phase * 2) * 0.08;
      const zScale = lerp(0.82, 1.18, clamp01((f.z - b.back) / Math.max(0.0001, b.front - b.back)));
      forward.set(f.vx, f.vy, f.vz).normalize();
      if (forward.lengthSq() < 0.0001) forward.set(1, 0, 0);
      dummyFish.position.set(f.x, f.y, f.z);
      dummyFish.quaternion.setFromUnitVectors(baseForward, forward);
      dummyFish.rotateY(Math.sin(f.phase) * 0.18);
      dummyFish.scale.set(liveFishSize * 2.4 * swimScale * zScale, liveFishSize * 1.15 * zScale, liveFishSize * 1.15 * zScale);
      dummyFish.updateMatrix();
      fishMesh.setMatrixAt(i, dummyFish.matrix);
    }
    fishMesh.count = fish.length;
    fishMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < food.length; i++) {
      const fd = food[i];
      fd.phase += dt * (1.4 + fd.energy);
      const pulse = 1 + Math.sin(fd.phase * 2.2) * 0.16;
      dummyFood.position.set(fd.x, fd.y, fd.z);
      dummyFood.rotation.set(fd.phase * 0.2, fd.phase * 0.36, fd.phase * 0.13);
      dummyFood.scale.setScalar(pulse * (0.9 + fd.energy * 0.35) * liveFoodSize);
      dummyFood.updateMatrix();
      foodMesh.setMatrixAt(i, dummyFood.matrix);
    }
    foodMesh.count = food.length;
    foodMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < flashes.length; i++) {
      const flash = flashes[i];
      const k = clamp01(flash.age / flash.life);
      const fade = 1 - k;
      const scale = (0.8 + fade * 2.2) * (0.8 + flash.velocity * 0.7 + flash.energy * 0.4) * liveFoodSize;
      dummyFlash.position.set(flash.x, flash.y, flash.z);
      dummyFlash.scale.setScalar(scale);
      dummyFlash.updateMatrix();
      flashMesh.setMatrixAt(i, dummyFlash.matrix);
      dummyColor.set(foodColor).multiplyScalar(0.08 + fade * 1.45);
      flashMesh.setColorAt(i, dummyColor);
    }
    flashMesh.count = flashes.length;
    flashMesh.instanceMatrix.needsUpdate = true;
    if (flashMesh.instanceColor) flashMesh.instanceColor.needsUpdate = true;
    flashMesh.material.opacity = flashes.length > 0 ? 0.95 : 0;

    if (groupRef.current) {
      groupRef.current.rotation.x = sceneTilt;
      groupRef.current.rotation.y = Math.sin(t * 0.22) * 0.18 + t * sceneSpin * 0.12;
    }
  });

  return React.createElement(
    'group',
    { ref: groupRef },
    React.createElement('ambientLight', { intensity: 0.65 }),
    React.createElement('pointLight', { position: [0, 0.5, 2.4], intensity: 1.5, color: fishColor }),
    React.createElement('pointLight', { position: [0, -0.6, -2.0], intensity: 1.1, color: foodColor }),
    React.createElement('instancedMesh', {
      ref: fishMeshRef,
      args: [fishGeometry, fishMaterial, Math.max(1, fishLimit)],
      renderOrder: 9998,
    }),
    React.createElement('instancedMesh', {
      ref: foodMeshRef,
      args: [foodGeometry, foodMaterial, Math.max(1, foodLimit)],
      renderOrder: 10000,
    }),
    React.createElement('instancedMesh', {
      ref: flashMeshRef,
      args: [flashGeometry, flashMaterial, maxFlashes],
      renderOrder: 10001,
    }),
  );
}
