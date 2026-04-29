const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Video Motion Impulse (MIDI)',
  description: 'Detects motion/change in the video layer underneath and turns the strongest moving lane into MIDI notes.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 12, min: 2, max: 24, step: 1, description: 'Vertical motion lanes' },
    { name: 'analyzeWidth', type: 'number', value: 96, min: 24, max: 192, step: 1, description: 'Motion analysis width' },
    { name: 'analyzeHeight', type: 'number', value: 64, min: 16, max: 128, step: 1, description: 'Motion analysis height' },
    { name: 'motionThreshold', type: 'number', value: 0.08, min: 0.005, max: 0.6, step: 0.005, description: 'Minimum frame-to-frame motion' },
    { name: 'sensitivity', type: 'number', value: 2.4, min: 0.2, max: 8, step: 0.1, description: 'Motion gain' },
    { name: 'decay', type: 'number', value: 0.76, min: 0, max: 0.98, step: 0.01, description: 'Visual lane decay' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM' },
    { name: 'manualBpm', type: 'number', value: 100, min: 1, max: 220, step: 1, description: 'BPM when sync is off' },
    { name: 'notesPerBeat', type: 'number', value: 1, min: 0.25, max: 8, step: 0.25, description: 'MIDI note rate' },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 18, min: 2, max: 48, step: 1, description: 'Chromatic range from bottom to top' },
    { name: 'noteLength', type: 'number', value: 0.16, min: 0.03, max: 4, step: 0.01, description: 'MIDI note duration in seconds' },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2, step: 0.05, description: 'Velocity multiplier' },
    { name: 'avoidRepeats', type: 'boolean', value: false, description: 'Avoid repeating the same lane/note' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI notes to the selected output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
    { name: 'showOverlay', type: 'boolean', value: true, description: 'Show motion lanes and hit pulse' },
    { name: 'lineThickness', type: 'number', value: 2, min: 1, max: 24, step: 1, description: 'Overlay line thickness in pixels' },
    { name: 'overlayColor', type: 'color', value: '#ffffff', description: 'Overlay color' },
  ],
};

const OWNER_SLOT = '__VJ_VIDEO_MOTION_IMPULSE_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_VIDEO_MOTION_IMPULSE_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 35;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

function luminance(buf, idx) {
  return (
    0.2126 * (buf[idx] / 255) +
    0.7152 * (buf[idx + 1] / 255) +
    0.0722 * (buf[idx + 2] / 255)
  );
}

function midiForLane(lane, laneCount, rootMidi, noteRange) {
  const bottomToTop = Math.max(0, laneCount - 1 - lane);
  const maxLane = Math.max(1, laneCount - 1);
  const semitone = Math.round((bottomToTop / maxLane) * Math.max(1, noteRange));
  return Math.max(0, Math.min(127, Math.round(rootMidi + semitone)));
}

function shouldSendMidiEvent(eventKey) {
  try {
    const now = nowMs();
    const store = globalThis[LAST_EVENT_SLOT] || {};
    const lastAt = typeof store[eventKey] === 'number' ? store[eventKey] : -Infinity;
    if ((now - lastAt) < MIN_EVENT_GAP_MS) return false;
    store[eventKey] = now;
    globalThis[LAST_EVENT_SLOT] = store;
    return true;
  } catch (_) {
    return true;
  }
}

function analyzeMotion(curr, prev, width, height, laneCount, sensitivity) {
  const sums = new Float32Array(laneCount);
  const counts = new Uint16Array(laneCount);
  let bestLane = -1;
  let bestScore = 0;

  for (let y = 0; y < height; y++) {
    const lane = Math.max(0, Math.min(laneCount - 1, Math.floor(((height - 1 - y) / height) * laneCount)));
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const diff = Math.abs(luminance(curr, idx) - luminance(prev, idx));
      sums[lane] += clamp01(diff * sensitivity);
      counts[lane]++;
    }
  }

  const scores = new Float32Array(laneCount);
  for (let lane = 0; lane < laneCount; lane++) {
    const score = counts[lane] > 0 ? sums[lane] / counts[lane] : 0;
    scores[lane] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }

  return { scores, bestLane, bestScore };
}

export default function VideoMotionImpulseMidi({
  lanes = 12,
  analyzeWidth = 96,
  analyzeHeight = 64,
  motionThreshold = 0.08,
  sensitivity = 2.4,
  decay = 0.76,
  bpmSync = true,
  manualBpm = 100,
  notesPerBeat = 1,
  rootMidi = 48,
  noteRange = 18,
  noteLength = 0.16,
  velocityBoost = 1.0,
  avoidRepeats = false,
  sendMidi = true,
  midiChannel = 1,
  showOverlay = true,
  lineThickness = 2,
  overlayColor = '#ffffff',
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const groupRef = useRef(null);
  const laneRefs = useRef([]);
  const hitDotRef = useRef(null);
  const hitRingRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const rhythmRef = useRef({ phase: 0, step: -1, lastNote: null, flash: 0, hitLane: -1, hitScore: 0 });
  const laneLevelsRef = useRef([]);
  const previousBufferRef = useRef(null);

  let gl, scene, camera, size;
  try {
    const ctx = useThree();
    if (ctx) {
      gl = ctx.gl;
      scene = ctx.scene;
      camera = ctx.camera;
      size = ctx.size;
    }
  } catch (_) {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);
  const aspect = useMemo(() => effectiveW / effectiveH, [effectiveW, effectiveH]);
  const worldPerPixelY = 2 / effectiveH;
  const laneCount = Math.max(2, Math.min(24, Math.floor(lanes || 12)));
  const bufferWidth = Math.max(24, Math.min(192, Math.floor(analyzeWidth || 96)));
  const bufferHeight = Math.max(16, Math.min(128, Math.floor(analyzeHeight || 64)));
  const safeLineThickness = Math.max(1, Math.min(24, Math.round(lineThickness || 2)));

  const claimMidiOwnership = () => {
    try {
      const now = nowMs();
      const current = globalThis[OWNER_SLOT];
      if (!current || current.key === ownerKeyRef.current || current.expiresAt <= now) {
        globalThis[OWNER_SLOT] = {
          key: ownerKeyRef.current,
          expiresAt: now + OWNER_LEASE_MS,
        };
        return true;
      }
      return current.key === ownerKeyRef.current;
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    const key = `video-motion-impulse-midi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ownerKeyRef.current = key;
    rhythmRef.current = { phase: 0, step: -1, lastNote: null, flash: 0, hitLane: -1, hitScore: 0 };
    laneLevelsRef.current = new Array(laneCount).fill(0);
    previousBufferRef.current = null;
    try {
      if (!globalThis[OWNER_SLOT]) {
        globalThis[OWNER_SLOT] = { key, expiresAt: nowMs() + OWNER_LEASE_MS };
      }
    } catch (_) {}
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, [laneCount, bufferWidth, bufferHeight]);

  useEffect(() => {
    laneRefs.current = new Array(laneCount);
    laneLevelsRef.current = new Array(laneCount).fill(0);
  }, [laneCount]);

  const captureTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { captureTarget && captureTarget.dispose(); } catch (_) {} }, [captureTarget]);

  const analyzeTarget = useMemo(() => new THREE.WebGLRenderTarget(bufferWidth, bufferHeight, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [bufferWidth, bufferHeight]);
  useEffect(() => () => { try { analyzeTarget && analyzeTarget.dispose(); } catch (_) {} }, [analyzeTarget]);

  const blitMaterial = useMemo(() => {
    const vertexShader = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
    const fragmentShader = 'varying vec2 vUv; uniform sampler2D tDiffuse; void main(){ gl_FragColor=texture2D(tDiffuse,vUv); }';
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { tDiffuse: { value: null } },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }, []);
  useEffect(() => () => { try { blitMaterial && blitMaterial.dispose(); } catch (_) {} }, [blitMaterial]);

  const blitScene = useMemo(() => new THREE.Scene(), []);
  const blitCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const blitQuad = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, blitMaterial);
    blitScene.add(mesh);
    return mesh;
  }, [blitMaterial, blitScene]);
  useEffect(() => () => { try { blitQuad.geometry && blitQuad.geometry.dispose(); } catch (_) {} }, [blitQuad]);

  const pixelBufferRef = useRef(null);
  if (!pixelBufferRef.current || pixelBufferRef.current.length !== bufferWidth * bufferHeight * 4) {
    pixelBufferRef.current = new Uint8Array(bufferWidth * bufferHeight * 4);
  }

  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    return videoTexture || null;
  };

  const laneMaterials = useMemo(() => {
    const materials = [];
    for (let i = 0; i < laneCount; i++) {
      materials.push(new THREE.MeshBasicMaterial({
        color: new THREE.Color(overlayColor),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
    }
    return materials;
  }, [laneCount, overlayColor]);
  useEffect(() => () => {
    try {
      for (const material of laneMaterials) {
        try { material && material.dispose(); } catch (_) {}
      }
    } catch (_) {}
  }, [laneMaterials]);

  const dotMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(overlayColor),
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [overlayColor]);
  useEffect(() => () => { try { dotMaterial && dotMaterial.dispose(); } catch (_) {} }, [dotMaterial]);

  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(overlayColor),
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [overlayColor]);
  useEffect(() => () => { try { ringMaterial && ringMaterial.dispose(); } catch (_) {} }, [ringMaterial]);

  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { planeGeometry && planeGeometry.dispose(); } catch (_) {} }, [planeGeometry]);

  const dotGeometry = useMemo(() => new THREE.CircleGeometry(1, 32), []);
  useEffect(() => () => { try { dotGeometry && dotGeometry.dispose(); } catch (_) {} }, [dotGeometry]);

  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.72, 1, 48), []);
  useEffect(() => () => { try { ringGeometry && ringGeometry.dispose(); } catch (_) {} }, [ringGeometry]);

  useFrame((state, delta) => {
    if (!gl) return;

    if (isGlobal && captureTarget && scene && camera && groupRef.current) {
      const prevTarget = gl.getRenderTarget();
      const wasVisible = groupRef.current.visible;
      groupRef.current.visible = false;
      try {
        gl.setRenderTarget(captureTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prevTarget);
        groupRef.current.visible = wasVisible;
      }
    }

    const src = getSourceTexture();
    if (!src) return;

    const prevAutoClear = gl.autoClear;
    const prevTarget = gl.getRenderTarget();
    gl.autoClear = false;
    try {
      blitMaterial.uniforms.tDiffuse.value = src;
      gl.setRenderTarget(analyzeTarget);
      gl.clear(true, true, true);
      gl.render(blitScene, blitCamera);
    } finally {
      gl.setRenderTarget(prevTarget);
      gl.autoClear = prevAutoClear;
    }

    try {
      gl.readRenderTargetPixels(analyzeTarget, 0, 0, bufferWidth, bufferHeight, pixelBufferRef.current);
    } catch (_) {
      return;
    }

    const curr = pixelBufferRef.current;
    if (!previousBufferRef.current || previousBufferRef.current.length !== curr.length) {
      previousBufferRef.current = new Uint8Array(curr);
      return;
    }

    const previous = previousBufferRef.current;
    const motion = analyzeMotion(curr, previous, bufferWidth, bufferHeight, laneCount, Math.max(0.2, sensitivity));
    previous.set(curr);

    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const rhythm = rhythmRef.current;
    const levels = laneLevelsRef.current;
    const visualDecay = Math.max(0, Math.min(0.98, decay));
    const isOwner = claimMidiOwnership();
    const visible = !!showOverlay && isOwner;

    for (let lane = 0; lane < laneCount; lane++) {
      levels[lane] = Math.max(motion.scores[lane] || 0, (levels[lane] || 0) * visualDecay);
      const laneMesh = laneRefs.current[lane];
      if (laneMesh) {
        const laneHeight = 2 / laneCount;
        const y = 1 - laneHeight * (lane + 0.5);
        laneMesh.visible = visible && levels[lane] > 0.002;
        laneMesh.position.set(0, y, 0.15);
        laneMesh.scale.set(aspect * 2 * Math.max(0.02, levels[lane]), Math.max(worldPerPixelY * safeLineThickness, laneHeight * 0.32), 1);
        if (laneMesh.material) laneMesh.material.opacity = Math.min(0.8, 0.12 + levels[lane] * 1.4);
      }
    }

    rhythm.flash = Math.max(0, rhythm.flash - dt * 4);
    if (hitDotRef.current) {
      const hitLane = rhythm.hitLane;
      const laneHeight = 2 / laneCount;
      const y = hitLane >= 0 ? 1 - laneHeight * (hitLane + 0.5) : 0;
      hitDotRef.current.visible = visible && hitLane >= 0 && rhythm.flash > 0.001;
      hitDotRef.current.position.set(0, y, 0.22);
      const dotSize = worldPerPixelY * (14 + rhythm.hitScore * 24);
      hitDotRef.current.scale.set(dotSize, dotSize, 1);
      if (hitDotRef.current.material) hitDotRef.current.material.opacity = rhythm.flash;
    }
    if (hitRingRef.current) {
      const hitLane = rhythm.hitLane;
      const laneHeight = 2 / laneCount;
      const y = hitLane >= 0 ? 1 - laneHeight * (hitLane + 0.5) : 0;
      hitRingRef.current.visible = visible && hitLane >= 0 && rhythm.flash > 0.001;
      hitRingRef.current.position.set(0, y, 0.21);
      const ringSize = worldPerPixelY * (42 + (1 - rhythm.flash) * 110);
      hitRingRef.current.scale.set(ringSize, ringSize, 1);
      if (hitRingRef.current.material) hitRingRef.current.material.opacity = rhythm.flash * 0.7;
    }

    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? setBpm : Number(manualBpm || 100));
    const rate = Math.max(0.25, Math.min(8, Number(notesPerBeat || 1)));
    rhythm.phase += dt * (bpm / 60) * rate;
    const step = Math.floor(rhythm.phase);
    if (step === rhythm.step) return;
    rhythm.step = step;

    const threshold = Math.max(0.005, Math.min(0.6, motionThreshold));
    if (motion.bestLane < 0 || motion.bestScore < threshold) {
      rhythm.lastNote = null;
      return;
    }

    const note = midiForLane(motion.bestLane, laneCount, rootMidi, Math.max(1, Math.floor(noteRange || 18)));
    if (avoidRepeats && rhythm.lastNote === note) return;

    rhythm.lastNote = note;
    rhythm.flash = 1;
    rhythm.hitLane = motion.bestLane;
    rhythm.hitScore = motion.bestScore;

    const midi = (sendMidi && isOwner) ? (globalThis && globalThis.VJ_MIDI) : null;
    if (midi && midi.sendNote && shouldSendMidiEvent(`${ownerKeyRef.current || 'motion'}:${step}:${note}`)) {
      const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
      const durMs = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
      const velocity = clamp01((0.2 + motion.bestScore * 2.2) * Math.max(0.1, velocityBoost));
      try {
        midi.sendNote(note, velocity, channel, durMs);
      } catch (_) {}
    }
  });

  const children = [];
  for (let lane = 0; lane < laneCount; lane++) {
    children.push(
      React.createElement('mesh', {
        key: `motion-lane-${lane}`,
        ref: (r) => { laneRefs.current[lane] = r; },
        visible: false,
        renderOrder: 15,
      },
        React.createElement('primitive', { object: planeGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: laneMaterials[lane], attach: 'material' })
      )
    );
  }

  children.push(
    React.createElement('mesh', { key: 'hit-ring', ref: hitRingRef, visible: false, renderOrder: 18 },
      React.createElement('primitive', { object: ringGeometry, attach: 'geometry' }),
      React.createElement('primitive', { object: ringMaterial, attach: 'material' })
    ),
    React.createElement('mesh', { key: 'hit-dot', ref: hitDotRef, visible: false, renderOrder: 19 },
      React.createElement('primitive', { object: dotGeometry, attach: 'geometry' }),
      React.createElement('primitive', { object: dotMaterial, attach: 'material' })
    )
  );

  return React.createElement('group', { ref: groupRef }, ...children);
}
