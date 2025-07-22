export interface TransitionConfig {
  type: 'fade' | 'slide' | 'zoom' | 'rotate' | 'wipe';
  duration: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  direction?: 'left' | 'right' | 'up' | 'down' | 'center';
}

export type TransitionType = 'cut' | 'fade' | 'fade-through-black';

export class SceneTransition {
  private static instance: SceneTransition;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isTransitioning: boolean;
  private transitionStartTime: number;
  private transitionDuration: number;
  private transitionType: TransitionType;
  private fromCanvas: HTMLCanvasElement | null;
  private toCanvas: HTMLCanvasElement | null;
  private onComplete: (() => void) | null;

  private constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    this.isTransitioning = false;
    this.transitionStartTime = 0;
    this.transitionDuration = 500;
    this.transitionType = 'fade';
    this.fromCanvas = null;
    this.toCanvas = null;
    this.onComplete = null;

    this.animate = this.animate.bind(this);
  }

  static getInstance(): SceneTransition {
    if (!SceneTransition.instance) {
      SceneTransition.instance = new SceneTransition();
    }
    return SceneTransition.instance;
  }

  transition(
    fromCanvas: HTMLCanvasElement,
    toCanvas: HTMLCanvasElement,
    options: {
      type?: TransitionType;
      duration?: number;
      onComplete?: () => void;
    } = {}
  ): void {
    // Set up canvas dimensions
    this.canvas.width = fromCanvas.width;
    this.canvas.height = fromCanvas.height;

    // Store transition parameters
    this.fromCanvas = fromCanvas;
    this.toCanvas = toCanvas;
    this.transitionType = options.type ?? 'fade';
    this.transitionDuration = options.duration ?? 500;
    this.onComplete = options.onComplete ?? null;

    // Start transition
    this.isTransitioning = true;
    this.transitionStartTime = performance.now();
    requestAnimationFrame(this.animate);
  }

  private animate(currentTime: number): void {
    if (!this.isTransitioning || !this.fromCanvas || !this.toCanvas) return;

    const progress = Math.min(
      1,
      (currentTime - this.transitionStartTime) / this.transitionDuration
    );

    switch (this.transitionType) {
      case 'cut':
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(progress < 1 ? this.fromCanvas : this.toCanvas, 0, 0);
        break;

      case 'fade':
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalAlpha = 1;
        this.ctx.drawImage(this.fromCanvas, 0, 0);
        this.ctx.globalAlpha = progress;
        this.ctx.drawImage(this.toCanvas, 0, 0);
        this.ctx.globalAlpha = 1;
        break;

      case 'fade-through-black':
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (progress < 0.5) {
          // Fade out from source
          this.ctx.globalAlpha = 1 - progress * 2;
          this.ctx.drawImage(this.fromCanvas, 0, 0);
        } else {
          // Fade in to destination
          this.ctx.globalAlpha = (progress - 0.5) * 2;
          this.ctx.drawImage(this.toCanvas, 0, 0);
        }
        this.ctx.globalAlpha = 1;
        break;
    }

    if (progress < 1) {
      requestAnimationFrame(this.animate);
    } else {
      this.isTransitioning = false;
      this.fromCanvas = null;
      this.toCanvas = null;
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  isActive(): boolean {
    return this.isTransitioning;
  }
} 