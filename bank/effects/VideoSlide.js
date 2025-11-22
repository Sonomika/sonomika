// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect, useState } = React || {};

export const metadata = {
  name: 'Video Slide',
  description: 'Slides/pans input with multiple motion patterns and BPM sync.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  parameters: [
    { name: 'slideSpeed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'slideDirection', type: 'select', value: 'horizontal', options: ['horizontal','vertical','diagonal','circular','bpm-horizontal','bpm-vertical'] },
    { name: 'slideAmount', type: 'number', value: 0.5, min: 0.1, max: 2.0, step: 0.1 },
  ],
};

export default function VideoSlide({ slideSpeed = 1.0, slideDirection = 'horizontal', slideAmount = 0.5, videoTexture, bpm = 120 }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const materialRef = useRef(null);
  const meshRef = useRef(null);
  const [aspect, setAspect] = useState(16/9);

  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64; const ctx = canvas.getContext('2d'); if (ctx){ ctx.fillStyle='#262626'; ctx.fillRect(0,0,64,64); ctx.strokeStyle='#aaaaaa'; ctx.lineWidth=2; ctx.strokeRect(8,8,48,48); ctx.fillStyle='#ffffff'; ctx.fillRect(16,16,32,32); } const tex=new THREE.CanvasTexture(canvas); tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter; return tex;
  }, []);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform float time; uniform float slideSpeed; uniform float slideAmount; uniform int slideDirection; uniform float bpm; uniform int inputIsSRGB; varying vec2 vUv;
    vec2 slideUV(vec2 uv,float t,float speed,float amount,int dir){ vec2 o=vec2(0.0); if(dir==0){ o.x=sin(t*speed)*amount; } else if(dir==1){ o.y=cos(t*speed)*amount; } else if(dir==2){ o.x=sin(t*speed)*amount; o.y=cos(t*speed*0.7)*amount; } else if(dir==3){ float a=t*speed; o.x=sin(a)*amount; o.y=cos(a)*amount; } else if(dir==4){ float bt=(bpm/60.0)*t; o.x=sin(bt*6.283185307)*amount; } else if(dir==5){ float bt=(bpm/60.0)*t; o.y=cos(bt*6.283185307)*amount; } return uv + o; }
    void main(){ vec2 slid = slideUV(vUv, time, slideSpeed, slideAmount, slideDirection); slid = fract(slid); vec4 tex = texture2D(tDiffuse, slid); if (inputIsSRGB==1){ tex.rgb = pow(tex.rgb, vec3(2.2)); } gl_FragColor = tex; }
  `;

  const initialTexture = (videoTexture) || bufferTexture;
  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: initialTexture }, time: { value: 0 }, slideSpeed: { value: slideSpeed }, slideAmount: { value: slideAmount }, slideDirection: { value: 0 }, bpm: { value: bpm }, inputIsSRGB: { value: 1 } }, vertexShader, fragmentShader, transparent: false, toneMapped: false,
  }), [initialTexture]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useEffect(() => { if (!materialRef.current) return; const next = (videoTexture || bufferTexture); if (materialRef.current.uniforms.tDiffuse.value !== next) materialRef.current.uniforms.tDiffuse.value = next; const isSRGB = !!((next && (next.isVideoTexture || next.isCanvasTexture))); materialRef.current.uniforms.inputIsSRGB.value = isSRGB ? 1 : 0; }, [videoTexture, bufferTexture]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    materialRef.current.uniforms.bpm.value = bpm;
    const dir = slideDirection==='horizontal'?0: slideDirection==='vertical'?1: slideDirection==='diagonal'?2: slideDirection==='circular'?3: slideDirection==='bpm-horizontal'?4:5;
    if (materialRef.current.uniforms.slideDirection.value !== dir) materialRef.current.uniforms.slideDirection.value = dir;
    if (materialRef.current.uniforms.slideSpeed.value !== slideSpeed) materialRef.current.uniforms.slideSpeed.value = slideSpeed;
    if (materialRef.current.uniforms.slideAmount.value !== slideAmount) materialRef.current.uniforms.slideAmount.value = slideAmount;

    const tex = videoTexture || bufferTexture; const img = tex && tex.image; if (img && img.videoWidth && img.videoHeight && img.videoWidth>0 && img.videoHeight>0){ const next = img.videoWidth/img.videoHeight; if (Math.abs(next - aspect) > 0.001) setAspect(next); }
  });

  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, ref: materialRef }));
}


