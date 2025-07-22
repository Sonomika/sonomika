import { BaseEffect, EffectMetadata } from './BaseEffect';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export class ParticleSystem extends BaseEffect {
  private particles: Particle[] = [];
  private time: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: 'Particle System',
      description: 'Dynamic particle system that responds to BPM',
      parameters: [
        {
          name: 'particleCount',
          type: 'number',
          min: 10,
          max: 200,
          step: 10,
          default: 50,
        },
        {
          name: 'speed',
          type: 'number',
          min: 0.1,
          max: 3.0,
          step: 0.1,
          default: 1.0,
        },
        {
          name: 'size',
          type: 'number',
          min: 1,
          max: 20,
          step: 1,
          default: 5,
        },
        {
          name: 'colorMode',
          type: 'select',
          options: ['white', 'rainbow', 'fire', 'ice'],
          default: 'rainbow',
        },
        {
          name: 'emissionRate',
          type: 'number',
          min: 0.1,
          max: 5.0,
          step: 0.1,
          default: 1.0,
        },
      ],
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const { width, height } = this.canvas;
    const speed = this.params.speed as number;
    const size = this.params.size as number;
    const colorMode = this.params.colorMode as string;
    const emissionRate = this.params.emissionRate as number;

    // Clear the canvas
    this.ctx.clearRect(0, 0, width, height);

    // Update time based on BPM
    const beatsPerSecond = this.bpm / 60;
    this.time += deltaTime * beatsPerSecond * 0.1;

    // Emit new particles based on BPM
    const emissionInterval = 1 / (beatsPerSecond * emissionRate);
    if (this.time % emissionInterval < deltaTime) {
      this.emitParticle(width, height, speed, size, colorMode);
    }

    // Update and draw particles
    this.particles = this.particles.filter(particle => {
      // Update position
      particle.x += particle.vx * deltaTime * 60;
      particle.y += particle.vy * deltaTime * 60;
      particle.life -= deltaTime * 60;

      // Remove dead particles
      if (particle.life <= 0) return false;

      // Draw particle
      const alpha = particle.life / particle.maxLife;
      this.ctx!.globalAlpha = alpha;
      this.ctx!.fillStyle = particle.color;
      this.ctx!.beginPath();
      this.ctx!.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      this.ctx!.fill();

      return true;
    });

    this.ctx.globalAlpha = 1;
  }

  private emitParticle(width: number, height: number, speed: number, size: number, colorMode: string): void {
    const particle: Particle = {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * speed * 100,
      vy: (Math.random() - 0.5) * speed * 100,
      life: 100 + Math.random() * 50,
      maxLife: 100 + Math.random() * 50,
      size: size + Math.random() * size * 0.5,
      color: this.getParticleColor(colorMode),
    };

    this.particles.push(particle);
  }

  private getParticleColor(colorMode: string): string {
    switch (colorMode) {
      case 'rainbow':
        const hue = (this.time * 50) % 360;
        return `hsl(${hue}, 70%, 60%)`;
      case 'fire':
        const fireHue = 15 + Math.random() * 30;
        return `hsl(${fireHue}, 100%, 60%)`;
      case 'ice':
        const iceHue = 180 + Math.random() * 60;
        return `hsl(${iceHue}, 70%, 80%)`;
      default:
        return 'white';
    }
  }
} 