// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Video Slice Offset',
  description: 'Slices input into strips and offsets them for glitch-like motion.',
  category: 'Effects',
  icon: '',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'sliceCount', type: 'number', value: 41, min: 2, max: 50, step: 1 },
    { name: 'offsetAmount', type: 'number', value: 0.48, min: 0.01, max: 0.5, step: 0.01 },
    { name: 'sliceWidth', type: 'number', value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'sliceDirection', type: 'select', value: 'horizontal', options: [
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Vertical' }
    ]},
    { name: 'removeGaps', type: 'boolean', value: true },
    { name: 'bpm', type: 'number', value: 120, min: 30, max: 240, step: 1 },
  ],
};

export default function VideoSliceOffset({
  sliceCount = 41,
  offsetAmount = 0.48,
  sliceWidth = 0.05,
  animationSpeed = 1.0,
  sliceDirection = 'horizontal',
  removeGaps = true,
  videoTexture,
  bpm = 120,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#262626';
      ctx.fillRect(0,0,64,64);
      ctx.strokeStyle = '#aaaaaa';
      ctx.lineWidth = 2; ctx.strokeRect(8,8,48,48);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(16,16,32,32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const vertexShader = `
    varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `;
  const fragmentShader = `
    uniform sampler2D tDiffuse; uniform float time; uniform float sliceCount; uniform float offsetAmount; uniform float sliceWidth; uniform float animationSpeed; uniform int sliceDirection; uniform float bpm; uniform int inputIsSRGB; uniform float removeGaps; varying vec2 vUv;
    vec2 sliceOffset(vec2 uv,float t,float count,float offset,float width,float speed,int dir){ vec2 o=uv; if(dir==0){ float idx=floor(uv.y*count); float shift=sin(t*speed+idx*0.5)*offset; o.x=fract(uv.x+shift); } else { float idx=floor(uv.x*count); float shift=cos(t*speed+idx*0.3)*offset; o.y=fract(uv.y+shift); } return o; }
    void main(){
      vec2 uv = sliceOffset(vUv, time, sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection);
      float mask=0.0; if(sliceDirection==0){ float y=fract(vUv.y*sliceCount); mask=step(sliceWidth,y)*step(y,1.0-sliceWidth);} else { float x=fract(vUv.x*sliceCount); mask=step(sliceWidth,x)*step(x,1.0-sliceWidth);} 
      vec4 texColor = texture2D(tDiffuse, uv);
      if(inputIsSRGB==1){ texColor.rgb = pow(texColor.rgb, vec3(2.2)); }
      vec4 outColor = (removeGaps>0.5)? texColor : ((mask>0.0)? texColor : vec4(0.0,0.0,0.0,1.0));
      outColor.a = 1.0; gl_FragColor = outColor;
    }
  `;

  const shaderMaterial = useMemo(() => {
    const inputTexture = (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || bufferTexture);
    return new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        tDiffuse: { value: inputTexture }, time: { value: 0.0 },
        sliceCount: { value: sliceCount }, offsetAmount: { value: offsetAmount }, sliceWidth: { value: sliceWidth }, animationSpeed: { value: animationSpeed },
        sliceDirection: { value: sliceDirection === 'horizontal' ? 0 : 1 }, removeGaps: { value: removeGaps ? 1.0 : 0.0 }, bpm: { value: bpm }, inputIsSRGB: { value: 1 },
      },
      transparent: false, depthTest: false, depthWrite: false, toneMapped: false,
    });
  }, [videoTexture, bufferTexture, isGlobal, renderTarget, sliceCount, offsetAmount, sliceWidth, animationSpeed, sliceDirection, removeGaps, bpm]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    // Keep params synced
    materialRef.current.uniforms.sliceCount.value = sliceCount;
    materialRef.current.uniforms.offsetAmount.value = offsetAmount;
    materialRef.current.uniforms.sliceWidth.value = sliceWidth;
    materialRef.current.uniforms.animationSpeed.value = animationSpeed;
    materialRef.current.uniforms.sliceDirection.value = sliceDirection === 'horizontal' ? 0 : 1;
    materialRef.current.uniforms.removeGaps.value = removeGaps ? 1.0 : 0.0;
    materialRef.current.uniforms.bpm.value = bpm;

    if (isGlobal && renderTarget && gl && scene && camera) {
      const prev = gl.getRenderTarget();
      const wasVisible = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible; }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) {
        materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
      }
    } else {
      const nextTex = (videoTexture || bufferTexture);
      if (materialRef.current.uniforms.tDiffuse.value !== nextTex) {
        materialRef.current.uniforms.tDiffuse.value = nextTex;
      }
      const isSRGB = !!((nextTex && (nextTex.isVideoTexture || nextTex.isCanvasTexture)));
      materialRef.current.uniforms.inputIsSRGB.value = isSRGB ? 1 : 0;
    }
  });

  const aspect = useMemo(() => {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef })
  );
}


