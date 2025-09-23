// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Super Advanced Glitch',
  description: 'Analog/digital/CRT glitches with BPM-aware timing.',
  category: 'Effects',
  author: 'AI',
  version: '1.0.0',
  replacesVideo: true,
  parameters: [
    { name: 'intensity', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.1 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'duration', type: 'number', value: 5.0, min: 1.0, max: 20.0, step: 0.5 },
    { name: 'amount', type: 'number', value: 0.5, min: 0.1, max: 1.0, step: 0.1 },
    { name: 'enableAnalog', type: 'boolean', value: true },
    { name: 'enableDigital', type: 'boolean', value: true },
    { name: 'enableCRT', type: 'boolean', value: false },
  ],
};

export default function AdvancedGlitchExternal({ intensity=1.0, speed=1.0, duration=5.0, amount=0.5, enableAnalog=true, enableDigital=true, enableCRT=false, videoTexture }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const meshRef = useRef(null); const materialRef = useRef(null);

  const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const fragmentShader = `
    uniform float iTime; uniform vec3 iResolution; uniform float iFrame; uniform float intensity; uniform float speed; uniform float duration; uniform float amount; uniform float enableAnalog; uniform float enableDigital; uniform float enableCRT; uniform float bpm; uniform sampler2D iChannel0; varying vec2 vUv;
    #define SS(a,b,x) (smoothstep(a,b,x) * smoothstep(b,a,x))
    #define UI0 1597334673U
    #define UI1 3812015801U
    #define UI3 uvec3(UI0, UI1, 2798796415U)
    #define UIF (1./float(0xffffffffU))
    vec3 hash33(vec3 p){ uvec3 q=uvec3(ivec3(p))*UI3; q=(q.x ^ q.y ^ q.z)*UI3; return -1. + 2. * vec3(q) * UIF; }
    float gnoise(vec3 x){ vec3 p=floor(x); vec3 w=fract(x); vec3 u=w*w*w*(w*(w*6.-15.)+10.); vec3 ga=hash33(p+vec3(0.,0.,0.)); vec3 gb=hash33(p+vec3(1.,0.,0.)); vec3 gc=hash33(p+vec3(0.,1.,0.)); vec3 gd=hash33(p+vec3(1.,1.,0.)); vec3 ge=hash33(p+vec3(0.,0.,1.)); vec3 gf=hash33(p+vec3(1.,0.,1.)); vec3 gg=hash33(p+vec3(0.,1.,1.)); vec3 gh=hash33(p+vec3(1.,1.,1.)); float va=dot(ga,w-vec3(0)); float vb=dot(gb,w-vec3(1,0,0)); float vc=dot(gc,w-vec3(0,1,0)); float vd=dot(gd,w-vec3(1,1,0)); float ve=dot(ge,w-vec3(0,0,1)); float vf=dot(gf,w-vec3(1,0,1)); float vg=dot(gg,w-vec3(0,1,1)); float vh=dot(gh,w-vec3(1,1,1)); float gn=va + u.x*(vb-va) + u.y*(vc-va) + u.z*(ve-va) + u.x*u.y*(va-vb-vc+vd) + u.y*u.z*(va-vc-ve+vg) + u.z*u.x*(va-vb-ve+vf) + u.x*u.y*u.z*(-va+vb+vc-vd+ve-vf-vg+vh); return 2.*gn; }
    float gnoise01(vec3 x){ return .5 + .5 * gnoise(x); }
    vec2 crt(vec2 uv){ float tht=atan(uv.y,uv.x); float r=length(uv); r/= (1.-.1*r*r); uv=vec2(r*cos(tht), r*sin(tht)); return .5*(uv+1.); }
    void main(){ vec2 uv=vUv; float t=iTime*speed; float glitchAmount = SS(duration*.001, duration*amount, mod(t,duration)); float displayNoise=0.; vec3 col=vec3(0.); vec2 eps=vec2(5./iResolution.x, 0.); vec2 st=vec2(0.);
      if (enableCRT>0.5){ uv = crt(uv*2.-1.); ++displayNoise; }
      float y = uv.y*iResolution.y; float distortion = gnoise(vec3(0., y*.01, t*500.))*(glitchAmount*4.+.1); distortion *= gnoise(vec3(0., y*.02, t*250.))*(glitchAmount*2.+.025);
      if (enableAnalog>0.5){ ++displayNoise; distortion += smoothstep(.999,1., sin((uv.y+t*1.6)*2.))*.02; distortion -= smoothstep(.999,1., sin((uv.y+t)*2.))*.02; st = uv + vec2(distortion,0.); col.r += texture2D(iChannel0, st+eps+distortion).r; col.g += texture2D(iChannel0, st).g; col.b += texture2D(iChannel0, st-eps-distortion).b; } else { col += texture2D(iChannel0, uv).xyz; }
      if (enableDigital>0.5){ float bt=floor(t*30.)*300.; float blockGlitch=.2+.9*glitchAmount; float bnx=step(gnoise01(vec3(0., uv.x*3., bt)), blockGlitch); float bnx2=step(gnoise01(vec3(0., uv.x*1.5, bt*1.2)), blockGlitch); float bny=step(gnoise01(vec3(0., uv.y*4., bt)), blockGlitch); float bny2=step(gnoise01(vec3(0., uv.y*6., bt*1.2)), blockGlitch); float block=bnx2*bny2 + bnx*bny; st=vec2(uv.x + sin(bt)*hash33(vec3(uv,.5)).x, uv.y); col *= 1.-block; block*=1.15; col.r += texture2D(iChannel0, st+eps).r * block; col.g += texture2D(iChannel0, st).g * block; col.b += texture2D(iChannel0, st-eps).b * block; }
      displayNoise = clamp(displayNoise,0.,1.); col += (.15+.65*glitchAmount) * (hash33(vec3(gl_FragCoord.xy, mod(iFrame,1000.))).r) * displayNoise; col -= (.25+.75*glitchAmount) * (sin(4.*t + uv.y*iResolution.y*1.75)) * displayNoise; if (enableCRT>0.5){ float vig = 8.0*uv.x*uv.y*(1.-uv.x)*(1.-uv.y); col *= vec3(pow(vig,.25))*1.5; if(uv.x<0.||uv.x>1.) col*=0.; }
      col *= intensity; gl_FragColor = vec4(col,1.0); }
  `;

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { iTime:{value:0}, iResolution:{value:new THREE.Vector3(1,1,1)}, iFrame:{value:0}, intensity:{value:intensity}, speed:{value:speed}, duration:{value:duration}, amount:{value:amount}, enableAnalog:{value: enableAnalog?1:0}, enableDigital:{value: enableDigital?1:0}, enableCRT:{value: enableCRT?1:0}, bpm:{value: 120}, iChannel0:{ value: videoTexture } }, vertexShader, fragmentShader, transparent:true, depthTest:false, depthWrite:false,
  }), [intensity, speed, duration, amount, enableAnalog, enableDigital, enableCRT, videoTexture]);

  useFrame((state) => {
    if (!materialRef.current) { materialRef.current = shaderMaterial; }
    if (!materialRef.current) return;
    materialRef.current.uniforms.iTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.iFrame.value = state.clock.elapsedTime * 60;
    materialRef.current.uniforms.bpm.value = (globalThis && globalThis.VJ_BPM) || 120;
    materialRef.current.uniforms.intensity.value = intensity;
    materialRef.current.uniforms.speed.value = speed;
    materialRef.current.uniforms.duration.value = duration;
    materialRef.current.uniforms.amount.value = amount;
    materialRef.current.uniforms.enableAnalog.value = enableAnalog?1:0;
    materialRef.current.uniforms.enableDigital.value = enableDigital?1:0;
    materialRef.current.uniforms.enableCRT.value = enableCRT?1:0;
    const w = state.gl?.domElement?.width || 1920; const h = state.gl?.domElement?.height || 1080; materialRef.current.uniforms.iResolution.value.set(w,h,1);
  });

  const aspect = 16/9;
  return React.createElement('mesh', { ref: meshRef }, React.createElement('planeGeometry', { args: [aspect*2, 2] }), React.createElement('primitive', { object: shaderMaterial, ref: materialRef }));
}


