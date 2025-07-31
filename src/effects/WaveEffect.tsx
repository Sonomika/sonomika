import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface WaveEffectProps {
  amplitude?: number
  frequency?: number
  speed?: number
  color?: string
  bpm?: number
}

const WaveEffect: React.FC<WaveEffectProps> = ({ 
  amplitude = 0.5, 
  frequency = 2.0, 
  speed = 1.0, 
  color = 'cyan',
  bpm = 120 
}) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)

  // Create wave geometry
  const geometry = useMemo(() => {
    const segments = 64
    const geometry = new THREE.PlaneGeometry(4, 2, segments, 1)
    
    // Create wave pattern in vertices
    const positions = geometry.attributes.position.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]
      const z = positions[i + 2]
      
      // Create wave pattern
      const wave = Math.sin(x * frequency) * amplitude
      positions[i + 2] = wave
    }
    
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
    
    return geometry
  }, [amplitude, frequency])

  // Create material with color
  const material = useMemo(() => {
    const colorValue = getColorValue(color)
    return new THREE.MeshBasicMaterial({
      color: colorValue,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      wireframe: false
    })
  }, [color])

  // Animation
  useFrame((state) => {
    if (meshRef.current) {
      timeRef.current += state.clock.getDelta()
      
      // Calculate wave animation based on BPM
      const beatsPerSecond = bpm / 60
      const wavePhase = timeRef.current * beatsPerSecond * speed
      
      // Update geometry vertices for wave animation
      const positions = geometry.attributes.position.array as Float32Array
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i]
        const y = positions[i + 1]
        
        // Create animated wave pattern
        const wave = Math.sin(x * frequency + wavePhase) * amplitude
        positions[i + 2] = wave
      }
      
      geometry.attributes.position.needsUpdate = true
      
      // Add rotation for more dynamic effect
      meshRef.current.rotation.x = Math.sin(timeRef.current * 0.2) * 0.1
      
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
  return colorMap[colorName.toLowerCase()] || 0x00ffff
}

export default WaveEffect 