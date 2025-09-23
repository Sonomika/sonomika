const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Video Datamosh (WebCodecs)',
  description: 'Applies datamosh-style smearing by decoding delta frames multiple times. Uses the provided videoTexture as input.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  parameters: [
    { name: 'mirror', type: 'boolean', value: true, description: 'Mirror horizontally' },
    { name: 'fitMode', type: 'select', value: 'cover', description: 'Video Size', options: [
      { value: 'none', label: 'Original' }, { value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }, { value: 'tile', label: 'Tile' }
    ] },
    { name: 'speed', type: 'range', value: 2, description: 'Decode non-key frames this many times to compound motion vectors', min: 1, max: 10, step: 1 },
    { name: 'requestKeyframe', type: 'boolean', value: false, description: 'Set to true to request a keyframe on next encode (resets smear)' },
    { name: 'enableStamping', type: 'boolean', value: true, description: 'Enable region re-draw glitch stamps' },
    { name: 'stamps', type: 'range', value: 4, min: 0, max: 64, step: 1, description: 'Stamps per frame' },
    { name: 'regionSize', type: 'range', value: 48, min: 8, max: 256, step: 8, description: 'Stamp region size (px)' },
    { name: 'offsetMax', type: 'range', value: 10, min: 0, max: 200, step: 1, description: 'Max offset from source (px)' },
    { name: 'posterize', type: 'range', value: 16, min: 2, max: 64, step: 1, description: 'Posterize levels' },
  ],
};

export default function VideoDatamoshEffect({
  videoTexture,
  mirror = true,
  fitMode = 'cover',
  speed = 2,
  requestKeyframe = false,
  enableStamping = true,
  stamps = 4,
  regionSize = 48,
  offsetMax = 10,
  posterize = 16,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const srcCanvasRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const displayTexRef = useRef(null);
  const [tex, setTex] = useState(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const hasFrameRef = useRef(false);
  const stampCanvasRef = useRef(null);
  const stampCtxRef = useRef(null);

  // Internal GPU sampling pipeline to read arbitrary THREE.Texture into a 2D canvas
  const sampleSceneRef = useRef(null);
  const sampleCameraRef = useRef(null);
  const sampleMeshRef = useRef(null);
  const sampleRTRef = useRef(null);
  const samplePixelsRef = useRef(null);

  const sampleTextureIntoCanvas = (gl, inputTexture, w, h) => {
    if (!gl || !inputTexture) return false;
    // lazy scene
    if (!sampleSceneRef.current) {
      const scene = new THREE.Scene();
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geom = new THREE.PlaneGeometry(2, 2);
      const mat = new THREE.MeshBasicMaterial({ map: inputTexture });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      sampleSceneRef.current = scene;
      sampleCameraRef.current = cam;
      sampleMeshRef.current = mesh;
    } else if (sampleMeshRef.current.material.map !== inputTexture) {
      sampleMeshRef.current.material.map = inputTexture;
      sampleMeshRef.current.material.needsUpdate = true;
    }
    // ensure RT
    if (!sampleRTRef.current || sampleRTRef.current.width !== w || sampleRTRef.current.height !== h) {
      try { sampleRTRef.current && sampleRTRef.current.dispose && sampleRTRef.current.dispose(); } catch {}
      sampleRTRef.current = new THREE.WebGLRenderTarget(Math.max(1, w|0), Math.max(1, h|0), {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
      samplePixelsRef.current = new Uint8Array(Math.max(1, w|0) * Math.max(1, h|0) * 4);
    }
    const prevRT = gl.getRenderTarget();
    gl.setRenderTarget(sampleRTRef.current);
    gl.clear();
    gl.render(sampleSceneRef.current, sampleCameraRef.current);
    try {
      gl.readRenderTargetPixels(sampleRTRef.current, 0, 0, w, h, samplePixelsRef.current);
    } catch (e) {
      gl.setRenderTarget(prevRT);
      return false;
    }
    gl.setRenderTarget(prevRT);
    // copy into src canvas, flip Y
    const sc = srcCanvasRef.current || (srcCanvasRef.current = document.createElement('canvas'));
    if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
    const sctx = sc.getContext('2d');
    const row = w * 4;
    const flipped = new Uint8ClampedArray(samplePixelsRef.current.length);
    for (let y = 0; y < h; y++) {
      const srcOff = (h - 1 - y) * row;
      const dstOff = y * row;
      flipped.set(samplePixelsRef.current.subarray(srcOff, srcOff + row), dstOff);
    }
    const imgData = new ImageData(flipped, w, h);
    try { sctx.putImageData(imgData, 0, 0); } catch {}
    return true;
  };

  const encoderRef = useRef(null);
  const decoderRef = useRef(null);
  const isWebCodecsReadyRef = useRef(false);
  const pendingRequestKeyframeRef = useRef(false);
  const lastDimsRef = useRef({ w: 0, h: 0 });
  const frameIndexRef = useRef(0);
  const t0Ref = useRef(0);

  // respond to external requestKeyframe param
  useEffect(() => {
    if (requestKeyframe) pendingRequestKeyframeRef.current = true;
  }, [requestKeyframe]);

  // Ensure first frame is a keyframe
  useEffect(() => {
    pendingRequestKeyframeRef.current = true;
  }, []);

  // Prepare output canvas/texture
  useEffect(() => {
    // create display canvas and CanvasTexture
    const cvs = document.createElement('canvas');
    cvs.width = 16; cvs.height = 9;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    displayCanvasRef.current = cvs;
    const canvasTex = new THREE.CanvasTexture(cvs);
    canvasTex.minFilter = THREE.LinearFilter; canvasTex.magFilter = THREE.LinearFilter; canvasTex.generateMipmaps = false;
    try { canvasTex.colorSpace = (THREE && THREE.SRGBColorSpace) || canvasTex.colorSpace; } catch {}
    displayTexRef.current = canvasTex;
    setTex(canvasTex);
    // small offscreen for region effects
    const stamp = document.createElement('canvas');
    stamp.width = 2; stamp.height = 2;
    stampCanvasRef.current = stamp;
    stampCtxRef.current = stamp.getContext('2d');
    return () => {
      try { displayTexRef.current && displayTexRef.current.dispose && displayTexRef.current.dispose(); } catch {}
      displayTexRef.current = null; setTex(null);
    };
  }, []);

  // Create encoder/decoder once WebCodecs available and we know source dimensions
  const ensureCodecsConfigured = async (w, h) => {
    if (!window.VideoEncoder || !window.VideoDecoder || !window.VideoFrame) {
      isWebCodecsReadyRef.current = false; return;
    }
    if (encoderRef.current && decoderRef.current) return; // already configured
    try {
      // Some encoders require even dimensions
      const encW = (w & ~1) || 2;
      const encH = (h & ~1) || 2;
      // Probe support first
      try {
        if (window.VideoEncoder && (VideoEncoder as any).isConfigSupported) {
          const sup = await (VideoEncoder as any).isConfigSupported({ codec: 'vp8', width: encW, height: encH });
          if (!sup || sup.supported === false) throw new Error('VP8 not supported');
        }
      } catch (probeErr) {
        console.warn('VP8 config not supported, falling back to direct draw:', probeErr);
        isWebCodecsReadyRef.current = false; return;
      }
      const displayCvs = displayCanvasRef.current;
      const decoder = new VideoDecoder({
        output: async (frame) => {
          try {
            const dw = frame.codedWidth || w || displayCvs.width || 1;
            const dh = frame.codedHeight || h || displayCvs.height || 1;
            if (displayCvs.width !== dw || displayCvs.height !== dh) {
              displayCvs.width = dw; displayCvs.height = dh;
              setVideoAspect(dw / Math.max(1, dh));
            }
            const ctx2 = displayCvs.getContext('2d');
            ctx2.save();
            if (mirror) { ctx2.clearRect(0,0,displayCvs.width,displayCvs.height); ctx2.translate(displayCvs.width, 0); ctx2.scale(-1, 1); }
            else { ctx2.clearRect(0,0,displayCvs.width,displayCvs.height); }
            try {
              const bitmap = await createImageBitmap(frame);
              ctx2.drawImage(bitmap, 0, 0, displayCvs.width, displayCvs.height);
              bitmap.close && bitmap.close();
            } catch {
              try { ctx2.drawImage(frame, 0, 0, displayCvs.width, displayCvs.height); } catch {}
            }
            if (mirror) ctx2.restore();
            // After drawing decoded frame, apply glitch stamps if enabled
            if (enableStamping && stamps > 0 && regionSize > 0 && offsetMax >= 0 && posterize > 1) {
              const maxStamps = Math.max(0, Math.min(256, Math.floor(stamps)));
              const rs = Math.max(1, Math.floor(regionSize));
              const off = Math.max(0, Math.floor(offsetMax));
              for (let i = 0; i < maxStamps; i++) {
                const rX = Math.floor(Math.random() * displayCvs.width);
                const rY = Math.floor(Math.random() * displayCvs.height);
                const sx = Math.max(0, Math.min(displayCvs.width - rs, rX));
                const sy = Math.max(0, Math.min(displayCvs.height - rs, rY));
                const imgData = ctx2.getImageData(sx, sy, rs, rs);
                // simple posterize on RGBA
                const levels = Math.max(2, Math.floor(posterize));
                const step = 255 / (levels - 1);
                const data = imgData.data;
                for (let p = 0; p < data.length; p += 4) {
                  data[p] = Math.round(data[p] / step) * step;
                  data[p+1] = Math.round(data[p+1] / step) * step;
                  data[p+2] = Math.round(data[p+2] / step) * step;
                }
                const dx = sx + (Math.floor(Math.random() * (2 * off + 1)) - off);
                const dy = sy + (Math.floor(Math.random() * (2 * off + 1)) - off);
                ctx2.putImageData(imgData, dx, dy);
              }
            }
            frame.close && frame.close();
            if (displayTexRef.current) { displayTexRef.current.needsUpdate = true; hasFrameRef.current = true; }
          } catch (err) {
            try { frame.close && frame.close(); } catch {}
          }
        },
        error: (err) => console.error('Decoder error:', err),
      });
      decoder.configure({ codec: 'vp8' });
      decoderRef.current = decoder;

      const encoder = new VideoEncoder({
        output: (chunk) => {
          if (!decoderRef.current) return;
          try {
            if (chunk.type === 'key') {
              decoderRef.current.decode(chunk);
            } else {
              const n = Math.max(1, Math.round(speed || 1));
              for (let i = 0; i < n; i++) decoderRef.current.decode(chunk);
            }
          } catch (e) {
            console.error('Decode error while handling chunk:', e);
          }
        },
        error: (err) => console.error('Encoder error:', err),
      });
      encoder.configure({
        codec: 'vp8',
        width: Math.max(1, encW|0),
        height: Math.max(1, encH|0),
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'realtime',
      });
      encoderRef.current = encoder;
      isWebCodecsReadyRef.current = true;
    } catch (e) {
      console.warn('WebCodecs setup failed, falling back to direct texture:', e);
      isWebCodecsReadyRef.current = false;
    }
  };

  // Cleanup codecs on unmount
  useEffect(() => () => {
    try { encoderRef.current && encoderRef.current.close(); } catch {}
    try { decoderRef.current && decoderRef.current.close(); } catch {}
    encoderRef.current = null; decoderRef.current = null;
  }, []);

  // Main encode loop: draw source frame, wrap into VideoFrame, encode
  useFrame(() => {
    const srcImage = videoTexture && videoTexture.image;
    if (!srcImage) return;

    // Establish source dimensions
    const w = (srcImage.videoWidth || srcImage.width || 0) | 0;
    const h = (srcImage.videoHeight || srcImage.height || 0) | 0;
    if (!w || !h) return;

    if (w !== lastDimsRef.current.w || h !== lastDimsRef.current.h) {
      lastDimsRef.current = { w, h };
      setVideoAspect(w / Math.max(1, h));
      // resize source canvas
      if (!srcCanvasRef.current) srcCanvasRef.current = document.createElement('canvas');
      srcCanvasRef.current.width = w; srcCanvasRef.current.height = h;
      // reconfigure codecs if not ready
      if (!encoderRef.current || !decoderRef.current) ensureCodecsConfigured(w, h);
    }

    // If WebCodecs unavailable OR we haven't produced any output yet, copy the input into output canvas
    if (!isWebCodecsReadyRef.current || !encoderRef.current || !hasFrameRef.current) {
      const out = displayCanvasRef.current; if (!out) return;
      if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
      const ctx = out.getContext('2d');
      ctx.save();
      if (mirror) { ctx.clearRect(0,0,out.width,out.height); ctx.translate(out.width, 0); ctx.scale(-1, 1); }
      else { ctx.clearRect(0,0,out.width,out.height); }
      // If we have a real HTMLVideoElement/Canvas, draw directly; otherwise sample from GPU
      const isHTMLBacked = !!(srcImage && (srcImage instanceof HTMLVideoElement || srcImage instanceof HTMLCanvasElement || srcImage instanceof ImageBitmap || srcImage instanceof HTMLImageElement));
      if (isHTMLBacked) {
        try { ctx.drawImage(srcImage, 0, 0, out.width, out.height); } catch {}
      } else if (videoTexture && videoTexture.isTexture) {
        // sample via GPU path into srcCanvas, then blit
        const ok = sampleTextureIntoCanvas(gl, videoTexture, w, h);
        if (ok) {
          try { ctx.drawImage(srcCanvasRef.current, 0, 0, out.width, out.height); } catch {}
        }
      }
      if (mirror) ctx.restore();
      // Apply stamps in fallback path as well
      if (enableStamping && stamps > 0 && regionSize > 0 && offsetMax >= 0 && posterize > 1) {
        const maxStamps = Math.max(0, Math.min(256, Math.floor(stamps)));
        const rs = Math.max(1, Math.floor(regionSize));
        const off = Math.max(0, Math.floor(offsetMax));
        for (let i = 0; i < maxStamps; i++) {
          const rX = Math.floor(Math.random() * out.width);
          const rY = Math.floor(Math.random() * out.height);
          const sx = Math.max(0, Math.min(out.width - rs, rX));
          const sy = Math.max(0, Math.min(out.height - rs, rY));
          const imgData = ctx.getImageData(sx, sy, rs, rs);
          const levels = Math.max(2, Math.floor(posterize));
          const step = 255 / (levels - 1);
          const data = imgData.data;
          for (let p = 0; p < data.length; p += 4) {
            data[p] = Math.round(data[p] / step) * step;
            data[p+1] = Math.round(data[p+1] / step) * step;
            data[p+2] = Math.round(data[p+2] / step) * step;
          }
          const dx = sx + (Math.floor(Math.random() * (2 * off + 1)) - off);
          const dy = sy + (Math.floor(Math.random() * (2 * off + 1)) - off);
          ctx.putImageData(imgData, dx, dy);
        }
      }
      if (displayTexRef.current) { displayTexRef.current.needsUpdate = true; hasFrameRef.current = true; }
      return;
    }

    // Create VideoFrame directly from the HTMLVideoElement when possible
    try {
      if (!t0Ref.current) t0Ref.current = performance.now();
      const tsUs = Math.floor((performance.now() - t0Ref.current) * 1000); // microseconds
      let frame = null;
      try {
        frame = new VideoFrame(srcImage, { timestamp: tsUs });
      } catch {
        // Fallback: draw to canvas then wrap
        const sc = srcCanvasRef.current || (srcCanvasRef.current = document.createElement('canvas'));
        if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
        const sctx = sc.getContext('2d');
        const isHTMLBacked = !!(srcImage && (srcImage instanceof HTMLVideoElement || srcImage instanceof HTMLCanvasElement || srcImage instanceof ImageBitmap || srcImage instanceof HTMLImageElement));
        if (isHTMLBacked) {
          try { sctx.drawImage(srcImage, 0, 0, w, h); } catch {}
        } else if (videoTexture && videoTexture.isTexture) {
          const ok = sampleTextureIntoCanvas(gl, videoTexture, w, h);
          if (!ok) { try { sctx.drawImage(srcImage, 0, 0, w, h); } catch {} }
        }
        frame = new VideoFrame(sc, { timestamp: tsUs });
      }
      let keyOpt = false;
      if (pendingRequestKeyframeRef.current) { keyOpt = true; pendingRequestKeyframeRef.current = false; }
      encoderRef.current.encode(frame, { keyFrame: keyOpt });
      frame.close && frame.close();
      hasFrameRef.current = true;
    } catch (err) {
      // skip this tick if frame creation/encode fails
    }
  });

  // Composition sizing and GL access
  const { size, gl } = useThree();
  const compositionAspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9);
  const planeW = compositionAspect * 2;
  const planeH = 2;

  // Compute mesh scale based on fitMode and videoAspect
  let scaleX = 1, scaleY = 1;
  if (fitMode === 'contain') {
    if (videoAspect > compositionAspect) scaleY = compositionAspect / videoAspect; else scaleX = videoAspect / compositionAspect;
  } else if (fitMode === 'none') {
    const compWpx = size && size.width || 1; const compHpx = size && size.height || 1;
    const vW = lastDimsRef.current.w || compWpx; const vH = lastDimsRef.current.h || compHpx;
    scaleX = Math.max(0.0001, vW / compWpx); scaleY = Math.max(0.0001, vH / compHpx);
  }

  // Apply repeat/cropping based on fitMode for CanvasTexture
  useEffect(() => {
    const t = hasFrameRef.current ? tex : null; // apply to our canvas texture once we have content
    if (!t) return;
    if (fitMode === 'cover') {
      t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      let repX = 1, repY = 1, offX = 0, offY = 0;
      if (videoAspect > compositionAspect) { repX = Math.max(0.0001, compositionAspect / videoAspect); repY = 1; offX = (1 - repX) / 2; }
      else if (videoAspect < compositionAspect) { repX = 1; repY = Math.max(0.0001, videoAspect / compositionAspect); offY = (1 - repY) / 2; }
      t.repeat.set(repX, repY); t.offset.set(offX, offY); t.needsUpdate = true; return;
    }
    if (fitMode === 'tile') {
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
      let tileW = planeW, tileH = planeH; const wFit = planeH * videoAspect;
      if (wFit <= planeW) { tileW = wFit; tileH = planeH; } else { tileW = planeW; tileH = planeW / videoAspect; }
      const repX = Math.max(0.0001, planeW / tileW); const repY = Math.max(0.0001, planeH / tileH);
      t.repeat.set(repX, repY); t.offset.set(0, 0); t.needsUpdate = true; return;
    }
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1,1); t.offset.set(0,0); t.needsUpdate = true;
  }, [tex, fitMode, planeW, planeH, videoAspect, compositionAspect]);

  const activeMap = hasFrameRef.current ? tex : (videoTexture || tex);

  return activeMap ? (
    React.createElement('mesh', { scale: [ (mirror ? -1 : 1) * scaleX, scaleY, 1 ] },
      React.createElement('planeGeometry', { args: [planeW, planeH] }),
      React.createElement('meshBasicMaterial', { map: activeMap, transparent: false, side: THREE.DoubleSide })
    )
  ) : null;
}


