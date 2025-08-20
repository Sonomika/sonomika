import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface WireframeHeadSourceProps {
  modelUrl?: string;
  thickness?: number;
  showLeftBasic?: boolean;
}

const vertexShader = /* glsl */ `
  attribute vec3 center;
  varying vec3 vCenter;
  void main() {
    vCenter = center;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float thickness;
  varying vec3 vCenter;
  void main() {
    vec3 afwidth = fwidth(vCenter.xyz);
    vec3 edge3 = smoothstep((thickness - 1.0) * afwidth, thickness * afwidth, vCenter.xyz);
    float edge = 1.0 - min(min(edge3.x, edge3.y), edge3.z);
    gl_FragColor.rgb = gl_FrontFacing ? vec3(0.9, 0.9, 1.0) : vec3(0.4, 0.4, 0.5);
    gl_FragColor.a = edge;
  }
`;

const resolveUrl = (url: string): string => {
  const u = (url || '').trim();
  if (!u) return '';
  if (u.startsWith('http') || u.startsWith('file://') || u.startsWith('/')) return u;
  if (/^[A-Za-z]:[\\/]/.test(u)) return 'file:///' + u.replace(/\\/g, '/');
  return u;
};

const WireframeHeadSource: React.FC<WireframeHeadSourceProps> = ({
  modelUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/json/WaltHeadLo_buffergeometry.json',
  thickness = 1,
  showLeftBasic = true
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  // Load BufferGeometry JSON
  useEffect(() => {
    let disposed = false;
    const loader = new (THREE as any).BufferGeometryLoader();
    const url = resolveUrl(modelUrl);
    loader.load(
      url,
      (geo: THREE.BufferGeometry) => {
        if (disposed) return;
        // Remove normals/uvs as in example (not needed for this shader)
        geo.deleteAttribute('normal');
        geo.deleteAttribute('uv');
        // Create 'center' attribute
        const position = geo.getAttribute('position');
        const centers = new Float32Array(position.count * 3);
        const vectors = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
        for (let i = 0, l = position.count; i < l; i++) {
          vectors[i % 3].toArray(centers, i * 3);
        }
        geo.setAttribute('center', new THREE.BufferAttribute(centers, 3));
        // Normalize to unit size and center
        const box = new THREE.Box3().setFromObject(new THREE.Mesh(geo as any));
        const size = new THREE.Vector3();
        const centre = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(centre);
        geo.translate(-centre.x, -centre.y, -centre.z);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const fit = 0.8 / maxDim; // fit nicely in our view
        geo.scale(fit, fit, fit);
        setGeometry(geo);
      },
      undefined,
      (err: any) => {
        console.error('Wireframe head load error:', { err, url });
      }
    );
    return () => {
      disposed = true;
    };
  }, [modelUrl]);

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: { thickness: { value: thickness } },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      alphaToCoverage: true
    });
  }, [thickness]);

  const leftMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xe0e0ff, wireframe: true }), []);

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[0, 0.5, 0.8]} intensity={0.3} />
      {geometry && showLeftBasic && (
        <mesh geometry={geometry} position={[-0.5, 0, 0]} material={leftMaterial} />
      )}
      {geometry && (
        <mesh geometry={geometry} position={[0.5, 0, 0]}>
          <primitive object={shaderMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
};

(WireframeHeadSource as any).metadata = {
  name: 'Wireframe Head Source',
  description: 'Wireframe/edge rendering of a BufferGeometry model with adjustable thickness',
  category: 'Sources',
  icon: '',
  author: 'VJ System',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'modelUrl', type: 'string', value: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/json/WaltHeadLo_buffergeometry.json', description: 'BufferGeometry JSON URL or file path' },
    { name: 'thickness', type: 'number', value: 1, min: 0, max: 4, step: 0.01, description: 'Edge thickness' },
    { name: 'showLeftBasic', type: 'boolean', value: true, description: 'Show comparison basic wireframe on left' }
  ]
};

registerEffect('wireframe-head-source', WireframeHeadSource);
registerEffect('WireframeHeadSource', WireframeHeadSource);

export default WireframeHeadSource;


