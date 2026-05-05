const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'HandPose MIDI Board',
  description: 'ml5 handPose tracks your index finger over a board of MIDI notes. Moving into a cell fires that note.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  stickyOverlay: true,
  canBeGlobal: true,
  parameters: [
    { name: 'trackingSource', type: 'select', value: 'auto', options: ['auto', 'underlyingVideo', 'webcam'], description: 'auto prefers the video underneath, then webcam' },
    { name: 'mirrorCamera', type: 'boolean', value: true },
    { name: 'columns', type: 'number', value: 8, min: 2, max: 16, step: 1 },
    { name: 'rows', type: 'number', value: 4, min: 1, max: 8, step: 1 },
    { name: 'baseNote', type: 'number', value: 48, min: 0, max: 108, step: 1, description: 'lowest note on the board' },
    { name: 'sendMidi', type: 'boolean', value: true, lockDefault: true },
    { name: 'noteDurationMs', type: 'number', value: 140, min: 20, max: 1000, step: 10 },
    { name: 'retriggerMs', type: 'number', value: 90, min: 0, max: 1000, step: 10, description: 'minimum time before the same cell can fire again' },
    { name: 'triggerMode', type: 'select', value: 'cellChange', options: ['cellChange', 'pinch'], description: 'cellChange fires when the finger enters a new cell; pinch requires thumb+index pinch' },
    { name: 'pinchThreshold', type: 'number', value: 0.08, min: 0.02, max: 0.25, step: 0.01 },
    { name: 'boardWidth', type: 'number', value: 1.55, min: 0.4, max: 2.0, step: 0.05 },
    { name: 'boardHeight', type: 'number', value: 0.72, min: 0.2, max: 1.5, step: 0.05 },
    { name: 'boardY', type: 'number', value: 0, min: -0.7, max: 0.7, step: 0.02 },
    { name: 'accentColor', type: 'color', value: '#00ff88' },
    { name: 'midiChannel', type: 'number', value: 1, min: 1, max: 16, step: 1, lockDefault: true },
  ],
};

const ML5_CDN_URL = 'https://cdn.jsdelivr.net/npm/ml5@1.3.1/dist/ml5.min.js';
const HAND_CACHE_KEY = '__vj_hand_pose_midi_board_cache__';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smooth(current, target, amount) {
  return current + (target - current) * clamp(amount, 0, 1);
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
  if (globalThis.ml5 && globalThis.ml5.handPose) return globalThis.ml5;
  await ensureScript(ML5_CDN_URL);
  for (let i = 0; i < 80; i++) {
    if (globalThis.ml5 && globalThis.ml5.handPose) return globalThis.ml5;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('ml5 did not become available');
}

function createHandPoseDetector(ml5) {
  return new Promise((resolve, reject) => {
    let detector = null;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('ml5 handPose model timed out'));
    }, 12000);
    const finish = (result, error) => {
      if (settled) return;
      clearTimeout(timeout);
      if (error || result instanceof Error) { settled = true; reject(error || result); return; }
      settled = true;
      resolve(detector || result);
    };
    try {
      detector = ml5.handPose({ maxHands: 1, runtime: 'tfjs', modelType: 'full' }, finish);
      if (detector && typeof detector.then === 'function') {
        detector.then((d) => finish(d)).catch((e) => finish(null, e));
      } else if (detector && (detector.detect || detector.detectStart)) {
        setTimeout(() => finish(detector), 0);
      }
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
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

function createDefaultHandState() {
  return {
    hasHand: false,
    x: 0.5,
    y: 0.5,
    pinch: 0,
    confidence: 0,
    points: new Float32Array(21 * 2),
    pointCount: 0,
  };
}

function cloneHandState(state) {
  const next = createDefaultHandState();
  if (!state) return next;
  next.hasHand = !!state.hasHand;
  next.x = state.x;
  next.y = state.y;
  next.pinch = state.pinch || 0;
  next.confidence = state.confidence || 0;
  next.pointCount = state.pointCount || 0;
  if (state.points) next.points.set(state.points.subarray ? state.points.subarray(0, next.points.length) : state.points);
  return next;
}

function getHandStateCache() {
  if (!globalThis) return null;
  if (!globalThis[HAND_CACHE_KEY]) globalThis[HAND_CACHE_KEY] = new WeakMap();
  return globalThis[HAND_CACHE_KEY];
}

function cachedHandStateFor(input) {
  const cache = input && typeof input === 'object' ? getHandStateCache() : null;
  return cache && cache.has(input) ? cloneHandState(cache.get(input)) : createDefaultHandState();
}

function storeHandStateFor(input, state) {
  const cache = input && typeof input === 'object' ? getHandStateCache() : null;
  if (cache && state) cache.set(input, cloneHandState(state));
}

function keypoint(hand, fallbackIndex, name) {
  if (!hand) return null;
  if (name && hand[name]) return hand[name];
  const pts = hand.keypoints || [];
  return pts[fallbackIndex] || null;
}

function updateHandState(handState, hand, media, mirrorCamera) {
  const keypoints = hand && hand.keypoints;
  if (!keypoints || keypoints.length < 9) {
    handState.hasHand = false;
    return;
  }
  const vW = mediaWidth(media);
  const vH = mediaHeight(media);
  const indexTip = keypoint(hand, 8, 'index_finger_tip') || keypoints[8];
  const thumbTip = keypoint(hand, 4, 'thumb_tip') || keypoints[4];
  const wrist = keypoint(hand, 0, 'wrist') || keypoints[0];
  const middleMcp = keypoint(hand, 9, 'middle_finger_mcp') || keypoints[9] || wrist;
  if (!indexTip) {
    handState.hasHand = false;
    return;
  }

  const rawX = clamp((indexTip.x || 0) / vW, 0, 1);
  const x = mirrorCamera ? 1 - rawX : rawX;
  const y = clamp((indexTip.y || 0) / vH, 0, 1);
  const handSpan = Math.max(1, Math.hypot((middleMcp.x || 0) - (wrist.x || 0), (middleMcp.y || 0) - (wrist.y || 0)));
  const pinchDist = thumbTip ? Math.hypot((indexTip.x || 0) - (thumbTip.x || 0), (indexTip.y || 0) - (thumbTip.y || 0)) : handSpan;
  const pinch = clamp(1 - (pinchDist / Math.max(1, handSpan)) * 1.8, 0, 1);

  handState.hasHand = true;
  handState.x = smooth(handState.x, x, 0.48);
  handState.y = smooth(handState.y, y, 0.48);
  handState.pinch = smooth(handState.pinch, pinch, 0.5);
  handState.confidence = smooth(handState.confidence, hand.confidence || 1, 0.2);
  handState.pointCount = Math.min(21, keypoints.length);
  for (let i = 0; i < handState.pointCount; i++) {
    const kp = keypoints[i];
    const rawPx = clamp((kp.x || 0) / vW, 0, 1);
    handState.points[i * 2] = mirrorCamera ? 1 - rawPx : rawPx;
    handState.points[i * 2 + 1] = clamp((kp.y || 0) / vH, 0, 1);
  }
}

function noteForCell(cellIndex, baseNote) {
  return clamp(Math.round(baseNote + cellIndex), 0, 127);
}

export default function HandPoseMidiBoard({
  trackingSource = 'auto',
  mirrorCamera = true,
  columns = 8,
  rows = 4,
  baseNote = 48,
  sendMidi = true,
  midiChannel = 1,
  noteDurationMs = 140,
  retriggerMs = 90,
  triggerMode = 'cellChange',
  pinchThreshold = 0.08,
  boardWidth = 1.55,
  boardHeight = 0.72,
  boardY = 0,
  accentColor = '#00ff88',
  videoTexture = null,
  sourceVideoElement = null,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = aspect;
  const halfH = 1;

  const colCount = clamp(Math.floor(Number(columns) || 8), 2, 16);
  const rowCount = clamp(Math.floor(Number(rows) || 4), 1, 8);
  const cellCount = colCount * rowCount;
  const boardW = clamp(Number(boardWidth) || 1.55, 0.4, 2.0) * halfW;
  const boardH = clamp(Number(boardHeight) || 0.72, 0.2, 1.5) * halfH;
  const boardLeft = -boardW * 0.5;
  const boardTop = clamp(Number(boardY) || 0, -0.7, 0.7) + boardH * 0.5;
  const cellW = boardW / colCount;
  const cellH = boardH / rowCount;

  const initialTrackingInput = (sourceVideoElement && typeof HTMLVideoElement !== 'undefined' && sourceVideoElement instanceof HTMLVideoElement)
    ? sourceVideoElement
    : (videoTexture && videoTexture.image);

  const handRef = useRef(cachedHandStateFor(initialTrackingInput));
  const detectorRef = useRef(null);
  const detectionInputRef = useRef(null);
  const detectBusyRef = useRef(false);
  const detectFrameRef = useRef(0);
  const lastCellRef = useRef(-1);
  const lastFireAtRef = useRef(0);
  const pinchArmedRef = useRef(true);
  const cellPulseRef = useRef(new Float32Array(cellCount));

  const cellRef = useRef(null);
  const pointRef = useRef(null);
  const cursorRef = useRef(null);
  const pinchRef = useRef(null);

  useEffect(() => {
    cellPulseRef.current = new Float32Array(cellCount);
    lastCellRef.current = -1;
    pinchArmedRef.current = true;
  }, [cellCount]);

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

    async function startHandPose() {
      try {
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
        if (cancelled || !ml5 || !ml5.handPose) return;
        const detector = await createHandPoseDetector(ml5);
        if (cancelled) return;

        detectorRef.current = detector;
        detectionInputRef.current = input;
        handRef.current = cachedHandStateFor(input);
      } catch (_) {
        handRef.current.hasHand = false;
      }
    }

    startHandPose();
    return () => {
      cancelled = true;
      detectorRef.current = null;
      detectionInputRef.current = null;
      detectBusyRef.current = false;
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { if (ownedVideo) { ownedVideo.srcObject = null; ownedVideo.remove(); } } catch (_) {}
    };
  }, [mirrorCamera, trackingSource, videoTexture && videoTexture.image, sourceVideoElement]);

  const cellGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { cellGeom.dispose(); } catch (_) {} }, [cellGeom]);

  const pointGeom = useMemo(() => new THREE.CircleGeometry(1, 12), []);
  useEffect(() => () => { try { pointGeom.dispose(); } catch (_) {} }, [pointGeom]);

  const cursorGeom = useMemo(() => new THREE.RingGeometry(0.55, 1, 32), []);
  useEffect(() => () => { try { cursorGeom.dispose(); } catch (_) {} }, [cursorGeom]);

  const cellMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => { try { cellMat.dispose(); } catch (_) {} }, [cellMat]);

  const pointMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [accentColor]);
  useEffect(() => () => { try { pointMat.dispose(); } catch (_) {} }, [pointMat]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const accentC = useMemo(() => new THREE.Color(accentColor), [accentColor]);

  useFrame((_state, delta) => {
    const dt = Math.min(0.1, Math.max(0, delta || 0));
    const pulses = cellPulseRef.current;

    if (sourceVideoElement && typeof HTMLVideoElement !== 'undefined' &&
        sourceVideoElement instanceof HTMLVideoElement &&
        detectionInputRef.current !== sourceVideoElement &&
        detectorRef.current) {
      detectionInputRef.current = sourceVideoElement;
      handRef.current = cachedHandStateFor(sourceVideoElement);
    }

    detectFrameRef.current++;
    if (detectFrameRef.current % 2 === 0) {
      const detector = detectorRef.current;
      const input = detectionInputRef.current;
      if (detector && input && !detectBusyRef.current && mediaWidth(input) > 1 && mediaHeight(input) > 1) {
        detectBusyRef.current = true;
        const capturedInput = input;
        Promise.resolve()
          .then(() => detector.detect ? detector.detect(capturedInput) : new Promise((res) => {
            detector.detectStart(capturedInput, (r) => { detector.detectStop(); res(r); });
          }))
          .then((results) => {
            detectBusyRef.current = false;
            updateHandState(handRef.current, Array.isArray(results) ? results[0] : results, capturedInput, mirrorCamera);
            storeHandStateFor(capturedInput, handRef.current);
          })
          .catch(() => { detectBusyRef.current = false; });
      }
    }

    const hand = handRef.current;
    const hx = (hand.x - 0.5) * halfW * 2;
    const hy = (0.5 - hand.y) * halfH * 2;
    const relX = (hx - boardLeft) / boardW;
    const relY = (boardTop - hy) / boardH;
    const inside = hand.hasHand && relX >= 0 && relX < 1 && relY >= 0 && relY < 1;
    const col = inside ? clamp(Math.floor(relX * colCount), 0, colCount - 1) : -1;
    const row = inside ? clamp(Math.floor(relY * rowCount), 0, rowCount - 1) : -1;
    const cell = inside ? row * colCount + col : -1;
    const now = (globalThis.performance && performance.now) ? performance.now() : Date.now();
    const canRetrigger = now - lastFireAtRef.current >= Math.max(0, Number(retriggerMs) || 0);
    const pinchActive = hand.pinch >= pinchThreshold;
    let shouldFire = false;

    if (cell >= 0) {
      if (triggerMode === 'pinch') {
        shouldFire = pinchActive && pinchArmedRef.current && canRetrigger;
        if (pinchActive) pinchArmedRef.current = false;
        if (hand.pinch < pinchThreshold * 0.65) pinchArmedRef.current = true;
      } else {
        shouldFire = cell !== lastCellRef.current && canRetrigger;
      }
    } else {
      if (triggerMode !== 'pinch') lastCellRef.current = -1;
      if (hand.pinch < pinchThreshold * 0.65) pinchArmedRef.current = true;
    }

    if (shouldFire) {
      const midi = sendMidi ? (globalThis && globalThis.VJ_MIDI) : null;
      const note = noteForCell((rowCount - 1 - row) * colCount + col, baseNote);
      const channel = clamp(Math.round(Number(midiChannel) || 1), 1, 16);
      const velocity = clamp(0.45 + (1 - relY) * 0.25 + hand.pinch * 0.3, 0.1, 1);
      if (midi && midi.sendNote) {
        try { midi.sendNote(note, velocity, channel, Math.max(20, Number(noteDurationMs) || 140)); } catch (_) {}
      }
      pulses[cell] = 1;
      lastCellRef.current = cell;
      lastFireAtRef.current = now;
    } else if (cell >= 0 && triggerMode !== 'pinch') {
      lastCellRef.current = cell;
    }

    for (let i = 0; i < pulses.length; i++) pulses[i] = Math.max(0, pulses[i] - dt * 6.5);

    const cells = cellRef.current;
    if (cells) {
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const i = r * colCount + c;
          const p = pulses[i] || 0;
          const active = i === cell;
          const x = boardLeft + (c + 0.5) * cellW;
          const y = boardTop - (r + 0.5) * cellH;
          const scaleX = cellW * (active ? 0.9 : 0.82);
          const scaleY = cellH * (active ? 0.9 : 0.82);
          dummy.position.set(x, y, 0.07 + p * 0.02);
          dummy.scale.set(scaleX, scaleY, 1);
          dummy.updateMatrix();
          cells.setMatrixAt(i, dummy.matrix);

          const brightness = active ? 0.35 + p * 0.65 : 0.08 + p * 0.7;
          tmpColor.copy(accentC).multiplyScalar(brightness);
          if (active && triggerMode === 'pinch' && pinchActive) tmpColor.lerp(new THREE.Color(1, 1, 1), 0.35);
          cells.setColorAt(i, tmpColor);
        }
      }
      cells.instanceMatrix.needsUpdate = true;
      if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
    }

    const points = pointRef.current;
    if (points) {
      for (let i = 0; i < 21; i++) {
        if (!hand.hasHand || i >= hand.pointCount) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          points.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const px = hand.points[i * 2];
        const py = hand.points[i * 2 + 1];
        const x = (px - 0.5) * halfW * 2;
        const y = (0.5 - py) * halfH * 2;
        const isIndex = i === 8;
        dummy.position.set(x, y, 0.12);
        dummy.scale.setScalar(isIndex ? 0.025 : 0.012);
        dummy.updateMatrix();
        points.setMatrixAt(i, dummy.matrix);
        tmpColor.copy(accentC).multiplyScalar(isIndex ? 1.0 : 0.42);
        points.setColorAt(i, tmpColor);
      }
      points.instanceMatrix.needsUpdate = true;
      if (points.instanceColor) points.instanceColor.needsUpdate = true;
    }

    if (cursorRef.current) {
      cursorRef.current.visible = hand.hasHand;
      cursorRef.current.position.set(hx, hy, 0.15);
      const cursorSize = 0.055 + hand.pinch * 0.025;
      cursorRef.current.scale.setScalar(cursorSize);
    }

    if (pinchRef.current) {
      const meterW = boardW * 0.25;
      const fill = meterW * hand.pinch;
      pinchRef.current.visible = hand.hasHand && triggerMode === 'pinch';
      pinchRef.current.scale.set(Math.max(0.001, fill), boardH * 0.025, 1);
      pinchRef.current.position.set(boardLeft + fill * 0.5, boardTop + boardH * 0.06, 0.16);
      pinchRef.current.material.color.setHSL(pinchActive ? 0.33 : 0.08, 1, pinchActive ? 0.65 : 0.35);
    }
  });

  const boardBackGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { boardBackGeom.dispose(); } catch (_) {} }, [boardBackGeom]);

  return React.createElement('group', null,
    React.createElement('mesh', {
      position: [0, clamp(Number(boardY) || 0, -0.7, 0.7), 0.05],
      scale: [boardW, boardH, 1],
    },
      React.createElement('primitive', { object: boardBackGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: '#000000',
        transparent: true,
        opacity: 0.18,
        depthTest: false,
        depthWrite: false,
      })
    ),
    React.createElement('instancedMesh', {
      ref: cellRef,
      args: [cellGeom, cellMat, cellCount],
    }),
    React.createElement('instancedMesh', {
      ref: pointRef,
      args: [pointGeom, pointMat, 21],
    }),
    React.createElement('mesh', { ref: cursorRef, visible: false },
      React.createElement('primitive', { object: cursorGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: accentColor,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ),
    React.createElement('mesh', { ref: pinchRef, visible: false },
      React.createElement('primitive', { object: boardBackGeom, attach: 'geometry' }),
      React.createElement('meshBasicMaterial', {
        color: '#ff8800',
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      })
    )
  );
}
