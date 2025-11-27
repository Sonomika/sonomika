// sonomika source
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Micro Swimmers',
  description:
    'Clouds of microrobe-like swimmers gliding in a fluid, with wiggling motion, subtle collective behaviour, 20 distinct cell shapes and a colour-shifted palette.',
  category: 'Sources',
  author: 'VJ',
  version: '1.3.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numSwimmers', type: 'number', value: 600, min: 10, max: 6000, step: 10 },
    { name: 'bodySize', type: 'number', value: 0.07, min: 0.01, max: 0.25, step: 0.01 },
    { name: 'speed', type: 'number', value: 0.9, min: 0.1, max: 4.0, step: 0.05 },
    { name: 'wiggleStrength', type: 'number', value: 1.2, min: 0.0, max: 4.0, step: 0.05 },
    { name: 'wiggleFrequency', type: 'number', value: 3.0, min: 0.1, max: 10.0, step: 0.1 },
    { name: 'flowStrength', type: 'number', value: 0.8, min: 0.0, max: 3.0, step: 0.05 },
    { name: 'neighborRadius', type: 'number', value: 0.25, min: 0.05, max: 0.8, step: 0.01 },
    { name: 'separationWeight', type: 'number', value: 0.9, min: 0.0, max: 3.0, step: 0.05 },
    { name: 'alignmentWeight', type: 'number', value: 0.5, min: 0.0, max: 3.0, step: 0.05 },
    { name: 'cohesionWeight', type: 'number', value: 0.3, min: 0.0, max: 3.0, step: 0.05 },
    { name: 'drag', type: 'number', value: 0.15, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'edgeSoftness', type: 'number', value: 0.6, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'sizeVariation', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.05 },
    { name: 'colour', type: 'color', value: '#aaffdd' },
  ],
};

const SHAPE_TYPES = 20;

export default function MicroSwimmers({
  numSwimmers = 600,
  bodySize = 0.07,
  speed = 0.9,
  wiggleStrength = 1.2,
  wiggleFrequency = 3.0,
  flowStrength = 0.8,
  neighborRadius = 0.25,
  separationWeight = 0.9,
  alignmentWeight = 0.5,
  cohesionWeight = 0.3,
  drag = 0.15,
  edgeSoftness = 0.6,
  sizeVariation = 0.35,
  colour = '#aaffdd',
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect =
    size && size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;

  const halfHeight = 1.0;
  const halfWidth = aspect * halfHeight;

  const positionsRef = useRef([]);
  const velocitiesRef = useRef([]);
  const phasesRef = useRef([]);
  const baseSizesRef = useRef([]);
  const shapeIndexRef = useRef([]);
  const indexInShapeRef = useRef([]);

  // one instanced mesh per shape type
  const shapeMeshRefs = useRef([]);

  const count = React.useMemo(() => {
    let n = Number(numSwimmers);
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    if (n < 1) n = 1;
    if (n > 6000) n = 6000;
    return n;
  }, [numSwimmers]);

  // distribute swimmers across 20 shapes as evenly as possible
  const shapeCounts = useMemo(() => {
    const counts = new Array(SHAPE_TYPES).fill(0);
    const base = Math.floor(count / SHAPE_TYPES);
    let remainder = count % SHAPE_TYPES;
    for (let i = 0; i < SHAPE_TYPES; i++) {
      counts[i] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
    return counts;
  }, [count]);

  // 20 different base geometries so they are not all bars
  const geometries = useMemo(() => {
    const geoms = [];

    const makeCapsule = (radius = 0.5, length = 1.0) => {
      const shape = new THREE.Shape();
      const lx = -length * 0.5;
      const rx = length * 0.5;
      const r = radius;
      shape.moveTo(lx, 0);
      shape.absarc(lx, 0, r, Math.PI / 2, (Math.PI * 3) / 2, true);
      shape.lineTo(rx, -r);
      shape.absarc(rx, 0, r, (Math.PI * 3) / 2, Math.PI / 2, true);
      return new THREE.ShapeGeometry(shape);
    };

    geoms[0] = new THREE.CircleGeometry(0.5, 24);
    geoms[1] = new THREE.CircleGeometry(0.5, 6);
    geoms[2] = new THREE.CircleGeometry(0.5, 3);
    geoms[3] = new THREE.RingGeometry(0.25, 0.5, 24);
    geoms[4] = makeCapsule(0.25, 1.2);
    geoms[5] = makeCapsule(0.2, 0.8);
    geoms[6] = new THREE.BoxGeometry(1.0, 0.4, 0.01);
    geoms[7] = new THREE.BoxGeometry(0.8, 0.8, 0.01);
    geoms[8] = new THREE.CircleGeometry(0.5, 5);
    geoms[9] = new THREE.RingGeometry(0.35, 0.5, 16);
    geoms[10] = new THREE.CircleGeometry(0.5, 12);
    geoms[11] = makeCapsule(0.3, 1.6);
    geoms[12] = new THREE.BoxGeometry(1.2, 0.25, 0.01);
    geoms[13] = new THREE.CircleGeometry(0.4, 7);
    geoms[14] = new THREE.RingGeometry(0.15, 0.5, 10);
    geoms[15] = new THREE.BoxGeometry(0.6, 0.3, 0.01);
    geoms[16] = new THREE.CircleGeometry(0.5, 8);
    geoms[17] = new THREE.BoxGeometry(0.9, 0.5, 0.01);
    geoms[18] = new THREE.CircleGeometry(0.35, 20);
    geoms[19] = makeCapsule(0.22, 1.0);

    return geoms;
  }, []);

  // build a 20-colour palette by rotating the hue around the base colour
  const materials = useMemo(() => {
    const base = new THREE.Color(colour);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);

    const mats = [];
    for (let i = 0; i < SHAPE_TYPES; i++) {
      const c = new THREE.Color();
      const h = (hsl.h + i / SHAPE_TYPES) % 1;
      const s = THREE.MathUtils.clamp(hsl.s * 0.7 + 0.2, 0, 1);
      const l = THREE.MathUtils.clamp(hsl.l * 0.7 + 0.15, 0, 1);
      c.setHSL(h, s, l);

      const m = new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      m.depthTest = true;
      m.depthWrite = false;
      m.blending = THREE.AdditiveBlending;
      mats.push(m);
    }
    return mats;
  }, [colour]);

  useEffect(() => {
    const positions = new Array(count);
    const velocities = new Array(count);
    const phases = new Array(count);
    const baseSizes = new Array(count);
    const shapeIndices = new Array(count);
    const indexInShape = new Array(count);

    const shapeCursor = new Array(SHAPE_TYPES).fill(0);

    let currentShape = 0;
    for (let i = 0; i < count; i++) {
      while (currentShape < SHAPE_TYPES && shapeCursor[currentShape] >= shapeCounts[currentShape]) {
        currentShape += 1;
      }
      const sIndex = currentShape % SHAPE_TYPES;
      shapeIndices[i] = sIndex;
      indexInShape[i] = shapeCursor[sIndex];
      shapeCursor[sIndex] += 1;

      const x = (Math.random() * 2 - 1) * halfWidth * 0.95;
      const y = (Math.random() * 2 - 1) * halfHeight * 0.95;
      positions[i] = new THREE.Vector2(x, y);

      const ang = Math.random() * Math.PI * 2;
      const mag = speed * (0.5 + Math.random() * 0.8);
      velocities[i] = new THREE.Vector2(Math.cos(ang) * mag, Math.sin(ang) * mag);

      phases[i] = Math.random() * Math.PI * 2;

      const sVar = 1.0 + (Math.random() * 2 - 1) * sizeVariation;
      baseSizes[i] = Math.max(0.3, sVar);
    }

    positionsRef.current = positions;
    velocitiesRef.current = velocities;
    phasesRef.current = phases;
    baseSizesRef.current = baseSizes;
    shapeIndexRef.current = shapeIndices;
    indexInShapeRef.current = indexInShape;
  }, [count, halfWidth, halfHeight, speed, sizeVariation, shapeCounts]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpV2 = useMemo(() => new THREE.Vector2(), []);
  const steer = useMemo(() => new THREE.Vector2(), []);
  const cohesionVec = useMemo(() => new THREE.Vector2(), []);
  const alignmentVec = useMemo(() => new THREE.Vector2(), []);
  const separationVec = useMemo(() => new THREE.Vector2(), []);
  const fieldVec = useMemo(() => new THREE.Vector2(), []);

  const sampleFlow = (x, y, t, strength) => {
    const f = 0.9;
    const s1 = Math.sin(y * f + t * 0.4);
    const c1 = Math.cos(x * f * 0.7 - t * 0.3);
    const s2 = Math.sin((x + y) * f * 0.5 + t * 0.6);

    const vx = (s1 + s2 * 0.6) * strength;
    const vy = (c1 - s2 * 0.4) * strength;

    fieldVec.set(vx, vy);
    return fieldVec;
  };

  useFrame((state, delta) => {
    const meshes = shapeMeshRefs.current;
    if (!meshes || meshes.length === 0) return;

    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;
    const phases = phasesRef.current;
    const baseSizes = baseSizesRef.current;
    const shapeIndices = shapeIndexRef.current;
    const indexInShape = indexInShapeRef.current;

    if (
      !positions ||
      !velocities ||
      !phases ||
      !baseSizes ||
      !shapeIndices ||
      !indexInShape
    ) {
      return;
    }

    const n = positions.length;
    const t = state.clock.getElapsedTime?.() ?? 0;

    const neighR = Math.max(1e-4, neighborRadius);
    const neighR2 = neighR * neighR;

    const worldLeft = -halfWidth;
    const worldRight = halfWidth;
    const worldBottom = -halfHeight;
    const worldTop = halfHeight;

    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const v = velocities[i];
      const baseSize = baseSizes[i];

      steer.set(0, 0);
      cohesionVec.set(0, 0);
      alignmentVec.set(0, 0);
      separationVec.set(0, 0);

      let cnt = 0;

      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const pj = positions[j];
        const dx = pj.x - p.x;
        const dy = pj.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= neighR2) {
          cnt++;
          cohesionVec.x += pj.x;
          cohesionVec.y += pj.y;

          alignmentVec.x += velocities[j].x;
          alignmentVec.y += velocities[j].y;

          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            separationVec.x += (p.x - pj.x) / (d + 1e-6);
            separationVec.y += (p.y - pj.y) / (d + 1e-6);
          }
        }
      }

      if (cnt > 0) {
        const invCnt = 1 / cnt;

        cohesionVec.multiplyScalar(invCnt);
        cohesionVec.sub(p).multiplyScalar(cohesionWeight);

        alignmentVec.multiplyScalar(invCnt);
        const alignLen = alignmentVec.length() || 1e-6;
        alignmentVec.multiplyScalar(1 / alignLen).multiplyScalar(alignmentWeight);

        separationVec.multiplyScalar(invCnt);
        const sepLen = separationVec.length() || 1e-6;
        separationVec.multiplyScalar(1 / sepLen).multiplyScalar(separationWeight);

        steer.add(cohesionVec).add(alignmentVec).add(separationVec);
      }

      if (flowStrength > 0) {
        const flow = sampleFlow(p.x, p.y, t, flowStrength * 0.2);
        steer.add(flow);
      }

      if (wiggleStrength > 0) {
        const wigPhase = phases[i];
        const vLen = v.length() || 1e-6;
        const nx = v.x / vLen;
        const ny = v.y / vLen;
        const px = -ny;
        const py = nx;

        const wig =
          Math.sin(t * wiggleFrequency + wigPhase) *
          wiggleStrength *
          0.15 *
          speed;

        steer.x += px * wig;
        steer.y += py * wig;

        phases[i] = wigPhase + delta * wiggleFrequency * 0.2;
      }

      if (edgeSoftness > 0) {
        const sx = halfWidth * 0.85;
        const sy = halfHeight * 0.85;

        if (Math.abs(p.x) > sx) {
          const dir = p.x > 0 ? -1 : 1;
          const edgeFactor =
            edgeSoftness *
            ((Math.abs(p.x) - sx) / (halfWidth - sx + 1e-6));
          steer.x += dir * edgeFactor * speed * 0.4;
        }

        if (Math.abs(p.y) > sy) {
          const dir = p.y > 0 ? -1 : 1;
          const edgeFactor =
            edgeSoftness *
            ((Math.abs(p.y) - sy) / (halfHeight - sy + 1e-6));
          steer.y += dir * edgeFactor * speed * 0.4;
        }
      }

      v.addScaledVector(steer, delta);
      v.multiplyScalar(1 - drag * delta);

      const vmag = v.length() || 1e-6;
      const targetSpeed = speed;
      const maxSpeed = targetSpeed * 1.8;
      if (vmag > maxSpeed) {
        v.multiplyScalar(maxSpeed / vmag);
      } else {
        const boost = (targetSpeed - vmag) * 0.4;
        if (boost > 0) {
          tmpV2.copy(v).normalize().multiplyScalar(boost * delta);
          v.add(tmpV2);
        }
      }

      p.x += v.x * delta;
      p.y += v.y * delta;

      if (p.x < worldLeft) p.x = worldRight - (worldLeft - p.x);
      if (p.x > worldRight) p.x = worldLeft + (p.x - worldRight);
      if (p.y < worldBottom) p.y = worldTop - (worldBottom - p.y);
      if (p.y > worldTop) p.y = worldBottom + (p.y - worldTop);

      const dirLen = v.length() || 1e-6;
      const vx = v.x / dirLen;
      const vy = v.y / dirLen;
      const angle = Math.atan2(vy, vx);

      dummy.position.set(p.x, p.y, 0);
      dummy.rotation.set(0, 0, angle);

      let lengthScale =
        bodySize *
        baseSize *
        (0.9 + Math.min(2.0, dirLen / Math.max(0.0001, speed)) * 0.8);
      let widthScale = bodySize * baseSize * 0.6;

      lengthScale = Math.max(0.02, Math.min(lengthScale, 0.7));
      widthScale = Math.max(0.02, Math.min(widthScale, 0.5));

      dummy.scale.set(lengthScale, widthScale, 1.0);
      dummy.updateMatrix();

      const sIndex = shapeIndices[i] || 0;
      const localIndex = indexInShape[i] || 0;
      const mesh = meshes[sIndex];
      if (mesh && mesh.count > localIndex) {
        mesh.setMatrixAt(localIndex, dummy.matrix);
      }
    }

    for (let s = 0; s < SHAPE_TYPES; s++) {
      const mesh = meshes[s];
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  });

  return React.createElement(
    'group',
    null,
    geometries.map((geom, shapeIdx) => {
      const countForShape = shapeCounts[shapeIdx] || 0;
      if (!geom || countForShape <= 0) return null;
      const mat = materials[shapeIdx] || materials[0];
      return React.createElement('instancedMesh', {
        key: shapeIdx,
        ref: el => {
          if (el) shapeMeshRefs.current[shapeIdx] = el;
        },
        args: [geom, mat, countForShape],
        renderOrder: 9999,
      });
    })
  );
}
