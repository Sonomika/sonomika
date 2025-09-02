import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { registerEffect } from '../../utils/effectRegistry';

interface BouncingLetters3DSourceProps {
  text?: string;             // letters to spawn
  count?: number;            // how many letters active at once
  fontSize?: number;         // letter size in world units
  speed?: number;            // velocity multiplier
  gravity?: number;          // downward accel (world units / s^2)
  bounciness?: number;       // 0..1 restitution on collisions
  friction?: number;         // velocity damping per bounce (0..1)
  color?: string;            // base color
  randomSeed?: number;       // deterministic init
  zDepth?: number;           // half-depth of the box in Z
}

type LetterBody = {
  ch: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  rotation: THREE.Euler;
  angularVelocity: THREE.Vector3;
};

const BouncingLetters3DSource: React.FC<BouncingLetters3DSourceProps> = ({
  text = 'VJ SYSTEM',
  count = 24,
  fontSize = 0.25,
  speed = 1.0,
  gravity = 0.0,
  bounciness = 0.8,
  friction = 0.05,
  color = '#66ccff',
  randomSeed = 0,
  zDepth = 0.5
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const lettersRef = useRef<LetterBody[]>([]);
  const seedRef = useRef<number>(randomSeed >>> 0);

  const rand = useMemo(() => {
    if (!seedRef.current) return Math.random;
    let s = seedRef.current;
    return () => {
      // xorshift32
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 0xffff) / 0xffff;
    };
  }, [randomSeed]);

  const { size } = useThree();
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const halfW = (aspect * 2) / 2; // plane width is aspect*2, height is 2
  const halfH = 2 / 2;

  // initialize letters
  React.useEffect(() => {
    const chars = (text && text.length > 0 ? text : 'VJ').split('');
    const n = Math.max(1, Math.min(count, 200));
    const arr: LetterBody[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const ch = chars[i % chars.length];
      const p = new THREE.Vector3(
        (rand() * 2 - 1) * (halfW - fontSize * 0.6),
        (rand() * 2 - 1) * (halfH - fontSize * 0.6),
        (rand() * 2 - 1) * (zDepth - fontSize * 0.2)
      );
      const speedBase = 0.6 + rand() * 0.8;
      const v = new THREE.Vector3(
        (rand() * 2 - 1) * speedBase,
        (rand() * 2 - 1) * speedBase,
        (rand() * 2 - 1) * speedBase * 0.5
      );
      const hue = 0.5 + rand() * 0.3;
      const col = new THREE.Color().setHSL(hue, 0.7, 0.6);
      arr[i] = {
        ch,
        position: p,
        velocity: v,
        color: col.multiply(new THREE.Color(color)),
        rotation: new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI),
        angularVelocity: new THREE.Vector3(
          (rand() * 2 - 1) * 1.5,
          (rand() * 2 - 1) * 1.5,
          (rand() * 2 - 1) * 1.5
        )
      };
    }
    lettersRef.current = arr;
  }, [text, count, halfW, halfH, zDepth, fontSize, rand, color]);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const left = -halfW + fontSize * 0.6;
    const right = halfW - fontSize * 0.6;
    const bottom = -halfH + fontSize * 0.6;
    const top = halfH - fontSize * 0.6;
    const front = zDepth - fontSize * 0.2;
    const back = -zDepth + fontSize * 0.2;

    for (const L of lettersRef.current) {
      // integrate linear motion
      L.velocity.y -= gravity * dt;
      L.position.x += L.velocity.x * dt * speed;
      L.position.y += L.velocity.y * dt * speed;
      L.position.z += L.velocity.z * dt * speed;

      // integrate angular motion
      L.rotation.x += L.angularVelocity.x * dt * 0.5;
      L.rotation.y += L.angularVelocity.y * dt * 0.5;
      L.rotation.z += L.angularVelocity.z * dt * 0.5;

      // bounds collisions with restitution and friction
      if (L.position.x <= left) { L.position.x = left; L.velocity.x = Math.abs(L.velocity.x) * bounciness; L.velocity.y *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.x >= right) { L.position.x = right; L.velocity.x = -Math.abs(L.velocity.x) * bounciness; L.velocity.y *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.y <= bottom) { L.position.y = bottom; L.velocity.y = Math.abs(L.velocity.y) * bounciness; L.velocity.x *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.y >= top) { L.position.y = top; L.velocity.y = -Math.abs(L.velocity.y) * bounciness; L.velocity.x *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.z >= front) { L.position.z = front; L.velocity.z = -Math.abs(L.velocity.z) * bounciness; L.velocity.x *= 1 - friction; L.velocity.y *= 1 - friction; }
      if (L.position.z <= back) { L.position.z = back; L.velocity.z = Math.abs(L.velocity.z) * bounciness; L.velocity.x *= 1 - friction; L.velocity.y *= 1 - friction; }
    }
  });

  return (
    <group ref={groupRef} renderOrder={9998}>
      {lettersRef.current.map((L, i) => (
        <Text
          key={i}
          position={[L.position.x, L.position.y, L.position.z]}
          fontSize={fontSize}
          color={L.color}
          anchorX="center"
          anchorY="middle"
          material-transparent
          material-depthTest={false}
          material-depthWrite={false}
          material-blending={THREE.AdditiveBlending}
          rotation={[L.rotation.x, L.rotation.y, L.rotation.z]}
        >
          {L.ch}
        </Text>
      ))}
    </group>
  );
};

(BouncingLetters3DSource as any).metadata = {
  name: 'Bouncing Letters 3D',
  description: '3D letters bouncing inside the composition bounds with simple physics',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'text', type: 'string', value: 'VJ SYSTEM' },
    { name: 'count', type: 'number', value: 24, min: 1, max: 200, step: 1 },
    { name: 'fontSize', type: 'number', value: 0.25, min: 0.05, max: 0.8, step: 0.01 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 4.0, step: 0.1 },
    { name: 'gravity', type: 'number', value: 0.0, min: -3.0, max: 3.0, step: 0.05 },
    { name: 'bounciness', type: 'number', value: 0.8, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'friction', type: 'number', value: 0.05, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'color', type: 'color', value: '#66ccff' },
    { name: 'randomSeed', type: 'number', value: 0, min: 0, max: 999999, step: 1 },
    { name: 'zDepth', type: 'number', value: 0.5, min: 0.1, max: 2.0, step: 0.05 }
  ]
};

registerEffect('bouncing-letters-3d', BouncingLetters3DSource);
registerEffect('BouncingLetters3DSource', BouncingLetters3DSource);

export default BouncingLetters3DSource;


