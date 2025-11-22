// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo } = React || {};

export const metadata = {
  name: 'FBM Flow',
  description: 'Procedural flowing fbm pattern (shader) rendered on a full-frame plane',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'timeSpeed', type: 'number', value: 4.74, min: 0.0, max: 9.48, step: 0.01, description: 'Animation speed multiplier' },
    { name: 'zoom', type: 'number', value: 0.01, min: 0.0, max: 0.02, step: 0.0001, description: 'Pattern zoom (scale)' },
    { name: 'rotate', type: 'number', value: 2.381, min: -0.7606, max: 5.5226, step: 0.001, description: 'Rotation offset (radians)' },
    { name: 'panX', type: 'number', value: -10.0, min: -20.0, max: 0.0, step: 0.001, description: 'Pan X' },
    { name: 'panY', type: 'number', value: 9.338, min: -0.662, max: 19.338, step: 0.001, description: 'Pan Y' },
    { name: 'palette', type: 'select', value: 'original', options: ['original','sunset','neon','ocean','magma','pastel'], description: 'Color palette' },
  ],
};

export default function FBMFlowSource({ timeSpeed = 4.74, zoom = 0.01, rotate = 2.381, panX = -10.0, panY = 9.338, palette = 'original' }){
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;

  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = size && size.width > 0 && size.height > 0 ? (size.width / size.height) : (16 / 9);
  const planeW = aspect * 2;
  const planeH = 2;

  const vertexShader = `
    void main(){
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    // By Liam Egan
    // 2018
  
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_zoom;
    uniform float u_rotate;
    uniform vec2 u_pan;
    uniform float u_palette;
  
    const int octaves = 6;
    const float seed = 43758.5453123;
    const float seed2 = 73156.8473192;
  
    vec2 random2(vec2 st, float seed){
        st = vec2( dot(st,vec2(127.1,311.7)),
                  dot(st,vec2(269.5,183.3)) );
        return -1.0 + 2.0*fract(sin(st)*seed);
    }
  
    // Value Noise by Inigo Quilez - iq/2013
    // https://www.shadertoy.com/view/lsf3WH
    float noise(vec2 st, float seed) {
        vec2 i = floor(st);
        vec2 f = fract(st);

        vec2 u = f*f*(3.0-2.0*f);

        return mix( mix( dot( random2(i + vec2(0.0,0.0), seed ), f - vec2(0.0,0.0) ), 
                         dot( random2(i + vec2(1.0,0.0), seed ), f - vec2(1.0,0.0) ), u.x),
                    mix( dot( random2(i + vec2(0.0,1.0), seed ), f - vec2(0.0,1.0) ), 
                         dot( random2(i + vec2(1.0,1.0), seed ), f - vec2(1.0,1.0) ), u.x), u.y);
    }
  
    float fbm1(in vec2 _st, float seed) {
      float v = 0.0;
      float a = 0.5;
      vec2 shift = vec2(100.0);
      // Rotate to reduce axial bias
      mat2 rot = mat2(cos(0.5), sin(0.5),
                      -sin(0.5), cos(0.50));
      for (int i = 0; i < octaves; ++i) {
          v += a * noise(_st, seed);
          _st = rot * _st * 2.0 + shift;
          a *= 0.4;
      }
      return v;
    }
  
    float pattern(vec2 uv, float seed, float time, inout vec2 q, inout vec2 r) {

      q = vec2( fbm1( uv + vec2(0.0,0.0), seed ),
                     fbm1( uv + vec2(5.2,1.3), seed ) );

      r = vec2( fbm1( uv + 4.0*q + vec2(1.7 - time / 2.,9.2), seed ),
                     fbm1( uv + 4.0*q + vec2(8.3 - time / 2.,2.8), seed ) );

      vec2 s = vec2( fbm1( uv + 4.0*r + vec2(21.7 - time / 2.,90.2), seed ),
                     fbm1( uv + 4.0*r + vec2(80.3 - time / 2.,20.8), seed ) );

      vec2 t = vec2( fbm1( uv + 4.0*s + vec2(121.7 - time / 2.,90.2), seed ),
                     fbm1( uv + 4.0*s + vec2(180.3 - time / 2.,20.8), seed ) );

      float rtn = fbm1( uv + 4.0*t, seed );

     rtn = clamp(rtn, 0., .5); // This shit is magic!

      return rtn;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
      uv *= 1. + dot(uv, uv)*.3;
      uv += u_pan;
    
      float time = u_time / 20.;
      
      mat2 rot = mat2(cos(time + u_rotate), sin(time + u_rotate),
                      -sin(time + u_rotate), cos(time + u_rotate));
      uv = rot * uv;
      // Use multiplicative modulation to keep scale positive even at very low zoom
      uv *= max(0.0001, u_zoom * (1.0 + sin(time) * 0.3));
      // Removed time-based X drift to keep focal bulge centered
      
      vec2 q = vec2(0.,0.);
      vec2 r = vec2(0.,0.);
      
      vec3 colour = vec3(pattern(uv, seed, time, q, r));
      float QR = clamp(dot(q, r), -1., 1.);
      colour += vec3(
        (q.x + q.y) + QR * 30., 
        QR * 15., 
        r.x * r.y + QR * 5.
      );
      // Tone and contrast (avoid washed-out whites)
      colour = clamp(colour, 0.0, 1.0);
      // Palette mapping (0=original,1=sunset,2=neon,3=ocean,4=magma,5=pastel)
      float t = clamp(dot(colour, vec3(0.3333)), 0.0, 1.0);
      if (u_palette > 0.5 && u_palette < 1.5) {
        vec3 a = vec3(0.05, 0.00, 0.20);
        vec3 b = vec3(0.90, 0.20, 0.10);
        vec3 c = vec3(1.00, 0.80, 0.40);
        colour = mix(mix(a, b, smoothstep(0.0, 0.8, t)), c, smoothstep(0.4, 1.0, t));
      } else if (u_palette >= 1.5 && u_palette < 2.5) {
        vec3 a = vec3(0.02, 0.02, 0.06);
        vec3 b = vec3(0.10, 1.00, 0.80);
        vec3 c = vec3(1.00, 0.20, 0.80);
        colour = mix(mix(a, b, smoothstep(0.1, 0.7, t)), c, smoothstep(0.6, 1.0, t));
      } else if (u_palette >= 2.5 && u_palette < 3.5) {
        vec3 a = vec3(0.00, 0.05, 0.10);
        vec3 b = vec3(0.00, 0.40, 0.80);
        vec3 c = vec3(0.60, 0.90, 1.00);
        colour = mix(mix(a, b, smoothstep(0.0, 0.8, t)), c, smoothstep(0.5, 1.0, t));
      } else if (u_palette >= 3.5 && u_palette < 4.5) {
        vec3 a = vec3(0.00, 0.00, 0.00);
        vec3 b = vec3(0.70, 0.10, 0.00);
        vec3 c = vec3(1.00, 0.80, 0.20);
        colour = mix(mix(a, b, smoothstep(0.2, 0.8, t)), c, smoothstep(0.6, 1.0, t));
      } else if (u_palette >= 4.5) {
        vec3 a = vec3(0.95, 0.85, 0.95);
        vec3 b = vec3(0.75, 0.90, 1.00);
        vec3 c = vec3(0.85, 1.00, 0.85);
        colour = mix(mix(a, b, t), c, t*(1.0-t)*2.0);
      }
      gl_FragColor = vec4(colour, 1.);
    }
  `;

  const paletteIndex = (() => {
    const table = ['original','sunset','neon','ocean','magma','pastel'];
    const idx = table.indexOf(String(palette || 'original'));
    return idx < 0 ? 0 : idx;
  })();

  const uniforms = useMemo(() => ({
    u_time: { value: 0.0 },
    u_resolution: { value: new THREE.Vector2(Math.max(1, size?.width || 1920), Math.max(1, size?.height || 1080)) },
    u_zoom: { value: zoom },
    u_rotate: { value: rotate },
    u_pan: { value: new THREE.Vector2(panX, panY) },
    u_palette: { value: paletteIndex },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // Update resolution on size change
  if (uniforms && uniforms.u_resolution && size && size.width && size.height) {
    const res = uniforms.u_resolution.value;
    if (res && (res.x !== size.width || res.y !== size.height)) {
      res.x = size.width; res.y = size.height;
    }
  }

  // Sync uniforms from parameters each render (cheap scalar/vec2 writes)
  try {
    if (uniforms.u_zoom) uniforms.u_zoom.value = zoom;
    if (uniforms.u_rotate) uniforms.u_rotate.value = rotate;
    if (uniforms.u_pan) { const p = uniforms.u_pan.value; if (p) { p.x = panX; p.y = panY; } }
    if (uniforms.u_palette) uniforms.u_palette.value = paletteIndex;
  } catch {}

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  }), [uniforms]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(planeW, planeH, 1, 1), [planeW, planeH]);

  useFrame((_, delta) => {
    try {
      if (uniforms && uniforms.u_time) uniforms.u_time.value += Math.max(0.0, timeSpeed) * (delta || 0.016);
    } catch {}
  });

  return React.createElement(
    'mesh',
    null,
    React.createElement('primitive', { object: geometry, attach: 'geometry' }),
    React.createElement('primitive', { object: material, attach: 'material' })
  );
}



