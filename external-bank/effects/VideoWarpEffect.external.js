// Portable external Video Warp effect (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Video Warp (External)',
  description: 'Distorts input with wave patterns; BPM-ready if provided globally.',
  category: 'Video Effects',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: true,
  canBeGlobal: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
    { name: 'frequency', type: 'number', value: 3.0, min: 0.5, max: 10.0, step: 0.5 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'waveType', type: 'select', value: 'sine', options: [ { value:'sine', label:'Sine'}, { value:'cosine', label:'Cosine'}, { value:'tangent', label:'Tangent'} ] },
  ],
};

export default function VideoWarpEffectExternal({ intensity = 0.1, frequency = 3.0, speed = 1.0, waveType = 'sine', videoTexture, isGlobal = false, compositionWidth, compositionHeight }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const renderTarget = useMemo(() => {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }, [isGlobal, effectiveW, effectiveH]);

  const bufferTexture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64; const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#262626'; ctx.fillRect(0,0,64,64); ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 2; ctx.strokeRect(8,8,48,48); ctx.fillStyle = '#ffffff'; ctx.fillRect(16,16,32,32); }
    const tex = new THREE.CanvasTexture(canvas); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; return tex;
  }, []);

  const vertexShader = `
    varying vec2 vUv; uniform float time; uniform float intensity; uniform float frequency; uniform float speed; uniform float bpm; uniform int waveType;
    void main(){ vec2 localUv = uv; float waveX; float waveY; float beatTime = time * (bpm / 60.0); float waveTime = time * speed; if (waveType==0){ waveX = sin(localUv.x*frequency*3.14159 + waveTime) * sin(localUv.y*frequency*2.0 + waveTime*0.7) * intensity; waveY = cos(localUv.x*frequency*2.5 + waveTime*1.3) * sin(localUv.y*frequency*1.5 + waveTime*0.9) * intensity; } else if (waveType==1){ waveX = cos(localUv.x*frequency*2.0 + waveTime) * cos(localUv.y*frequency*1.8 + waveTime*0.5) * intensity; waveY = sin(localUv.x*frequency*2.2 + waveTime*1.1) * cos(localUv.y*frequency*1.3 + waveTime*0.8) * intensity; } else { waveX = sin(localUv.x*frequency*4.0 + waveTime) * cos(localUv.y*frequency*3.0 + waveTime*0.6) * intensity; waveY = cos(localUv.x*frequency*3.5 + waveTime*1.2) * sin(localUv.y*frequency*2.5 + waveTime*0.4) * intensity; } float bpmPulse = sin(beatTime * 6.283185307) * 0.3 + 0.7; waveX *= bpmPulse; waveY *= bpmPulse; vUv = localUv + vec2(waveX, waveY); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `;
  const fragmentShader = `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 }, intensity: { value: intensity }, frequency: { value: frequency }, speed: { value: speed }, bpm: { value: 120 }, waveType: { value: waveType === 'sine' ? 0 : waveType === 'cosine' ? 1 : 2 }, tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || bufferTexture) },
    }, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  }), [intensity, frequency, speed, waveType, isGlobal, renderTarget, videoTexture, bufferTexture]);

  useFrame((state) => {
    if (!shaderMaterial) return;
    if (shaderMaterial.uniforms) {
      shaderMaterial.uniforms.time.value = state.clock.elapsedTime;
      // If host provides bpm globally, allow override via window.VJ_BPM
      try { const bpm = (globalThis && globalThis.VJ_BPM) || shaderMaterial.uniforms.bpm.value; shaderMaterial.uniforms.bpm.value = bpm; } catch {}
      shaderMaterial.uniforms.intensity.value = intensity; shaderMaterial.uniforms.frequency.value = frequency; shaderMaterial.uniforms.speed.value = speed; shaderMaterial.uniforms.waveType.value = (waveType === 'sine' ? 0 : waveType === 'cosine' ? 1 : 2);
      if (isGlobal && renderTarget && gl && scene && camera) {
        const prev = gl.getRenderTarget(); const wasVisible = meshRef.current ? meshRef.current.visible : undefined; if (meshRef.current) meshRef.current.visible = false; try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && wasVisible!==undefined) meshRef.current.visible = wasVisible; }
        if (shaderMaterial.uniforms.tDiffuse.value !== renderTarget.texture) shaderMaterial.uniforms.tDiffuse.value = renderTarget.texture;
      } else if (!isGlobal && videoTexture) {
        if (shaderMaterial.uniforms.tDiffuse.value !== videoTexture) shaderMaterial.uniforms.tDiffuse.value = videoTexture;
      }
    }
  });

  const aspect = useMemo(() => { try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {} return (compositionWidth || 1920) / (compositionHeight || 1080); }, [size, compositionWidth, compositionHeight]);
  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect * 2, 2] }), React.createElement('primitive', { object: shaderMaterial, attach: 'material', ref: (n) => { materialRef.current = n; } }));
}


