// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Flux Source',
  description: 'Procedural flowing effect with noise, light leaks, BPM pulse.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 1.0, min: 0, max: 2, step: 0.1 },
    { name: 'speed', type: 'number', value: 1.0, min: 0, max: 3, step: 0.1 },
    { name: 'noiseAmount', type: 'number', value: 0.3, min: 0, max: 1, step: 0.05 },
    { name: 'noiseScale', type: 'number', value: 2.0, min: 0.5, max: 5, step: 0.1 },
    { name: 'lightLeakIntensity', type: 'number', value: 0.4, min: 0, max: 1, step: 0.05 },
    { name: 'lightLeakColor', type: 'color', value: '#ff6b35' },
    { name: 'flowDirection', type: 'number', value: 0.0, min: 0, max: 6.28, step: 0.1 },
    { name: 'pulseStrength', type: 'number', value: 0.2, min: 0, max: 1, step: 0.05 },
  ],
};

export default function FluxSource({ intensity=1.0, speed=1.0, noiseAmount=0.3, noiseScale=2.0, lightLeakIntensity=0.4, lightLeakColor='#ff6b35', flowDirection=0.0, pulseStrength=0.2, videoTexture }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  const vertexShader = `varying vec2 vUv; varying vec3 vPosition; void main(){ vUv=uv; vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `uniform float uTime; uniform float uIntensity; uniform float uSpeed; uniform float uNoiseAmount; uniform float uNoiseScale; uniform float uLightLeakIntensity; uniform vec3 uLightLeakColor; uniform float uFlowDirection; uniform float uPulseStrength; uniform float uBPM; uniform sampler2D uVideoTexture; uniform bool uHasVideo; uniform float uGlobalOpacity; varying vec2 vUv; varying vec3 vPosition; float random(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);} float noise(vec2 st){ vec2 i=floor(st); vec2 f=fract(st); float a=random(i); float b=random(i+vec2(1.,0.)); float c=random(i+vec2(0.,1.)); float d=random(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y; } float fbm(vec2 st){ float v=0.; float a=.5; for(int i=0;i<5;i++){ v+=a*noise(st); st*=2.; a*=.5; } return v; } vec2 flowField(vec2 uv, float time){ float angle = uFlowDirection + fbm(uv*uNoiseScale + time*uSpeed*0.1) * 6.28318; return vec2(cos(angle), sin(angle)); } vec3 lightLeak(vec2 uv, float time){ vec2 center=vec2(0.5,0.5); float dist=distance(uv,center); float radial = 1.0 - smoothstep(0.0, 0.8, dist); float streak1=abs(sin((uv.x+uv.y)*10. + time*uSpeed*2.)); float streak2=abs(sin((uv.x-uv.y)*8. + time*uSpeed*1.5)); streak1=pow(streak1,3.); streak2=pow(streak2,4.); float leakMask = clamp(radial + streak1*.3 + streak2*.2, 0.0, 1.0); return uLightLeakColor * leakMask * uLightLeakIntensity; } void main(){ vec2 uv=vUv; float time=uTime*uSpeed; float bpmPulse = sin(uTime*(uBPM/60.0)*6.28318)*uPulseStrength; vec2 flow=flowField(uv,time); vec2 duv=uv + flow*uIntensity*0.1*(1.0+bpmPulse); float nx=fbm(uv*uNoiseScale + time*0.1)-0.5; float ny=fbm(uv*uNoiseScale + vec2(100.0,0.0) + time*0.1) - 0.5; duv += vec2(nx,ny)*uNoiseAmount*uIntensity; duv=fract(duv); vec3 color; if (uHasVideo){ color = texture2D(uVideoTexture, duv).rgb; float flux=fbm(uv*3. + time*.2); flux=smoothstep(0.3,0.7,flux); vec3 fC=vec3(sin(time+uv.x*3.)*.5+.5, sin(time+uv.y*3.+2.)*.5+.5, sin(time+(uv.x+uv.y)*2.+4.)*.5+.5); color = mix(color, color*fC, flux*uIntensity*.5); } else { float p1=fbm(uv*4. + time*.3); float p2=fbm(uv*2. - time*.2); vec3 c1=vec3(0.2,0.6,1.0), c2=vec3(1.0,0.3,0.7), c3=vec3(0.9,0.9,0.1); color = mix(c1,c2,p1); color = mix(color,c3, p2*.5); float flowP=sin(uv.x*10.+time)*sin(uv.y*10.+time*1.3); color += flowP*0.2*uIntensity; } color += lightLeak(uv,time); color *= 0.8 + uIntensity*0.4; color += random(uv+time)*0.05; float lum=dot(color, vec3(0.2126,0.7152,0.0722)); float alpha=smoothstep(0.03,0.15,lum)*uGlobalOpacity; gl_FragColor = vec4(color, alpha); }`;
  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms:{ uTime:{value:0}, uIntensity:{value:intensity}, uSpeed:{value:speed}, uNoiseAmount:{value:noiseAmount}, uNoiseScale:{value:noiseScale}, uLightLeakIntensity:{value:lightLeakIntensity}, uLightLeakColor:{value:new THREE.Color(lightLeakColor)}, uFlowDirection:{value:flowDirection}, uPulseStrength:{value:pulseStrength}, uBPM:{value: (globalThis&&globalThis.VJ_BPM)||120 }, uVideoTexture:{value:videoTexture||null}, uHasVideo:{value: !!videoTexture}, uGlobalOpacity:{value:1.0} }, transparent:true, side:THREE.DoubleSide }), [intensity, speed, noiseAmount, noiseScale, lightLeakIntensity, lightLeakColor, flowDirection, pulseStrength, videoTexture]);
  useFrame((state)=>{ if (!materialRef.current) materialRef.current=shaderMaterial; if (!materialRef.current) return; materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; materialRef.current.uniforms.uBPM.value = (globalThis&&globalThis.VJ_BPM)||120; materialRef.current.uniforms.uIntensity.value=intensity; materialRef.current.uniforms.uSpeed.value=speed; materialRef.current.uniforms.uNoiseAmount.value=noiseAmount; materialRef.current.uniforms.uNoiseScale.value=noiseScale; materialRef.current.uniforms.uLightLeakIntensity.value=lightLeakIntensity; materialRef.current.uniforms.uLightLeakColor.value.set(lightLeakColor); materialRef.current.uniforms.uFlowDirection.value=flowDirection; materialRef.current.uniforms.uPulseStrength.value=pulseStrength; if (materialRef.current.uniforms.uHasVideo.value !== !!videoTexture) materialRef.current.uniforms.uHasVideo.value = !!videoTexture; if (videoTexture && materialRef.current.uniforms.uVideoTexture.value !== videoTexture) materialRef.current.uniforms.uVideoTexture.value = videoTexture; });
  return React.createElement('mesh',{ref:meshRef}, React.createElement('planeGeometry',{args:[16,9,128,72]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


