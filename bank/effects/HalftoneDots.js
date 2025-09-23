// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Halftone Dots',
  description: 'Rotated halftone dot grid with color/invert/options; layer or global.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'cellSize', type: 'number', value: 18, min: 4, max: 64, step: 1 },
    { name: 'angle', type: 'number', value: 0, min: 0, max: 360, step: 1 },
    { name: 'dotScale', type: 'number', value: 1, min: 0.1, max: 1.5, step: 0.05 },
    { name: 'softness', type: 'number', value: 0.035, min: 0.0, max: 0.2, step: 0.005 },
    { name: 'shape', type: 'number', value: 0, min: 0, max: 1, step: 0.01 },
    { name: 'color', type: 'color', value: '#ffffff' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'preserveColors', type: 'boolean', value: false },
    { name: 'opacity', type: 'number', value: 1, min: 0, max: 1, step: 0.01 },
  ],
};

export default function HalftoneDotsExternal({ videoTexture, cellSize=18, angle=0, dotScale=1, softness=0.035, shape=0, color='#ffffff', invert=false, opacity=1, preserveColors=false, isGlobal=false, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}
  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const renderTarget = useMemo(() => { if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const normalizeColor = (input) => { try { if (typeof input==='string'){ if (input.startsWith('#')) return input; if (input.startsWith('rgb')){ const m=input.match(/rgba?\(([^)]+)\)/i); if(m){ const [r,g,b]=m[1].split(',').map((p)=>parseFloat(p.trim())); const hx=(n)=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0'); return `#${hx(r)}${hx(g)}${hx(b)}`; } } const c=new THREE.Color(input); return `#${c.getHexString()}`; } } catch {} return '#ffffff'; };

  const fragmentShader = `
    uniform sampler2D inputBuffer; uniform vec2 resolution; uniform vec3 uColor; uniform float uOpacity; uniform float uPreserveColors; uniform bool uInvert; uniform float uCellSize; uniform float uAngle; uniform float uDotScale; uniform float uSoftness; uniform float uShape; varying vec2 vUv; float luminance(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); } void main(){ vec2 uv=vUv-0.5; float ca=cos(uAngle), sa=sin(uAngle); uv=mat2(ca,-sa,sa,ca)*uv + 0.5; vec2 cell=resolution/uCellSize; vec2 grid=1.0/cell; vec2 cellIndex=floor(uv/grid); vec2 center=grid*(cellIndex+0.5); vec4 sampleColor=texture2D(inputBuffer, center); float lum=luminance(sampleColor.rgb); if(uInvert) lum=1.0-lum; float r=0.5*uDotScale*(1.0-lum); vec2 local=(uv-center)/grid; float dCircle=length(local); float dSquare=max(abs(local.x),abs(local.y)); float circle=1.0 - smoothstep(r-uSoftness, r+uSoftness, dCircle); float square=1.0 - smoothstep(r-uSoftness, r+uSoftness, dSquare); float mask=mix(circle, square, clamp(uShape,0.0,1.0)); vec3 base=mix(uColor, sampleColor.rgb, uPreserveColors); vec3 outC=base*mask; gl_FragColor=vec4(outC, sampleColor.a * uOpacity); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      inputBuffer: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat)) },
      resolution: { value: new THREE.Vector2(effectiveW, effectiveH) }, uColor: { value: new THREE.Color(normalizeColor(color)) }, uOpacity: { value: opacity }, uPreserveColors: { value: preserveColors ? 1 : 0 }, uInvert: { value: invert }, uCellSize: { value: cellSize }, uAngle: { value: (angle*Math.PI)/180 }, uDotScale: { value: dotScale }, uSoftness: { value: softness }, uShape: { value: shape },
    }, vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, color, opacity, preserveColors, invert, cellSize, angle, dotScale, softness, shape]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uCellSize.value = cellSize;
    materialRef.current.uniforms.uOpacity.value = opacity;
    materialRef.current.uniforms.uPreserveColors.value = preserveColors ? 1 : 0;
    materialRef.current.uniforms.uInvert.value = invert;
    materialRef.current.uniforms.uAngle.value = (angle*Math.PI)/180;
    materialRef.current.uniforms.uDotScale.value = dotScale;
    materialRef.current.uniforms.uSoftness.value = softness;
    materialRef.current.uniforms.uShape.value = shape;
    const w=(size&&size.width)||effectiveW; const h=(size&&size.height)||effectiveH; materialRef.current.uniforms.resolution.value.set(Math.max(1,w), Math.max(1,h));
    if (isGlobal && renderTarget && gl && scene && camera) { const prev=gl.getRenderTarget(); const was=meshRef.current?meshRef.current.visible:undefined; if (meshRef.current) meshRef.current.visible=false; try { gl.setRenderTarget(renderTarget); gl.render(scene,camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && was!==undefined) meshRef.current.visible=was; } if (materialRef.current.uniforms.inputBuffer.value !== renderTarget.texture) materialRef.current.uniforms.inputBuffer.value = renderTarget.texture; } else if (!isGlobal && videoTexture) { if (materialRef.current.uniforms.inputBuffer.value !== videoTexture) materialRef.current.uniforms.inputBuffer.value = videoTexture; }
  });

  const aspect = useMemo(() => { try { if (size && size.width>0 && size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}


