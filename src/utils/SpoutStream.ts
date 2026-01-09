import { useStore } from '../store/store';

type ElectronSpoutApi = {
  startSpout?: (senderName?: string) => Promise<{ success: boolean; error?: string }>;
  stopSpout?: () => Promise<{ success: boolean; error?: string }>;
  sendSpoutFrame?: (dataUrl: string, maxFps?: number) => void;
};

export class SpoutStreamManager {
  private animationId: number | null = null;
  private running = false;
  private canvasGetter: () => HTMLCanvasElement | null;
  private tmp: HTMLCanvasElement | null = null;
  private tmpCtx: CanvasRenderingContext2D | null = null;
  private lastAt = 0;
  private lastDataUrl = '';
  private op: Promise<any> = Promise.resolve();
  private lastStopAtMs = 0;

  constructor(canvasGetter: () => HTMLCanvasElement | null) {
    this.canvasGetter = canvasGetter;
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    return (this.op = this.op.then(async () => {
      if (this.running) return { success: true };
      const electronAny: ElectronSpoutApi | undefined = (window as any)?.electron;
      if (!electronAny?.startSpout || !electronAny?.sendSpoutFrame) {
        return { success: false, error: 'Spout API not available (Electron only).' };
      }

      // Cooldown: avoid re-registering immediately after stop, which can cause Spout to append "_1".
      const sinceStop = Date.now() - (this.lastStopAtMs || 0);
      if (sinceStop >= 0 && sinceStop < 800) {
        await new Promise((r) => setTimeout(r, 800 - sinceStop));
      }

      const st: any = useStore.getState();
      const senderName = String(st?.spoutSenderName || 'Sonomika Output');
      const res = await electronAny.startSpout(senderName);
      if (!res?.success) return { success: false, error: res?.error || 'Failed to start Spout.' };

      this.running = true;
      this.lastAt = 0;
      this.lastDataUrl = '';
      this.ensureTempCanvas();
      this.loop();
      return { success: true };
    }));
  }

  async stop(): Promise<void> {
    this.op = this.op.then(async () => {
      this.running = false;
      if (this.animationId != null) {
        try { cancelAnimationFrame(this.animationId); } catch {}
        this.animationId = null;
      }
      this.lastAt = 0;
      this.lastDataUrl = '';
      this.lastStopAtMs = Date.now();
      try {
        const electronAny: ElectronSpoutApi | undefined = (window as any)?.electron;
        await electronAny?.stopSpout?.();
      } catch {}
    });
    await this.op;
  }

  isRunning(): boolean {
    return this.running;
  }

  private ensureTempCanvas(): void {
    if (this.tmp && this.tmpCtx) return;
    this.tmp = document.createElement('canvas');
    this.tmpCtx = this.tmp.getContext('2d', { alpha: false });
  }

  private loop(): void {
    const tick = () => {
      if (!this.running) return;
      this.captureAndSend();
      this.animationId = requestAnimationFrame(tick);
    };
    this.animationId = requestAnimationFrame(tick);
  }

  private captureAndSend(): void {
    try {
      const electronAny: ElectronSpoutApi | undefined = (window as any)?.electron;
      if (!electronAny?.sendSpoutFrame) return;

      const st: any = useStore.getState();
      const maxFps = Math.max(1, Math.min(120, Number(st?.spoutMaxFps ?? 60) || 60));
      const now = performance.now();
      const interval = 1000 / maxFps;
      if (now - this.lastAt < interval) return;

      const src = this.canvasGetter();
      if (!src || src.width <= 0 || src.height <= 0) return;

      const comp = st?.compositionSettings || {};
      const compW = Math.max(1, Number(comp.width) || src.width || 1920);
      const compH = Math.max(1, Number(comp.height) || src.height || 1080);
      const bg = String(comp.backgroundColor || '#000000');

      const mq = String(st?.mirrorQuality || 'medium');
      const jpegQ = mq === 'low' ? 0.6 : (mq === 'medium' ? 0.85 : 0.95);

      this.ensureTempCanvas();
      if (!this.tmp || !this.tmpCtx) return;

      if (this.tmp.width !== compW || this.tmp.height !== compH) {
        this.tmp.width = compW;
        this.tmp.height = compH;
      }

      const ctx = this.tmpCtx;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, compW, compH);

      // Draw WebGL canvas into a 2D surface with contain fit.
      const srcW = src.width;
      const srcH = src.height;
      const scale = Math.min(compW / srcW, compH / srcH);
      const drawW = Math.floor(srcW * scale);
      const drawH = Math.floor(srcH * scale);
      const dx = Math.floor((compW - drawW) / 2);
      const dy = Math.floor((compH - drawH) / 2);
      ctx.imageSmoothingEnabled = true;
      try { (ctx as any).imageSmoothingQuality = (mq === 'low' ? 'low' : (mq === 'medium' ? 'medium' : 'high')); } catch {}
      ctx.drawImage(src, dx, dy, drawW, drawH);

      const dataUrl = this.tmp.toDataURL('image/jpeg', jpegQ);
      if (dataUrl && dataUrl.length > 100 && dataUrl !== this.lastDataUrl) {
        electronAny.sendSpoutFrame(dataUrl, maxFps);
        this.lastDataUrl = dataUrl;
        this.lastAt = now;
      }
    } catch {}
  }
}


