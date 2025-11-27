// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Webcam Echo Datamosh',
  description: 'Live webcam with WebCodecs datamosh repetition + canvas feedback echoes (falls back to VideoTexture). Supports speed multiplier, keyframe request, echo decay, copies, rotation and slight scale per echo.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'deviceId', type: 'select', value: '', description: 'Camera device', options: [{ value: '', label: 'Default Camera' }], lockDefault: true },
    { name: 'mirror', type: 'boolean', value: false, description: 'Mirror horizontally' },
    { name: 'fitMode', type: 'select', value: 'tile', description: 'Video Size', options: [
      { value: 'none', label: 'Original' }, { value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }, { value: 'tile', label: 'Tile' }
    ] },
    { name: 'speed', type: 'number', value: 2, description: 'Datamosh speed multiplier (repeats non-key frames)', min: 1, max: 10, step: 1 },
    { name: 'requestKeyframe', type: 'boolean', value: true, description: 'Set to true to request a keyframe on next encode' },
    { name: 'trailDecay', type: 'number', value: 0.81, description: 'Echo decay alpha per frame (0..1, lower = longer trail)', min: 0.5, max: 0.99, step: 0.01 },
    { name: 'copies', type: 'number', value: 1, description: 'Number of echo layers drawn each frame', min: 1, max: 12, step: 1 },
    { name: 'echoRotate', type: 'number', value: 0.007, description: 'Rotation per echo (radians)', min: 0, max: 0.2, step: 0.001 },
    { name: 'echoScale', type: 'number', value: 0.946, description: 'Scale multiplier per echo', min: 0.9, max: 1, step: 0.0005 },
  ],
};

export default function WebcamEchoDatamosh({
  deviceId = '',
  width = 1280,
  height = 720,
  fps = 30,
  mirror = false,
  fitMode = 'tile',
  speed = 2,
  requestKeyframe = true,
  trailDecay = 0.81,
  copies = 1,
  echoRotate = 0.007,
  echoScale = 0.946,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // main canvas that will be the texture shown in scene
  const canvasRef = useRef(null);
  const canvasTexRef = useRef(null);

  // ping canvas to hold previous frame for feedback
  const pingRef = useRef(null);

  const [tex, setTex] = useState(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);

  // WebCodecs
  const encoderRef = useRef(null);
  const decoderRef = useRef(null);
  const isWCRef = useRef(false);
  const pendingKeyframeRef = useRef(false);

  // Start webcam and set up canvases + WebCodecs
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const constraints = { video: { deviceId: deviceId || undefined, width, height, frameRate: fps } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        videoRef.current = video;
        if (video.videoWidth && video.videoHeight) setVideoAspect(video.videoWidth / video.videoHeight);

        // main canvas
        const cvs = document.createElement('canvas');
        cvs.width = width;
        cvs.height = height;
        const ctx = cvs.getContext('2d');
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        canvasRef.current = cvs;

        // ping canvas (stores previous composite)
        const ping = document.createElement('canvas');
        ping.width = width;
        ping.height = height;
        const pctx = ping.getContext('2d');
        pctx.clearRect(0, 0, ping.width, ping.height);
        pingRef.current = ping;

        const canvasTex = new THREE.CanvasTexture(cvs);
        canvasTex.minFilter = THREE.LinearFilter; canvasTex.magFilter = THREE.LinearFilter; canvasTex.generateMipmaps = false;
        try { (canvasTex).colorSpace = (THREE).SRGBColorSpace || canvasTex.colorSpace; } catch {}
        canvasTexRef.current = canvasTex;
        setTex(canvasTex);

        // try WebCodecs
        if (window.VideoEncoder && window.VideoDecoder && window.VideoFrame) {
          try {
            // Decoder
            const decoder = new VideoDecoder({
              output: async (frame) => {
                // draw decoded frame + feedback echoes to main canvas
                try {
                  const cvsLocal = canvasRef.current;
                  const pingLocal = pingRef.current;
                  if (!cvsLocal || !pingLocal) {
                    frame.close && frame.close();
                    return;
                  }
                  // ensure canvas size matches
                  const w = frame.codedWidth || cvsLocal.width;
                  const h = frame.codedHeight || cvsLocal.height;
                  if (cvsLocal.width !== w || cvsLocal.height !== h) {
                    cvsLocal.width = pingLocal.width = w;
                    cvsLocal.height = pingLocal.height = h;
                  }
                  const ctx2 = cvsLocal.getContext('2d');
                  // draw previous composite with slight globalAlpha for decay
                  ctx2.save();
                  ctx2.clearRect(0, 0, cvsLocal.width, cvsLocal.height);

                  // draw several echoes from ping canvas with rotation/scale and alpha multiplication
                  const pctx2 = pingLocal.getContext('2d');
                  // We will composite: start with a faded copy of previous framebuffer
                  ctx2.globalCompositeOperation = 'source-over';
                  ctx2.globalAlpha = 1.0;
                  // draw a faded baseline of previous frame
                  ctx2.drawImage(pingLocal, 0, 0, cvsLocal.width, cvsLocal.height);
                  // apply decay overlay (draw a semi-transparent rect to slowly fade)
                  ctx2.fillStyle = `rgba(0,0,0,${1 - Math.min(0.999, Math.max(0, trailDecay))})`;
                  ctx2.fillRect(0, 0, cvsLocal.width, cvsLocal.height);

                  // get bitmap of decoded frame for better draw performance if possible
                  let bitmap = null;
                  try { bitmap = await createImageBitmap(frame); } catch (e) {}

                  // draw central fresh frame (the live frame) onto an offscreen small context to be used for echoes
                  const sourceCanvas = document.createElement('canvas');
                  sourceCanvas.width = cvsLocal.width;
                  sourceCanvas.height = cvsLocal.height;
                  const sctx = sourceCanvas.getContext('2d');
                  if (mirror) {
                    sctx.save();
                    sctx.translate(sourceCanvas.width, 0);
                    sctx.scale(-1, 1);
                  }
                  if (bitmap) {
                    sctx.drawImage(bitmap, 0, 0, sourceCanvas.width, sourceCanvas.height);
                    bitmap.close && bitmap.close();
                  } else {
                    // fallback: attempt to draw frame directly
                    try { sctx.drawImage(frame, 0, 0, sourceCanvas.width, sourceCanvas.height); } catch {}
                  }
                  if (mirror) sctx.restore();

                  // draw multiple echoes: progressively transform and draw with additive blending
                  // we draw from farthest (most decayed) to nearest.
                  ctx2.globalCompositeOperation = 'lighter';
                  let currentAlpha = 0.6; // base alpha for echoes
                  const alphaStep = (1 - Math.max(0, trailDecay)) / Math.max(1, copies);
                  for (let i = copies - 1; i >= 0; i--) {
                    const scaleFactor = Math.pow(echoScale, i);
                    const rot = echoRotate * (i); // small rotation per echo
                    const dx = (1 - scaleFactor) * cvsLocal.width * 0.5;
                    const dy = (1 - scaleFactor) * cvsLocal.height * 0.5;

                    ctx2.save();
                    ctx2.translate(cvsLocal.width / 2, cvsLocal.height / 2);
                    ctx2.rotate(rot);
                    ctx2.translate(-cvsLocal.width / 2, -cvsLocal.height / 2);
                    ctx2.globalAlpha = Math.max(0, currentAlpha - i * alphaStep);
                    ctx2.drawImage(sourceCanvas,
                      dx, dy, cvsLocal.width * scaleFactor, cvsLocal.height * scaleFactor);
                    ctx2.restore();
                  }

                  // finally draw the freshest frame in source-over to keep clarity
                  ctx2.globalCompositeOperation = 'source-over';
                  ctx2.globalAlpha = 1.0;
                  ctx2.drawImage(sourceCanvas, 0, 0, cvsLocal.width, cvsLocal.height);

                  // update ping: copy current canvas into ping for next frame
                  const pctx3 = pingLocal.getContext('2d');
                  pctx3.globalCompositeOperation = 'source-over';
                  pctx3.clearRect(0, 0, pingLocal.width, pingLocal.height);
                  pctx3.drawImage(cvsLocal, 0, 0, pingLocal.width, pingLocal.height);

                  frame.close && frame.close();

                  // update three texture
                  if (canvasTexRef.current) canvasTexRef.current.needsUpdate = true;
                } catch (err) {
                  try { frame.close && frame.close(); } catch {}
                }
              },
              error: (err) => console.error('Decoder error:', err),
            });
            decoder.configure({ codec: 'vp8' });
            decoderRef.current = decoder;

            // Encoder (encode incoming video frames)
            const encoder = new VideoEncoder({
              output: (chunk) => {
                if (!decoderRef.current) return;
                try {
                  if (chunk.type === 'key') {
                    decoderRef.current.decode(chunk);
                  } else {
                    const n = Math.max(1, Math.round(speed || 1));
                    for (let i = 0; i < n; i++) {
                      decoderRef.current.decode(chunk);
                    }
                  }
                } catch (e) {
                  console.error('Decode error while handling chunk:', e);
                }
              },
              error: (err) => console.error('Encoder error:', err),
            });

            encoder.configure({ codec: 'vp8', width, height });
            encoderRef.current = encoder;
            isWCRef.current = true;
          } catch (e) {
            console.warn('WebCodecs setup failed, falling back to VideoTexture:', e);
            isWCRef.current = false;
          }
        } else {
          isWCRef.current = false;
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
  }, [deviceId, width, height, fps, mirror]);

  // request keyframe handling
  useEffect(() => {
    if (requestKeyframe) pendingKeyframeRef.current = true;
  }, [requestKeyframe]);

  // encode loop integrated with r3f render loop
  useFrame(() => {
    const video = videoRef.current;
    if (!video) return;

    // fallback path: if no WebCodecs, use VideoTexture
    if (!isWCRef.current) {
      if (!tex) {
        try {
          const vtex = new THREE.VideoTexture(video);
          vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
          try { (vtex).colorSpace = (THREE).SRGBColorSpace || vtex.colorSpace; } catch {}
          setTex(vtex);
          canvasTexRef.current = vtex;
        } catch (e) {}
      } else {
        tex.needsUpdate = true;
      }
      return;
    }

    if (!encoderRef.current || encoderRef.current.state === 'closed') return;
    try {
      let frame = null;
      try {
        frame = new VideoFrame(video);
      } catch (e) {
        // fallback: draw to tmp canvas then make VideoFrame
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
        try { frame = new VideoFrame(tmp); } catch (err) { return; }
      }

      let keyOpt = false;
      if (pendingKeyframeRef.current) {
        keyOpt = true;
        pendingKeyframeRef.current = false;
      }

      encoderRef.current.encode(frame, { keyFrame: keyOpt });
      frame.close && frame.close();
    } catch (err) {
      // skip this tick
    }
  });

  // sizing/fit logic similar to template
  const { size } = useThree();
  const compositionAspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9);
  const planeW = compositionAspect * 2;
  const planeH = 2;

  let scaleX = 1, scaleY = 1;
  if (fitMode === 'contain') {
    if (videoAspect > compositionAspect) scaleY = compositionAspect / videoAspect; else scaleX = videoAspect / compositionAspect;
  } else if (fitMode === 'none') {
    const compWpx = size.width || 1; const compHpx = size.height || 1; const vW = (videoRef.current?.videoWidth || width); const vH = (videoRef.current?.videoHeight || height); scaleX = Math.max(0.0001, vW / compWpx); scaleY = Math.max(0.0001, vH / compHpx);
  }

  // texture repeat/fit adjustments
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

  // render mesh
  return tex ? (
    React.createElement('mesh', { scale: [ (mirror ? -1 : 1) * scaleX, scaleY, 1 ] },
      React.createElement('planeGeometry', { args: [planeW, planeH] }),
      React.createElement('meshBasicMaterial', { map: tex, transparent: false, side: THREE.DoubleSide })
    )
  ) : null;
}

// populate camera options dynamically (same as template)
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
