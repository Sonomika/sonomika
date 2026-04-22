// sonomika template – tracks bright regions and reveals video clips underneath with audio
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useMemo, useRef, useEffect } = React || {};

export const metadata = {
  name: 'Video Tracker Clips (Audio)',
  description: 'Tracks bright/color regions and reveals circular video clips at those positions with sound on appearance.',
  category: 'Effects',
  author: 'VJ',
  version: '1.0.0',
  folder: 'effects',
  replacesVideo: false,
  canBeGlobal: true,
  parameters: [
    { name: 'sensitivity', type: 'number', min: 0.1, max: 4.0, step: 0.1, value: 4.0, description: 'Contrast boost before detection' },
    { name: 'threshold', type: 'number', min: 0.0, max: 1.0, step: 0.01, value: 0.56, description: 'Brightness threshold (0-1)' },
    { name: 'trackColor', type: 'color', value: '#ffffff', description: 'Color to track (white = brightness mode)' },
    { name: 'count', type: 'number', min: 1, max: 16, step: 1, value: 12, description: 'Number of clips to track' },
    { name: 'clipSize', type: 'number', min: 0.05, max: 1.2, step: 0.01, value: 0.25, description: 'Size of each clip circle' },
    { name: 'borderWidth', type: 'number', min: 0.0, max: 0.05, step: 0.001, value: 0.008, description: 'Border thickness' },
    { name: 'borderColor', type: 'color', value: '#ffffff', description: 'Border color' },
    { name: 'dim', type: 'number', min: 0.0, max: 0.9, step: 0.01, value: 0.45, description: 'Dim background outside clips' },
    { name: 'scale', type: 'select', value: 'pentatonic', options: ['pentatonic', 'major', 'minor', 'chromatic'], description: 'Musical scale' },
    { name: 'soundOn', type: 'boolean', value: true, description: 'Enable sound' },
    { name: 'volume', type: 'number', value: -12, min: -24, max: 0, step: 1, description: 'Audio volume (dB)' },
  ],
};

const SCALES = {
  pentatonic: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'],
  major: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
  minor: ['C4', 'D4', 'Eb4', 'F4', 'G4', 'Ab4', 'Bb4', 'C5'],
  chromatic: ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function insertTopN(list, item, maxN, invert) {
  const score = item.score;
  let i = 0;
  for (; i < list.length; i++) {
    const s = list[i].score;
    const better = invert ? score < s : score > s;
    if (better) break;
  }
  list.splice(i, 0, item);
  if (list.length > maxN) list.length = maxN;
}

function parseColor(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

function pickTargets({ buf, analyzeSize, count, threshold, invert, minSeparation, targetColor }) {
  const total = analyzeSize * analyzeSize;
  const topK = Math.max(count * 8, count);
  const candidates = [];
  
  const colorTarget = targetColor ? parseColor(targetColor) : null;
  const useColorTracking = colorTarget && (colorTarget.r !== 1 || colorTarget.g !== 1 || colorTarget.b !== 1);

  for (let i = 0; i < total; i++) {
    const r = buf[i * 4 + 0] / 255;
    const g = buf[i * 4 + 1] / 255;
    const b = buf[i * 4 + 2] / 255;
    
    let score;
    if (useColorTracking && colorTarget) {
      const dr = r - colorTarget.r;
      const dg = g - colorTarget.g;
      const db = b - colorTarget.b;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      score = 1.0 - (distance / Math.sqrt(3));
    } else {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      score = invert ? (1.0 - y) : y;
    }
    
    const pass = invert ? score >= (1.0 - threshold) : score >= threshold;
    if (!pass) continue;
    insertTopN(candidates, { idx: i, score }, topK, invert);
  }

  const picks = [];
  const minSep = Math.max(0, Math.floor(minSeparation || 0));
  const minSep2 = minSep * minSep;

  for (let c = 0; c < candidates.length && picks.length < count; c++) {
    const idx = candidates[c].idx;
    const x = idx % analyzeSize;
    const y = Math.floor(idx / analyzeSize);
    let ok = true;
    if (minSep > 0) {
      for (let p = 0; p < picks.length; p++) {
        const dx = x - picks[p].px;
        const dy = y - picks[p].py;
        if (dx * dx + dy * dy < minSep2) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    picks.push({ idx, px: x, py: y });
  }

  while (picks.length < count) picks.push({ idx: -1, px: 0, py: 0 });
  return picks;
}

export default function VideoTrackerClips({
  threshold = 0.56,
  sensitivity = 4.0,
  trackColor = '#ffffff',
  count = 12,
  clipSize = 0.25,
  borderWidth = 0.008,
  borderColor = '#ffffff',
  dim = 0.45,
  scale = 'pentatonic',
  soundOn = true,
  volume = -12,
  videoTexture,
  isGlobal = false,
  compositionWidth,
  compositionHeight,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useThree, useFrame } = r3f;

  const downscale = 96;
  const minSeparation = 6;
  const trail = 0.7;
  const invert = false;

  const meshRef = useRef(null);
  const clipMeshRefs = useRef([]);
  const positionStatesRef = useRef([]);
  const prevIdxRef = useRef([]);
  const toneRef = useRef(null);
  const lastSoundTimeRef = useRef([]);

  let gl, scene, camera, size;
  try {
    const ctx = useThree();
    if (ctx) {
      gl = ctx.gl;
      scene = ctx.scene;
      camera = ctx.camera;
      size = ctx.size;
    }
  } catch {}

  const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);
  const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);

  const trackerCount = Math.max(1, Math.min(16, Math.floor(count || 1)));
  const analyzeSize = Math.max(8, Math.min(256, Math.floor(downscale || 96)));
  const sTrail = Math.max(0.0, Math.min(0.99, trail));

  // Audio setup
  useEffect(() => {
    const Tone = globalThis.Tone;
    if (!Tone) return;
    try {
      const synths = [];
      for (let i = 0; i < trackerCount; i++) {
        const synth = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4 },
        }).toDestination();
        synth.volume.value = volume;
        synths.push(synth);
      }
      toneRef.current = { Tone, synths };
      lastSoundTimeRef.current = new Array(trackerCount).fill(-999);
    } catch (e) {
      try { console.warn('VideoTrackerClips Tone init failed:', e); } catch (_) {}
    }
    return () => {
      if (toneRef.current) {
        toneRef.current.synths.forEach(s => {
          try { s.dispose(); } catch (_) {}
        });
        toneRef.current = null;
      }
    };
  }, [trackerCount, volume]);

  // Offscreen capture for global mode
  const captureTarget = useMemo(() => {
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
  useEffect(() => () => { try { captureTarget && captureTarget.dispose(); } catch {} }, [captureTarget]);

  const analyzeTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(analyzeSize, analyzeSize, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, [analyzeSize]);
  useEffect(() => () => { try { analyzeTarget && analyzeTarget.dispose(); } catch {} }, [analyzeTarget]);

  const blitMaterial = useMemo(() => {
    const vs = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
    const fs = `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uGain; void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb = clamp(c.rgb * uGain, 0.0, 1.0); gl_FragColor = c; }`;
    return new THREE.ShaderMaterial({
      vertexShader: vs,
      fragmentShader: fs,
      uniforms: { tDiffuse: { value: null }, uGain: { value: sensitivity } },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }, [sensitivity]);

  const blitScene = useMemo(() => new THREE.Scene(), []);
  const blitCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const blitQuad = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, blitMaterial);
    blitScene.add(mesh);
    return mesh;
  }, [blitMaterial, blitScene]);
  useEffect(() => () => { try { blitQuad.geometry && blitQuad.geometry.dispose(); } catch {} }, [blitQuad]);

  const aspect = useMemo(() => {
    try {
      if (size && size.width > 0 && size.height > 0) return size.width / size.height;
    } catch {}
    return effectiveW / effectiveH;
  }, [size, effectiveW, effectiveH]);

  const getSourceTexture = () => {
    if (isGlobal && captureTarget) return captureTarget.texture;
    if (videoTexture) return videoTexture;
    return null;
  };

  // Dim overlay (makes clips obvious even when showing the same video)
  const dimPlaneGeometry = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  useEffect(() => () => { try { dimPlaneGeometry && dimPlaneGeometry.dispose && dimPlaneGeometry.dispose(); } catch {} }, [dimPlaneGeometry]);

  const dimMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#000000'),
      transparent: true,
      opacity: clamp01(Number(dim) || 0),
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return m;
  }, [dim]);
  useEffect(() => () => { try { dimMaterial && dimMaterial.dispose && dimMaterial.dispose(); } catch {} }, [dimMaterial]);

  const dimMeshObject = useMemo(() => {
    const mesh = new THREE.Mesh(dimPlaneGeometry, dimMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    return mesh;
  }, [dimPlaneGeometry, dimMaterial]);

  // Clip shader material (circular mask revealing video)
  const clipMaterials = useMemo(() => {
    const arr = new Array(trackerCount);
    const border = new THREE.Color(borderColor);
    for (let i = 0; i < trackerCount; i++) {
      const vs = `
        varying vec2 vUv;
        varying vec2 vScreenUv;
        uniform float uAspect;
        void main() {
          vUv = uv;
          // Calculate screen-space UV for video sampling
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vScreenUv = vec2(
            (worldPos.x / uAspect) * 0.5 + 0.5,
            worldPos.y * 0.5 + 0.5
          );
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `;
      const fs = `
        varying vec2 vUv;
        varying vec2 vScreenUv;
        uniform sampler2D tVideo;
        uniform vec3 uBorderColor;
        uniform float uBorderWidth;
        void main() {
          vec2 center = vec2(0.5, 0.5);
          float dist = distance(vUv, center);
          
          // Circular clip mask
          if (dist > 0.5) discard;
          
          // Border ring
          float borderStart = 0.5 - uBorderWidth;
          float borderAlpha = smoothstep(borderStart - 0.02, borderStart, dist);
          
          // Sample video from screen-space position
          vec4 videoColor = texture2D(tVideo, vScreenUv);
          // Slight boost so the clip reads as an element
          vec3 boosted = pow(videoColor.rgb, vec3(0.92));
          boosted = clamp(boosted * 1.12, 0.0, 1.0);
          vec3 finalColor = mix(boosted, uBorderColor, borderAlpha);
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `;
      arr[i] = new THREE.ShaderMaterial({
        vertexShader: vs,
        fragmentShader: fs,
        uniforms: {
          tVideo: { value: null },
          uBorderColor: { value: border },
          uBorderWidth: { value: borderWidth },
          uAspect: { value: aspect },
        },
        transparent: false,
        depthTest: false,
        depthWrite: false,
      });
      arr[i].toneMapped = false;
    }
    return arr;
  }, [trackerCount, borderColor, borderWidth, aspect]);

  // Create clip mesh objects (like WhiteTrackerSquares creates line objects)
  const clipGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => { try { clipGeometry && clipGeometry.dispose && clipGeometry.dispose(); } catch {} }, [clipGeometry]);
  
  const clipMeshObjects = useMemo(() => {
    const arr = new Array(trackerCount);
    for (let i = 0; i < trackerCount; i++) {
      arr[i] = new THREE.Mesh(clipGeometry, clipMaterials[i]);
      arr[i].frustumCulled = false;
      arr[i].visible = false; // Start hidden until detection
      arr[i].renderOrder = 3;
    }
    return arr;
  }, [trackerCount, clipGeometry, clipMaterials]);

  // Outline objects (so you always see trackers, like WhiteTrackerSquares)
  const outlineMaterial = useMemo(() => {
    const m = new THREE.LineBasicMaterial({
      color: new THREE.Color(borderColor),
      transparent: true,
      opacity: 0.95,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });
    return m;
  }, [borderColor]);
  useEffect(() => () => { try { outlineMaterial && outlineMaterial.dispose && outlineMaterial.dispose(); } catch {} }, [outlineMaterial]);

  const outlineGeometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const edges = new THREE.EdgesGeometry(base);
    try { base.dispose(); } catch {}
    return edges;
  }, []);
  useEffect(() => () => { try { outlineGeometry && outlineGeometry.dispose && outlineGeometry.dispose(); } catch {} }, [outlineGeometry]);

  const outlineObjects = useMemo(() => {
    const arr = new Array(trackerCount);
    for (let i = 0; i < trackerCount; i++) {
      arr[i] = new THREE.LineSegments(outlineGeometry, outlineMaterial);
      arr[i].frustumCulled = false;
      arr[i].visible = false;
      arr[i].renderOrder = 4;
    }
    return arr;
  }, [trackerCount, outlineGeometry, outlineMaterial]);

  useEffect(() => {
    clipMeshRefs.current = new Array(trackerCount);
    positionStatesRef.current = new Array(trackerCount).fill(0).map(() => ({ x: 0, y: 0, initialized: false }));
    prevIdxRef.current = new Array(trackerCount).fill(-2);
    return () => {
      try {
        for (const m of clipMaterials) {
          try { m && m.dispose(); } catch {}
        }
      } catch {}
    };
  }, [trackerCount, clipMaterials]);

  const pixelBufferRef = useRef(null);
  if (!pixelBufferRef.current) pixelBufferRef.current = new Uint8Array(analyzeSize * analyzeSize * 4);

  useFrame((state) => {
    if (!gl) return;

    // For global mode, capture scene first
    if (isGlobal && captureTarget && scene && camera && meshRef.current) {
      const prevTarget = gl.getRenderTarget();
      const wasVisible = meshRef.current.visible;
      meshRef.current.visible = false;
      try {
        gl.setRenderTarget(captureTarget);
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(prevTarget);
        meshRef.current.visible = wasVisible;
      }
    }

    const src = getSourceTexture();
    if (!src) return;

    // Blit into analyzeTarget
    const prevAutoClear = gl.autoClear;
    gl.autoClear = false;
    const prev = gl.getRenderTarget();
    try {
      blitMaterial.uniforms.tDiffuse.value = src;
      blitMaterial.uniforms.uGain.value = sensitivity;
      gl.setRenderTarget(analyzeTarget);
      gl.clear(true, true, true);
      gl.render(blitScene, blitCamera);
    } finally {
      gl.setRenderTarget(prev);
      gl.autoClear = prevAutoClear;
    }

    // Read pixels
    try {
      gl.readRenderTargetPixels(analyzeTarget, 0, 0, analyzeSize, analyzeSize, pixelBufferRef.current);
    } catch {}

    const buf = pixelBufferRef.current;
    if (!buf) return;

    const picks = pickTargets({
      buf,
      analyzeSize,
      count: trackerCount,
      threshold: clamp01(threshold),
      invert: !!invert,
      minSeparation,
      targetColor: trackColor,
    });

    const currentTime = state?.clock?.elapsedTime || 0;
    const scaleNotes = SCALES[scale] || SCALES.pentatonic;

    // Hide all clips first
    for (let i = 0; i < trackerCount; i++) {
      const mesh = clipMeshRefs.current[i];
      if (mesh) mesh.visible = false;
      const ol = outlineObjects[i];
      if (ol) ol.visible = false;
    }

    for (let i = 0; i < trackerCount; i++) {
      const pick = picks[i];
      if (!pick) continue;

      let targetX = 0;
      let targetY = 0;
      if (pick.idx >= 0) {
        const u = (pick.px + 0.5) / analyzeSize;
        const v = 1.0 - (pick.py + 0.5) / analyzeSize;
        targetX = (u - 0.5) * 2.0 * aspect;
        targetY = (v - 0.5) * 2.0;
      }

      const st = positionStatesRef.current[i];
      if (!st) continue;

      if (pick.idx >= 0) {
        if (!st.initialized) {
          st.x = targetX;
          st.y = targetY;
          st.initialized = true;
        } else {
          st.x = st.x * sTrail + targetX * (1.0 - sTrail);
          st.y = st.y * sTrail + targetY * (1.0 - sTrail);
        }

        const mesh = clipMeshRefs.current[i];
        if (mesh) {
          mesh.position.set(st.x, st.y, 0.1);
          mesh.visible = true;
          // Update video texture and aspect in shader
          if (mesh.material && mesh.material.uniforms) {
            mesh.material.uniforms.tVideo.value = src;
            mesh.material.uniforms.uAspect.value = aspect;
          }
        }
        const ol = outlineObjects[i];
        if (ol) {
          ol.position.set(st.x, st.y, 0.11);
          ol.visible = true;
        }

        // Trigger sound on new detection
        const prevIdx = prevIdxRef.current[i];
        const changed = prevIdx !== pick.idx;
        prevIdxRef.current[i] = pick.idx;
        
        if (changed && soundOn && toneRef.current) {
          const lastTime = lastSoundTimeRef.current[i] || -999;
          if (currentTime - lastTime > 0.1) { // Throttle sounds
            lastSoundTimeRef.current[i] = currentTime;
            try {
              const t = toneRef.current;
              if (t.Tone.context.state === 'suspended') t.Tone.context.resume();
              if (t.Tone.context.state !== 'suspended' && t.synths[i]) {
                const note = scaleNotes[i % scaleNotes.length];
                t.synths[i].triggerAttackRelease(note, '8n');
              }
            } catch (_) {}
          }
        }
      }
    }
  });

  const safeClipSize = Math.max(0.001, clipSize);

  const children = [];

  // Background dimmer
  children.push(
    React.createElement('primitive', {
      key: 'dim',
      object: dimMeshObject,
      scale: [aspect, 1, 1],
      position: [0, 0, 0.05],
    })
  );

  for (let i = 0; i < trackerCount; i++) {
    children.push(
      React.createElement('primitive', {
        key: `clip-${i}`,
        object: clipMeshObjects[i],
        ref: (r) => { clipMeshRefs.current[i] = r; },
        scale: [safeClipSize, safeClipSize, 1],
      })
    );
    children.push(
      React.createElement('primitive', {
        key: `outline-${i}`,
        object: outlineObjects[i],
        scale: [safeClipSize, safeClipSize, 1],
      })
    );
  }

  return React.createElement('group', { ref: meshRef }, ...children);
}
