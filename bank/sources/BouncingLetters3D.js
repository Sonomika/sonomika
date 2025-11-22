// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef } = React || {};

export const metadata = {
  name: 'Bouncing Letters 3D',
  description: 'Letters bounce within bounds in 3D. Renders as colored points externally.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'text', type: 'string', value: 'VJ SYSTEM' },
    { name: 'count', type: 'number', value: 24, min: 1, max: 200, step: 1 },
    { name: 'fontSize', type: 'number', value: 0.25, min: 0.05, max: 0.8, step: 0.01 },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 4.0, step: 0.1 },
    { name: 'gravity', type: 'number', value: 0.0, min: -3.0, max: 3.0, step: 0.05 },
    { name: 'bounciness', type: 'number', value: 0.8, min: 0.0, max: 1.0, step: 0.01 },
    { name: 'friction', type: 'number', value: 0.05, min: 0.0, max: 0.5, step: 0.01 },
    { name: 'color', type: 'color', value: '#66ccff' },
    { name: 'randomSeed', type: 'number', value: 0, min: 0, max: 999999, step: 1 },
    { name: 'zDepth', type: 'number', value: 0.5, min: 0.1, max: 2.0, step: 0.05 },
  ],
};

export default function BouncingLetters3D({ text='VJ SYSTEM', count=24, fontSize=0.25, speed=1.0, gravity=0.0, bounciness=0.8, friction=0.05, color='#66ccff', randomSeed=0, zDepth=0.5 }) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;
  const groupRef = useRef(null);
  const pointsRef = useRef(null);

  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };
  const aspect = (size.width>0 && size.height>0) ? size.width/size.height : 16/9;
  const halfW = (aspect * 2) / 2; const halfH = 2/2;

  const rng = useMemo(() => {
    if (!randomSeed) return Math.random; let s = (randomSeed>>>0); return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s>>>0)%0xffff)/0xffff; };
  }, [randomSeed]);

  const letters = useMemo(() => {
    const chars = (text && text.length>0 ? text : 'VJ').split(''); const n = Math.max(1, Math.min(count, 200)); const arr = new Array(n);
    for (let i=0;i<n;i++){
      const ch = chars[i % chars.length];
      const p = new THREE.Vector3((rng()*2-1)*(halfW-fontSize*0.6), (rng()*2-1)*(halfH-fontSize*0.6), (rng()*2-1)*(zDepth-fontSize*0.2));
      const sb = 0.6 + rng()*0.8; const v = new THREE.Vector3((rng()*2-1)*sb,(rng()*2-1)*sb,(rng()*2-1)*sb*0.5);
      const hue = 0.5 + rng()*0.3; const base = new THREE.Color().setHSL(hue,0.7,0.6); const col = base.multiply(new THREE.Color(color));
      arr[i] = { ch, position: p, velocity: v, color: col };
    }
    return arr;
  }, [text, count, halfW, halfH, zDepth, fontSize, rng, color]);

  const { geom, colors } = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(letters.length * 3);
    const colors = new Float32Array(letters.length * 3);
    for (let i=0;i<letters.length;i++){ pos[i*3+0]=letters[i].position.x; pos[i*3+1]=letters[i].position.y; pos[i*3+2]=letters[i].position.z; colors[i*3+0]=letters[i].color.r; colors[i*3+1]=letters[i].color.g; colors[i*3+2]=letters[i].color.b; }
    geom.setAttribute('position', new THREE.BufferAttribute(pos,3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors,3));
    return { geom, colors: pos };
  }, [letters]);

  const mat = useMemo(() => new THREE.PointsMaterial({ size: fontSize*0.6, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthTest:false, depthWrite:false }), [fontSize]);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta); const left = -halfW + fontSize*0.6; const right = halfW - fontSize*0.6; const bottom = -halfH + fontSize*0.6; const top = halfH - fontSize*0.6; const front = zDepth - fontSize*0.2; const back = -zDepth + fontSize*0.2;
    const posAttr = pointsRef.current?.geometry?.getAttribute('position'); if (!posAttr) return; const arr = posAttr.array;
    for (let i=0;i<letters.length;i++){
      const L = letters[i]; L.velocity.y -= gravity * dt; L.position.x += L.velocity.x * dt * speed; L.position.y += L.velocity.y * dt * speed; L.position.z += L.velocity.z * dt * speed;
      if (L.position.x <= left){ L.position.x = left; L.velocity.x = Math.abs(L.velocity.x) * bounciness; L.velocity.y *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.x >= right){ L.position.x = right; L.velocity.x = -Math.abs(L.velocity.x) * bounciness; L.velocity.y *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.y <= bottom){ L.position.y = bottom; L.velocity.y = Math.abs(L.velocity.y) * bounciness; L.velocity.x *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.y >= top){ L.position.y = top; L.velocity.y = -Math.abs(L.velocity.y) * bounciness; L.velocity.x *= 1 - friction; L.velocity.z *= 1 - friction; }
      if (L.position.z >= front){ L.position.z = front; L.velocity.z = -Math.abs(L.velocity.z) * bounciness; L.velocity.x *= 1 - friction; L.velocity.y *= 1 - friction; }
      if (L.position.z <= back){ L.position.z = back; L.velocity.z = Math.abs(L.velocity.z) * bounciness; L.velocity.x *= 1 - friction; L.velocity.y *= 1 - friction; }
      arr[i*3+0]=L.position.x; arr[i*3+1]=L.position.y; arr[i*3+2]=L.position.z;
    }
    posAttr.needsUpdate = true;
  });

  return React.createElement('points', { ref: pointsRef, geometry: geom }, React.createElement('primitive', { object: mat }));
}


