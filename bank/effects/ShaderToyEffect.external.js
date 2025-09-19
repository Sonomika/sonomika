// Portable external ShaderToy Effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'ShaderToy Effect (External)', description: 'Generic ShaderToy-like runner with basic uniforms.', category: 'ShaderToy', author: 'VJ System', version: '1.0.0', replacesVideo: false,
  parameters: [ { name: 'shaderCode', type: 'text', value: '' }, { name: 'intensity', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.1 }, { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 }, { name: 'color1', type: 'color', value: '#ff0000' }, { name: 'color2', type: 'color', value: '#00ff00' }, { name: 'color3', type: 'color', value: '#0000ff' }, { name: 'color4', type: 'color', value: '#ffffff' } ],
};

export default function ShaderToyExternal({ shaderCode='', intensity=1.0, speed=1.0, color1='#ff0000', color2='#00ff00', color3='#0000ff', color4='#ffffff' }){
  if (!React || !THREE || !r3f) return null; const { useFrame } = r3f; const meshRef=useRef(null); const materialRef=useRef(null);
  const defaultCode = `void mainImage(out vec4 fragColor, in vec2 fragCoord){ vec2 uv=fragCoord/iResolution.xy; vec3 col=0.5+0.5*cos(iTime+uv.xyx+vec3(0,2,4)); fragColor=vec4(col,1.0);} `;
  function buildShader(code){ return new THREE.ShaderMaterial({ vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader:`precision highp float; varying vec2 vUv; uniform float iTime; uniform vec3 iResolution; uniform vec3 color1; uniform vec3 color2; uniform vec3 color3; uniform vec3 color4; uniform float intensity; ${code||defaultCode} void main(){ vec4 c; mainImage(c, vUv * iResolution.xy); c.rgb *= intensity; gl_FragColor=c; }`, uniforms:{ iTime:{value:0}, iResolution:{value:new THREE.Vector3(1920,1080,1)}, color1:{value:new THREE.Color(color1)}, color2:{value:new THREE.Color(color2)}, color3:{value:new THREE.Color(color3)}, color4:{value:new THREE.Color(color4)}, intensity:{value:intensity} }, transparent:true }); }
  const shaderMaterial = useMemo(()=> buildShader(shaderCode), [shaderCode, color1, color2, color3, color4, intensity]);
  useFrame((state)=>{ if (!materialRef.current) materialRef.current=shaderMaterial; if (!materialRef.current) return; materialRef.current.uniforms.iTime.value = state.clock.elapsedTime*speed; const w= state.gl?.domElement?.width||1920, h= state.gl?.domElement?.height||1080; materialRef.current.uniforms.iResolution.value.set(w,h,1); materialRef.current.uniforms.intensity.value=intensity; materialRef.current.uniforms.color1.value.set(color1); materialRef.current.uniforms.color2.value.set(color2); materialRef.current.uniforms.color3.value.set(color3); materialRef.current.uniforms.color4.value.set(color4); });
  const aspect=16/9; return React.createElement('mesh',{ref:meshRef, position:[0,0,0]}, React.createElement('planeGeometry',{args:[aspect*2,2]}), React.createElement('primitive',{object:shaderMaterial, ref:materialRef}));
}


