// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Binary',
  description: 'Renders input as matrix of binary symbols using GPU shader.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'characters', type: 'string', value: '01' },
    { name: 'fontSize', type: 'number', value: 54, min: 8, max: 100, step: 1 },
    { name: 'cellSize', type: 'number', value: 24, min: 4, max: 48, step: 1 },
    { name: 'color', type: 'color', value: '#00ff55' },
    { name: 'invert', type: 'boolean', value: false },
    { name: 'preserveColors', type: 'boolean', value: false },
  ],
};

export default function BinaryExternal({ videoTexture, characters='01', fontSize=54, cellSize=24, color='#00ff55', invert=false, opacity=1, preserveColors=false, isGlobal=false, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}
  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const effectiveChars = useMemo(() => (typeof characters==='string' && characters.length>0 ? characters : '01'), [characters]);

  const createCharactersTexture = (chars, fs) => {
    const canvas = document.createElement('canvas'); const SIZE=1024; const MAX_PER_ROW=16; const CELL=SIZE/MAX_PER_ROW; canvas.width=canvas.height=SIZE; const texture=new THREE.CanvasTexture(canvas, undefined, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestFilter); const ctx=canvas.getContext('2d'); if (!ctx) return texture; ctx.clearRect(0,0,SIZE,SIZE); ctx.font = `${fs}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff'; for (let i=0;i<chars.length;i++){ const x=i%MAX_PER_ROW; const y=Math.floor(i/MAX_PER_ROW); ctx.fillText(chars[i], x*CELL + CELL/2, y*CELL + CELL/2); } texture.needsUpdate=true; return texture; };

  const charsTexture = useMemo(() => createCharactersTexture(effectiveChars, fontSize), [effectiveChars, fontSize]);
  useEffect(() => () => { try { charsTexture && charsTexture.dispose && charsTexture.dispose(); } catch {} }, [charsTexture]);

  const normalizeColor = (input) => { try { if (typeof input==='string'){ if (input.startsWith('#')) return input; if (input.startsWith('rgb')){ const m=input.match(/rgba?\(([^)]+)\)/i); if(m){ const [r,g,b]=m[1].split(',').map((p)=>parseFloat(p.trim())); const hx=(n)=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0'); return `#${hx(r)}${hx(g)}${hx(b)}`; } } const c=new THREE.Color(input); return `#${c.getHexString()}`; } } catch {} return '#00ff55'; };

  const renderTarget = useMemo(() => { if (!isGlobal) return null; return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }, [isGlobal, effectiveW, effectiveH]);
  useEffect(() => () => { try { renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch {} }, [renderTarget]);

  const fragmentShader = `
    uniform sampler2D inputBuffer; uniform sampler2D uCharacters; uniform float uCharactersCount; uniform float uCellSize; uniform bool uInvert; uniform vec3 uColor; uniform float uOpacity; uniform float uPreserveColors; uniform vec2 resolution; varying vec2 vUv; const vec2 SIZE = vec2(16.);
    float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
    void main(){ vec2 uv=vUv; vec2 cell=resolution/uCellSize; vec2 grid=1.0/cell; vec2 pixelizedUV = grid * (0.5 + floor(uv / grid)); vec4 px = texture2D(inputBuffer, pixelizedUV); float lum=luma(px.rgb); if (uInvert) lum=1.0-lum; float idx=floor((uCharactersCount-1.0)*lum); vec2 pos=vec2(mod(idx,SIZE.x), floor(idx/SIZE.y)); vec2 offset=vec2(pos.x, -pos.y)/SIZE; vec2 charUV = mod(uv * (cell/SIZE), 1.0/SIZE) - vec2(0., 1.0/SIZE) + offset; vec4 symbol=texture2D(uCharacters, charUV); vec3 base=mix(uColor, px.rgb, uPreserveColors); symbol.rgb = base * symbol.r; symbol.a = px.a * uOpacity; gl_FragColor = symbol; }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      inputBuffer: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat)) },
      uCharacters: { value: charsTexture }, uCellSize: { value: cellSize }, uCharactersCount: { value: Math.max(1,effectiveChars.length) }, uColor: { value: new THREE.Color(normalizeColor(color)) }, uInvert: { value: invert }, uOpacity: { value: opacity }, uPreserveColors: { value: preserveColors ? 1 : 0 }, resolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
    }, vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [videoTexture, isGlobal, renderTarget, charsTexture, effectiveChars.length, cellSize, color, invert, opacity, preserveColors, effectiveW, effectiveH]);

  useEffect(() => { if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);
  useFrame(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uCellSize.value = cellSize;
    materialRef.current.uniforms.uCharactersCount.value = Math.max(1,effectiveChars.length);
    materialRef.current.uniforms.uColor.value.set(normalizeColor(color));
    materialRef.current.uniforms.uInvert.value = invert;
    materialRef.current.uniforms.uOpacity.value = opacity;
    materialRef.current.uniforms.uPreserveColors.value = preserveColors ? 1 : 0;
    if (isGlobal && renderTarget && gl && scene && camera) { const prev=gl.getRenderTarget(); const was=meshRef.current?meshRef.current.visible:undefined; if (meshRef.current) meshRef.current.visible=false; try { gl.setRenderTarget(renderTarget); gl.render(scene,camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && was!==undefined) meshRef.current.visible=was; } if (materialRef.current.uniforms.inputBuffer.value !== renderTarget.texture) materialRef.current.uniforms.inputBuffer.value = renderTarget.texture; } else if (!isGlobal && videoTexture) { if (materialRef.current.uniforms.inputBuffer.value !== videoTexture) materialRef.current.uniforms.inputBuffer.value = videoTexture; }
  });

  const aspect = useMemo(() => { try { if (size && size.width>0 && size.height>0) return size.width/size.height; } catch {} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);
  if (!shaderMaterial || !charsTexture) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: materialRef }));
}


