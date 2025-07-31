import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface CirclePulseEffectProps {
  size?: number
  speed?: number
  color?: string
  bpm?: number
}

const CirclePulseEffect: React.FC<CirclePulseEffectProps> = ({ 
  size = 0.5, 
  speed = 1.0, 
  color = 'blue',
  bpm = 120 
}) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)

  // Create geometry
  const geometry = useMemo(() => {
    return new THREE.CircleGeometry(1, 32)
  }, [])

  // Create material with color
  const material = useMemo(() => {
    const colorValue = getColorValue(color)
    return new THREE.MeshBasicMaterial({
      color: colorValue,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    })
  }, [color])

  // Animation
  useFrame((state) => {
    if (meshRef.current) {
      timeRef.current += state.clock.getDelta()
      
      // Calculate pulse based on BPM
      const beatsPerSecond = bpm / 60
      const pulsePhase = timeRef.current * beatsPerSecond * speed
      const pulse = Math.sin(pulsePhase * Math.PI * 2) * 0.5 + 0.5
      
      // Update scale
      const currentScale = (0.5 + pulse * 0.5) * size
      meshRef.current.scale.setScalar(currentScale)
      
      // Update material color if color prop changes
      const material = meshRef.current.material as THREE.MeshBasicMaterial
      if (material) {
        material.color.setHex(getColorValue(color))
      }
    }
  })

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
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
  return colorMap[colorName.toLowerCase()] || 0x0000ff
}

export default CirclePulseEffect 