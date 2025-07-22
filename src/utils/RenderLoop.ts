type RenderCallback = (deltaTime: number) => void;

export class RenderLoop {
  private static instance: RenderLoop;
  private callbacks: Set<RenderCallback>;
  private running: boolean;
  private lastTime: number;
  private animationFrameId: number | null;

  private constructor() {
    this.callbacks = new Set();
    this.running = false;
    this.lastTime = 0;
    this.animationFrameId = null;
  }

  static getInstance(): RenderLoop {
    if (!RenderLoop.instance) {
      RenderLoop.instance = new RenderLoop();
    }
    return RenderLoop.instance;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  addCallback(callback: RenderCallback): void {
    this.callbacks.add(callback);
    if (!this.running && this.callbacks.size > 0) {
      this.start();
    }
  }

  removeCallback(callback: RenderCallback): void {
    this.callbacks.delete(callback);
    if (this.running && this.callbacks.size === 0) {
      this.stop();
    }
  }

  private tick = (): void => {
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    this.callbacks.forEach(callback => {
      try {
        callback(deltaTime);
      } catch (error) {
        console.error('Error in render callback:', error);
      }
    });

    if (this.running) {
      this.animationFrameId = requestAnimationFrame(this.tick);
    }
  };
} 