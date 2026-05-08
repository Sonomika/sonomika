// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Pulse Orb Paint Brush (PULSE)',
  description: 'An animated pulse-driven brush paints translucent beads, spray, and hatching strokes across the canvas.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'pulse', type: 'button', value: 0, description: 'Pulse Direction' },
    { name: 'clear', type: 'button', value: 0, description: 'Clear Paint' },
    { name: 'speed', type: 'number', value: 1.05, min: 0.1, max: 5.0, step: 0.01 },
    { name: 'drift', type: 'number', value: 0.24, min: 0.0, max: 1.5, step: 0.01 },
    { name: 'damping', type: 'number', value: 0.91, min: 0.65, max: 0.995, step: 0.001 },
    { name: 'brushSize', type: 'number', value: 42, min: 4, max: 180, step: 1 },
    { name: 'paintOpacity', type: 'number', value: 0.22, min: 0.02, max: 1, step: 0.01 },
    { name: 'spray', type: 'number', value: 0.45, min: 0, max: 1, step: 0.01 },
    { name: 'hatching', type: 'number', value: 0.32, min: 0, max: 1, step: 0.01 },
    { name: 'rainbowShift', type: 'number', value: 0.18, min: 0, max: 1, step: 0.01 },
    { name: 'fade', type: 'number', value: 0.006, min: 0, max: 0.08, step: 0.001 },
    { name: 'bounds', type: 'number', value: 0.86, min: 0.2, max: 1.4, step: 0.01 },
    { name: 'keepInCanvas', type: 'boolean', value: true, description: 'Keep In Canvas' },
    { name: 'cameraOrbit', type: 'number', value: 0.32, min: 0, max: 2, step: 0.01 },
    { name: 'paintDepth', type: 'number', value: 0.38, min: 0, max: 1.2, step: 0.01 },
    { name: 'depthLayers', type: 'number', value: 5, min: 1, max: 9, step: 1 },
    { name: 'baseColor', type: 'color', value: '#28d8ff' },
    { name: 'accentColor', type: 'color', value: '#ff6ad5' },
    { name: 'hotColor', type: 'color', value: '#ffffff' },
  ],
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;

function safeColor(value, fallback) {
  try {
    return new THREE.Color(value || fallback);
  } catch (_) {
    return new THREE.Color(fallback);
  }
}

function colorToRgba(color, alpha) {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${clamp(alpha, 0, 1)})`;
}

function randomUnitVector() {
  const z = rand(-0.35, 0.35);
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0.0001, 1 - z * z));
  return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z).normalize();
}

const PAINT_STATE_CACHE = (() => {
  try {
    const root = globalThis;
    root.__SONOMIKA_PULSE_PAINT_STATE__ = root.__SONOMIKA_PULSE_PAINT_STATE__ || new Map();
    return root.__SONOMIKA_PULSE_PAINT_STATE__;
  } catch (_) {
    return new Map();
  }
})();

function getPersistentPaintState(key) {
  const stateKey = String(key || 'default');
  let state = PAINT_STATE_CACHE.get(stateKey);
  if (!state) {
    state = {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0.42, 0.22, 0.05),
      previousPixel: null,
      marks: [],
      hatches: [],
      seed: Math.random() * 1000,
      lastPulse: 0,
      lastClear: 0,
      huePhase: Math.random(),
    };
    PAINT_STATE_CACHE.set(stateKey, state);
  }
  return state;
}

export default function PulseOrbPaintBrush({
  pulse = 0,
  clear = 0,
  speed = 1.05,
  drift = 0.24,
  damping = 0.91,
  brushSize = 42,
  paintOpacity = 0.22,
  spray = 0.45,
  hatching = 0.32,
  rainbowShift = 0.18,
  fade = 0.006,
  bounds = 0.86,
  keepInCanvas = true,
  cameraOrbit = 0.32,
  paintDepth = 0.38,
  depthLayers = 5,
  baseColor = '#28d8ff',
  accentColor = '#ff6ad5',
  hotColor = '#ffffff',
  compositionWidth,
  compositionHeight,
  __layerId,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const groupRef = useRef(null);
  const paintRef = useRef(null);
  const hatchRef = useRef(null);
  const brushOrbRef = useRef(null);
  const persistentStateRef = useRef(getPersistentPaintState(__layerId || 'unassigned'));
  const positionRef = useRef(persistentStateRef.current.position);
  const velocityRef = useRef(persistentStateRef.current.velocity);
  const lastPulseRef = useRef(Number.isFinite(Number(persistentStateRef.current.lastPulse)) ? Number(persistentStateRef.current.lastPulse) : (Number(pulse) || 0));
  const lastClearRef = useRef(Number.isFinite(Number(persistentStateRef.current.lastClear)) ? Number(persistentStateRef.current.lastClear) : (Number(clear) || 0));
  const seedRef = useRef(persistentStateRef.current.seed);
  const previousPixelRef = useRef(persistentStateRef.current.previousPixel);
  const marksRef = useRef(persistentStateRef.current.marks || []);
  const hatchesRef = useRef(persistentStateRef.current.hatches || []);
  const huePhaseRef = useRef(persistentStateRef.current.huePhase || 0);

  const effectiveW = Math.max(1, Number(compositionWidth) || 1920);
  const effectiveH = Math.max(1, Number(compositionHeight) || 1080);
  const aspect = effectiveW / effectiveH;

  const canvasInfo = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = effectiveW;
    canvas.height = effectiveH;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return { canvas, ctx, texture };
  }, [effectiveW, effectiveH]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(aspect * 2, 2), [aspect]);
  const orbGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 24, 12), []);
  const hatchGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 0.018), []);
  const layerMaterials = useMemo(() => {
    return Array.from({ length: 9 }, (_, index) => {
      const mat = new THREE.MeshBasicMaterial({
        map: canvasInfo.texture,
        transparent: true,
        opacity: index === 4 ? 0.92 : 0.22,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      mat.blending = THREE.AdditiveBlending;
      return mat;
    });
  }, [canvasInfo.texture]);
  const orbMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    mat.blending = THREE.AdditiveBlending;
    return mat;
  }, []);
  const paintMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.88,
      vertexColors: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    mat.blending = THREE.AdditiveBlending;
    return mat;
  }, []);
  const hatchMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.78,
      vertexColors: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    mat.blending = THREE.AdditiveBlending;
    return mat;
  }, []);

  const baseC = useMemo(() => safeColor(baseColor, '#28d8ff'), [baseColor]);
  const accentC = useMemo(() => safeColor(accentColor, '#ff6ad5'), [accentColor]);
  const hotC = useMemo(() => safeColor(hotColor, '#ffffff'), [hotColor]);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const instanceColor = useMemo(() => new THREE.Color(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => () => {
    try { geometry.dispose(); } catch (_) {}
    try { orbGeometry.dispose(); } catch (_) {}
    try { hatchGeometry.dispose(); } catch (_) {}
    try { layerMaterials.forEach((mat) => mat.dispose()); } catch (_) {}
    try { orbMaterial.dispose(); } catch (_) {}
    try { paintMaterial.dispose(); } catch (_) {}
    try { hatchMaterial.dispose(); } catch (_) {}
    try { canvasInfo.texture.dispose(); } catch (_) {}
  }, [geometry, orbGeometry, hatchGeometry, layerMaterials, orbMaterial, paintMaterial, hatchMaterial, canvasInfo.texture]);

  const clearCanvas = () => {
    const ctx = canvasInfo.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasInfo.canvas.width, canvasInfo.canvas.height);
    canvasInfo.texture.needsUpdate = true;
    previousPixelRef.current = null;
    marksRef.current = [];
    hatchesRef.current = [];
    persistentStateRef.current.previousPixel = null;
    persistentStateRef.current.marks = marksRef.current;
    persistentStateRef.current.hatches = hatchesRef.current;
  };

  const applyPulse = () => {
    const dir = randomUnitVector();
    const impulse = Math.max(0.01, Number(speed) || 1.05);
    velocityRef.current.copy(dir.multiplyScalar(impulse));
    seedRef.current = Math.random() * 1000;
    huePhaseRef.current = (huePhaseRef.current + 0.173 + Math.random() * 0.19) % 1;
    persistentStateRef.current.seed = seedRef.current;
    persistentStateRef.current.huePhase = huePhaseRef.current;
  };

  useEffect(() => {
    const next = Number(pulse) || 0;
    if (next !== lastPulseRef.current) {
      lastPulseRef.current = next;
      persistentStateRef.current.lastPulse = next;
      applyPulse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  useEffect(() => {
    const next = Number(clear) || 0;
    if (next !== lastClearRef.current) {
      lastClearRef.current = next;
      persistentStateRef.current.lastClear = next;
      clearCanvas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear]);

  useFrame((state, delta) => {
    const ctx = canvasInfo.ctx;
    const group = groupRef.current;
    const brushOrb = brushOrbRef.current;
    const paintMesh = paintRef.current;
    const hatchMesh = hatchRef.current;
    if (!ctx || !group) return;

    const dt = clamp(delta || 0.016, 0, 0.08);
    const t = state && state.clock ? state.clock.elapsedTime : Date.now() * 0.001;
    const pos = positionRef.current;
    const vel = velocityRef.current;
    const limit = Math.max(0.05, Number(bounds) || 0.86);
    const brush = Math.max(1, Number(brushSize) || 42);
    const opacity = clamp(Number(paintOpacity) || 0.22, 0.02, 1);
    const sprayAmt = clamp(Number(spray) || 0, 0, 1);
    const hatchAmt = clamp(Number(hatching) || 0, 0, 1);
    const rainbowAmt = clamp(Number(rainbowShift) || 0, 0, 1);
    const fadeAmt = clamp(Number(fade) || 0, 0, 0.08);
    const driftAmt = Math.max(0, Number(drift) || 0);
    const damp = clamp(Number(damping) || 0.91, 0.65, 0.995);
    const orbit = clamp(Number(cameraOrbit) || 0, 0, 2);
    const depth = clamp(Number(paintDepth) || 0, 0, 1.2);

    group.rotation.y = Math.sin(t * 0.38 * orbit + seedRef.current * 0.01) * 0.42 * orbit;
    group.rotation.x = Math.cos(t * 0.31 * orbit + seedRef.current * 0.013) * 0.18 * orbit;
    group.rotation.z = Math.sin(t * 0.19 * orbit) * 0.045 * orbit;

    vel.x += Math.sin(t * 0.72 + seedRef.current) * driftAmt * dt * 0.18;
    vel.y += Math.cos(t * 0.61 + seedRef.current * 0.7) * driftAmt * dt * 0.18;
    vel.z += Math.sin(t * 0.49 + seedRef.current * 1.3) * driftAmt * dt * 0.08;

    pos.addScaledVector(vel, dt);
    vel.multiplyScalar(Math.pow(damp, dt * 60));

    const maxX = limit * aspect;
    if (pos.x > maxX || pos.x < -maxX) {
      pos.x = clamp(pos.x, -maxX, maxX);
      vel.x *= -0.82;
    }
    if (pos.y > limit || pos.y < -limit) {
      pos.y = clamp(pos.y, -limit, limit);
      vel.y *= -0.82;
    }
    pos.z = clamp(pos.z, -1, 1);

    const depthNorm = (pos.z + 1) * 0.5;
    const parallax = 0.82 + depthNorm * 0.34;
    let screenX = pos.x * parallax;
    let screenY = pos.y * parallax + pos.z * 0.08;
    const screenRadiusX = (brush / effectiveH) * aspect * 0.5;
    const screenRadiusY = (brush / effectiveH) * 0.5;

    if (keepInCanvas) {
      const clampedX = clamp(screenX, -aspect + screenRadiusX, aspect - screenRadiusX);
      const clampedY = clamp(screenY, -1 + screenRadiusY, 1 - screenRadiusY);
      if (clampedX !== screenX) {
        screenX = clampedX;
        pos.x = screenX / Math.max(0.001, parallax);
        vel.x *= -0.82;
      }
      if (clampedY !== screenY) {
        screenY = clampedY;
        pos.y = (screenY - pos.z * 0.08) / Math.max(0.001, parallax);
        vel.y *= -0.82;
      }
    }

    const x = (screenX / aspect * 0.5 + 0.5) * effectiveW;
    const y = (0.5 - screenY * 0.5) * effectiveH;
    const prev = previousPixelRef.current || { x, y };
    const dx = x - prev.x;
    const dy = y - prev.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const lerps = Math.max(2, Math.min(36, Math.ceil(distance / Math.max(2, brush * 0.18))));
    const speedScale = clamp(distance / Math.max(1, brush * 1.8), 0, 2.5);

    tempColor.copy(baseC).lerp(accentC, (Math.sin(t * 0.7 + huePhaseRef.current * Math.PI * 2) * 0.5 + 0.5) * rainbowAmt);
    tempColor.lerp(hotC, Math.min(0.45, speedScale * 0.18));
    if (brushOrb) {
      const orbScale = Math.max(0.015, (brush / effectiveH) * (0.85 + depthNorm * 0.45));
      brushOrb.position.set(screenX, screenY, depth * (depthNorm - 0.5) + 0.12);
      brushOrb.scale.set(orbScale * aspect, orbScale, orbScale);
      brushOrb.material.color.copy(tempColor).lerp(hotC, 0.45);
      brushOrb.material.opacity = 0.35 + opacity * 0.55;
    }

    if (fadeAmt > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${fadeAmt})`;
      ctx.fillRect(0, 0, effectiveW, effectiveH);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < lerps; i++) {
      const u = i / Math.max(1, lerps - 1);
      const px = lerp(prev.x, x, u);
      const py = lerp(prev.y, y, u);
      const wobble = Math.sin((t + u) * 8.0 + seedRef.current) * brush * 0.12;
      const beadSize = Math.max(2, brush * (0.55 + speedScale * 0.22 + Math.sin(u * Math.PI) * 0.18));

      const gradient = ctx.createRadialGradient(px + wobble, py - wobble, beadSize * 0.08, px, py, beadSize * 0.55);
      gradient.addColorStop(0, colorToRgba(hotC, opacity * 0.78));
      gradient.addColorStop(0.42, colorToRgba(tempColor, opacity));
      gradient.addColorStop(1, colorToRgba(tempColor, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, beadSize * 0.55, 0, Math.PI * 2);
      ctx.fill();
      marksRef.current.unshift({
        x: lerp(prev.x, x, u) / effectiveW,
        y: lerp(prev.y, y, u) / effectiveH,
        z: depth * (depthNorm - 0.5) + (u - 0.5) * depth * 0.08,
        size: beadSize / effectiveH,
        color: tempColor.clone(),
        alpha: opacity,
      });

      const sprayCount = Math.floor((8 + speedScale * 12) * sprayAmt);
      ctx.fillStyle = colorToRgba(tempColor, opacity * 0.45);
      for (let j = 0; j < sprayCount; j++) {
        const r = beadSize * (0.35 + Math.random() * 0.9);
        const a = Math.random() * Math.PI * 2;
        const sx = px + Math.cos(a) * r * Math.random();
        const sy = py + Math.sin(a) * r * Math.random();
        const dot = Math.max(0.5, brush * (0.012 + Math.random() * 0.035));
        ctx.globalAlpha = 0.28 + Math.random() * 0.55;
        ctx.beginPath();
        ctx.arc(sx, sy, dot, 0, Math.PI * 2);
        ctx.fill();
        if (j % 3 === 0) {
          marksRef.current.unshift({
            x: sx / effectiveW,
            y: sy / effectiveH,
            z: depth * (depthNorm - 0.5) + rand(-depth, depth) * 0.12,
            size: Math.max(0.002, dot / effectiveH),
            color: tempColor.clone(),
            alpha: opacity * 0.7,
          });
        }
      }
      ctx.globalAlpha = 1;

      if (hatchAmt > 0.001 && (i % 2 === 0 || hatchAmt > 0.7)) {
        const hatchLength = beadSize * (0.45 + speedScale * 0.42) * hatchAmt;
        const normal = angle + Math.PI * 0.5 + Math.sin(t * 2 + i) * 0.35;
        ctx.strokeStyle = colorToRgba(accentC, opacity * hatchAmt * 0.75);
        ctx.lineWidth = Math.max(0.5, brush * 0.018);
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(normal) * hatchLength, py - Math.sin(normal) * hatchLength);
        ctx.lineTo(px + Math.cos(normal) * hatchLength, py + Math.sin(normal) * hatchLength);
        ctx.stroke();
        hatchesRef.current.unshift({
          x: px / effectiveW,
          y: py / effectiveH,
          z: depth * (depthNorm - 0.5) + rand(-depth, depth) * 0.08,
          length: hatchLength / effectiveH,
          thickness: Math.max(0.002, brush * 0.018 / effectiveH),
          angle: -normal,
          color: accentC.clone(),
          alpha: opacity * hatchAmt,
        });
      }
    }

    ctx.restore();
    const maxMarks = 1200;
    const maxHatches = 360;
    marksRef.current = marksRef.current.slice(0, maxMarks);
    hatchesRef.current = hatchesRef.current.slice(0, maxHatches);
    persistentStateRef.current.marks = marksRef.current;
    persistentStateRef.current.hatches = hatchesRef.current;

    if (paintMesh) {
      const marks = marksRef.current;
      for (let i = 0; i < maxMarks; i++) {
        const mark = marks[i];
        if (!mark) {
          dummy.position.set(9999, 9999, 0);
          dummy.scale.set(0.0001, 0.0001, 0.0001);
          dummy.updateMatrix();
          paintMesh.setMatrixAt(i, dummy.matrix);
          instanceColor.setRGB(0, 0, 0);
          paintMesh.setColorAt(i, instanceColor);
          continue;
        }
        const n = i / Math.max(1, maxMarks - 1);
        const fadeMark = Math.pow(1 - n, 0.8);
        dummy.position.set((mark.x - 0.5) * aspect * 2, (0.5 - mark.y) * 2, mark.z);
        dummy.scale.set(mark.size * aspect * (0.8 + fadeMark * 0.45), mark.size * (0.8 + fadeMark * 0.45), mark.size * 0.45);
        dummy.updateMatrix();
        paintMesh.setMatrixAt(i, dummy.matrix);
        instanceColor.copy(mark.color).multiplyScalar(fadeMark * (0.55 + mark.alpha));
        paintMesh.setColorAt(i, instanceColor);
      }
      paintMesh.count = maxMarks;
      paintMesh.instanceMatrix.needsUpdate = true;
      if (paintMesh.instanceColor) paintMesh.instanceColor.needsUpdate = true;
    }

    if (hatchMesh) {
      const hatches = hatchesRef.current;
      for (let i = 0; i < maxHatches; i++) {
        const hatch = hatches[i];
        if (!hatch) {
          dummy.position.set(9999, 9999, 0);
          dummy.scale.set(0.0001, 0.0001, 0.0001);
          dummy.updateMatrix();
          hatchMesh.setMatrixAt(i, dummy.matrix);
          instanceColor.setRGB(0, 0, 0);
          hatchMesh.setColorAt(i, instanceColor);
          continue;
        }
        const n = i / Math.max(1, maxHatches - 1);
        const fadeHatch = Math.pow(1 - n, 0.9);
        dummy.position.set((hatch.x - 0.5) * aspect * 2, (0.5 - hatch.y) * 2, hatch.z);
        dummy.rotation.set(0, 0, hatch.angle);
        dummy.scale.set(hatch.length * aspect, hatch.thickness, 1);
        dummy.updateMatrix();
        hatchMesh.setMatrixAt(i, dummy.matrix);
        instanceColor.copy(hatch.color).multiplyScalar(fadeHatch * (0.45 + hatch.alpha));
        hatchMesh.setColorAt(i, instanceColor);
      }
      hatchMesh.count = maxHatches;
      hatchMesh.instanceMatrix.needsUpdate = true;
      if (hatchMesh.instanceColor) hatchMesh.instanceColor.needsUpdate = true;
    }

    canvasInfo.texture.needsUpdate = true;
    previousPixelRef.current = { x, y };
    persistentStateRef.current.previousPixel = previousPixelRef.current;
  });

  return React.createElement(
    'group',
    { ref: groupRef, renderOrder: 9900 },
    React.createElement('instancedMesh', {
      ref: paintRef,
      args: [orbGeometry, paintMaterial, 1200],
      renderOrder: 9900,
    }),
    React.createElement('instancedMesh', {
      ref: hatchRef,
      args: [hatchGeometry, hatchMaterial, 360],
      renderOrder: 9910,
    }),
    React.createElement(
      'mesh',
      { ref: brushOrbRef, renderOrder: 9960 },
      React.createElement('primitive', { object: orbGeometry, attach: 'geometry' }),
      React.createElement('primitive', { object: orbMaterial, attach: 'material' })
    )
  );
}
