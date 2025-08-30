// Receives requests to generate thumbnails from ImageBitmap or draw parameters

type InitMsg = { type: 'init' };
type GenerateMsg = {
  type: 'generate';
  id: string;
  bitmap?: ImageBitmap; // if provided, draw this
  videoSize?: { width: number; height: number }; // optional
  target: { width: number; height: number };
  background?: string;
  quality?: number; // 0..1
};

type Message = InitMsg | GenerateMsg;

self.onmessage = async (e: MessageEvent<Message>) => {
  const data = e.data;
  if (!data) return;
  switch (data.type) {
    case 'init': {
      (self as any).postMessage({ type: 'ready' });
      break;
    }
    case 'generate': {
      const id = data.id;
      const targetW = Math.max(1, Math.floor(data.target.width));
      const targetH = Math.max(1, Math.floor(data.target.height));
      const bg = data.background || '#000';
      const quality = typeof data.quality === 'number' ? Math.max(0, Math.min(1, data.quality)) : 0.7;
      try {
        const canvas = new OffscreenCanvas(targetW, targetH);
        const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true }) as OffscreenCanvasRenderingContext2D | null;
        if (!ctx) throw new Error('No 2D context');

        // Fill background
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, targetW, targetH);

        if (data.bitmap) {
          // Compute contain fit
          const srcW = data.bitmap.width;
          const srcH = data.bitmap.height;
          const scale = Math.min(targetW / srcW, targetH / srcH);
          const drawW = Math.max(1, Math.floor(srcW * scale));
          const drawH = Math.max(1, Math.floor(srcH * scale));
          const offsetX = Math.floor((targetW - drawW) / 2);
          const offsetY = Math.floor((targetH - drawH) / 2);
          ctx.drawImage(data.bitmap, 0, 0, srcW, srcH, offsetX, offsetY, drawW, drawH);
          try { data.bitmap.close?.(); } catch {}
        }

        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          (self as any).postMessage({ type: 'result', id, dataUrl });
        };
        reader.onerror = () => {
          (self as any).postMessage({ type: 'error', id, error: 'Failed to read blob' });
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        (self as any).postMessage({ type: 'error', id, error: String(err) });
      }
      break;
    }
    default:
      break;
  }
};


