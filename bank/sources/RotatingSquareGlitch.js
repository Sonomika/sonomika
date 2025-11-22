// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Rotating Square Glitch',
  description: 'Grid-based rotating squares with heavy glitch distortions.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  isSource: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 1.0, min: 0, max: 3, step: 0.1 },
    { name: 'gridSize', type: 'number', value: 8, min: 4, max: 20, step: 1 },
    { name: 'rotationSpeed', type: 'number', value: 1, min: 0, max: 5, step: 0.1 },
    { name: 'glitchAmount', type: 'number', value: 0.5, min: 0, max: 1, step: 0.1 },
    { name: 'colorShift', type: 'number', value: 0.3, min: 0, max: 1, step: 0.1 },
    { name: 'bpmSync', type: 'boolean', value: false },
  ],
};

export default function RotatingSquareGlitch({ intensity=1, gridSize=8, rotationSpeed=1, glitchAmount=0.5, colorShift=0.3, bpmSync=false }){
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const meshRef = useRef(null); const materialRef = useRef(null);
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size?.width > 0 && size?.height > 0 ? size.width / size.height : 16 / 9;

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform float uTime; uniform float uIntensity; uniform float uGlitchAmount; uniform float uColorShift; uniform float uGridSize; uniform float uRotationSpeed; uniform float uBpm; uniform float uBpmSync; varying vec2 vUv;
    float noise(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
    float fbm(vec2 st){ float v=0.; float a=.5; for(int i=0;i<5;i++){ v += a*noise(st); st*=2.; a*=.5; } return v; }
    mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
    vec3 proceduralColor(vec2 uv, float t, float gI, float colorShift){
      vec3 base = vec3(0.2, 0.1, 0.3);
      vec3 col1 = vec3(0.8, 0.2, 0.6);
      vec3 col2 = vec3(0.2, 0.8, 0.9);
      float n1 = fbm(uv*3.0 + t*0.5);
      float n2 = fbm(uv*5.0 - t*0.3);
      vec3 col = mix(base, mix(col1, col2, n1), n2);
      if (colorShift > 0.1) {
        float shift = colorShift * gI * 3.0;
        col.r = mix(col.r, fract(col.r + shift), 0.5);
        col.g = mix(col.g, fract(col.g + shift*0.7), 0.5);
        col.b = mix(col.b, fract(col.b + shift*1.3), 0.5);
      }
      return col;
    }
    void main(){ 
      vec2 uv=vUv; 
      float effectiveRotationSpeed = uRotationSpeed;
      float effectiveGlitchAmount = uGlitchAmount;
      if (uBpmSync > 0.5) {
        float beatTime = uTime * (uBpm / 60.0);
        float pulse = sin(beatTime * 6.283185307) * 0.5 + 0.5;
        effectiveRotationSpeed = uRotationSpeed * (0.5 + pulse * 1.5);
        effectiveGlitchAmount = uGlitchAmount * (0.7 + pulse * 0.6);
      }
      float gI=effectiveGlitchAmount*uIntensity; 
      vec2 grid=floor(uv*uGridSize); 
      vec2 gUv=fract(uv*uGridSize); 
      float seed=noise(grid*123.456); 
      float ang=uTime*effectiveRotationSpeed + seed*100.0; 
      vec2 cUv = rot(ang*gI) * (gUv-0.5) + 0.5; 
      vec2 disp = vec2( sin(uTime*15. + seed*50.)*gI*2., cos(uTime*18. + seed*30.)*gI*1.5 ); 
      vec2 finalUv = (grid + cUv + disp) / uGridSize; 
      float chaos = fbm(finalUv*10. + uTime*5.)*gI; 
      finalUv.x += sin(uTime*25. + finalUv.y*100.) * gI*.5 * chaos; 
      finalUv.y += cos(uTime*30. + finalUv.x*80.) * gI*.4 * chaos; 
      float scan = sin(finalUv.y*1000. + uTime*100.) * gI; 
      finalUv.x += scan*0.3; 
      finalUv = fract(finalUv); 
      vec3 col = proceduralColor(finalUv, uTime, gI, uColorShift); 
      float dN=noise(finalUv*200. + uTime*100.); 
      float sN=fbm(finalUv*50. + uTime*20.); 
      if (dN>0.3) col=mix(col, vec3(sN), gI*.8); 
      float gN=noise(grid + uTime*10.); 
      if (gN>0.4){ col.r=1.0-col.r; col.g=fract(col.g*10.); col.b=abs(sin(col.b*20.+uTime*10.)); } 
      if (sN>0.8){ col=vec3(noise(grid+uTime), noise(grid+uTime+100.), noise(grid+uTime+200.)); } 
      if (gI>0.3){ vec2 pS=vec2(5. + gI*50.); vec2 pUv=floor(finalUv*pS)/pS; float pN=noise(pUv + uTime*5.); if (pN>0.7){ col=vec3(fract(sin(pN*100.)), fract(sin(pN*200.)), fract(sin(pN*300.))); } else { col = proceduralColor(pUv, uTime, gI, uColorShift); } } 
      if (noise(finalUv*500. + uTime*50.)> 0.95 - gI*0.5){ col=vec3(fract(sin(dot(finalUv+uTime, vec2(12.9898,78.233)))*43758.5), fract(sin(dot(finalUv+uTime+1., vec2(12.9898,78.233)))*43758.5), fract(sin(dot(finalUv+uTime+2., vec2(12.9898,78.233)))*43758.5)); } 
      float bright = sin(uTime*20. + seed) * gI; 
      col *= 1. + bright*2.; 
      gl_FragColor = vec4(col, 1.0); 
    }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime:{ value:0 }, uIntensity:{ value:intensity }, uGlitchAmount:{ value:glitchAmount }, uColorShift:{ value:colorShift }, uGridSize:{ value:gridSize }, uRotationSpeed:{ value:rotationSpeed }, uBpm:{ value: (globalThis && globalThis.VJ_BPM) || 120 }, uBpmSync:{ value: bpmSync ? 1.0 : 0.0 } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false,
  }), [intensity, glitchAmount, colorShift, gridSize, rotationSpeed, bpmSync]);

  useFrame((state)=>{ if (!materialRef.current) materialRef.current = shaderMaterial; if (!materialRef.current) return; materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; materialRef.current.uniforms.uIntensity.value=intensity; materialRef.current.uniforms.uGlitchAmount.value=glitchAmount; materialRef.current.uniforms.uColorShift.value=colorShift; materialRef.current.uniforms.uGridSize.value=gridSize; materialRef.current.uniforms.uRotationSpeed.value=rotationSpeed; materialRef.current.uniforms.uBpm.value = (globalThis && globalThis.VJ_BPM) || 120; materialRef.current.uniforms.uBpmSync.value = bpmSync ? 1.0 : 0.0; });
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}



