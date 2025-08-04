import { BaseEffect, EffectMetadata } from '../BaseEffect';

/**
 * Example Custom Effect: Rainbow Wave
 * 
 * This demonstrates how to create a self-contained effect
 * that users can copy and modify for their own effects.
 */

class RainbowWaveEffect extends BaseEffect {
  private time: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: "Rainbow Wave",
      description: "Colorful wave animation that cycles through the rainbow",
      parameters: [
        {
          name: "speed",
          type: "number",
          min: 0.1,
          max: 5.0,
          step: 0.1,
          default: 1.0
        },
        {
          name: "intensity",
          type: "number",
          min: 0.0,
          max: 1.0,
          step: 0.01,
          default: 0.8
        },
        {
          name: "waveHeight",
          type: "number",
          min: 10,
          max: 200,
          step: 5,
          default: 50
        },
        {
          name: "enabled",
          type: "boolean",
          default: true
        }
      ]
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;

    const speed = this.getParameter("speed") as number || 1.0;
    const intensity = this.getParameter("intensity") as number || 0.8;
    const waveHeight = this.getParameter("waveHeight") as number || 50;
    const enabled = this.getParameter("enabled") as boolean || true;

    if (!enabled) return;

    // Update time
    this.time += deltaTime * speed;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Set global alpha for intensity
    this.ctx.globalAlpha = intensity;

    // Draw rainbow wave
    for (let x = 0; x < this.canvas.width; x += 2) {
      // Calculate wave position
      const waveX = x + this.time * 100;
      const waveY = this.canvas.height / 2 + 
        Math.sin(waveX * 0.01) * waveHeight;

      // Calculate rainbow color
      const hue = (x + this.time * 100) % 360;
      this.ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;

      // Draw wave segment
      this.ctx.fillRect(x, waveY - 2, 2, 4);
    }

    // Reset global alpha
    this.ctx.globalAlpha = 1.0;
  }

  cleanup(): void {
    // No cleanup needed for this simple effect
  }
}

// Export function that makes the effect self-contained
export function exportEffect() {
  return {
    id: "rainbow-wave",
    name: "Rainbow Wave",
    description: "Colorful wave animation that cycles through the rainbow",
    category: "Color",
    icon: "🌈",
    author: "VJ System",
    version: "1.0.0",
    metadata: new RainbowWaveEffect(100, 100).getMetadata(),
    createEffect: (width: number, height: number) => new RainbowWaveEffect(width, height)
  };
}

// Export the class for direct use
export { RainbowWaveEffect }; 