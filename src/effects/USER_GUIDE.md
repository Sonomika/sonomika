# How to Create Your Own Effects

## Quick Start (5 minutes)

1. **Copy a template** from `src/effects/templates/`
2. **Rename everything** (class name, file name, effect name)
3. **Add your visual code** in the `render()` method
4. **Save the file** in `src/effects/`
5. **Restart the app** - your effect will appear!

## Step-by-Step Example

### 1. Copy the Template

Copy `src/effects/templates/SelfContainedEffectTemplate.ts` to `src/effects/MyFirstEffect.ts`

### 2. Rename Everything

```typescript
// Change the class name
class MyFirstEffect extends BaseEffect {  // was MyCustomEffect

// Change the metadata
getMetadata(): EffectMetadata {
  return {
    name: "My First Effect",  // was "My Custom Effect"
    description: "My very first custom effect",  // was "A custom effect created by you"
    // ... rest stays the same
  };
}
```

### 3. Add Your Visual Code

```typescript
render(deltaTime: number): void {
  if (!this.ctx) return;

  const speed = this.getParameter("speed") as number || 1.0;
  this.time += deltaTime * speed;

  // Clear the canvas
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

  // YOUR VISUAL CODE GOES HERE
  // Example: Draw a bouncing ball
  const ballX = this.canvas.width / 2 + Math.sin(this.time) * 100;
  const ballY = this.canvas.height / 2 + Math.cos(this.time * 0.5) * 50;
  
  this.ctx.fillStyle = "#ff0000";
  this.ctx.beginPath();
  this.ctx.arc(ballX, ballY, 20, 0, Math.PI * 2);
  this.ctx.fill();
}
```

### 4. Update the Export

```typescript
export function exportEffect() {
  return {
    id: "my-first-effect",  // was "my-custom-effect"
    name: "My First Effect",  // was "My Custom Effect"
    description: "My very first custom effect",
    category: "Custom",
    icon: "🎾",  // was "✨"
    author: "Your Name",
    version: "1.0.0",
    metadata: new MyFirstEffect(100, 100).getMetadata(),
    createEffect: (width: number, height: number) => new MyFirstEffect(width, height)
  };
}
```

### 5. Save and Restart

Save the file and restart the app. Your effect will appear in the effects browser!

## Canvas 2D API Reference

Your effect has access to the full Canvas 2D API:

```typescript
// Drawing shapes
this.ctx.fillRect(x, y, width, height);
this.ctx.strokeRect(x, y, width, height);
this.ctx.arc(x, y, radius, startAngle, endAngle);

// Colors and styles
this.ctx.fillStyle = "#ff0000";
this.ctx.strokeStyle = "#00ff00";
this.ctx.lineWidth = 5;
this.ctx.globalAlpha = 0.5;

// Gradients
const gradient = this.ctx.createLinearGradient(0, 0, 100, 100);
gradient.addColorStop(0, "red");
gradient.addColorStop(1, "blue");
this.ctx.fillStyle = gradient;

// Text
this.ctx.font = "24px Arial";
this.ctx.fillText("Hello World", x, y);
```

## Parameters

Add parameters to make your effect controllable:

```typescript
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
    options: ["red", "green", "blue"]
  },
  {
    name: "enabled",
    type: "boolean",
    default: true
  }
]
```

## Tips

1. **Start simple** - Get a basic effect working first
2. **Use parameters** - Make your effects controllable
3. **Test performance** - Don't create too many objects per frame
4. **Add descriptions** - Help others understand your effect
5. **Use meaningful names** - Make your effects easy to find

## Examples

Check out `src/effects/example/RainbowWaveEffect.ts` for a complete working example!

## Need Help?

- Look at existing effects in the `effects/` folder
- Check the `README.md` for detailed documentation
- Use the templates as starting points 