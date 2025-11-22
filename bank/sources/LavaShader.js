// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef } = React || {};

export const metadata = {
  name: 'Lava Shader',
  description: 'Animated lava shader on a torus, procedurally textured',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'timeSpeed', type: 'number', value: 1.0, min: 0.0, max: 3.0, step: 0.01, description: 'Animation speed' },
    { name: 'uvScaleX', type: 'number', value: 3.0, min: 0.1, max: 6.0, step: 0.1, description: 'UV scale X' },
    { name: 'uvScaleY', type: 'number', value: 1.0, min: 0.1, max: 6.0, step: 0.1, description: 'UV scale Y' },
    { name: 'torusRadius', type: 'number', value: 0.35, min: 0.05, max: 1.0, step: 0.01, description: 'Torus radius (world units)' },
    { name: 'tubeRadius', type: 'number', value: 0.15, min: 0.02, max: 0.5, step: 0.01, description: 'Tube radius (world units)' },
    { name: 'rotationSpeedX', type: 'number', value: 0.05, min: 0, max: 0.3, step: 0.005, description: 'Rotation speed X' },
    { name: 'rotationSpeedY', type: 'number', value: 0.0125, min: 0, max: 0.3, step: 0.0025, description: 'Rotation speed Y' },
    { name: 'fogDensity', type: 'number', value: 0.0, min: 0.0, max: 1.0, step: 0.01, description: 'Fog density' },
  ],
};

function createNoiseTexture(size) {
  const s = Math.max(8, Math.floor(size) || 256);
  const data = new Uint8Array(s * s * 4);
  for (let i = 0; i < s * s; i++) {
    const n = Math.floor(Math.random() * 256);
    data[i * 4 + 0] = n;
    data[i * 4 + 1] = Math.floor(Math.random() * 256);
    data[i * 4 + 2] = Math.floor(Math.random() * 256);
    data[i * 4 + 3] = n;
  }
  const tex = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  try { tex.colorSpace = THREE.SRGBColorSpace; } catch {}
  return tex;
}

function createLavaTexture(size) {
  const s = Math.max(32, Math.floor(size) || 256);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1, THREE.RGBAFormat);
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, '#2b0000');
  grad.addColorStop(0.3, '#7a1503');
  grad.addColorStop(0.6, '#d14a00');
  grad.addColorStop(1, '#ffdf4d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // overlay subtle noise
  const imgData = ctx.getImageData(0, 0, s, s);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 30;
    d[i] = Math.min(255, Math.max(0, d[i] + noise));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise * 0.6));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise * 0.2));
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  try { tex.colorSpace = THREE.SRGBColorSpace; } catch {}
  return tex;
}

export default function LavaShaderSource({ timeSpeed = 1.0, uvScaleX = 3.0, uvScaleY = 1.0, torusRadius = 0.35, tubeRadius = 0.15, rotationSpeedX = 0.05, rotationSpeedY = 0.0125, fogDensity = 0.0 }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  const frag = `
uniform float time;
uniform float fogDensity;
uniform vec3 fogColor;
uniform sampler2D texture1;
uniform sampler2D texture2;
varying vec2 vUv;
void main(void) {
  vec2 position = -1.0 + 2.0 * vUv;
  vec4 noise = texture2D(texture1, vUv);
  vec2 T1 = vUv + vec2(1.5, -1.5) * time * 0.02;
  vec2 T2 = vUv + vec2(-0.5, 2.0) * time * 0.01;
  T1.x += noise.x * 2.0; T1.y += noise.y * 2.0; T2.x -= noise.y * 0.2; T2.y += noise.z * 0.2;
  float p = texture2D(texture1, T1 * 2.0).a;
  vec4 color = texture2D(texture2, T2 * 2.0);
  vec4 temp = color * (vec4(p, p, p, p) * 2.0) + (color * color - 0.1);
  if (temp.r > 1.0) { temp.bg += clamp(temp.r - 2.0, 0.0, 100.0); }
  if (temp.g > 1.0) { temp.rb += temp.g - 1.0; }
  if (temp.b > 1.0) { temp.rg += temp.b - 1.0; }
  gl_FragColor = temp;
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  const float LOG2 = 1.442695;
  float fogFactor = exp2(-fogDensity * fogDensity * depth * depth * LOG2);
  fogFactor = 1.0 - clamp(fogFactor, 0.0, 1.0);
  gl_FragColor = mix(gl_FragColor, vec4(fogColor, gl_FragColor.w), fogFactor);
}`;

  const vert = `
uniform vec2 uvScale; varying vec2 vUv; void main(){ vUv = uvScale * uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

  const meshRef = useRef(null);
  const uniforms = useMemo(() => {
    const tex1 = createNoiseTexture(256);
    const tex2 = createLavaTexture(256);
    return {
      fogDensity: { value: fogDensity },
      fogColor: { value: new THREE.Vector3(0, 0, 0) },
      time: { value: 1.0 },
      uvScale: { value: new THREE.Vector2(uvScaleX, uvScaleY) },
      texture1: { value: tex1 },
      texture2: { value: tex2 },
    };
  }, [fogDensity, uvScaleX, uvScaleY]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: false,
  }), [uniforms]);

  const geometry = useMemo(() => new THREE.TorusGeometry(torusRadius, tubeRadius, 30, 30), [torusRadius, tubeRadius]);

  useFrame((_, delta) => {
    try {
      if (uniforms && uniforms.time) uniforms.time.value += (timeSpeed || 1.0) * Math.max(0.0001, delta * 5.0 * 0.2);
      if (meshRef.current) {
        meshRef.current.rotation.y += rotationSpeedY * delta * 5.0;
        meshRef.current.rotation.x += rotationSpeedX * delta * 5.0;
      }
    } catch {}
  });

  return React.createElement(
    'mesh',
    { ref: meshRef },
    React.createElement('primitive', { object: geometry, attach: 'geometry' }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}


