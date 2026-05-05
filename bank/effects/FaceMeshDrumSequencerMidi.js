const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'FaceMesh Drum Sequencer (MIDI)',
  description: 'Face tracking drives an 8-voice MIDI drum sequencer. The grid lives on the face — voice zones light up across the landmark mesh as each hit fires.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  stickyOverlay: true,
  canBeGlobal: true,
  parameters: [
    { name: 'steps', type: 'number', value: 16, min: 8, max: 32, step: 1, description: 'sequencer steps per bar' },
    { name: 'stepsPerBeat', type: 'number', value: 4, min: 2, max: 8, step: 1, description: '4 = 16ths, 2 = 8ths' },
    { name: 'bpmSync', type: 'boolean', value: true },
    { name: 'manualBpm', type: 'number', value: 128, min: 60, max: 220, step: 1 },
    { name: 'faceInfluence', type: 'number', value: 0.85, min: 0, max: 1, step: 0.05 },
    { name: 'baseDensity', type: 'number', value: 0.32, min: 0, max: 1, step: 0.05 },
    { name: 'mutationRate', type: 'number', value: 0.18, min: 0, max: 1, step: 0.02, description: 'how quickly face motion rewrites the pattern' },
    { name: 'holdWhenNoFace', type: 'boolean', value: true, description: 'keep playing the last pattern if tracking drops out' },
    { name: 'trackingSource', type: 'select', value: 'auto', options: ['auto', 'underlyingVideo', 'webcam'], description: 'auto prefers the video underneath, then webcam' },
    { name: 'mirrorCamera', type: 'boolean', value: true },
    { name: 'accentColor', type: 'color', value: '#00ff00' },
    { name: 'dotSize', type: 'number', value: 0.009, min: 0.003, max: 0.022, step: 0.001, description: 'face landmark dot radius' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true, description: 'send drum notes to the selected MIDI output' },
    { name: 'midiChannel', type: 'number', value: 10, min: 1, max: 16, step: 1, lockDefault: true },
    { name: 'velocityBoost', type: 'number', value: 0.15, min: 0, max: 0.5, step: 0.01 },
    { name: 'mouthMidi', type: 'boolean', value: true, description: 'send note-on/off when mouth opens and closes' },
    { name: 'mouthNote', type: 'number', value: 60, min: 0, max: 127, step: 1, description: 'MIDI note fired by mouth open' },
    { name: 'mouthChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true, description: 'MIDI channel for mouth note' },
    { name: 'mouthThreshold', type: 'number', value: 0.08, min: 0.01, max: 0.6, step: 0.01, description: 'mouth openness needed to trigger note-on' },
  ],
};

const ML5_CDN_URL = 'https://cdn.jsdelivr.net/npm/ml5@1.0.1/dist/ml5.min.js';
const VOICES = [
  { name: 'kick',  note: 36, base: [1, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'snare', note: 38, base: [0, 0, 0, 0, 1, 0, 0, 0] },
  { name: 'hat',   note: 42, base: [1, 0, 1, 0, 1, 0, 1, 0] },
  { name: 'open',  note: 46, base: [0, 0, 0, 1, 0, 0, 0, 1] },
  { name: 'clap',  note: 39, base: [0, 0, 0, 0, 1, 0, 0, 0] },
  { name: 'rim',   note: 37, base: [0, 0, 1, 0, 0, 0, 1, 0] },
  { name: 'tom',   note: 45, base: [0, 0, 0, 0, 0, 1, 0, 0] },
  { name: 'crash', note: 49, base: [1, 0, 0, 0, 0, 0, 0, 0] },
];
const VOICE_COUNT = VOICES.length;
const MAX_LANDMARKS = 478;
const FACE_STATE_CACHE_KEY = '__vj_face_mesh_drum_state_cache__';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smooth(current, target, amount) {
  return current + (target - current) * clamp(amount, 0, 1);
}

function createDefaultFaceState() {
  return {
    hasFace: false,
    x: 0.5, y: 0.5, mouth: 0, tilt: 0, energy: 0,
    cx: 0.5, cy: 0.5, fw: 0.3, fh: 0.4,
    pointCount: 0,
    points: new Float32Array(MAX_LANDMARKS * 2),
  };
}

function cloneFaceState(state) {
  const next = createDefaultFaceState();
  if (!state) return next;
  next.hasFace = !!state.hasFace;
  next.x = state.x; next.y = state.y; next.mouth = state.mouth;
  next.tilt = state.tilt; next.energy = state.energy;
  next.cx = state.cx; next.cy = state.cy; next.fw = state.fw; next.fh = state.fh;
  next.pointCount = state.pointCount || 0;
  if (state.points) next.points.set(state.points.subarray ? state.points.subarray(0, next.points.length) : state.points);
  return next;
}

function getFaceStateCache() {
  if (!globalThis) return null;
  if (!globalThis[FACE_STATE_CACHE_KEY]) {
    globalThis[FACE_STATE_CACHE_KEY] = new WeakMap();
  }
  return globalThis[FACE_STATE_CACHE_KEY];
}

function cachedFaceStateFor(input) {
  const cache = input && typeof input === 'object' ? getFaceStateCache() : null;
  return cache && cache.has(input) ? cloneFaceState(cache.get(input)) : createDefaultFaceState();
}

function storeFaceStateFor(input, state) {
  const cache = input && typeof input === 'object' ? getFaceStateCache() : null;
  if (cache && state) cache.set(input, cloneFaceState(state));
}

function seededNoise(a, b, c) {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function ensureScript(url) {
  if (typeof document === 'undefined') return Promise.reject(new Error('document unavailable'));
  const existing = Array.from(document.querySelectorAll('script')).find((s) => s.src === url);
  if (existing) {
    if (existing.getAttribute('data-loaded') === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => { script.setAttribute('data-loaded', 'true'); resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function waitForMl5() {
  if (globalThis.ml5) return globalThis.ml5;
  await ensureScript(ML5_CDN_URL);
  for (let i = 0; i < 80; i++) {
    if (globalThis.ml5) return globalThis.ml5;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('ml5 did not become available');
}

function createFaceMeshDetector(ml5) {
  return new Promise((resolve, reject) => {
    let detector = null;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('ml5 facemesh model timed out'));
    }, 12000);
    const finish = (result, error) => {
      if (settled) return;
      clearTimeout(timeout);
      if (error || result instanceof Error) { settled = true; reject(error || result); return; }
      settled = true;
      resolve(detector || result);
    };
    try {
      detector = ml5.faceMesh({ maxFaces: 1, refineLandmarks: false, runtime: 'tfjs' }, finish);
      if (detector && typeof detector.then === 'function') {
        detector.then((d) => finish(d)).catch((e) => finish(null, e));
      }
    } catch (err) {
      try {
        detector = ml5.faceMesh('MediaPipeFaceMesh', { maxFaces: 1, refineLandmarks: false, runtime: 'tfjs' }, finish);
        if (detector && typeof detector.then === 'function') {
          detector.then((d) => finish(d)).catch((e) => finish(null, e));
        }
      } catch (_) { clearTimeout(timeout); reject(err); }
    }
  });
}

function mediaWidth(m) { return (m && (m.videoWidth || m.naturalWidth || m.width)) || 640; }
function mediaHeight(m) { return (m && (m.videoHeight || m.naturalHeight || m.height)) || 480; }

function waitForMediaReady(media) {
  if (!media) return Promise.resolve(null);
  const ready = () => mediaWidth(media) > 1 && mediaHeight(media) > 1 && (!('readyState' in media) || media.readyState >= 2);
  if (ready()) return Promise.resolve(media);
  return new Promise((resolve) => {
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (ready() || n > 80) { clearInterval(t); resolve(ready() ? media : null); }
    }, 100);
  });
}

function regionCenter(region, fallback) {
  if (!region) return fallback;
  if (Number.isFinite(region.centerX) && Number.isFinite(region.centerY)) return { x: region.centerX, y: region.centerY };
  const pts = region.keypoints || [];
  if (!pts.length) return fallback;
  let x = 0, y = 0;
  for (let i = 0; i < pts.length; i++) { x += pts[i].x || 0; y += pts[i].y || 0; }
  return { x: x / pts.length, y: y / pts.length };
}

function regionSpan(region, axis) {
  const pts = region && region.keypoints;
  if (!pts || !pts.length) return 0;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const v = Number(pts[i][axis]);
    if (!Number.isFinite(v)) continue;
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? Math.max(0, hi - lo) : 0;
}

function updateFaceState(faceState, face, video, mirrorCamera) {
  const keypoints = face && face.keypoints;
  if (!keypoints || keypoints.length < 4) { faceState.hasFace = false; return; }

  const vW = mediaWidth(video);
  const vH = mediaHeight(video);
  const nose = keypoints[1] || keypoints[4] || keypoints[0];
  const leftEye = regionCenter(face.leftEye, keypoints[33] || nose);
  const rightEye = regionCenter(face.rightEye, keypoints[263] || nose);
  const eyeDx = rightEye.x - leftEye.x;
  const eyeDy = rightEye.y - leftEye.y;
  const eyeDist = Math.max(1, Math.hypot(eyeDx, eyeDy));
  // Use multiple inner-lip pairs to robustly measure mouth openness.
  // Inner upper: 13, inner lower: 14. Outer: top~0, bottom~17. Also 61,291 for width.
  const lipPairs = [[13, 14], [82, 87], [312, 317]];
  let bestLipDy = 0;
  for (const [a, b] of lipPairs) {
    const ka = keypoints[a], kb = keypoints[b];
    if (ka && kb) {
      const dy = Math.abs((kb.y || 0) - (ka.y || 0));
      if (dy > bestLipDy) bestLipDy = dy;
    }
  }
  // Normalize against face width (eye distance) instead of eye span alone
  const leftCorner = keypoints[61], rightCorner = keypoints[291];
  const mouthWidth = (leftCorner && rightCorner)
    ? Math.abs((rightCorner.x || 0) - (leftCorner.x || 0))
    : eyeDist * 0.6;
  const openRatio = mouthWidth > 1 ? bestLipDy / mouthWidth : 0;
  const mouthOpen = clamp((openRatio - 0.04) * 5, 0, 1);
  const rawX = clamp((nose.x || 0) / vW, 0, 1);
  const xNorm = mirrorCamera ? 1 - rawX : rawX;
  const yNorm = clamp((nose.y || 0) / vH, 0, 1);
  const tilt = clamp((Math.atan2(eyeDy, eyeDx) / 0.55) * (mirrorCamera ? -1 : 1), -1, 1);
  const motion = Math.hypot(xNorm - faceState.x, yNorm - faceState.y);

  faceState.hasFace = true;
  faceState.x = smooth(faceState.x, xNorm, 0.28);
  faceState.y = smooth(faceState.y, yNorm, 0.28);
  faceState.mouth = smooth(faceState.mouth, mouthOpen, 0.55);
  faceState.tilt = smooth(faceState.tilt, tilt, 0.25);
  faceState.energy = smooth(faceState.energy, clamp(motion * 18 + mouthOpen * 0.35, 0, 1), 0.2);

  // Store all keypoints + compute bbox
  const count = Math.min(MAX_LANDMARKS, keypoints.length);
  faceState.pointCount = count;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const pts = faceState.points;
  for (let i = 0; i < count; i++) {
    const kp = keypoints[i];
    const rawPx = clamp((kp.x || 0) / vW, 0, 1);
    const py = clamp((kp.y || 0) / vH, 0, 1);
    const px = mirrorCamera ? 1 - rawPx : rawPx;
    pts[i * 2] = px;
    pts[i * 2 + 1] = py;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  faceState.cx = (minX + maxX) * 0.5;
  faceState.cy = (minY + maxY) * 0.5;
  faceState.fw = Math.max(0.01, maxX - minX);
  faceState.fh = Math.max(0.01, maxY - minY);
}

function basePatternValue(voice, step) {
  return VOICES[voice].base[step % VOICES[voice].base.length] === 1;
}

function facePatternValue(voice, step, steps, face, baseDensity, faceInfluence) {
  const phase = steps > 0 ? step / steps : 0;
  const laneBias = [
    0.3 + (1 - face.y) * 0.45,
    0.28 + Math.abs(face.tilt) * 0.35,
    0.4 + face.energy * 0.45,
    0.12 + face.mouth * 0.7,
    0.12 + face.x * 0.38,
    0.16 + (1 - face.x) * 0.35,
    0.1 + face.y * 0.42,
    0.05 + face.mouth * 0.45 + face.energy * 0.2,
  ][voice] || 0.2;
  const movingGate = seededNoise(voice + 11, step + Math.floor(face.x * 9), Math.floor(face.y * 9));
  const faceGate = seededNoise(voice + Math.round(face.tilt * 7), step, Math.floor(face.mouth * 12));
  const density = clamp(baseDensity * (1 - faceInfluence) + laneBias * faceInfluence, 0.02, 0.94);
  const phrase = Math.sin((phase + face.x * 0.25 + voice * 0.07) * Math.PI * 2) * 0.5 + 0.5;
  return movingGate < density * (0.65 + phrase * 0.35) || faceGate < density * 0.4;
}

function shouldFireVoice(voice, step, steps, face, baseDensity, faceInfluence, holdWhenNoFace) {
  if (!face.hasFace && !holdWhenNoFace) return basePatternValue(voice, step);
  const base = basePatternValue(voice, step);
  if (!face.hasFace) return base;
  const faceOn = facePatternValue(voice, step, steps, face, baseDensity, faceInfluence);
  if (voice === 0 && step % Math.max(1, Math.floor(steps / 4)) === 0) return true;
  if (voice === 1 && step % Math.max(1, Math.floor(steps / 2)) === Math.floor(steps / 4)) return true;
  if (voice === 2 && face.mouth > 0.65) return step % 2 === 0 || faceOn;
  if (voice === 3 && face.mouth < 0.25) return false;
  if (voice === 7 && step !== 0 && face.energy < 0.72) return false;
  return base || faceOn;
}

export default function FaceMeshDrumSequencerMidi({
  steps = 16,
  stepsPerBeat = 4,
  bpmSync = true,
  manualBpm = 128,
  faceInfluence = 0.85,
  baseDensity = 0.32,
  mutationRate = 0.18,
  holdWhenNoFace = true,
  trackingSource = 'auto',
  mirrorCamera = true,
  accentColor = '#00ff00',
  dotSize = 0.009,
  sendMidi = true,
  midiChannel = 10,
  velocityBoost = 0.15,
  mouthMidi = true,
  mouthNote = 60,
  mouthChannel = 1,
  mouthThreshold = 0.08,
  videoTexture = null,
  sourceVideoElement = null,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;
  const halfH = 1;
  const stepCount = Math.max(4, Math.floor(steps));
  const totalCells = stepCount * VOICE_COUNT;
  const initialTrackingInput = (sourceVideoElement && typeof HTMLVideoElement !== 'undefined' && sourceVideoElement instanceof HTMLVideoElement)
    ? sourceVideoElement
    : (videoTexture && videoTexture.image);

  // Face state: includes bbox (cx,cy,fw,fh) in normalised [0,1]
  const faceRef = useRef(cachedFaceStateFor(initialTrackingInput));

  // Smoothed bbox so the grid stays stable
  const smoothBbox = useRef({ cx: 0.5, cy: 0.5, fw: 0.3, fh: 0.4 });

  // Per-voice fire pulse (decays independently of the per-cell pattern pulse)
  const voicePulse = useRef(new Float32Array(VOICE_COUNT));

  // Mouth note-on state tracking
  const mouthNoteOnRef = useRef(false);
  const mouthDebugTimer = useRef(0);
  const mouthBarRef = useRef(null);
  const mouthThreshLineRef = useRef(null);

  const cellRef = useRef(null);
  const pointRef = useRef(null);
  const scanRef = useRef(null);
  const lastStepRef = useRef(-1);
  const playheadRef = useRef(0);
  const patternRef = useRef(null);
  const pulseRef = useRef(null);

  // Shared detector state — written by setup effect, read by useFrame polling
  const detectorRef = useRef(null);
  const detectionInputRef = useRef(null);
  const detectBusyRef = useRef(false);
  const detectFrameRef = useRef(0);

  useEffect(() => {
    patternRef.current = new Uint8Array(totalCells);
    pulseRef.current = new Float32Array(totalCells);
    lastStepRef.current = -1;
    playheadRef.current = 0;
    for (let v = 0; v < VOICE_COUNT; v++) {
      for (let s = 0; s < stepCount; s++) {
        patternRef.current[v * stepCount + s] = basePatternValue(v, s) ? 1 : 0;
      }
    }
  }, [stepCount, totalCells]);

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let ownedVideo = null;

    function getUnderlyingInput() {
      if (sourceVideoElement && typeof HTMLVideoElement !== 'undefined' && sourceVideoElement instanceof HTMLVideoElement) {
        return sourceVideoElement;
      }
      const image = videoTexture && videoTexture.image;
      if (!image) return null;
      const okVideo = typeof HTMLVideoElement !== 'undefined' && image instanceof HTMLVideoElement;
      const okCanvas = typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement;
      const okImage = typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement && image.complete;
      return (okVideo || okCanvas || okImage) ? image : null;
    }

    async function createWebcamInput() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
      const video = document.createElement('video');
      ownedVideo = video;
      video.autoplay = true; video.muted = true; video.playsInline = true;
      video.width = 640; video.height = 480; video.style.display = 'none';
      document.body.appendChild(video);
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      if (cancelled) return null;
      video.srcObject = stream;
      await video.play().catch(() => {});
      return video;
    }

    async function startFaceMesh() {
      try {
        // Clear previous detector
        detectorRef.current = null;
        detectionInputRef.current = null;
        detectBusyRef.current = false;

        const wantsUnderlying = trackingSource === 'auto' || trackingSource === 'underlyingVideo';
        const wantsWebcam = trackingSource === 'auto' || trackingSource === 'webcam';

        let input = wantsUnderlying ? await waitForMediaReady(getUnderlyingInput()) : null;
        if (!input && wantsWebcam) input = await createWebcamInput();
        input = await waitForMediaReady(input);
        if (!input || cancelled) return;

        const ml5 = await waitForMl5();
        if (cancelled || !ml5 || !ml5.faceMesh) return;
        const detector = await createFaceMeshDetector(ml5);
        if (cancelled) return;

        detectorRef.current = detector;
        detectionInputRef.current = input;
      } catch (_) {
        faceRef.current.hasFace = false;
      }
    }

    startFaceMesh();
    return () => {
      cancelled = true;
      detectorRef.current = null;
      detectionInputRef.current = null;
      detectBusyRef.current = false;
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { if (ownedVideo) { ownedVideo.srcObject = null; ownedVideo.remove(); } } catch (_) {}
    };
  }, [mirrorCamera, trackingSource, videoTexture && videoTexture.image, sourceVideoElement]);

  // Send note-off on unmount to prevent stuck notes
  useEffect(() => {
    return () => {
      if (mouthNoteOnRef.current) {
        mouthNoteOnRef.current = false;
        const midi = globalThis && globalThis.VJ_MIDI;
        if (midi && midi.sendNoteOff) {
          try {
            midi.sendNoteOff(clamp(Math.round(mouthNote), 0, 127), clamp(Math.round(mouthChannel), 1, 16));
          } catch (_) {}
        }
      }
    };
  }, [mouthNote, mouthChannel]);

  // Geometry / materials
  const cellGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { cellGeom.dispose(); } catch (_) {} }, [cellGeom]);

  const pointGeom = useMemo(() => new THREE.CircleGeometry(1, 14), []);
  useEffect(() => () => { try { pointGeom.dispose(); } catch (_) {} }, [pointGeom]);

  const scanGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { scanGeom.dispose(); } catch (_) {} }, [scanGeom]);

  const cellMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { cellMat.dispose(); } catch (_) {} }, [cellMat]);

  const pointMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: accentColor, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [accentColor]);
  useEffect(() => () => { try { pointMat.dispose(); } catch (_) {} }, [pointMat]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const accentC = useMemo(() => new THREE.Color(accentColor), [accentColor]);

  useFrame((_state, delta) => {
    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const pattern = patternRef.current;
    const pulse = pulseRef.current;
    if (!pattern || !pulse) return;

    // Poll face detection every 3 frames using single-shot detect() so any
    // media source (webcam, video file, canvas) works identically.
    // Always prefer sourceVideoElement when available so video-file layers work.
    if (sourceVideoElement && typeof HTMLVideoElement !== 'undefined' &&
        sourceVideoElement instanceof HTMLVideoElement &&
        detectionInputRef.current !== sourceVideoElement &&
        detectorRef.current) {
      detectionInputRef.current = sourceVideoElement;
    }
    detectFrameRef.current++;
    if (detectFrameRef.current % 3 === 0) {
      const detector = detectorRef.current;
      const input = detectionInputRef.current;
      if (detector && input && !detectBusyRef.current) {
        const mW = mediaWidth(input);
        const mH = mediaHeight(input);
        if (mW > 1 && mH > 1) {
          detectBusyRef.current = true;
          const capturedInput = input;
          Promise.resolve()
            .then(() => detector.detect ? detector.detect(capturedInput) : new Promise((res) => {
              detector.detectStart(capturedInput, (r) => { detector.detectStop(); res(r); });
            }))
            .then((results) => {
              detectBusyRef.current = false;
              updateFaceState(faceRef.current, Array.isArray(results) ? results[0] : results, capturedInput, mirrorCamera);
              storeFaceStateFor(capturedInput, faceRef.current);
            })
            .catch(() => { detectBusyRef.current = false; });
        }
      }
    }

    // Advance sequencer
    const setBpm = (globalThis && Number.isFinite(globalThis.VJ_BPM)) ? Number(globalThis.VJ_BPM) : 128;
    const bpm = clamp(bpmSync ? setBpm : manualBpm, 30, 260);
    const stepRate = (bpm * Math.max(1, stepsPerBeat)) / 60;
    playheadRef.current += dt * stepRate;
    while (playheadRef.current >= stepCount) playheadRef.current -= stepCount;
    const curStep = Math.floor(playheadRef.current);
    const face = faceRef.current;
    const vp = voicePulse.current;

    if (curStep !== lastStepRef.current) {
      lastStepRef.current = curStep;
      const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
      const channel = clamp(Math.round(midiChannel), 1, 16);
      for (let v = 0; v < VOICE_COUNT; v++) {
        const idx = v * stepCount + curStep;
        if (face.hasFace || !holdWhenNoFace) {
          const nextVal = shouldFireVoice(v, curStep, stepCount, face, baseDensity, faceInfluence, holdWhenNoFace);
          if (Math.random() > mutationRate) { /* keep */ } else { pattern[idx] = nextVal ? 1 : 0; }
        }
        if (pattern[idx]) {
          pulse[idx] = 1;
          vp[v] = 1;
          const velocity = clamp(0.52 + face.energy * 0.28 + face.mouth * 0.12 + velocityBoost, 0.1, 1);
          if (midi && midi.sendNote) {
            try { midi.sendNote(VOICES[v].note, velocity, channel, v === 2 || v === 5 ? 28 : 55); } catch (_) {}
          }
        }
      }
    }

    // Mouth open/close → MIDI note-on / note-off
    // Update visual mouth meter bar
    if (mouthBarRef.current) {
      const maxW = halfW * 1.6;
      const filled = face.mouth * maxW;
      mouthBarRef.current.scale.x = Math.max(0.001, filled);
      mouthBarRef.current.position.x = -maxW / 2 + filled / 2;
      const active = face.hasFace && face.mouth > mouthThreshold;
      mouthBarRef.current.material.color.setHSL(active ? 0.33 : 0.08, 1, active ? 0.65 : 0.35);
    }
    if (mouthThreshLineRef.current) {
      const maxW = halfW * 1.6;
      mouthThreshLineRef.current.position.x = -maxW / 2 + mouthThreshold * maxW;
      mouthThreshLineRef.current.visible = mouthMidi;
    }
    if (mouthMidi) {
      const midi = globalThis && globalThis.VJ_MIDI;
      const ch = clamp(Math.round(mouthChannel), 1, 16);
      const note = clamp(Math.round(mouthNote), 0, 127);
      const isOpen = face.hasFace && face.mouth > mouthThreshold;
      if (isOpen && !mouthNoteOnRef.current) {
        mouthNoteOnRef.current = true;
        const vel = clamp(0.35 + face.mouth * 0.65, 0.1, 1);
        console.log('[FaceMeshDrum] NOTE ON  note:', note, 'vel:', vel.toFixed(2), 'ch:', ch);
        if (midi && midi.sendNoteOn) {
          try { midi.sendNoteOn(note, vel, ch); } catch (e) { console.warn('[FaceMeshDrum] sendNoteOn error:', e); }
        }
      } else if (!isOpen && mouthNoteOnRef.current) {
        mouthNoteOnRef.current = false;
        console.log('[FaceMeshDrum] NOTE OFF note:', note, 'ch:', ch);
        if (midi && midi.sendNoteOff) {
          try { midi.sendNoteOff(note, ch); } catch (e) { console.warn('[FaceMeshDrum] sendNoteOff error:', e); }
        }
      }
    } else if (mouthNoteOnRef.current) {
      // Feature was turned off mid-note — send note-off to avoid stuck note
      const midi = globalThis && globalThis.VJ_MIDI;
      const ch = clamp(Math.round(mouthChannel), 1, 16);
      const note = clamp(Math.round(mouthNote), 0, 127);
      mouthNoteOnRef.current = false;
      if (midi && midi.sendNoteOff) {
        try { midi.sendNoteOff(note, ch); } catch (_) {}
      }
    }

    // Decay per-cell pulse and per-voice pulse
    const pDecay = dt * 7.5;
    const vpDecay = dt * 9;
    for (let i = 0; i < totalCells; i++) {
      pulse[i] = Math.max(0, pulse[i] - pDecay);
    }
    for (let v = 0; v < VOICE_COUNT; v++) {
      vp[v] = Math.max(0, vp[v] - vpDecay);
    }

    // Smooth face bbox
    const sb = smoothBbox.current;
    if (face.hasFace) {
      sb.cx = smooth(sb.cx, face.cx, 0.12);
      sb.cy = smooth(sb.cy, face.cy, 0.12);
      sb.fw = smooth(sb.fw, face.fw, 0.08);
      sb.fh = smooth(sb.fh, face.fh, 0.08);
    }

    // 3D face bbox in world space
    const fcx = (sb.cx - 0.5) * halfW * 2;
    const fcy = (0.5 - sb.cy) * halfH * 2;
    const fw3 = sb.fw * halfW * 2;
    const fh3 = sb.fh * halfH * 2;
    const gcellW = fw3 / stepCount;
    const gcellH = fh3 / VOICE_COUNT;
    const gcellSize = Math.min(gcellW, gcellH) * 0.72;

    // Grid cells: positioned inside face bbox, visible only when face detected
    const cells = cellRef.current;
    if (cells) {
      for (let v = 0; v < VOICE_COUNT; v++) {
        for (let s = 0; s < stepCount; s++) {
          const i = v * stepCount + s;
          const p = pulse[i];
          const on = pattern[i] === 1;
          const x = fcx - fw3 * 0.5 + (s + 0.5) * gcellW;
          // Voice 0 at top of face, voice 7 at chin
          const y = fcy + fh3 * 0.5 - (v + 0.5) * gcellH;
          const isActive = s === curStep;
          const scale = face.hasFace
            ? (on ? gcellSize * (0.65 + p * 0.7) : gcellSize * (isActive ? 0.18 : 0.06))
            : 0;
          dummy.position.set(x, y, 0.07);
          dummy.scale.set(scale, scale, 1);
          dummy.updateMatrix();
          cells.setMatrixAt(i, dummy.matrix);
          // On-beat cells flash full accent; off cells are dim
          const bright = on ? (0.25 + p * 0.75) : (isActive ? 0.12 : 0.04);
          tmpColor.copy(accentC).multiplyScalar(bright);
          cells.setColorAt(i, tmpColor);
        }
      }
      cells.instanceMatrix.needsUpdate = true;
      if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
    }

    // Scan line: vertical bar sweeping across face
    const scan = scanRef.current;
    if (scan) {
      if (face.hasFace) {
        const scanX = fcx - fw3 * 0.5 + (playheadRef.current / stepCount) * fw3;
        scan.position.set(scanX, fcy, 0.09);
        scan.scale.set(Math.max(0.004, fw3 * 0.018), fh3 * 1.06, 1);
        scan.visible = true;
        if (scan.material) scan.material.opacity = 0.65;
      } else {
        scan.visible = false;
      }
    }

    // Face landmark dots: colored by voice zone, bright when that zone fires
    const points = pointRef.current;
    if (points) {
      const fTop = sb.cy - sb.fh * 0.5;
      const fBand = Math.max(0.001, sb.fh);
      for (let i = 0; i < MAX_LANDMARKS; i++) {
        if (!face.hasFace || i >= face.pointCount) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          points.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const px = face.points[i * 2];
        const py = face.points[i * 2 + 1];
        const x3 = (px - 0.5) * halfW * 2;
        const y3 = (0.5 - py) * halfH * 2;

        // Assign to voice zone by vertical band within face
        const relY = clamp((py - fTop) / fBand, 0, 0.9999);
        const zone = Math.floor(relY * VOICE_COUNT);
        const fire = vp[zone];

        // Dot size: small base, bigger when fired
        const radius = dotSize * (0.4 + fire * 1.4);
        dummy.position.set(x3, y3, 0.05 + fire * 0.02);
        dummy.scale.setScalar(radius);
        dummy.updateMatrix();
        points.setMatrixAt(i, dummy.matrix);

        // Color: dim green base, full accent on fire, white flash at peak
        const brightness = 0.12 + fire * 0.88;
        tmpColor.copy(accentC).multiplyScalar(brightness);
        if (fire > 0.6) tmpColor.lerp(new THREE.Color(1, 1, 1), (fire - 0.6) * 0.5);
        points.setColorAt(i, tmpColor);
      }
      points.instanceMatrix.needsUpdate = true;
      if (points.instanceColor) points.instanceColor.needsUpdate = true;
    }
  });

  const meterBarGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const meterY = -(halfH * 0.92);
  const meterH = halfH * 0.03;

  return React.createElement('group', null,
    React.createElement('instancedMesh', {
      ref: cellRef,
      args: [cellGeom, cellMat, totalCells],
    }),
    React.createElement('mesh', { ref: scanRef, visible: false },
      React.createElement('primitive', { object: scanGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: accentColor,
        transparent: true,
        opacity: 0.65,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ),
    React.createElement('instancedMesh', {
      ref: pointRef,
      args: [pointGeom, pointMat, MAX_LANDMARKS],
    }),
    // Mouth meter background track
    React.createElement('mesh', {
      position: [0, meterY, 0.1],
      scale: [halfW * 1.6, meterH, 1],
    },
      React.createElement('primitive', { object: meterBarGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', { color: '#222222', transparent: true, opacity: 0.7, depthTest: false })
    ),
    // Mouth meter fill (updates each frame via ref)
    React.createElement('mesh', {
      ref: mouthBarRef,
      position: [0, meterY, 0.11],
      scale: [0.001, meterH * 0.7, 1],
    },
      React.createElement('primitive', { object: meterBarGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', { color: '#ff8800', transparent: true, opacity: 0.9, depthTest: false })
    ),
    // Threshold marker line
    React.createElement('mesh', {
      ref: mouthThreshLineRef,
      position: [0, meterY, 0.12],
      scale: [halfW * 0.008, meterH * 1.4, 1],
    },
      React.createElement('primitive', { object: meterBarGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', { color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false })
    )
  );
}
