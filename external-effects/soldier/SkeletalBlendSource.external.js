// Portable external THREE.js source (no imports). Use with globals:
// window.React, window.THREE, window.r3f, optional window.THREE.GLTFLoader
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useEffect, useMemo, useState } = React || {};
const useThree = (r3f && r3f.useThree) || (() => null);
const useFrame = (r3f && r3f.useFrame) || (() => {});

export const metadata = {
  name: 'Skeletal Blend (External Source)',
  description: 'Minimal skeletal animation demo. Loads Soldier.glb if GLTFLoader is available; otherwise shows a fallback animation.',
  category: 'Sources',
  author: 'You',
  version: '1.0.0',
  // Mark as a Source so it appears under Sources in the browser
  isSource: true,
  replacesVideo: true,
  parameters: [
    { name: 'timeScale', type: 'number', value: 1.0, min: 0.0, max: 2.0, step: 0.01 },
    { name: 'showSkeleton', type: 'boolean', value: false },
    { name: 'groundColor', type: 'color', value: '#262626' },
    { name: 'modelURL', type: 'string', value: '' },
    { name: 'gltfLoaderURL', type: 'string', value: '' },
  ],
};

export default function SkeletalBlendSourceExternal({
  timeScale = 1.0,
  showSkeleton = false,
  groundColor = '#262626',
  modelURL = '',
  gltfLoaderURL = '',
}) {
  if (!React || !THREE || !r3f) return null;

  const groupRef = useRef(null);
  const skeletonHelperRef = useRef(null);
  const mixerRef = useRef(null);
  const actionsRef = useRef({ idle: null, walk: null, run: null });
  const [modelLoaded, setModelLoaded] = useState(false);

  const { scene } = useThree() || {};

  // Lights are created as React elements; materials cached
  const groundColorObj = useMemo(() => new THREE.Color(groundColor), [groundColor]);
  // Ensure a usable model URL even if the parameter is an empty string
  const effectiveModelURL = useMemo(() => {
    const s = (modelURL == null ? '' : String(modelURL)).trim();
    return s.length > 0 ? s : '';
  }, [modelURL]);

  // Dynamically ensure GLTFLoader global is available (UMD) and load model
  useEffect(() => {
    if (!groupRef.current) return;

    let disposed = false;

    const ensureGLTFLoader = () => new Promise((resolve) => {
      if (typeof THREE.GLTFLoader === 'function') return resolve(THREE.GLTFLoader);
      if (globalThis && typeof globalThis.GLTFLoader === 'function') return resolve(globalThis.GLTFLoader);
      const s = (gltfLoaderURL == null ? '' : String(gltfLoaderURL)).trim();
      if (!s) return resolve(null); // respect CSP: only load if user provides a self-hosted path
      const id = 'three-gltfloader-umd-self';
      const existing = document.getElementById(id);
      if (existing) {
        existing.addEventListener('load', () => resolve(THREE.GLTFLoader));
        existing.addEventListener('error', () => resolve(null));
        return;
      }
      const script = document.createElement('script');
      script.id = id;
      script.src = s;
      script.async = true;
      script.onload = () => resolve(THREE.GLTFLoader);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });

    const start = async () => {
      const LoaderCtor = await ensureGLTFLoader();
      if (disposed || !LoaderCtor) return;
      const loader = new LoaderCtor();
      try { if (loader.setCrossOrigin) loader.setCrossOrigin('anonymous'); } catch {}
      loader.load(
        effectiveModelURL,
        (gltf) => {
          if (disposed) return;
          const model = gltf.scene;
          model.traverse((obj) => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
          groupRef.current.add(model);

          const skeletonHelper = new THREE.SkeletonHelper(model);
          skeletonHelper.visible = !!showSkeleton;
          skeletonHelperRef.current = skeletonHelper;
          groupRef.current.add(skeletonHelper);

          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          const animations = gltf.animations || [];
          const idle = animations[0] ? mixer.clipAction(animations[0]) : null;
          const run = animations[1] ? mixer.clipAction(animations[1]) : null;
          const walk = animations[3] ? mixer.clipAction(animations[3]) : null;
          actionsRef.current = { idle, walk, run };
          [idle, walk, run].forEach((a) => a && a.play());
          try { setModelLoaded(true); } catch {}
          if (fallbackRef.current) fallbackRef.current.visible = false;
        },
        undefined,
        (err) => {
          console.warn('[External Source] GLTF load failed:', err);
        }
      );
    };

    start();

    return () => {
      disposed = true;
      try { if (mixerRef.current) mixerRef.current.stopAllAction(); } catch {}
      try { if (skeletonHelperRef.current && groupRef.current) groupRef.current.remove(skeletonHelperRef.current); } catch {}
      mixerRef.current = null; actionsRef.current = { idle: null, walk: null, run: null };
      try { setModelLoaded(false); } catch {}
    };
  }, [effectiveModelURL, gltfLoaderURL, showSkeleton]);

  // Reflect skeleton visibility changes
  useEffect(() => {
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = !!showSkeleton;
  }, [showSkeleton]);

  // Advance animation if mixer present; otherwise animate fallback mesh rotation
  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (mixer) {
      mixer.update(Math.max(0, delta) * Math.max(0, timeScale));
    }
  });

  // Basic hemisphere + directional light like the example
  const lights = (
    React.createElement(React.Fragment, null,
      React.createElement('hemisphereLight', { args: [0xffffff, 0x8d8d8d, 3], position: [0, 20, 0] }),
      React.createElement('directionalLight', {
        args: [0xffffff, 3], position: [-3, 10, -10], castShadow: true,
      }),
    )
  );

  // Ground plane matching the original example style
  const ground = React.createElement('mesh', {
    rotation: [-Math.PI / 2, 0, 0], receiveShadow: true,
  },
    React.createElement('planeGeometry', { args: [100, 100] }),
    React.createElement('meshPhongMaterial', { color: groundColorObj, depthWrite: false })
  );

  // Fallback animated mesh (only visible if GLTF failed or loader missing)
  const fallback = React.createElement('mesh', {
    position: [0, 1, 0], castShadow: true,
  },
    React.createElement('torusKnotGeometry', { args: [0.5, 0.2, 128, 32] }),
    React.createElement('meshStandardMaterial', { color: '#aaaaaa', metalness: 0.2, roughness: 0.6 })
  );

  // Spin fallback subtly to show life even without GLTF
  const fallbackRef = useRef(null);
  useFrame((_, delta) => {
    if (!mixerRef.current && fallbackRef.current) {
      fallbackRef.current.rotation.y += delta * 0.5 * Math.max(0.2, timeScale);
    }
    // Keep visibility in sync even without re-render
    if (fallbackRef.current) fallbackRef.current.visible = !mixerRef.current && !modelLoaded;
  });

  return React.createElement('group', { ref: groupRef },
    lights,
    ground,
    React.createElement('group', { ref: fallbackRef, visible: !mixerRef.current && !modelLoaded }, fallback)
  );
}


