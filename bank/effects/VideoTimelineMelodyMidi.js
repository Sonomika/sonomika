const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Video Timeline Melody (MIDI)',
  description: 'A musical timeline scanner: a left-to-right playhead tracks the strongest point in the current video slice and sends quantized MIDI notes.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track; white uses brightness' },
    { name: 'threshold', type: 'number', value: 0.56, min: 0, max: 1, step: 0.01, description: 'Minimum detection strength' },
    { name: 'sensitivity', type: 'number', value: 2.0, min: 0.1, max: 4.0, step: 0.1, description: 'Color/brightness gain before tracking' },
    { name: 'steps', type: 'number', value: 96, min: 16, max: 240, step: 1, description: 'Horizontal timeline resolution' },
    { name: 'rows', type: 'number', value: 32, min: 8, max: 96, step: 1, description: 'Vertical tracking resolution' },
    { name: 'sliceWidth', type: 'number', value: 3, min: 1, max: 12, step: 1, description: 'Columns averaged around the playhead' },
    { name: 'smooth', type: 'number', value: 0.55, min: 0, max: 0.98, step: 0.01, description: 'Target smoothing' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM' },
    { name: 'manualBpm', type: 'number', value: 80, min: 1, max: 220, step: 1, description: 'BPM when sync is off' },
    { name: 'beatsPerSweep', type: 'number', value: 8, min: 1, max: 64, step: 1, description: 'Beats for one left-to-right pass' },
    { name: 'notesPerBeat', type: 'number', value: 1, min: 0.25, max: 4, step: 0.25, description: 'MIDI note rate; 1 = quarter notes' },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 108, step: 1, lockDefault: true },
    { name: 'noteRange', type: 'number', value: 16, min: 4, max: 36, step: 1, description: 'Number of scale steps from bottom to top' },
    { name: 'noteLength', type: 'number', value: 0.22, min: 0.03, max: 4, step: 0.01, description: 'MIDI note duration in seconds' },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2.0, step: 0.05, description: 'Velocity multiplier' },
    { name: 'avoidRepeats', type: 'boolean', value: false, description: 'Do not repeat the same note on adjacent hits' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI notes to the selected output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
    { name: 'showOverlay', type: 'boolean', value: true, description: 'Show playhead, target, and pulse line' },
    { name: 'lineThickness', type: 'number', value: 2, min: 1, max: 24, step: 1, description: 'Overlay line thickness in pixels' },
    { name: 'overlayColor', type: 'color', value: '#ffffff', description: 'Overlay color' },
  ],
};

const OWNER_SLOT = '__VJ_VIDEO_TIMELINE_MELODY_MIDI_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_VIDEO_TIMELINE_MELODY_MIDI_LAST__';
const MIN_EVENT_GAP_MS = 40;

const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
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

function midiForY(yNorm, rootMidi, scaleName, rangeSteps) {
  const intervals = SCALES[scaleName] || SCALES.minorPentatonic;
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

function findBestInSlice(buf, width, height, step, sliceWidth, threshold, targetColor) {
  const half = Math.max(0, Math.floor((sliceWidth - 1) / 2));
  let best = null;

  for (let y = 0; y < height; y++) {
    let totalScore = 0;
    let samples = 0;
    for (let dx = -half; dx <= half; dx++) {
      const x = Math.max(0, Math.min(width - 1, step + dx));
      const idx = (y * width + x) * 4;
      totalScore += clamp01(scorePixel(buf, idx, targetColor));
      samples++;
    }
    const score = samples > 0 ? totalScore / samples : 0;
    if (score < threshold) continue;
    if (!best || score > best.score) {
      best = {
        yNorm: 1 - ((y + 0.5) / height),
        score,
      };
    }
  }

  return best;
}

export default function VideoTimelineMelodyMidi({
  trackColor = '#ffffff',
  threshold = 0.56,
  sensitivity = 2.0,
  steps = 96,
  rows = 32,
  sliceWidth = 3,
  smooth = 0.55,
  bpmSync = true,
  manualBpm = 80,
  beatsPerSweep = 8,
  notesPerBeat = 1,
  rootMidi = 48,
  noteRange = 16,
  noteLength = 0.22,
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
  const overlayGroupRef = useRef(null);
  const playheadRef = useRef(null);
  const pulseLineRef = useRef(null);
  const targetRef = useRef(null);
  const pulseRingRef = useRef(null);
  const ownerKeyRef = useRef(null);
  const timelineRef = useRef({ phase: 0, step: -1, noteStep: -1, lastNote: null, y: 0, initialized: false, score: 0, flash: 0 });

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
  const stepCount = Math.max(16, Math.min(240, Math.floor(steps || 96)));
  const rowCount = Math.max(8, Math.min(96, Math.floor(rows || 32)));
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
    const key = `video-timeline-melody-midi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ownerKeyRef.current = key;
    timelineRef.current = { phase: 0, step: -1, noteStep: -1, lastNote: null, y: 0, initialized: false, score: 0, flash: 0 };
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
    return new THREE.WebGLRenderTarget(stepCount, rowCount, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [isGlobal, stepCount, rowCount]);
  useEffect(() => () => { try { captureTarget && captureTarget.dispose(); } catch (_) {} }, [captureTarget]);

  const analyzeTarget = useMemo(() => new THREE.WebGLRenderTarget(stepCount, rowCount, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  }), [stepCount, rowCount]);
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
  if (!pixelBufferRef.current || pixelBufferRef.current.length !== stepCount * rowCount * 4) {
    pixelBufferRef.current = new Uint8Array(stepCount * rowCount * 4);
  }

  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    return videoTexture || null;
  };

  const lineMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(overlayColor),
    transparent: true,
    opacity: 0.62,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [overlayColor]);
  useEffect(() => () => { try { lineMaterial && lineMaterial.dispose(); } catch (_) {} }, [lineMaterial]);

  const pulseMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(overlayColor),
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [overlayColor]);
  useEffect(() => () => { try { pulseMaterial && pulseMaterial.dispose(); } catch (_) {} }, [pulseMaterial]);

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
      blitMaterial.uniforms.uGain.value = Math.max(0.1, Math.min(4, sensitivity));
      gl.setRenderTarget(analyzeTarget);
      gl.clear(true, true, true);
      gl.render(blitScene, blitCamera);
    } finally {
      gl.setRenderTarget(prevTarget);
      gl.autoClear = prevAutoClear;
    }

    try {
      gl.readRenderTargetPixels(analyzeTarget, 0, 0, stepCount, rowCount, pixelBufferRef.current);
    } catch (_) {
      return;
    }

    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const timeline = timelineRef.current;
    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? setBpm : Number(manualBpm || 80));
    const sweepBeats = Math.max(1, Math.floor(beatsPerSweep || 8));
    const noteRate = Math.max(0.25, Math.min(4, Number(notesPerBeat || 1)));
    timeline.phase = (timeline.phase + dt * (bpm / 60) / sweepBeats) % 1;
    timeline.flash = Math.max(0, timeline.flash - dt * 4);

    const continuousX = -aspect + timeline.phase * aspect * 2;
    const scanStep = Math.max(0, Math.min(stepCount - 1, Math.floor(timeline.phase * stepCount)));
    const isOwner = claimMidiOwnership();
    const visible = !!showOverlay && isOwner;

    if (overlayGroupRef.current) {
      overlayGroupRef.current.visible = visible;
      overlayGroupRef.current.position.set(continuousX, 0, 0.16);
    }
    if (playheadRef.current) {
      playheadRef.current.scale.set(worldPerPixelX * safeLineThickness, 2, 1);
    }

    if (scanStep !== timeline.step) {
      timeline.step = scanStep;
      const hit = findBestInSlice(
        pixelBufferRef.current,
        stepCount,
        rowCount,
        scanStep,
        Math.max(1, Math.min(12, Math.floor(sliceWidth || 3))),
        clamp01(threshold),
        parseColor(trackColor)
      );

      if (hit) {
        const targetY = (hit.yNorm - 0.5) * 2;
        const s = Math.max(0, Math.min(0.98, smooth));
        if (!timeline.initialized) {
          timeline.y = targetY;
          timeline.initialized = true;
        } else {
          timeline.y = timeline.y * s + targetY * (1 - s);
        }
        timeline.score = hit.score;

        const noteTick = Math.floor(timeline.phase * sweepBeats * noteRate);
        const note = midiForY(1 - ((timeline.y + 1) / 2), rootMidi, 'chromatic', Math.max(1, Math.floor(noteRange || 16)));
        const isNewNoteTick = noteTick !== timeline.noteStep;
        const shouldPlay = !(avoidRepeats && timeline.lastNote === note);
        if (isNewNoteTick && shouldPlay && isOwner) {
          timeline.noteStep = noteTick;
          timeline.lastNote = note;
          timeline.flash = 1;
          const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
          if (midi && midi.sendNote && shouldSendMidiEvent(`${ownerKeyRef.current || 'timeline'}:${scanStep}:${note}`)) {
            const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
            const durMs = Math.max(5, Math.round(Math.max(0.03, noteLength) * 1000));
            const velocity = clamp01((0.25 + hit.score * 0.75) * Math.max(0.1, velocityBoost));
            try {
              midi.sendNote(note, velocity, channel, durMs);
            } catch (_) {}
          }
        }
      } else {
        timeline.initialized = false;
        timeline.score = 0;
        timeline.lastNote = null;
      }
    }

    const targetVisible = visible && timeline.initialized;
    if (targetRef.current) {
      targetRef.current.visible = targetVisible;
      targetRef.current.position.set(0, timeline.y, 0);
      const dotSize = worldPerPixelY * (13 + timeline.score * 9);
      targetRef.current.scale.set(dotSize, dotSize, 1);
      if (targetRef.current.material) targetRef.current.material.opacity = targetVisible ? 0.45 + timeline.score * 0.5 : 0;
    }
    if (pulseLineRef.current) {
      pulseLineRef.current.visible = targetVisible && timeline.flash > 0.001;
      pulseLineRef.current.position.set(-continuousX, timeline.y, 0);
      pulseLineRef.current.scale.set(aspect * 2, worldPerPixelY * safeLineThickness, 1);
      if (pulseLineRef.current.material) pulseLineRef.current.material.opacity = timeline.flash * 0.55;
    }
    if (pulseRingRef.current) {
      pulseRingRef.current.visible = targetVisible && timeline.flash > 0.001;
      pulseRingRef.current.position.set(0, timeline.y, 0);
      const ringSize = worldPerPixelY * (36 + (1 - timeline.flash) * 96);
      pulseRingRef.current.scale.set(ringSize, ringSize, 1);
      if (pulseRingRef.current.material) pulseRingRef.current.material.opacity = timeline.flash * 0.72;
    }
  });

  return React.createElement('group', { ref: groupRef },
    React.createElement('group', { ref: overlayGroupRef, visible: false, renderOrder: 15 },
      React.createElement('mesh', { ref: playheadRef, renderOrder: 15 },
        React.createElement('primitive', { object: planeGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: lineMaterial, attach: 'material' })
      ),
      React.createElement('mesh', { ref: pulseLineRef, visible: false, renderOrder: 16 },
        React.createElement('primitive', { object: planeGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: pulseMaterial, attach: 'material' })
      ),
      React.createElement('mesh', { ref: pulseRingRef, visible: false, renderOrder: 17 },
        React.createElement('primitive', { object: ringGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: ringMaterial, attach: 'material' })
      ),
      React.createElement('mesh', { ref: targetRef, visible: false, renderOrder: 18 },
        React.createElement('primitive', { object: dotGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: dotMaterial, attach: 'material' })
      )
    )
  );
}
