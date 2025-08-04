# Custom Effects System

This system allows you to create and add your own custom effects to the VJ application. Effects can be created using either Canvas 2D or React Three Fiber (R3F).

## Quick Start

1. **Copy a template** from the `templates/` folder
2. **Modify the effect** to create your visual
3. **Export the effect** using the provided export function
4. **Drop the file** into the `effects/` folder
5. **Restart the app** - your effect will appear automatically!

## Effect Types

### Canvas 2D Effects
Use `SelfContainedEffectTemplate.ts` for traditional canvas-based effects.

**Features:**
- Full canvas 2D API access
- Parameter system with UI controls
- BPM synchronization
- Performance optimized

### React Three Fiber Effects
Use `R3FSelfContainedEffectTemplate.tsx` for 3D effects using Three.js.

**Features:**
- Full Three.js capabilities
- React-based component system
- Real-time parameter updates
- 3D rendering pipeline

## Creating a Canvas 2D Effect

1. Copy `templates/SelfContainedEffectTemplate.ts`
2. Rename the class (e.g., `MyRainbowEffect`)
3. Implement the `render()` method with your visual logic
4. Define parameters in `getMetadata()`
5. Update the `exportEffect()` function

```typescript
// Example: Rainbow wave effect
class RainbowWaveEffect extends BaseEffect {
  private time: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: "Rainbow Wave",
      description: "Colorful wave animation",
      parameters: [
        {
          name: "speed",
          type: "number",
          min: 0.1,
          max: 5.0,
          step: 0.1,
          default: 1.0
        }
      ]
    };
  }

  render(deltaTime: number): void {
    if (!this.ctx) return;
    
    const speed = this.getParameter("speed") as number || 1.0;
    this.time += deltaTime * speed;

    // Your visual logic here
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (let i = 0; i < this.canvas.width; i += 10) {
      const hue = (i + this.time * 100) % 360;
      this.ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
      this.ctx.fillRect(i, 0, 8, this.canvas.height);
    }
  }
}

export function exportEffect() {
  return {
    id: "rainbow-wave",
    name: "Rainbow Wave",
    description: "Colorful wave animation",
    category: "Color",
    icon: "🌈",
    author: "Your Name",
    version: "1.0.0",
    metadata: new RainbowWaveEffect(100, 100).getMetadata(),
    createEffect: (width: number, height: number) => new RainbowWaveEffect(width, height)
  };
}
```

## Creating an R3F Effect

1. Copy `templates/R3FSelfContainedEffectTemplate.tsx`
2. Rename the component (e.g., `MyParticleEffect`)
3. Implement the visual logic in `useFrame()`
4. Define parameters in the component props
5. Update the `exportR3FEffect()` function

```typescript
// Example: Particle system
const ParticleEffect: React.FC<ParticleEffectProps> = ({
  count = 100,
  speed = 1.0,
  color = "#ff0000"
}) => {
  const particles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: new THREE.Vector3(
        Math.random() * 10 - 5,
        Math.random() * 10 - 5,
        Math.random() * 10 - 5
      ),
      velocity: new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      )
    }));
  }, [count]);

  useFrame((state, delta) => {
    particles.forEach(particle => {
      particle.position.add(particle.velocity.clone().multiplyScalar(delta * speed));
      
      // Wrap around boundaries
      if (particle.position.x > 5) particle.position.x = -5;
      if (particle.position.x < -5) particle.position.x = 5;
      // ... repeat for y and z
    });
  });

  return (
    <group>
      {particles.map((particle, i) => (
        <mesh key={i} position={particle.position}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
};
```

## Parameter Types

### Number
```typescript
{
  name: "intensity",
  type: "number",
  min: 0.0,
  max: 1.0,
  step: 0.01,
  default: 0.5
}
```

### Boolean
```typescript
{
  name: "enabled",
  type: "boolean",
  default: true
}
```

### Select (Dropdown)
```typescript
{
  name: "mode",
  type: "select",
  default: "normal",
  options: ["normal", "inverted", "random"]
}
```

### Color
```typescript
{
  name: "color",
  type: "color",
  default: "#ff0000"
}
```

## Best Practices

1. **Performance**: Use `useMemo` for expensive calculations
2. **Cleanup**: Implement `cleanup()` for timers and listeners
3. **Parameters**: Provide sensible defaults and ranges
4. **Documentation**: Add clear descriptions for your effects
5. **Testing**: Test your effects at different resolutions

## File Structure

```
src/effects/
├── templates/
│   ├── SelfContainedEffectTemplate.ts
│   └── R3FSelfContainedEffectTemplate.tsx
├── README.md
└── your-custom-effect.ts
```

## Troubleshooting

- **Effect not appearing**: Make sure you exported the effect correctly
- **Performance issues**: Check for memory leaks in `cleanup()`
- **Parameters not working**: Verify parameter names match in `getMetadata()`
- **R3F errors**: Ensure all Three.js objects are properly disposed

## Examples

Check out the existing effects in the `effects/` folder for real-world examples:
- `CirclePulse.ts` - Simple canvas animation
- `ParticleEffect.tsx` - R3F particle system
- `KaleidoscopeEffect.tsx` - Complex R3F effect

## Support

For questions or issues with custom effects, check the existing effect implementations or create an issue in the repository. 