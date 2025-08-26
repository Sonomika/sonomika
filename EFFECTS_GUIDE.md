## Effects and Sources: Global Rules and Authoring Guide

This project renders all effects using React Fiber over Three.js. Effects and sources are discovered dynamically from the `src/effects/` tree and must never be hard‑referenced outside that folder. Follow these rules and patterns to ensure consistency, performance, and compatibility with both layer and global contexts.

### Core Non‑Negotiables
- Always render with React Fiber. No ad‑hoc WebGL contexts outside the Fiber renderer.
- Place all effect and source files under `src/effects/` and export a default React component.
- Never hardcode imports/paths to specific effects outside `src/effects/`. Use dynamic discovery only.
- Effects must behave identically in layer and global contexts when `isGlobal` is supported.
- Keep files small and focused. Split helpers into small modules if they grow.
- Do not add icons unless essential for controls. No emoji anywhere.
- Never hardcode secrets.

### Directory Structure
- `src/effects/visual-effects/`: Components that transform an input texture (e.g., a video or previous pass).
- `src/effects/sources/`: Components that generate new visuals standalone.

### Component Contract
Effects and sources are React components using Fiber/Three. Example minimal props shape:

```ts
type CommonProps = {
  videoTexture?: THREE.Texture;    // for visual-effects, optional for sources
  isGlobal?: boolean;              // when true, effect must capture scene to a target and process
};
```

Recommended patterns:
- Expose tunable parameters via uniforms and keep them stable across renders.
- Use `useMemo` for shader/material creation; avoid re-creating on every render.
- Update uniforms in `useFrame` only when values change to prevent GPU thrash.
- Create safe fallback textures (e.g., 1x1 black) for sampler uniforms.
- Dispose GPU resources (`dispose`) in `useEffect` cleanup.
- Derive plane size/aspect from `useThree().size` to remain responsive.

### Global Effect Pattern
When `isGlobal` is true:
1. Create a `THREE.WebGLRenderTarget` sized to the renderer.
2. In `useFrame`, temporarily hide your mesh, render the scene into the target, then restore visibility.
3. Feed the render target’s texture into your shader as the input buffer.
4. Resize the target and update a `resolution` uniform when the canvas size changes.

This ensures effects can operate as post‑processing passes without external pipelines.

### Metadata Requirements
Attach metadata to the component and register once via `registerEffect` with multiple IDs if you need backward compatibility. Example:

```ts
(MyEffect as any).metadata = {
  name: 'My Effect',
  description: 'What it does',
  category: 'Video Effects',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'amount', type: 'number', value: 0.5, min: 0, max: 1, step: 0.01 },
  ],
};

registerEffect('my-effect', MyEffect);
```

The discovery system reads this at runtime; do not add hardcoded lists elsewhere.

### Shader Conventions
- Keep vertex shaders minimal; pass `uv` as `vUv`.
- Fragment shaders should use explicit uniforms for input textures, resolution, color, and parameters.
- Prefer linear math and clamp operations to keep results stable.
- Follow consistent uniform names: `inputBuffer`, `resolution`, `uOpacity`, `uColor`, `uInvert`, etc.

### Performance Guidance
- Avoid rebuilding `ShaderMaterial` every frame; update only changed uniforms.
- Use nearest/linear filters appropriately; avoid mipmaps on dynamic render targets unless needed.
- Prefer small helper canvases/textures built once with `useMemo`.
- Watch for GC pressure; dispose on unmount and when replacing large textures.
- Keep per‑frame work minimal inside `useFrame`.

### Sources vs Effects
- Sources must be self‑sufficient and not depend on an external `videoTexture`.
- Visual effects must gracefully handle missing `videoTexture` by using a safe fallback.

### Testing Checklist
- Works as a layer effect with a `videoTexture`.
- Works as a global effect with `isGlobal` using the render‑to‑target pattern.
- Parameters update smoothly without re‑creating materials or restarting media.
- Window resize updates `resolution` and target size.
- No console errors; no undisposed WebGL resources.

---

## AI Authoring Service: Contract for Generating Effects and Sources

To enable programmatic authoring by AI, generated files must adhere to this minimal contract:

1. File location: place under `src/effects/visual-effects/` or `src/effects/sources/`.
2. Default export: a React component compliant with the Component Contract and Global Effect Pattern when applicable.
3. Metadata block on the default export with `name`, `description`, `category`, `version`, `author`, `parameters`.
4. Single registration call: `registerEffect('kebab-id', Component)`; optional additional IDs for compatibility.
5. No hardcoded references outside `src/effects/`; no imports from app modules except allowed utilities in `src/utils/` that are generic (e.g., `effectRegistry`).
6. Respect UI and security rules (no emojis, no secrets).

### Minimal Template (AI May Use)
```ts
// src/effects/visual-effects/MyNewEffect.tsx
import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface Props {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
}

const MyNewEffect: React.FC<Props> = ({ videoTexture, isGlobal = false }) => {
  const { gl, scene, camera, size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const fallback = useMemo(() => new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat), []);

  const target = useMemo(() => (isGlobal ? new THREE.WebGLRenderTarget(Math.max(1,size.width), Math.max(1,size.height)) : null), [isGlobal, size.width, size.height]);
  useEffect(() => () => target?.dispose(), [target]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      inputBuffer: { value: fallback },
      resolution: { value: new THREE.Vector2(Math.max(1,size.width), Math.max(1,size.height)) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform sampler2D inputBuffer; uniform vec2 resolution; void main(){ vec4 c=texture2D(inputBuffer, vUv); gl_FragColor=c; }`,
    transparent: true, depthTest: false, depthWrite: false,
  }), [/* only mode switches */]);

  useFrame(() => {
    if (isGlobal && target && materialRef.current) {
      const prev = gl.getRenderTarget();
      const vis = meshRef.current?.visible;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(target); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && vis!==undefined) meshRef.current.visible = vis; }
      materialRef.current.uniforms.inputBuffer.value = target.texture;
    } else if (!isGlobal && videoTexture && materialRef.current) {
      materialRef.current.uniforms.inputBuffer.value = videoTexture;
    }
  });

  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.resolution.value.set(Math.max(1,size.width), Math.max(1,size.height)); if (isGlobal && target) target.setSize(Math.max(1,size.width), Math.max(1,size.height)); }, [size, isGlobal, target]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
};

(MyNewEffect as any).metadata = {
  name: 'My New Effect',
  description: 'Describe the effect',
  category: 'Video Effects',
  icon: '', author: 'VJ System', version: '1.0.0',
  replacesVideo: true, canBeGlobal: true,
  parameters: [],
};

registerEffect('my-new-effect', MyNewEffect);
export default MyNewEffect;
```

The AI service can fill in shader logic and parameters while preserving the structure above.
