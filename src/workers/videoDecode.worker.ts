// Decode worker: tries WebCodecs VideoDecoder; falls back to pass-through scheduling.
// NOTE: Full container demuxing is not implemented here. This worker currently
// expects encoded chunks to be pushed from the main thread if WebCodecs is used.
// Otherwise, it can receive already-prepared ImageBitmaps to forward downstream.

let decoder: VideoDecoder | null = null;
let configured = false;
let support: { webcodecs: boolean; createImageBitmap: boolean } = {
  webcodecs: typeof (self as any).VideoDecoder !== 'undefined',
  createImageBitmap: typeof (self as any).createImageBitmap === 'function',
};

function post(type: string, payload: Record<string, unknown> = {}, transfer: Transferable[] = []) {
  (self as any).postMessage({ type, ...payload }, transfer);
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  const t = msg.type;
  if (!t) return;
  switch (t) {
    case 'init': {
      // msg: { codec?: string, description?: ArrayBuffer, width?: number, height?: number }
      try {
        if (support.webcodecs) {
          decoder = new (self as any).VideoDecoder({
            output: async (frame: VideoFrame) => {
              try {
                const ts = frame.timestamp || 0;
                if (support.createImageBitmap) {
                  const bmp = await (self as any).createImageBitmap(frame);
                  try { frame.close?.(); } catch {}
                  post('frame', { ts }, [bmp as any]);
                } else {
                  // Transfer the VideoFrame directly if supported as transferable
                  try {
                    post('videoFrame', { ts, frame }, [frame as any]);
                  } catch {
                    try { frame.close?.(); } catch {}
                  }
                }
              } catch {
                try { frame.close?.(); } catch {}
              }
            },
            error: (err: any) => {
              post('error', { error: String(err) });
            }
          });
          const config: VideoDecoderConfig = {
            codec: msg.codec || 'vp9',
            description: msg.description,
            hardwareAcceleration: 'prefer-hardware',
          } as any;
          try { await decoder.configure(config as any); configured = true; } catch {}
        }
      } catch (err) {
        post('error', { error: String(err) });
      }
      post('ready', { support, configured });
      break;
    }
    case 'enqueueEncodedChunk': {
      // msg: { chunk: EncodedVideoChunk, ts?: number }
      if (!decoder || !configured) return;
      try {
        // In practice, the chunk should be constructed in the worker context.
        // If transferred from main, it's already an EncodedVideoChunk.
        decoder.decode(msg.chunk);
      } catch (err) {
        post('error', { error: String(err) });
      }
      break;
    }
    case 'decodeChunk': {
      // msg: { data: ArrayBuffer, timestamp: number, type: 'key'|'delta', duration?: number }
      if (!decoder || !configured) return;
      try {
        const chunkInit: EncodedVideoChunkInit = {
          type: msg.type === 'key' ? 'key' : 'delta',
          timestamp: Number(msg.timestamp || 0),
          duration: msg.duration !== undefined ? Number(msg.duration) : undefined,
          data: new Uint8Array(msg.data as ArrayBuffer),
        } as any;
        const chunk = new (self as any).EncodedVideoChunk(chunkInit);
        decoder.decode(chunk);
      } catch (err) {
        post('error', { error: String(err) });
      }
      break;
    }
    case 'forwardBitmap': {
      // Fallback path: receive ImageBitmap from main and forward to consumer
      try {
        const bmp: ImageBitmap = msg.bitmap as ImageBitmap;
        const ts: number = Number(msg.ts || 0);
        post('frame', { ts }, [bmp as any]);
      } catch (err) {
        post('error', { error: String(err) });
      }
      break;
    }
    case 'flush': {
      try { await decoder?.flush?.(); } catch {}
      post('flushed');
      break;
    }
    case 'reset': {
      try { decoder?.reset?.(); } catch {}
      configured = false;
      post('reset');
      break;
    }
    case 'close': {
      try { decoder?.close?.(); } catch {}
      decoder = null;
      configured = false;
      post('closed');
      break;
    }
    default:
      break;
  }
};


