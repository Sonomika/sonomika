import { workerRegistry } from './WorkerRegistry';

export type ClockProvider = () => number; // returns currentTime in seconds (audio/timeline)

export type WorkerVideoPipelineOptions = {
  src: string; // video URL
  width: number;
  height: number;
  nbFramesToCheck: number; // how many timestamps to consider
  requestMarginMs: number; // margin ahead of playhead
  maxQueueSize: number; // max buffered frames
  clock: ClockProvider; // presentation clock in seconds
  onFrame: (bitmap: ImageBitmap, ts: number) => void; // delivers ready frame
  fallbackCapture?: (timeSec: number) => Promise<ImageBitmap | null>; // fallback path
  onQueueStats?: (stats: { size: number }) => void; // optional stats callback
  // Optional chunk feeder: if provided, real WebCodecs path will be used
  // by demuxing and sending EncodedVideoChunks to the worker.
  chunkFeeder?: (push: (chunk: { data: ArrayBuffer; timestamp: number; type: 'key'|'delta'; duration?: number }) => void) => Promise<void>;
};

type QueuedFrame = { ts: number; bitmap: ImageBitmap };

export class WorkerVideoPipeline {
  private worker: Worker | null = null;
  private regId: string | null = null;
  private queue: QueuedFrame[] = [];
  private running = false;
  private opts: WorkerVideoPipelineOptions;
  private scheduleHandle: number | null = null;
  private lastClockSec = 0;

  constructor(options: WorkerVideoPipelineOptions) {
    this.opts = options;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Create decode worker
    this.worker = new Worker(new URL('../workers/videoDecode.worker.ts', import.meta.url), { type: 'module' });
    try { this.regId = workerRegistry.register({ id: '', kind: 'videoDecode', label: 'Video decode', meta: { queue: 0 } }); } catch {}

    this.worker.onmessage = (e: MessageEvent) => {
      const m = e.data || {};
      switch (m.type) {
        case 'ready':
          // Ready: main can begin supplying chunks or fallback
          break;
        case 'frame': {
          const bmp: ImageBitmap = m["0"] || m.bitmap; // some bundlers flatten payloads
          const ts: number = Number(m.ts || 0);
          if (bmp) {
            if (this.queue.length >= this.opts.maxQueueSize) {
              const old = this.queue.shift();
              try { old?.bitmap?.close?.(); } catch {}
            }
            this.queue.push({ ts, bitmap: bmp });
            try { if (this.regId) workerRegistry.update(this.regId, { queue: this.queue.length }); } catch {}
          }
          break;
        }
        case 'videoFrame': {
          // Not used in this minimal path
          break;
        }
        case 'error':
          // eslint-disable-next-line no-console
          console.warn('[WorkerVideoPipeline] worker error:', m.error);
          break;
        default:
          break;
      }
    };

    // Initialize worker
    try { this.worker.postMessage({ type: 'init', codec: 'vp9' }); } catch {}

    // If a chunk feeder is provided, start demuxing and feed chunks to the worker
    if (this.opts.chunkFeeder) {
      (async () => {
        try {
          await this.opts.chunkFeeder!(chunk => {
            try {
              this.worker?.postMessage({ type: 'decodeChunk', ...chunk }, [chunk.data as any]);
            } catch {}
          });
        } catch {}
      })();
    }
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.scheduleHandle !== null) {
      cancelAnimationFrame(this.scheduleHandle);
      this.scheduleHandle = null;
    }
    try { this.worker?.postMessage({ type: 'close' }); } catch {}
    try { this.worker?.terminate?.(); } catch {}
    this.worker = null;
    try { if (this.regId) workerRegistry.unregister(this.regId); } catch {}
    this.regId = null;
    while (this.queue.length) {
      const f = this.queue.shift();
      try { f?.bitmap?.close?.(); } catch {}
    }
    try { if (this.regId) workerRegistry.update(this.regId, { queue: 0 }); } catch {}
  }

  flush(): void {
    // Clear queued frames (e.g., on seek)
    while (this.queue.length) {
      const f = this.queue.shift();
      try { f?.bitmap?.close?.(); } catch {}
    }
    try { this.worker?.postMessage({ type: 'flush' }); } catch {}
    try { if (this.regId) workerRegistry.update(this.regId, { queue: 0 }); } catch {}
  }

  async requestAhead(playheadSec: number): Promise<void> {
    // Minimal fallback: capture Bitmaps via provided fallbackCapture
    // at a few timestamps ahead of playhead
    const margin = Math.max(0, this.opts.requestMarginMs) / 1000;
    const step = Math.max(1 / 60, margin / Math.max(1, this.opts.nbFramesToCheck));
    const targets: number[] = [];
    for (let i = 1; i <= this.opts.nbFramesToCheck; i++) {
      targets.push(playheadSec + i * step);
    }
    if (!this.opts.fallbackCapture) return;
    for (const ts of targets) {
      if (this.queue.length >= this.opts.maxQueueSize) break;
      try {
        const bmp = await this.opts.fallbackCapture(ts);
        if (!bmp) continue;
        this.queue.push({ ts, bitmap: bmp });
      } catch {}
    }
  }

  private schedule(): void {
    const loop = async () => {
      if (!this.running) return;
      const clock = Number(this.opts.clock?.() || 0);
      const drift = Math.abs(clock - this.lastClockSec);
      this.lastClockSec = clock;
      // On large jumps (seek), flush queue
      if (drift > 0.25) this.flush();

      // Pre-request frames if queue is low
      if (this.queue.length < Math.max(1, Math.floor(this.opts.maxQueueSize / 2))) {
        await this.requestAhead(clock);
        try { if (this.regId) workerRegistry.update(this.regId, { queue: this.queue.length }); } catch {}
        try { this.opts.onQueueStats?.({ size: this.queue.length }); } catch {}
      }

      // Present frames whose ts <= clock + small margin
      const presentMargin = Math.max(0, this.opts.requestMarginMs) / 1000;
      while (this.queue.length > 0 && this.queue[0].ts <= clock + presentMargin) {
        const f = this.queue.shift()!;
        try { this.opts.onFrame(f.bitmap, f.ts); } catch { try { f.bitmap.close?.(); } catch {} }
        try { if (this.regId) workerRegistry.update(this.regId, { queue: this.queue.length }); } catch {}
        try { this.opts.onQueueStats?.({ size: this.queue.length }); } catch {}
      }
      this.scheduleHandle = requestAnimationFrame(loop);
    };
    this.scheduleHandle = requestAnimationFrame(loop);
  }
}


