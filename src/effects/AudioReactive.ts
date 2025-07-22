import { BaseEffect, EffectMetadata } from './BaseEffect';

export class AudioReactive extends BaseEffect {
  private time: number = 0;
  private frequencies: number[] = [];

  getMetadata(): EffectMetadata {
    return {
      name: 'Audio Reactive',
      description: 'Simulated audio frequency visualization',
      parameters: [
        {
          name: 'sensitivity',
          type: 'number',
          min: 0.1,
          max: 2.0,
          step: 0.1,
          default: 1.0,
        },
        {
          name: 'colorMode',
          type: 'select',
          options: ['frequency', 'amplitude', 'rainbow', 'fire', 'ocean'],
          default: 'frequency',
        },
        {
          name: 'barWidth',
          type: 'number',
          min: 1,
          max: 20,
          step: 1,
          default: 8,
        },
        {
          name: 'visualizationType',
          type: 'select',
          options: ['bars', 'circles', 'waveform', 'spectrum'],
          default: 'bars',
        },
      ],
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const sensitivity = this.params.sensitivity as number;
    const colorMode = this.params.colorMode as string;
    const barWidth = this.params.barWidth as number;
    const visualizationType = this.params.visualizationType as string;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Update time based on BPM
    const beatsPerSecond = this.bpm / 60;
    this.time += deltaTime * beatsPerSecond * 0.1;

    // Generate simulated frequency data
    this.generateFrequencies(width, sensitivity);

    // Draw visualization based on type
    switch (visualizationType) {
      case 'bars':
        this.drawBars(width, height, barWidth, colorMode);
        break;
      case 'circles':
        this.drawCircles(width, height, colorMode);
        break;
      case 'waveform':
        this.drawWaveform(width, height, colorMode);
        break;
      case 'spectrum':
        this.drawSpectrum(width, height, colorMode);
        break;
    }
  }

  private generateFrequencies(width: number, sensitivity: number): void {
    const numBands = Math.floor(width / 10);
    this.frequencies = [];

    for (let i = 0; i < numBands; i++) {
      const frequency = i / numBands;
      const amplitude = this.getFrequencyAmplitude(frequency, sensitivity);
      this.frequencies.push(amplitude);
    }
  }

  private getFrequencyAmplitude(frequency: number, sensitivity: number): number {
    // Simulate different frequency responses
    const bass = Math.sin(this.time * 2 + frequency * 10) * 0.5 + 0.5;
    const mid = Math.sin(this.time * 4 + frequency * 20) * 0.5 + 0.5;
    const treble = Math.sin(this.time * 8 + frequency * 30) * 0.5 + 0.5;

    // Mix frequencies based on frequency range
    let amplitude = 0;
    if (frequency < 0.3) {
      amplitude = bass * sensitivity;
    } else if (frequency < 0.7) {
      amplitude = mid * sensitivity;
    } else {
      amplitude = treble * sensitivity;
    }

    return Math.max(0, Math.min(1, amplitude));
  }

  private drawBars(width: number, height: number, barWidth: number, colorMode: string): void {
    const barCount = Math.floor(width / barWidth);
    const barSpacing = width / barCount;

    for (let i = 0; i < barCount && i < this.frequencies.length; i++) {
      const amplitude = this.frequencies[i];
      const barHeight = amplitude * height * 0.8;
      const x = i * barSpacing;
      const y = height - barHeight;

      this.ctx!.fillStyle = this.getColor(i, amplitude, colorMode);
      this.ctx!.fillRect(x, y, barSpacing * 0.8, barHeight);
    }
  }

  private drawCircles(width: number, height: number, colorMode: string): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.4;

    for (let i = 0; i < this.frequencies.length; i++) {
      const amplitude = this.frequencies[i];
      const radius = amplitude * maxRadius;
      const angle = (i / this.frequencies.length) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      this.ctx!.fillStyle = this.getColor(i, amplitude, colorMode);
      this.ctx!.beginPath();
      this.ctx!.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx!.fill();
    }
  }

  private drawWaveform(width: number, height: number, colorMode: string): void {
    this.ctx!.beginPath();
    this.ctx!.moveTo(0, height / 2);

    for (let i = 0; i < width; i += 2) {
      const index = Math.floor((i / width) * this.frequencies.length);
      const amplitude = this.frequencies[index] || 0;
      const y = height / 2 + (amplitude - 0.5) * height * 0.8;

      this.ctx!.lineTo(i, y);
    }

    this.ctx!.strokeStyle = this.getColor(0, 1, colorMode);
    this.ctx!.lineWidth = 2;
    this.ctx!.stroke();
  }

  private drawSpectrum(width: number, height: number, colorMode: string): void {
    const barHeight = height / this.frequencies.length;

    for (let i = 0; i < this.frequencies.length; i++) {
      const amplitude = this.frequencies[i];
      const y = i * barHeight;
      const barWidth = amplitude * width * 0.8;

      this.ctx!.fillStyle = this.getColor(i, amplitude, colorMode);
      this.ctx!.fillRect(0, y, barWidth, barHeight * 0.8);
    }
  }

  private getColor(index: number, amplitude: number, colorMode: string): string {
    switch (colorMode) {
      case 'frequency':
        const hue = (index / this.frequencies.length) * 360;
        return `hsl(${hue}, 70%, ${50 + amplitude * 30}%)`;
      case 'amplitude':
        const intensity = Math.floor(amplitude * 255);
        return `rgb(${intensity}, ${intensity}, ${intensity})`;
      case 'rainbow':
        const rainbowHue = (this.time * 50 + index * 10) % 360;
        return `hsl(${rainbowHue}, 70%, 60%)`;
      case 'fire':
        const fireHue = 15 + amplitude * 30;
        return `hsl(${fireHue}, 100%, ${50 + amplitude * 30}%)`;
      case 'ocean':
        const oceanHue = 180 + amplitude * 60;
        return `hsl(${oceanHue}, 70%, ${40 + amplitude * 40}%)`;
      default:
        return 'white';
    }
  }
} 