const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Video Melody Tracker (MIDI)',
  description: 'Tracks the strongest color or brightness area in the layer underneath and turns its motion into quantized musical MIDI notes.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track; white uses brightness' },
    { name: 'threshold', type: 'number', value: 0.58, min: 0, max: 1, step: 0.01, description: 'Minimum detection strength' },
    { name: 'sensitivity', type: 'number', value: 2.0, min: 0.1, max: 4.0, step: 0.1, description: 'Color/brightness gain before tracking' },
    { name: 'smooth', type: 'number', value: 0.72, min: 0, max: 0.98, step: 0.01, description: 'Tracker smoothing' },
    { name: 'analyzeSize', type: 'number', value: 72, min: 16, max: 160, step: 1, description: 'Tracking resolution' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM' },
    { name: 'manualBpm', type: 'number', value: 90, min: 1, max: 220, step: 1, description: 'BPM when sync is off' },
    { name: 'stepsPerBeat', type: 'number', value: 2, min: 1, max: 8, step: 1, description: 'Rhythmic note rate' },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 14, min: 4, max: 32, step: 1, description: 'Number of scale steps from bottom to top' },
    { name: 'noteLength', type: 'number', value: 0.28, min: 0.03, max: 4, step: 0.01, description: 'MIDI note duration in seconds' },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2.0, step: 0.05, description: 'Velocity multiplier' },
    { name: 'avoidRepeats', type: 'boolean', value: false, description: 'Do not repeat the same note until the tracker moves' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI notes to the selected output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
    { name: 'showOverlay', type: 'boolean', value: true, description: 'Show tracker, note label, and pulse rings' },
    { name: 'crosshairWidth', type: 'number', value: 2, min: 1, max: 24, step: 1, description: 'Crosshair line width in pixels' },
    { name: 'overlayColor', type: 'color', value: '#ffffff', description: 'Tracker overlay color' },
  ],
};

const OWNER_SLOT = '__VJ_VIDEO_MELODY_TRACKER_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_VIDEO_MELODY_TRACKER_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 40;

const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  hirajoshi: [0, 2, 3, 7, 8],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

function parseColor(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!result) return null;
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

function isWhiteTarget(color) {
  return !color || (color.r > 0.985 && color.g > 0.985 && color.b > 0.985);
}

function scorePixel(buf, idx, targetColor) {
  const r = buf[idx] / 255;
  const g = buf[idx + 1] / 255;
  const b = buf[idx + 2] / 255;
  if (!isWhiteTarget(targetColor)) {
    const dr = r - targetColor.r;
    const dg = g - targetColor.g;
    const db = b - targetColor.b;
    return 1 - (Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3));
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function midiForTrackerY(yNorm, rootMidi, scaleName, rangeSteps) {
  const intervals = SCALES[scaleName] || SCALES.chromatic;
  const topAmount = clamp01(1 - yNorm);
  const degree = Math.max(0, Math.min(Math.max(1, rangeSteps) - 1, Math.round(topAmount * (Math.max(1, rangeSteps) - 1))));
  const octave = Math.floor(degree / intervals.length) * 12;
  const interval = intervals[degree % intervals.length] + octave;
  return Math.max(0, Math.min(127, Math.round(rootMidi + interval)));
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

function findTarget(buf, size, threshold, targetColor) {
  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;
  let bestIdx = -1;
  let bestScore = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = y * size + x;
      const idx = pixel * 4;
      const score = clamp01(scorePixel(buf, idx, targetColor));
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
      if (score < threshold) continue;
      const w = (score - threshold) / Math.max(0.001, 1 - threshold);
      weightSum += w;
      xSum += (x + 0.5) * w;
      ySum += (y + 0.5) * w;
    }
  }

  if (weightSum <= 0 || bestIdx < 0) return null;
  return {
    xNorm: xSum / weightSum / size,
    yNorm: 1 - (ySum / weightSum / size),
    score: bestScore,
  };
}

export default function VideoMelodyTrackerMidi({
  trackColor = '#ffffff',
  threshold = 0.58,
  sensitivity = 2.0,
  smooth = 0.72,
  analyzeSize = 72,
  bpmSync = true,
  manualBpm = 90,
  stepsPerBeat = 2,
  rootMidi = 48,
  noteRange = 14,
  noteLength = 0.28,
  velocityBoost = 1.0,
  avoidRepeats = false,
  sendMidi = true,
  midiChannel = 1,
  showOverlay = true,
  crosshairWidth = 2,
  overlayColor = '#ffffff',
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const groupRef = useRef(null);
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const crosshairGroupRef = useRef(null);
  const crosshairVRef = useRef(null);
  const crosshairHRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const trackerRef = useRef({ x: 0, y: 0, initialized: false, score: 0 });
  const rhythmRef = useRef({ phase: 0, step: -1, lastNote: null, flash: 0 });

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
  const worldPerPixelX = (aspect * 2) / effectiveW;
  const worldPerPixelY = 2 / effectiveH;
  const safeCrosshairWidth = Math.max(1, Math.min(24, Math.round(crosshairWidth || 2)));
  const safeAnalyzeSize = Math.max(16, Math.min(160, Math.floor(analyzeSize || 72)));

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
    const key = `video-melody-tracker-midi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ownerKeyRef.current = key;
    trackerRef.current = { x: 0, y: 0, initialized: false, score: 0 };
    rhythmRef.current = { phase: 0, step: -1, lastNote: null, flash: 0 };
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
  }, []);

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

  const analyzeTarget = useMemo(() => new THREE.WebGLRenderTarget(safeAnalyzeSize, safeAnalyzeSize, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [safeAnalyzeSize]);
  useEffect(() => () => { try { analyzeTarget && analyzeTarget.dispose(); } catch (_) {} }, [analyzeTarget]);

  const blitMaterial = useMemo(() => {
    const vertexShader = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
    const fragmentShader = 'varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uGain; void main(){ vec4 c=texture2D(tDiffuse,vUv); c.rgb=clamp(c.rgb*uGain,0.0,1.0); gl_FragColor=c; }';
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { tDiffuse: { value: null }, uGain: { value: sensitivity } },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }, [sensitivity]);
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
  if (!pixelBufferRef.current || pixelBufferRef.current.length !== safeAnalyzeSize * safeAnalyzeSize * 4) {
    pixelBufferRef.current = new Uint8Array(safeAnalyzeSize * safeAnalyzeSize * 4);
  }

  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    return videoTexture || null;
  };

  const dotMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(overlayColor),
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [overlayColor]);
  useEffect(() => () => { try { dotMaterial && dotMaterial.dispose(); } catch (_) {} }, [dotMaterial]);

  const lineMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(overlayColor),
    transparent: true,
    opacity: 0.34,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [overlayColor]);
  useEffect(() => () => { try { lineMaterial && lineMaterial.dispose(); } catch (_) {} }, [lineMaterial]);

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

  const dotGeometry = useMemo(() => new THREE.CircleGeometry(1, 32), []);
  useEffect(() => () => { try { dotGeometry && dotGeometry.dispose(); } catch (_) {} }, [dotGeometry]);

  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { planeGeometry && planeGeometry.dispose(); } catch (_) {} }, [planeGeometry]);

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
      blitMaterial.uniforms.uGain.value = Math.max(0.1, Math.min(4, sensitivity));
      gl.setRenderTarget(analyzeTarget);
      gl.clear(true, true, true);
      gl.render(blitScene, blitCamera);
    } finally {
      gl.setRenderTarget(prevTarget);
      gl.autoClear = prevAutoClear;
    }

    try {
      gl.readRenderTargetPixels(analyzeTarget, 0, 0, safeAnalyzeSize, safeAnalyzeSize, pixelBufferRef.current);
    } catch (_) {
      return;
    }

    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const target = findTarget(pixelBufferRef.current, safeAnalyzeSize, clamp01(threshold), parseColor(trackColor));
    const tracker = trackerRef.current;

    if (target) {
      const targetX = (target.xNorm - 0.5) * aspect * 2;
      const targetY = (target.yNorm - 0.5) * 2;
      const s = Math.max(0, Math.min(0.98, smooth));
      if (!tracker.initialized) {
        tracker.x = targetX;
        tracker.y = targetY;
        tracker.initialized = true;
      } else {
        tracker.x = tracker.x * s + targetX * (1 - s);
        tracker.y = tracker.y * s + targetY * (1 - s);
      }
      tracker.score = target.score;
    } else {
      tracker.initialized = false;
      tracker.score = 0;
      rhythmRef.current.lastNote = null;
    }

    rhythmRef.current.flash = Math.max(0, rhythmRef.current.flash - dt * 4);
    const isOwner = claimMidiOwnership();

    const visible = !!showOverlay && isOwner && tracker.initialized;
    const centerVisualYOffset = -worldPerPixelY * 2;
    if (crosshairGroupRef.current) {
      crosshairGroupRef.current.visible = visible;
      crosshairGroupRef.current.position.set(tracker.x, tracker.y, 0.15);
    }
    if (dotRef.current) {
      dotRef.current.visible = visible;
      dotRef.current.position.set(0, centerVisualYOffset, 0.05);
      const dotSize = worldPerPixelY * (14 + tracker.score * 8);
      dotRef.current.scale.set(dotSize, dotSize, 1);
      if (dotRef.current.material) dotRef.current.material.opacity = visible ? 0.45 + tracker.score * 0.5 : 0;
    }
    if (crosshairVRef.current) {
      crosshairVRef.current.position.set(0, -tracker.y, 0);
      crosshairVRef.current.scale.set(worldPerPixelX * safeCrosshairWidth, 2, 1);
    }
    if (crosshairHRef.current) {
      crosshairHRef.current.position.set(-tracker.x, 0, 0);
      crosshairHRef.current.scale.set(aspect * 2, worldPerPixelY * safeCrosshairWidth, 1);
    }
    if (ringRef.current) {
      ringRef.current.visible = visible && rhythmRef.current.flash > 0.001;
      ringRef.current.position.set(0, centerVisualYOffset, 0.06);
      const ringSize = worldPerPixelY * (42 + (1 - rhythmRef.current.flash) * 80);
      ringRef.current.scale.set(ringSize, ringSize, 1);
      if (ringRef.current.material) ringRef.current.material.opacity = rhythmRef.current.flash * 0.75;
    }
    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? setBpm : Number(manualBpm || 90));
    const rate = Math.max(1, Math.min(8, Math.floor(stepsPerBeat || 2)));
    rhythmRef.current.phase += dt * (bpm / 60) * rate;
    const rhythmStep = Math.floor(rhythmRef.current.phase);
    if (rhythmStep === rhythmRef.current.step) return;
    rhythmRef.current.step = rhythmStep;

    if (!tracker.initialized || tracker.score < clamp01(threshold)) return;

    const yNorm = 1 - ((tracker.y + 1) / 2);
    const note = midiForTrackerY(yNorm, rootMidi, 'chromatic', Math.max(1, Math.floor(noteRange || 14)));
    if (avoidRepeats && rhythmRef.current.lastNote === note) return;

    if (!isOwner) return;

    rhythmRef.current.lastNote = note;
    rhythmRef.current.flash = 1;

    const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
    if (midi && midi.sendNote && shouldSendMidiEvent(`${ownerKeyRef.current || 'tracker'}:${rhythmStep}:${note}`)) {
      const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
      const durMs = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
      const velocity = clamp01((0.25 + tracker.score * 0.75) * Math.max(0.1, velocityBoost));
      try {
        midi.sendNote(note, velocity, channel, durMs);
      } catch (_) {}
    }
  });

  return React.createElement('group', { ref: groupRef },
    React.createElement('group', { ref: crosshairGroupRef, visible: false, renderOrder: 15 },
      React.createElement('mesh', { ref: crosshairVRef, renderOrder: 15 },
        React.createElement('primitive', { object: planeGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: lineMaterial, attach: 'material' })
      ),
      React.createElement('mesh', { ref: crosshairHRef, renderOrder: 15 },
        React.createElement('primitive', { object: planeGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: lineMaterial, attach: 'material' })
      ),
      React.createElement('mesh', { ref: ringRef, visible: false, renderOrder: 18 },
        React.createElement('primitive', { object: ringGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: ringMaterial, attach: 'material' })
      ),
      React.createElement('mesh', { ref: dotRef, visible: false, renderOrder: 19 },
        React.createElement('primitive', { object: dotGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: dotMaterial, attach: 'material' })
      )
    )
  );
}
