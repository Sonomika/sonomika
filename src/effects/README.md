# Effects Directory Structure

This directory contains all the visual effects and generative sources for the VJ application, organized in a professional VJ workflow.

## Folder Organization

### `visual-effects/` - Visual Effects
Effects that modify existing visual content (images, videos, other sources). These are applied on top of content to change its appearance.

**Examples:**
- `AdvancedGlitchEffect.tsx` - Advanced glitch and distortion effects
- `ASCIIVideoEffect.tsx` - Converts video to ASCII characters
- `ChromaticAberrationEffect.tsx` - Color separation and aberration
- `PixelateEffect.tsx` - Pixelation and mosaic effects
- `VideoWarpEffect.tsx` - Video warping and distortion
- `VideoSliceOffsetEffect.tsx` - Video slicing with offset
- `VideoSlideEffect.tsx` - Video sliding transitions
- `Video3DSliceEffect.tsx` - 3D video slicing effects
- `VideoDatamoshGlitch.tsx` - Datamoshing glitch effects
- `RotatingSquareGlitchEffect.tsx` - Rotating square glitch
- `ShaderFeedbackEffect.tsx` - Shader feedback loops
- `ShaderToyEffect.tsx` - ShaderToy integration
- `MonjoriShaderEffect.tsx` - Monjori shader effect
- `TestEffect.tsx` - Testing and development effect

### `sources/` - Generative Sources
Content that generates new visual material from scratch. These are the starting points for visual content.

**Examples:**
- `PulseHexagon.tsx` - Pulsing hexagonal patterns
- `GenericPulseEffect.tsx` - Generic pulsing effects
- `FluxEffect.tsx` - Flux and flow patterns
- `RotatingParticleEffect.tsx` - Rotating particle systems
- `PointCloudEffect.tsx` - 3D point cloud generation
- `PCDPointCloudEffect.tsx` - PCD point cloud effects
- `DataVisualizationEffect.tsx` - Data visualization patterns
- `MatrixNumbersEffect.tsx` - Matrix-style number effects
- `BlobDetectionEffect2.tsx` - Blob detection and tracking

## How It Works

1. **Sources** generate or provide visual content (particles, noise, patterns, etc.)
2. **Effects** modify that content (glitch, color, distortion, etc.)
3. The system automatically discovers effects from both folders
4. Effects are categorized as either "Visual Effects" or "Generative Sources" in the MediaBrowser

## Adding New Effects

### For Visual Effects (visual-effects folder):
- Place your effect file in `src/effects/visual-effects/`
- Ensure it exports a React component with proper metadata
- The effect should modify existing visual input

### For Generative Sources (sources folder):
- Place your source file in `src/effects/sources/`
- Ensure it exports a React component with proper metadata
- The source should generate new visual content from scratch

## Metadata Requirements

Each effect should include metadata:

```typescript
export const metadata = {
  name: "Effect Name",
  description: "Description of what the effect does",
  category: "Effects" | "Sources" | "Generative",
  author: "Your Name",
  version: "1.0.0",
  parameters: [
    // Effect parameters
  ]
};
```

## Automatic Discovery

The system automatically scans both folders and categorizes effects based on:
- Folder location (visual-effects vs sources)
- Effect metadata
- Effect name patterns
- Category information

No manual hardcoded imports are needed. Effects register themselves and are dynamically discovered. See the top‑level `EFFECTS_GUIDE.md` for global rules (React Fiber rendering, global effect pattern, metadata, performance) and an AI authoring template to generate new effects and sources.