// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef } = React || {};

export const metadata = {
  name: 'Marching Metaballs (Shader)',
  description: 'Shader-raymarched metaballs inspired by Three.js MarchingCubes example (no addons/imports).',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'speed', type: 'number', value: 1.0, min: 0.0, max: 8.0, step: 0.05 },
    { name: 'numBlobs', type: 'number', value: 10, min: 1, max: 50, step: 1 },
    { name: 'radius', type: 'number', value: 0.28, min: 0.05, max: 0.6, step: 0.01 },
    { name: 'isoLevel', type: 'number', value: 1.0, min: 0.3, max: 2.5, step: 0.01 },
    { name: 'maxSteps', type: 'number', value: 80, min: 16, max: 200, step: 1 },
    { name: 'maxDistance', type: 'number', value: 3.0, min: 1.0, max: 6.0, step: 0.1 },
    { name: 'color', type: 'color', value: '#4ba2c4' },
    { name: 'metallic', type: 'number', value: 0.1, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'roughness', type: 'number', value: 0.25, min: 0.0, max: 1.0, step: 0.01 },
  ],
};

export default function MarchingMetaballs({
  speed = 1.0,
  numBlobs = 10,
  radius = 0.28,
  isoLevel = 1.0,
  maxSteps = 80,
  maxDistance = 3.0,
  color = '#4ba2c4',
  metallic = 0.1,
  roughness = 0.25,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const timeRef = useRef(0);

  const { size } = useThree();
  const aspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : (16 / 9);
  const planeW = aspect * 2;
  const planeH = 2;

  const geometry = useMemo(() => new THREE.PlaneGeometry(planeW, planeH), [planeW, planeH]);

  const vertexShader = "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";

  // Simple signed distance for metaballs field; raymarch sphere-tracing; normal via gradient
  const fragmentShader = `
    precision highp float; varying vec2 vUv;
    uniform float uTime; uniform float uSpeed; uniform int uCount; uniform float uRadius; uniform float uIso; 
    uniform int uMaxSteps; uniform float uMaxDist; uniform vec3 uColor; uniform float uMetallic; uniform float uRoughness; 
    uniform vec2 uResolution;

    // pseudo-random from index
    float hash(float n){ return fract(sin(n)*43758.5453123); }

    // Metaball positions in 3D (normalized space around origin)
    vec3 blobPos(int i, float t){
      float fi = float(i);
      float a = t*(1.03+0.21*cos(0.37*fi)) + fi*1.3;
      float b = t*(0.91+0.17*sin(0.19*fi)) + fi*0.7;
      float x = 0.6*sin(a);
      float y = 0.6*abs(cos(b));
      float z = 0.6*cos(a*0.7 + sin(b));
      return vec3(x,y,z) * 0.5; // fit into unit box
    }

    // Field value: sum of sphere influences
    float field(vec3 p, float r){
      float v = 0.0;
      for(int i=0;i<64;i++){
        if(i>=uCount) break;
        vec3 c = blobPos(i, uTime*uSpeed*0.5);
        float d2 = dot(p-c, p-c);
        v += r*r / max(1e-6, d2);
      }
      return v;
    }

    // Signed distance: push surface where field==iso
    float sdf(vec3 p){
      float f = field(p, uRadius) - uIso;
      // map field to pseudo distance using gradient magnitude estimate
      return clamp(f, -1.0, 1.0);
    }

    vec3 estimateNormal(vec3 p){
      float e = 0.0025;
      vec2 h = vec2(e, 0.0);
      float dx = sdf(p + vec3(h.x, h.y, h.y)) - sdf(p - vec3(h.x, h.y, h.y));
      float dy = sdf(p + vec3(h.y, h.x, h.y)) - sdf(p - vec3(h.y, h.x, h.y));
      float dz = sdf(p + vec3(h.y, h.y, h.x)) - sdf(p - vec3(h.y, h.y, h.x));
      return normalize(vec3(dx, dy, dz));
    }

    // Simple PBR-ish lighting (ambient + single dir light + spec)
    vec3 shade(vec3 p, vec3 n, vec3 viewDir){
      vec3 base = uColor;
      vec3 L = normalize(vec3(0.6, 0.7, 0.5));
      float ndl = max(0.0, dot(n, L));
      // specular
      vec3 H = normalize(L + viewDir);
      float ndh = max(0.0, dot(n, H));
      float spec = pow(ndh, mix(4.0, 64.0, 1.0 - uRoughness)) * (0.04 + 0.96*uMetallic);
      vec3 col = base*(0.08 + 0.92*ndl) + spec;
      return col;
    }

    void main(){
      // Camera ray setup: orthographic onto plane, then view into scene box
      vec2 uv = vUv*2.0-1.0; uv.x *= uResolution.x/uResolution.y; // correct aspect for ray setup
      vec3 ro = vec3(0.0, 0.0, 2.0);
      vec3 rd = normalize(vec3(uv.xy, -1.8));

      float t = 0.0; float d; bool hit=false; vec3 pos;
      for(int i=0;i<256;i++){
        if(i>=uMaxSteps) break;
        pos = ro + rd * t;
        d = sdf(pos);
        if (abs(d) < 0.002){ hit = true; break; }
        t += max(0.01, abs(d)*0.5);
        if (t>uMaxDist) break;
      }

      vec3 col = vec3(0.0);
      if (hit){
        vec3 n = estimateNormal(pos);
        vec3 V = normalize(-rd);
        col = shade(pos, n, V);
        // vignette
        float v = 1.0 - (uv.x*uv.x + uv.y*uv.y)*0.25;
        col *= v;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uCount: { value: Math.max(1, Math.min(64, Math.floor(numBlobs))) },
        uRadius: { value: radius },
        uIso: { value: isoLevel },
        uMaxSteps: { value: Math.max(16, Math.min(256, Math.floor(maxSteps))) },
        uMaxDist: { value: maxDistance },
        uColor: { value: new THREE.Color(color) },
        uMetallic: { value: metallic },
        uRoughness: { value: roughness },
        uResolution: { value: new THREE.Vector2(size.width || 1920, size.height || 1080) },
      },
      vertexShader,
      fragmentShader,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    });
    materialRef.current = m;
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uniform updates on prop/size changes
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uSpeed.value = speed; }, [speed]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uCount.value = Math.max(1, Math.min(64, Math.floor(numBlobs))); }, [numBlobs]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uRadius.value = radius; }, [radius]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uIso.value = isoLevel; }, [isoLevel]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uMaxSteps.value = Math.max(16, Math.min(256, Math.floor(maxSteps))); }, [maxSteps]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uMaxDist.value = maxDistance; }, [maxDistance]);
  useEffect(() => { if (materialRef.current) try { materialRef.current.uniforms.uColor.value.set(color); } catch {}; }, [color]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uMetallic.value = metallic; }, [metallic]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uRoughness.value = roughness; }, [roughness]);
  useEffect(() => { if (materialRef.current) materialRef.current.uniforms.uResolution.value.set(size.width || 1920, size.height || 1080); }, [size]);

  useFrame((_, delta) => {
    timeRef.current += (delta || 0.016);
    if (materialRef.current) materialRef.current.uniforms.uTime.value = timeRef.current;
  });

  useEffect(() => () => {
    try { geometry && geometry.dispose && geometry.dispose(); } catch {}
    try { material && material.dispose && material.dispose(); } catch {}
  }, [geometry, material]);

  return React.createElement('mesh', { ref: meshRef },
    React.createElement('primitive', { object: geometry }),
    React.createElement('primitive', { object: material })
  );
}


