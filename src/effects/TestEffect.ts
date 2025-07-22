import { BaseEffect, EffectMetadata } from './BaseEffect';

export class TestEffect extends BaseEffect {
  private hue: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: 'Test Effect',
      description: 'A test effect combining circle pulse and color pulse',
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
        {
          name: 'shape',
          type: 'select',
          options: ['circle', 'square', 'triangle'],
          default: 'circle',
        },
      ],
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const speed = this.params.speed as number;
    const size = this.params.size as number;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Update hue based on BPM and deltaTime
    const beatsPerSecond = this.bpm / 60;
    this.hue += deltaTime * beatsPerSecond * speed * 60;
    if (this.hue >= 360) this.hue -= 360;

    // Draw multiple circles
    const numCircles = 5;
    for (let i = 0; i < numCircles; i++) {
      const x = width / 2 + Math.cos(this.hue * Math.PI / 180 + i * Math.PI * 2 / numCircles) * 100;
      const y = height / 2 + Math.sin(this.hue * Math.PI / 180 + i * Math.PI * 2 / numCircles) * 100;
      const radius = size * 20 + Math.sin(this.hue * Math.PI / 180 + i) * 10;

      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `hsl(${this.hue + i * 60}, 70%, 60%)`;
      this.ctx.fill();
    }
  }
} 