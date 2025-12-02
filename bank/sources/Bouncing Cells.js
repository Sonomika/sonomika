// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useState, useEffect } = React || {};

export const metadata = {
  name: 'Bouncing Cells',
  description: 'Instanced circular cells that bounce elastically off screen edges with organic pulsing and movement.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numCells', type: 'number', value: 200, min: 10, max: 5000, step: 10 },
    { name: 'cellSize', type: 'number', value: 0.08, min: 0.02, max: 0.3, step: 0.01 },
    { name: 'speed', type: 'number', value: 0.8, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'turnSpeed', type: 'number', value: 2.0, min: 0.5, max: 10.0, step: 0.1 },
    { name: 'neighborRadius', type: 'number', value: 0.3, min: 0.05, max: 1.0, step: 0.01 },
    { name: 'separationWeight', type: 'number', value: 0.8, min: 0.0, max: 3.0, step: 0.1 },
    { name: 'alignmentWeight', type: 'number', value: 0.3, min: 0.0, max: 3.0, step: 0.1 },
    { name: 'cohesionWeight', type: 'number', value: 0.2, min: 0.0, max: 3.0, step: 0.1 },
    { name: 'pulseSpeed', type: 'number', value: 1.5, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'pulseAmount', type: 'number', value: 0.15, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'bounce', type: 'number', value: 0.9, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'color', type: 'color', value: '#88ccff' },
    { name: 'sizeVariation', type: 'number', value: 0.3, min: 0.0, max: 1.0, step: 0.05 },
  ],
};

export default function BouncingCells({
  numCells = 200,
  cellSize = 0.08,
  speed = 0.8,
  turnSpeed = 2.0,
  neighborRadius = 0.3,
  separationWeight = 0.8,
  alignmentWeight = 0.3,
  cohesionWeight = 0.2,
  pulseSpeed = 1.5,
  pulseAmount = 0.15,
  bounce = 0.9,
  color = '#88ccff',
  sizeVariation = 0.3,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = (size.width > 0 && size.height > 0) ? size.width / size.height : 16 / 9;
  // keep the viewing window [-halfWidth, halfWidth] x [-halfHeight, halfHeight]
  const halfHeight = 1.0; // use a normalized vertical extent (2 units tall)
  const halfWidth = aspect * halfHeight;

  const instancedRef = useRef(null);
  const positionsRef = useRef([]);
  const velocitiesRef = useRef([]);
  const phasesRef = useRef([]);
  const baseSizesRef = useRef([]);
  const pulsePhasesRef = useRef([]);

  const count = React.useMemo(() => {
    let n = Number(numCells);
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    if (n < 1) n = 1;
    if (n > 5000) n = 5000;
    return n;
  }, [numCells]);

  // cell geometry: circular/rounded shape
  const geometry = useMemo(() => {
    const segments = 16; // number of segments for the circle
    const g = new THREE.CircleGeometry(1, segments);
    return g;
  }, []);

  // material: soft, organic cell appearance
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    m.depthTest = true;
    m.depthWrite = false;
    m.blending = THREE.NormalBlending; // cells look better with normal blending
    return m;
  }, [color]);

  // initialize arrays
  React.useEffect(() => {
    const positions = new Array(count);
    const velocities = new Array(count);
    const phases = new Array(count);
    const baseSizes = new Array(count);
    const pulsePhases = new Array(count);
    for (let i = 0; i < count; i++) {
      // place uniformly in the box
      const x = (Math.random() * 2 - 1) * (halfWidth - cellSize * 0.5);
      const y = (Math.random() * 2 - 1) * (halfHeight - cellSize * 0.5);
      positions[i] = new THREE.Vector2(x, y);

      // initial velocity in random direction
      const ang = Math.random() * Math.PI * 2;
      const mag = (0.4 + Math.random() * 0.8) * speed;
      velocities[i] = new THREE.Vector2(Math.cos(ang) * mag, Math.sin(ang) * mag);

      phases[i] = Math.random() * Math.PI * 2;

      // base size with variation for organic look
      const sizeVar = 1.0 + (Math.random() * 2 - 1) * sizeVariation;
      baseSizes[i] = Math.max(0.3, sizeVar); // ensure minimum size

      // pulse phase offset for variety
      pulsePhases[i] = Math.random() * Math.PI * 2;
    }
    positionsRef.current = positions;
    velocitiesRef.current = velocities;
    phasesRef.current = phases;
    baseSizesRef.current = baseSizes;
    pulsePhasesRef.current = pulsePhases;
  }, [count, halfWidth, halfHeight, cellSize, speed, sizeVariation]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  // utility vectors reused per-frame
  const tmpV2 = useMemo(() => new THREE.Vector2(), []);
  const steer = useMemo(() => new THREE.Vector2(), []);
  const cohesionVec = useMemo(() => new THREE.Vector2(), []);
  const alignmentVec = useMemo(() => new THREE.Vector2(), []);
  const separationVec = useMemo(() => new THREE.Vector2(), []);

  useFrame((state, delta) => {
    if (!instancedRef.current) return;
    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;
    const phases = phasesRef.current;
    const baseSizes = baseSizesRef.current;
    const pulsePhases = pulsePhasesRef.current;
    if (!positions || !velocities) return;

    const left = -halfWidth + cellSize * 0.5;
    const right = halfWidth - cellSize * 0.5;
    const bottom = -halfHeight + cellSize * 0.5;
    const top = halfHeight - cellSize * 0.5;

    const n = positions.length;
    const neighR = Math.max(1e-4, neighborRadius);
    const neighR2 = neighR * neighR;

    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const v = velocities[i];
      const baseSize = baseSizes[i];

      // reset accumulators
      let cnt = 0;
      cohesionVec.set(0, 0);
      alignmentVec.set(0, 0);
      separationVec.set(0, 0);

      // naive neighbor search (optional boid behavior, more subtle for cells)
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
            separationVec.x += (p.x - pj.x) / (Math.sqrt(d2) + 1e-6);
            separationVec.y += (p.y - pj.y) / (Math.sqrt(d2) + 1e-6);
          }
        }
      }

      steer.set(0, 0);
      if (cnt > 0) {
        cohesionVec.multiplyScalar(1 / cnt);
        cohesionVec.sub(p).multiplyScalar(cohesionWeight);

        alignmentVec.multiplyScalar(1 / cnt);
        alignmentVec.normalize();
        alignmentVec.multiplyScalar(alignmentWeight);

        separationVec.multiplyScalar(1 / cnt);
        separationVec.normalize();
        separationVec.multiplyScalar(separationWeight);

        steer.add(cohesionVec).add(alignmentVec).add(separationVec);
      }

      // organic wandering for cells
      steer.x += (Math.random() * 2 - 1) * 0.02;
      steer.y += (Math.random() * 2 - 1) * 0.02;

      // apply limited turning
      tmpV2.copy(steer).multiplyScalar(delta * turnSpeed);
      v.add(tmpV2);

      // clamp speed within reasonable bounds
      const vmag = Math.max(1e-6, v.length());
      const maxSpeed = Math.max(0.0001, speed * 1.5);
      if (vmag > maxSpeed) {
        v.multiplyScalar(maxSpeed / vmag);
      } else {
        // slight push toward nominal speed
        const push = Math.max(0, speed - v.length()) * 0.05;
        if (push > 0) v.addScaledVector(v.clone().normalize(), push);
      }

      // integrate
      p.x += v.x * delta;
      p.y += v.y * delta;

      // Bounce logic: perfectly reflect position across border and invert velocity with damping (bounce)
      // X axis
      if (p.x < left) {
        p.x = left + (left - p.x);
        v.x = -v.x * bounce;
        v.y += (Math.random() - 0.5) * speed * 0.2;
      } else if (p.x > right) {
        p.x = right - (p.x - right);
        v.x = -v.x * bounce;
        v.y += (Math.random() - 0.5) * speed * 0.2;
      }
      // Y axis
      if (p.y < bottom) {
        p.y = bottom + (bottom - p.y);
        v.y = -v.y * bounce;
        v.x += (Math.random() - 0.5) * speed * 0.2;
      } else if (p.y > top) {
        p.y = top - (p.y - top);
        v.y = -v.y * bounce;
        v.x += (Math.random() - 0.5) * speed * 0.2;
      }

      // keep speed within maximum after bounce
      const vlen = Math.max(1e-6, v.length());
      if (vlen > speed * 2) v.multiplyScalar((speed * 2) / vlen);

      // update pulse phase
      pulsePhases[i] += delta * pulseSpeed;

      // cells don't rotate based on velocity - they're circular
      dummy.position.set(p.x, p.y, 0);
      dummy.rotation.set(0, 0, 0);

      // scale cell with pulsing effect
      const pulse = 1.0 + Math.sin(pulsePhases[i]) * pulseAmount;
      const finalSize = cellSize * baseSize * pulse;
      dummy.scale.set(finalSize, finalSize, 1.0);

      dummy.updateMatrix();
      instancedRef.current.setMatrixAt(i, dummy.matrix);
    }

    instancedRef.current.instanceMatrix.needsUpdate = true;
  });

  return React.createElement('instancedMesh', { ref: instancedRef, args: [geometry, material, count], renderOrder: 9999 });
}





