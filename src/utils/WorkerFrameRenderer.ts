/*
  WorkerFrameRenderer
  - Offloads frame drawing to a Worker via OffscreenCanvas
  - Main thread captures frames from an HTMLVideoElement using createImageBitmap
  - Transfers ImageBitmap to worker; worker draws and posts an ack
*/

import { workerRegistry } from './WorkerRegistry';

export type WorkerFrameRendererOptions = {
  width: number;
  height: number;
  onFrame?: () => void;
  maxInFlightFrames?: number;
};

export class WorkerFrameRenderer {
  private worker: Worker | null = null;
  private workerId: string | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private offscreen: OffscreenCanvas | null = null;
  private running: boolean = false;
  private video: HTMLVideoElement;
  private options: WorkerFrameRendererOptions;
  private pendingBitmapCount: number = 0;
  private maxInFlightBitmaps: number = 2;
  private rvfcHandle: any = null;

  constructor(video: HTMLVideoElement, options: WorkerFrameRendererOptions) {
    this.video = video;
    this.options = options;
    if (typeof options.maxInFlightFrames === 'number' && options.maxInFlightFrames > 0) {
      this.maxInFlightBitmaps = Math.floor(options.maxInFlightFrames);
    }
  }

  static isSupported(): boolean {
    try {
      const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
      const hasCreateImageBitmap = typeof (window as any).createImageBitmap === 'function';
      return hasOffscreen && hasCreateImageBitmap;
    } catch {
      return false;
    }
  }

  get canvas(): HTMLCanvasElement | null {
    return this.canvasEl;
  }

  start(): void {
    if (this.running) return;
    // Create visible canvas and transfer control
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(this.options.width));
    canvas.height = Math.max(1, Math.floor(this.options.height));
    const offscreen = canvas.transferControlToOffscreen();

    // Create worker via ESM URL for Vite
    const worker = new Worker(new URL('../workers/frameRenderer.worker.ts', import.meta.url), { type: 'module' });
    try { this.workerId = workerRegistry.register({ id: '', kind: 'frameRenderer', label: 'Offscreen draw' }); } catch {}

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data || {};
      if (data.type === 'ready') {
        // no-op
      } else if (data.type === 'drawn') {
        // One bitmap finished on worker
        if (this.pendingBitmapCount > 0) this.pendingBitmapCount -= 1;
        try { if (this.workerId) workerRegistry.update(this.workerId, { pending: this.pendingBitmapCount }); } catch {}
        try { this.options.onFrame && this.options.onFrame(); } catch {}
      }
    };

    // Init worker surface
    worker.postMessage({ type: 'init', canvas: offscreen, width: canvas.width, height: canvas.height }, [offscreen as any]);

    // Begin pumping frames
    this.running = true;
    this.worker = worker;
    this.canvasEl = canvas;
    this.offscreen = offscreen;
    this.scheduleRVFC();
  }

  stop(): void {
    this.running = false;
    this.cancelRVFC();
    if (this.worker) {
      try { this.worker.terminate(); } catch {}
      this.worker = null;
    }
    try { if (this.workerId) workerRegistry.unregister(this.workerId); } catch {}
    this.workerId = null;
    this.offscreen = null;
    this.canvasEl = null;
    this.pendingBitmapCount = 0;
  }

  private scheduleRVFC(): void {
    const anyVideo: any = this.video as any;
    const useRVFC = typeof anyVideo.requestVideoFrameCallback === 'function';
    if (useRVFC) {
      const tick = async () => {
        if (!this.running) return;
        this.captureAndSendFrame();
        try { this.rvfcHandle = anyVideo.requestVideoFrameCallback(tick); } catch {}
      };
      try { this.rvfcHandle = anyVideo.requestVideoFrameCallback(tick); } catch {}
    } else {
      const loop = async () => {
        if (!this.running) return;
        this.captureAndSendFrame();
        (typeof requestAnimationFrame !== 'undefined') && requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  private cancelRVFC(): void {
    const anyVideo: any = this.video as any;
    try { anyVideo.cancelVideoFrameCallback?.(this.rvfcHandle); } catch {}
    this.rvfcHandle = null;
  }

  private async captureAndSendFrame(): Promise<void> {
    if (!this.running || !this.worker) return;
    if (this.pendingBitmapCount >= this.maxInFlightBitmaps) return; // simple backpressure
    if (!this.video || this.video.readyState < 2) return;
    try {
      const bitmap: ImageBitmap = await (window as any).createImageBitmap(this.video);
      this.pendingBitmapCount += 1;
      try { if (this.workerId) workerRegistry.update(this.workerId, { pending: this.pendingBitmapCount }); } catch {}
      this.worker.postMessage({ type: 'frame', bitmap }, [bitmap as any]);
    } catch {}
  }
}


