import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { getEffectComponentSync } from '../utils/EffectLoader';
import { getCachedVideoCanvas } from '../utils/AssetPreloader';

export type ChainItem =
  | { type: 'video'; video: HTMLVideoElement; assetId?: string; opacity?: number; blendMode?: string; __uniqueKey?: string }
  | { type: 'source'; effectId: string; params?: Record<string, any>; __uniqueKey?: string }
  | { type: 'effect'; effectId: string; params?: Record<string, any>; __uniqueKey?: string };

interface EffectChainProps {
  items: ChainItem[];
  compositionWidth?: number;
  compositionHeight?: number;
  opacity?: number;
  baseAssetId?: string;
}

export const EffectChain: React.FC<EffectChainProps> = ({
  items,
  compositionWidth = 1920,
  compositionHeight = 1080,
  opacity = 1,
  baseAssetId
}) => {
  const { gl, camera } = useThree();

  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [seedTexture, setSeedTexture] = useState<THREE.CanvasTexture | null>(null);

  // Per-stage render targets to keep texture identity stable
  const rtRefs = useRef<Array<THREE.WebGLRenderTarget | null>>([]);

  const ensureRTs = () => {
    const w = Math.max(2, Math.floor(compositionWidth));
    const h = Math.max(2, Math.floor(compositionHeight));
    if (rtRefs.current.length !== items.length) {
      // Dispose previous and recreate sized to items
      rtRefs.current.forEach((rt) => rt?.dispose());
      rtRefs.current = items.map((it) => (it.type === 'video' ? null : new THREE.WebGLRenderTarget(w, h, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false
      })));
      // Set render target textures to linear color space to avoid double sRGB decoding
      rtRefs.current.forEach((rt) => {
        if (rt) {
          try {
            (rt.texture as any).colorSpace = (THREE as any).LinearSRGBColorSpace || (rt.texture as any).colorSpace;
          } catch {}
        }
      });
      return;
    }
    for (let i = 0; i < rtRefs.current.length; i++) {
      const rt = rtRefs.current[i];
      if (!rt && items[i].type === 'video') continue;
      if (!rt && items[i].type !== 'video') {
        rtRefs.current[i] = new THREE.WebGLRenderTarget(w, h, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false
        });
        try {
          (rtRefs.current[i]!.texture as any).colorSpace = (THREE as any).LinearSRGBColorSpace || (rtRefs.current[i]!.texture as any).colorSpace;
        } catch {}
        continue;
      }
      if (rt && (rt.width !== w || rt.height !== h)) {
        rt.dispose();
        rtRefs.current[i] = new THREE.WebGLRenderTarget(w, h, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false
        });
        try {
          (rtRefs.current[i]!.texture as any).colorSpace = (THREE as any).LinearSRGBColorSpace || (rtRefs.current[i]!.texture as any).colorSpace;
        } catch {}
      }
    }
  };

  // Build a stable signature for scene structure that ignores param changes
  const sceneSignature = useMemo(() => {
    return items
      .map((it, idx) => (it.type === 'effect' ? `effect:${(it as any).effectId}:${idx}:${(it as any).__uniqueKey || ''}` : `${it.type}:${idx}`))
      .join('|');
  }, [items]);

  // Offscreen scenes for each non-video item (only recreate when structure changes)
  const offscreenScenes = useMemo(() => {
    return items.map(() => {
      const s = new THREE.Scene();
      (s as any).background = null;
      return s;
    });
  }, [sceneSignature]);

  // Keep per-index input textures to pass into effect components
  const [inputTextures, setInputTextures] = useState<Array<THREE.Texture | null>>(
    () => items.map(() => null)
  );

  // Managed background meshes per stage to composite previous pass without React state lag
  const bgMeshesRef = useRef<Array<THREE.Mesh | null>>([]);
  React.useEffect(() => {
    const aspect = compositionWidth / compositionHeight;
    // Clean up existing
    bgMeshesRef.current.forEach((m, i) => {
      if (m) {
        try { offscreenScenes[i].remove(m); } catch {}
        try { (m.material as THREE.Material).dispose(); } catch {}
        try { (m.geometry as THREE.BufferGeometry).dispose(); } catch {}
      }
    });
    bgMeshesRef.current = items.map((it, idx) => {
      if (it.type === 'video') return null;
      const geom = new THREE.PlaneGeometry(aspect * 2, 2);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = -1000;
      offscreenScenes[idx].add(mesh);
      return mesh;
    });
    return () => {
      bgMeshesRef.current.forEach((m, i) => {
        if (m) {
          try { offscreenScenes[i].remove(m); } catch {}
          try { (m.material as THREE.Material).dispose(); } catch {}
          try { (m.geometry as THREE.BufferGeometry).dispose(); } catch {}
        }
      });
      bgMeshesRef.current = [];
    };
  }, [sceneSignature, offscreenScenes, compositionWidth, compositionHeight]);

  // Prepare video texture once per base video element
  const firstVideoItem = useMemo(() => {
    const firstVideo = items.find((it) => it.type === 'video') as Extract<ChainItem, { type: 'video' }> | undefined;
    return firstVideo || null;
  }, [items]);
  const baseVideoEl = firstVideoItem?.video || null;
  const baseVideoAssetId = (firstVideoItem?.assetId as any) || baseAssetId || null;

  // Seed a texture from preloader's first-frame canvas (for initial frame before videoTexture is ready)
  React.useEffect(() => {
    try {
      if (!baseVideoAssetId) {
        if (seedTexture) { try { seedTexture.dispose(); } catch {} }
        setSeedTexture(null);
        return;
      }
      const canvas = baseVideoAssetId ? getCachedVideoCanvas(String(baseVideoAssetId)) : undefined;
      if (!canvas) {
        if (seedTexture) { try { seedTexture.dispose(); } catch {} }
        setSeedTexture(null);
        return;
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      try {
        (tex as any).colorSpace = (THREE as any).SRGBColorSpace || (tex as any).colorSpace;
        if (!(tex as any).colorSpace && (THREE as any).sRGBEncoding) {
          (tex as any).encoding = (THREE as any).sRGBEncoding;
        }
      } catch {}
      setSeedTexture((prev) => { if (prev) { try { prev.dispose(); } catch {} } return tex; });
    } catch {
      if (seedTexture) { try { seedTexture.dispose(); } catch {} }
      setSeedTexture(null);
    }
    return () => { /* no-op cleanup here; handled on next change */ };
  }, [baseVideoAssetId]);

  React.useEffect(() => {
    if (!baseVideoEl) return;
    const video = baseVideoEl;

    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.format = THREE.RGBAFormat;
    tex.generateMipmaps = false;
    try {
      (tex as any).colorSpace = (THREE as any).SRGBColorSpace || (tex as any).colorSpace;
      if (!(tex as any).colorSpace && (THREE as any).sRGBEncoding) {
        (tex as any).encoding = (THREE as any).sRGBEncoding;
      }
    } catch {}
    try {
      (tex as any).colorSpace = (THREE as any).SRGBColorSpace || (tex as any).colorSpace;
      if (!(tex as any).colorSpace && (THREE as any).sRGBEncoding) {
        (tex as any).encoding = (THREE as any).sRGBEncoding;
      }
    } catch {}
    setVideoTexture((prev) => {
      if (prev) try { prev.dispose(); } catch {}
      return tex;
    });
    return () => {
      tex.dispose();
    };
  }, [baseVideoEl]);

  // Render chain per frame
  const finalTextureRef = useRef<THREE.Texture | null>(null);

  useFrame(() => {
    ensureRTs();
    let currentTexture: THREE.Texture | null = seedTexture || null;
    const nextInputTextures: Array<THREE.Texture | null> = items.map(() => null);

    // Step 1: find base as we go bottom->top within this chain
    items.forEach((item, idx) => {
      if (item.type === 'video') {
        if (videoTexture) {
          videoTexture.needsUpdate = true;
          currentTexture = videoTexture;
        }
        nextInputTextures[idx] = currentTexture;
      } else if (item.type === 'source') {
        const rt = rtRefs.current[idx]!;
        const currentRT = gl.getRenderTarget();
        // update background quad to previous pass texture
        const bgMesh = bgMeshesRef.current[idx];
        if (bgMesh) {
          const mat = bgMesh.material as THREE.MeshBasicMaterial;
          const nextMap = currentTexture as any;
          if (mat.map !== nextMap) {
            mat.map = nextMap;
            mat.needsUpdate = true;
          }
          bgMesh.visible = !!nextMap;
        }
        const prevClear = new THREE.Color();
        gl.getClearColor(prevClear);
        const prevAlpha = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;
        gl.setClearColor(0x000000, 0);
        gl.setRenderTarget(rt);
        gl.clear(true, true, true);
        gl.render(offscreenScenes[idx], camera);
        gl.setRenderTarget(currentRT);
        gl.setClearColor(prevClear, prevAlpha);
        currentTexture = rt.texture;
        nextInputTextures[idx] = currentTexture;
      } else if (item.type === 'effect') {
        // Ensure this effect receives the previous pass texture
        nextInputTextures[idx] = currentTexture;
        const rt = rtRefs.current[idx]!;
        const currentRT = gl.getRenderTarget();
        const prevClear = new THREE.Color();
        gl.getClearColor(prevClear);
        const prevAlpha = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;
        // If this effect does not replace, show background previous pass
        const EffectComponent = getEffectComponentSync((item as any).effectId);
        const md: any = (EffectComponent as any)?.metadata || {};
        const replacesVideo = md?.replacesVideo === true;
        const bgMesh = bgMeshesRef.current[idx];
        if (bgMesh) {
          const mat = bgMesh.material as THREE.MeshBasicMaterial;
          const nextMap = !replacesVideo ? (currentTexture as any) : null;
          if (mat.map !== nextMap) {
            mat.map = nextMap as any;
            mat.needsUpdate = true;
          }
          bgMesh.visible = !!nextMap;
        }
        // Guard: if this effect needs prior pass (overlay) but there's no input yet,
        // skip writing a blank frame to RT so we keep showing the previous final texture
        const needsInput = !replacesVideo;
        const hasInput = Boolean(currentTexture);
        if (needsInput && !hasInput) {
          // do not update currentTexture; keep previous
        } else {
          gl.setClearColor(0x000000, 0);
          gl.setRenderTarget(rt);
          gl.clear(true, true, true);
          gl.render(offscreenScenes[idx], camera);
          gl.setRenderTarget(currentRT);
          gl.setClearColor(prevClear, prevAlpha);
          currentTexture = rt.texture;
        }
      }
    });

    // Keep showing previous final texture until a new one is ready to avoid background showing through
    if (currentTexture) {
      finalTextureRef.current = currentTexture;
    }
    // Push input textures to effect portals only when identity changes to avoid re-renders/glitches
    let changed = false;
    if (nextInputTextures.length !== inputTextures.length) {
      changed = true;
    } else {
      for (let i = 0; i < nextInputTextures.length; i++) {
        if (nextInputTextures[i] !== inputTextures[i]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      setInputTextures(nextInputTextures);
    }
  });

  // Build portals for sources/effects
  const portals = useMemo(() => {
    return items.map((item, idx) => {
      if (item.type === 'video') return null;
      const EffectComponent = getEffectComponentSync(item.effectId);
      if (!EffectComponent) return null;
      const params = item.params || {};
      const extras: Record<string, any> = {};
      if (item.type === 'effect') {
        const stageRT = rtRefs.current[idx]!;
        const candidate = inputTextures[idx] || null;
        // Guard against feedback: never sample from the same RT we're writing to
        extras.videoTexture = stageRT && candidate === stageRT.texture ? null : candidate;
        extras.isGlobal = false;
        const src = extras.videoTexture as any;
        const isSRGB = !!(src && (src.isVideoTexture || src.isCanvasTexture));
        extras.inputIsSRGB = isSRGB;
      }
      const md: any = (EffectComponent as any)?.metadata || {};
      const replacesVideo: boolean = md?.replacesVideo === true;
      const portalsForStage: React.ReactNode[] = [];
      const bgTex = ((): THREE.Texture | null => {
        const stageRT = rtRefs.current[idx]!;
        const candidate = inputTextures[idx] || null;
        if (stageRT && candidate === stageRT.texture) return null;
        return candidate as THREE.Texture | null;
      })();
      if (((item.type === 'effect' && !replacesVideo) || item.type === 'source') && bgTex) {
        // Draw background with current input texture for overlay effects
        const aspect = compositionWidth / compositionHeight;
        portalsForStage.push(
          createPortal(
            React.createElement(
              'mesh',
                             { key: `bg-${idx}-${item.effectId || 'unknown'}-${(item as any).__uniqueKey || ''}`, renderOrder: -1000 },
              React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
              React.createElement('meshBasicMaterial', { map: bgTex, transparent: true, toneMapped: false, depthTest: false, depthWrite: false })
            ),
            offscreenScenes[idx]
          )
        );
      }
      portalsForStage.push(
        createPortal(
                     React.createElement(EffectComponent, { key: `effect-${idx}-${item.effectId || 'unknown'}-${(item as any).__uniqueKey || ''}`, ...params, ...extras }),
          offscreenScenes[idx]
        )
      );
      return portalsForStage;
    });
  }, [items, offscreenScenes, inputTextures]);

  // Display final texture
  const displayAspect = useMemo(() => {
    // Try to derive from the base video texture
    const vt = videoTexture as any;
    const img = vt?.image as HTMLVideoElement | HTMLImageElement | undefined;
    if (img && (img as any).videoWidth && (img as any).videoHeight) {
      const w = (img as any).videoWidth || (img as any).width;
      const h = (img as any).videoHeight || (img as any).height;
      if (w > 0 && h > 0) return w / h;
    }
    return compositionWidth / compositionHeight;
  }, [compositionWidth, compositionHeight, videoTexture]);

  return (
    <>
      {portals}
      {finalTextureRef.current && (
        <mesh position={[0, 0, 0]} renderOrder={-1000}>
          <planeGeometry args={[displayAspect * 2, 2]} />
          <meshBasicMaterial map={finalTextureRef.current} transparent={true} toneMapped={false} depthTest={false} depthWrite={false} opacity={opacity} />
        </mesh>
      )}
    </>
  );
};

export default EffectChain;


