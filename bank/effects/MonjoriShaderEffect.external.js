// Portable external Monjori Shader effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Monjori Shader (External)', description: 'Monjori-style shader with BPM sync and color modes.', category: 'Shader', author: 'VJ System', version: '1.0.0', replacesVideo: false,
  parameters: [
    { name: 'speed', type: 'number', value: 40.0, min: 10.0, max: 100.0, step: 1.0 },
    { name: 'intensity', type: 'number', value: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: 'scale', type: 'number', value: 1.0, min: 0.5, max: 3.0, step: 0.1 },
    { name: 'bpmSync', type: 'boolean', value: false },
    { name: 'colorMode', type: 'select', value: 'original', options: ['original','rgb','monochrome'] },
  ],
};

export default function MonjoriShaderExternal({ speed=40.0, intensity=1.0, scale=1.0, bpmSync=false, colorMode='original' }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`;
  const fragmentShader = `varying vec2 vUv; uniform float time; uniform float speed; uniform float intensity; uniform float scale; uniform float bpm; uniform float bpmSync; uniform int colorMode; void main(){ vec2 p = -1.0 + 2.0 * vUv; p *= scale; float t = time; if (bpmSync>0.5) t = time * (bpm/60.0); float a = t * speed; float dist = length(p); float angle = atan(p.y,p.x); float wave = sin(dist*10.0 - a*2.0)*0.5+0.5; wave += sin(angle*8.0 + a*1.5)*0.3; wave += sin(p.x*20.0 + a*3.0)*0.2; wave += sin(p.y*15.0 + a*2.5)*0.2; vec3 color; if (colorMode==0){ color = vec3( sin(wave + a*0.5)*0.5+0.5, sin(wave + a*0.7 + 2.094)*0.5+0.5, sin(wave + a*0.9 + 4.188)*0.5+0.5 ); } else if (colorMode==1){ float rt=t*2.0; color = vec3( sin(rt)*0.5+0.5, sin(rt+2.094)*0.5+0.5, sin(rt+4.188)*0.5+0.5 ) * wave; } else { color = vec3(wave); } color *= intensity; gl_FragColor = vec4(color,1.0); }`;
  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({ uniforms:{ time:{value:0}, speed:{value:speed}, intensity:{value:intensity}, scale:{value:scale}, bpm:{value:(globalThis&&globalThis.VJ_BPM)||120}, bpmSync:{value: bpmSync?1.0:0.0}, colorMode:{value: colorMode==='original'?0:colorMode==='rgb'?1:2} }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false }), [speed,intensity,scale,bpmSync,colorMode]);
  useFrame((state)=>{ if (!materialRef.current) materialRef.current=shaderMaterial; if (!materialRef.current) return; materialRef.current.uniforms.time.value = state.clock.elapsedTime; materialRef.current.uniforms.bpm.value = (globalThis&&globalThis.VJ_BPM)||120; materialRef.current.uniforms.speed.value=speed; materialRef.current.uniforms.intensity.value=intensity; materialRef.current.uniforms.scale.value=scale; materialRef.current.uniforms.bpmSync.value=bpmSync?1.0:0.0; materialRef.current.uniforms.colorMode.value = (colorMode==='original'?0:colorMode==='rgb'?1:2); });
  return React.createElement('mesh',{ref:meshRef, position:[0,0,0]}, React.createElement('planeGeometry',{args:[2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


