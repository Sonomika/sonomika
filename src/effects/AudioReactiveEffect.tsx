import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface AudioReactiveEffectProps {
  sensitivity?: number
  frequency?: number
  color?: string
  bpm?: number
  mode?: 'bars' | 'circles' | 'waves' | 'particles'
}

const AudioReactiveEffect: React.FC<AudioReactiveEffectProps> = ({ 
  sensitivity = 0.5, 
  frequency = 440, 
  color = 'orange',
  bpm = 120,
  mode = 'bars'
}) => {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  // Simulate audio reactivity (in a real app, you'd connect to actual audio)
  useEffect(() => {
    // Simulate audio levels based on BPM
    const interval = setInterval(() => {
      const beatsPerSecond = bpm / 60
      const time = Date.now() / 1000
      const beatPhase = (time * beatsPerSecond) % 1
      
      // Create audio-reactive levels
      const level = Math.sin(beatPhase * Math.PI * 2) * 0.5 + 0.5
      setAudioLevel(level * sensitivity)
    }, 16) // ~60fps

    return () => clearInterval(interval)
  }, [bpm, sensitivity])

  // Create audio-reactive elements
  const audioElements = useMemo(() => {
    const elements: React.ReactElement[] = []
    const colorValue = getColorValue(color)
    
    switch (mode) {
      case 'bars':
        // Create frequency bars
        for (let i = 0; i < 32; i++) {
          const height = 0.1 + (Math.random() * 0.5)
          const x = (i - 16) * 0.15
          
          elements.push(
            <mesh key={i} position={[x, height / 2, 0]}>
              <boxGeometry args={[0.1, height, 0.1]} />
              <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
            </mesh>
          )
        }
        break
        
      case 'circles':
        // Create concentric circles
        for (let i = 0; i < 8; i++) {
          const radius = 0.2 + i * 0.3
          
          elements.push(
            <mesh key={i} position={[0, 0, 0]}>
              <ringGeometry args={[radius, radius + 0.1, 32]} />
              <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
            </mesh>
          )
        }
        break
        
      case 'waves':
        // Create wave pattern
        for (let i = 0; i < 64; i++) {
          const x = (i - 32) * 0.1
          const y = Math.sin(i * 0.2) * 0.5
          
          elements.push(
            <mesh key={i} position={[x, y, 0]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
            </mesh>
          )
        }
        break
        
      case 'particles':
        // Create particle field
        for (let i = 0; i < 100; i++) {
          const x = (Math.random() - 0.5) * 4
          const y = (Math.random() - 0.5) * 4
          const z = (Math.random() - 0.5) * 4
          
          elements.push(
            <mesh key={i} position={[x, y, z]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color={colorValue} transparent opacity={0.8} />
            </mesh>
          )
        }
        break
    }
    
    return elements
  }, [mode, color])

  // Animation
  useFrame((state) => {
    if (groupRef.current) {
      timeRef.current += state.clock.getDelta()
      
      // Calculate animation based on BPM and audio level
      const beatsPerSecond = bpm / 60
      const animationPhase = timeRef.current * beatsPerSecond
      
      // Scale based on audio level
      const scale = 1 + audioLevel * 0.5
      groupRef.current.scale.setScalar(scale)
      
      // Rotate based on audio level
      groupRef.current.rotation.z = animationPhase * audioLevel
      
      // Add some movement
      groupRef.current.rotation.x = Math.sin(animationPhase * 0.5) * audioLevel * 0.2
      groupRef.current.rotation.y = Math.cos(animationPhase * 0.3) * audioLevel * 0.2
      
      // Update individual elements for audio reactivity
      groupRef.current.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          // Scale individual elements based on audio
          const elementScale = 1 + audioLevel * Math.sin(index * 0.5) * 0.5
          child.scale.setScalar(elementScale)
          
          // Add some color variation
          const material = child.material as THREE.MeshBasicMaterial
          if (material) {
            const hue = (timeRef.current * 50 + index * 10) % 360
            const saturation = 0.8 + audioLevel * 0.2
            const lightness = 0.5 + audioLevel * 0.3
            material.color.setHSL(hue / 360, saturation, lightness)
          }
        }
      })
    }
  })

  return (
    <group ref={groupRef}>
      {audioElements}
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
  return colorMap[colorName.toLowerCase()] || 0xff8000
}

export default AudioReactiveEffect 