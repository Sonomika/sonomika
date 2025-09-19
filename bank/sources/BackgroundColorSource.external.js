// Portable external Background Color Source (no imports). Uses globals: window.React, window.THREE, window.r3f
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useEffect } = React || {};

export const metadata = {
  name: 'Background Color Source (External)',
  description: 'Solid color and gradients with optional animation.',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'color', type: 'color', value: '#000000' },
    { name: 'gradientType', type: 'select', value: 'solid', options: ['solid','linear','radial','conic'] },
    { name: 'gradientColors', type: 'colorArray', value: ['#ff0000','#00ff00','#0000ff'] },
    { name: 'gradientStops', type: 'numberArray', value: [0,0.5,1] },
    { name: 'gradientDirection', type: 'select', value: 'horizontal', options: ['horizontal','vertical','diagonal'] },
    { name: 'gradientCenter', type: 'vector2', value: [0.5, 0.5] },
    { name: 'gradientRadius', type: 'number', value: 1.0, min: 0.1, max: 2.0, step: 0.1 },
    { name: 'animate', type: 'boolean', value: false },
    { name: 'animationSpeed', type: 'number', value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
    { name: 'animationType', type: 'select', value: 'pulse', options: ['pulse','rotate','flow'] },
  ],
};

export default function BackgroundColorSourceExternal({
  color = '#000000', gradientType = 'solid', gradientColors = ['#ff0000', '#00ff00', '#0000ff'], gradientStops = [0,0.5,1], gradientDirection = 'horizontal', gradientCenter = [0.5,0.5], gradientRadius = 1.0, animate = false, animationSpeed = 1.0, animationType = 'pulse'
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const materialRef = useRef(null);

  const vertexShader = `
    varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `;
  const fragmentShader = `
    uniform float uTime; uniform vec3 uColor; uniform int uGradientType; uniform vec3 uGradientColors[3]; uniform float uGradientStops[3]; uniform vec2 uGradientDirection; uniform vec2 uGradientCenter; uniform float uGradientRadius; uniform bool uAnimate; uniform float uAnimationSpeed; uniform int uAnimationType; varying vec2 vUv;
    vec3 interp(float t){ t=clamp(t,0.0,1.0); int idx=0; for(int i=0;i<2;i++){ if(t>=uGradientStops[i] && t<=uGradientStops[i+1]){ idx=i; break; } } float lt=(t-uGradientStops[idx])/(uGradientStops[idx+1]-uGradientStops[idx]); lt=clamp(lt,0.0,1.0); return mix(uGradientColors[idx], uGradientColors[idx+1], lt); }
    vec3 getLinear(){ return interp(dot(vUv, uGradientDirection)); }
    vec3 getRadial(){ float t=distance(vUv, uGradientCenter)/uGradientRadius; return interp(t); }
    vec3 getConic(){ vec2 d=vUv-uGradientCenter; float t=(atan(d.y,d.x)+3.14159265)/(6.2831853); return interp(t); }
    vec3 animateC(vec3 c){ if(!uAnimate) return c; float time=uTime*uAnimationSpeed; if(uAnimationType==0){ float p=sin(time)*0.3+0.7; return c*p; } else if(uAnimationType==1){ float rot=time*0.5; vec2 r=vec2(cos(rot)*(vUv.x-0.5)-sin(rot)*(vUv.y-0.5)+0.5, sin(rot)*(vUv.x-0.5)+cos(rot)*(vUv.y-0.5)+0.5); float t=dot(r,uGradientDirection); return (uGradientType==1)? interp(t): c; } else { float f=sin(time+vUv.x*10.0)*0.2+0.8; return c*f; } }
    void main(){ vec3 base = (uGradientType==0)? uColor : (uGradientType==1)? getLinear() : (uGradientType==2)? getRadial() : getConic(); base = animateC(base); gl_FragColor = vec4(base,1.0); }
  `;

  const uniforms = useRef({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(color) },
    uGradientType: { value: gradientType === 'solid' ? 0 : gradientType === 'linear' ? 1 : gradientType === 'radial' ? 2 : 3 },
    uGradientColors: { value: gradientColors.map((c) => new THREE.Color(c)).slice(0,3).concat([]) },
    uGradientStops: { value: (gradientStops.slice(0,3).length===3? gradientStops.slice(0,3): [0,0.5,1]) },
    uGradientDirection: { value: new THREE.Vector2(
      gradientDirection === 'horizontal' ? 1 : gradientDirection === 'vertical' ? 0 : 0.707,
      gradientDirection === 'vertical' ? 1 : gradientDirection === 'horizontal' ? 0 : 0.707
    ) },
    uGradientCenter: { value: new THREE.Vector2(gradientCenter[0]||0.5, gradientCenter[1]||0.5) },
    uGradientRadius: { value: gradientRadius },
    uAnimate: { value: animate },
    uAnimationSpeed: { value: animationSpeed },
    uAnimationType: { value: animationType === 'pulse' ? 0 : animationType === 'rotate' ? 1 : 2 },
  }).current;

  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uColor.value.set(color); }, [color]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uGradientType.value = (gradientType==='solid'?0: gradientType==='linear'?1: gradientType==='radial'?2:3); }, [gradientType]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uGradientColors.value = gradientColors.slice(0,3).map((c)=>new THREE.Color(c)); }, [gradientColors]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uGradientStops.value = (gradientStops.slice(0,3).length===3? gradientStops.slice(0,3): [0,0.5,1]); }, [gradientStops]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uGradientDirection.value.set(
    gradientDirection==='horizontal'?1: gradientDirection==='vertical'?0:0.707,
    gradientDirection==='vertical'?1: gradientDirection==='horizontal'?0:0.707
  ); }, [gradientDirection]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uGradientCenter.value.set(gradientCenter[0]||0.5, gradientCenter[1]||0.5); }, [gradientCenter]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uGradientRadius.value = gradientRadius; }, [gradientRadius]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uAnimate.value = animate; }, [animate]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uAnimationSpeed.value = animationSpeed; }, [animationSpeed]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uAnimationType.value = (animationType==='pulse'?0: animationType==='rotate'?1:2); }, [animationType]);

  useFrame((state) => { if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime; });

  return React.createElement(
    'mesh',
    null,
    React.createElement('planeGeometry', { args: [2, 2] }),
    React.createElement('shaderMaterial', {
      ref: materialRef,
      vertexShader,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
  );
}


