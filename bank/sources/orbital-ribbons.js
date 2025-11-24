// sonomika template (original effect: Orbital Ribbons)
// Neon ribbon-like particle orbits with connecting lines and BPM-reactive pulsing.

const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo, useState } = React || {};

export const metadata = {
  name: 'Orbital Ribbons',
  description: 'Neon ribbon-like orbits: particles follow elliptical paths with connecting lines. Pulses to BPM and adjustable parameters.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'color', type: 'color', value: '#00aaff' },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'ribbons', type: 'number', value: 6, min: 1, max: 16, step: 1 },
    { name: 'particlesPerRibbon', type: 'number', value: 24, min: 6, max: 128, step: 1 },
    { name: 'baseRadius', type: 'number', value: 2.5, min: 0.2, max: 8.0, step: 0.1 },
    { name: 'thickness', type: 'number', value: 0.04, min: 0.01, max: 0.4, step: 0.01 },
    { name: 'intensity', type: 'number', value: 1.2, min: 0.1, max: 3.0, step: 0.1 }
  ]
};

export default function OrbitalRibbonsSource({
  color = '#00aaff', speed = 1.0, ribbons = 6, particlesPerRibbon = 24, baseRadius = 2.5, thickness = 0.04, intensity = 1.2
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  // create a soft circular sprite texture (radial gradient)
  const spriteTex = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,size,size);
    const t = new THREE.CanvasTexture(canvas);
    t.needsUpdate = true;
    return t;
  }, []);

  // build ribbon descriptors
  const ribbonsDesc = useMemo(() => {
    const arr = [];
    for (let i = 0; i < ribbons; i++) {
      const radius = baseRadius * (0.6 + 0.8 * (i / Math.max(1, ribbons - 1))); // spread radii
      const tilt = (Math.random() - 0.5) * 0.6; // some tilt variation
      const speedMul = 0.6 + Math.random() * 1.6;
      const phase = Math.random() * Math.PI * 2;
      const eccentricity = 0.3 * Math.random(); // make ellipse when > 0
      // initial angles for particles in this ribbon
      const angles = Array.from({ length: particlesPerRibbon }, (_, j) => (j / particlesPerRibbon) * Math.PI * 2 + Math.random() * 0.1);
      arr.push({ id: i, radius, tilt, speedMul, phase, eccentricity, angles });
    }
    return arr;
  }, [ribbons, particlesPerRibbon, baseRadius]);

  // refs for particle meshes and line objects
  const particleRefs = useRef([]); particleRefs.current = [];
  const lineRefs = useRef([]);
  // prepare line geometries once
  const lineGeoms = useMemo(() => {
    return ribbonsDesc.map((r) => {
      const positions = new Float32Array((particlesPerRibbon + 1) * 3); // close loop
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      return geom;
    });
  }, [ribbonsDesc, particlesPerRibbon]);

  // materials (memoized)
  const particleMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    map: spriteTex,
    color: new THREE.Color(color),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  }), [spriteTex, color]);

  const lineMaterials = useMemo(() => {
    return ribbonsDesc.map(() => new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      linewidth: 2
    }));
  }, [ribbonsDesc, color]);

  // helper to register refs
  const pushParticleRef = (r) => { if (r) particleRefs.current.push(r); };
  const pushLineRef = (r, i) => { if (r) lineRefs.current[i] = r; };

  // frame update: move particles along orbital paths and update connecting lines
  useFrame((state) => {
    const bpm = (globalThis && globalThis.VJ_BPM) || 120;
    const beat = state.clock.elapsedTime * (bpm / 60) * speed;
    const pulse = (0.6 + 0.4 * Math.sin(beat * Math.PI * 2)) * intensity; // rhythmic multiplier
    // iterate ribbons
    let meshIndex = 0;
    for (let ri = 0; ri < ribbonsDesc.length; ri++) {
      const r = ribbonsDesc[ri];
      const geom = lineGeoms[ri];
      const posArr = geom.getAttribute('position').array;
      const tilt = r.tilt;
      const ec = r.eccentricity;
      const localSpeed = r.speedMul * speed;
      // advance angles and set particle positions
      for (let pi = 0; pi < r.angles.length; pi++) {
        r.angles[pi] += 0.002 * localSpeed; // base angular advance
        const a = r.angles[pi] + r.phase + beat * 0.2 * r.speedMul;
        // ellipse: x = cos(a) * radius, y = sin(a) * radius*(1-ec)
        const x = Math.cos(a) * r.radius;
        const y = Math.sin(a) * r.radius * (1 - ec);
        // apply tilt rotation around X axis
        const z = Math.sin(tilt) * y;
        const yTilted = Math.cos(tilt) * y;
        // small per-particle wobble
        const wob = Math.sin(a * 3 + r.phase) * 0.03 * intensity;
        const px = x + wob * 0.6;
        const py = yTilted * 1.0 + Math.cos(a * 1.5 + r.phase) * 0.02 * intensity;
        const pz = z + Math.cos(a * 2.5 + r.phase) * 0.02 * intensity;
        // update corresponding mesh
        const mesh = particleRefs.current[meshIndex];
        if (mesh) {
          mesh.position.set(px, py, pz);
          // face camera
          mesh.lookAt(state.camera.position);
          // scale by pulse and thickness (also slight per-particle jitter)
          const s = thickness * 50 * pulse * (0.6 + 0.8 * Math.abs(Math.sin(a + ri)));
          mesh.scale.set(s, s, s);
          // subtle rotation for shimmer
          mesh.rotation.z += 0.01 * (0.5 + Math.sin(a + ri) * 0.5);
          mesh.material.opacity = Math.max(0.12, Math.min(1.0, 0.25 * pulse + Math.abs(Math.sin(a * 2 + r.phase)) * 0.6));
        }
        // write into line geometry positions
        const idx = pi * 3;
        posArr[idx] = px;
        posArr[idx + 1] = py;
        posArr[idx + 2] = pz;
        meshIndex++;
      }
      // close loop for line geometry
      posArr[(r.angles.length) * 3 + 0] = posArr[0];
      posArr[(r.angles.length) * 3 + 1] = posArr[1];
      posArr[(r.angles.length) * 3 + 2] = posArr[2];
      geom.getAttribute('position').needsUpdate = true;
      // update line material opacity to pulse with beat and ribbon index offset
      const lm = lineMaterials[ri];
      if (lm) {
        lm.opacity = Math.max(0.05, Math.min(0.8, 0.25 * pulse + 0.35 * Math.abs(Math.sin(beat * 1.5 + ri))));
      }
    }
  });

  // build React elements: particles and lines
  const particleElements = [];
  for (let ri = 0; ri < ribbonsDesc.length; ri++) {
    const r = ribbonsDesc[ri];
    for (let pi = 0; pi < r.angles.length; pi++) {
      // each particle is a plane mesh with sprite material
      particleElements.push(
        React.createElement('mesh', {
          key: `p-${ri}-${pi}`,
          ref: pushParticleRef,
          position: [0, 0, 0],
        },
          React.createElement('planeGeometry', { args: [1, 1] }),
          React.createElement('meshBasicMaterial', {
            map: spriteTex,
            color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        )
      );
    }
  }

  const lineElements = lineGeoms.map((geom, i) => {
    return React.createElement('primitive', {
      key: `l-${i}`,
      object: new THREE.Line(geom, lineMaterials[i]),
      ref: (r) => pushLineRef(r, i)
    });
  });

  // subtle central halo
  const ring = React.createElement('mesh', { position: [0, 0, 0] },
    React.createElement('ringGeometry', { args: [baseRadius * 0.12, baseRadius * 0.14, 32] }),
    React.createElement('meshBasicMaterial', { color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false })
  );

  return React.createElement('group', null, ...particleElements, ...lineElements, ring);
}