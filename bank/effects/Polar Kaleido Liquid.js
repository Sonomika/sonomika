// Sonomika template: `Polar Kaleido Liquid` — auto-wrapped from internal component
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useMemo, useRef, useState, useEffect } = React || {};

export const metadata = {
  name: `Polar Kaleido Liquid`, description: `A kaleidoscopic, liquid-style refraction + chromatic blur with animated ripples.`, category: 'Effects', author: 'VJ', version: '1.0.0', isSource: false,
  parameters: [
    { name: 'segments', type: 'number', value: 6.0, min: 2, max: 16, step: 0.1, description: 'Number of kaleidoscope segments' },
    { name: 'baseAngle', type: 'number', value: 0.0, min: 0, max: 6.283, step: 0.01, description: 'Base rotation angle' },
    { name: 'scale', type: 'number', value: 1.3, min: 0.1, max: 5.0, step: 0.1, description: 'Scale factor' },
    { name: 'rippleStrength', type: 'number', value: 0.12, min: 0, max: 1.0, step: 0.01, description: 'Strength of liquid ripples' },
    { name: 'blur', type: 'number', value: 0.012, min: 0, max: 0.1, step: 0.001, description: 'Blur amount' },
    { name: 'chroma', type: 'number', value: 0.008, min: 0, max: 0.05, step: 0.001, description: 'Chromatic aberration' },
    { name: 'speed', type: 'number', value: 0.9, min: 0, max: 3.0, step: 0.1, description: 'Animation speed' },
    { name: 'edgeGlow', type: 'number', value: 0.15, min: 0, max: 1.0, step: 0.01, description: 'Edge glow intensity' },
    { name: 'mixOriginal', type: 'number', value: 0.0, min: 0, max: 1.0, step: 0.01, description: 'Mix with original texture' },
  ],
};

export default function PolarKaleidoLiquid({
  videoTexture, isGlobal=false,
  segments=6.0, baseAngle=0.0, scale=1.3, rippleStrength=0.12, blur=0.012,
  chroma=0.008, speed=0.9, edgeGlow=0.15, mixOriginal=0.0,
  compositionWidth, compositionHeight
}){
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  let gl, scene, camera, size;
  try { const ctx = useThree(); if (ctx){ gl = ctx.gl; scene = ctx.scene; camera = ctx.camera; size = ctx.size; } } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const renderTarget = useMemo(()=> {
    if (!isGlobal) return null;
    return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
    });
  }, [isGlobal, effectiveW, effectiveH]);

  useEffect(()=> () => { try{ renderTarget && renderTarget.dispose && renderTarget.dispose(); } catch{} }, [renderTarget]);

  const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

  const fragmentShader = `precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float time;
  uniform float segments;
  uniform float baseAngle;
  uniform float scale;
  uniform float rippleStrength;
  uniform float blur;
  uniform float chroma;
  uniform float speed;
  uniform float edgeGlow;
  uniform float mixOriginal;
  varying vec2 vUv;

  #define PI 3.141592653589793

  // simple hash + noise
  float hash11(float n){ return fract(sin(n)*43758.5453123); }
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }

  // polar kaleidoscope folding
  vec2 polarFold(vec2 uv, float segs, float ang, float t, out float radius){
    // center and aspect correction
    vec2 centered = uv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    centered.x *= aspect;

    float r = length(centered);
    float theta = atan(centered.y, centered.x);

    float a = 2.0 * PI / max(1.0, segs);
    // animated base rotation
    theta += ang + t * speed * 0.25;

    // fold into one wedge
    theta = mod(theta, a);
    // fold symmetrically to create mirror kaleido
    theta = abs(theta - a * 0.5);

    // add ripple distortion that depends on theta and r (gives liquid waves)
    float wave = sin((theta * 3.0 + t * speed) * (1.0 + scale*0.6)) * 0.5 + 0.5;
    float rr = r + (sin((r * scale * 10.0) - t * speed * 1.4 + theta * 2.0) * rippleStrength * wave * (1.0 - smoothstep(0.4, 0.95, r)));

    // subtle jitter noise to avoid perfectly symmetrical seam
    float n = (hash21(floor(uv * uResolution.xy) + t*0.1) - 0.5) * 0.002;
    rr += n;

    // reconstruct
    vec2 p = vec2(cos(theta), sin(theta)) * rr;
    p.x /= aspect;
    p += 0.5;
    radius = rr;
    return p;
  }

  // small circular blur kernel (5 samples) – cheap approximation
  vec3 sampleBlur(sampler2D tex, vec2 uv, float strength){
    vec2 px = 1.0 / uResolution;
    vec3 col = texture2D(tex, uv).rgb * 0.4;
    col += texture2D(tex, uv + vec2(px.x,0.0)*strength).rgb * 0.15;
    col += texture2D(tex, uv - vec2(px.x,0.0)*strength).rgb * 0.15;
    col += texture2D(tex, uv + vec2(0.0,px.y)*strength).rgb * 0.15;
    col += texture2D(tex, uv - vec2(0.0,px.y)*strength).rgb * 0.15;
    return col;
  }

  void main(){
    vec2 uv = vUv;
    float r;
    vec2 p = polarFold(uv, segments, baseAngle, time, r);

    // chromatic offsets along gradient from center to sample point
    vec2 dir = normalize((p - uv) + 1e-6);
    // sample three channels with small offsets and blur
    float b = clamp(blur * 0.5, 0.0, 0.05);
    vec3 colR = sampleBlur(tDiffuse, p + dir * chroma, 1.0 - b);
    vec3 colG = sampleBlur(tDiffuse, p, 1.0 - b);
    vec3 colB = sampleBlur(tDiffuse, p - dir * chroma, 1.0 - b);
    vec3 col = vec3(colR.r, colG.g, colB.b);

    // add subtle sheen/glass edge around wedge seams using radius and mirrored seam noise
    float seam = smoothstep(0.0, 0.08, 0.06 - abs(fract((atan((uv.y-0.5)* (uResolution.y/uResolution.x), uv.x-0.5) + baseAngle + time*0.2) / (2.0*PI/segments)) - 0.5));
    float glow = seam * edgeGlow * (1.0 - smoothstep(0.2, 0.8, r));
    col += glow;

    // vignette by radius to keep focus
    float vign = smoothstep(0.95, 0.45, r);
    col *= vign;

    // mixing original texture to allow subtlety control
    vec3 orig = texture2D(tDiffuse, uv).rgb;
    col = mix(col, orig, clamp(mixOriginal, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }`;

  const shaderMaterial = useMemo(()=> new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: (isGlobal && renderTarget) ? renderTarget.texture : (videoTexture || null) },
      uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },
      time: { value: 0 },
      segments: { value: segments },
      baseAngle: { value: baseAngle },
      scale: { value: scale },
      rippleStrength: { value: rippleStrength },
      blur: { value: blur },
      chroma: { value: chroma },
      speed: { value: speed },
      edgeGlow: { value: edgeGlow },
      mixOriginal: { value: mixOriginal }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false
  }), [videoTexture, isGlobal, renderTarget, effectiveW, effectiveH, segments, baseAngle, scale, rippleStrength, blur, chroma, speed, edgeGlow, mixOriginal]);

  useEffect(()=>{ if (shaderMaterial) materialRef.current = shaderMaterial; }, [shaderMaterial]);

  useFrame((state)=> {
    if (!materialRef.current) return;
    materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uResolution.value.set(Math.max(1,(size&&size.width)||effectiveW), Math.max(1,(size&&size.height)||effectiveH));
    materialRef.current.uniforms.segments.value = segments;
    materialRef.current.uniforms.baseAngle.value = baseAngle;
    materialRef.current.uniforms.scale.value = scale;
    materialRef.current.uniforms.rippleStrength.value = rippleStrength;
    materialRef.current.uniforms.blur.value = blur;
    materialRef.current.uniforms.chroma.value = chroma;
    materialRef.current.uniforms.speed.value = speed;
    materialRef.current.uniforms.edgeGlow.value = edgeGlow;
    materialRef.current.uniforms.mixOriginal.value = mixOriginal;

    if (isGlobal && renderTarget && gl && scene && camera){
      const prev = gl.getRenderTarget();
      const was = meshRef.current ? meshRef.current.visible : undefined;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(renderTarget); gl.render(scene, camera); } finally {
        gl.setRenderTarget(prev);
        if (meshRef.current && was !== undefined) meshRef.current.visible = was;
      }
      if (materialRef.current.uniforms.tDiffuse.value !== renderTarget.texture) materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    } else if (!isGlobal && videoTexture){
      if (materialRef.current.uniforms.tDiffuse.value !== videoTexture) materialRef.current.uniforms.tDiffuse.value = videoTexture;
    }
  });

  const aspect = useMemo(()=> {
    try { if (size && size.width > 0 && size.height > 0) return size.width / size.height; } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  if (!shaderMaterial) return null;
  return React.createElement('mesh', { ref: meshRef },
    React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
    React.createElement('primitive', { object: shaderMaterial, ref: materialRef })
  );
}
