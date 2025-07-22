import { BaseEffect, EffectMetadata } from './BaseEffect';

export class TransitionEffect extends BaseEffect {
  private progress: number = 0;
  private startTime: number = 0;
  private isActive: boolean = false;

  getMetadata(): EffectMetadata {
    return {
      name: 'Transition Effect',
      description: 'Smooth transition effects between scenes',
      parameters: [
        {
          name: 'transitionType',
          type: 'select',
          options: ['fade', 'slide', 'zoom', 'rotate', 'wipe'],
          default: 'fade',
        },
        {
          name: 'direction',
          type: 'select',
          options: ['left', 'right', 'up', 'down', 'center'],
          default: 'left',
        },
        {
          name: 'duration',
          type: 'number',
          min: 100,
          max: 5000,
          step: 100,
          default: 1000,
        },
        {
          name: 'easing',
          type: 'select',
          options: ['linear', 'easeIn', 'easeOut', 'easeInOut'],
          default: 'easeInOut',
        },
      ],
    };
  }

  render(): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const transitionType = this.params.transitionType as string;
    const direction = this.params.direction as string;
    const duration = this.params.duration as number;
    const easing = this.params.easing as string;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    if (!this.isActive) return;

    // Calculate progress
    const elapsed = Date.now() - this.startTime;
    this.progress = Math.min(elapsed / duration, 1);
    
    // Apply easing
    const easedProgress = this.applyEasing(this.progress, easing);

    // Draw transition based on type
    switch (transitionType) {
      case 'fade':
        this.drawFadeTransition(easedProgress);
        break;
      case 'slide':
        this.drawSlideTransition(easedProgress, direction);
        break;
      case 'zoom':
        this.drawZoomTransition(easedProgress);
        break;
      case 'rotate':
        this.drawRotateTransition(easedProgress);
        break;
      case 'wipe':
        this.drawWipeTransition(easedProgress, direction);
        break;
    }

    // Check if transition is complete
    if (this.progress >= 1) {
      this.isActive = false;
    }
  }

  startTransition(): void {
    this.isActive = true;
    this.startTime = Date.now();
    this.progress = 0;
  }

  private applyEasing(progress: number, easing: string): number {
    switch (easing) {
      case 'easeIn':
        return progress * progress;
      case 'easeOut':
        return 1 - (1 - progress) * (1 - progress);
      case 'easeInOut':
        return progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      default:
        return progress;
    }
  }

  private drawFadeTransition(progress: number): void {
    this.ctx!.globalAlpha = progress;
    this.ctx!.fillStyle = 'black';
    this.ctx!.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx!.globalAlpha = 1;
  }

  private drawSlideTransition(progress: number, direction: string): void {
    const { width, height } = this.canvas;
    let x = 0, y = 0, w = width, h = height;

    switch (direction) {
      case 'left':
        w = width * progress;
        break;
      case 'right':
        x = width * (1 - progress);
        w = width * progress;
        break;
      case 'up':
        h = height * progress;
        break;
      case 'down':
        y = height * (1 - progress);
        h = height * progress;
        break;
    }

    this.ctx!.fillStyle = 'black';
    this.ctx!.fillRect(x, y, w, h);
  }

  private drawZoomTransition(progress: number): void {
    const { width, height } = this.canvas;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
    const currentRadius = maxRadius * progress;

    this.ctx!.beginPath();
    this.ctx!.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
    this.ctx!.fillStyle = 'black';
    this.ctx!.fill();
  }

  private drawRotateTransition(progress: number): void {
    const { width, height } = this.canvas;
    const centerX = width / 2;
    const centerY = height / 2;
    const rotation = progress * Math.PI * 2;

    this.ctx!.save();
    this.ctx!.translate(centerX, centerY);
    this.ctx!.rotate(rotation);
    this.ctx!.fillStyle = 'black';
    this.ctx!.fillRect(-width, -height, width * 2, height * 2);
    this.ctx!.restore();
  }

  private drawWipeTransition(progress: number, direction: string): void {
    const { width, height } = this.canvas;
    this.ctx!.save();

    switch (direction) {
      case 'left':
        this.ctx!.translate(width * (1 - progress), 0);
        break;
      case 'right':
        this.ctx!.translate(-width * progress, 0);
        break;
      case 'up':
        this.ctx!.translate(0, height * (1 - progress));
        break;
      case 'down':
        this.ctx!.translate(0, -height * progress);
        break;
      case 'center':
        const scale = 1 - progress;
        this.ctx!.translate(width / 2, height / 2);
        this.ctx!.scale(scale, scale);
        this.ctx!.translate(-width / 2, -height / 2);
        break;
    }

    this.ctx!.fillStyle = 'black';
    this.ctx!.fillRect(0, 0, width, height);
    this.ctx!.restore();
  }

  isTransitionActive(): boolean {
    return this.isActive;
  }

  getProgress(): number {
    return this.progress;
  }
} 