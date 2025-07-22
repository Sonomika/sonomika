import { BaseEffect, EffectMetadata } from './BaseEffect';

export class CirclePulse extends BaseEffect {
  getMetadata(): EffectMetadata {
    return {
      name: 'Circle Pulse',
      description: 'A pulsing circle that syncs with the BPM',
      parameters: [
        {
          name: 'size',
          type: 'number',
          min: 0.1,
          max: 1.0,
          step: 0.01,
          default: 0.5,
        },
        {
          name: 'speed',
          type: 'number',
          min: 0.25,
          max: 4,
          step: 0.25,
          default: 1,
        },
        {
          name: 'color',
          type: 'select',
          options: ['red', 'green', 'blue', 'yellow', 'purple'],
          default: 'blue',
        },
      ],
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const size = this.params.size as number;
    const speed = this.params.speed as number;
    const color = this.params.color as string;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Calculate pulse based on BPM and deltaTime
    const beatsPerSecond = this.bpm / 60;
    const pulsesPerBeat = speed;
    const pulsePhase = (Date.now() * beatsPerSecond * pulsesPerBeat) / 1000;
    const pulse = Math.sin(pulsePhase * Math.PI * 2) * 0.5 + 0.5;

    // Apply deltaTime for smoother animation
    const timeScale = Math.min(deltaTime * 60, 2); // Cap at 2x speed

    // Draw the circle
    const maxRadius = Math.min(width, height) * 0.5 * size;
    const currentRadius = maxRadius * (0.5 + pulse * 0.5) * timeScale;

    this.ctx.beginPath();
    this.ctx.arc(width / 2, height / 2, currentRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }
} 