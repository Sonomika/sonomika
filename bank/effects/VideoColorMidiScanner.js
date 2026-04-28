const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Video Color MIDI Scanner',
  description: 'Scans the video underneath from left to right and fires MIDI notes from detected color or brightness bands.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'lanes', type: 'number', value: 8, min: 1, max: 16, step: 1, description: 'Vertical MIDI note lanes' },
    { name: 'steps', type: 'number', value: 64, min: 16, max: 192, step: 1, description: 'Horizontal scan resolution' },
    { name: 'sensitivity', type: 'number', value: 2.0, min: 0.1, max: 4.0, step: 0.1, description: 'Color/brightness gain before detection' },
    { name: 'threshold', type: 'number', value: 0.62, min: 0.0, max: 1.0, step: 0.01, description: 'Trigger threshold' },
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track; white uses brightness' },
    { name: 'bpmSync', type: 'boolean', value: true, description: 'Use project BPM for scan speed' },
    { name: 'manualBpm', type: 'number', value: 120, min: 40, max: 220, step: 1, description: 'BPM when sync is off' },
    { name: 'beatsPerSweep', type: 'number', value: 4, min: 1, max: 32, step: 1, description: 'Beats for one left-to-right pass' },
    { name: 'rootMidi', type: 'number', value: 48, min: 0, max: 120, step: 1, lockDefault: true },
    { name: 'noteLength', type: 'number', value: 0.12, min: 0.02, max: 2.0, step: 0.01, description: 'MIDI note duration in seconds' },
    { name: 'velocityBoost', type: 'number', value: 1.0, min: 0.1, max: 2.0, step: 0.05, description: 'Velocity multiplier' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'Send MIDI notes to the selected output' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
    { name: 'showOverlay', type: 'boolean', value: true, description: 'Show playhead and triggered lane flashes' },
    { name: 'lineThickness', type: 'number', value: 2, min: 1, max: 20, step: 1, description: 'Overlay line thickness in pixels' },
    { name: 'scanColor', type: 'color', value: '#ffffff', description: 'Overlay color' },
  ],
};

const OWNER_SLOT = '__VJ_VIDEO_COLOR_MIDI_SCANNER_OWNER__';
const OWNER_LEASE_MS = 250;
const LAST_EVENT_SLOT = '__VJ_VIDEO_COLOR_MIDI_SCANNER_LAST__';
const MIN_EVENT_GAP_MS = 55;
const MAX_EVENTS_PER_FRAME = 16;

const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34, 36],
  major: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26],
  minor: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24, 26],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
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
    return 1.0 - (Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3));
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function midiForLane(lane, laneCount, rootMidi, scaleName) {
  const intervals = SCALES[scaleName] || SCALES.minorPentatonic;
  const bottomToTop = Math.max(0, laneCount - 1 - lane);
  const interval = intervals[bottomToTop % intervals.length] + Math.floor(bottomToTop / intervals.length) * 12;
  return Math.max(0, Math.min(127, Math.round(rootMidi + interval)));
}

function midiToNoteLabel(note) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.max(0, Math.min(127, Math.round(note)));
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function byteToHex(v) {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

function pixelHex(buf, idx) {
  return `#${byteToHex(buf[idx])}${byteToHex(buf[idx + 1])}${byteToHex(buf[idx + 2])}`;
}

function makeLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { canvas, texture };
}

function updateLabelTexture(canvas, texture, text, color) {
  if (!canvas || !texture) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 14, canvas.height);
  ctx.font = '400 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 26, canvas.height * 0.5, canvas.width - 34);
  texture.needsUpdate = true;
}

function nowMs() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
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

export default function VideoColorMidiScanner({
  lanes = 8,
  steps = 64,
  sensitivity = 2.0,
  threshold = 0.62,
  trackColor = '#ffffff',
  bpmSync = true,
  manualBpm = 120,
  beatsPerSweep = 4,
  rootMidi = 48,
  noteLength = 0.12,
  velocityBoost = 1.0,
  sendMidi = true,
  midiChannel = 1,
  showOverlay = true,
  lineThickness = 2,
  scanColor = '#ffffff',
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const groupRef = useRef(null);
  const playheadRef = useRef(null);
  const laneRefs = useRef([]);
  const labelRefs = useRef([]);
  const ownerKeyRef = useRef(null);
  const scanPhaseRef = useRef(0);
  const previousStepRef = useRef(-1);
  const pulsesRef = useRef([]);
  const labelStatesRef = useRef([]);

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

  const laneCount = Math.max(1, Math.min(16, Math.floor(lanes || 1)));
  const stepCount = Math.max(16, Math.min(192, Math.floor(steps || 64)));
  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);
  const aspect = useMemo(() => effectiveW / effectiveH, [effectiveW, effectiveH]);
  const worldPerPixelX = (aspect * 2) / effectiveW;
  const worldPerPixelY = 2 / effectiveH;
  const overlayLinePixels = Math.max(1, Math.min(20, Math.round(lineThickness || 2)));

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
    const key = `video-color-midi-scanner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ownerKeyRef.current = key;
    previousStepRef.current = -1;
    scanPhaseRef.current = 0;
    pulsesRef.current = new Array(laneCount).fill(0);
    labelStatesRef.current = new Array(laneCount).fill(0).map(() => ({ x: 0, y: 0, pulse: 0, flash: 0 }));
    try {
      if (!globalThis[OWNER_SLOT]) {
        globalThis[OWNER_SLOT] = {
          key,
          expiresAt: nowMs() + OWNER_LEASE_MS,
        };
      }
    } catch (_) {}
    return () => {
      try {
        if (globalThis[OWNER_SLOT] && globalThis[OWNER_SLOT].key === ownerKeyRef.current) {
          globalThis[OWNER_SLOT] = null;
        }
      } catch (_) {}
    };
  }, [laneCount]);

  useEffect(() => {
    laneRefs.current = new Array(laneCount);
    labelRefs.current = new Array(laneCount);
    pulsesRef.current = new Array(laneCount).fill(0);
    labelStatesRef.current = new Array(laneCount).fill(0).map(() => ({ x: 0, y: 0, pulse: 0, flash: 0 }));
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

  const analyzeTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(stepCount, laneCount, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [stepCount, laneCount]);
  useEffect(() => () => { try { analyzeTarget && analyzeTarget.dispose(); } catch (_) {} }, [analyzeTarget]);

  const blitMaterial = useMemo(() => {
    const vertexShader = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
    const fragmentShader = 'varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uGain; void main(){ vec4 c=texture2D(tDiffuse,vUv); c.rgb=clamp(c.rgb*uGain,0.0,1.0); gl_FragColor=c; }';
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: null },
        uGain: { value: sensitivity },
      },
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
  if (!pixelBufferRef.current || pixelBufferRef.current.length !== stepCount * laneCount * 4) {
    pixelBufferRef.current = new Uint8Array(stepCount * laneCount * 4);
  }

  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    return videoTexture || null;
  };

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
      gl.readRenderTargetPixels(analyzeTarget, 0, 0, stepCount, laneCount, pixelBufferRef.current);
    } catch (_) {
      return;
    }

    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 120;
    const bpm = Math.max(1, bpmSync ? setBpm : Number(manualBpm || 120));
    const sweepBeats = Math.max(1, Math.floor(beatsPerSweep || 4));
    scanPhaseRef.current = (scanPhaseRef.current + dt * (bpm / 60) / sweepBeats) % 1;

    const scanStep = Math.max(0, Math.min(stepCount - 1, Math.floor(scanPhaseRef.current * stepCount)));
    if (playheadRef.current) {
      const x = -aspect + scanPhaseRef.current * aspect * 2;
      playheadRef.current.visible = !!showOverlay;
      playheadRef.current.position.set(x, 0, 0.2);
      playheadRef.current.scale.set(worldPerPixelX * overlayLinePixels, 2, 1);
      if (playheadRef.current.material) {
        playheadRef.current.material.opacity = showOverlay ? 0.75 : 0;
      }
    }

    for (let lane = 0; lane < laneCount; lane++) {
      pulsesRef.current[lane] = Math.max(0, (pulsesRef.current[lane] || 0) - dt * 5.5);
      const labelState = labelStatesRef.current[lane];
      if (labelState) {
        labelState.pulse = Math.max(0, (labelState.pulse || 0) - dt * 2.8);
        labelState.flash = Math.max(0, (labelState.flash || 0) - dt * 10);
      }
      const laneMesh = laneRefs.current[lane];
      const tLane = laneCount > 1 ? lane / (laneCount - 1) : 0.5;
      const y = 1 - tLane * 2;
      if (laneMesh) {
        laneMesh.visible = !!showOverlay && pulsesRef.current[lane] > 0.001;
        laneMesh.position.set(0, y, 0.18);
        laneMesh.scale.set(aspect * 2, worldPerPixelY * overlayLinePixels, 1);
        if (laneMesh.material) {
          laneMesh.material.opacity = pulsesRef.current[lane] * 0.55;
        }
      }
      const label = labelRefs.current[lane];
      if (label && labelState) {
        label.visible = !!showOverlay && labelState.pulse > 0.001;
        label.position.set(labelState.x, labelState.y, 0.24);
        const flashScale = 1 + (labelState.flash || 0) * 0.35;
        label.scale.set(worldPerPixelX * 112 * flashScale, worldPerPixelY * 28 * flashScale, 1);
        if (label.material) {
          label.material.opacity = Math.min(1, labelState.pulse * (0.55 + (labelState.flash || 0) * 0.65));
          if (label.material.color) {
            const flashTint = 1 + (labelState.flash || 0) * 0.8;
            label.material.color.setRGB(flashTint, flashTint, flashTint);
          }
        }
      }
    }

    if (scanStep === previousStepRef.current) return;
    const previousStep = previousStepRef.current;
    previousStepRef.current = scanStep;

    const midi = (sendMidi && claimMidiOwnership()) ? (globalThis && globalThis.VJ_MIDI) : null;
    const channel = Math.max(1, Math.min(16, Math.round(midiChannel)));
    const durMs = Math.max(5, Math.round(Math.max(0.02, noteLength) * 1000));
    const targetColor = parseColor(trackColor);
    const triggerThreshold = clamp01(threshold);
    const eventBase = `${ownerKeyRef.current || 'scanner'}:${scanStep}`;
    let sentCount = 0;

    for (let lane = 0; lane < laneCount; lane++) {
      const row = laneCount - 1 - lane;
      const idx = (row * stepCount + scanStep) * 4;
      const score = clamp01(scorePixel(pixelBufferRef.current, idx, targetColor));
      if (score < triggerThreshold) continue;

      const note = midiForLane(lane, laneCount, rootMidi, 'chromatic');
      const velocity = clamp01(0.25 + ((score - triggerThreshold) / Math.max(0.001, 1 - triggerThreshold)) * 0.75) * Math.max(0.1, velocityBoost);
      const eventKey = `${eventBase}:${lane}:${note}`;
      const sampleColor = pixelHex(pixelBufferRef.current, idx);

      if (midi && midi.sendNote && shouldSendMidiEvent(eventKey) && sentCount < MAX_EVENTS_PER_FRAME) {
        try {
          midi.sendNote(note, clamp01(velocity), channel, durMs);
          sentCount++;
        } catch (_) {}
      }

      pulsesRef.current[lane] = Math.max(pulsesRef.current[lane] || 0, clamp01(score));
      const labelState = labelStatesRef.current[lane];
      if (labelState) {
        const tLane = laneCount > 1 ? lane / (laneCount - 1) : 0.5;
        const labelHalfWidth = worldPerPixelX * 56;
        const labelGap = worldPerPixelX * 10;
        const scanX = -aspect + (scanStep + 0.5) / stepCount * aspect * 2;
        labelState.x = Math.max(-aspect + labelHalfWidth, Math.min(aspect - labelHalfWidth, scanX + labelHalfWidth + labelGap));
        labelState.y = Math.max(-0.92, Math.min(0.92, 1 - tLane * 2 + 0.07));
        labelState.pulse = 1;
        labelState.flash = 1;
      }
      if (labelResources && labelResources.canvases && labelResources.textures) {
        updateLabelTexture(
          labelResources.canvases[lane],
          labelResources.textures[lane],
          `${sampleColor} ${midiToNoteLabel(note)}`,
          sampleColor
        );
      }
    }

    // Reset edge: allow step zero to retrigger cleanly after wrapping.
    if (previousStep > scanStep) {
      previousStepRef.current = scanStep;
    }
  });

  const playheadMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(scanColor),
    transparent: true,
    opacity: 0.75,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [scanColor]);
  useEffect(() => () => { try { playheadMaterial && playheadMaterial.dispose(); } catch (_) {} }, [playheadMaterial]);

  const laneMaterials = useMemo(() => {
    const materials = [];
    for (let i = 0; i < laneCount; i++) {
      materials.push(new THREE.MeshBasicMaterial({
        color: new THREE.Color(scanColor),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
    }
    return materials;
  }, [laneCount, scanColor]);
  useEffect(() => () => {
    try {
      for (const material of laneMaterials) {
        try { material && material.dispose(); } catch (_) {}
      }
    } catch (_) {}
  }, [laneMaterials]);

  const labelResources = useMemo(() => {
    const canvases = [];
    const textures = [];
    const materials = [];
    for (let i = 0; i < laneCount; i++) {
      const { canvas, texture } = makeLabelTexture();
      updateLabelTexture(canvas, texture, '#000000 C3', '#000000');
      canvases.push(canvas);
      textures.push(texture);
      materials.push(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }));
    }
    return { canvases, textures, materials };
  }, [laneCount]);
  useEffect(() => () => {
    try {
      for (const material of labelResources.materials) {
        try { material && material.dispose(); } catch (_) {}
      }
      for (const texture of labelResources.textures) {
        try { texture && texture.dispose(); } catch (_) {}
      }
    } catch (_) {}
  }, [labelResources]);

  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { planeGeometry && planeGeometry.dispose(); } catch (_) {} }, [planeGeometry]);

  const children = [
    React.createElement('mesh', {
      key: 'playhead',
      ref: playheadRef,
      visible: !!showOverlay,
      renderOrder: 20,
    },
      React.createElement('primitive', { object: planeGeometry, attach: 'geometry' }),
      React.createElement('primitive', { object: playheadMaterial, attach: 'material' })
    ),
  ];

  for (let lane = 0; lane < laneCount; lane++) {
    children.push(
      React.createElement('mesh', {
        key: `lane-${lane}`,
        ref: (r) => { laneRefs.current[lane] = r; },
        visible: false,
        renderOrder: 19,
      },
        React.createElement('primitive', { object: planeGeometry, attach: 'geometry' }),
        React.createElement('primitive', { object: laneMaterials[lane], attach: 'material' })
      )
    );
    children.push(
      React.createElement('sprite', {
        key: `label-${lane}`,
        ref: (r) => { labelRefs.current[lane] = r; },
        visible: false,
        material: labelResources.materials[lane],
        renderOrder: 21,
      })
    );
  }

  return React.createElement('group', { ref: groupRef }, ...children);
}
