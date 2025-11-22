// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef } = React || {};

export const metadata = {
  name: 'Ocean',
  description: 'Animated ocean shader on a large plane with a bobbing cube',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'planeSize', type: 'number', value: 4.0, min: 1, max: 20, step: 0.1, description: 'Ocean plane size (world units)' },
    { name: 'waveScale', type: 'number', value: 0.08, min: 0.0, max: 0.3, step: 0.005, description: 'Wave amplitude' },
    { name: 'waveSpeed', type: 'number', value: 0.6, min: 0.0, max: 3.0, step: 0.05, description: 'Wave speed' },
    { name: 'waterColor', type: 'string', value: '#0a3d5a', description: 'Water base color' },
    { name: 'foamColor', type: 'string', value: '#d9f1ff', description: 'Foam/tint color' },
    { name: 'sunColor', type: 'string', value: '#ffffff', description: 'Sun light color' },
    { name: 'sunDirectionX', type: 'number', value: 0.3, min: -1, max: 1, step: 0.01, description: 'Sun direction X' },
    { name: 'sunDirectionY', type: 'number', value: 0.8, min: -1, max: 1, step: 0.01, description: 'Sun direction Y' },
    { name: 'sunDirectionZ', type: 'number', value: 0.5, min: -1, max: 1, step: 0.01, description: 'Sun direction Z' },
    { name: 'cube', type: 'boolean', value: true, description: 'Show bobbing cube' },
  ],
};

function toVec3(hex) {
  try { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); } catch { return new THREE.Vector3(1,1,1); }
}

export default function OceanSource({
  planeSize = 4.0,
  waveScale = 0.08,
  waveSpeed = 0.6,
  waterColor = '#0a3d5a',
  foamColor = '#d9f1ff',
  sunColor = '#ffffff',
  sunDirectionX = 0.3,
  sunDirectionY = 0.8,
  sunDirectionZ = 0.5,
  cube = true,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uScale: { value: waveScale },
    uSpeed: { value: waveSpeed },
    uWater: { value: toVec3(waterColor) },
    uFoam: { value: toVec3(foamColor) },
    uSun: { value: toVec3(sunColor) },
    uSunDir: { value: new THREE.Vector3(sunDirectionX, sunDirectionY, sunDirectionZ).normalize() },
  }), [waveScale, waveSpeed, waterColor, foamColor, sunColor, sunDirectionX, sunDirectionY, sunDirectionZ]);

  const vert = `
uniform float uTime; uniform float uScale; uniform float uSpeed; varying vec3 vWorldPos; varying vec3 vNormal; varying vec2 vUv;
float wave(vec2 p, float t){ return sin(p.x*1.2 + t*0.9) * 0.5 + sin(p.y*1.7 - t*1.3) * 0.5; }
void main(){
  vUv = uv; vec3 pos = position; float t = uTime * uSpeed;
  float w = wave(pos.xy, t) + 0.5*sin( (pos.x+pos.y)*0.4 + t*0.7 );
  pos.z += uScale * w; // displace towards/away from camera
  vec4 wp = modelMatrix * vec4(pos,1.0); vWorldPos = wp.xyz;
  vNormal = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
  const frag = `
precision highp float; varying vec3 vWorldPos; varying vec3 vNormal; varying vec2 vUv; uniform vec3 uWater; uniform vec3 uFoam; uniform vec3 uSun; uniform vec3 uSunDir;
void main(){
  vec3 N = normalize(vNormal);
  float fres = pow(1.0 - clamp(dot(N, normalize(vec3(0.0,1.0,0.0))), 0.0, 1.0), 3.0);
  float spec = pow(max(dot(reflect(-uSunDir, N), normalize(vec3(0.0,1.0,0.0))), 0.0), 32.0);
  float foam = smoothstep(0.6, 0.9, fres);
  vec3 col = mix(uWater, uFoam, foam*0.6) + uSun * spec * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

  const material = useMemo(() => new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: false, side: THREE.DoubleSide }), [uniforms]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(planeSize, planeSize, 128, 128), [planeSize]);
  const meshRef = useRef(null);
  const cubeRef = useRef(null);

  useFrame((_, delta) => {
    try {
      uniforms.uTime.value += Math.max(0.0001, delta);
      if (cube && cubeRef.current) {
        const t = uniforms.uTime.value * 0.8; cubeRef.current.position.y = 0.2 + Math.sin(t) * 0.1; cubeRef.current.rotation.y += 0.3 * delta;
      }
    } catch {}
  });

  return React.createElement(
    'group',
    null,
    // Water plane facing camera (displacement along Z)
    React.createElement('mesh', { ref: meshRef },
      React.createElement('primitive', { object: geometry, attach: 'geometry' }),
      React.createElement('primitive', { object: material, attach: 'material' })
    ),
    cube && React.createElement('mesh', { ref: cubeRef, position: [0, 0.2, 0] },
      React.createElement('boxGeometry', { args: [0.2, 0.2, 0.2] }),
      React.createElement('meshStandardMaterial', { color: 0xffffff, roughness: 0.1, metalness: 0.0 })
    ),
    React.createElement('ambientLight', { args: [0x404040] }),
    React.createElement('directionalLight', { args: [0xffffff, 1.0], position: [sunDirectionX, sunDirectionY, sunDirectionZ] })
  );
}


