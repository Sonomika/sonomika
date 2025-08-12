import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../../store/store';
import { registerEffect } from '../../utils/effectRegistry';

interface ShaderFeedbackEffectProps {
  // Feedback controls
  feedbackAmount?: number; // 0..1 how much of previous frame persists
  feedbackScale?: number; // around 1.0
  feedbackRotate?: number; // radians per second
  feedbackTranslateX?: number; // -1..1 in UV space
  feedbackTranslateY?: number; // -1..1 in UV space

  // Noise controls
  noiseAmount?: number; // 0..1
  noiseScale?: number; // frequency

  // Light leak controls
  lightLeakIntensity?: number; // 0..1
  lightLeakColor?: string; // hex

  // Pulse
  pulseStrength?: number; // 0..1

  // Optional video source
  videoTexture?: THREE.VideoTexture;
}

const ShaderFeedbackEffect: React.FC<ShaderFeedbackEffectProps> = ({
  feedbackAmount = 0.9,
  feedbackScale = 1.0,
  feedbackRotate = 0.0,
  feedbackTranslateX = 0.0,
  feedbackTranslateY = 0.0,
  noiseAmount = 0.15,
  noiseScale = 2.5,
  lightLeakIntensity = 0.3,
  lightLeakColor = '#ff7e47',
  pulseStrength = 0.15,
  videoTexture
}) => {
  const { gl, size, viewport } = useThree();
  const { bpm } = useStore();

  const outputPlaneRef = useRef<THREE.Mesh>(null);
  const outputMaterialRef = useRef<THREE.ShaderMaterial>(null);

  // Internal ping-pong resources
  const pingRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const pongRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const fbSceneRef = useRef<THREE.Scene | null>(null);
  const fbCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const fbQuadRef = useRef<THREE.Mesh | null>(null);
  const fbMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Build feedback shader material (internal)
  const feedbackMaterial = useMemo(() => {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      varying vec2 vUv;

      uniform sampler2D uPrevTex;
      uniform bool uHasPrev;
      uniform sampler2D uInputTex;
      uniform bool uHasInput;

      uniform float uTime;
      uniform float uBPM;

      uniform float uFeedbackAmount;
      uniform float uScale;
      uniform float uRotate;
      uniform vec2  uTranslate;

      uniform float uNoiseAmount;
      uniform float uNoiseScale;

      uniform float uLeakIntensity;
      uniform vec3  uLeakColor;

      uniform float uPulseStrength;

      // Helpers
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }

      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a, b, u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }

      float fbm(vec2 st) {
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 5; i++) {
          value += amp * noise(st);
          st *= 2.0;
          amp *= 0.5;
        }
        return value;
      }

      vec2 rotate2D(vec2 p, float a){
        float s = sin(a);
        float c = cos(a);
        mat2 m = mat2(c, -s, s, c);
        return m * p;
      }

      vec3 lightLeaks(vec2 uv, float time) {
        vec2 center = vec2(0.5);
        float dist = distance(uv, center);
        float radial = 1.0 - smoothstep(0.0, 0.8, dist);
        float streak1 = pow(abs(sin((uv.x + uv.y) * 10.0 + time * 1.7)), 3.0);
        float streak2 = pow(abs(sin((uv.x - uv.y) * 8.0 + time * 1.1)), 4.0);
        float mask = clamp(radial + 0.3*streak1 + 0.2*streak2, 0.0, 1.0);
        return uLeakColor * mask * uLeakIntensity;
      }

      void main() {
        float time = uTime;
        float pulse = sin(time * (uBPM/60.0) * 6.28318) * uPulseStrength;

        // Feedback UV transform around center
        vec2 uv = vUv;
        vec2 center = vec2(0.5);
        vec2 duv = uv - center;
        duv = rotate2D(duv, uRotate * time);
        duv *= uScale;
        duv += uTranslate;
        vec2 fbUv = center + duv;

        // Sample previous texture
        vec3 prevColor = vec3(0.0);
        if (uHasPrev) {
          prevColor = texture2D(uPrevTex, fbUv).rgb;
        }

        // Input
        vec3 inputColor = vec3(0.0);
        if (uHasInput) {
          inputColor = texture2D(uInputTex, uv).rgb;
        } else {
          // Procedural input if no video
          float p1 = fbm(uv * 3.0 + time * 0.15);
          float p2 = fbm(uv * 5.0 - time * 0.1 + vec2(5.2, 1.3));
          inputColor = mix(vec3(0.2,0.6,1.0), vec3(1.0,0.3,0.7), p1);
          inputColor = mix(inputColor, vec3(0.9,0.9,0.2), p2*0.5);
        }

        // Noise displacement on UV for prev sample
        vec2 nUv = uv * uNoiseScale + time * 0.05;
        float nX = fbm(nUv) - 0.5;
        float nY = fbm(nUv + vec2(100.0, 0.0)) - 0.5;
        vec2 noiseOffset = vec2(nX, nY) * uNoiseAmount * (1.0 + pulse);
        vec3 prevNoisy = uHasPrev ? texture2D(uPrevTex, fbUv + noiseOffset).rgb : vec3(0.0);

        // Composite: mix previous frame with input
        vec3 color = mix(inputColor, prevNoisy, clamp(uFeedbackAmount, 0.0, 1.0));

        // Add light leaks
        color += lightLeaks(uv, time);

        // Subtle grain
        color += (random(uv + time) - 0.5) * 0.02;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPrevTex: { value: null },
        uHasPrev: { value: false },
        uInputTex: { value: videoTexture || null },
        uHasInput: { value: !!videoTexture },
        uTime: { value: 0 },
        uBPM: { value: bpm },
        uFeedbackAmount: { value: feedbackAmount },
        uScale: { value: feedbackScale },
        uRotate: { value: feedbackRotate },
        uTranslate: { value: new THREE.Vector2(feedbackTranslateX, feedbackTranslateY) },
        uNoiseAmount: { value: noiseAmount },
        uNoiseScale: { value: noiseScale },
        uLeakIntensity: { value: lightLeakIntensity },
        uLeakColor: { value: new THREE.Color(lightLeakColor) },
        uPulseStrength: { value: pulseStrength }
      },
      depthTest: false,
      depthWrite: false,
      transparent: false
    });

    return mat;
  }, [videoTexture, bpm, feedbackAmount, feedbackScale, feedbackRotate, feedbackTranslateX, feedbackTranslateY, noiseAmount, noiseScale, lightLeakIntensity, lightLeakColor, pulseStrength]);

  // Build output material to show the feedback texture on a plane in the main scene
  const outputMaterial = useMemo(() => {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      void main(){
        vec3 c = texture2D(uTex, vUv).rgb;
        gl_FragColor = vec4(c, 1.0);
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTex: { value: null as any }
      },
      transparent: false
    });
  }, []);

  // Initialize ping-pong buffers and internal scene
  useEffect(() => {
    const w = Math.max(2, Math.floor(size.width));
    const h = Math.max(2, Math.floor(size.height));

    const options: THREE.WebGLRenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false
    };

    pingRef.current?.dispose();
    pongRef.current?.dispose();

    pingRef.current = new THREE.WebGLRenderTarget(w, h, options);
    pongRef.current = new THREE.WebGLRenderTarget(w, h, options);

    // Internal scene with fullscreen quad [-1..1]
    const fbScene = new THREE.Scene();
    const fbCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(quadGeo, feedbackMaterial);
    fbScene.add(quad);

    fbSceneRef.current = fbScene;
    fbCameraRef.current = fbCamera;
    fbQuadRef.current = quad;
    fbMaterialRef.current = feedbackMaterial;

    // Clear initial targets
    gl.setRenderTarget(pingRef.current);
    gl.clearColor();
    gl.clear(true, true, true);

    gl.setRenderTarget(pongRef.current);
    gl.clearColor();
    gl.clear(true, true, true);

    gl.setRenderTarget(null);

    return () => {
      quadGeo.dispose();
      pingRef.current?.dispose();
      pongRef.current?.dispose();
    };
  }, [gl, size.width, size.height, feedbackMaterial]);

  // Sync uniforms on prop changes
  useEffect(() => {
    if (!fbMaterialRef.current) return;
    fbMaterialRef.current.uniforms.uInputTex.value = videoTexture || null;
    fbMaterialRef.current.uniforms.uHasInput.value = !!videoTexture;
    fbMaterialRef.current.uniforms.uBPM.value = bpm;
    fbMaterialRef.current.uniforms.uFeedbackAmount.value = feedbackAmount;
    fbMaterialRef.current.uniforms.uScale.value = feedbackScale;
    fbMaterialRef.current.uniforms.uRotate.value = feedbackRotate;
    fbMaterialRef.current.uniforms.uTranslate.value = new THREE.Vector2(feedbackTranslateX, feedbackTranslateY);
    fbMaterialRef.current.uniforms.uNoiseAmount.value = noiseAmount;
    fbMaterialRef.current.uniforms.uNoiseScale.value = noiseScale;
    fbMaterialRef.current.uniforms.uLeakIntensity.value = lightLeakIntensity;
    fbMaterialRef.current.uniforms.uLeakColor.value = new THREE.Color(lightLeakColor);
    fbMaterialRef.current.uniforms.uPulseStrength.value = pulseStrength;
  }, [videoTexture, bpm, feedbackAmount, feedbackScale, feedbackRotate, feedbackTranslateX, feedbackTranslateY, noiseAmount, noiseScale, lightLeakIntensity, lightLeakColor, pulseStrength]);

  // Animation / feedback rendering
  useFrame((state, delta) => {
    if (!pingRef.current || !pongRef.current || !fbSceneRef.current || !fbCameraRef.current || !fbMaterialRef.current) return;

    // Update time
    fbMaterialRef.current.uniforms.uTime.value += delta;

    // Read from ping, write to pong
    fbMaterialRef.current.uniforms.uPrevTex.value = pingRef.current.texture;
    fbMaterialRef.current.uniforms.uHasPrev.value = true;

    gl.setRenderTarget(pongRef.current);
    gl.render(fbSceneRef.current, fbCameraRef.current);
    gl.setRenderTarget(null);

    // Swap
    const tmp = pingRef.current;
    pingRef.current = pongRef.current;
    pongRef.current = tmp;

    // Update output
    if (outputMaterialRef.current) {
      outputMaterialRef.current.uniforms.uTex.value = pingRef.current.texture;
    }
  });

  // Create output plane sized to composition aspect ratio
  const planeArgs = useMemo(() => {
    const aspect = viewport.width / viewport.height || 16 / 9;
    const height = 9;
    const width = height * aspect;
    return [width, height, 2, 2] as [number, number, number, number];
  }, [viewport.width, viewport.height]);

  return (
    <mesh ref={outputPlaneRef} position={[0, 0, 0]}>
      <planeGeometry args={planeArgs} />
      <primitive object={outputMaterial} ref={outputMaterialRef} />
    </mesh>
  );
};

// Metadata for browser
(ShaderFeedbackEffect as any).metadata = {
  name: 'Shader Feedback',
  description: 'TouchDesigner-style feedback with noise and light leaks',
  category: 'Feedback',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  parameters: [
    { name: 'feedbackAmount', type: 'number', min: 0, max: 1, step: 0.01, value: 0.9 },
    { name: 'feedbackScale', type: 'number', min: 0.85, max: 1.2, step: 0.001, value: 1.0 },
    { name: 'feedbackRotate', type: 'number', min: -1.0, max: 1.0, step: 0.01, value: 0.0 },
    { name: 'feedbackTranslateX', type: 'number', min: -0.02, max: 0.02, step: 0.0005, value: 0.0 },
    { name: 'feedbackTranslateY', type: 'number', min: -0.02, max: 0.02, step: 0.0005, value: 0.0 },
    { name: 'noiseAmount', type: 'number', min: 0, max: 1, step: 0.01, value: 0.15 },
    { name: 'noiseScale', type: 'number', min: 0.5, max: 8, step: 0.1, value: 2.5 },
    { name: 'lightLeakIntensity', type: 'number', min: 0, max: 1, step: 0.01, value: 0.3 },
    { name: 'lightLeakColor', type: 'color', value: '#ff7e47' },
    { name: 'pulseStrength', type: 'number', min: 0, max: 1, step: 0.01, value: 0.15 }
  ]
};

registerEffect('ShaderFeedbackEffect', ShaderFeedbackEffect);
export default ShaderFeedbackEffect;
