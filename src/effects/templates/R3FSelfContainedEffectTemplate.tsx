import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * R3F SELF-CONTAINED EFFECT TEMPLATE
 * 
 * To create your own React Three Fiber effect:
 * 1. Copy this template
 * 2. Rename the component and file
 * 3. Implement the visual logic in useFrame
 * 4. Define your parameters in the component props
 * 5. Export the effect using the exportR3FEffect() function
 * 6. Drop the file into the effects folder
 */

interface MyCustomR3FEffectProps {
  // Define your effect parameters here
  speed?: number;
  intensity?: number;
  color?: string;
  enabled?: boolean;
  // Add more parameters as needed
}

const MyCustomR3FEffect: React.FC<MyCustomR3FEffectProps> = ({
  speed = 1.0,
  intensity = 0.5,
  color = "#ff0000",
  enabled = true
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [time, setTime] = useState(0);

  // Create geometry and material
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 32), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ 
    color: color,
    transparent: true,
    opacity: intensity
  }), [color, intensity]);

  // Animation loop
  useFrame((state, delta) => {
    if (!enabled || !meshRef.current) return;

    // Update time
    setTime(prev => prev + delta * speed);

    // Animate the mesh
    if (meshRef.current) {
      meshRef.current.scale.setScalar(1 + Math.sin(time) * 0.3);
      meshRef.current.rotation.y += delta * speed;
    }
  });

  if (!enabled) return null;

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};

// Export function that makes the R3F effect self-contained
export function exportR3FEffect() {
  return {
    id: "my-custom-r3f-effect",
    name: "My Custom R3F Effect",
    description: "A custom React Three Fiber effect",
    category: "R3F",
    icon: "🎨",
    author: "Your Name",
    version: "1.0.0",
    component: MyCustomR3FEffect,
    defaultProps: {
      speed: 1.0,
      intensity: 0.5,
      color: "#ff0000",
      enabled: true
    },
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
        name: "intensity",
        type: "number",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: 0.5
      },
      {
        name: "color",
        type: "color",
        default: "#ff0000"
      },
      {
        name: "enabled",
        type: "boolean",
        default: true
      }
    ]
  };
}

// Export the component for direct use
export default MyCustomR3FEffect; 