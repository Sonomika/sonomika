import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { registerEffect } from '../../utils/effectRegistry';

interface SkeletalBlendSourceProps {
  modelUrl?: string; // GLB/GLTF with at least 3 animations: idle, walk, run
  showModel?: boolean;
  showSkeleton?: boolean;
  idleWeight?: number;
  walkWeight?: number;
  runWeight?: number;
  timeScale?: number;
  crossfadeDuration?: number; // used when toggling presets (not used automatically)
  scale?: number; // additional uniform scale after fit
  offsetX?: number; // horizontal position offset in world units
  offsetY?: number; // vertical position offset in world units
  rotationX?: number; // radians
  rotationY?: number; // radians
  rotationZ?: number; // radians
}

const resolveUrl = (url: string): string => {
  const u = (url || '').trim();
  if (!u) return '';
  if (u.startsWith('http') || u.startsWith('file://') || u.startsWith('/')) return u;
  if (/^[A-Za-z]:[\\/]/.test(u)) return 'file:///' + u.replace(/\\/g, '/');
  return u;
};

const SkeletalBlendSource: React.FC<SkeletalBlendSourceProps> = ({
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
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load GLB model with animations
  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    const url = resolveUrl(modelUrl);

    loader.load(
      url,
      (gltf) => {
        if (disposed) return;

        // Clean previous
        if (modelRef.current && groupRef.current) {
          try { groupRef.current.remove(modelRef.current); } catch {}
        }
        if (skeletonHelperRef.current && groupRef.current) {
          try { groupRef.current.remove(skeletonHelperRef.current); } catch {}
        }
        actionsRef.current = [];
        mixerRef.current?.stopAllAction();
        mixerRef.current = null;

        const model = gltf.scene;
        model.traverse((o: any) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
          }
        });

        // Fit model to a pleasant size and centre at origin
        try {
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          const centre = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(centre);
          model.position.sub(centre);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const fit = 1.2 / maxDim; // target size matching webcam plane height-ish
          model.scale.multiplyScalar(fit * scale);
          model.position.z += 0.05;
        } catch {}

        // Mixer and actions
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        const animations = gltf.animations || [];
        // Try to map actions similar to three.js example indices
        const idle = animations[0] ? mixer.clipAction(animations[0]) : null;
        const run = animations[1] ? mixer.clipAction(animations[1]) : null;
        const walk = animations[3] ? mixer.clipAction(animations[3]) : null;
        const actions: THREE.AnimationAction[] = [];
        if (idle) actions.push(idle);
        if (walk) actions.push(walk);
        if (run) actions.push(run);
        actionsRef.current = actions;
        actions.forEach((a) => { a.enabled = true; a.play(); });

        // Skeleton helper
        const helper = new THREE.SkeletonHelper(model as any);
        helper.visible = showSkeleton;

        modelRef.current = model;
        skeletonHelperRef.current = helper;
        if (groupRef.current) {
          groupRef.current.add(model);
          groupRef.current.add(helper);
        }

        setLoaded(true);
      },
      undefined,
      (err) => {
        console.error('GLTF load error:', { err, url });
      }
    );
    return () => {
      disposed = true;
      // cleanup actions/mixer but leave GLTF disposal to three cache/browser for now
    };
  }, [modelUrl, scale]);

  // Update visibility toggles
  useEffect(() => {
    if (modelRef.current) modelRef.current.visible = !!showModel;
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = !!showSkeleton;
  }, [showModel, showSkeleton]);

  // Update weights and timeScale per frame
  useFrame((state, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.timeScale = Math.max(0, Number(timeScale) || 0);

    const [idle, walk, run] = actionsRef.current;
    if (idle) {
      idle.setEffectiveWeight(Math.max(0, Math.min(1, Number(idleWeight) || 0)));
      idle.setEffectiveTimeScale(1);
    }
    if (walk) {
      walk.setEffectiveWeight(Math.max(0, Math.min(1, Number(walkWeight) || 0)));
      walk.setEffectiveTimeScale(1);
    }
    if (run) {
      run.setEffectiveWeight(Math.max(0, Math.min(1, Number(runWeight) || 0)));
      run.setEffectiveTimeScale(1);
    }
    mixer.update(delta);
  });

  return (
    <group ref={groupRef} position={[offsetX, offsetY, 0]} rotation={[rotationX, rotationY, rotationZ]}>
      {/* Local lights for better default look */}
      <hemisphereLight args={[0xffffff, 0x8d8d8d, 1.2]} position={[0, 2, 0]} />
      <directionalLight args={[0xffffff, 1.0]} position={[-3, 3, -3]} />
      {/* ground reference (subtle). Keep minimal to follow UI rules (no clutter) */}
      {/* Intentionally not adding visible ground mesh to keep scene minimal */}
    </group>
  );
};

(SkeletalBlendSource as any).metadata = {
  name: 'Skeletal Blend Source',
  description: 'GLTF skeletal animation blending (idle/walk/run) with weights',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
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
  ]
};

registerEffect('skeletal-blend-source', SkeletalBlendSource);
registerEffect('SkeletalBlendSource', SkeletalBlendSource);

export default SkeletalBlendSource;


