// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef } = React || {};

export const metadata = {
  name: 'Spinning Galaxy',
  description: 'Soft instanced particles arranged in spiral arms, spinning with thickness, twinkle and abstract motion.',
  category: 'Sources',
  author: 'VJ',
  version: '1.1.1',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numParticles', type: 'number', value: 1200, min: 10, max: 2000, step: 10 },
    { name: 'cellSize', type: 'number', value: 0.02, min: 0.002, max: 0.12, step: 0.001 },
    { name: 'arms', type: 'number', value: 3, min: 1, max: 8, step: 1 },
    { name: 'spinSpeed', type: 'number', value: 0.6, min: -5.0, max: 5.0, step: 0.01 },
    { name: 'radius', type: 'number', value: 1.2, min: 0.1, max: 3.0, step: 0.01 },
    { name: 'randomness', type: 'number', value: 0.35, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'tightness', type: 'number', value: 2.5, min: 0.0, max: 10.0, step: 0.01 },
    { name: 'thickness', type: 'number', value: 0.12, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'twinkle', type: 'number', value: 0.25, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'twinkleSpeed', type: 'number', value: 2.0, min: 0.0, max: 10.0, step: 0.01 },
    { name: 'color', type: 'color', value: '#99ddff' },
    { name: 'shape', type: 'select', value: 'circle', options: ['circle','square'] },
  ],
};

export default function SpinningGalaxy({
  numParticles = 1200,
  cellSize = 0.02,
  arms = 3,
  spinSpeed = 0.6,
  radius = 1.2,
  randomness = 0.35,
  tightness = 2.5,
  thickness = 0.12,
  twinkle = 0.25,
  twinkleSpeed = 2.0,
  color = '#99ddff',
  shape = 'circle',
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = (size.width > 0 && size.height > 0) ? size.width / size.height : 16 / 9;
  const halfWidth = (aspect * 2) / 2;
  const halfHeight = 2 / 2;
  // maximum usable radius for galaxy (fit to viewport)
  const maxRadius = Math.min(halfWidth, halfHeight, radius);

  const instancedRef = useRef(null);
  const particlesRef = useRef([]);
  const timeRef = useRef(0);

  const count = React.useMemo(() => {
    let n = Number(numParticles);
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    if (n < 1) n = 1;
    // enforce a hard maximum of 2000 particles
    if (n > 2000) n = 2000;
    return n;
  }, [numParticles]);

  // Base unit geometry: a plane (we scale each instance)
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Create a soft circular sprite texture via canvas (used for circle and also for soft square)
  const spriteTexture = useMemo(() => {
    const sizePx = 128;
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');

    // background transparent
    ctx.clearRect(0, 0, sizePx, sizePx);

    // radial gradient for soft glow
    const grd = ctx.createRadialGradient(
      sizePx / 2, sizePx / 2, 0,
      sizePx / 2, sizePx / 2, sizePx / 2
    );

    // bright center, fading to transparent
    grd.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1.0, 'rgba(255,255,255,0.0)');

    if (shape === 'circle') {
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(sizePx / 2, sizePx / 2, sizePx / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // square but soft edges using same gradient and a rounded rectangle mask
      ctx.fillStyle = grd;
      const pad = sizePx * 0.06;
      const r = sizePx * 0.12;
      const x = pad, y = pad, w = sizePx - pad * 2, h = sizePx - pad * 2;
      // rounded rect
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  }, [shape]);

  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      map: spriteTexture,
      transparent: true,
    });
    m.depthTest = false;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [color, spriteTexture]);

  // Initialize particle base parameters (radius, baseAngle, armOffset, radial jitter, scale, z jitter, twinkle phase)
  React.useEffect(() => {
    const parts = new Array(count);
    // seedable randomness could be added later; for now use Math.random
    for (let i = 0; i < count; i++) {
      // radius bias: more dense toward center
      const r = Math.pow(Math.random(), 0.8) * maxRadius;
      // base angle around circle
      const baseAngle = Math.random() * Math.PI * 2;
      // assign to an arm (0..arms-1)
      const armIndex = Math.floor(Math.random() * Math.max(1, Math.floor(arms)));
      // arm angle offset (so arms are evenly spaced)
      const armOffset = (armIndex / Math.max(1, arms)) * Math.PI * 2;
      // along-arm twist (tightness controls how tightly arms wrap)
      const along = r * tightness;
      // radial and angular jitter
      const radialJitter = (Math.random() - 0.5) * randomness * (0.5 + Math.random()) * (maxRadius * 0.25);
      const angularJitter = (Math.random() - 0.5) * randomness * 2.0;
      // z thickness jitter (thin disc)
      const zJitter = (Math.random() - 0.5) * thickness;
      // per-particle scale multiplier
      const scale = 0.5 + Math.random() * 1.6;
      // twinkle phase for offsetting sin oscillations
      const twPhase = Math.random() * Math.PI * 2;
      // a speed factor so inner particles rotate a bit faster than outer ones
      const innerFactor = 1.0 + (1.0 - (r / Math.max(0.0001, maxRadius))) * 2.0;
      // small rotational offset so particles don't all align
      const rotOffset = Math.random() * Math.PI * 2;

      parts[i] = {
        baseRadius: Math.max(0.0001, r + radialJitter),
        baseAngle: baseAngle + armOffset + along + angularJitter,
        arm: armIndex,
        scale,
        innerFactor,
        rotOffset,
        zJitter,
        twPhase,
      };
    }
    particlesRef.current = parts;
  }, [count, maxRadius, arms, randomness, tightness, thickness]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!instancedRef.current) return;
    timeRef.current += delta;
    const t = timeRef.current;
    const parts = particlesRef.current;
    // Update each particle by computing its current angle from baseAngle + spin contribution
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      // spin contribution scaled by spinSpeed and innerFactor (inner rotate faster)
      const spinContribution = spinSpeed * t * (p.innerFactor * 0.4 + 0.6);
      // add a subtle oscillatory wobble for abstract motion
      const wobble = Math.sin(t * 0.5 + p.twPhase) * (randomness * 0.02);
      const angle = p.baseAngle + spinContribution + wobble;
      const x = Math.cos(angle) * p.baseRadius;
      const y = Math.sin(angle) * p.baseRadius;
      // slight radial breathing/pulse for abstract feel
      const pulse = 1.0 + Math.sin(t * 0.6 + p.twPhase) * 0.02 * (p.baseRadius / Math.max(0.0001, maxRadius));
      dummy.position.set(x * pulse, y * pulse, p.zJitter);
      // rotation: make each sprite face rotation around local orientation for variety
      dummy.rotation.z = angle + p.rotOffset * 0.5;

      // per-instance scale oscillation (twinkle)
      const tw = 1.0 + Math.sin(t * twinkleSpeed + p.twPhase) * twinkle * 0.6;
      const s = cellSize * p.scale * tw;
      dummy.scale.set(s, s, s);

      dummy.updateMatrix();
      instancedRef.current.setMatrixAt(i, dummy.matrix);
    }
    instancedRef.current.instanceMatrix.needsUpdate = true;
  });

  return React.createElement('instancedMesh', { ref: instancedRef, args: [geometry, material, count], renderOrder: 9998 });
}
