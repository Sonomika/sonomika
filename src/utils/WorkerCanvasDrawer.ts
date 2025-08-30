import { workerRegistry } from './WorkerRegistry';

export type WorkerCanvasDrawerOptions = {
  width: number;
  height: number;
  onFrame?: () => void;
};

export class WorkerCanvasDrawer {
  private worker: Worker | null = null;
  private workerId: string | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private offscreen: OffscreenCanvas | null = null;
  private pending: number = 0;
  private options: WorkerCanvasDrawerOptions;

  constructor(options: WorkerCanvasDrawerOptions) {
    this.options = options;
  }

  get canvas(): HTMLCanvasElement | null { return this.canvasEl; }

  start(): void {
    if (this.worker) return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(this.options.width));
    canvas.height = Math.max(1, Math.floor(this.options.height));
    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker(new URL('../workers/frameRenderer.worker.ts', import.meta.url), { type: 'module' });
    try { this.workerId = workerRegistry.register({ id: '', kind: 'frameRenderer', label: 'Drawer' }); } catch {}
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data || {};
      if (data.type === 'drawn') {
        if (this.pending > 0) this.pending -= 1;
        try { if (this.workerId) workerRegistry.update(this.workerId, { pending: this.pending }); } catch {}
        try { this.options.onFrame && this.options.onFrame(); } catch {}
      }
    };
    worker.postMessage({ type: 'init', canvas: offscreen, width: canvas.width, height: canvas.height }, [offscreen as any]);
    this.worker = worker;
    this.canvasEl = canvas;
    this.offscreen = offscreen;
  }

  stop(): void {
    if (this.worker) {
      try { this.worker.terminate(); } catch {}
      this.worker = null;
    }
    try { if (this.workerId) workerRegistry.unregister(this.workerId); } catch {}
    this.workerId = null;
    this.offscreen = null;
    this.canvasEl = null;
    this.pending = 0;
  }

  draw(bitmap: ImageBitmap): void {
    if (!this.worker) return;
    this.pending += 1;
    try { if (this.workerId) workerRegistry.update(this.workerId, { pending: this.pending }); } catch {}
    try { this.worker.postMessage({ type: 'frame', bitmap }, [bitmap as any]); } catch { try { bitmap.close?.(); } catch {} }
  }
}


