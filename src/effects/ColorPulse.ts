import { BaseEffect, EffectMetadata } from './BaseEffect';

export class ColorPulse extends BaseEffect {
  private hue: number = 0;
  private time: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: 'Color Pulse',
      description: 'A color-changing background that pulses with the BPM',
      parameters: [
        {
          name: 'intensity',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.5,
        },
        {
          name: 'colorSpeed',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.1,
        },
        {
          name: 'autoColor',
          type: 'boolean',
          default: true,
        },
      ],
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const colorSpeed = this.params.colorSpeed as number;
    const intensity = this.params.intensity as number;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Accumulate time properly
    this.time += deltaTime;

    // Update hue based on BPM and accumulated time
    const beatsPerSecond = this.bpm / 60;
    this.hue = (this.time * beatsPerSecond * colorSpeed * 60) % 360;

    // Create gradient
    const gradient = this.ctx.createLinearGradient(0, 0, width, height);
    const color1 = `hsl(${this.hue}, 70%, ${50 + intensity * 20}%)`;
    const color2 = `hsl(${(this.hue + 60) % 360}, 70%, ${50 + intensity * 20}%)`;
    const color3 = `hsl(${(this.hue + 120) % 360}, 70%, ${50 + intensity * 20}%)`;

    gradient.addColorStop(0, color1);
    gradient.addColorStop(0.5, color2);
    gradient.addColorStop(1, color3);

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
  }
} 