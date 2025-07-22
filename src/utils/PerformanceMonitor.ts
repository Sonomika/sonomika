export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  effectCount: number;
  activeLayers: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private fpsHistory: number[] = [];
  private frameTimeHistory: number[] = [];
  private maxHistorySize: number = 60; // Keep last 60 frames
  private isMonitoring: boolean = false;

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startMonitoring(): void {
    this.isMonitoring = true;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
  }

  recordFrame(): void {
    if (!this.isMonitoring) return;

    const currentTime = performance.now();
    const frameTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Calculate FPS
    const fps = 1000 / frameTime;

    // Add to history
    this.fpsHistory.push(fps);
    this.frameTimeHistory.push(frameTime);

    // Keep history size manageable
    if (this.fpsHistory.length > this.maxHistorySize) {
      this.fpsHistory.shift();
      this.frameTimeHistory.shift();
    }

    this.frameCount++;
  }

  getMetrics(): PerformanceMetrics {
    const avgFps = this.fpsHistory.length > 0 
      ? this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length 
      : 0;
    
    const avgFrameTime = this.frameTimeHistory.length > 0 
      ? this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length 
      : 0;

    return {
      fps: Math.round(avgFps),
      frameTime: Math.round(avgFrameTime * 100) / 100,
      memoryUsage: this.getMemoryUsage(),
      effectCount: 0, // Will be set by renderer
      activeLayers: 0, // Will be set by renderer
    };
  }

  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1024 / 1024 * 100) / 100; // MB
    }
    return 0;
  }

  getFpsHistory(): number[] {
    return [...this.fpsHistory];
  }

  getFrameTimeHistory(): number[] {
    return [...this.frameTimeHistory];
  }

  isPerformanceGood(): boolean {
    const metrics = this.getMetrics();
    return metrics.fps >= 30 && metrics.frameTime < 33; // 30 FPS threshold
  }

  getPerformanceWarning(): string | null {
    const metrics = this.getMetrics();
    
    if (metrics.fps < 30) {
      return `Low FPS: ${metrics.fps} (target: 30+)`;
    }
    
    if (metrics.frameTime > 33) {
      return `High frame time: ${metrics.frameTime}ms (target: <33ms)`;
    }
    
    if (metrics.memoryUsage > 500) {
      return `High memory usage: ${metrics.memoryUsage}MB`;
    }
    
    return null;
  }

  reset(): void {
    this.fpsHistory = [];
    this.frameTimeHistory = [];
    this.frameCount = 0;
  }
} 