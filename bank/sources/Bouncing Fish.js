// Sonomika template: `Bouncing School` — auto-wrapped from internal component
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useMemo, useRef, useState, useEffect } = React || {};

export const metadata = {
  name: `Bouncing School`, description: `Instanced fish-like boids that swim, wiggle and bounce elastically off the screen edges.`, category: 'Sources', author: 'VJ', version: '1.0.0', isSource: true,
  parameters: [
    { name: 'numFish', type: 'number', value: 300, min: 10, max: 5000, step: 10 },
    { name: 'fishSize', type: 'number', value: 0.04, min: 0.01, max: 0.2, step: 0.01 },
    { name: 'speed', type: 'number', value: 1.2, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'turnSpeed', type: 'number', value: 3.0, min: 0.5, max: 10.0, step: 0.1 },
    { name: 'neighborRadius', type: 'number', value: 0.22, min: 0.05, max: 1.0, step: 0.01 },
    { name: 'separationWeight', type: 'number', value: 1.2, min: 0.0, max: 3.0, step: 0.1 },
    { name: 'alignmentWeight', type: 'number', value: 0.9, min: 0.0, max: 3.0, step: 0.1 },
    { name: 'cohesionWeight', type: 'number', value: 0.5, min: 0.0, max: 3.0, step: 0.1 },
    { name: 'wiggle', type: 'number', value: 0.7, min: 0.0, max: 2.0, step: 0.05 },
    { name: 'bounce', type: 'number', value: 0.86, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'color', type: 'color', value: '#55aaff' },
    { name: 'shape', type: 'select', value: 'arrow', options: [{ value: 'arrow', label: 'Arrow' }, { value: 'slim', label: 'Slim' }] },
  ],
};

export default function BouncingSchool({
  numFish = 300,
  fishSize = 0.04,
  speed = 1.2,
  turnSpeed = 3.0,
  neighborRadius = 0.22,
  separationWeight = 1.2,
  alignmentWeight = 0.9,
  cohesionWeight = 0.5,
  wiggle = 0.7,
  bounce = 0.86,
  color = '#55aaff',
  shape = 'arrow',
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
  const colorHuesRef = useRef([]);

  const count = React.useMemo(() => {
    let n = Number(numFish);
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    if (n < 1) n = 1;
    if (n > 5000) n = 5000;
    return n;
  }, [numFish]);

  // fish geometry: arrow-like or slim triangle
  const geometry = useMemo(() => {
    const s = Math.max(1e-5, fishSize);
    const g = new THREE.BufferGeometry();
    if (shape === 'slim') {
      // slim triangle pointing +X
      const positions = new Float32Array([
        -s, -s * 0.25, 0,
        -s,  s * 0.25, 0,
         s,  0,         0,
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.computeVertexNormals();
      return g;
    } else {
      // small arrow: body + little fin notch
      const positions = new Float32Array([
        // triangle main
        -s * 0.8, -s * 0.35, 0,
        -s * 0.8,  s * 0.35, 0,
         s,        0,         0,
        // small tail notch (extra triangle)
        -s * 0.8, -s * 0.35, 0,
        -s * 0.4,  0,         0,
        -s * 0.8,  s * 0.35, 0,
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.computeVertexNormals();
      return g;
    }
  }, [fishSize, shape]);

  // material: simple additive-ish to feel watery
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    m.depthTest = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [color]);

  // initialize arrays
  React.useEffect(() => {
    const positions = new Array(count);
    const velocities = new Array(count);
    const phases = new Array(count);
    const hues = new Array(count);
    for (let i = 0; i < count; i++) {
      // place uniformly in the box
      const x = (Math.random() * 2 - 1) * (halfWidth - fishSize * 0.5);
      const y = (Math.random() * 2 - 1) * (halfHeight - fishSize * 0.5);
      positions[i] = new THREE.Vector2(x, y);

      // initial heading biased mostly rightwards with variation
      const ang = (Math.random() - 0.2) * Math.PI * 2;
      const mag = (0.6 + Math.random() * 0.8) * speed;
      velocities[i] = new THREE.Vector2(Math.cos(ang) * mag, Math.sin(ang) * mag);

      phases[i] = Math.random() * Math.PI * 2;

      // slight hue variation around base color (convert base color to hue)
      const c = new THREE.Color(color);
      const hsl = {};
      c.getHSL(hsl);
      // random small hue offset
      hues[i] = (hsl.h + (Math.random() - 0.5) * 0.08 + 1) % 1;
    }
    positionsRef.current = positions;
    velocitiesRef.current = velocities;
    phasesRef.current = phases;
    colorHuesRef.current = hues;
  }, [count, halfWidth, halfHeight, fishSize, speed, color]);

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
    const hues = colorHuesRef.current;
    if (!positions || !velocities) return;

    const left = -halfWidth + fishSize * 0.5;
    const right = halfWidth - fishSize * 0.5;
    const bottom = -halfHeight + fishSize * 0.5;
    const top = halfHeight - fishSize * 0.5;

    const n = positions.length;
    const neighR = Math.max(1e-4, neighborRadius);
    const neighR2 = neighR * neighR;

    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const v = velocities[i];

      // reset accumulators
      let cnt = 0;
      cohesionVec.set(0, 0);
      alignmentVec.set(0, 0);
      separationVec.set(0, 0);

      // naive neighbor search
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

      // minor wandering to keep things lively
      steer.x += (Math.random() * 2 - 1) * 0.015;
      steer.y += (Math.random() * 2 - 1) * 0.015;

      // apply limited turning
      tmpV2.copy(steer).multiplyScalar(delta * turnSpeed);
      v.add(tmpV2);

      // clamp speed within reasonable bounds while relaxing towards "speed"
      const vmag = Math.max(1e-6, v.length());
      const maxSpeed = Math.max(0.0001, speed * 1.9);
      if (vmag > maxSpeed) {
        v.multiplyScalar(maxSpeed / vmag);
      } else {
        // slight push toward nominal speed so faster or slower fish reconverge
        const push = Math.max(0, speed - v.length()) * 0.06;
        if (push > 0) v.addScaledVector(v.clone().normalize(), push);
      }

      // integrate
      p.x += v.x * delta;
      p.y += v.y * delta;

      // Bounce logic: perfectly reflect position across border and invert velocity with damping (bounce)
      // X axis
      if (p.x < left) {
        // compute penetration and reflect inside
        p.x = left + (left - p.x);
        v.x = -v.x * bounce;
        // add a small random spin to y velocity to avoid stuck straight lines
        v.y += (Math.random() - 0.5) * speed * 0.25;
      } else if (p.x > right) {
        p.x = right - (p.x - right);
        v.x = -v.x * bounce;
        v.y += (Math.random() - 0.5) * speed * 0.25;
      }
      // Y axis
      if (p.y < bottom) {
        p.y = bottom + (bottom - p.y);
        v.y = -v.y * bounce;
        v.x += (Math.random() - 0.5) * speed * 0.25;
      } else if (p.y > top) {
        p.y = top - (p.y - top);
        v.y = -v.y * bounce;
        v.x += (Math.random() - 0.5) * speed * 0.25;
      }

      // keep speed within maximum after bounce
      const vlen = Math.max(1e-6, v.length());
      if (vlen > speed * 2) v.multiplyScalar((speed * 2) / vlen);

      // tail wiggle phase update (speed influences wiggle frequency)
      phases[i] += delta * (1 + (v.length() / Math.max(1e-6, speed)) * 0.9);

      // rotation aligned with velocity + wiggle offset
      const angle = Math.atan2(v.y, v.x);
      const wig = Math.sin(phases[i]) * wiggle * 0.18;
      dummy.position.set(p.x, p.y, 0);
      dummy.rotation.set(0, 0, angle + wig);

      // scale fish; faster fish elongate slightly
      const elong = Math.min(1.8, 0.7 + v.length() / Math.max(1e-6, speed));
      dummy.scale.set(elong, 0.7, 1.0);

      dummy.updateMatrix();
      instancedRef.current.setMatrixAt(i, dummy.matrix);

      // Optional per-instance color variation (applied via material.color for simplicity by alternating opacity)
      // We'll slightly vary opacity so the school looks more organic
      const baseOpacity = 0.85 + Math.sin(phases[i]) * 0.05;
      // Setting instance opacity directly isn't supported on MeshBasicMaterial, but we can emulate
      // variety by setting renderOrder and letting overlapping additive blending produce mood.
      // (If per-instance color is desired, a custom shader/material would be needed.)
    }

    instancedRef.current.instanceMatrix.needsUpdate = true;
  });

  return React.createElement('instancedMesh', { ref: instancedRef, args: [geometry, material, count], renderOrder: 9999 });
}
