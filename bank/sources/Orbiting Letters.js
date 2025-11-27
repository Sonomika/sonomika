const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo } = React || {};

export const metadata = {
  name: 'Orbiting Letters',
  description:
    'Letters orbit around a center point leaving concentric echo rings. Rings change hue over time and optionally face the camera.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'text', type: 'string', value: 'ORBITAL' },
    { name: 'baseColor', type: 'color', value: '#66ccff' },
    { name: 'fontSize', type: 'number', value: 1.0, min: 0.2, max: 4.0, step: 0.05 },
    { name: 'orbitRadius', type: 'number', value: 3.5, min: 0.5, max: 15.0, step: 0.1 },
    { name: 'orbitSpeed', type: 'number', value: 0.9, min: 0.01, max: 3.0, step: 0.01 },
    { name: 'verticalFloat', type: 'number', value: 0.6, min: 0, max: 3.0, step: 0.05 },
    { name: 'spin', type: 'number', value: 0.9, min: 0, max: 6.0, step: 0.01 },
    { name: 'ringCount', type: 'number', value: 8, min: 1, max: 40, step: 1 },
    { name: 'ringScale', type: 'number', value: 0.85, min: 0.2, max: 1.2, step: 0.01 },
    { name: 'ringFade', type: 'number', value: 1.8, min: 0.1, max: 4.0, step: 0.05 },
    { name: 'depthOffset', type: 'number', value: 0.012, min: 0, max: 0.1, step: 0.001 },
    { name: 'hueShiftSpeed', type: 'number', value: 0.12, min: 0, max: 2.0, step: 0.01 },
    { name: 'facingCamera', type: 'boolean', value: true },
    { name: 'zScatter', type: 'number', value: 0.6, min: 0, max: 3.0, step: 0.01 },
  ],
};

export default function OrbitingLetters({
  text = 'ORBITAL',
  baseColor = '#66ccff',
  fontSize = 1.0,
  orbitRadius = 3.5,
  orbitSpeed = 0.9,
  verticalFloat = 0.6,
  spin = 0.9,
  ringCount = 8,
  ringScale = 0.85,
  ringFade = 1.8,
  depthOffset = 0.012,
  hueShiftSpeed = 0.12,
  facingCamera = true,
  zScatter = 0.6,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;

  // Refs
  const meshRefs = useRef([]); // meshRefs.current[letterIndex][ringIndex] = mesh
  const letterState = useRef([]); // per-letter: angle, angVel, history[], phase

  // Plane geometry for letters (unit, will be scaled)
  const planeGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Prepare canvas textures (white glyphs) so we can tint materials via material.color
  const { textures, letters } = useMemo(() => {
    const chars = Array.from(String(text));
    const texturesMap = [];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      // draw glyph in white so material.color can tint it
      ctx.fillStyle = '#ffffff';
      const fontPx = Math.floor(size * 0.72);
      ctx.font = `${fontPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, size / 2, size / 2);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      texturesMap.push(tex);
    }
    return { textures: texturesMap, letters: chars };
  }, [text]);

  // Materials per letter per ring (cloned so we can tweak color/opacity)
  const materials = useMemo(() => {
    const mats = [];
    // convert baseColor to HSL for easier hue offsets
    const baseCol = new THREE.Color(baseColor || '#ffffff');
    const baseHSL = {};
    baseCol.getHSL(baseHSL);
    for (let i = 0; i < textures.length; i++) {
      const tex = textures[i];
      const segMats = [];
      for (let r = 0; r < ringCount; r++) {
        // start with a MeshBasicMaterial using the white texture so color multiplies
        const m = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          alphaTest: 0.001,
          // material color will be set/updated every frame
          color: baseCol.clone(),
          onBeforeCompile: undefined,
        });
        // initial opacity based on ring index (more distant rings are dimmer)
        const t = 1 - r / Math.max(1, ringCount - 1);
        m.opacity = Math.pow(t, ringFade);
        segMats.push(m);
      }
      mats.push(segMats);
    }
    return mats;
  }, [textures, ringCount, ringFade, baseColor]);

  // Initialize per-letter orbital state and prefill history (so echoes exist at start)
  useMemo(() => {
    letterState.current = [];
    meshRefs.current = [];
    const chars = letters || Array.from(String(text));
    for (let i = 0; i < chars.length; i++) {
      const angle = (i / Math.max(1, chars.length)) * Math.PI * 2;
      const angVel = (0.4 + Math.random() * 0.8) * (orbitSpeed * (0.6 + i * 0.02));
      const phase = Math.random() * Math.PI * 2;
      // initial vertical offset per letter
      const yBase = Math.sin(angle * 1.2 + phase) * verticalFloat;
      // center origin plus small z scatter for depth variety
      const zBase = (Math.random() - 0.5) * zScatter;
      const pos = new THREE.Vector3(Math.cos(angle) * orbitRadius, yBase, Math.sin(angle) * orbitRadius + zBase);
      // history prefill
      const history = [];
      for (let h = 0; h < ringCount; h++) history.push(pos.clone());
      letterState.current.push({ angle, angVel, phase, history });
      meshRefs.current[i] = [];
    }
  }, [letters, orbitRadius, orbitSpeed, ringCount, verticalFloat, zScatter, text]);

  // Per-frame update: advance angles, push positions to history, update meshes and materials
  useFrame((state, delta) => {
    if (!letterState.current) return;
    const time = state.clock.elapsedTime;
    const dt = delta;
    const cam = state.camera;

    // base color HSL for hue shifting reference
    const baseCol = new THREE.Color(baseColor || '#ffffff');
    const baseHSL = {};
    baseCol.getHSL(baseHSL);

    for (let i = 0; i < letterState.current.length; i++) {
      const st = letterState.current[i];
      // angular motion
      // allow orbitSpeed param to modulate the per-letter angular velocity
      st.angle += st.angVel * dt * orbitSpeed;
      // vertical bobbing
      const y = Math.sin(st.angle * 1.5 + st.phase + time * 0.6) * verticalFloat;
      // radial variation for liveliness
      const rVariation = 0.2 * Math.sin(time * 0.7 + i * 0.5 + st.phase);
      const r = orbitRadius + rVariation;
      const x = Math.cos(st.angle) * r;
      const z = Math.sin(st.angle) * r + (Math.sin(st.angle * 0.6 + i) * 0.15);
      const pos = new THREE.Vector3(x, y, z);

      // push into history and cap length
      st.history.push(pos.clone());
      if (st.history.length > ringCount) st.history.shift();

      // update meshes for this letter
      const meshList = meshRefs.current[i] || [];
      for (let rIndex = 0; rIndex < ringCount; rIndex++) {
        const histIndex = Math.max(0, st.history.length - 1 - rIndex);
        const p = st.history[histIndex] || pos;
        const mesh = meshList[rIndex];
        if (!mesh) continue;

        // place mesh slightly behind the newer ring so additive blends layered nicely
        mesh.position.set(p.x, p.y, p.z - rIndex * depthOffset);

        // scale: rings grow slightly smaller for older echoes
        const t = 1 - rIndex / Math.max(1, ringCount - 1);
        const scale = fontSize * (0.9 * Math.pow(ringScale, rIndex) * (0.8 + 0.4 * t));
        mesh.scale.set(scale, scale, 1);

        // rotating each quad for subtle parallax spin
        const rotation = st.angle * spin * (1 + rIndex * 0.02) + rIndex * 0.15;
        mesh.rotation.set(0, 0, rotation);

        // optionally face camera (billboard). If facingCamera is true, orient to camera.
        if (facingCamera && mesh.lookAt) {
          // lookAt modifies rotation in world space; we prefer only Z-facing,
          // so compute quaternion to lookAt camera and copy that quaternion's yaw/pitch into mesh.
          mesh.lookAt(cam.position);
          // small additional rotation to keep text upright relative to camera roll
          // (no-op if camera's roll is zero)
        }

        // update material opacity and hue-shifted color based on time + index
        if (mesh.material) {
          const m = mesh.material;
          // dynamic fade per ring (keeps in sync with ringFade param)
          m.opacity = Math.pow(t, ringFade);
          // hue shift over time
          const hueOffset = (time * hueShiftSpeed + i * 0.08 + rIndex * 0.02) % 1.0;
          const h = (baseHSL.h + hueOffset) % 1.0;
          const s = Math.min(1.0, baseHSL.s * (0.9 + 0.3 * t));
          const l = Math.min(1.0, baseHSL.l * (0.6 + 0.4 * t));
          m.color.setHSL(h, s, l);
          m.needsUpdate = true;
        }
      }
    }
  });

  // Build meshes: for each letter, create ringCount mesh quads
  const letterGroups = [];
  for (let i = 0; i < letters.length; i++) {
    const segMeshes = [];
    for (let r = 0; r < ringCount; r++) {
      const segIndex = r;
      const meshRefSetter = (el) => {
        meshRefs.current[i][segIndex] = el;
      };
      const mat = (materials[i] && materials[i][r]) || null;
      const meshProps = {
        key: `ltr-${i}-ring-${r}`,
        ref: meshRefSetter,
        geometry: planeGeom,
        material: mat,
      };
      segMeshes.push(React.createElement('mesh', meshProps));
    }
    letterGroups.push(React.createElement('group', { key: `letter-group-${i}` }, ...segMeshes));
  }

  // top-level group at origin
  return React.createElement('group', { position: [0, 0, 0] }, ...letterGroups);
}
