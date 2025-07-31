import { R3FBaseEffect, R3FEffectMetadata } from './R3FBaseEffect';
import * as THREE from 'three';

export class R3FCirclePulse extends R3FBaseEffect {
  getMetadata(): R3FEffectMetadata {
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

  // Method to create a Three.js mesh for this effect
  createMesh(): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(1, 32);
    const material = new THREE.MeshBasicMaterial({
      color: this.getColorValue(this.getParameter('color') as string || 'blue'),
      transparent: true,
      opacity: 0.8,
    });
    
    return new THREE.Mesh(geometry, material);
  }

  // Method to update the mesh based on current parameters and time
  updateMesh(mesh: THREE.Mesh, deltaTime: number): void {
    const size = this.getParameter('size') as number || 0.5;
    const speed = this.getParameter('speed') as number || 1;
    
    // Calculate pulse based on BPM
    const pulse = this.getPulse(speed);
    const currentScale = 0.5 + pulse * 0.5;
    
    // Update mesh scale
    mesh.scale.setScalar(currentScale * size);
    
    // Update material color if needed
    const material = mesh.material as THREE.MeshBasicMaterial;
    if (material) {
      material.color.setHex(this.getColorValue(this.getParameter('color') as string || 'blue'));
    }
  }

  private getColorValue(colorName: string): number {
    const colorMap: Record<string, number> = {
      red: 0xff0000,
      green: 0x00ff00,
      blue: 0x0000ff,
      yellow: 0xffff00,
      purple: 0x800080,
    };
    return colorMap[colorName] || 0x0000ff;
  }
} 