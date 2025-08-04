import { BaseEffect, EffectMetadata } from './BaseEffect';

/**
 * Test Timeline Effect
 * 
 * A simple effect to test timeline integration
 */

class TestTimelineEffect extends BaseEffect {
  private time: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: "Test Timeline Effect",
      description: "A simple test effect for timeline integration",
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
          name: "color",
          type: "select",
          default: "red",
          options: ["red", "green", "blue", "yellow"]
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
    const color = this.getParameter("color") as string || "red";
    const enabled = this.getParameter("enabled") as boolean || true;

    if (!enabled) return;

    // Update time
    this.time += deltaTime * speed;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Set color
    const colors = {
      red: "#ff0000",
      green: "#00ff00",
      blue: "#0000ff",
      yellow: "#ffff00"
    };

    this.ctx.fillStyle = colors[color as keyof typeof colors] || "#ff0000";

    // Draw animated circles
    for (let i = 0; i < 5; i++) {
      const x = this.canvas.width / 2 + Math.sin(this.time + i) * 50;
      const y = this.canvas.height / 2 + Math.cos(this.time + i) * 30;
      const radius = 10 + Math.sin(this.time * 2 + i) * 5;

      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Draw timeline indicator
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "12px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(`Timeline Test: ${this.time.toFixed(1)}s`, this.canvas.width / 2, 20);
  }

  cleanup(): void {
    // No cleanup needed
  }
}

// Export function that makes the effect self-contained
export function exportEffect() {
  return {
    id: "test-timeline-effect",
    name: "Test Timeline Effect",
    description: "A simple test effect for timeline integration",
    category: "Test",
    icon: "🧪",
    author: "VJ System",
    version: "1.0.0",
    metadata: new TestTimelineEffect(100, 100).getMetadata(),
    createEffect: (width: number, height: number) => new TestTimelineEffect(width, height)
  };
}

// Export the class for direct use
export { TestTimelineEffect }; 