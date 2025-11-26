// sonomika template (original effect)
// Helical Letter Stream
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Helical Letter Stream',
  description: 'Letters flow along a rotating helix. Adjustable radius, twist, speed and color. Renders as textured sprites.',
  category: 'Sources',
  author: 'VJ (original)',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'text', type: 'string', value: 'HELIX VJ' },
    { name: 'count', type: 'number', value: 48, min: 1, max: 300, step: 1 },
    { name: 'radius', type: 'number', value: 0.8, min: 0.05, max: 3.0, step: 0.01 },
    { name: 'twist', type: 'number', value: 3.5, min: 0.1, max: 12.0, step: 0.1 }, // turns along the helix
    { name: 'pitch', type: 'number', value: 1.2, min: 0.0, max: 4.0, step: 0.01 }, // vertical spread multiplier
    { name: 'rotationSpeed', type: 'number', value: 0.6, min: -4.0, max: 4.0, step: 0.01 },
    { name: 'flowSpeed', type: 'number', value: 0.25, min: -2.0, max: 2.0, step: 0.01 }, // how fast letters travel along helix
    { name: 'size', type: 'number', value: 0.18, min: 0.02, max: 1.0, step: 0.01 },
    { name: 'color', type: 'color', value: '#ff88cc' },
    { name: 'hueJitter', type: 'number', value: 0.12, min: 0.0, max: 0.6, step: 0.01 },
    { name: 'randomSeed', type: 'number', value: 0, min: 0, max: 999999, step: 1 },
    { name: 'depth', type: 'number', value: 1.2, min: 0.1, max: 4.0, step: 0.01 },
  ],
};

export default function HelicalLetterStream({
  text = 'HELIX VJ',
  count = 48,
  radius = 0.8,
  twist = 3.5,
  pitch = 1.2,
  rotationSpeed = 0.6,
  flowSpeed = 0.25,
  size = 0.18,
  color = '#ff88cc',
  hueJitter = 0.12,
  randomSeed = 0,
  depth = 1.2,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const groupRef = useRef(null);

  const { size: viewSize } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = (viewSize.width > 0 && viewSize.height > 0) ? (viewSize.width / viewSize.height) : (16 / 9);
  // standardized viewing bounds (similar to example)
  const halfW = (aspect * 2) / 2;
  const halfH = 2 / 2;

  // stable RNG (optional seed)
  const rng = useMemo(() => {
    if (!randomSeed) return Math.random;
    let s = (randomSeed >>> 0) || 1;
    return () => {
      // xorshift32
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 0xffff) / 0xffff;
    };
  }, [randomSeed]);

  // helper to create letter texture
  const createLetterTexture = useMemo(() => {
    return (char, col, glow = 0.18) => {
      const sizePx = 256;
      const canvas = document.createElement('canvas');
      canvas.width = sizePx;
      canvas.height = sizePx;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, sizePx, sizePx);

      // subtle radial glow
      const grd = ctx.createRadialGradient(sizePx / 2, sizePx / 2, sizePx * 0.05, sizePx / 2, sizePx / 2, sizePx * 0.6);
      const rgba = (c, a) => `rgba(${Math.floor(c.r * 255)},${Math.floor(c.g * 255)},${Math.floor(c.b * 255)},${a})`;
      grd.addColorStop(0, rgba(col, glow));
      grd.addColorStop(1, rgba(col, 0.0));
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, sizePx, sizePx);

      // letter
      ctx.font = `bold ${sizePx * 0.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgb(${Math.floor(col.r * 255)},${Math.floor(col.g * 255)},${Math.floor(col.b * 255)})`;
      ctx.fillText(char, sizePx / 2, sizePx / 2 + sizePx * 0.02);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      return tex;
    };
  }, []);

  // prepare characters and per-letter initial parameters
  const letters = useMemo(() => {
    const chars = (text && text.length > 0) ? text.split('') : ['H'];
    const n = Math.max(1, Math.min(count, 500));
    const arr = new Array(n);
    for (let i = 0; i < n; i++) {
      const ch = chars[i % chars.length];
      // assign a normalized t along the helix [0..1)
      const t0 = i / n;
      // small radius jitter
      const rj = (rng() * 2 - 1) * (radius * 0.15);
      // initial angle offset
      const angle = rng() * Math.PI * 2;
      // per-letter hue variation
      const baseColor = new THREE.Color().setStyle(color || '#ffffff');
      const hsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);
      const newH = (hsl.h + (rng() * 2 - 1) * hueJitter + 1) % 1;
      const col = new THREE.Color().setHSL(newH, Math.min(1, hsl.s + 0.05), Math.min(1, hsl.l + 0.0));
      arr[i] = {
        ch,
        t: t0, // travel param along helix
        angle,
        radiusJitter: rj,
        baseColor: col,
        spin: (rng() * 2 - 1) * 0.5, // small additional spin
      };
    }
    return arr;
  }, [text, count, radius, color, hueJitter, rng]);

  // create sprites (textures + materials)
  const sprites = useMemo(() => {
    const out = [];
    for (let i = 0; i < letters.length; i++) {
      const L = letters[i];
      const tex = createLetterTexture(L.ch, L.baseColor, 0.22 + (rng() * 0.12));
      if (!tex) continue;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.95,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(size, size, 1);
      out.push({ sprite, texture: tex, material: mat });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letters, size, createLetterTexture]);

  // add sprites to group and cleanup textures/materials on unmount
  useEffect(() => {
    if (!groupRef.current) return;
    sprites.forEach((entry) => {
      const s = entry.sprite;
      if (!groupRef.current.children.includes(s)) groupRef.current.add(s);
    });
    return () => {
      sprites.forEach((entry) => {
        const s = entry.sprite;
        try {
          if (entry.texture) entry.texture.dispose();
          if (entry.material) entry.material.dispose();
        } catch (e) {
          // ignore disposal errors
        }
        if (groupRef.current && groupRef.current.children.includes(s)) {
          groupRef.current.remove(s);
        }
      });
    };
  }, [sprites]);

  // simulation / animation loop
  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    // helix parameters
    const n = letters.length;
    // vertical span scaled by pitch and visible height
    const vSpan = Math.max(0.0001, depth) * pitch;
    // twist -> total revolutions along the helix
    const totalTurns = Math.max(0.0001, twist);
    // for each letter, advance its t and compute pos
    for (let i = 0; i < n; i++) {
      const L = letters[i];
      const entry = sprites[i];
      if (!entry) continue;
      // advance along helix
      L.t += flowSpeed * dt;
      // wrap in [0,1)
      if (L.t >= 1) L.t -= Math.floor(L.t);
      if (L.t < 0) L.t += Math.ceil(-L.t);

      // rotational advancement
      L.angle += (rotationSpeed + L.spin) * dt;

      // compute helix coordinate: angle determined by t * totalTurns + base angle
      const theta = (L.t * totalTurns * Math.PI * 2) + L.angle;
      const r = Math.max(0.001, radius + L.radiusJitter);

      // position in 3D: x,z around circle, y vertical across the span (centered)
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const y = (L.t * 2 - 1) * vSpan * 0.5; // y in [-vSpan/2, vSpan/2]

      // perspective-ish scale: items nearer the camera (positive z) scale larger
      // We'll map z from [-radius..radius] to scale factor [0.6..1.3]
      const zFactor = THREE.MathUtils.clamp((z / (radius + Math.abs(L.radiusJitter))) * 0.5 + 0.5, 0.0, 1.0);
      const scale = size * (0.7 + zFactor * 1.2);

      // opacity fades near ends of helix to create depth looping
      const fade = THREE.MathUtils.clamp(1.0 - Math.abs(L.t - 0.5) * 2.0, 0.05, 1.0);

      // update sprite
      entry.sprite.position.set(
        THREE.MathUtils.clamp(x, -halfW + 0.01, halfW - 0.01),
        THREE.MathUtils.clamp(y, -halfH + 0.01, halfH - 0.01),
        z // z space, may be behind or in front
      );
      entry.sprite.scale.setScalar(scale);

      // subtle pulsing opacity and tint
      if (entry.material) {
        entry.material.opacity = THREE.MathUtils.lerp(entry.material.opacity, 0.45 + fade * 0.55, Math.min(1, dt * 6.0));
        // tint modulation (slight)
        const base = L.baseColor;
        const mod = 0.85 + Math.sin((L.t * Math.PI * 2) + (i * 0.13)) * 0.15;
        entry.material.color.setRGB(base.r * mod, base.g * mod, base.b * mod);
      }
    }
  });

  return React.createElement('group', { ref: groupRef });
}
