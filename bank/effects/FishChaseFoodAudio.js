// sonomika template – fish chase and eat morphing food with complex layered MIDI
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Fish Chase Food (MIDI)',
  description:
    'Boids-style fish chase morphing food particles. Food changes type/color near fish; layered MIDI triggers on EAT events with ambience.',
  category: 'Effects',
  author: 'VJ',
  version: '2.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'numFish', type: 'number', value: 50, min: 3, max: 50, step: 1 },
    { name: 'maxFood', type: 'number', value: 25, min: 10, max: 160, step: 5 },
    { name: 'foodSpawnRate', type: 'number', value: 2.2, min: 0.2, max: 8.0, step: 0.1 },
    { name: 'fishSpeed', type: 'number', value: 1.95, min: 0.3, max: 2.5, step: 0.05 },
    { name: 'fishTurn', type: 'number', value: 7.2, min: 0.5, max: 8.0, step: 0.1 },
    { name: 'vision', type: 'number', value: 1.25, min: 0.2, max: 1.4, step: 0.05 },
    { name: 'eatRadius', type: 'number', value: 0.085, min: 0.02, max: 0.12, step: 0.005 },
    { name: 'mutateRadius', type: 'number', value: 0.59, min: 0.05, max: 0.6, step: 0.01 },
    { name: 'schooling', type: 'number', value: 1.65, min: 0.0, max: 2.0, step: 0.05 },
    { name: 'separation', type: 'number', value: 2.95, min: 0.0, max: 3.0, step: 0.05 },
    { name: 'current', type: 'number', value: 1.90, min: 0.0, max: 2.0, step: 0.05 },
    { name: 'fishColor', type: 'color', value: '#4a9d8f' },
    { name: 'foodColor', type: 'color', value: '#ffffff' },
    { name: 'fishSize', type: 'number', value: 0.025, min: 0.02, max: 0.09, step: 0.005 },
    { name: 'foodSize', type: 'number', value: 0.055, min: 0.01, max: 0.06, step: 0.005 },
    { name: 'rootMidi', type: 'number', value: 48, min: 24, max: 72, step: 1, lockDefault: true },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send MIDI notes to the selected output when fish eat food' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const CHROMATIC_DEGREES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const FOOD_TYPE_COUNT = 5;

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function flowField(x, y, t) {
  const a = Math.sin((x * 1.7 + t * 0.55) * 2.0) + Math.cos((y * 1.3 - t * 0.42) * 2.5);
  const b = Math.cos((x * 1.1 - t * 0.33) * 2.8) - Math.sin((y * 1.9 + t * 0.61) * 1.9);
  return { fx: b * 0.5 - a * 0.25, fy: a * 0.5 + b * 0.25 };
}

function pickChromaticDegree(index) {
  const i = ((index % CHROMATIC_DEGREES.length) + CHROMATIC_DEGREES.length) % CHROMATIC_DEGREES.length;
  return CHROMATIC_DEGREES[i];
}

export default function FishChaseFoodMidiEffect({
  numFish = 50,
  maxFood = 25,
  foodSpawnRate = 2.2,
  fishSpeed = 1.95,
  fishTurn = 7.2,
  vision = 1.25,
  eatRadius = 0.085,
  mutateRadius = 0.59,
  schooling = 1.65,
  separation = 2.95,
  current = 1.90,
  fishColor = '#4a9d8f',
  foodColor = '#ffffff',
  fishSize = 0.025,
  foodSize = 0.055,
  rootMidi = 48,
  sendMidi = true,
  midiChannel = 1,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfWidth = (aspect * 2) / 2;
  const halfHeight = 2 / 2;

  const fishInstancedRef = useRef(null);
  const foodInstancedRef = useRef(null);
  const bubbleInstancedRef = useRef(null);

  const fishRef = useRef([]);
  const foodRef = useRef([]);
  const bubblesRef = useRef([]);

  const spawnAccRef = useRef(0);
  const lastSoundAtRef = useRef(0);

  const dummyFish = useMemo(() => new THREE.Object3D(), []);
  const dummyFood = useMemo(() => new THREE.Object3D(), []);
  const dummyBubble = useMemo(() => new THREE.Object3D(), []);

  // ---- geometry/material -----------------------------------------------------
  const fishGeometry = useMemo(() => new THREE.CircleGeometry(fishSize * 0.5, 14), [fishSize]);
  const foodGeometry = useMemo(() => new THREE.CircleGeometry(foodSize * 0.5, 10), [foodSize]);
  const bubbleGeometry = useMemo(() => new THREE.CircleGeometry(foodSize * 0.3, 8), [foodSize]);

  const fishMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(fishColor),
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [fishColor]);

  const foodMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(foodColor),
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [foodColor]);

  const bubbleMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#a8e6ff'),
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  // ---- init fish + food simulation -------------------------------------------
  useEffect(() => {
    const fish = [];
    const pad = fishSize * 1.5;
    const left = -halfWidth + pad;
    const right = halfWidth - pad;
    const bottom = -halfHeight + pad;
    const top = halfHeight - pad;
    // Spread fish more evenly across the space
    for (let i = 0; i < numFish; i++) {
      const seed = hash01((i + 1) * 13.17);
      // Start fish in center area, not edges
      const xRange = (right - left) * 0.6;
      const yRange = (top - bottom) * 0.6;
      const centerX = (left + right) / 2;
      const centerY = (bottom + top) / 2;
      fish.push({
        x: centerX + (Math.random() - 0.5) * xRange,
        y: centerY + (Math.random() - 0.5) * yRange,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        phase: Math.random() * Math.PI * 2,
        swim: 0.7 + Math.random() * 0.7,
        hunger: 0.3 + seed * 0.6,
        pref: Math.floor(seed * FOOD_TYPE_COUNT) % FOOD_TYPE_COUNT,
        bite: 0,
      });
    }
    fishRef.current = fish;
    foodRef.current = [];
    bubblesRef.current = [];
    spawnAccRef.current = 0;
    lastSoundAtRef.current = 0;
  }, [numFish, halfWidth, halfHeight, fishSize]);

  const pad = Math.max(fishSize, foodSize) * 1.5;
  const leftBound = -halfWidth + pad;
  const rightBound = halfWidth - pad;
  const topBound = halfHeight - pad;
  const bottomBound = -halfHeight + pad;

  const maxFoodClamped = Math.max(10, Math.min(200, Math.floor(Number(maxFood) || 70)));
  const maxBubbles = 120;


  function triggerEatSound({ fishIndex, foodType, energy, hunger }) {
    if (!sendMidi) return;
    const midiOut = globalThis && globalThis.VJ_MIDI;
    if (!midiOut || !midiOut.sendNote) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const minGapMs = 34;
    if (now - lastSoundAtRef.current < minGapMs) return;
    lastSoundAtRef.current = now;

    const base = Math.max(0, Math.min(108, Math.round(rootMidi)));
    const degree = pickChromaticDegree(Math.floor((foodType * 3 + fishIndex) % 16));
    const octave = foodType === 3 ? 24 : foodType === 2 ? 12 : 0;
    const note = Math.max(0, Math.min(127, base + degree + octave + Math.floor(lerp(-2, 3, clamp01(energy)))));
    const velocity = lerp(0.25, 0.95, clamp01(energy)) * lerp(0.7, 1.0, clamp01(hunger));
    const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
    const duration = foodType === 0 ? 120 : foodType === 1 ? 240 : foodType === 2 ? 120 : foodType === 3 ? 240 : 80;
    try { midiOut.sendNote(note, velocity, channel, duration); } catch (_) {}
  }

  function spawnBubbles(x, y, n, baseType) {
    const bubbles = bubblesRef.current;
    for (let k = 0; k < n; k++) {
      if (bubbles.length >= maxBubbles) break;
      const a = Math.random() * Math.PI * 2;
      const r = (0.01 + Math.random() * 0.02) * (0.7 + baseType * 0.15);
      bubbles.push({
        x,
        y,
        vx: Math.cos(a) * r * 2.2,
        vy: Math.sin(a) * r * 1.6 + 0.03,
        age: 0,
        life: 0.5 + Math.random() * 0.6,
        s: 0.7 + Math.random() * 1.3,
      });
    }
  }

  // ---- main simulation loop --------------------------------------------------
  useFrame((state, delta) => {
    const fishMesh = fishInstancedRef.current;
    const foodMesh = foodInstancedRef.current;
    const bubbleMesh = bubbleInstancedRef.current;
    if (!fishMesh || !foodMesh || !dummyFish || !dummyFood) return;

    const fish = fishRef.current;
    const food = foodRef.current;
    const bubbles = bubblesRef.current;

    const dt = clamp(delta, 0, 0.05);
    const tSec = state?.clock?.elapsedTime || 0;

    // spawn food
    spawnAccRef.current += dt * (Number(foodSpawnRate) || 0);
    while (spawnAccRef.current >= 1.0 && food.length < maxFoodClamped) {
      spawnAccRef.current -= 1.0;
      const s = 1 + food.length * 0.13 + tSec * 0.01;
      const type = Math.floor(hash01(s * 97.13) * FOOD_TYPE_COUNT) % FOOD_TYPE_COUNT;
      const energy = 0.35 + hash01(s * 11.7) * 0.75;
      food.push({
        x: lerp(leftBound, rightBound, Math.random()),
        y: lerp(bottomBound, topBound, 0.92 + Math.random() * 0.08),
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.06 - Math.random() * 0.12,
        type,
        baseType: type,
        energy,
        age: 0,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // update food (drift + morph when fish are close)
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      f.age += dt;
      f.phase += dt * (0.8 + f.energy);

      const flow = flowField(f.x, f.y, tSec);
      f.vx += flow.fx * dt * current * 0.22;
      f.vy += flow.fy * dt * current * 0.18;
      f.vx *= 0.992;
      f.vy *= 0.992;

      const bob = Math.sin(f.phase) * 0.02 * (0.4 + f.energy);
      f.x += (f.vx + bob * 0.2) * dt;
      f.y += (f.vy + bob * 0.35) * dt;

      if (f.x < leftBound) { f.x = leftBound; f.vx = Math.abs(f.vx); }
      if (f.x > rightBound) { f.x = rightBound; f.vx = -Math.abs(f.vx); }
      if (f.y < bottomBound) { f.y = bottomBound; f.vy = Math.abs(f.vy) * 0.8; }
      if (f.y > topBound) { f.y = topBound; f.vy = -Math.abs(f.vy) * 0.8; }

      // "changing food": mutate type when fish influence field overlaps
      let influence = 0;
      for (let j = 0; j < fish.length; j++) {
        const fj = fish[j];
        const dx = fj.x - f.x;
        const dy = fj.y - f.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < mutateRadius * mutateRadius) {
          const w = 1 - Math.sqrt(d2) / (mutateRadius || 1e-6);
          influence = Math.max(influence, w * (0.55 + fj.hunger * 0.55));
        }
      }
      if (influence > 0.001) {
        const spin = Math.floor((tSec * 6.0 + f.baseType * 3.0 + f.energy * 4.0) * influence);
        f.type = (f.baseType + spin) % FOOD_TYPE_COUNT;
        f.energy = clamp01(f.energy + (Math.sin(f.phase * 2.2) * 0.003) * influence);
      } else {
        f.type = f.baseType;
      }
    }

    // update fish (boids + chase food; eat on contact)
    const vMax = Math.max(0.05, Number(fishSpeed) || 1);
    const turn = Math.max(0.01, Number(fishTurn) || 1);
    const vis = Math.max(0.05, Number(vision) || 0.6);
    const vis2 = vis * vis;
    const sepRad = Math.max(0.02, fishSize * 2.8);
    const sep2 = sepRad * sepRad;

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      f.phase += dt * f.swim * 9;
      f.bite = Math.max(0, f.bite - dt);
      // Fish get hungrier over time
      f.hunger = clamp01(f.hunger + dt * 0.05);

      let ax = 0, ay = 0;
      let cx = 0, cy = 0, cvx = 0, cvy = 0, n = 0;
      let sx = 0, sy = 0;

      for (let j = 0; j < fish.length; j++) {
        if (j === i) continue;
        const o = fish[j];
        const dx = o.x - f.x;
        const dy = o.y - f.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < vis2) {
          n++;
          cx += o.x; cy += o.y;
          cvx += o.vx; cvy += o.vy;
          if (d2 < sep2 && d2 > 1e-8) {
            const inv = 1 / Math.sqrt(d2);
            sx -= dx * inv;
            sy -= dy * inv;
          }
        }
      }

      if (n > 0) {
        cx /= n; cy /= n;
        cvx /= n; cvy /= n;
        ax += (cx - f.x) * 0.75 * schooling;
        ay += (cy - f.y) * 0.75 * schooling;
        ax += (cvx - f.vx) * 0.9 * schooling;
        ay += (cvy - f.vy) * 0.9 * schooling;
        ax += sx * 1.1 * separation;
        ay += sy * 1.1 * separation;
      }

      // Chase best food target (prioritize by hunger, preference, distance)
      let bestIdx = -1;
      let bestScore = 0;
      for (let k = 0; k < food.length; k++) {
        const fd = food[k];
        const dx = fd.x - f.x;
        const dy = fd.y - f.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > vis2) continue;
        const d = Math.sqrt(d2) + 1e-6;
        const pref = fd.type === f.pref ? 1.4 : 1.0;
        const hungerDrive = lerp(0.5, 1.6, f.hunger);
        const score = (pref * hungerDrive * (1.0 + fd.energy)) / d;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = k;
        }
      }

      if (bestIdx >= 0) {
        const fd = food[bestIdx];
        const dx = fd.x - f.x;
        const dy = fd.y - f.y;
        const d2 = dx * dx + dy * dy;
        const d = Math.sqrt(d2) + 1e-6;
        const chase = lerp(0.6, 2.0, f.hunger);
        ax += (dx / d) * chase * 2.2;
        ay += (dy / d) * chase * 2.2;

        // Eat when close enough
        const eatDist = Math.max(0.015, Number(eatRadius) || 0.05);
        if (d < eatDist && f.bite <= 0) {
          const eaten = food[bestIdx];
          food.splice(bestIdx, 1);
          f.hunger = clamp01(f.hunger - lerp(0.25, 0.7, clamp01(eaten.energy)));
          f.bite = 0.18 + hash01(i * 17.7) * 0.12;
          if (Math.random() < 0.35) f.pref = eaten.type;
          spawnBubbles(f.x, f.y, 5 + Math.floor(eaten.type * 2), eaten.type);
          triggerEatSound({
            x: f.x,
            y: f.y,
            fishIndex: i,
            foodType: eaten.type,
            energy: eaten.energy,
            hunger: f.hunger,
          });
        }
      } else {
        const flow = flowField(f.x, f.y, tSec);
        ax += flow.fx * current * 0.6;
        ay += flow.fy * current * 0.6;
        ax += (hash01((i + 1) * 99.1 + tSec * 1.7) - 0.5) * 0.6;
        ay += (hash01((i + 1) * 33.7 + tSec * 1.9) - 0.5) * 0.6;
      }

      // Softer boundary steering to avoid corners
      const bx = clamp((f.x - leftBound) / (rightBound - leftBound + 1e-6), 0, 1);
      const by = clamp((f.y - bottomBound) / (topBound - bottomBound + 1e-6), 0, 1);
      ax += (smoothstep(0.0, 0.15, bx) - smoothstep(0.85, 1.0, bx)) * 2.5;
      ay += (smoothstep(0.0, 0.15, by) - smoothstep(0.85, 1.0, by)) * 2.5;

      const aLen = Math.sqrt(ax * ax + ay * ay) + 1e-6;
      const aMax = 3.5 * turn;
      const sxA = (ax / aLen) * Math.min(aLen, aMax);
      const syA = (ay / aLen) * Math.min(aLen, aMax);
      f.vx += sxA * dt;
      f.vy += syA * dt;

      const sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy) + 1e-6;
      const wig = 1 + Math.sin(f.phase) * 0.06;
      const maxSp = vMax * wig;
      if (sp > maxSp) {
        f.vx = (f.vx / sp) * maxSp;
        f.vy = (f.vy / sp) * maxSp;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.x = clamp(f.x, leftBound, rightBound);
      f.y = clamp(f.y, bottomBound, topBound);
    }

    // update bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += dt;
      const k = b.age / (b.life || 1);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.985;
      b.vy *= 0.995;
      b.vy += 0.035 * dt;
      if (k >= 1 || b.y > topBound + 0.2) bubbles.splice(i, 1);
    }

    // render fish instances
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const angle = Math.atan2(f.vy, f.vx);
      const swimWiggle = Math.sin(f.phase) * 0.18;
      const tail = Math.sin(f.phase * 2.2) * 0.22;
      const sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
      const spN = clamp01(sp / (vMax || 1));

      dummyFish.position.set(f.x, f.y, 0);
      dummyFish.rotation.z = angle + swimWiggle;
      const stretch = 2.3 + tail * 0.5 + spN * 0.25;
      const squash = 0.62 - Math.abs(tail) * 0.18;
      dummyFish.scale.set(stretch, squash, 1);
      dummyFish.updateMatrix();
      fishMesh.setMatrixAt(i, dummyFish.matrix);
    }
    fishMesh.instanceMatrix.needsUpdate = true;
    fishMesh.count = fish.length;

    // render food instances
    for (let i = 0; i < food.length; i++) {
      const f = food[i];
      const pulse = 0.85 + Math.sin(f.phase * 2.7) * 0.15;
      dummyFood.position.set(f.x, f.y, 0);
      dummyFood.rotation.z = f.phase * 0.25;
      const s = 1 + f.energy * 0.35;
      dummyFood.scale.set(s * (1 + (pulse - 1) * 0.6), s * (1 - (pulse - 1) * 0.4), 1);
      dummyFood.updateMatrix();
      foodMesh.setMatrixAt(i, dummyFood.matrix);
    }
    foodMesh.instanceMatrix.needsUpdate = true;
    foodMesh.count = food.length;

    // render bubbles
    if (bubbleMesh && dummyBubble) {
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const k = clamp01(b.age / (b.life || 1));
        const s = (0.5 + k * 1.6) * (b.s || 1);
        dummyBubble.position.set(b.x, b.y, 0);
        dummyBubble.rotation.z = b.age * 1.2;
        dummyBubble.scale.set(s, s, 1);
        dummyBubble.updateMatrix();
        bubbleMesh.setMatrixAt(i, dummyBubble.matrix);
      }
      bubbleMesh.instanceMatrix.needsUpdate = true;
      bubbleMesh.count = bubbles.length;
    }
  });

  return React.createElement(
    'group',
    {},
    React.createElement('instancedMesh', {
      ref: fishInstancedRef,
      args: [fishGeometry, fishMaterial, Math.max(1, numFish)],
      renderOrder: 9998,
    }),
    React.createElement('instancedMesh', {
      ref: foodInstancedRef,
      args: [foodGeometry, foodMaterial, Math.max(1, maxFoodClamped)],
      renderOrder: 9999,
    }),
    React.createElement('instancedMesh', {
      ref: bubbleInstancedRef,
      args: [bubbleGeometry, bubbleMaterial, maxBubbles],
      renderOrder: 10000,
    })
  );
}
