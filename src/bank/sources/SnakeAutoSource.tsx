import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface SnakeAutoSourceProps {
  gridSize?: number;           // logical grid resolution (N x N)
  cellSize?: number;           // world units per cell
  gameSpeed?: number;          // steps per second
  snakeLength?: number;        // base target length
  growthRate?: number;         // growth per food
  wrapAround?: boolean;        // wrap vs walls
  colorHead?: string;          // head color
  colorBody?: string;          // body color
  colorFood?: string;          // food color
  turnBias?: number;           // 0..1 tendency to continue straight
}

type Cell = { x: number; y: number };

const DIRS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

const SnakeAutoSource: React.FC<SnakeAutoSourceProps> = ({
  gridSize = 40,
  cellSize = 0.05,
  gameSpeed = 8,
  snakeLength = 20,
  growthRate = 6,
  wrapAround = true,
  colorHead = '#ffffff',
  colorBody = '#33ff88',
  colorFood = '#ff3366',
  turnBias = 0.7
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeAccRef = useRef(0);
  const dirRef = useRef<Cell>({ x: 1, y: 0 });
  const snakeRef = useRef<Cell[]>([]);
  const foodRef = useRef<Cell>({ x: 0, y: 0 });
  const targetLenRef = useRef<number>(snakeLength);
  const [tick, setTick] = useState(0);

  // geometry/material cache
  const effectiveCellSize = Math.min(cellSize, 0.075);
  const geom = useMemo(() => new THREE.PlaneGeometry(effectiveCellSize, effectiveCellSize), [effectiveCellSize]);
  const matBody = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorBody), transparent: true });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.side = THREE.DoubleSide;
    return m;
  }, [colorBody]);
  const matHead = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHead), transparent: true });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.side = THREE.DoubleSide;
    return m;
  }, [colorHead]);
  const matFood = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorFood), transparent: true });
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.side = THREE.DoubleSide;
    return m;
  }, [colorFood]);

  const bounds = useMemo(() => ({ half: (gridSize * effectiveCellSize) / 2 }), [gridSize, effectiveCellSize]);

  // initialize on first frame
  const initializedRef = useRef(false);
  React.useEffect(() => {
    if (groupRef.current) {
      groupRef.current.renderOrder = 9999;
    }
  }, []);

  function randomEmptyCell(exclude: Set<string>): Cell {
    for (let i = 0; i < 1000; i++) {
      const x = Math.floor(Math.random() * gridSize);
      const y = Math.floor(Math.random() * gridSize);
      const k = `${x},${y}`;
      if (!exclude.has(k)) return { x, y };
    }
    return { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) };
  }

  function step() {
    // auto pilot: prefer straight, occasionally turn to avoid collisions/bounds
    const head = snakeRef.current[0];
    const candidates: Cell[] = [];

    // compute three options: straight, left, right (avoid 180 turns)
    const d = dirRef.current;
    const straight = d;
    const left = { x: -d.y, y: d.x };
    const right = { x: d.y, y: -d.x };
    const options = [straight, left, right];

    // bias weights
    const weights = [turnBias, (1 - turnBias) / 2, (1 - turnBias) / 2];

    // evaluate options, penalize collisions and leaving bounds (if !wrap)
    const occupied = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`));
    const scored: { dir: Cell; score: number }[] = [];
    for (let i = 0; i < options.length; i++) {
      const nd = options[i];
      let nx = head.x + nd.x;
      let ny = head.y + nd.y;
      if (wrapAround) {
        nx = (nx + gridSize) % gridSize;
        ny = (ny + gridSize) % gridSize;
      }
      let score = weights[i];
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) score -= 1.0;
      const k = `${nx},${ny}`;
      if (occupied.has(k)) score -= 0.8;
      // prefer moving toward food
      const fx = foodRef.current.x;
      const fy = foodRef.current.y;
      const dist = Math.abs(fx - nx) + Math.abs(fy - ny);
      const distHead = Math.abs(fx - head.x) + Math.abs(fy - head.y);
      if (dist < distHead) score += 0.2;
      scored.push({ dir: nd, score });
    }

    scored.sort((a, b) => b.score - a.score);
    dirRef.current = scored[0].dir;

    // move
    let nx = head.x + dirRef.current.x;
    let ny = head.y + dirRef.current.y;
    if (wrapAround) {
      nx = (nx + gridSize) % gridSize;
      ny = (ny + gridSize) % gridSize;
    }

    // collision with walls
    if (!wrapAround && (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize)) {
      // reset snake
      snakeRef.current = [{ x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) }];
      dirRef.current = { x: 1, y: 0 };
      targetLenRef.current = snakeLength;
      return;
    }

    // collision with self -> cut the tail from collision index
    const k = `${nx},${ny}`;
    const bodyIndex = snakeRef.current.findIndex((c) => c.x === nx && c.y === ny);
    if (bodyIndex >= 0) {
      snakeRef.current = snakeRef.current.slice(0, bodyIndex);
    }

    // push new head
    snakeRef.current.unshift({ x: nx, y: ny });

    // check food
    if (nx === foodRef.current.x && ny === foodRef.current.y) {
      targetLenRef.current += growthRate;
      const occupiedNow = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`));
      foodRef.current = randomEmptyCell(occupiedNow);
    }

    // maintain length
    while (snakeRef.current.length > Math.max(targetLenRef.current, snakeLength)) {
      snakeRef.current.pop();
    }

    // trigger visual update
    setTick((t) => (t + 1) % 1000000);
  }

  useFrame((_, delta) => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const cx = Math.floor(gridSize / 2);
      const cy = Math.floor(gridSize / 2);
      snakeRef.current = Array.from({ length: Math.max(3, Math.min(10, snakeLength)) }, (_, i) => ({ x: cx - i, y: cy }));
      dirRef.current = { x: 1, y: 0 };
      const occupied = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`));
      foodRef.current = randomEmptyCell(occupied);
      targetLenRef.current = snakeLength;
    }

    // advance based on speed
    timeAccRef.current += delta;
    const stepInterval = 1 / Math.max(0.5, gameSpeed);
    while (timeAccRef.current >= stepInterval) {
      step();
      timeAccRef.current -= stepInterval;
    }
  });

  // Render: head, body instances, food
  return (
    <group ref={groupRef} position={[0, 0, 0]}> 
      {snakeRef.current.slice(1).map((c, i) => (
        <mesh key={`b-${tick}-${i}-${c.x}-${c.y}`} geometry={geom} material={matBody} position={[c.x * effectiveCellSize - bounds.half + effectiveCellSize / 2, c.y * effectiveCellSize - bounds.half + effectiveCellSize / 2, 0]} />
      ))}
      {snakeRef.current.length > 0 && (
        <mesh key={`h-${tick}-${snakeRef.current[0].x}-${snakeRef.current[0].y}`} geometry={geom} material={matHead} position={[snakeRef.current[0].x * effectiveCellSize - bounds.half + effectiveCellSize / 2, snakeRef.current[0].y * effectiveCellSize - bounds.half + effectiveCellSize / 2, 0]} />
      )}
      <mesh key={`f-${tick}-${foodRef.current.x}-${foodRef.current.y}`} geometry={geom} material={matFood} position={[foodRef.current.x * effectiveCellSize - bounds.half + effectiveCellSize / 2, foodRef.current.y * effectiveCellSize - bounds.half + effectiveCellSize / 2, 0]} />
    </group>
  );
};

(SnakeAutoSource as any).metadata = {
  name: 'Snake Auto Source',
  description: 'Auto-playing snake on a grid, VJ-friendly source',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'gridSize', type: 'number', value: 40, min: 10, max: 120, step: 1 },
    { name: 'cellSize', type: 'number', value: 0.05, min: 0.01, max: 0.075, step: 0.001 },
    { name: 'gameSpeed', type: 'number', value: 8, min: 1, max: 30, step: 1 },
    { name: 'snakeLength', type: 'number', value: 20, min: 5, max: 200, step: 1 },
    { name: 'growthRate', type: 'number', value: 6, min: 1, max: 40, step: 1 },
    { name: 'wrapAround', type: 'boolean', value: true },
    { name: 'colorHead', type: 'color', value: '#ffffff' },
    { name: 'colorBody', type: 'color', value: '#33ff88' },
    { name: 'colorFood', type: 'color', value: '#ff3366' },
    { name: 'turnBias', type: 'number', value: 0.7, min: 0, max: 1, step: 0.05 }
  ]
};

registerEffect('snake-auto-source', SnakeAutoSource);
registerEffect('SnakeAutoSource', SnakeAutoSource);

export default SnakeAutoSource;


