import { BaseEffect, EffectMetadata } from './BaseEffect';

export class Waveform extends BaseEffect {
  private time: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: 'Waveform',
      description: 'Animated waveform patterns that sync with BPM',
      parameters: [
        {
          name: 'frequency',
          type: 'number',
          min: 1,
          max: 20,
          step: 1,
          default: 5,
        },
        {
          name: 'amplitude',
          type: 'number',
          min: 0.1,
          max: 1.0,
          step: 0.1,
          default: 0.5,
        },
        {
          name: 'waveType',
          type: 'select',
          options: ['sine', 'square', 'sawtooth', 'triangle'],
          default: 'sine',
        },
        {
          name: 'color',
          type: 'select',
          options: ['cyan', 'magenta', 'yellow', 'white', 'rainbow'],
          default: 'cyan',
        },
      ],
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const frequency = this.params.frequency as number;
    const amplitude = this.params.amplitude as number;
    const waveType = this.params.waveType as string;
    const color = this.params.color as string;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Update time based on BPM
    const beatsPerSecond = this.bpm / 60;
    this.time += deltaTime * beatsPerSecond * 0.1;

    // Draw waveform
    this.ctx.beginPath();
    this.ctx.moveTo(0, height / 2);

    for (let x = 0; x < width; x += 2) {
      const normalizedX = x / width;
      let y = height / 2;

      // Calculate wave value
      let waveValue = 0;
      const phase = this.time + normalizedX * frequency * Math.PI * 2;

      switch (waveType) {
        case 'sine':
          waveValue = Math.sin(phase);
          break;
        case 'square':
          waveValue = Math.sin(phase) > 0 ? 1 : -1;
          break;
        case 'sawtooth':
          waveValue = ((phase % (Math.PI * 2)) / (Math.PI * 2)) * 2 - 1;
          break;
        case 'triangle':
          waveValue = Math.abs(((phase % (Math.PI * 2)) / (Math.PI * 2)) * 2 - 1) * 2 - 1;
          break;
      }

      y += waveValue * (height / 2) * amplitude;
      this.ctx.lineTo(x, y);
    }

    // Set color
    if (color === 'rainbow') {
      const hue = (this.time * 50) % 360;
      this.ctx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
    } else {
      this.ctx.strokeStyle = color;
    }

    this.ctx.lineWidth = 3;
    this.ctx.stroke();
  }
} 