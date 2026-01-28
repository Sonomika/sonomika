// sonomika source - Equirectangular 360 version
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Micro Swimmers 360',
  description:
    'Equirectangular version of Micro Swimmers for seamless 360 video. Particles swim on a sphere with proper wrapping at edges.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
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
    { name: 'sizeVariation', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.05 },
    { name: 'poleAvoidance', type: 'number', value: 0.7, min: 0.0, max: 1.0, step: 0.05 },
    { name: 'colour', type: 'color', value: '#aaffdd' },
  ],
};

const SHAPE_TYPES = 20;
const PI = Math.PI;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

// Spherical distance approximation for small angles
const sphericalDistance = (lon1, lat1, lon2, lat2) => {
  // Handle longitude wrapping
  let dLon = lon2 - lon1;
  if (dLon > PI) dLon -= TWO_PI;
  if (dLon < -PI) dLon += TWO_PI;
  
  const dLat = lat2 - lat1;
  
  // Approximate distance on sphere (good for small distances)
  const cosLat = Math.cos((lat1 + lat2) * 0.5);
  return Math.sqrt(dLon * dLon * cosLat * cosLat + dLat * dLat);
};

// Convert spherical to equirectangular screen coordinates
const sphericalToEquirect = (lon, lat, halfWidth, halfHeight) => {
  // lon: -PI to PI maps to -halfWidth to halfWidth
  // lat: -HALF_PI to HALF_PI maps to -halfHeight to halfHeight
  const x = (lon / PI) * halfWidth;
  const y = (lat / HALF_PI) * halfHeight;
  return { x, y };
};

// Wrap longitude to [-PI, PI]
const wrapLon = (lon) => {
  while (lon > PI) lon -= TWO_PI;
  while (lon < -PI) lon += TWO_PI;
  return lon;
};

// Clamp latitude to [-HALF_PI, HALF_PI] with reflection
const clampLat = (lat, velLat) => {
  if (lat > HALF_PI) {
    lat = PI - lat;
    return { lat, flip: true };
  }
  if (lat < -HALF_PI) {
    lat = -PI - lat;
    return { lat, flip: true };
  }
  return { lat, flip: false };
};

export default function MicroSwimmers360({
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
  sizeVariation = 0.35,
  poleAvoidance = 0.7,
  colour = '#aaffdd',
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect =
    size && size.width > 0 && size.height > 0 ? size.width / size.height : 2.0;

  // For equirectangular, we expect 2:1 aspect ratio
  const halfHeight = 1.0;
  const halfWidth = aspect * halfHeight;

  // Spherical coordinates: lon (-PI to PI), lat (-HALF_PI to HALF_PI)
  const positionsRef = useRef([]); // { lon, lat }
  const velocitiesRef = useRef([]); // { vLon, vLat } in radians/sec
  const phasesRef = useRef([]);
  const baseSizesRef = useRef([]);
  const shapeIndexRef = useRef([]);
  const indexInShapeRef = useRef([]);

  const shapeMeshRefs = useRef([]);

  const count = React.useMemo(() => {
    let n = Number(numSwimmers);
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    if (n < 1) n = 1;
    if (n > 6000) n = 6000;
    return n;
  }, [numSwimmers]);

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

      // Initialize in spherical coordinates
      // Distribute more uniformly on sphere using cosine-weighted latitude
      const lon = (Math.random() * 2 - 1) * PI; // -PI to PI
      // Use asin distribution for uniform spherical coverage
      const lat = Math.asin(Math.random() * 2 - 1); // Uniform on sphere
      positions[i] = { lon, lat };

      // Velocity in radians per second
      const ang = Math.random() * TWO_PI;
      const mag = speed * 0.3 * (0.5 + Math.random() * 0.8);
      velocities[i] = {
        vLon: Math.cos(ang) * mag,
        vLat: Math.sin(ang) * mag,
      };

      phases[i] = Math.random() * TWO_PI;

      const sVar = 1.0 + (Math.random() * 2 - 1) * sizeVariation;
      baseSizes[i] = Math.max(0.3, sVar);
    }

    positionsRef.current = positions;
    velocitiesRef.current = velocities;
    phasesRef.current = phases;
    baseSizesRef.current = baseSizes;
    shapeIndexRef.current = shapeIndices;
    indexInShapeRef.current = indexInShape;
  }, [count, speed, sizeVariation, shapeCounts]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    const meshes = shapeMeshRefs.current;
    if (!meshes || meshes.length === 0) return;

    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;
    const phases = phasesRef.current;
    const baseSizes = baseSizesRef.current;
    const shapeIndices = shapeIndexRef.current;
    const indexInShape = indexInShapeRef.current;

    if (!positions || !velocities || !phases || !baseSizes || !shapeIndices || !indexInShape) {
      return;
    }

    const n = positions.length;
    const t = state.clock.getElapsedTime?.() ?? 0;

    // Convert neighbor radius to approximate spherical radius
    const neighR = Math.max(1e-4, neighborRadius) * 0.5;
    const neighR2 = neighR * neighR;

    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const v = velocities[i];
      const baseSize = baseSizes[i];

      let steerLon = 0;
      let steerLat = 0;
      let cohesionLon = 0;
      let cohesionLat = 0;
      let alignLon = 0;
      let alignLat = 0;
      let sepLon = 0;
      let sepLat = 0;
      let cnt = 0;

      // Boids behavior in spherical coords
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const pj = positions[j];
        
        const d = sphericalDistance(p.lon, p.lat, pj.lon, pj.lat);
        const d2 = d * d;
        
        if (d2 <= neighR2) {
          cnt++;
          
          // Cohesion - average position
          // Handle longitude wrapping for averaging
          let dLon = pj.lon - p.lon;
          if (dLon > PI) dLon -= TWO_PI;
          if (dLon < -PI) dLon += TWO_PI;
          cohesionLon += dLon;
          cohesionLat += pj.lat - p.lat;

          // Alignment - average velocity
          alignLon += velocities[j].vLon;
          alignLat += velocities[j].vLat;

          // Separation - move away
          if (d > 1e-6) {
            let sepDLon = p.lon - pj.lon;
            if (sepDLon > PI) sepDLon -= TWO_PI;
            if (sepDLon < -PI) sepDLon += TWO_PI;
            sepLon += sepDLon / (d + 1e-6);
            sepLat += (p.lat - pj.lat) / (d + 1e-6);
          }
        }
      }

      if (cnt > 0) {
        const invCnt = 1 / cnt;

        // Cohesion
        cohesionLon *= invCnt * cohesionWeight * 0.5;
        cohesionLat *= invCnt * cohesionWeight * 0.5;

        // Alignment
        alignLon *= invCnt;
        alignLat *= invCnt;
        const alignLen = Math.sqrt(alignLon * alignLon + alignLat * alignLat) || 1e-6;
        alignLon = (alignLon / alignLen) * alignmentWeight * 0.3;
        alignLat = (alignLat / alignLen) * alignmentWeight * 0.3;

        // Separation
        sepLon *= invCnt;
        sepLat *= invCnt;
        const sepLen = Math.sqrt(sepLon * sepLon + sepLat * sepLat) || 1e-6;
        sepLon = (sepLon / sepLen) * separationWeight * 0.3;
        sepLat = (sepLat / sepLen) * separationWeight * 0.3;

        steerLon += cohesionLon + alignLon + sepLon;
        steerLat += cohesionLat + alignLat + sepLat;
      }

      // Flow field in spherical coordinates
      if (flowStrength > 0) {
        const flowLon = Math.sin(p.lat * 3 + t * 0.4) * flowStrength * 0.1;
        const flowLat = Math.cos(p.lon * 2 - t * 0.3) * flowStrength * 0.05;
        steerLon += flowLon;
        steerLat += flowLat;
      }

      // Wiggle
      if (wiggleStrength > 0) {
        const wigPhase = phases[i];
        const vLen = Math.sqrt(v.vLon * v.vLon + v.vLat * v.vLat) || 1e-6;
        const nLon = v.vLon / vLen;
        const nLat = v.vLat / vLen;
        // Perpendicular direction
        const pLon = -nLat;
        const pLat = nLon;

        const wig = Math.sin(t * wiggleFrequency + wigPhase) * wiggleStrength * 0.05 * speed;
        steerLon += pLon * wig;
        steerLat += pLat * wig;

        phases[i] = wigPhase + delta * wiggleFrequency * 0.2;
      }

      // Pole avoidance - push away from poles
      if (poleAvoidance > 0) {
        const poleThreshold = HALF_PI * 0.85;
        if (Math.abs(p.lat) > poleThreshold) {
          const dir = p.lat > 0 ? -1 : 1;
          const poleFactor = poleAvoidance * ((Math.abs(p.lat) - poleThreshold) / (HALF_PI - poleThreshold));
          steerLat += dir * poleFactor * speed * 0.5;
        }
      }

      // Apply steering
      v.vLon += steerLon * delta;
      v.vLat += steerLat * delta;

      // Drag
      v.vLon *= 1 - drag * delta;
      v.vLat *= 1 - drag * delta;

      // Speed limiting
      const vmag = Math.sqrt(v.vLon * v.vLon + v.vLat * v.vLat) || 1e-6;
      const targetSpeed = speed * 0.3;
      const maxSpeed = targetSpeed * 1.8;
      if (vmag > maxSpeed) {
        const scale = maxSpeed / vmag;
        v.vLon *= scale;
        v.vLat *= scale;
      } else {
        const boost = (targetSpeed - vmag) * 0.4;
        if (boost > 0) {
          v.vLon += (v.vLon / vmag) * boost * delta;
          v.vLat += (v.vLat / vmag) * boost * delta;
        }
      }

      // Account for latitude affecting longitude speed (narrower at poles)
      const cosLat = Math.cos(p.lat);
      const lonSpeed = cosLat > 0.01 ? v.vLon / cosLat : v.vLon;

      // Update position
      p.lon += lonSpeed * delta;
      p.lat += v.vLat * delta;

      // Wrap longitude
      p.lon = wrapLon(p.lon);

      // Handle latitude bounds (reflect at poles)
      const latResult = clampLat(p.lat, v.vLat);
      p.lat = latResult.lat;
      if (latResult.flip) {
        v.vLat = -v.vLat;
        p.lon = wrapLon(p.lon + PI); // Flip to other side of sphere
      }

      // Convert to equirectangular coordinates for rendering
      const screen = sphericalToEquirect(p.lon, p.lat, halfWidth, halfHeight);

      // Calculate angle from velocity
      const screenVx = v.vLon * (halfWidth / PI);
      const screenVy = v.vLat * (halfHeight / HALF_PI);
      const angle = Math.atan2(screenVy, screenVx);

      dummy.position.set(screen.x, screen.y, 0);
      dummy.rotation.set(0, 0, angle);

      // Scale compensation for equirectangular distortion
      // Particles near poles appear stretched horizontally, so we counteract
      const latDistortion = Math.max(0.3, Math.cos(p.lat));

      let lengthScale = bodySize * baseSize * (0.9 + Math.min(2.0, vmag / Math.max(0.0001, targetSpeed)) * 0.8);
      let widthScale = bodySize * baseSize * 0.6;

      // Apply distortion compensation
      lengthScale *= latDistortion;

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
