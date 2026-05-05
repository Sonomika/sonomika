const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Fish Food Chase (MIDI)',
  description: 'Fish swim around the screen and fire chromatic MIDI notes only when they eat food.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'fishCount', type: 'number', value: 7, min: 1, max: 80, step: 1 },
    { name: 'foodCount', type: 'number', value: 14, min: 1, max: 160, step: 1 },
    { name: 'fishSpeed', type: 'number', value: 1.3, min: 0.1, max: 4, step: 0.05 },
    { name: 'turnSpeed', type: 'number', value: 2.3, min: 0.2, max: 12, step: 0.1 },
    { name: 'wander', type: 'number', value: 1.45, min: 0, max: 2, step: 0.05 },
    { name: 'vision', type: 'number', value: 2.2, min: 0.1, max: 3, step: 0.05 },
    { name: 'eatRadius', type: 'number', value: 0.07, min: 0.01, max: 0.2, step: 0.005 },
    { name: 'fishSize', type: 'number', value: 0.034, min: 0.01, max: 0.12, step: 0.002 },
    { name: 'foodSize', type: 'number', value: 0.014, min: 0.008, max: 0.12, step: 0.002 },
    { name: 'fishColor', type: 'color', value: '#ffffff' },
    { name: 'foodColor', type: 'color', value: '#ffffff' },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 7, min: 1, max: 48, step: 1, description: 'Chromatic range from bottom food to top food' },
    { name: 'noteLength', type: 'number', value: 0.16, min: 0.03, max: 2, step: 0.01 },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05 },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI when a fish eats food' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const OWNER_SLOT = '__VJ_FISH_FOOD_CHASE_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_FISH_FOOD_CHASE_MIDI_LAST__';
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

function midiForY(y, bottom, top, rootMidi, noteRange) {
  const n = clamp01((y - bottom) / Math.max(0.0001, top - bottom));
  const semitone = Math.round(n * Math.max(1, noteRange));
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

export default function FishFoodChaseMidi({
  fishCount = 7,
  foodCount = 14,
  fishSpeed = 1.3,
  turnSpeed = 2.3,
  wander = 1.45,
  vision = 2.2,
  eatRadius = 0.07,
  fishSize = 0.034,
  foodSize = 0.014,
  fishColor = '#ffffff',
  foodColor = '#ffffff',
  rootMidi = 48,
  noteRange = 7,
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

  const fishMeshRef = useRef(null);
  const foodMeshRef = useRef(null);
  const foodFlashMeshRef = useRef(null);

  const dummyFish = useMemo(() => new THREE.Object3D(), []);
  const dummyFood = useMemo(() => new THREE.Object3D(), []);
  const dummyFoodFlash = useMemo(() => new THREE.Object3D(), []);
  const dummyFoodFlashColor = useMemo(() => new THREE.Color(), []);

  // Geometry is a unit circle. We apply per-instance scale = fishSize/foodSize
  // inside useFrame so changing the size slider updates instantly without
  // rebuilding the geometry (which would otherwise force R3F to tear down the
  // instancedMesh and reset every fish position).
  const fishGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 16), []);
  const foodGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 14), []);

  const fishMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  const foodMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  const foodFlashMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  // Push live colors into the existing materials in place. Recreating the
  // material on each color change would force R3F to swap it on the mesh and
  // could drop the instance-color buffer for the flash mesh.
  useEffect(() => {
    try { fishMaterial.color.set(fishColor); } catch (_) {}
  }, [fishMaterial, fishColor]);
  useEffect(() => {
    try { foodMaterial.color.set(foodColor); } catch (_) {}
  }, [foodMaterial, foodColor]);

  const fishLimit = Math.max(1, Math.min(120, Math.floor(fishCount)));
  const foodLimit = Math.max(1, Math.min(220, Math.floor(foodCount)));
  const maxFoodFlashes = 128;

  // Live size/bounds — tracked in refs so they update every frame without
  // re-running the init useEffect (which would reset every fish position).
  // We also peek at the LFO live-modulation side channel each frame so an
  // LFO mapped to fishSize/foodSize updates smoothly without round-tripping
  // through the React store on every tick.
  const sizeRef = useRef({ fish: fishSize, food: foodSize });
  const boundsRef = useRef({ left: 0, right: 0, bottom: 0, top: 0 });
  const halfWidthRef = useRef(halfWidth);
  const halfHeightRef = useRef(halfHeight);
  halfWidthRef.current = halfWidth;
  halfHeightRef.current = halfHeight;
  const computeBounds = (fSize, fdSize) => {
    const p = Math.max(fSize, fdSize) * 1.8;
    return {
      left: -halfWidthRef.current + p,
      right: halfWidthRef.current - p,
      bottom: -halfHeightRef.current + p,
      top: halfHeightRef.current - p,
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
  boundsRef.current = computeBounds(fishSize, foodSize);

  const makeFood = () => {
    const b = boundsRef.current;
    return {
      id: foodIdRef.current++,
      x: randomIn(b.left, b.right),
      y: randomIn(b.bottom, b.top),
      phase: Math.random() * Math.PI * 2,
      energy: 0.35 + Math.random() * 0.65,
    };
  };

  const claimMidiOwnership = () => {
    try {
      const now = nowMs();
      const current = globalThis[OWNER_SLOT];
      if (!current || current.key === ownerKeyRef.current || current.expiresAt <= now) {
        globalThis[OWNER_SLOT] = {
          key: ownerKeyRef.current,
          expiresAt: now + OWNER_LEASE_MS,
        };
        return true;
      }
      return current.key === ownerKeyRef.current;
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    ownerKeyRef.current = `fish-food-chase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, []);

  // Initialize once on mount, then only resize the fish array when fishLimit
  // changes (food is resized live in useFrame). Size/bounds changes do NOT
  // re-run this effect, so fish keep their positions while sliders move.
  useEffect(() => {
    if (fishRef.current.length === 0) {
      const fish = [];
      const food = [];
      const b = boundsRef.current;
      for (let i = 0; i < fishLimit; i++) {
        const a = Math.random() * Math.PI * 2;
        fish.push({
          x: randomIn(b.left, b.right),
          y: randomIn(b.bottom, b.top),
          vx: Math.cos(a) * 0.35,
          vy: Math.sin(a) * 0.35,
          phase: Math.random() * Math.PI * 2,
        });
      }
      for (let i = 0; i < foodLimit; i++) {
        food.push(makeFood());
      }
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
          vx: Math.cos(a) * 0.35,
          vy: Math.sin(a) * 0.35,
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (fish.length > fishLimit) {
      fish.length = fishLimit;
    }
  }, [fishLimit, foodLimit]);

  function fireMidiForFood(fishIndex, eatenFood) {
    if (!eatenFood || consumedFoodIdsRef.current.has(eatenFood.id)) return;
    consumedFoodIdsRef.current.add(eatenFood.id);

    const b = boundsRef.current;
    const note = midiForY(eatenFood.y, b.bottom, b.top, rootMidi, noteRange);
    const velocity = clamp((0.45 + eatenFood.energy * 0.55) * velocityBoost, 0.05, 1);
    const channel = clamp(Math.round(midiChannel), 1, 16);
    const duration = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
    const eventKey = `food:${eatenFood.id}`;

    if (sendMidi && claimMidiOwnership() && shouldSendMidiEvent(eventKey)) {
      const midiOut = globalThis && globalThis.VJ_MIDI;
      if (midiOut && midiOut.sendNote) {
        try { midiOut.sendNote(note, velocity, channel, duration); } catch (_) {}
      }
    }

    foodFlashesRef.current.push({
      x: eatenFood.x,
      y: eatenFood.y,
      age: 0,
      life: 0.28,
      velocity,
      energy: eatenFood.energy,
    });
    if (foodFlashesRef.current.length > maxFoodFlashes) {
      foodFlashesRef.current.splice(0, foodFlashesRef.current.length - maxFoodFlashes);
    }
  }

  useFrame((state, delta) => {
    const fishMesh = fishMeshRef.current;
    const foodMesh = foodMeshRef.current;
    const foodFlashMesh = foodFlashMeshRef.current;
    if (!fishMesh || !foodMesh || !foodFlashMesh) return;

    const dt = clamp(delta || 0, 0, 0.05);
    const t = state && state.clock ? state.clock.elapsedTime : 0;
    const fish = fishRef.current;
    const food = foodRef.current;
    const foodFlashes = foodFlashesRef.current;
    const speed = Math.max(0.02, fishSpeed);
    const turn = Math.max(0.02, turnSpeed);
    const visionDist = Math.max(0.02, vision);
    const vision2 = visionDist * visionDist;
    const eatDist = Math.max(0.005, eatRadius);

    const liveFishSize = readLiveSize('fishSize', sizeRef.current.fish);
    const liveFoodSize = readLiveSize('foodSize', sizeRef.current.food);
    sizeRef.current.fish = liveFishSize;
    sizeRef.current.food = liveFoodSize;
    boundsRef.current = computeBounds(liveFishSize, liveFoodSize);
    const liveBounds = boundsRef.current;
    const left = liveBounds.left;
    const right = liveBounds.right;
    const bottom = liveBounds.bottom;
    const top = liveBounds.top;

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
        const d2 = dx * dx + dy * dy;
        if (d2 < vision2 && d2 < bestD2) {
          bestD2 = d2;
          bestIndex = j;
        }
      }

      let ax = 0;
      let ay = 0;
      if (bestIndex >= 0) {
        const fd = food[bestIndex];
        const dx = fd.x - f.x;
        const dy = fd.y - f.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        ax += (dx / d) * turn * 1.7;
        ay += (dy / d) * turn * 1.7;

        if (d < eatDist) {
          const eaten = food.splice(bestIndex, 1)[0];
          fireMidiForFood(i, eaten);
        }
      } else {
        ax += Math.sin(t * 0.9 + f.phase + i * 1.7) * wander;
        ay += Math.cos(t * 0.8 + f.phase * 0.7 + i * 2.1) * wander;
      }

      const bx = clamp01((f.x - left) / Math.max(0.0001, right - left));
      const by = clamp01((f.y - bottom) / Math.max(0.0001, top - bottom));
      ax += ((1 - clamp01(bx / 0.14)) - clamp01((bx - 0.86) / 0.14)) * turn * 0.9;
      ay += ((1 - clamp01(by / 0.14)) - clamp01((by - 0.86) / 0.14)) * turn * 0.9;

      f.vx += ax * dt;
      f.vy += ay * dt;
      const sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy) + 1e-6;
      const maxSpeed = speed * (1 + Math.sin(f.phase) * 0.04);
      if (sp > maxSpeed) {
        f.vx = (f.vx / sp) * maxSpeed;
        f.vy = (f.vy / sp) * maxSpeed;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < left) { f.x = left; f.vx = Math.abs(f.vx) * 0.9 + 0.04; }
      if (f.x > right) { f.x = right; f.vx = -Math.abs(f.vx) * 0.9 - 0.04; }
      if (f.y < bottom) { f.y = bottom; f.vy = Math.abs(f.vy) * 0.9 + 0.04; }
      if (f.y > top) { f.y = top; f.vy = -Math.abs(f.vy) * 0.9 - 0.04; }
    }

    for (let i = foodFlashes.length - 1; i >= 0; i--) {
      foodFlashes[i].age += dt;
      if (foodFlashes[i].age >= foodFlashes[i].life) foodFlashes.splice(i, 1);
    }

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const angle = Math.atan2(f.vy, f.vx);
      const wiggle = Math.sin(f.phase) * 0.2;
      const stretch = 2.25 + Math.sin(f.phase * 2) * 0.22;
      dummyFish.position.set(f.x, f.y, 0);
      dummyFish.rotation.z = angle + wiggle;
      dummyFish.scale.set(stretch * liveFishSize, 0.64 * liveFishSize, 1);
      dummyFish.updateMatrix();
      fishMesh.setMatrixAt(i, dummyFish.matrix);
    }
    fishMesh.count = fish.length;
    fishMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < food.length; i++) {
      const fd = food[i];
      fd.phase += dt * (1.4 + fd.energy);
      const pulse = 1 + Math.sin(fd.phase * 2.2) * 0.16;
      dummyFood.position.set(fd.x, fd.y, 0.01);
      dummyFood.rotation.z = fd.phase * 0.4;
      dummyFood.scale.set(pulse * (0.9 + fd.energy * 0.35) * liveFoodSize, pulse * liveFoodSize, 1);
      dummyFood.updateMatrix();
      foodMesh.setMatrixAt(i, dummyFood.matrix);
    }
    foodMesh.count = food.length;
    foodMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < foodFlashes.length; i++) {
      const flash = foodFlashes[i];
      const k = clamp01(flash.age / flash.life);
      const fade = 1 - k;
      const scale = (0.35 + fade * 0.9) * (0.8 + flash.velocity * 0.7 + flash.energy * 0.4) * liveFoodSize;
      dummyFoodFlash.position.set(flash.x, flash.y, 0.04);
      dummyFoodFlash.rotation.z = t * 2.4;
      dummyFoodFlash.scale.set(scale, scale, 1);
      dummyFoodFlash.updateMatrix();
      foodFlashMesh.setMatrixAt(i, dummyFoodFlash.matrix);
      dummyFoodFlashColor.set(foodColor).multiplyScalar(0.08 + fade * 1.35);
      foodFlashMesh.setColorAt(i, dummyFoodFlashColor);
    }
    foodFlashMesh.count = foodFlashes.length;
    foodFlashMesh.instanceMatrix.needsUpdate = true;
    if (foodFlashMesh.instanceColor) foodFlashMesh.instanceColor.needsUpdate = true;
    foodFlashMesh.material.opacity = foodFlashes.length > 0 ? 0.95 : 0;
  });

  return React.createElement(
    'group',
    {},
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
      ref: foodFlashMeshRef,
      args: [foodGeometry, foodFlashMaterial, maxFoodFlashes],
      renderOrder: 10001,
    })
  );
}
