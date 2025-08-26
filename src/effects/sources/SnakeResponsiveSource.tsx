import React, { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface SnakeResponsiveSourceProps {
  cellsAcross?: number;     // number of cells along the shorter canvas side
  gameSpeed?: number;       // steps per second
  snakeLength?: number;     // base target length
  growthRate?: number;      // growth per food
  wrapAround?: boolean;     // wrap vs walls
  colorHead?: string;       // head color
  colorBody?: string;       // body color
  colorFood?: string;       // food color
  turnBias?: number;        // 0..1 tendency to continue straight
}

type Cell = { x: number; y: number };

const SnakeResponsiveSource: React.FC<SnakeResponsiveSourceProps> = ({
  cellsAcross = 40,
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

  // Canvas/world sizing
  const { size } = useThree();
  const compositionAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const planeW = compositionAspect * 2; // world units width
  const planeH = 2;                     // world units height

  // Compute square cell size based on shorter side and requested density
  const shorter = Math.min(planeW, planeH);
  const cellWorldSize = Math.max(0.001, shorter / Math.max(2, Math.floor(cellsAcross)));
  const gridCols = Math.max(2, Math.floor(planeW / cellWorldSize));
  const gridRows = Math.max(2, Math.floor(planeH / cellWorldSize));
  const halfW = planeW / 2;
  const halfH = planeH / 2;

  // Cache geometry/materials
  const geom = useMemo(() => new THREE.PlaneGeometry(cellWorldSize, cellWorldSize), [cellWorldSize]);
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

  // Track last grid dims to reinitialize on layout change
  const lastDimsRef = useRef<{ cols: number; rows: number }>({ cols: gridCols, rows: gridRows });
  const initializedRef = useRef(false);

  React.useEffect(() => {
    if (groupRef.current) {
      groupRef.current.renderOrder = 9999;
    }
  }, []);

  function randomEmptyCell(exclude: Set<string>): Cell {
    for (let i = 0; i < 2000; i++) {
      const x = Math.floor(Math.random() * gridCols);
      const y = Math.floor(Math.random() * gridRows);
      const k = `${x},${y}`;
      if (!exclude.has(k)) return { x, y };
    }
    return { x: Math.floor(gridCols / 2), y: Math.floor(gridRows / 2) };
  }

  function resetSnake() {
    const cx = Math.floor(gridCols / 2);
    const cy = Math.floor(gridRows / 2);
    snakeRef.current = Array.from({ length: Math.max(3, Math.min(10, snakeLength)) }, (_, i) => ({ x: cx - i, y: cy }));
    dirRef.current = { x: 1, y: 0 };
    const occupied = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`));
    foodRef.current = randomEmptyCell(occupied);
    targetLenRef.current = snakeLength;
  }

  function step() {
    const head = snakeRef.current[0];
    const d = dirRef.current;
    const straight = d;
    const left = { x: -d.y, y: d.x };
    const right = { x: d.y, y: -d.x };
    const options = [straight, left, right];
    const weights = [turnBias, (1 - turnBias) / 2, (1 - turnBias) / 2];

    const occupied = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`));
    const scored: { dir: Cell; score: number }[] = [];
    for (let i = 0; i < options.length; i++) {
      const nd = options[i];
      let nx = head.x + nd.x;
      let ny = head.y + nd.y;
      if (wrapAround) {
        nx = (nx + gridCols) % gridCols;
        ny = (ny + gridRows) % gridRows;
      }
      let score = weights[i];
      if (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows) score -= 1.0;
      const k = `${nx},${ny}`;
      if (occupied.has(k)) score -= 0.8;
      const fx = foodRef.current.x;
      const fy = foodRef.current.y;
      const dist = Math.abs(fx - nx) + Math.abs(fy - ny);
      const distHead = Math.abs(fx - head.x) + Math.abs(fy - head.y);
      if (dist < distHead) score += 0.2;
      scored.push({ dir: nd, score });
    }

    scored.sort((a, b) => b.score - a.score);
    dirRef.current = scored[0].dir;

    let nx = head.x + dirRef.current.x;
    let ny = head.y + dirRef.current.y;
    if (wrapAround) {
      nx = (nx + gridCols) % gridCols;
      ny = (ny + gridRows) % gridRows;
    }

    if (!wrapAround && (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows)) {
      resetSnake();
      return;
    }

    const k = `${nx},${ny}`;
    const bodyIndex = snakeRef.current.findIndex((c) => c.x === nx && c.y === ny);
    if (bodyIndex >= 0) {
      snakeRef.current = snakeRef.current.slice(0, bodyIndex);
    }

    snakeRef.current.unshift({ x: nx, y: ny });

    if (nx === foodRef.current.x && ny === foodRef.current.y) {
      targetLenRef.current += growthRate;
      const occupiedNow = new Set(snakeRef.current.map((c) => `${c.x},${c.y}`));
      foodRef.current = randomEmptyCell(occupiedNow);
    }

    while (snakeRef.current.length > Math.max(targetLenRef.current, snakeLength)) {
      snakeRef.current.pop();
    }

    setTick((t) => (t + 1) % 1000000);
  }

  useFrame((_, delta) => {
    // Reinitialize when grid dims change due to composition changes or cellsAcross change
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastDimsRef.current = { cols: gridCols, rows: gridRows };
      resetSnake();
    } else if (
      lastDimsRef.current.cols !== gridCols ||
      lastDimsRef.current.rows !== gridRows
    ) {
      lastDimsRef.current = { cols: gridCols, rows: gridRows };
      resetSnake();
    }

    // advance based on speed
    timeAccRef.current += delta;
    const stepInterval = 1 / Math.max(0.5, gameSpeed);
    while (timeAccRef.current >= stepInterval) {
      step();
      timeAccRef.current -= stepInterval;
    }
  });

  // Utility: map grid cell to world position
  const toWorld = (c: Cell): [number, number, number] => {
    const x = (c.x + 0.5) * cellWorldSize - halfW;
    const y = (c.y + 0.5) * cellWorldSize - halfH;
    return [x, y, 0];
  };

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {snakeRef.current.slice(1).map((c, i) => (
        <mesh key={`b-${tick}-${i}-${c.x}-${c.y}`} geometry={geom} material={matBody} position={toWorld(c)} />
      ))}
      {snakeRef.current.length > 0 && (
        <mesh key={`h-${tick}-${snakeRef.current[0].x}-${snakeRef.current[0].y}`} geometry={geom} material={matHead} position={toWorld(snakeRef.current[0])} />
      )}
      <mesh key={`f-${tick}-${foodRef.current.x}-${foodRef.current.y}`} geometry={geom} material={matFood} position={toWorld(foodRef.current)} />
    </group>
  );
};

(SnakeResponsiveSource as any).metadata = {
  name: 'Snake Responsive Source',
  description: 'Auto-playing snake that adapts to canvas size',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'cellsAcross', type: 'number', value: 40, min: 5, max: 200, step: 1 },
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

registerEffect('snake-responsive-source', SnakeResponsiveSource);
registerEffect('SnakeResponsiveSource', SnakeResponsiveSource);

export default SnakeResponsiveSource;


