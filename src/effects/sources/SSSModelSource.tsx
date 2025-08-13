import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { SubsurfaceScatteringShader } from 'three/examples/jsm/shaders/SubsurfaceScatteringShader.js';
import { registerEffect } from '../../utils/effectRegistry';

interface SSSModelSourceProps {
	modelUrl?: string; // Absolute/relative path or file:// URL to an FBX model
	albedoMapUrl?: string; // Albedo/diffuse texture
	thicknessMapUrl?: string; // Thickness map for SSS
	rotationSpeed?: number;
	scale?: number;
}

const SSSModelSource: React.FC<SSSModelSourceProps> = ({
	modelUrl = '',
	albedoMapUrl = '',
	thicknessMapUrl = '',
	rotationSpeed = 0.2,
	scale = 1
}) => {
	const groupRef = useRef<THREE.Group>(null);
	const modelRef = useRef<THREE.Object3D | null>(null);
	const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null);
	const textureLoader = useMemo(() => new THREE.TextureLoader(), []);

	// Lights local to this source (since shader uses lighting)
    // Lights will be declared directly in JSX to avoid invalid <primitive> usage

  const createSolidTexture = (r: number, g: number, b: number, a: number = 255) => {
    const data = new Uint8Array([r, g, b, a]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  };

  const resolveUrl = (url: string): string => {
    if (!url) return '';
    const u = url.trim();
    if (u.startsWith('http') || u.startsWith('file://') || u.startsWith('/')) return u;
    // Windows absolute path like C:\path or C:/path
    if (/^[A-Za-z]:[\\/]/.test(u)) {
      return 'file:///' + u.replace(/\\/g, '/');
    }
    // Otherwise pass through (relative to app)
    return u;
  };

  // Create SSS shader material
	useEffect(() => {
		const shader = SubsurfaceScatteringShader as any;
		const uniforms = THREE.UniformsUtils.clone(shader.uniforms);

		// Load maps if provided; otherwise use defaults
    let albedo: THREE.Texture | null = null;
    let thickness: THREE.Texture | null = null;
    try {
      if (albedoMapUrl) {
        albedo = textureLoader.load(resolveUrl(albedoMapUrl));
        (albedo as any).colorSpace = (THREE as any).SRGBColorSpace || undefined;
      }
    } catch {}
    try {
      if (thicknessMapUrl) {
        thickness = textureLoader.load(resolveUrl(thicknessMapUrl));
      }
    } catch {}
    // Fallbacks to avoid shader sampling null
    if (!albedo) albedo = createSolidTexture(255, 255, 255, 255);
    if (!thickness) thickness = createSolidTexture(0, 0, 0, 255);

		uniforms['map'].value = albedo || null;
		uniforms['diffuse'].value = new THREE.Vector3(1.0, 0.2, 0.2);
		uniforms['shininess'].value = 500;
		uniforms['thicknessMap'].value = thickness || null;
		uniforms['thicknessColor'].value = new THREE.Vector3(0.5, 0.3, 0.0);
		uniforms['thicknessDistortion'].value = 0.1;
		uniforms['thicknessAmbient'].value = 0.4;
		uniforms['thicknessAttenuation'].value = 0.8;
		uniforms['thicknessPower'].value = 2.0;
		uniforms['thicknessScale'].value = 16.0;

		const mat = new THREE.ShaderMaterial({
			uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader,
			lights: true,
			transparent: false
		});
		setMaterial(mat);
		return () => {
			mat.dispose();
		};
	}, [albedoMapUrl, thicknessMapUrl, textureLoader]);

  // Load FBX model
	useEffect(() => {
    if (!modelUrl || !material) return;
		let disposed = false;
		const loader = new FBXLoader();
    const url = resolveUrl(modelUrl);
    // Set resource path to model folder for relative assets referenced by FBX
    try {
      const baseMatch = url.match(/^(.*)[/\\][^/\\]*$/);
      if (baseMatch) (loader as any).setResourcePath?.(baseMatch[1] + '/');
    } catch {}
    loader.load(
      url,
      (object) => {
        if (disposed) return;

        // Always work with the full object to keep FBX transforms
        const root = object as THREE.Object3D;

        // Apply shader to all meshes
        try {
          (root as any).traverse?.((child: any) => {
            if (child.isMesh) {
              child.material = material;
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });
        } catch {}

        // Centre and fit to a target size in world units, then apply prop scale
        const box = new THREE.Box3().setFromObject(root);
        if (!isFinite(box.max.x) || !isFinite(box.max.y) || !isFinite(box.max.z)) {
          console.warn('Empty bounding box from FBX, skipping fit step');
        } else {
          const size = new THREE.Vector3();
          const centre = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(centre);
          console.log('FBX box size', size, 'centre', centre);

          // Move the model so its centre is at the origin
          root.position.sub(centre);

          // Scale to fit target diagonal
          const target = 0.6; // fits nicely in default R3F view
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const fit = target / maxDim;
          root.scale.multiplyScalar(fit * scale);

          // Nudge slightly forward so it is not exactly at z = 0
          root.position.z += 0.05;
        }

        modelRef.current = root;
        if (groupRef.current) {
          groupRef.current.add(root);
        }
      },
      (ev) => { try { console.log('FBX progress', (ev as any)?.loaded, '/', (ev as any)?.total); } catch {} },
			(err) => {
        console.error('FBX load error:', { err, url });
			}
		);
		return () => {
			disposed = true;
			if (groupRef.current && modelRef.current) {
				try { groupRef.current.remove(modelRef.current); } catch {}
			}
			modelRef.current = null;
		};
	}, [modelUrl, material, scale]);

	// Rotate the model
	useFrame((state) => {
		if (modelRef.current) {
			modelRef.current.rotation.y = state.clock.elapsedTime * rotationSpeed;
		}
	});

	return (
		<group ref={groupRef}>
			{/* Local lights */}
			<ambientLight color={0xc1c1c1} intensity={1.0} />
			<directionalLight color={0xffffff} intensity={0.1} position={[0, 0.5, 0.5]} />
			<pointLight color={0xc1c1c1} intensity={4.0} distance={3} position={[0, -0.05, 0.35]} />
			<pointLight color={0xc1c100} intensity={0.75} distance={5} position={[-0.1, 0.02, -0.26]} />
			{/* If no model, render a placeholder sphere with the material so SSS still visible */}
			{!modelRef.current && material && (
				<mesh position={[0, 0, 0.05]}>
					<sphereGeometry args={[0.3, 32, 32]} />
					<meshStandardMaterial color={0xaa4444} />
				</mesh>
			)}
		</group>
	);
};

(SSSModelSource as any).metadata = {
	name: 'SSS Model Source',
	description: 'FBX model with subsurface scattering shader',
	category: 'Sources',
	icon: '',
	author: 'VJ System',
	version: '1.0.0',
	folder: 'sources',
	isSource: true,
  parameters: [
    { name: 'modelUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/fbx/stanford-bunny.fbx', description: 'FBX model URL or file path (file://...)' },
    { name: 'albedoMapUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/fbx/white.jpg', description: 'Albedo texture URL (optional)' },
    { name: 'thicknessMapUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/fbx/bunny_thickness.jpg', description: 'Thickness map URL (optional)' },
		{ name: 'rotationSpeed', type: 'number', value: 0.2, min: 0, max: 5, step: 0.01, description: 'Rotation speed' },
		{ name: 'scale', type: 'number', value: 1, min: 0.01, max: 10, step: 0.01, description: 'Model scale' }
	]
};

registerEffect('sss-model-source', SSSModelSource);
registerEffect('SSSModelSource', SSSModelSource);

export default SSSModelSource;


