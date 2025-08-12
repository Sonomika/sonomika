import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface AdvancedGlitchEffectProps {
  intensity?: number;
  speed?: number;
  duration?: number;
  amount?: number;
  enableAnalog?: boolean;
  enableDigital?: boolean;
  enableCRT?: boolean;
  videoTexture?: THREE.VideoTexture;
}

const AdvancedGlitchEffect: React.FC<AdvancedGlitchEffectProps> = ({
  intensity = 1.0,
  speed = 1.0,
  duration = 5.0,
  amount = 0.5,
  enableAnalog = true,
  enableDigital = true,
  enableCRT = false,
  videoTexture
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { bpm } = useStore();

  console.log('🎨 AdvancedGlitchEffect component rendered with props:', { 
    intensity, speed, duration, amount, enableAnalog, enableDigital, enableCRT 
  });

  // Create shader material for advanced glitch effect
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0.0 },
        iResolution: { value: new THREE.Vector3(1, 1, 1) },
        iFrame: { value: 0 },
        intensity: { value: intensity },
        speed: { value: speed },
        duration: { value: duration },
        amount: { value: amount },
        enableAnalog: { value: enableAnalog ? 1.0 : 0.0 },
        enableDigital: { value: enableDigital ? 1.0 : 0.0 },
        enableCRT: { value: enableCRT ? 1.0 : 0.0 },
        bpm: { value: bpm },
        iChannel0: { value: videoTexture }
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float iTime;
        uniform vec3 iResolution;
        uniform float iFrame;
        uniform float intensity;
        uniform float speed;
        uniform float duration;
        uniform float amount;
        uniform float enableAnalog;
        uniform float enableDigital;
        uniform float enableCRT;
        uniform float bpm;
        uniform sampler2D iChannel0;
        varying vec2 vUv;
        
        #define SS(a, b, x) (smoothstep(a, b, x) * smoothstep(b, a, x))
        
        #define UI0 1597334673U
        #define UI1 3812015801U
        #define UI2 uvec2(UI0, UI1)
        #define UI3 uvec3(UI0, UI1, 2798796415U)
        #define UIF (1. / float(0xffffffffU))
        
        // Hash by David_Hoskins
        vec3 hash33(vec3 p)
        {
          uvec3 q = uvec3(ivec3(p)) * UI3;
          q = (q.x ^ q.y ^ q.z)*UI3;
          return -1. + 2. * vec3(q) * UIF;
        }
        
        // Gradient noise by iq
        float gnoise(vec3 x)
        {
            // grid
            vec3 p = floor(x);
            vec3 w = fract(x);
            
            // quintic interpolant
            vec3 u = w * w * w * (w * (w * 6. - 15.) + 10.);
            
            // gradients
            vec3 ga = hash33(p + vec3(0., 0., 0.));
            vec3 gb = hash33(p + vec3(1., 0., 0.));
            vec3 gc = hash33(p + vec3(0., 1., 0.));
            vec3 gd = hash33(p + vec3(1., 1., 0.));
            vec3 ge = hash33(p + vec3(0., 0., 1.));
            vec3 gf = hash33(p + vec3(1., 0., 1.));
            vec3 gg = hash33(p + vec3(0., 1., 1.));
            vec3 gh = hash33(p + vec3(1., 1., 1.));
            
            // projections
            float va = dot(ga, w - vec3(0., 0., 0.));
            float vb = dot(gb, w - vec3(1., 0., 0.));
            float vc = dot(gc, w - vec3(0., 1., 0.));
            float vd = dot(gd, w - vec3(1., 1., 0.));
            float ve = dot(ge, w - vec3(0., 0., 1.));
            float vf = dot(gf, w - vec3(1., 0., 1.));
            float vg = dot(gg, w - vec3(0., 1., 1.));
            float vh = dot(gh, w - vec3(1., 1., 1.));
          
            // interpolation
            float gNoise = va + u.x * (vb - va) + 
                    u.y * (vc - va) + 
                    u.z * (ve - va) + 
                    u.x * u.y * (va - vb - vc + vd) + 
                    u.y * u.z * (va - vc - ve + vg) + 
                    u.z * u.x * (va - vb - ve + vf) + 
                    u.x * u.y * u.z * (-va + vb + vc - vd + ve - vf - vg + vh);
            
            return 2. * gNoise;
        }
        
        // gradient noise in range [0, 1]
        float gnoise01(vec3 x)
        {
          return .5 + .5 * gnoise(x);   
        }
        
        // warp uvs for the crt effect
        vec2 crt(vec2 uv)
        {
            float tht  = atan(uv.y, uv.x);
            float r = length(uv);
            // curve without distorting the center
            r /= (1. - .1 * r * r);
            uv.x = r * cos(tht);
            uv.y = r * sin(tht);
            return .5 * (uv + 1.);
        }
        
        void mainImage(out vec4 fragColor, in vec2 fragCoord)
        {
            vec2 uv = fragCoord / iResolution.xy;
            float t = iTime * speed;
            
            // smoothed interval for which the glitch gets triggered
            float glitchAmount = SS(duration * .001, duration * amount, mod(t, duration));  
            float displayNoise = 0.;
            vec3 col = vec3(0.);
            vec2 eps = vec2(5. / iResolution.x, 0.);
            vec2 st = vec2(0.);
            
            if (enableCRT > 0.5) {
              uv = crt(uv * 2. - 1.); // warped uvs
              ++displayNoise;
            }
            
            // analog distortion
            float y = uv.y * iResolution.y;
            float distortion = gnoise(vec3(0., y * .01, t * 500.)) * (glitchAmount * 4. + .1);
            distortion *= gnoise(vec3(0., y * .02, t * 250.)) * (glitchAmount * 2. + .025);
            
            if (enableAnalog > 0.5) {
              ++displayNoise;
              distortion += smoothstep(.999, 1., sin((uv.y + t * 1.6) * 2.)) * .02;
              distortion -= smoothstep(.999, 1., sin((uv.y + t) * 2.)) * .02;
              st = uv + vec2(distortion, 0.);
              // chromatic aberration
              col.r += textureLod(iChannel0, st + eps + distortion, 0.).r;
              col.g += textureLod(iChannel0, st, 0.).g;
              col.b += textureLod(iChannel0, st - eps - distortion, 0.).b;
            } else {
              col += texture(iChannel0, uv, 0.).xyz;
            }
            
            if (enableDigital > 0.5) {
              // blocky distortion
              float bt = floor(t * 30.) * 300.;
              float blockGlitch = .2 + .9 * glitchAmount;
              float blockNoiseX = step(gnoise01(vec3(0., uv.x * 3., bt)), blockGlitch);
              float blockNoiseX2 = step(gnoise01(vec3(0., uv.x * 1.5, bt * 1.2)), blockGlitch);
              float blockNoiseY = step(gnoise01(vec3(0., uv.y * 4., bt)), blockGlitch);
              float blockNoiseY2 = step(gnoise01(vec3(0., uv.y * 6., bt * 1.2)), blockGlitch);
              float block = blockNoiseX2 * blockNoiseY2 + blockNoiseX * blockNoiseY;
              st = vec2(uv.x + sin(bt) * hash33(vec3(uv, .5)).x, uv.y);
              col *= 1. - block;
              block *= 1.15;
              col.r += textureLod(iChannel0, st + eps, 0.).r * block;
              col.g += textureLod(iChannel0, st, 0.).g * block;
              col.b += textureLod(iChannel0, st - eps, 0.).b * block;
            }
            
            // white noise + scanlines
            displayNoise = clamp(displayNoise, 0., 1.);
            col += (.15 + .65 * glitchAmount) * (hash33(vec3(fragCoord, mod(float(iFrame),
             1000.))).r) * displayNoise;
            col -= (.25 + .75 * glitchAmount) * (sin(4. * t + uv.y * iResolution.y * 1.75))
              * displayNoise;
            
            if (enableCRT > 0.5) {
              //crt vignette (from https://www.shadertoy.com/view/Ms23DR)
              float vig = 8.0 * uv.x * uv.y * (1.-uv.x) * (1.-uv.y);
              col *= vec3(pow(vig, .25)) * 1.5;
              if(uv.x < 0. || uv.x > 1.) col *= 0.;
            }
            
            // Apply intensity
            col *= intensity;
            
            fragColor = vec4(col, 1.0);
        }
        
        void main() {
          mainImage(gl_FragColor, gl_FragCoord.xy);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
  }, [intensity, speed, duration, amount, enableAnalog, enableDigital, enableCRT, bpm, videoTexture]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.iTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.iFrame.value = state.clock.elapsedTime * 60; // Approximate frame count
      materialRef.current.uniforms.bpm.value = bpm;
      
      // Update parameter uniforms in real-time
      materialRef.current.uniforms.intensity.value = intensity;
      materialRef.current.uniforms.speed.value = speed;
      materialRef.current.uniforms.duration.value = duration;
      materialRef.current.uniforms.amount.value = amount;
      materialRef.current.uniforms.enableAnalog.value = enableAnalog ? 1.0 : 0.0;
      materialRef.current.uniforms.enableDigital.value = enableDigital ? 1.0 : 0.0;
      materialRef.current.uniforms.enableCRT.value = enableCRT ? 1.0 : 0.0;
      
      // Update resolution
      if (state.gl.domElement) {
        materialRef.current.uniforms.iResolution.value.set(
          state.gl.domElement.width,
          state.gl.domElement.height,
          1
        );
      }
      
      // Update video texture if available
      if (videoTexture && materialRef.current.uniforms.iChannel0.value !== videoTexture) {
        materialRef.current.uniforms.iChannel0.value = videoTexture;
      }
    }
  });

  // Calculate aspect ratio from video texture if available
  const aspectRatio = useMemo(() => {
    if (videoTexture && videoTexture.image) {
      try {
        const { width, height } = videoTexture.image;
        if (width && height && width > 0 && height > 0) {
          return width / height;
        }
      } catch (error) {
        console.warn('Error calculating aspect ratio from video texture:', error);
      }
    }
    return 16/9; // Default aspect ratio
  }, [videoTexture]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0.1]}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  );
};

// Metadata for dynamic discovery
(AdvancedGlitchEffect as any).metadata = {
  name: 'Advanced Glitch',
  description: 'Advanced glitch effect with analog, digital, and CRT distortion types',
  category: 'Video',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true, // This effect replaces the video texture
  parameters: [
    {
      name: 'intensity',
      type: 'number',
      value: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.1,
      description: 'Effect intensity'
    },
    {
      name: 'speed',
      type: 'number',
      value: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      description: 'Animation speed'
    },
    {
      name: 'duration',
      type: 'number',
      value: 5.0,
      min: 1.0,
      max: 20.0,
      step: 0.5,
      description: 'Glitch loop duration'
    },
    {
      name: 'amount',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 1.0,
      step: 0.1,
      description: 'Glitch trigger amount'
    },
    {
      name: 'enableAnalog',
      type: 'boolean',
      value: true,
      description: 'Enable analog distortion'
    },
    {
      name: 'enableDigital',
      type: 'boolean',
      value: true,
      description: 'Enable digital block distortion'
    },
    {
      name: 'enableCRT',
      type: 'boolean',
      value: false,
      description: 'Enable CRT screen effect'
    }
  ]
};

// Self-register the effect
console.log('🔧 Registering AdvancedGlitchEffect...');
registerEffect('AdvancedGlitchEffect', AdvancedGlitchEffect);
console.log('✅ AdvancedGlitchEffect registered successfully');

export default AdvancedGlitchEffect;
