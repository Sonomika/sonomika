// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Webcam Source + FaceTrack',
  description: 'Live webcam feed as a source layer with optional face tracking (face-api.js).',
  category: 'Sources',
  icon: '',
  author: 'AI',
  version: '1.1.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'deviceId', type: 'select', value: '', description: 'Camera device', options: [{ value: '', label: 'Default Camera' }], lockDefault: true },
    { name: 'mirror', type: 'boolean', value: true, description: 'Mirror horizontally' },
    { name: 'fitMode', type: 'select', value: 'cover', description: 'Video Size', options: [
      { value: 'none', label: 'Original' }, { value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }, { value: 'tile', label: 'Tile' }
    ] },
    { name: 'enableFaceTrack', type: 'boolean', value: false, description: 'Enable face tracking (loads face-api models from CDN)' },
  ],
};

export default function WebcamSource({ deviceId = '', width = 1280, height = 720, fps = 30, mirror = true, fitMode = 'cover', enableFaceTrack = false }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const videoRef = useRef(null);
  const [videoTexture, setVideoTexture] = useState(null);
  const [videoAspect, setVideoAspect] = useState(16/9);
  const streamRef = useRef(null);

  // face tracking state
  const faceModelsLoadedRef = useRef(false);
  const detectLoopRef = useRef(null);
  const [facePos, setFacePos] = useState(null); // in normalized video coords {x:0..1, y:0..1}
  const faceDetRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        const constraints = { video: { deviceId: deviceId || undefined, width, height, frameRate: fps } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) return;
        streamRef.current = stream;
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true;
        video.srcObject = stream; await video.play().catch(()=>{});
        videoRef.current = video;
        if (video.videoWidth && video.videoHeight) setVideoAspect(video.videoWidth / video.videoHeight);
        let tex = new THREE.VideoTexture(video);
        tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.format = THREE.RGBAFormat; tex.generateMipmaps = false;
        try { (tex).colorSpace = (THREE).SRGBColorSpace || (tex).colorSpace; if (!(tex).colorSpace && (THREE).sRGBEncoding) { (tex).encoding = (THREE).sRGBEncoding; } } catch {}
        setVideoTexture(tex);
      } catch (e) {
        try { console.error('Webcam start failed', e); } catch {}
      }
    };
    start();
    return () => {
      mounted = false;
      try { if (streamRef.current) streamRef.current.getTracks().forEach((t)=>t.stop()); } catch {}
      setVideoTexture(null);
    };
  }, [deviceId, width, height, fps]);

  // load face-api script and models if requested
  useEffect(() => {
    if (!enableFaceTrack) return;
    let cancelled = false;
    const CDN_SCRIPT = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    const MODELS_BASE = 'https://justadudewhohacks.github.io/face-api.js/models'; // demo host that serves the prebuilt models

    async function loadScript() {
      if (window.faceapi) return window.faceapi;
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = CDN_SCRIPT;
        s.async = true;
        s.onload = () => { if (window.faceapi) resolve(window.faceapi); else reject(new Error('faceapi failed to load')); };
        s.onerror = (err) => reject(err);
        document.head.appendChild(s);
      });
    }

    const setupModelsAndLoop = async () => {
      try {
        await loadScript();
        if (cancelled) return;
        const faceapi = window.faceapi;
        // load tiny face detector + landmarks
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_BASE),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_BASE)
        ]);
        faceModelsLoadedRef.current = true;

        // detection loop
        const detect = async () => {
          try {
            const vid = videoRef.current;
            if (!vid || vid.readyState < 2) {
              detectLoopRef.current = setTimeout(detect, 200);
              return;
            }
            // run detection
            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });
            const results = await faceapi.detectAllFaces(vid, options).withFaceLandmarks(true);
            if (results && results.length > 0) {
              // pick first face
              const r = results[0];
              const b = r.detection.box;
              const cx = b.x + b.width / 2;
              const cy = b.y + b.height / 2;
              const vw = vid.videoWidth || vid.width || width;
              const vh = vid.videoHeight || vid.height || height;
              const nx = Math.max(0, Math.min(1, cx / vw));
              const ny = Math.max(0, Math.min(1, cy / vh));
              faceDetRef.current = { box: { x: b.x, y: b.y, width: b.width, height: b.height }, landmarks: r.landmarks, score: r.detection.score };
              setFacePos({ x: nx, y: ny });
              // expose to window for other effects
              window.__faceTracker = { normalizedCenter: { x: nx, y: ny }, detection: faceDetRef.current, timestamp: Date.now() };
            } else {
              faceDetRef.current = null;
              setFacePos(null);
              window.__faceTracker = { normalizedCenter: null, detection: null, timestamp: Date.now() };
            }
          } catch (e) {
            // detection sometimes fails; ignore and continue
            console.warn('face detect error', e);
          } finally {
            // schedule next detection
            detectLoopRef.current = setTimeout(detect, 120); // ~8-10 fps
          }
        };

        detect();
      } catch (e) {
        console.warn('Face tracking setup failed', e);
        faceModelsLoadedRef.current = false;
      }
    };

    setupModelsAndLoop();

    return () => {
      cancelled = true;
      faceModelsLoadedRef.current = false;
      if (detectLoopRef.current) { clearTimeout(detectLoopRef.current); detectLoopRef.current = null; }
      try { delete window.__faceTracker; } catch {}
    };
  }, [enableFaceTrack, width, height]);

  useFrame(() => {
    if (videoTexture && videoRef.current && videoRef.current.readyState >= 2) {
      videoTexture.needsUpdate = true;
      if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
        const a = videoRef.current.videoWidth / videoRef.current.videoHeight;
        if (Math.abs(a - videoAspect) > 0.001) setVideoAspect(a);
      }
    }
  });

  const { size } = useThree();
  const compositionAspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16/9);
  const planeW = compositionAspect * 2;
  const planeH = 2;

  // Compute mesh scale based on fitMode
  let scaleX = 1, scaleY = 1;
  if (fitMode === 'contain') {
    if (videoAspect > compositionAspect) scaleY = compositionAspect / videoAspect; else scaleX = videoAspect / compositionAspect;
  } else if (fitMode === 'none') {
    const compWpx = size.width || 1; const compHpx = size.height || 1; const vW = (videoRef.current?.videoWidth || width); const vH = (videoRef.current?.videoHeight || height); scaleX = Math.max(0.0001, vW / compWpx); scaleY = Math.max(0.0001, vH / compHpx);
  }

  // Apply repeat/cropping based on fitMode
  useEffect(() => {
    if (!videoTexture) return;
    const tex = videoTexture;
    if (fitMode === 'cover') {
      tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      let repX = 1, repY = 1, offX = 0, offY = 0;
      if (videoAspect > compositionAspect) { repX = Math.max(0.0001, compositionAspect / videoAspect); repY = 1; offX = (1 - repX) / 2; }
      else if (videoAspect < compositionAspect) { repX = 1; repY = Math.max(0.0001, videoAspect / compositionAspect); offY = (1 - repY) / 2; }
      tex.repeat.set(repX, repY); tex.offset.set(offX, offY); tex.needsUpdate = true; return;
    }
    if (fitMode === 'tile') {
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
      let tileW = planeW, tileH = planeH; const wFit = planeH * videoAspect; if (wFit <= planeW) { tileW = wFit; tileH = planeH; } else { tileW = planeW; tileH = planeW / videoAspect; }
      let repX = Math.max(0.0001, planeW / tileW); let repY = Math.max(0.0001, planeH / tileH);
      tex.repeat.set(repX, repY); tex.offset.set(0, 0); tex.needsUpdate = true; return;
    }
    // contain, stretch, none
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(1,1); tex.offset.set(0,0); tex.needsUpdate = true;
  }, [videoTexture, fitMode, planeW, planeH, videoAspect, compositionAspect]);

  // Compute tracker mesh position in plane coordinates when facePos updates
  const trackerPosition = useMemo(() => {
    if (!facePos) return null;
    // facePos.x and facePos.y are normalized in video pixel coords: x 0..1 left->right, y 0..1 top->bottom
    // plane spans planeW x planeH centred at 0, so convert:
    // posX = (nx - 0.5) * planeW; posY = (0.5 - ny) * planeH
    const nx = facePos.x;
    const ny = facePos.y;
    const posX = (nx - 0.5) * planeW;
    const posY = (0.5 - ny) * planeH;
    return [posX, posY, 0.01];
  }, [facePos, planeW, planeH]);

  // The returned object is a group scaled the same as the plane, so child positions map directly to plane coords.
  return videoTexture ? (
    React.createElement('group', { scale: [ (mirror ? -1 : 1) * scaleX, scaleY, 1 ] },
      // Video plane
      React.createElement('mesh', { position: [0, 0, 0] },
        React.createElement('planeGeometry', { args: [planeW, planeH] }),
        React.createElement('meshBasicMaterial', { map: videoTexture, transparent: false, side: THREE.DoubleSide })
      ),
      // Face tracker sphere - only visible when enabled and a face is detected
      (enableFaceTrack && trackerPosition) ? React.createElement('mesh', { position: trackerPosition },
        React.createElement('sphereGeometry', { args: [0.03, 8, 8] }),
        React.createElement('meshBasicMaterial', { color: 0xff0000 })
      ) : null
    )
  ) : null;
}

// Populate camera options dynamically
(async function populateCameraOptions(){
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
    const options = [{ value: '', label: 'Default Camera' }].concat(
      videoInputs.map((d, i) => ({ value: d.deviceId || '', label: d.label || `Camera ${i + 1}` }))
    );
    const md = metadata; if (md?.parameters) {
      const idx = md.parameters.findIndex((p) => p.name === 'deviceId'); if (idx >= 0) { md.parameters[idx] = { ...md.parameters[idx], options }; }
    }
  } catch {}
})();
