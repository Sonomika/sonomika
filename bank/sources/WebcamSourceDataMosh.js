const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Webcam Source Datamosh',
  description: 'Live webcam feed using WebCodecs encoder/decoder pipeline (falls back to VideoTexture if unavailable). Supports speed multiplier and requesting keyframes.',
  category: 'Sources',
  icon: '',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'deviceId', type: 'select', value: '', description: 'Camera device', options: [{ value: '', label: 'Default Camera' }], lockDefault: true },
    { name: 'mirror', type: 'boolean', value: true, description: 'Mirror horizontally' },
    { name: 'fitMode', type: 'select', value: 'cover', description: 'Video Size', options: [
      { value: 'none', label: 'Original' }, { value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }, { value: 'tile', label: 'Tile' }
    ] },
    { name: 'speed', type: 'range', value: 2, description: 'Playback speed multiplier (how many times non-key frames are decoded)', min: 1, max: 10, step: 1 },
    { name: 'requestKeyframe', type: 'boolean', value: false, description: 'Set to true to request a keyframe on next encode' },
  ],
};

export default function WebcamSourceWebCodecs({
  deviceId = '',
  width = 1280,
  height = 720,
  fps = 30,
  mirror = true,
  fitMode = 'cover',
  speed = 2,
  requestKeyframe = false,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null); // offscreen canvas to draw decoded frames
  const canvasTexRef = useRef(null);
  const [tex, setTex] = useState(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);

  // WebCodecs refs
  const encoderRef = useRef(null);
  const decoderRef = useRef(null);
  const isWebCodecsReadyRef = useRef(false);
  const useKeyFrameRef = useRef(false);
  const pendingRequestKeyframeRef = useRef(false);

  // Start webcam and prepare <video>
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const constraints = { video: { deviceId: deviceId || undefined, width, height, frameRate: fps } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        videoRef.current = video;
        // update aspect
        if (video.videoWidth && video.videoHeight) setVideoAspect(video.videoWidth / video.videoHeight);

        // create offscreen canvas for decoded frames
        const cvs = document.createElement('canvas');
        cvs.width = width;
        cvs.height = height;
        canvasRef.current = cvs;
        const ctx = cvs.getContext('2d');
        // optional initial clear
        ctx.clearRect(0, 0, cvs.width, cvs.height);

        // create CanvasTexture for three.js mesh
        const canvasTex = new THREE.CanvasTexture(cvs);
        canvasTex.minFilter = THREE.LinearFilter; canvasTex.magFilter = THREE.LinearFilter; canvasTex.generateMipmaps = false;
        try { (canvasTex).colorSpace = (THREE).SRGBColorSpace || (canvasTex).colorSpace; } catch {}
        canvasTexRef.current = canvasTex;
        setTex(canvasTex);

        // If WebCodecs available, set up encoder/decoder
        if (window.VideoEncoder && window.VideoDecoder && window.VideoFrame) {
          try {
            // Decoder
            const decoder = new VideoDecoder({
              output: async (frame) => {
                // draw decoded frame to canvas
                try {
                  // lock canvas size to frame
                  const w = frame.codedWidth || cvs.width;
                  const h = frame.codedHeight || cvs.height;
                  if (cvs.width !== w || cvs.height !== h) {
                    cvs.width = w; cvs.height = h;
                  }
                  const ctx2 = cvs.getContext('2d');
                  ctx2.save();
                  if (mirror) {
                    ctx2.clearRect(0, 0, cvs.width, cvs.height);
                    ctx2.translate(cvs.width, 0);
                    ctx2.scale(-1, 1);
                  } else {
                    ctx2.clearRect(0, 0, cvs.width, cvs.height);
                  }
                  // Use createImageBitmap for better compatibility
                  try {
                    const bitmap = await createImageBitmap(frame);
                    ctx2.drawImage(bitmap, 0, 0, cvs.width, cvs.height);
                    bitmap.close && bitmap.close();
                  } catch (e) {
                    // fallback: attempt to draw VideoFrame directly
                    try {
                      ctx2.drawImage(frame, 0, 0, cvs.width, cvs.height);
                    } catch {}
                  }
                  if (mirror) ctx2.restore();
                  frame.close();
                  // update texture
                  if (canvasTexRef.current) canvasTexRef.current.needsUpdate = true;
                } catch (err) {
                  try { frame.close(); } catch {}
                }
              },
              error: (err) => console.error('Decoder error:', err),
            });
            decoder.configure({ codec: 'vp8' });
            decoderRef.current = decoder;

            // Encoder
            const encoder = new VideoEncoder({
              output: (chunk) => {
                // handle encoded chunk: decode it (once for keyframes, multiple times for non-key to create speed multiplication)
                if (!decoderRef.current) return;
                try {
                  if (chunk.type === 'key') {
                    decoderRef.current.decode(chunk);
                  } else {
                    // decode multiple times to emulate "speed" repetition
                    const n = Math.max(1, Math.round(speed || 1));
                    for (let i = 0; i < n; i++) {
                      // Each decode uses the same EncodedVideoChunk object - that's okay per spec
                      decoderRef.current.decode(chunk);
                    }
                  }
                } catch (e) {
                  // decoding may throw if queue is full or not ready
                  console.error('Decode error while handling chunk:', e);
                }
              },
              error: (err) => console.error('Encoder error:', err),
            });

            encoder.configure({
              codec: 'vp8',
              width: width,
              height: height,
            });
            encoderRef.current = encoder;
            isWebCodecsReadyRef.current = true;
          } catch (e) {
            console.warn('WebCodecs setup failed, falling back to VideoTexture:', e);
            isWebCodecsReadyRef.current = false;
          }
        } else {
          isWebCodecsReadyRef.current = false;
        }
      } catch (e) {
        console.error('Webcam start failed', e);
      }
    })();

    return () => {
      mounted = false;
      try { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      try { if (encoderRef.current) { encoderRef.current.close(); encoderRef.current = null; } } catch {}
      try { if (decoderRef.current) { decoderRef.current.close(); decoderRef.current = null; } } catch {}
      try { if (canvasTexRef.current) { canvasTexRef.current.dispose && canvasTexRef.current.dispose(); canvasTexRef.current = null; } } catch {}
      setTex(null);
    };
  }, [deviceId, width, height, fps, mirror]); // recreate on size/camera changes

  // react to requestKeyframe prop: if toggled true, set flag to request keyframe on next encode
  useEffect(() => {
    if (requestKeyframe) {
      pendingRequestKeyframeRef.current = true;
    }
  }, [requestKeyframe]);

  // update speed when prop changes
  useEffect(() => {
    // nothing to do here except let encoder output handler read 'speed' from closure.
    // but to ensure the latest value is used when encoding, we can store in ref if needed.
  }, [speed]);

  // Main encode loop using r3f useFrame so it ticks with render loop
  useFrame(() => {
    const video = videoRef.current;
    if (!video) return;

    // if WebCodecs available use encoder pipeline, otherwise update a regular VideoTexture with video directly
    if (!isWebCodecsReadyRef.current) {
      // fallback: if no WebCodecs, create/update video texture if not already created
      if (!tex) {
        // create THREE.VideoTexture from video element
        try {
          const vtex = new THREE.VideoTexture(video);
          vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
          try { (vtex).colorSpace = (THREE).SRGBColorSpace || (vtex).colorSpace; } catch {}
          setTex(vtex);
          canvasTexRef.current = vtex;
        } catch (e) {
          // ignore
        }
      } else {
        // ensure needsUpdate (VideoTexture normally updates automatically)
        tex.needsUpdate = true;
      }
      return;
    }

    // If WebCodecs pipeline is ready:
    if (!encoderRef.current || encoderRef.current.state === 'closed') return;
    try {
      // create VideoFrame from video element
      // prefer new VideoFrame(video) if available
      let frame = null;
      try {
        frame = new VideoFrame(video);
      } catch (e) {
        // fallback: draw video to temp canvas and create VideoFrame from that
        const tmp = document.createElement('canvas');
        tmp.width = video.videoWidth || width;
        tmp.height = video.videoHeight || height;
        const ctx = tmp.getContext('2d');
        if (mirror) {
          ctx.save();
          ctx.translate(tmp.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, tmp.width, tmp.height);
        if (mirror) ctx.restore();
        try {
          frame = new VideoFrame(tmp);
        } catch (err) {
          // give up this tick
          return;
        }
      }

      // if a keyframe was requested, set keyFrame option for this encode
      let keyOpt = false;
      if (pendingRequestKeyframeRef.current) {
        keyOpt = true;
        pendingRequestKeyframeRef.current = false;
      }

      encoderRef.current.encode(frame, { keyFrame: keyOpt });
      frame.close && frame.close();
    } catch (err) {
      // could fail if encoder queue is full or not configured yet
      // console.debug('encode skip', err);
    }
  });

  // Compute plane geometry and scale similar to template
  const { size } = useThree();
  const compositionAspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9);
  const planeW = compositionAspect * 2;
  const planeH = 2;

  // Compute mesh scale based on fitMode and videoAspect
  let scaleX = 1, scaleY = 1;
  if (fitMode === 'contain') {
    if (videoAspect > compositionAspect) scaleY = compositionAspect / videoAspect; else scaleX = videoAspect / compositionAspect;
  } else if (fitMode === 'none') {
    const compWpx = size.width || 1; const compHpx = size.height || 1; const vW = (videoRef.current?.videoWidth || width); const vH = (videoRef.current?.videoHeight || height); scaleX = Math.max(0.0001, vW / compWpx); scaleY = Math.max(0.0001, vH / compHpx);
  }

  // Apply repeat/cropping based on fitMode for CanvasTexture or VideoTexture
  useEffect(() => {
    if (!tex) return;
    const t = tex;
    if (fitMode === 'cover') {
      t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      let repX = 1, repY = 1, offX = 0, offY = 0;
      if (videoAspect > compositionAspect) { repX = Math.max(0.0001, compositionAspect / videoAspect); repY = 1; offX = (1 - repX) / 2; }
      else if (videoAspect < compositionAspect) { repX = 1; repY = Math.max(0.0001, videoAspect / compositionAspect); offY = (1 - repY) / 2; }
      t.repeat.set(repX, repY); t.offset.set(offX, offY); t.needsUpdate = true; return;
    }
    if (fitMode === 'tile') {
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
      let tileW = planeW, tileH = planeH; const wFit = planeH * videoAspect; if (wFit <= planeW) { tileW = wFit; tileH = planeH; } else { tileW = planeW; tileH = planeW / videoAspect; }
      let repX = Math.max(0.0001, planeW / tileW); let repY = Math.max(0.0001, planeH / tileH);
      t.repeat.set(repX, repY); t.offset.set(0, 0); t.needsUpdate = true; return;
    }
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1,1); t.offset.set(0,0); t.needsUpdate = true;
  }, [tex, fitMode, planeW, planeH, videoAspect, compositionAspect]);

  // Render mesh using the prepared texture (CanvasTexture or VideoTexture).
  return tex ? (
    React.createElement('mesh', { scale: [ (mirror ? -1 : 1) * scaleX, scaleY, 1 ] },
      React.createElement('planeGeometry', { args: [planeW, planeH] }),
      React.createElement('meshBasicMaterial', { map: tex, transparent: false, side: THREE.DoubleSide })
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