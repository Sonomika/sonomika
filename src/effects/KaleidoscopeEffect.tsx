import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface KaleidoscopeEffectProps {
  videoTexture: THREE.VideoTexture | null
}

const KaleidoscopeEffect: React.FC<KaleidoscopeEffectProps> = ({ videoTexture }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const [debugMode, setDebugMode] = useState(false) // Debug mode (disabled by default)
  
  // Debug: Check if video texture is received
  useEffect(() => {
    console.log('KaleidoscopeEffect: videoTexture received:', videoTexture)
    if (videoTexture) {
      console.log('KaleidoscopeEffect: videoTexture image:', videoTexture.image)
      console.log('KaleidoscopeEffect: video readyState:', videoTexture.image?.readyState)
      console.log('KaleidoscopeEffect: video currentTime:', videoTexture.image?.currentTime)
      console.log('KaleidoscopeEffect: video paused:', videoTexture.image?.paused)
      console.log('KaleidoscopeEffect: video videoWidth:', videoTexture.image?.videoWidth)
      console.log('KaleidoscopeEffect: video videoHeight:', videoTexture.image?.videoHeight)
      
      // Configure video texture properly
      videoTexture.wrapS = THREE.RepeatWrapping
      videoTexture.wrapT = THREE.RepeatWrapping
      videoTexture.minFilter = THREE.LinearFilter
      videoTexture.magFilter = THREE.LinearFilter
      videoTexture.format = THREE.RGBAFormat  // Changed from RGBFormat to RGBAFormat
      videoTexture.generateMipmaps = false
      
      console.log('KaleidoscopeEffect: Video texture configured with RepeatWrapping')
    } else {
      console.log('KaleidoscopeEffect: No video texture provided')
    }
  }, [videoTexture])
  
  // Create plane geometry that fills the screen
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(16, 9, 1, 1)  // Changed from 4x3 to 16x9 for proper 16:9 aspect ratio
  }, [])
  
  // Create shader material
  const material = useMemo((): THREE.Material => {
    if (!videoTexture) {
      console.log('KaleidoscopeEffect: No videoTexture available, creating placeholder material')
      return new THREE.MeshBasicMaterial({ color: 0xff0000 })
    }

    console.log('KaleidoscopeEffect: Creating shader material with videoTexture')
    
    try {
      const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          videoTexture: { value: videoTexture },
          time: { value: 0 },
          segments: { value: 3.0 },
          rotation: { value: 0 },
          debugMode: { value: debugMode ? 1.0 : 0.0 }
        },
        vertexShader: `
          precision mediump float;
          varying vec2 vUv;
          
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform sampler2D videoTexture;
          uniform float time;
          uniform float segments;
          uniform float rotation;
          uniform float debugMode;
          
          varying vec2 vUv;
          
          void main() {
            // Use texture2D() for Three.js 0.162.0 compatibility
            if (debugMode > 0.5) {
              // Show raw video texture
              gl_FragColor = texture2D(videoTexture, vUv);
            } else {
              // Simple kaleidoscope effect
              vec2 centeredUv = vUv - 0.5;
              float angle = atan(centeredUv.y, centeredUv.x) + rotation;
              float radius = length(centeredUv);
              
              // Simple mirroring
              float segmentAngle = 2.0 * 3.14159 / segments;
              angle = mod(angle, segmentAngle);
              if (angle > segmentAngle * 0.5) {
                angle = segmentAngle - angle;
              }
              
              vec2 kaleidoUv = vec2(cos(angle), sin(angle)) * radius + 0.5;
              kaleidoUv = clamp(kaleidoUv, 0.0, 1.0);
              
              gl_FragColor = texture2D(videoTexture, kaleidoUv);
            }
          }
        `,
        transparent: true,
        side: THREE.DoubleSide  // Add this to ensure the plane is visible from both sides
      })
      
      // Test if shader compiled successfully
      if (shaderMaterial.fragmentShader && shaderMaterial.vertexShader) {
        console.log('KaleidoscopeEffect: Shader material created successfully')
        return shaderMaterial
      } else {
        console.error('KaleidoscopeEffect: Shader compilation failed, using fallback')
        return new THREE.MeshBasicMaterial({ color: 0x00ff00 }) // Green fallback
      }
    } catch (error) {
      console.error('KaleidoscopeEffect: Error creating shader material:', error)
      // Fallback to basic material
      return new THREE.MeshBasicMaterial({ color: 0xff0000 }) // Red fallback
    }
  }, [videoTexture, debugMode])
  
  // Update texture when videoTexture changes
  useEffect(() => {
    if (material instanceof THREE.ShaderMaterial && videoTexture) {
      console.log('KaleidoscopeEffect: Updating material with videoTexture')
      material.uniforms.videoTexture.value = videoTexture
      material.needsUpdate = true
    }
  }, [material, videoTexture])
  
  useFrame((state) => {
    if (!material || !(material instanceof THREE.ShaderMaterial)) {
      console.log('KaleidoscopeEffect: No shader material available')
      return
    }
    
    try {
      material.uniforms.time.value = state.clock.elapsedTime
      material.uniforms.rotation.value = state.clock.elapsedTime * 0.5
      // Animate segments more dramatically for visible effect
      material.uniforms.segments.value = 3.0 + Math.sin(state.clock.elapsedTime * 0.5) * 2.0
      material.uniforms.debugMode.value = debugMode ? 1.0 : 0.0
      
      // Update video texture - this is crucial for video playback
      if (videoTexture && videoTexture.image) {
        videoTexture.needsUpdate = true
      }
    } catch (error) {
      console.error('KaleidoscopeEffect: Error in useFrame:', error)
    }
  })
  
  // Add keyboard shortcut to toggle debug mode (press 'D' key) - disabled by default
  useEffect(() => {
    // Set to true to enable debug mode toggle
    const enableDebugToggle = false;
    
    if (!enableDebugToggle) {
      return; // Skip debug toggle if disabled
    }
    
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'd' || event.key === 'D') {
        setDebugMode(prev => !prev)
        console.log('KaleidoscopeEffect: Debug mode toggled:', !debugMode)
      }
    }
    
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [debugMode])
  
  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  )
}

export default KaleidoscopeEffect 