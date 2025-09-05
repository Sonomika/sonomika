import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface BouncingParticleCellsSourceProps {
  numParticles?: number; // number of cells
  cellSize?: number;     // base cell size in world units (height=2 space)
  speed?: number;        // velocity multiplier
  color?: string;        // particle color
  trail?: number;        // 0..1 additive fade per frame (higher = longer persistence)
  randomSeed?: number;   // deterministic init when provided
  shape?: 'square' | 'circle' | 'glyph';
  glyphs?: string;       // characters to render when shape = 'glyph'
  fontFamily?: string;   // CSS font family for glyphs
  fontSize?: number;     // atlas tile font size in px
  glyphPadding?: number; // padding inside each atlas tile (px)
  glyphOpacity?: number; // 0..1 glyph alpha
}

const BouncingParticleCellsSource: React.FC<BouncingParticleCellsSourceProps> = ({
  numParticles = 600,
  cellSize = 0.02,
  speed = 1.0,
  color = '#66ccff',
  trail = 0.0,
  randomSeed = 0,
  shape = 'square',
  glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  fontFamily = 'Inter, Helvetica, sans-serif',
  fontSize = 64,
  glyphPadding = 8,
  glyphOpacity = 1.0
}) => {
  const { size } = useThree();
  // World space convention in this app: plane height ~= 2 units, width depends on aspect
  const compositionAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfWidth = (compositionAspect * 2) / 2; // planeW = aspect*2
  const halfHeight = 2 / 2;                      // planeH = 2

  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const velocitiesRef = useRef<THREE.Vector2[]>([]);
  const positionsRef = useRef<THREE.Vector2[]>([]);
  const seedRef = useRef<number>(randomSeed);
  const glyphIndexRef = useRef<Uint16Array>(new Uint16Array(0));

  // Glyph atlas
  const atlasTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const atlasInfoRef = useRef<{ cols: number; rows: number; tileSize: number } | null>(null);

  // geometry/material
  const geometry = useMemo(() => {
    if (shape === 'circle') {
      return new THREE.CircleGeometry(Math.max(0.0001, cellSize / 2), 24);
    }
    // square and glyph use plane geometry
    return new THREE.PlaneGeometry(cellSize, cellSize);
  }, [cellSize, shape]);

  // Basic material for square/circle
  const basicMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true });
    m.depthTest = false;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [color]);

  // Glyph shader material (used only when shape === 'glyph')
  const glyphMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null as any },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: glyphOpacity }
      },
      vertexShader: `
        attribute vec2 instanceUvOffset;
        attribute vec2 instanceUvScale;
        attribute mat4 instanceMatrix;
        varying vec2 vUv;
        void main() {
          vUv = instanceUvOffset + uv * instanceUvScale;
          vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          float a = tex.a * uOpacity;
          gl_FragColor = vec4(uColor * tex.rgb, a);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    return mat;
  }, [color, glyphOpacity]);

  // Deterministic RNG when seed provided
  const rand = useMemo(() => {
    if (!seedRef.current) return Math.random;
    let s = seedRef.current >>> 0;
    return () => {
      // xorshift32
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 0xFFFF) / 0xFFFF;
    };
  }, [randomSeed]);

  // Initialize particles on first use or when count changes
  React.useEffect(() => {
    const positions: THREE.Vector2[] = new Array(numParticles);
    const velocities: THREE.Vector2[] = new Array(numParticles);
    const glyphIdx = new Uint16Array(numParticles);
    for (let i = 0; i < numParticles; i++) {
      const x = (rand() * 2 - 1) * (halfWidth - cellSize * 0.5);
      const y = (rand() * 2 - 1) * (halfHeight - cellSize * 0.5);
      positions[i] = new THREE.Vector2(x, y);
      // random direction and speed
      const angle = rand() * Math.PI * 2;
      const base = 0.3 + rand() * 0.7; // 0.3..1.0 base speed
      const v = base * 0.5;            // world units per second, tuned to world size
      velocities[i] = new THREE.Vector2(Math.cos(angle) * v, Math.sin(angle) * v);
      glyphIdx[i] = 0;
    }
    positionsRef.current = positions;
    velocitiesRef.current = velocities;
    glyphIndexRef.current = glyphIdx;
  }, [numParticles, halfWidth, halfHeight, cellSize, rand]);

  // Re-clamp positions when composition size changes to keep them in-bounds
  React.useEffect(() => {
    const positions = positionsRef.current;
    for (let i = 0; i < positions.length; i++) {
      positions[i].x = THREE.MathUtils.clamp(positions[i].x, -halfWidth + cellSize * 0.5, halfWidth - cellSize * 0.5);
      positions[i].y = THREE.MathUtils.clamp(positions[i].y, -halfHeight + cellSize * 0.5, halfHeight - cellSize * 0.5);
    }
  }, [halfWidth, halfHeight, cellSize]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Build glyph atlas canvas texture when in glyph mode or glyph settings change
  React.useEffect(() => {
    if (shape !== 'glyph') return;
    const uniqueGlyphs = Array.from(new Set((glyphs || '').split('')));
    const count = Math.max(1, uniqueGlyphs.length);
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const tile = Math.max(8, fontSize + glyphPadding * 2);
    const canvas = document.createElement('canvas');
    canvas.width = cols * tile;
    canvas.height = rows * tile;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${fontSize}px ${fontFamily}`;

    for (let i = 0; i < count; i++) {
      const g = uniqueGlyphs[i];
      const cx = (i % cols) * tile + tile / 2;
      const cy = Math.floor(i / cols) * tile + tile / 2;
      ctx.fillText(g, cx, cy);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    atlasTextureRef.current = tex;
    atlasInfoRef.current = { cols, rows, tileSize: tile };

    // Assign a random glyph index to each particle
    const glyphIdx = glyphIndexRef.current.length === numParticles ? glyphIndexRef.current : new Uint16Array(numParticles);
    for (let i = 0; i < numParticles; i++) glyphIdx[i] = (rand() * count) | 0;
    glyphIndexRef.current = glyphIdx;

    // Prepare per-instance UV transform attributes
    const geo = geometry as unknown as THREE.BufferGeometry & { attributes: any };
    const uvOffset = new Float32Array(numParticles * 2);
    const uvScale = new Float32Array(numParticles * 2);
    for (let i = 0; i < numParticles; i++) {
      const idx = glyphIdx[i] % count;
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      const offX = gx / cols;
      const offY = gy / rows;
      const sX = 1 / cols;
      const sY = 1 / rows;
      uvOffset[i * 2 + 0] = offX;
      uvOffset[i * 2 + 1] = offY;
      uvScale[i * 2 + 0] = sX;
      uvScale[i * 2 + 1] = sY;
    }
    geo.setAttribute('instanceUvOffset', new THREE.InstancedBufferAttribute(uvOffset, 2));
    geo.setAttribute('instanceUvScale', new THREE.InstancedBufferAttribute(uvScale, 2));

    // Bind texture to material
    (glyphMaterial.uniforms.uMap as any).value = tex;
    (glyphMaterial.uniforms.uColor as any).value.set(color);
    (glyphMaterial.uniforms.uOpacity as any).value = glyphOpacity;
  }, [shape, glyphs, fontFamily, fontSize, glyphPadding, numParticles, geometry, rand, color, glyphOpacity, glyphMaterial]);

  useFrame((_, delta) => {
    if (!instancedRef.current) return;
    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;

    // Optional trail: apply a slight alpha to material each frame by toggling opacity
    if (trail > 0 && basicMaterial.opacity !== 1) {
      // keep particle fully opaque; trail is usually implemented by render target accumulation
      // Here we just keep material opaque for clarity; trail can be handled by global post chain.
      basicMaterial.opacity = 1;
    }

    const left = -halfWidth + cellSize * 0.5;
    const right = halfWidth - cellSize * 0.5;
    const bottom = -halfHeight + cellSize * 0.5;
    const top = halfHeight - cellSize * 0.5;

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const v = velocities[i];

      p.x += v.x * delta * speed;
      p.y += v.y * delta * speed;

      // bounce off walls
      if (p.x <= left) { p.x = left; v.x = Math.abs(v.x); }
      if (p.x >= right) { p.x = right; v.x = -Math.abs(v.x); }
      if (p.y <= bottom) { p.y = bottom; v.y = Math.abs(v.y); }
      if (p.y >= top) { p.y = top; v.y = -Math.abs(v.y); }

      dummy.position.set(p.x, p.y, 0);
      dummy.rotation.z = 0;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instancedRef.current.setMatrixAt(i, dummy.matrix);
    }
    instancedRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={instancedRef}
      args={[geometry, shape === 'glyph' ? glyphMaterial : basicMaterial, numParticles]}
      renderOrder={9998}
    />
  );
};

(BouncingParticleCellsSource as any).metadata = {
  name: 'Bouncing Particle Cells',
  description: 'Moving square particles that bounce off canvas edges',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'numParticles', type: 'number', value: 600, min: 10, max: 5000, step: 10 },
    { name: 'cellSize', type: 'number', value: 0.02, min: 0.005, max: 0.08, step: 0.001 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'color', type: 'color', value: '#66ccff' },
    { name: 'trail', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.05 },
    { name: 'randomSeed', type: 'number', value: 0, min: 0, max: 999999, step: 1 },
    { name: 'shape', type: 'select', value: 'square', options: ['square', 'circle', 'glyph'] },
    { name: 'glyphs', type: 'string', value: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
    { name: 'fontFamily', type: 'string', value: 'Inter, Helvetica, sans-serif' },
    { name: 'fontSize', type: 'number', value: 64, min: 16, max: 256, step: 2 },
    { name: 'glyphPadding', type: 'number', value: 8, min: 0, max: 32, step: 1 },
    { name: 'glyphOpacity', type: 'number', value: 1.0, min: 0.0, max: 1.0, step: 0.05 }
  ]
};

registerEffect('bouncing-particle-cells', BouncingParticleCellsSource);
registerEffect('BouncingParticleCellsSource', BouncingParticleCellsSource);

export default BouncingParticleCellsSource;


