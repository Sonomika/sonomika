# Effects Development Guide

This guide explains how to create new effects for the VJ system. All effects must be placed in the `src/effects/` directory and follow specific conventions.

## 📁 File Structure

```
src/effects/
├── README.md                    # This documentation
├── RedDotEffect.tsx            # Example: BPM-synced red dot
├── bpm-particles-effect.tsx    # Example: BPM particle system
├── VideoPulseEffect.tsx        # Example: Video pulse effect
├── GenericPulseEffect.tsx      # Example: Generic pulse effect
└── TestEffect.tsx              # Example: Basic test effect
```

## 🎯 Effect Requirements

### 1. **React Fiber Rendering**
All effects MUST use React Fiber (`@react-three/fiber`) for rendering:

```tsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const MyEffect: React.FC<MyEffectProps> = ({ /* props */ }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    // Animation logic here
  });

  return (
    <mesh ref={meshRef}>
      <geometry />
      <material />
    </mesh>
  );
};
```

### 2. **Dynamic Discovery**
Effects are automatically discovered - NO hardcoded imports allowed outside the effects folder.

### 3. **Metadata for Discovery**
Each effect must include metadata for the effects browser:

```tsx
// Add metadata for dynamic discovery
(MyEffect as any).metadata = {
  name: 'My Effect Name',
  description: 'Description of what this effect does',
  category: 'Category', // e.g., 'Test', 'Particles', 'Video'
  icon: '🎨', // Emoji icon
  author: 'Your Name',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#ff0000',
      description: 'Effect color'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Effect intensity'
    }
  ]
};
```

## 📝 Creating a New Effect

### Step 1: Create the File
Create a new `.tsx` file in `src/effects/` with a descriptive name:

```tsx
// src/effects/MyNewEffect.tsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface MyNewEffectProps {
  color?: string;
  intensity?: number;
  size?: number;
}

const MyNewEffect: React.FC<MyNewEffectProps> = ({
  color = '#ff0000',
  intensity = 1.0,
  size = 0.1
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      // Your animation logic here
      meshRef.current.rotation.x += delta * intensity;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(MyNewEffect as any).metadata = {
  name: 'My New Effect',
  description: 'A custom effect that does something cool',
  category: 'Custom',
  icon: '✨',
  author: 'Your Name',
  version: '1.0.0',
  parameters: [
    {
      name: 'color',
      type: 'color',
      value: '#ff0000',
      description: 'Effect color'
    },
    {
      name: 'intensity',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Animation intensity'
    },
    {
      name: 'size',
      type: 'number',
      value: 0.1,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      description: 'Effect size'
    }
  ]
};

export default MyNewEffect;
```

### Step 2: BPM Integration (Optional)
For BPM-synced effects, use the store:

```tsx
import { useStore } from '../store/store';

const MyBPMEffect: React.FC<MyEffectProps> = ({ intensity = 1.0 }) => {
  const { bpm } = useStore();
  
  useFrame((state) => {
    // Calculate BPM timing
    const beatsPerSecond = bpm / 60;
    const beatTime = state.clock.elapsedTime * beatsPerSecond;
    
    // Create BPM-synced animation
    const pulse = Math.sin(beatTime * Math.PI * 2) * intensity;
    // Use pulse for animation...
  });
};
```

### Step 3: Video Texture Support (Optional)
For effects that work with video textures:

```tsx
interface MyVideoEffectProps {
  videoTexture?: THREE.VideoTexture;
  // other props...
}

const MyVideoEffect: React.FC<MyVideoEffectProps> = ({ videoTexture }) => {
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={videoTexture} />
    </mesh>
  );
};
```

## 🚫 Prohibited Practices

### ❌ NEVER Hardcode Effects
```tsx
// WRONG - Don't do this anywhere outside effects folder
import RedDotEffect from '../effects/RedDotEffect';
import { BPMParticlesEffect } from '../effects/bpm-particles-effect';
```

### ❌ NO Fallback Imports
```tsx
// WRONG - Don't add fallback imports in utils/EffectLoader.ts
const fallbackEffects = {
  'red-dot': () => import('./RedDotEffect'),
  'bpm-particles': () => import('./BPMParticlesEffect')
};
```

### ❌ NO Direct References
```tsx
// WRONG - Don't reference specific effects outside effects folder
const effectList = ['RedDotEffect', 'BPMParticlesEffect'];
```

## ✅ Correct Practices

### ✅ Dynamic Discovery Only
```tsx
// RIGHT - Use dynamic discovery patterns
const modules = import.meta.glob('../effects/*.tsx');
const effectModules = import.meta.glob('../effects/**/*.tsx');
```

### ✅ Metadata-Driven Discovery
```tsx
// RIGHT - Let the system discover effects automatically
// No manual effect lists needed
```

## 🎨 Effect Categories

### Test Effects
- Simple effects for testing the system
- Examples: `RedDotEffect`, `TestEffect`

### Particle Effects
- Complex particle systems
- Examples: `bpm-particles-effect`

### Video Effects
- Effects that work with video textures
- Examples: `VideoPulseEffect`

### Pulse Effects
- BPM-synced pulse animations
- Examples: `GenericPulseEffect`

## 🔧 Parameter Types

### Color Parameters
```tsx
{
  name: 'color',
  type: 'color',
  value: '#ff0000',
  description: 'Effect color'
}
```

### Number Parameters
```tsx
{
  name: 'intensity',
  type: 'number',
  value: 1.0,
  min: 0.1,
  max: 5.0,
  step: 0.1,
  description: 'Effect intensity'
}
```

### Boolean Parameters
```tsx
{
  name: 'enabled',
  type: 'boolean',
  value: true,
  description: 'Enable effect'
}
```

## 🚀 Testing Your Effect

1. **Create the effect file** in `src/effects/`
2. **Add proper metadata** for discovery
3. **Use React Fiber rendering** with `useFrame`
4. **Restart the app** (`npm run dev`)
5. **Check the effects browser** - your effect should appear automatically
6. **Test the effect** in the composition

## 📋 Checklist

- [ ] File placed in `src/effects/` directory
- [ ] Uses React Fiber rendering (`useFrame`)
- [ ] Includes metadata for discovery
- [ ] No hardcoded imports outside effects folder
- [ ] Proper TypeScript interfaces
- [ ] BPM integration (if needed)
- [ ] Video texture support (if needed)
- [ ] Effect appears in effects browser
- [ ] Effect renders correctly in composition

## 🆘 Troubleshooting

### Effect Not Appearing
- Check metadata is properly formatted
- Ensure file is in `src/effects/` directory
- Restart the development server

### Effect Not Rendering
- Verify React Fiber components are used
- Check `useFrame` is implemented
- Ensure proper Three.js geometry/material

### Performance Issues
- Use `useMemo` for expensive calculations
- Limit particle counts for particle effects
- Use efficient Three.js objects

## 📚 Examples

See existing effects in the `src/effects/` directory for complete examples:
- `RedDotEffect.tsx` - Simple BPM-synced dot
- `bpm-particles-effect.tsx` - Complex particle system
- `VideoPulseEffect.tsx` - Video texture effect
- `GenericPulseEffect.tsx` - Generic pulse animation
- `TestEffect.tsx` - Basic test effect

---

**Remember**: All effects must be discovered dynamically - never hardcode effect references outside the effects folder! 