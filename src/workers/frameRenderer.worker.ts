// Worker: receives OffscreenCanvas and ImageBitmap frames, draws efficiently

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let canvas: OffscreenCanvas | null = null;

self.onmessage = (e: MessageEvent) => {
  const data: any = e.data;
  if (!data || typeof data.type !== 'string') return;
  switch (data.type) {
    case 'init': {
      canvas = data.canvas as OffscreenCanvas;
      const width = data.width as number;
      const height = data.height as number;
      try {
        canvas.width = Math.max(1, Math.floor(width || 1));
        canvas.height = Math.max(1, Math.floor(height || 1));
      } catch {}
      ctx = canvas.getContext('2d', { alpha: true, desynchronized: true }) as OffscreenCanvasRenderingContext2D | null;
      (self as any).postMessage({ type: 'ready' });
      break;
    }
    case 'frame': {
      const bitmap: ImageBitmap = data.bitmap as ImageBitmap;
      if (ctx && bitmap) {
        try {
          ctx.clearRect(0, 0, canvas!.width, canvas!.height);
          ctx.drawImage(bitmap, 0, 0, canvas!.width, canvas!.height);
        } catch {}
      }
      try { bitmap.close?.(); } catch {}
      (self as any).postMessage({ type: 'drawn' });
      break;
    }
    default:
      break;
  }
};


