# Canvas Redraw Optimization

## Problem
The canvas was being redrawn with every parameter change, causing performance issues and visual artifacts. This was happening because:

1. **Unnecessary uniform updates**: Parameters were being updated on every frame even when they hadn't changed
2. **Component re-renders**: Effect components were re-rendering when parameters changed
3. **Shader material recreation**: Shader materials were being recreated when parameters changed
4. **No parameter batching**: Each parameter change triggered an immediate store update

## Solutions Implemented

### 1. Optimized Uniform Updates (`useOptimizedUniforms` hook)

**File**: `src/hooks/useOptimizedUniforms.ts`

- Tracks previous parameter values to avoid unnecessary uniform updates
- Uses epsilon comparison for floating-point numbers to prevent micro-updates
- Only updates uniforms when values actually change
- Provides a reusable hook for all effects

**Usage**:
```typescript
const { updateUniforms } = useOptimizedUniforms();

useFrame(() => {
  if (materialRef.current) {
    // Always update time and BPM (these change every frame)
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    materialRef.current.uniforms.bpm.value = bpm;

    // Use optimized uniform updates for parameters
    updateUniforms(materialRef.current, {
      intensity,
      frequency,
      speed,
      waveType: waveTypeIndex
    });
  }
});
```

### 2. React.memo for Effect Components

**Files**: 
- `src/effects/visual-effects/VideoWarpEffect.tsx`
- `src/components/CanvasRenderer.tsx`

- Wrapped effect components with `React.memo` to prevent unnecessary re-renders
- Components only re-render when props actually change
- Maintains performance while preserving functionality

### 3. Shader Material Optimization

**File**: `src/effects/visual-effects/VideoWarpEffect.tsx`

- Removed parameter dependencies from `useMemo` for shader material creation
- Shader materials are now created once and reused
- Parameters are updated via uniforms instead of recreating materials

**Before**:
```typescript
const shaderMaterial = useMemo(() => {
  // Material creation with parameter dependencies
}, [intensity, frequency, speed, waveType]); // Causes recreation on every change
```

**After**:
```typescript
const shaderMaterial = useMemo(() => {
  // Material creation without parameter dependencies
}, [bufferTexture, videoTexture, isGlobal, renderTarget]); // Only recreates when sources change
```

### 4. Parameter Batching (`ParameterOptimizer`)

**File**: `src/utils/ParameterOptimizer.ts`

- Batches parameter updates to reduce store update frequency
- Uses requestAnimationFrame timing (~60fps) for optimal performance
- Prevents rapid-fire updates during slider dragging
- Provides a centralized optimization system

**Usage**:
```typescript
const { queueUpdate } = useParameterOptimizer(layerId, updateCallback);

// Instead of immediate updates
const handleParamChange = (paramName: string, value: number) => {
  queueUpdate(paramName, value); // Batched update
};
```

## Performance Benefits

1. **Reduced GPU calls**: Uniforms are only updated when necessary
2. **Fewer re-renders**: Components only re-render when props change
3. **Stable shader materials**: No unnecessary material recreation
4. **Batched updates**: Reduced store update frequency
5. **Smoother parameter changes**: No visual artifacts during slider adjustments

## Implementation Status

- ✅ VideoWarpEffect optimized
- ✅ CanvasRenderer optimized
- ✅ Utility hooks created
- ✅ Parameter batching system created
- 🔄 Ready for application to other effects

## Next Steps

1. Apply `useOptimizedUniforms` to all other effects
2. Implement `useParameterOptimizer` in LayerControls and LayerOptions
3. Add React.memo to other effect components
4. Monitor performance improvements
5. Consider implementing similar optimizations for video textures

## Testing

To verify the optimizations are working:

1. Open the browser dev tools
2. Monitor the Performance tab during parameter changes
3. Check that uniform updates are minimal
4. Verify smooth parameter adjustment without visual artifacts
5. Confirm no unnecessary component re-renders
