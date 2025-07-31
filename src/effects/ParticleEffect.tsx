import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface ParticleEffectProps {
  count?: number
  speed?: number
  size?: number
  color?: string
  spread?: number
}

const ParticleEffect: React.FC<ParticleEffectProps> = ({ 
  count = 1000, 
  speed = 0.5, 
  size = 0.02, 
  color = '#ffffff',
  spread = 10 
}) => {
  const meshRef = useRef<THREE.Points>(null)
  const [particles, setParticles] = useState<Float32Array | null>(null)

  // Create particle positions with vibrant multi-colors
  const particlePositions = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    
    // Define vibrant color palettes
    const colorPalettes = [
      [1.0, 0.2, 0.8], // Hot pink
      [0.2, 1.0, 0.8], // Cyan
      [1.0, 0.8, 0.2], // Yellow
      [0.8, 0.2, 1.0], // Purple
      [1.0, 0.4, 0.2], // Orange
      [0.2, 0.8, 1.0], // Light blue
      [1.0, 0.2, 0.4], // Rose
      [0.4, 1.0, 0.2], // Lime
    ]
    
    for (let i = 0; i < count; i++) {
      // Random positions within spread
      positions[i * 3] = (Math.random() - 0.5) * spread
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread
      
      // Pick a random vibrant color from palette
      const colorIndex = Math.floor(Math.random() * colorPalettes.length)
      const baseColor = colorPalettes[colorIndex]
      
      // Add some variation to the base color
      colors[i * 3] = baseColor[0] + (Math.random() - 0.5) * 0.3 // R
      colors[i * 3 + 1] = baseColor[1] + (Math.random() - 0.5) * 0.3 // G
      colors[i * 3 + 2] = baseColor[2] + (Math.random() - 0.5) * 0.3 // B
      
      // Ensure colors stay in valid range
      colors[i * 3] = Math.max(0, Math.min(1, colors[i * 3]))
      colors[i * 3 + 1] = Math.max(0, Math.min(1, colors[i * 3 + 1]))
      colors[i * 3 + 2] = Math.max(0, Math.min(1, colors[i * 3 + 2]))
    }
    
    return { positions, colors }
  }, [count, spread])

  // Create geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(particlePositions.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(particlePositions.colors, 3))
    return geo
  }, [particlePositions])

  // Create material with size variation
  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: size,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
  }, [size])

  // Enhanced animation with dynamic movement
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime()
      
      // Rotate the entire particle system with more dynamic motion
      meshRef.current.rotation.x = Math.sin(time * 0.2) * 0.2
      meshRef.current.rotation.y = Math.sin(time * 0.3) * 0.2
      meshRef.current.rotation.z = Math.cos(time * 0.15) * 0.1
      
      // Move particles with more complex patterns
      const positions = meshRef.current.geometry.attributes.position.array as Float32Array
      
      for (let i = 0; i < count; i++) {
        const x = positions[i * 3]
        const y = positions[i * 3 + 1]
        const z = positions[i * 3 + 2]
        
        // Create spiral-like motion
        const angle = time * speed * 0.5 + i * 0.01
        const radius = Math.sin(time * 0.3 + i * 0.02) * 0.5 + 0.5
        
        // Add spiral motion
        positions[i * 3] = x + Math.sin(angle) * radius * 0.02
        positions[i * 3 + 1] = y + Math.cos(angle) * radius * 0.02
        positions[i * 3 + 2] = z + Math.sin(angle * 0.7) * 0.01
        
        // Add some chaotic movement
        positions[i * 3] += Math.sin(time * 2 + i * 0.1) * 0.005
        positions[i * 3 + 1] += Math.cos(time * 1.5 + i * 0.1) * 0.005
        positions[i * 3 + 2] += Math.sin(time * 3 + i * 0.1) * 0.003
        
        // Wrap particles back to bounds with bounce effect
        if (Math.abs(x) > spread / 2) {
          positions[i * 3] = Math.sign(x) * (spread / 2 - 0.5)
        }
        if (Math.abs(y) > spread / 2) {
          positions[i * 3 + 1] = Math.sign(y) * (spread / 2 - 0.5)
        }
        if (Math.abs(z) > spread / 2) {
          positions[i * 3 + 2] = Math.sign(z) * (spread / 2 - 0.5)
        }
      }
      
      meshRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  useEffect(() => {
    console.log('ParticleEffect: Created with', count, 'particles')
  }, [count])

  return (
    <points ref={meshRef} geometry={geometry} material={material} />
  )
}

export default ParticleEffect 