// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Rotating Square Glitch',
  description: 'Grid-based rotating squares with heavy glitch distortions.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 1.0, min: 0, max: 3, step: 0.1 },
    { name: 'gridSize', type: 'number', value: 8, min: 4, max: 20, step: 1 },
    { name: 'rotationSpeed', type: 'number', value: 1, min: 0, max: 5, step: 0.1 },
    { name: 'glitchAmount', type: 'number', value: 0.5, min: 0, max: 1, step: 0.1 },
    { name: 'colorShift', type: 'number', value: 0.3, min: 0, max: 1, step: 0.1 },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.01 },
  ],
};

export default function RotatingSquareGlitchExternal({ videoTexture, intensity=1, gridSize=8, rotationSpeed=1, glitchAmount=0.5, colorShift=0.3, opacity=1 }){
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const meshRef = useRef(null); const materialRef = useRef(null);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uIntensity; uniform float uGlitchAmount; uniform float uColorShift; uniform float uOpacity; uniform float uGridSize; uniform float uRotationSpeed; varying vec2 vUv;
    float noise(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
    float fbm(vec2 st){ float v=0.; float a=.5; for(int i=0;i<5;i++){ v += a*noise(st); st*=2.; a*=.5; } return v; }
    mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
    vec3 rgbShift(sampler2D tex, vec2 uv, float amt){ vec2 rO=vec2(amt*.05, amt*.02); vec2 gO=vec2(-amt*.03, amt*.04); vec2 bO=vec2(amt*.02, -amt*.05); float r=texture2D(tex, uv+rO).r; float g=texture2D(tex, uv+gO).g; float b=texture2D(tex, uv+bO).b; return vec3(r,g,b); }
    void main(){ vec2 uv=vUv; float gI=uGlitchAmount*uIntensity; vec2 grid=floor(uv*uGridSize); vec2 gUv=fract(uv*uGridSize); float seed=noise(grid*123.456); float ang=uTime*uRotationSpeed + seed*100.0; vec2 cUv = rot(ang*gI) * (gUv-0.5) + 0.5; vec2 disp = vec2( sin(uTime*15. + seed*50.)*gI*2., cos(uTime*18. + seed*30.)*gI*1.5 ); vec2 finalUv = (grid + cUv + disp) / uGridSize; float chaos = fbm(finalUv*10. + uTime*5.)*gI; finalUv.x += sin(uTime*25. + finalUv.y*100.) * gI*.5 * chaos; finalUv.y += cos(uTime*30. + finalUv.x*80.) * gI*.4 * chaos; float scan = sin(finalUv.y*1000. + uTime*100.) * gI; finalUv.x += scan*0.3; finalUv = fract(finalUv); vec3 col = (gI>0.3) ? rgbShift(tDiffuse, finalUv, uColorShift*gI*3.) : texture2D(tDiffuse, finalUv).rgb; float dN=noise(finalUv*200. + uTime*100.); float sN=fbm(finalUv*50. + uTime*20.); if (dN>0.3) col=mix(col, vec3(sN), gI*.8); float gN=noise(grid + uTime*10.); if (gN>0.4){ col.r=1.0-col.r; col.g=fract(col.g*10.); col.b=abs(sin(col.b*20.+uTime*10.)); } if (sN>0.8){ col=vec3(noise(grid+uTime), noise(grid+uTime+100.), noise(grid+uTime+200.)); } if (gI>0.3){ vec2 pS=vec2(5. + gI*50.); vec2 pUv=floor(finalUv*pS)/pS; float pN=noise(pUv + uTime*5.); if (pN>0.7){ col=vec3(fract(sin(pN*100.)), fract(sin(pN*200.)), fract(sin(pN*300.))); } else { col = texture2D(tDiffuse, pUv).rgb; } } if (noise(finalUv*500. + uTime*50.)> 0.95 - gI*0.5){ col=vec3(fract(sin(dot(finalUv+uTime, vec2(12.9898,78.233)))*43758.5), fract(sin(dot(finalUv+uTime+1., vec2(12.9898,78.233)))*43758.5), fract(sin(dot(finalUv+uTime+2., vec2(12.9898,78.233)))*43758.5)); } float bright = sin(uTime*20. + seed) * gI; col *= 1. + bright*2.; gl_FragColor = vec4(col, uOpacity); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { tDiffuse:{ value: videoTexture }, uTime:{ value:0 }, uIntensity:{ value:intensity }, uGlitchAmount:{ value:glitchAmount }, uColorShift:{ value:colorShift }, uOpacity:{ value:opacity }, uGridSize:{ value:gridSize }, uRotationSpeed:{ value:rotationSpeed } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false,
  }), [videoTexture, intensity, glitchAmount, colorShift, opacity, gridSize, rotationSpeed]);

  useFrame((state)=>{ if (!materialRef.current) materialRef.current = shaderMaterial; if (!materialRef.current) return; materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; materialRef.current.uniforms.uIntensity.value=intensity; materialRef.current.uniforms.uGlitchAmount.value=glitchAmount; materialRef.current.uniforms.uColorShift.value=colorShift; materialRef.current.uniforms.uOpacity.value=opacity; materialRef.current.uniforms.uGridSize.value=gridSize; materialRef.current.uniforms.uRotationSpeed.value=rotationSpeed; });

  if (!videoTexture) return null; const aspect=16/9;
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


