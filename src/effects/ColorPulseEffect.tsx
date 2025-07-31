import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface ColorPulseEffectProps {
  intensity?: number
  colorSpeed?: number
  autoColor?: boolean
  bpm?: number
  mode?: 'gradient' | 'solid' | 'rainbow' | 'fire'
}

const ColorPulseEffect: React.FC<ColorPulseEffectProps> = ({ 
  intensity = 0.5, 
  colorSpeed = 0.1, 
  autoColor = true,
  bpm = 120,
  mode = 'gradient'
}) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)

  // Create geometry
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(4, 2, 1, 1)
  }, [])

  // Create material with shader for color effects
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity },
        colorSpeed: { value: colorSpeed },
        autoColor: { value: autoColor ? 1.0 : 0.0 },
        mode: { value: getModeValue(mode) }
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform float colorSpeed;
        uniform float autoColor;
        uniform float mode;
        
        varying vec2 vUv;
        
        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }
        
        void main() {
          vec2 uv = vUv;
          
          if (mode < 0.5) {
            // Gradient mode
            float hue = time * colorSpeed + uv.x * 0.5;
            vec3 color1 = hsv2rgb(vec3(hue, 0.8, 0.5 + intensity * 0.3));
            vec3 color2 = hsv2rgb(vec3(hue + 0.3, 0.8, 0.5 + intensity * 0.3));
            vec3 color3 = hsv2rgb(vec3(hue + 0.6, 0.8, 0.5 + intensity * 0.3));
            
            vec3 finalColor = mix(color1, color2, uv.x);
            finalColor = mix(finalColor, color3, uv.y);
            
            gl_FragColor = vec4(finalColor, 1.0);
          } else if (mode < 1.5) {
            // Solid mode
            float hue = time * colorSpeed;
            vec3 color = hsv2rgb(vec3(hue, 0.8, 0.5 + intensity * 0.3));
            gl_FragColor = vec4(color, 1.0);
          } else if (mode < 2.5) {
            // Rainbow mode
            float hue = time * colorSpeed + uv.x * 2.0 + uv.y * 2.0;
            vec3 color = hsv2rgb(vec3(hue, 0.8, 0.5 + intensity * 0.3));
            gl_FragColor = vec4(color, 1.0);
          } else {
            // Fire mode
            float noise = sin(uv.x * 10.0 + time * 2.0) * sin(uv.y * 10.0 + time * 1.5);
            float fire = uv.y + noise * 0.1;
            vec3 color = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0), fire);
            color = mix(color, vec3(0.0, 0.0, 0.0), fire * 2.0);
            gl_FragColor = vec4(color, 1.0);
          }
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    })
  }, [intensity, colorSpeed, autoColor, mode])

  // Animation
  useFrame((state) => {
    if (meshRef.current) {
      timeRef.current += state.clock.getDelta()
      
      // Calculate animation based on BPM
      const beatsPerSecond = bpm / 60
      const animationPhase = timeRef.current * beatsPerSecond
      
      // Update shader uniforms
      const material = meshRef.current.material as THREE.ShaderMaterial
      if (material && material.uniforms) {
        material.uniforms.time.value = timeRef.current
        material.uniforms.intensity.value = intensity
        material.uniforms.colorSpeed.value = colorSpeed
        material.uniforms.autoColor.value = autoColor ? 1.0 : 0.0
        material.uniforms.mode.value = getModeValue(mode)
      }
      
      // Add some movement
      meshRef.current.rotation.z = Math.sin(animationPhase * 0.1) * 0.05
      meshRef.current.scale.x = 1 + Math.sin(animationPhase * 0.5) * 0.1
      meshRef.current.scale.y = 1 + Math.cos(animationPhase * 0.3) * 0.1
    }
  })

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  )
}

// Helper function to get mode value for shader
const getModeValue = (mode: string): number => {
  const modeMap: Record<string, number> = {
    gradient: 0.0,
    solid: 1.0,
    rainbow: 2.0,
    fire: 3.0
  }
  return modeMap[mode] || 0.0
}

export default ColorPulseEffect 