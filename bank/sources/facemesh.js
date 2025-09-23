// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useRef, useState } = React || {};

export const metadata = {
  name: 'Facemesh',
  description: 'Live webcam feed as a source layer with optional ml5.js FaceMesh overlay.',
  category: 'Sources',
  icon: '',
  author: 'AI',
  version: '2.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'deviceId', type: 'select', value: '', description: 'Camera device', options: [{ value: '', label: 'Default Camera' }], lockDefault: true },
    { name: 'mirror', type: 'boolean', value: true, description: 'Mirror horizontally' },
    { name: 'fitMode', type: 'select', value: 'cover', description: 'Video Size', options: [
      { value: 'none', label: 'Original' }, { value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }, { value: 'tile', label: 'Tile' }
    ] },
    // FaceMesh controls
    { name: 'trackFaces', type: 'boolean', value: true, description: 'Enable ml5 FaceMesh overlay' },
    { name: 'maxFaces', type: 'number', value: 1, description: 'Maximum faces to detect' },
    { name: 'refineLandmarks', type: 'boolean', value: false, description: 'Extra landmarks around eyes and lips' },
    { name: 'showBoxes', type: 'boolean', value: false, description: 'Draw bounding boxes when available' },
    { name: 'pointSize', type: 'number', value: 4, description: 'Landmark point size in px' },
  ],
};

export default function WebcamSourceExternal({
  deviceId = '',
  width = 1280,
  height = 720,
  fps = 30,
  mirror = true,
  fitMode = 'cover',
  // FaceMesh props
  trackFaces = true,
  maxFaces = 1,
  refineLandmarks = false,
  showBoxes = false,
  pointSize = 4,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const videoRef = useRef(null);
  const [videoTexture, setVideoTexture] = useState(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const streamRef = useRef(null);

  // Overlay canvas and texture for landmarks
  const overlayCanvasRef = useRef(null);
  const [overlayTexture, setOverlayTexture] = useState(null);

  // ml5 FaceMesh instance and latest detections
  const faceMeshRef = useRef(null);
  const lastDetectionsRef = useRef([]);

  // Start webcam
  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        const constraints = { video: { deviceId: deviceId || undefined, width, height, frameRate: fps } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) return;
        streamRef.current = stream;

        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        videoRef.current = video;

        if (video.videoWidth && video.videoHeight) setVideoAspect(video.videoWidth / video.videoHeight);

        const tex = new THREE.VideoTexture(video);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.format = THREE.RGBAFormat;
        tex.generateMipmaps = false;
        try {
          (tex).colorSpace = (THREE).SRGBColorSpace || (tex).colorSpace;
          if (!(tex).colorSpace && (THREE).sRGBEncoding) {
            (tex).encoding = (THREE).sRGBEncoding;
          }
        } catch {}
        setVideoTexture(tex);

        // Prepare overlay canvas matched to intrinsic video resolution
        const vw = video.videoWidth || width;
        const vh = video.videoHeight || height;
        const overlay = document.createElement('canvas');
        overlay.width = Math.max(2, vw);
        overlay.height = Math.max(2, vh);
        overlayCanvasRef.current = overlay;

        const otex = new THREE.CanvasTexture(overlay);
        otex.minFilter = THREE.LinearFilter;
        otex.magFilter = THREE.LinearFilter;
        otex.format = THREE.RGBAFormat;
        otex.needsUpdate = true;
        try {
          (otex).colorSpace = (THREE).SRGBColorSpace || (otex).colorSpace;
          if (!(otex).colorSpace && (THREE).sRGBEncoding) {
            (otex).encoding = (THREE).sRGBEncoding;
          }
        } catch {}
        setOverlayTexture(otex);
      } catch (e) {
        try { console.error('Webcam start failed', e); } catch {}
      }
    };
    start();
    return () => {
      mounted = false;
      try { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      setVideoTexture(null);
      destroyFaceMesh();
      setOverlayTexture(null);
    };
  }, [deviceId, width, height, fps]);

  // Keep textures fresh and resize overlay if stream dimensions change
  useFrame(() => {
    if (videoTexture && videoRef.current && videoRef.current.readyState >= 2) {
      videoTexture.needsUpdate = true;
      if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
        const a = videoRef.current.videoWidth / videoRef.current.videoHeight;
        if (Math.abs(a - videoAspect) > 0.001) {
          setVideoAspect(a);
          // Resize overlay to match any change in stream dimensions
          if (overlayCanvasRef.current) {
            overlayCanvasRef.current.width = videoRef.current.videoWidth;
            overlayCanvasRef.current.height = videoRef.current.videoHeight;
          }
        }
      }
    }
    if (overlayTexture) overlayTexture.needsUpdate = true;
  });

  // Start or stop ml5 FaceMesh when toggled or when video becomes ready
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!trackFaces) {
        destroyFaceMesh();
        clearOverlay();
        return;
      }
      // Ensure ml5 is available (load from CDN if needed)
      const ok = await ensureMl5Loaded();
      if (!ok || !globalThis.ml5 || cancelled) return;
      if (!videoRef.current) return;
      // Recreate FaceMesh with current options
      createOrRestartFaceMesh();
    })();
    return () => {
      cancelled = true;
      // Cleanup on prop change
      destroyFaceMesh();
      clearOverlay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackFaces, maxFaces, refineLandmarks, mirror]);

  function createOrRestartFaceMesh() {
    (async () => {
      try {
        destroyFaceMesh();
        const vid = videoRef.current;
        if (!vid) return;
        // Wait until video is ready
        let tries = 0;
        while (tries < 40 && (!vid.readyState || vid.readyState < 2)) {
          await new Promise(r => setTimeout(r, 50));
          tries++;
        }
        // Options per ml5 FaceMesh reference (runtime mediapipe w/ solution path)
        const options = {
          maxFaces: Math.max(1, maxFaces | 0),
          refineLandmarks: !!refineLandmarks,
          flipHorizontal: !!mirror,
          runtime: 'mediapipe',
          // Explicit solution path so assets load from CDN we allow via CSP
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        };
        faceMeshRef.current = globalThis.ml5.faceMesh(options);
        // Start streaming detections
        faceMeshRef.current.detectStart(vid, gotFaces);
      } catch (e) {
        try { console.warn('Failed to start ml5.faceMesh', e); } catch {}
        faceMeshRef.current = null;
      }
    })();
  }

  function destroyFaceMesh() {
    try {
      // ml5 FaceMesh does not document a destroy API in all builds.
      // Stop streaming by calling detectStop if present.
      if (faceMeshRef.current?.detectStop) {
        faceMeshRef.current.detectStop();
      }
    } catch {}
    faceMeshRef.current = null;
  }

  // Callback from ml5.faceMesh
  function gotFaces(results) {
    lastDetectionsRef.current = Array.isArray(results) ? results : [];
    drawOverlay(lastDetectionsRef.current);
  }

  function clearOverlay() {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (overlayTexture) overlayTexture.needsUpdate = true;
  }

  function drawOverlay(detections) {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror overlay to match mirrored video if requested
    if (mirror) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
    ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';

    for (let i = 0; i < detections.length; i++) {
      const face = detections[i] || {};

      // Optional bounding box if available on this build
      if (showBoxes && face.box) {
        const { xMin, yMin, width: w, height: h } = face.box;
        ctx.strokeRect(xMin, yMin, w, h);
      }

      // Draw landmarks (support different output shapes)
      let kps = face.keypoints || face.scaledMesh || [];
      if (Array.isArray(kps)) {
        for (let j = 0; j < kps.length; j++) {
          const k = kps[j];
          const x = (k && (k.x != null ? k.x : k[0]));
          const y = (k && (k.y != null ? k.y : k[1]));
          if (x == null || y == null) continue;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, pointSize), 0, Math.PI * 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (mirror) ctx.restore();

    if (overlayTexture) overlayTexture.needsUpdate = true;
  }

  // Three scene sizing and UV management
  const { size } = useThree();
  const compositionAspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9);
  const planeW = compositionAspect * 2;
  const planeH = 2;

  // Compute mesh scale based on fitMode
  let scaleX = 1, scaleY = 1;
  if (fitMode === 'contain') {
    if (videoAspect > compositionAspect) scaleY = compositionAspect / videoAspect;
    else scaleX = videoAspect / compositionAspect;
  } else if (fitMode === 'none') {
    const compWpx = size.width || 1;
    const compHpx = size.height || 1;
    const vW = (videoRef.current?.videoWidth || width);
    const vH = (videoRef.current?.videoHeight || height);
    scaleX = Math.max(0.0001, vW / compWpx);
    scaleY = Math.max(0.0001, vH / compHpx);
  }

  // Apply repeat and cropping based on fitMode
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
      let tileW = planeW, tileH = planeH;
      const wFit = planeH * videoAspect;
      if (wFit <= planeW) { tileW = wFit; tileH = planeH; }
      else { tileW = planeW; tileH = planeW / videoAspect; }
      let repX = Math.max(0.0001, planeW / tileW);
      let repY = Math.max(0.0001, planeH / tileH);
      tex.repeat.set(repX, repY); tex.offset.set(0, 0); tex.needsUpdate = true; return;
    }
    // contain, stretch, none
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(1, 1); tex.offset.set(0, 0); tex.needsUpdate = true;
  }, [videoTexture, fitMode, planeW, planeH, videoAspect, compositionAspect]);

  // Render base video mesh and overlay mesh on top
  const baseMesh = videoTexture ? (
    React.createElement('mesh', { scale: [ (mirror ? -1 : 1) * scaleX, scaleY, 1 ] },
      React.createElement('planeGeometry', { args: [planeW, planeH] }),
      React.createElement('meshBasicMaterial', { map: videoTexture, transparent: false, side: THREE.DoubleSide })
    )
  ) : null;

  const overlayMesh = (overlayTexture && trackFaces) ? (
    React.createElement('mesh', { scale: [ (mirror ? -1 : 1) * scaleX, scaleY, 1 ], position: [0, 0, 0.001] },
      React.createElement('planeGeometry', { args: [planeW, planeH] }),
      React.createElement('meshBasicMaterial', { map: overlayTexture, transparent: true, opacity: 1, side: THREE.DoubleSide })
    )
  ) : null;

  return React.createElement(React.Fragment, null, baseMesh, overlayMesh);
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
    const md = metadata;
    if (md?.parameters) {
      const idx = md.parameters.findIndex((p) => p.name === 'deviceId');
      if (idx >= 0) { md.parameters[idx] = { ...md.parameters[idx], options }; }
    }
  } catch {}
})();

// Ensure ml5 global is present by injecting the CDN script when needed
async function ensureMl5Loaded() {
  try { if (globalThis.ml5) return true; } catch {}
  const CDN = 'https://cdn.jsdelivr.net/npm/ml5@latest/dist/ml5.min.js';
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
    return !!globalThis.ml5;
  } catch (e) {
    try { console.warn('Failed to load ml5 from CDN', e); } catch {}
    return false;
  }
}
