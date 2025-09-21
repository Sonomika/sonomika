// White Tracker Dot (External). Tracks brightest/whitest area in input texture and renders a dot.
// Portable: relies on globals window.React, window.THREE, window.r3f. No imports.
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'White Tracker Dot (External)',
  description: 'Finds bright/white regions in the video texture and follows with a dot.',
  category: 'Tracking',
  author: 'VJ System',
  version: '1.0.0',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'threshold', type: 'number', min: 0.0, max: 1.0, step: 0.01, value: 0.9, description: 'Brightness threshold (0-1)' },
    { name: 'sensitivity', type: 'number', min: 0.1, max: 4.0, step: 0.1, value: 1.0, description: 'Contrast boost before detection' },
    { name: 'downscale', type: 'number', min: 8, max: 256, step: 1, value: 64, description: 'Downsample size for detection' },
    { name: 'dotSize', type: 'number', min: 0.01, max: 0.5, step: 0.01, value: 0.05, description: 'Dot size (relative plane height=2)' },
    { name: 'dotColor', type: 'color', value: '#ffffff', description: 'Dot color' },
    { name: 'trail', type: 'number', min: 0.0, max: 1.0, step: 0.01, value: 0.7, description: 'Smoothing (higher = more lag)' },
    { name: 'invert', type: 'boolean', value: false, description: 'Track darkest instead of brightest' },
    { name: 'showLine', type: 'boolean', value: true, description: 'Connect dots with a line trail' },
    { name: 'lineLength', type: 'number', min: 2, max: 1024, step: 1, value: 128, description: 'Trail length (points)' },
    { name: 'lineColor', type: 'color', value: '#ffffff', description: 'Line color' },
    { name: 'lineOpacity', type: 'number', min: 0.05, max: 1.0, step: 0.05, value: 0.8, description: 'Line opacity' },
  ],
};

export default function WhiteTrackerDotExternal({ threshold=0.9, sensitivity=1.0, downscale=64, dotSize=0.05, dotColor='#ffffff', trail=0.7, invert=false, showLine=true, lineLength=128, lineColor='#ffffff', lineOpacity=0.8, videoTexture, isGlobal=false, compositionWidth, compositionHeight }){
  if (!React || !THREE || !r3f) return null; const { useThree, useFrame } = r3f;

  const meshRef = useRef(null);
  const dotRef = useRef(null);
  const materialRef = useRef(null);
  const positionState = useRef({ x: 0, y: 0, initialized: false });
  const lineRef = useRef(null);
  const lineGeomRef = useRef(null);
  const lineMatRef = useRef(null);
  const linePositionsRef = useRef(null);
  const lineCountRef = useRef(0);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx) { gl=ctx.gl; scene=ctx.scene; camera=ctx.camera; size=ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  // Offscreen capture for global mode
  const captureTarget = useMemo(()=>{
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [isGlobal, effectiveW, effectiveH]);
  useEffect(()=>()=>{ try { captureTarget && captureTarget.dispose && captureTarget.dispose(); } catch {} }, [captureTarget]);

  // Downscale render target for CPU readback
  const analyzeSize = Math.max(8, Math.min(256, Math.floor(downscale||64)));
  const analyzeTarget = useMemo(()=>{
    return new THREE.WebGLRenderTarget(analyzeSize, analyzeSize, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [analyzeSize]);
  useEffect(()=>()=>{ try { analyzeTarget && analyzeTarget.dispose && analyzeTarget.dispose(); } catch {} }, [analyzeTarget]);

  // Fullscreen quad material to blit source into analyzeTarget
  const blitMaterial = useMemo(()=>{
    const vs = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
    const fs = `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uGain; void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb = clamp(c.rgb * uGain, 0.0, 1.0); gl_FragColor = c; }`;
    const mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { tDiffuse: { value: null }, uGain: { value: sensitivity } }, depthTest:false, depthWrite:false, transparent:false });
    return mat;
  }, [sensitivity]);

  const blitScene = useMemo(()=> new THREE.Scene(), []);
  const blitCamera = useMemo(()=> new THREE.OrthographicCamera(-1,1,1,-1,0,1), []);
  const blitQuad = useMemo(()=>{
    const geo = new THREE.PlaneGeometry(2,2);
    const mesh = new THREE.Mesh(geo, blitMaterial);
    blitScene.add(mesh);
    return mesh;
  }, [blitMaterial, blitScene]);
  useEffect(()=>()=>{ try{ blitQuad.geometry && blitQuad.geometry.dispose(); }catch{} }, [blitQuad]);

  // Visual dot material
  const dotMaterial = useMemo(()=> new THREE.MeshBasicMaterial({ color: new THREE.Color(dotColor), transparent:true, opacity:1.0, blending:THREE.AdditiveBlending, depthTest:false, depthWrite:false }), [dotColor]);

  // Line trail material and geometry
  const lineCapacity = Math.max(2, Math.min(1024, Math.floor(lineLength || 128)));
  const lineMaterial = useMemo(()=>{
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(lineColor), transparent:true, opacity: lineOpacity, blending:THREE.AdditiveBlending, depthTest:false, depthWrite:false });
    lineMatRef.current = mat; return mat;
  }, [lineColor, lineOpacity]);
  const lineGeometry = useMemo(()=>{
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(lineCapacity * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, 0);
    lineGeomRef.current = geom; linePositionsRef.current = positions; lineCountRef.current = 0;
    return geom;
  }, [lineCapacity]);
  useEffect(()=>()=>{ try { lineGeomRef.current && lineGeomRef.current.dispose && lineGeomRef.current.dispose(); } catch {} }, [lineGeometry]);

  // Plane to anchor UV-based positioning
  const aspect = useMemo(()=>{ try { if (size && size.width>0 && size.height>0) return size.width/size.height; } catch{} return effectiveW/effectiveH; }, [size, effectiveW, effectiveH]);

  // Utility to get the current source texture
  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    if (videoTexture) return videoTexture;
    return null;
  };

  // Analyze function (runs each frame or throttled)
  const pixelBufferRef = useRef(null);
  if (!pixelBufferRef.current) pixelBufferRef.current = new Uint8Array(analyzeSize*analyzeSize*4);

  useFrame(()=>{
    if (!gl) return;

    // For global mode, capture scene first
    if (isGlobal && captureTarget && scene && camera && meshRef.current) {
      const prevTarget = gl.getRenderTarget();
      const wasVisible = meshRef.current.visible; // hide our own mesh during capture
      meshRef.current.visible = false;
      try { gl.setRenderTarget(captureTarget); gl.render(scene, camera); }
      finally { gl.setRenderTarget(prevTarget); meshRef.current.visible = wasVisible; }
    }

    const src = getSourceTexture();
    if (!src) return;

    // Blit source into analyzeTarget at analyzeSize
    const prevAutoClear = gl.autoClear; gl.autoClear = false;
    const prev = gl.getRenderTarget();
    try {
      blitMaterial.uniforms.tDiffuse.value = src;
      blitMaterial.uniforms.uGain.value = sensitivity;
      gl.setRenderTarget(analyzeTarget);
      gl.clear(true, true, true);
      gl.render(blitScene, blitCamera);
    } finally { gl.setRenderTarget(prev); gl.autoClear = prevAutoClear; }

    // Read pixels to CPU
    try {
      gl.readRenderTargetPixels(analyzeTarget, 0, 0, analyzeSize, analyzeSize, pixelBufferRef.current);
    } catch {}

    // Find best pixel by brightness (or darkness if invert)
    const buf = pixelBufferRef.current; if (!buf) return;
    let bestIdx = -1; let bestScore = invert ? 1e9 : -1e9;
    for (let i=0;i<analyzeSize*analyzeSize;i++){
      const r = buf[i*4+0]/255; const g = buf[i*4+1]/255; const b = buf[i*4+2]/255;
      // Luma-like brightness
      const y = 0.2126*r + 0.7152*g + 0.0722*b;
      const score = invert ? (1.0 - y) : y;
      if ((!invert && score >= threshold && score > bestScore) || (invert && score >= (1.0-threshold) && score < bestScore)) {
        bestScore = score; bestIdx = i;
      }
    }

    // Compute UV and then map to plane space
    let targetX = 0, targetY = 0;
    if (bestIdx >= 0) {
      const px = bestIdx % analyzeSize; const py = Math.floor(bestIdx / analyzeSize);
      const u = (px + 0.5) / analyzeSize; const v = 1.0 - (py + 0.5) / analyzeSize; // flip Y
      // Plane spans [-aspect, aspect] in X and [-1,1] in Y (since plane height=2)
      targetX = (u - 0.5) * 2.0 * aspect;
      targetY = (v - 0.5) * 2.0;
    }

    // Smoothly follow
    const s = Math.max(0.0, Math.min(0.99, trail));
    if (!positionState.current.initialized){ positionState.current.x = targetX; positionState.current.y = targetY; positionState.current.initialized = true; }
    else { positionState.current.x = positionState.current.x * s + targetX * (1.0 - s); positionState.current.y = positionState.current.y * s + targetY * (1.0 - s); }

    if (dotRef.current) { dotRef.current.position.set(positionState.current.x, positionState.current.y, 0.1); }

    // Update line trail
    try {
      if (showLine && lineGeomRef.current && linePositionsRef.current) {
        const positions = linePositionsRef.current;
        let count = lineCountRef.current;
        const cap = lineCapacity;
        const px = positionState.current.x, py = positionState.current.y, pz = 0.09;
        if (count < cap) {
          positions[count*3+0] = px; positions[count*3+1] = py; positions[count*3+2] = pz; count += 1;
        } else {
          positions.set(positions.subarray(3), 0);
          positions[(cap-1)*3+0] = px; positions[(cap-1)*3+1] = py; positions[(cap-1)*3+2] = pz;
          count = cap;
        }
        lineCountRef.current = count;
        const attr = lineGeomRef.current.getAttribute('position');
        if (attr) { attr.needsUpdate = true; }
        lineGeomRef.current.setDrawRange(0, count);
      }
    } catch {}
  });

  // Build scene: a transparent plane (to anchor) and a small dot mesh
  const dotGeom = useMemo(()=> new THREE.CircleGeometry(Math.max(0.001, dotSize), 24), [dotSize]);
  useEffect(()=>()=>{ try{ dotGeom && dotGeom.dispose && dotGeom.dispose(); }catch{} }, [dotGeom]);

  return React.createElement(
    'group',
    { ref: meshRef },
    React.createElement('mesh', { visible:false }, React.createElement('planeGeometry', { args:[aspect*2, 2] }), React.createElement('meshBasicMaterial', { color:0x000000, transparent:true, opacity:0 })),
    React.createElement('mesh', { ref: dotRef, position:[0,0,0.1] }, React.createElement('primitive', { object: dotGeom, attach:'geometry' }), React.createElement('primitive', { object: dotMaterial, attach:'material', ref: materialRef })),
    React.createElement('line', { ref: lineRef, visible: !!showLine }, React.createElement('primitive', { object: lineGeometry, attach:'geometry' }), React.createElement('primitive', { object: lineMaterial, attach:'material' }))
  );
}


