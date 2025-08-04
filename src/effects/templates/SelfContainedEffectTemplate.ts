import { BaseEffect, EffectMetadata, EffectParameter } from './BaseEffect';

/**
 * SELF-CONTAINED EFFECT TEMPLATE
 * 
 * To create your own effect:
 * 1. Copy this template
 * 2. Rename the class and file
 * 3. Implement the render() method
 * 4. Define your parameters in getMetadata()
 * 5. Export the effect using the exportEffect() function
 * 6. Drop the file into the effects folder
 */

class MyCustomEffect extends BaseEffect {
  // Private variables for your effect
  private time: number = 0;
  private animationSpeed: number = 1;

  getMetadata(): EffectMetadata {
    return {
      name: "My Custom Effect",
      description: "A custom effect created by you",
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
          default: 0.5
        },
        {
          name: "color",
          type: "select",
          default: "red",
          options: ["red", "green", "blue", "yellow", "purple"]
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
    const intensity = this.getParameter("intensity") as number || 0.5;
    const color = this.getParameter("color") as string || "red";
    const enabled = this.getParameter("enabled") as boolean || true;

    if (!enabled) return;

    // Update time
    this.time += deltaTime * speed;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Set color based on parameter
    const colors = {
      red: "#ff0000",
      green: "#00ff00", 
      blue: "#0000ff",
      yellow: "#ffff00",
      purple: "#800080"
    };

    this.ctx.fillStyle = colors[color as keyof typeof colors] || "#ff0000";
    this.ctx.globalAlpha = intensity;

    // Your custom rendering logic here
    // Example: Draw a pulsing circle
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = 50 + Math.sin(this.time) * 30;

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Reset alpha
    this.ctx.globalAlpha = 1.0;
  }

  cleanup(): void {
    // Clean up any resources (timers, event listeners, etc.)
    // This is called when the effect is removed
  }
}

// Export function that makes the effect self-contained
export function exportEffect() {
  return {
    id: "my-custom-effect",
    name: "My Custom Effect",
    description: "A custom effect created by you",
    category: "Custom",
    icon: "✨",
    author: "Your Name",
    version: "1.0.0",
    metadata: new MyCustomEffect(100, 100).getMetadata(),
    createEffect: (width: number, height: number) => new MyCustomEffect(width, height)
  };
}

// Alternative: Export the class directly for testing
export { MyCustomEffect }; 