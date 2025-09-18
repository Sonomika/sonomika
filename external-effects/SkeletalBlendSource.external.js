// Portable external Skeletal Blend Source (no imports). Use with globals:
// window.React, window.THREE, window.r3f, and optionally window.GLTFLoader or THREE.GLTFLoader
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useEffect } = React || {};
const useFrame = (r3f && r3f.useFrame) || (() => {});

export const metadata = {
  name: 'Skeletal Blend Source (External)',
  description: 'GLTF skeletal animation blending (idle/walk/run) with weights',
  category: 'Sources',
  author: 'You',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'modelUrl', type: 'string', value: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb', description: 'GLB/GLTF URL or file path' },
    { name: 'showModel', type: 'boolean', value: true, description: 'Toggle model visibility' },
    { name: 'showSkeleton', type: 'boolean', value: false, description: 'Toggle skeleton helper' },
    { name: 'idleWeight', type: 'number', value: 1.0, min: 0, max: 1, step: 0.01, description: 'Idle action weight' },
    { name: 'walkWeight', type: 'number', value: 0.0, min: 0, max: 1, step: 0.01, description: 'Walk action weight' },
    { name: 'runWeight', type: 'number', value: 1.0, min: 0, max: 1, step: 0.01, description: 'Run action weight' },
    { name: 'timeScale', type: 'number', value: 1.0, min: 0, max: 1.5, step: 0.01, description: 'Global animation speed' },
    { name: 'crossfadeDuration', type: 'number', value: 2.0, min: 0, max: 10, step: 0.01, description: 'Reserved for programmatic crossfades' },
    { name: 'scale', type: 'number', value: 1.28, min: 0.01, max: 10, step: 0.01, description: 'Extra model scale' },
    { name: 'offsetX', type: 'number', value: 0.0, min: -2, max: 2, step: 0.01, description: 'Horizontal offset' },
    { name: 'offsetY', type: 'number', value: 0.14, min: -2, max: 2, step: 0.01, description: 'Vertical offset' },
    { name: 'rotationX', type: 'number', value: 0.3, min: -6.283, max: 6.283, step: 0.01, description: 'Rotation X (radians)' },
    { name: 'rotationY', type: 'number', value: -3.19, min: -6.283, max: 6.283, step: 0.01, description: 'Rotation Y (radians)' },
    { name: 'rotationZ', type: 'number', value: -0.05, min: -6.283, max: 6.283, step: 0.01, description: 'Rotation Z (radians)' },
  ],
};

function resolveUrl(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (u.startsWith('http') || u.startsWith('file://') || u.startsWith('/')) return u;
  if (/^[A-Za-z]:[\\/]/.test(u)) return 'file:///' + u.replace(/\\/g, '/');
  return u;
}

function ensureGLTFLoader() {
  // Return a Promise resolving to a loader instance. Injects script if missing.
  try {
    if (globalThis.GLTFLoader) return Promise.resolve(new globalThis.GLTFLoader());
    if (THREE && THREE.GLTFLoader) return Promise.resolve(new THREE.GLTFLoader());
  } catch {}

  const rev = (THREE && THREE.REVISION) ? String(THREE.REVISION) : '180';
  const version = `0.${rev}.0`;
  const candidates = [
    `https://unpkg.com/three@${version}/examples/js/loaders/GLTFLoader.js`,
    `https://cdn.jsdelivr.net/npm/three@${version}/examples/js/loaders/GLTFLoader.js`,
    'https://unpkg.com/three@latest/examples/js/loaders/GLTFLoader.js',
  ];

  const tryLoad = (urls, idx = 0) => new Promise((resolve, reject) => {
    if (idx >= urls.length) return reject(new Error('GLTFLoader script load failed'));
    const url = urls[idx];
    try {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => {
        try {
          if (globalThis.GLTFLoader) return resolve(new globalThis.GLTFLoader());
          if (THREE && THREE.GLTFLoader) return resolve(new THREE.GLTFLoader());
          // Try next candidate if symbol still missing
          tryLoad(urls, idx + 1).then(resolve).catch(reject);
        } catch (e) { tryLoad(urls, idx + 1).then(resolve).catch(reject); }
      };
      script.onerror = () => { tryLoad(urls, idx + 1).then(resolve).catch(reject); };
      document.head.appendChild(script);
    } catch (e) {
      tryLoad(urls, idx + 1).then(resolve).catch(reject);
    }
  });

  return tryLoad(candidates);
}

export default function SkeletalBlendSourceExternal({
  modelUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb',
  showModel = true,
  showSkeleton = false,
  idleWeight = 1,
  walkWeight = 0,
  runWeight = 1,
  timeScale = 1,
  crossfadeDuration = 2.0,
  scale = 1.28,
  offsetX = 0,
  offsetY = 0.14,
  rotationX = 0.3,
  rotationY = -3.19,
  rotationZ = -0.05,
}) {
  if (!React || !THREE || !r3f) return null;

  const groupRef = useRef(null);
  const modelRef = useRef(null);
  const skeletonHelperRef = useRef(null);
  const mixerRef = useRef(null);
  const actionsRef = useRef([]);

  useEffect(() => {
    let disposed = false;
    const url = resolveUrl(modelUrl);

    ensureGLTFLoader().then((loader) => {
      if (!loader) {
        console.warn('[SkeletalBlendSource.external] GLTFLoader could not be initialized.');
        return;
      }
      loader.load(
        url,
        (gltf) => {
        if (disposed) return;

        // remove previous
        try { if (groupRef.current && modelRef.current) groupRef.current.remove(modelRef.current); } catch {}
        try { if (groupRef.current && skeletonHelperRef.current) groupRef.current.remove(skeletonHelperRef.current); } catch {}
        actionsRef.current = [];
        try { mixerRef.current && mixerRef.current.stopAllAction(); } catch {}
        mixerRef.current = null;

        const model = gltf.scene;
        try {
          model.traverse((o) => { if (o && o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        } catch {}

        // fit and center
        try {
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          const centre = new THREE.Vector3();
          box.getSize(size); box.getCenter(centre);
          model.position.sub(centre);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const fit = 1.2 / maxDim;
          model.scale.multiplyScalar(fit * scale);
          model.position.z += 0.05;
        } catch {}

        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        const animations = (gltf && gltf.animations) || [];
        const idle = animations[0] ? mixer.clipAction(animations[0]) : null;
        const run = animations[1] ? mixer.clipAction(animations[1]) : null;
        const walk = animations[3] ? mixer.clipAction(animations[3]) : null;
        const actions = [];
        if (idle) actions.push(idle);
        if (walk) actions.push(walk);
        if (run) actions.push(run);
        actions.forEach((a) => { try { a.enabled = true; a.play(); } catch {} });
        actionsRef.current = actions;

        const helper = new THREE.SkeletonHelper(model);
        helper.visible = !!showSkeleton;

        modelRef.current = model;
        skeletonHelperRef.current = helper;
        if (groupRef.current) {
          try { groupRef.current.add(model); } catch {}
          try { groupRef.current.add(helper); } catch {}
        }
        },
        undefined,
        (err) => { console.error('[SkeletalBlendSource.external] GLTF load error:', { err, url }); }
      );
    }).catch(() => {
      console.warn('[SkeletalBlendSource.external] Failed to load GLTFLoader script.');
    });

    return () => { disposed = true; };
  }, [modelUrl, scale]);

  useEffect(() => {
    if (modelRef.current) modelRef.current.visible = !!showModel;
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = !!showSkeleton;
  }, [showModel, showSkeleton]);

  useFrame((_, delta) => {
    const mixer = mixerRef.current; if (!mixer) return;
    mixer.timeScale = Math.max(0, Number(timeScale) || 0);
    const [idle, walk, run] = actionsRef.current;
    try { if (idle) { idle.setEffectiveWeight(Math.max(0, Math.min(1, Number(idleWeight) || 0))); idle.setEffectiveTimeScale(1); } } catch {}
    try { if (walk) { walk.setEffectiveWeight(Math.max(0, Math.min(1, Number(walkWeight) || 0))); walk.setEffectiveTimeScale(1); } } catch {}
    try { if (run) { run.setEffectiveWeight(Math.max(0, Math.min(1, Number(runWeight) || 0))); run.setEffectiveTimeScale(1); } } catch {}
    try { mixer.update(delta); } catch {}
  });

  // Render
  return React && THREE ? React.createElement(
    'group',
    { ref: groupRef, position: [offsetX, offsetY, 0], rotation: [rotationX, rotationY, rotationZ] },
    React.createElement('hemisphereLight', { args: [0xffffff, 0x8d8d8d, 1.2], position: [0, 2, 0] }),
    React.createElement('directionalLight', { args: [0xffffff, 1.0], position: [-3, 3, -3] }),
  ) : null;
}


