// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Row Datamosh WebCodecs',
  description: 'WebCodecs-based datamosh pipeline that processes the row below (input texture) instead of a webcam. Falls back to direct video texture when WebCodecs is unavailable.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: true,
  parameters: [
    {
      name: 'speed',
      type: 'number',
      value: 2,
      description: 'Playback speed multiplier (how many times non-key frames are decoded)',
      min: 1,
      max: 10,
      step: 1,
    },
    {
      name: 'requestKeyframe',
      type: 'boolean',
      value: false,
      description: 'Set to true to request a keyframe on next encode',
    },
  ],
};

export default function RowDatamoshWebCodecsEffect({
  videoTexture,
  speed = 2,
  requestKeyframe = false,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const meshRef = useRef(null);

  // Offscreen canvas + texture that will carry the datamoshed output
  const canvasRef = useRef(null);
  const canvasTexRef = useRef(null);
  const [tex, setTex] = useState(null);
  const [aspect, setAspect] = useState(16 / 9);

  // Simple placeholder texture if no input yet
  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#262626';
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#aaaaaa';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, 48, 48);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, 16, 32, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  // WebCodecs refs
  const encoderRef = useRef(null);
  const decoderRef = useRef(null);
  const isWebCodecsReadyRef = useRef(false);
  const pendingRequestKeyframeRef = useRef(false);

  // React to external keyframe requests
  useEffect(() => {
    if (requestKeyframe) {
      pendingRequestKeyframeRef.current = true;
    }
  }, [requestKeyframe]);

  // Set up canvas + texture + WebCodecs whenever the input texture changes
  useEffect(() => {
    // Clean up any previous codec state
    try {
      if (encoderRef.current) {
        encoderRef.current.close();
        encoderRef.current = null;
      }
    } catch {}
    try {
      if (decoderRef.current) {
        decoderRef.current.close();
        decoderRef.current = null;
      }
    } catch {}

    const img = videoTexture && videoTexture.image;
    if (!img) {
      // No valid image source – just pass through or show placeholder
      isWebCodecsReadyRef.current = false;
      setTex(videoTexture || bufferTexture);
      return () => {};
    }

    const srcW = img.videoWidth || img.width || 1280;
    const srcH = img.videoHeight || img.height || 720;
    const width = srcW || 1280;
    const height = srcH || 720;

    const cvs = document.createElement('canvas');
    cvs.width = width;
    cvs.height = height;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    canvasRef.current = cvs;

    const canvasTex = new THREE.CanvasTexture(cvs);
    canvasTex.minFilter = THREE.LinearFilter;
    canvasTex.magFilter = THREE.LinearFilter;
    canvasTex.generateMipmaps = false;
    try {
      (canvasTex).colorSpace = (THREE).SRGBColorSpace || (canvasTex).colorSpace;
    } catch {}
    canvasTexRef.current = canvasTex;
    setTex(canvasTex);
    if (width > 0 && height > 0) {
      setAspect(width / height);
    }

    // If WebCodecs is not available, keep simple passthrough
    if (!(window.VideoEncoder && window.VideoDecoder && window.VideoFrame)) {
      isWebCodecsReadyRef.current = false;
      return () => {
        try {
          if (canvasTexRef.current && canvasTexRef.current.dispose) {
            canvasTexRef.current.dispose();
          }
        } catch {}
        canvasRef.current = null;
        canvasTexRef.current = null;
      };
    }

    try {
      // Decoder: draws decoded frames into our canvas
      const decoder = new VideoDecoder({
        output: async (frame) => {
          try {
            const cvsLocal = canvasRef.current;
            if (!cvsLocal) {
              frame.close && frame.close();
              return;
            }
            const w = frame.codedWidth || cvsLocal.width;
            const h = frame.codedHeight || cvsLocal.height;
            if (cvsLocal.width !== w || cvsLocal.height !== h) {
              cvsLocal.width = w;
              cvsLocal.height = h;
              if (w > 0 && h > 0) {
                setAspect(w / h);
              }
            }
            const ctx2 = cvsLocal.getContext('2d');
            ctx2.clearRect(0, 0, cvsLocal.width, cvsLocal.height);
            try {
              const bitmap = await createImageBitmap(frame);
              ctx2.drawImage(bitmap, 0, 0, cvsLocal.width, cvsLocal.height);
              bitmap.close && bitmap.close();
            } catch (e) {
              try {
                ctx2.drawImage(frame, 0, 0, cvsLocal.width, cvsLocal.height);
              } catch {}
            }
            frame.close && frame.close();
            if (canvasTexRef.current) {
              canvasTexRef.current.needsUpdate = true;
            }
          } catch (err) {
            try {
              frame.close && frame.close();
            } catch {}
          }
        },
        error: (err) => console.error('RowDatamosh decoder error:', err),
      });
      decoder.configure({ codec: 'vp8' });
      decoderRef.current = decoder;

      // Encoder: encodes frames and feeds chunks to decoder, repeating non-key frames (datamosh-style)
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
            console.error('RowDatamosh decode error while handling chunk:', e);
          }
        },
        error: (err) => console.error('RowDatamosh encoder error:', err),
      });

      encoder.configure({ codec: 'vp8', width, height });
      encoderRef.current = encoder;
      isWebCodecsReadyRef.current = true;
    } catch (e) {
      console.warn('RowDatamosh WebCodecs setup failed, falling back to direct texture:', e);
      isWebCodecsReadyRef.current = false;
      try {
        if (encoderRef.current) {
          encoderRef.current.close();
          encoderRef.current = null;
        }
      } catch {}
      try {
        if (decoderRef.current) {
          decoderRef.current.close();
          decoderRef.current = null;
        }
      } catch {}
      setTex(videoTexture || bufferTexture);
    }

    return () => {
      try {
        if (encoderRef.current) {
          encoderRef.current.close();
          encoderRef.current = null;
        }
      } catch {}
      try {
        if (decoderRef.current) {
          decoderRef.current.close();
          decoderRef.current = null;
        }
      } catch {}
      try {
        if (canvasTexRef.current && canvasTexRef.current.dispose) {
          canvasTexRef.current.dispose();
        }
      } catch {}
      canvasRef.current = null;
      canvasTexRef.current = null;
    };
  }, [videoTexture, bufferTexture, speed]);

  // Main encode loop driven by r3f render loop
  useFrame(() => {
    const texIn = videoTexture;
    const img = texIn && texIn.image;
    if (!img) {
      if (!tex) {
        setTex(bufferTexture);
      }
      return;
    }

    // Keep aspect in sync with source image
    const iw = img.videoWidth || img.width;
    const ih = img.videoHeight || img.height;
    if (iw && ih) {
      const nextAspect = iw / ih;
      if (Math.abs(nextAspect - aspect) > 0.001) {
        setAspect(nextAspect);
      }
    }

    // If WebCodecs not ready, just show the raw input texture
    if (!isWebCodecsReadyRef.current) {
      if (tex !== texIn) {
        setTex(texIn || bufferTexture);
      }
      return;
    }

    if (!encoderRef.current || encoderRef.current.state === 'closed') return;
    try {
      let frame = null;
      try {
        frame = new VideoFrame(img);
      } catch (e) {
        // Fallback: draw into a temp canvas if possible
        try {
          const w = iw || 1280;
          const h = ih || 720;
          const tmp = document.createElement('canvas');
          tmp.width = w;
          tmp.height = h;
          const ctx = tmp.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          frame = new VideoFrame(tmp);
        } catch (err) {
          return;
        }
      }

      let keyOpt = false;
      if (pendingRequestKeyframeRef.current) {
        keyOpt = true;
        pendingRequestKeyframeRef.current = false;
      }

      encoderRef.current.encode(frame, { keyFrame: keyOpt });
      frame.close && frame.close();
    } catch (err) {
      // skip this tick on error
    }
  });

  if (!tex) return null;

  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('meshBasicMaterial', { map: tex, transparent: false, side: THREE.DoubleSide })
  );
}




