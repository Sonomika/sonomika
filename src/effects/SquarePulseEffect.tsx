import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface SquarePulseEffectProps {
  size?: number
  speed?: number
  color?: string
  bpm?: number
}

const SquarePulseEffect: React.FC<SquarePulseEffectProps> = ({ 
  size = 0.5, 
  speed = 1.0, 
  color = 'red',
  bpm = 120 
}) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)

  // Create geometry
  const geometry = useMemo(() => {
    return new THREE.BoxGeometry(1, 1, 0.1)
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
      // Use elapsed time for consistent BPM sync regardless of frame rate
      const elapsedTime = state.clock.elapsedTime
      
      // Calculate pulse based on BPM
      const beatsPerSecond = bpm / 60
      const pulsePhase = elapsedTime * beatsPerSecond * speed
      const pulse = Math.sin(pulsePhase * Math.PI * 2) * 0.5 + 0.5
      
      // Update scale
      const currentScale = (0.5 + pulse * 0.5) * size
      meshRef.current.scale.setScalar(currentScale)
      
      // Add rotation for more dynamic effect
      meshRef.current.rotation.z = elapsedTime * 0.5
      
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
  return colorMap[colorName.toLowerCase()] || 0xff0000
}

export default SquarePulseEffect 