import { useStore } from '../store/store';

export type MirrorSliceOrientation = 'horizontal' | 'vertical';

export interface MirrorSliceConfig {
  id: string;
  // Optional absolute window size/pos hints; Electron will center if not provided
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  title?: string;
  // Optional explicit region in normalized [0,1] coords (x,y,w,h)
  region?: { x: number; y: number; width: number; height: number };
}

export interface UniformSlicesSpec {
  count: number;
  orientation: MirrorSliceOrientation;
}

export class AdvancedMirrorStreamManager {
  private canvas: HTMLCanvasElement | null;
  private animationId: number | null = null;
  private lastDataUrlById: Map<string, string> = new Map();
  private slices: MirrorSliceConfig[] = [];
  private sliceWindows: Map<string, { win: Window, img: HTMLImageElement | null }> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  updateCanvas(newCanvas: HTMLCanvasElement): void {
    this.canvas = newCanvas;
  }

  openWithUniformSlices(spec: UniformSlicesSpec): void {
    const count = Math.max(1, Math.floor(spec.count));
    const orientation = spec.orientation;
    const slices: MirrorSliceConfig[] = [];
    for (let i = 0; i < count; i++) {
      if (orientation === 'horizontal') {
        const width = 1 / count;
        slices.push({ id: `slice-${i}`, region: { x: i * width, y: 0, width, height: 1 } });
      } else {
        const height = 1 / count;
        slices.push({ id: `slice-${i}`, region: { x: 0, y: i * height, width: 1, height } });
      }
    }
    this.openWithSlices(slices);
  }

  openWithSlices(slices: MirrorSliceConfig[]): void {
    this.slices = slices.slice();
    if (window.advancedMirror && Array.isArray(slices)) {
      try { console.log('[AdvancedMirror] Opening slices:', slices.map(s => s.id)); } catch {}
      const openPayload = slices.map(s => ({ id: s.id, title: s.title, width: s.width, height: s.height, x: s.x, y: s.y }));
      window.advancedMirror.open(openPayload);
    } else if ((window as any).electron?.advancedMirrorOpen) {
      try { console.log('[AdvancedMirror] Using electron.advancedMirrorOpen fallback'); } catch {}
      const openPayload = slices.map(s => ({ id: s.id, title: s.title, width: s.width, height: s.height, x: s.x, y: s.y }));
      (window as any).electron.advancedMirrorOpen(openPayload);
    } else {
      // Web-only fallback: open one popup per slice and draw into <img>
      try {
        console.warn('[AdvancedMirror] Preload API unavailable; using browser popup fallback');
        this.sliceWindows.forEach(({ win }) => { try { win.close(); } catch {} });
        this.sliceWindows.clear();
        for (const s of slices) {
          const w = window.open('', `mirror_slice_${s.id}`, 'width=640,height=360,resizable=yes');
          if (!w) continue;
          const html = `<!DOCTYPE html><html><head><title>Slice ${s.id}</title><style>html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}img{width:100%;height:100%;object-fit:cover}</style></head><body><img id="img"/></body></html>`;
          try { w.document.write(html); w.document.close(); } catch {}
          const img = w.document.getElementById('img') as HTMLImageElement | null;
          this.sliceWindows.set(s.id, { win: w, img });
        }
      } catch {}
    }
    // Begin streaming frames
    this.start();
  }

  closeAll(): void {
    if (this.animationId) {
      try { cancelAnimationFrame(this.animationId); } catch {}
      this.animationId = null;
    }
    this.lastDataUrlById.clear();
    this.slices = [];
    try { window.advancedMirror?.closeAll(); } catch {}
    try { (window as any).electron?.advancedMirrorCloseAll?.(); } catch {}
    // Close browser fallback windows
    this.sliceWindows.forEach(({ win }) => { try { win.close(); } catch {} });
    this.sliceWindows.clear();
  }

  private start(): void {
    if (!this.canvas) return;

    // Match regular mirror output: 1920x1080 at 60 FPS
    const targetWidth = 1920;
    const targetHeight = 1080;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;
    const tempCtx = tempCanvas.getContext('2d');
    let lastFrameTime = 0;
    const frameInterval = 1000 / 60; // 60 FPS

    const raf = requestAnimationFrame;

    const drawAndSend = () => {
      const now = performance.now();
      if ((now - lastFrameTime) >= frameInterval) {
        // Ensure canvas is valid
        try {
          const needsReplacement = !this.canvas || !this.canvas.isConnected || this.canvas.width === 0 || this.canvas.height === 0;
          if (needsReplacement) {
            const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
            const replacement = canvases.find(c => c.id !== 'dummy-mirror-canvas' && c.width > 0 && c.height > 0);
            if (replacement) this.canvas = replacement;
          }
        } catch {}

        if (this.canvas && tempCtx) {
          const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
          for (const s of this.slices) {
            const region = s.region ?? { x: 0, y: 0, width: 1, height: 1 };
            const sx = Math.floor(region.x * this.canvas.width);
            const sy = Math.floor(region.y * this.canvas.height);
            const sw = Math.max(1, Math.floor(region.width * this.canvas.width));
            const sh = Math.max(1, Math.floor(region.height * this.canvas.height));

            tempCtx.save();
            tempCtx.fillStyle = bg;
            tempCtx.fillRect(0, 0, targetWidth, targetHeight);
            // Scale region to fit target while covering fully
            const scale = Math.max(targetWidth / sw, targetHeight / sh);
            const dw = Math.floor(sw * scale);
            const dh = Math.floor(sh * scale);
            const dx = Math.floor((targetWidth - dw) / 2);
            const dy = Math.floor((targetHeight - dh) / 2);
            // Use 9-arg drawImage to crop source region
            tempCtx.imageSmoothingEnabled = false;
            // Draw via offscreen canvas to avoid reallocating temp canvas per slice
            try {
              let off: HTMLCanvasElement | null = (tempCanvas as any).__offCanvas || null;
              if (!off) {
                off = document.createElement('canvas');
                (tempCanvas as any).__offCanvas = off;
              }
              if (off.width !== sw || off.height !== sh) { off.width = sw; off.height = sh; }
              const offCtx = off.getContext('2d');
              if (offCtx) {
                offCtx.imageSmoothingEnabled = false;
                offCtx.clearRect(0, 0, sw, sh);
                offCtx.drawImage(this.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
                tempCtx.drawImage(off, 0, 0, sw, sh, dx, dy, dw, dh);
              } else {
                tempCtx.drawImage(this.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
              }
            } catch {
              tempCtx.drawImage(this.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
            }
            tempCtx.restore();

            const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
            const last = this.lastDataUrlById.get(s.id);
            if (dataUrl !== last && dataUrl.length > 100) {
              this.lastDataUrlById.set(s.id, dataUrl);
              // IPC path
              try { window.advancedMirror?.sendSliceData(s.id, dataUrl); } catch {}
              try { window.advancedMirror?.setSliceBackground(s.id, bg); } catch {}
              try { (window as any).electron?.advancedMirrorSendSliceData?.(s.id, dataUrl); } catch {}
              try { (window as any).electron?.advancedMirrorSetBg?.(s.id, bg); } catch {}
              // Browser popup fallback
              const entry = this.sliceWindows.get(s.id);
              if (entry && entry.win && !entry.win.closed && entry.img) {
                try { if (entry.img.src !== dataUrl) entry.img.src = dataUrl; } catch {}
              } else if (entry && entry.win && !entry.win.closed && !entry.img) {
                try { entry.img = entry.win.document.getElementById('img') as HTMLImageElement | null; if (entry.img) entry.img.src = dataUrl; } catch {}
              }
            }
          }
        }

        lastFrameTime = now;
      }

      this.animationId = raf(drawAndSend);
    };

    drawAndSend();
  }
}

declare global {
  interface Window {
    advancedMirror?: {
      open: (slices: Array<{ id: string; title?: string; width?: number; height?: number; x?: number; y?: number }>) => void;
      closeAll: () => void;
      sendSliceData: (id: string, dataUrl: string) => void;
      setSliceBackground: (id: string, color: string) => void;
      resizeSliceWindow: (id: string, width: number, height: number) => void;
    };
  }
}


