import { R3FBaseEffect, R3FEffectMetadata } from './R3FBaseEffect';
import * as THREE from 'three';

export class R3FParticleSystem extends R3FBaseEffect {
  private particles: THREE.Points | null = null;
  private positions: Float32Array | null = null;
  private velocities: Float32Array | null = null;

  getMetadata(): R3FEffectMetadata {
    return {
      name: 'Particle System',
      description: 'A dynamic particle system that responds to BPM',
      parameters: [
        {
          name: 'particleCount',
          type: 'number',
          min: 100,
          max: 10000,
          step: 100,
          default: 1000,
        },
        {
          name: 'speed',
          type: 'number',
          min: 0.1,
          max: 5.0,
          step: 0.1,
          default: 1.0,
        },
        {
          name: 'size',
          type: 'number',
          min: 0.01,
          max: 0.1,
          step: 0.01,
          default: 0.02,
        },
        {
          name: 'color',
          type: 'select',
          options: ['white', 'red', 'green', 'blue', 'yellow', 'purple'],
          default: 'white',
        },
      ],
    };
  }

  // Method to create a Three.js particle system
  createMesh(): THREE.Points {
    const particleCount = this.getParameter('particleCount') as number || 1000;
    const size = this.getParameter('size') as number || 0.02;
    const color = this.getParameter('color') as string || 'white';

    // Create particle positions
    this.positions = new Float32Array(particleCount * 3);
    this.velocities = new Float32Array(particleCount * 3);

    // Initialize particles in a sphere
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Random position in sphere
      const radius = Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      this.positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      this.positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      this.positions[i3 + 2] = radius * Math.cos(phi);
      
      // Random velocity
      this.velocities[i3] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const material = new THREE.PointsMaterial({
      color: this.getColorValue(color),
      size: size,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    return this.particles;
  }

  // Method to update the particle system
  updateMesh(mesh: THREE.Points, deltaTime: number): void {
    if (!this.particles || !this.positions || !this.velocities) return;

    const speed = this.getParameter('speed') as number || 1.0;
    const pulse = this.getPulse(speed);
    const geometry = this.particles.geometry;
    const positions = geometry.attributes.position.array as Float32Array;

    // Update particle positions
    for (let i = 0; i < positions.length; i += 3) {
      // Update velocity based on BPM pulse
      this.velocities[i] += (Math.random() - 0.5) * 0.01 * pulse;
      this.velocities[i + 1] += (Math.random() - 0.5) * 0.01 * pulse;
      this.velocities[i + 2] += (Math.random() - 0.5) * 0.01 * pulse;

      // Update position
      positions[i] += this.velocities[i] * speed;
      positions[i + 1] += this.velocities[i + 1] * speed;
      positions[i + 2] += this.velocities[i + 2] * speed;

      // Wrap around boundaries
      if (Math.abs(positions[i]) > 3) {
        positions[i] = Math.sign(positions[i]) * 3;
        this.velocities[i] *= -0.5;
      }
      if (Math.abs(positions[i + 1]) > 3) {
        positions[i + 1] = Math.sign(positions[i + 1]) * 3;
        this.velocities[i + 1] *= -0.5;
      }
      if (Math.abs(positions[i + 2]) > 3) {
        positions[i + 2] = Math.sign(positions[i + 2]) * 3;
        this.velocities[i + 2] *= -0.5;
      }
    }

    geometry.attributes.position.needsUpdate = true;
  }

  private getColorValue(colorName: string): number {
    const colorMap: Record<string, number> = {
      white: 0xffffff,
      red: 0xff0000,
      green: 0x00ff00,
      blue: 0x0000ff,
      yellow: 0xffff00,
      purple: 0x800080,
    };
    return colorMap[colorName] || 0xffffff;
  }
} 