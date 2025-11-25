// sonomika template (cell-shapes variant)
// Orbiting Cell Trails
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Orbiting Cell Trails',
  description: 'Organic cell-like sprites orbit the center and leave fading trails. Each sprite is a procedurally-generated "cell" texture (membrane, nucleus, speckles).',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'count', type: 'number', value: 12, min: 1, max: 300, step: 1 },
    { name: 'orbitRadius', type: 'number', value: 0.9, min: 0.1, max: 3.0, step: 0.05 },
    { name: 'speed', type: 'number', value: 0.6, min: 0.01, max: 4.0, step: 0.01 },
    { name: 'spread', type: 'number', value: 0.25, min: 0.0, max: 1.5, step: 0.01 },
    { name: 'trailLength', type: 'number', value: 18, min: 2, max: 80, step: 1 },
    { name: 'cellSize', type: 'number', value: 0.22, min: 0.05, max: 0.8, step: 0.01 },
    { name: 'baseColor', type: 'color', value: '#66ccff' },
    { name: 'randomSeed', type: 'number', value: 0, min: 0, max: 999999, step: 1 },
    { name: 'zDepth', type: 'number', value: 0.4, min: 0.05, max: 2.0, step: 0.01 },
    { name: 'fade', type: 'number', value: 0.85, min: 0.6, max: 0.99, step: 0.01 }
  ],
};

export default function OrbitingCellTrails({
  count = 12,
  orbitRadius = 0.9,
  speed = 0.6,
  spread = 0.25,
  trailLength = 18,
  cellSize = 0.22,
  baseColor = '#66ccff',
  randomSeed = 0,
  zDepth = 0.4,
  fade = 0.85
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const groupRef = useRef(null);

  // viewport helpers (kept from original to preserve scale expectations)
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = (size.width > 0 && size.height > 0) ? size.width / size.height : 16 / 9;
  const halfW = (aspect * 2) / 2;
  const halfH = 2 / 2;

  // deterministic RNG if seed provided
  const rng = useMemo(() => {
    if (!randomSeed) return Math.random;
    let s = (randomSeed >>> 0) || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 0xffff) / 0xffff;
    };
  }, [randomSeed]);

  // Procedural cell texture generator (cache per variation)
  const createCellTexture = useMemo(() => {
    const cache = new Map();

    // helper: generate an irregular blob path on the canvas
    function drawIrregularBlob(ctx, cx, cy, baseRadius, points, jitter, seedRng) {
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const t = (i / points) * Math.PI * 2;
        const noise = 1 + (seedRng() * 2 - 1) * jitter;
        const r = baseRadius * noise;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    // return function to create a canvas texture for a given index & color
    return (index, color, sizePx = 512) => {
      const key = `${index}:${color.getHexString()}:${sizePx}`;
      if (cache.has(key)) return cache.get(key);

      // create a local RNG for deterministic per-texture variation (so same index -> same shape)
      let localSeed = (index + Math.floor(rng() * 65535)) >>> 0;
      // simple deterministic RNG closure for this texture:
      const seedRng = () => {
        localSeed ^= localSeed << 13;
        localSeed ^= localSeed >>> 17;
        localSeed ^= localSeed << 5;
        return ((localSeed >>> 0) % 0xffff) / 0xffff;
      };

      const canvas = document.createElement('canvas');
      canvas.width = sizePx;
      canvas.height = sizePx;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, sizePx, sizePx);

      const cx = sizePx / 2;
      const cy = sizePx / 2;

      // decide parameters
      const membraneRadius = sizePx * (0.28 + seedRng() * 0.22); // main radius
      const membranePoints = 10 + Math.floor(seedRng() * 16);
      const membraneJitter = 0.12 + seedRng() * 0.28;
      const nucleusRadius = membraneRadius * (0.25 + seedRng() * 0.35);
      const nucleusOffsetAngle = seedRng() * Math.PI * 2;
      const nucleusOffsetDist = membraneRadius * (seedRng() * 0.18);
      const nucleusCx = cx + Math.cos(nucleusOffsetAngle) * nucleusOffsetDist;
      const nucleusCy = cy + Math.sin(nucleusOffsetAngle) * nucleusOffsetDist;

      // background subtle radial vignette
      const outerGrad = ctx.createRadialGradient(cx, cy, sizePx * 0.02, cx, cy, sizePx * 0.7);
      const colRgb = [Math.floor(color.r * 255), Math.floor(color.g * 255), Math.floor(color.b * 255)];
      outerGrad.addColorStop(0, `rgba(${colRgb[0]},${colRgb[1]},${colRgb[2]},0.06)`);
      outerGrad.addColorStop(1, `rgba(0,0,0,0.0)`);
      ctx.fillStyle = outerGrad;
      ctx.fillRect(0, 0, sizePx, sizePx);

      // draw outer membrane (irregular filled blob with inner glow)
      drawIrregularBlob(ctx, cx, cy, membraneRadius, membranePoints, membraneJitter, seedRng);
      // membrane gradient
      const memGrad = ctx.createRadialGradient(cx, cy, membraneRadius * 0.1, cx, cy, membraneRadius * 1.1);
      // shift hue slightly for each element
      const hueShift = (seedRng() * 0.18) - 0.09;
      // generate two tints from base color by converting to HSL quickly (approx by THREE.Color)
      const tmp = new THREE.Color().copy(color).offsetHSL(hueShift, 0.06 + seedRng() * 0.12, 0.02 + seedRng() * 0.08);
      const innerRgb = [Math.floor(tmp.r * 255), Math.floor(tmp.g * 255), Math.floor(tmp.b * 255)];
      const tmp2 = new THREE.Color().copy(color).offsetHSL(hueShift, -0.08 - seedRng() * 0.08, -0.05 - seedRng() * 0.06);
      const outerRgb = [Math.floor(tmp2.r * 255), Math.floor(tmp2.g * 255), Math.floor(tmp2.b * 255)];
      memGrad.addColorStop(0, `rgba(${innerRgb[0]},${innerRgb[1]},${innerRgb[2]},0.95)`);
      memGrad.addColorStop(0.5, `rgba(${innerRgb[0]},${innerRgb[1]},${innerRgb[2]},0.55)`);
      memGrad.addColorStop(1, `rgba(${outerRgb[0]},${outerRgb[1]},${outerRgb[2]},0.06)`);

      ctx.fillStyle = memGrad;
      ctx.fill();

      // membrane subtle stroke
      ctx.lineWidth = Math.max(1, sizePx * 0.008);
      ctx.strokeStyle = `rgba(${outerRgb[0]},${outerRgb[1]},${outerRgb[2]},0.8)`;
      ctx.stroke();

      // inner soft glow (mix mode)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const innerGlow = ctx.createRadialGradient(nucleusCx, nucleusCy, 0, nucleusCx, nucleusCy, membraneRadius * 0.9);
      innerGlow.addColorStop(0, `rgba(${innerRgb[0]},${innerRgb[1]},${innerRgb[2]},0.28)`);
      innerGlow.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = innerGlow;
      ctx.fill();
      ctx.restore();

      // draw nucleus (solid-ish circle with soft edge)
      const nucleusGrad = ctx.createRadialGradient(nucleusCx, nucleusCy, 0, nucleusCx, nucleusCy, nucleusRadius * 1.4);
      const nucColor = new THREE.Color().copy(color).offsetHSL(hueShift * 0.5, -0.15, -0.05);
      const nucRgb = [Math.floor(nucColor.r * 255), Math.floor(nucColor.g * 255), Math.floor(nucColor.b * 255)];
      nucleusGrad.addColorStop(0, `rgba(${nucRgb[0]},${nucRgb[1]},${nucRgb[2]},0.98)`);
      nucleusGrad.addColorStop(0.6, `rgba(${nucRgb[0]},${nucRgb[1]},${nucRgb[2]},0.45)`);
      nucleusGrad.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = nucleusGrad;
      ctx.beginPath();
      ctx.arc(nucleusCx, nucleusCy, nucleusRadius, 0, Math.PI * 2);
      ctx.fill();

      // small speckles / organelles inside the membrane
      const speckles = 8 + Math.floor(seedRng() * 14);
      for (let s = 0; s < speckles; s++) {
        const angle = seedRng() * Math.PI * 2;
        const dist = (seedRng() * 0.6 + 0.1) * membraneRadius;
        const sx = cx + Math.cos(angle) * dist + (seedRng() - 0.5) * membraneRadius * 0.05;
        const sy = cy + Math.sin(angle) * dist + (seedRng() - 0.5) * membraneRadius * 0.05;
        const sr = Math.max(1, membraneRadius * (0.02 + seedRng() * 0.04));
        const speckGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2);
        const speckColor = new THREE.Color().copy(color).offsetHSL(hueShift * 0.8, -0.2, -0.05);
        const spRgb = [Math.floor(speckColor.r * 255), Math.floor(speckColor.g * 255), Math.floor(speckColor.b * 255)];
        speckGrad.addColorStop(0, `rgba(${spRgb[0]},${spRgb[1]},${spRgb[2]},0.9)`);
        speckGrad.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.fillStyle = speckGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      // subtle translucent rim (outer aura)
      const rimGrad = ctx.createRadialGradient(cx, cy, membraneRadius * 0.9, cx, cy, membraneRadius * 1.5);
      rimGrad.addColorStop(0, `rgba(${colRgb[0]},${colRgb[1]},${colRgb[2]},0.06)`);
      rimGrad.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = rimGrad;
      ctx.fillRect(0, 0, sizePx, sizePx);

      // convert to THREE texture
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      cache.set(key, texture);
      return texture;
    };
  }, [rng]);

  // build 'cells' metadata (positions, colors, etc)
  const cells = useMemo(() => {
    const n = Math.max(1, Math.min(count, 600));
    const base = new THREE.Color(baseColor);
    const arr = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const angle = t * Math.PI * 2 + rng() * 0.4;
      const radialJitter = (rng() * 2 - 1) * spread;
      const r = Math.max(0.01, orbitRadius + radialJitter);
      const vz = (rng() * 2 - 1) * zDepth * 0.5;
      const phase = rng() * Math.PI * 2;
      const hueShift = (rng() * 0.25) - 0.125;
      const col = new THREE.Color().copy(base).offsetHSL(hueShift, 0.06 * (rng() - 0.5), 0.02 * (rng() - 0.5));
      arr[i] = {
        index: i,
        angle,
        radius: r,
        vz,
        phase,
        spin: 0.5 + rng() * 1.6,
        color: col
      };
    }
    return arr;
  }, [count, orbitRadius, spread, zDepth, rng, baseColor]);

  // graphics init (one-time) - create sprites + trails
  const spritesRef = useRef([]);
  const trailsRef = useRef([]);
  const initGraphics = useMemo(() => {
    const sArr = [];
    const tArr = [];
    for (let i = 0; i < cells.length; i++) {
      const C = cells[i];
      const tex = createCellTexture(C.index, C.color, 512) || null;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.95,
        toneMapped: false
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(cellSize, cellSize, 1);
      sprite.position.set(0, 0, 0);
      sArr.push(sprite);

      // trail geometry
      const segs = Math.max(2, Math.floor(trailLength));
      const positions = new Float32Array(segs * 3);
      const colors = new Float32Array(segs * 3);
      const theta = C.angle;
      const x = Math.cos(theta) * C.radius;
      const y = Math.sin(theta) * C.radius;
      const z = C.vz;
      for (let k = 0; k < segs; k++) {
        const idx = k * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
        const f = 1 - (k / segs) * (1 - fade);
        colors[idx] = C.color.r * f;
        colors[idx + 1] = C.color.g * f;
        colors[idx + 2] = C.color.b * f;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1.0,
        linewidth: 1,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });
      const line = new THREE.Line(geom, lineMat);
      tArr.push({ line, positions, colors, segs });
    }
    return { sprites: sArr, trails: tArr };
    // create once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally one-time

  useEffect(() => { spritesRef.current = initGraphics.sprites; trailsRef.current = initGraphics.trails; }, [initGraphics]);

  // add to scene and cleanup on unmount
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const sprites = spritesRef.current || [];
    const trails = trailsRef.current || [];
    sprites.forEach(s => { if (!group.children.includes(s)) group.add(s); });
    trails.forEach(t => { if (!group.children.includes(t.line)) group.add(t.line); });

    return () => {
      sprites.forEach(s => {
        if (s.material) {
          if (s.material.map) s.material.map.dispose();
          s.material.dispose();
        }
        if (group && group.children.includes(s)) group.remove(s);
      });
      trails.forEach(t => {
        if (t.line) {
          if (t.line.geometry) t.line.geometry.dispose();
          if (t.line.material) t.line.material.dispose();
          if (group && group.children.includes(t.line)) group.remove(t.line);
        }
      });
    };
  }, []);

  // per-cell runtime state
  const stateRef = useRef(null);
  useEffect(() => {
    const s = cells.map(C => ({
      angle: C.angle,
      radius: C.radius,
      phase: C.phase,
      spin: C.spin,
      vz: C.vz
    }));
    stateRef.current = s;
  }, [cells]);

  // animation loop: same logic as original but applied to cells
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const sprites = spritesRef.current || [];
    const trails = trailsRef.current || [];
    const states = stateRef.current || [];
    const n = Math.min(sprites.length, cells.length, trails.length);
    const now = performance.now() * 0.001;
    for (let i = 0; i < n; i++) {
      const C = cells[i];
      const S = states[i];
      const sprite = sprites[i];
      const trail = trails[i];

      S.angle += (speed * S.spin) * dt * (0.8 + Math.sin(now * 0.5 + S.phase) * 0.4);
      const wob = Math.sin(now * 1.2 * S.spin + S.phase) * (spread * 0.35);
      const r = Math.max(0.01, S.radius + wob);

      const x = Math.cos(S.angle) * r;
      const y = Math.sin(S.angle) * r;
      const z = S.vz + Math.sin(now * 0.6 + S.phase) * (zDepth * 0.2);

      sprite.position.set(x, y, z);
      // gentle pulsing of sprite alpha to look like living cells
      sprite.material.opacity = 0.8 * (0.7 + 0.3 * (0.5 + 0.5 * Math.cos(now * 0.7 + S.phase)));

      // update trail
      const pos = trail.positions;
      const cols = trail.colors;
      const segs = trail.segs;
      for (let k = segs - 1; k >= 1; k--) {
        const dst = k * 3; const src = (k - 1) * 3;
        pos[dst] = pos[src];
        pos[dst + 1] = pos[src + 1];
        pos[dst + 2] = pos[src + 2];
        cols[dst] = cols[src];
        cols[dst + 1] = cols[src + 1];
        cols[dst + 2] = cols[src + 2];
      }
      pos[0] = x; pos[1] = y; pos[2] = z;

      cols[0] = C.color.r;
      cols[1] = C.color.g;
      cols[2] = C.color.b;
      for (let k = 1; k < segs; k++) {
        const idx = k * 3;
        cols[idx] *= fade;
        cols[idx + 1] *= fade;
        cols[idx + 2] *= fade;
      }

      const geometry = trail.line.geometry;
      const posAttr = geometry.getAttribute('position');
      const colAttr = geometry.getAttribute('color');
      posAttr.array.set(pos);
      colAttr.array.set(cols);
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      const dist = Math.sqrt(x * x + y * y);
      const alpha = 0.6 + 0.4 * (1 - Math.min(1, dist / (orbitRadius + spread + 0.001)));
      trail.line.material.opacity = alpha;
    }
  });

  return React.createElement('group', { ref: groupRef });
}
