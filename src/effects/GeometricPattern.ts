import { BaseEffect, EffectMetadata } from './BaseEffect';

export class GeometricPattern extends BaseEffect {
  private time: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: 'Geometric Pattern',
      description: 'Rotating geometric patterns that sync with BPM',
      parameters: [
        {
          name: 'shape',
          type: 'select',
          options: ['triangle', 'square', 'pentagon', 'hexagon', 'star'],
          default: 'triangle',
        },
        {
          name: 'rotationSpeed',
          type: 'number',
          min: 0.1,
          max: 5.0,
          step: 0.1,
          default: 1.0,
        },
        {
          name: 'scale',
          type: 'number',
          min: 0.1,
          max: 2.0,
          step: 0.1,
          default: 0.8,
        },
        {
          name: 'color',
          type: 'select',
          options: ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'rainbow'],
          default: 'blue',
        },
        {
          name: 'fillMode',
          type: 'select',
          options: ['fill', 'stroke', 'both'],
          default: 'both',
        },
      ],
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const shape = this.params.shape as string;
    const rotationSpeed = this.params.rotationSpeed as number;
    const scale = this.params.scale as number;
    const color = this.params.color as string;
    const fillMode = this.params.fillMode as string;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Update time based on BPM
    const beatsPerSecond = this.bpm / 60;
    this.time += deltaTime * beatsPerSecond * rotationSpeed * 0.1;

    // Set color
    if (color === 'rainbow') {
      const hue = (this.time * 50) % 360;
      this.ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
      this.ctx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
    } else {
      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = color;
    }

    this.ctx.lineWidth = 3;

    // Draw multiple shapes
    const numShapes = 5;
    for (let i = 0; i < numShapes; i++) {
      const angle = (this.time + (i * Math.PI * 2) / numShapes) % (Math.PI * 2);
      const radius = Math.min(width, height) * 0.3 * scale;
      const x = width / 2 + Math.cos(angle) * radius;
      const y = height / 2 + Math.sin(angle) * radius;
      const rotation = this.time * 2 + (i * Math.PI * 2) / numShapes;

      this.drawShape(x, y, rotation, scale, shape, fillMode);
    }
  }

  private drawShape(x: number, y: number, rotation: number, scale: number, shape: string, fillMode: string): void {
    this.ctx!.save();
    this.ctx!.translate(x, y);
    this.ctx!.rotate(rotation);
    this.ctx!.scale(scale, scale);

    const size = 50;

    switch (shape) {
      case 'triangle':
        this.drawTriangle(size, fillMode);
        break;
      case 'square':
        this.drawSquare(size, fillMode);
        break;
      case 'pentagon':
        this.drawPolygon(5, size, fillMode);
        break;
      case 'hexagon':
        this.drawPolygon(6, size, fillMode);
        break;
      case 'star':
        this.drawStar(size, fillMode);
        break;
    }

    this.ctx!.restore();
  }

  private drawTriangle(size: number, fillMode: string): void {
    this.ctx!.beginPath();
    this.ctx!.moveTo(0, -size);
    this.ctx!.lineTo(-size * 0.866, size * 0.5);
    this.ctx!.lineTo(size * 0.866, size * 0.5);
    this.ctx!.closePath();
    this.applyFillMode(fillMode);
  }

  private drawSquare(size: number, fillMode: string): void {
    this.ctx!.beginPath();
    this.ctx!.rect(-size, -size, size * 2, size * 2);
    this.applyFillMode(fillMode);
  }

  private drawPolygon(sides: number, size: number, fillMode: string): void {
    this.ctx!.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i * Math.PI * 2) / sides;
      const x = Math.cos(angle) * size;
      const y = Math.sin(angle) * size;
      if (i === 0) {
        this.ctx!.moveTo(x, y);
      } else {
        this.ctx!.lineTo(x, y);
      }
    }
    this.ctx!.closePath();
    this.applyFillMode(fillMode);
  }

  private drawStar(size: number, fillMode: string): void {
    this.ctx!.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI * 2) / 10;
      const radius = i % 2 === 0 ? size : size * 0.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        this.ctx!.moveTo(x, y);
      } else {
        this.ctx!.lineTo(x, y);
      }
    }
    this.ctx!.closePath();
    this.applyFillMode(fillMode);
  }

  private applyFillMode(fillMode: string): void {
    switch (fillMode) {
      case 'fill':
        this.ctx!.fill();
        break;
      case 'stroke':
        this.ctx!.stroke();
        break;
      case 'both':
        this.ctx!.fill();
        this.ctx!.stroke();
        break;
    }
  }
} 