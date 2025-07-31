import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface GeometricPatternEffectProps {
  pattern?: 'spiral' | 'grid' | 'stars' | 'polygons'
  speed?: number
  color?: string
  bpm?: number
  complexity?: number
}

const GeometricPatternEffect: React.FC<GeometricPatternEffectProps> = ({ 
  pattern = 'spiral', 
  speed = 1.0, 
  color = 'magenta',
  bpm = 120,
  complexity = 5
}) => {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef(0)

  // Create geometric pattern
  const patternElements = useMemo(() => {
    const elements: React.ReactElement[] = []
    const colorValue = getColorValue(color)
    
    switch (pattern) {
      case 'spiral':
        for (let i = 0; i < complexity * 10; i++) {
          const angle = (i / (complexity * 10)) * Math.PI * 8
          const radius = (i / (complexity * 10)) * 2
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          
          elements.push(
            <mesh key={i} position={[x, y, 0]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
            </mesh>
          )
        }
        break
        
      case 'grid':
        for (let i = 0; i < complexity * 2; i++) {
          for (let j = 0; j < complexity * 2; j++) {
            const x = (i - complexity) * 0.5
            const y = (j - complexity) * 0.5
            
            elements.push(
              <mesh key={`${i}-${j}`} position={[x, y, 0]}>
                <boxGeometry args={[0.1, 0.1, 0.1]} />
                <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
              </mesh>
            )
          }
        }
        break
        
      case 'stars':
        for (let i = 0; i < complexity * 15; i++) {
          const angle = Math.random() * Math.PI * 2
          const radius = Math.random() * 3
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          
          elements.push(
            <mesh key={i} position={[x, y, 0]}>
              <octahedronGeometry args={[0.1]} />
              <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
            </mesh>
          )
        }
        break
        
      case 'polygons':
        for (let i = 0; i < complexity * 8; i++) {
          const sides = Math.floor(Math.random() * 4) + 3 // 3-6 sides
          const angle = Math.random() * Math.PI * 2
          const radius = Math.random() * 2 + 0.5
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          
          elements.push(
            <mesh key={i} position={[x, y, 0]}>
              <ringGeometry args={[0.1, 0.2, sides]} />
              <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
            </mesh>
          )
        }
        break
    }
    
    return elements
  }, [pattern, color, complexity])

  // Animation
  useFrame((state) => {
    if (groupRef.current) {
      timeRef.current += state.clock.getDelta()
      
      // Calculate animation based on BPM
      const beatsPerSecond = bpm / 60
      const animationPhase = timeRef.current * beatsPerSecond * speed
      
      // Rotate the entire pattern
      groupRef.current.rotation.z = animationPhase * 0.5
      
      // Scale animation
      const scale = 1 + Math.sin(animationPhase) * 0.2
      groupRef.current.scale.setScalar(scale)
      
      // Add some wobble
      groupRef.current.rotation.x = Math.sin(animationPhase * 0.3) * 0.1
      groupRef.current.rotation.y = Math.cos(animationPhase * 0.2) * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      {patternElements}
    </group>
  )
}

// Helper function to convert color names to hex values
const getColorValue = (colorName: string): number => {
  const colorMap: Record<string, number> = {
    red: 0xff0000,
    green: 0x00ff00,
    blue: 0x0000ff,
    yellow: 0xffff00,
    purple: 0x800080,
    cyan: 0x00ffff,
    magenta: 0xff00ff,
    orange: 0xff8000,
    pink: 0xff0080,
    lime: 0x80ff00,
    white: 0xffffff,
    black: 0x000000
  }
  return colorMap[colorName.toLowerCase()] || 0xff00ff
}

export default GeometricPatternEffect 