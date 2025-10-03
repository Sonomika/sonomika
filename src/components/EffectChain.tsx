import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { getEffectComponentSync } from '../utils/EffectLoader';
import { getCachedVideoCanvas } from '../utils/AssetPreloader';
import { useStore } from '../store/store';

export type ChainItem =
  | { type: 'video'; video: HTMLVideoElement; assetId?: string; opacity?: number; blendMode?: string; fitMode?: 'cover' | 'contain' | 'stretch' | 'none' | 'tile'; backgroundSizeMode?: 'cover' | 'contain' | 'auto' | 'custom'; backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y'; backgroundSizeCustom?: string; renderScale?: number; __uniqueKey?: string }
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
  const videoRtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const videoSceneRef = useRef<THREE.Scene | null>(null);
  const videoMeshRef = useRef<THREE.Mesh | null>(null);
  const [seedTexture, setSeedTexture] = useState<THREE.CanvasTexture | null>(null);

  // Per-stage render targets to keep texture identity stable
  const rtRefs = useRef<Array<THREE.WebGLRenderTarget | null>>([]);

  // Determine effective render scale for video only (fallback 1)
  const defaultVideoRenderScale = (useStore as any).getState?.()?.defaultVideoRenderScale ?? 1;
  const effectiveScale = React.useMemo(() => {
    const firstVideo = items.find((it) => it.type === 'video') as Extract<ChainItem, { type: 'video' }> | undefined;
    const raw = (firstVideo as any)?.renderScale;
    const n = raw != null ? (typeof raw === 'number' ? raw : parseFloat(String(raw))) : defaultVideoRenderScale;
    const clamped = Number.isFinite(n) ? Math.max(0.1, Math.min(1, n)) : defaultVideoRenderScale;
    return clamped;
  }, [items, defaultVideoRenderScale]);

  const ensureRTs = () => {
    // Offscreen RTs for sources/effects remain full composition resolution
    // Apply device pixel ratio for crisp rendering
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(compositionWidth * dpr));
    const h = Math.max(2, Math.floor(compositionHeight * dpr));
    if (rtRefs.current.length !== items.length) {
      // Dispose previous and recreate sized to items
      rtRefs.current.forEach((rt) => rt?.dispose());
      rtRefs.current = items.map((it) => (it.type === 'video' ? null : new THREE.WebGLRenderTarget(w, h, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
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
          depthBuffer: true,
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
          depthBuffer: true,
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
  }, [sceneSignature, compositionWidth, compositionHeight]);

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
  const baseVideoFit: 'cover' | 'contain' | 'stretch' | 'none' | 'tile' | undefined = (firstVideoItem as any)?.fitMode;

  // Snapshot the global default once per mount so new items use it, but it won't retroactively change
  const defaultFitSnapshot: 'cover' | 'contain' | 'stretch' | 'none' | 'tile' = 'cover';

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

  // When composition dimensions change, update the video plane geometry to match new aspect
  React.useEffect(() => {
    try {
      const m = videoMeshRef.current as THREE.Mesh | null;
      if (!m) return;
      const aspect = compositionWidth / compositionHeight;
      const newGeom = new THREE.PlaneGeometry(aspect * 2, 2);
      const oldGeom = m.geometry as THREE.BufferGeometry | undefined;
      m.geometry = newGeom;
      try { oldGeom?.dispose(); } catch {}
    } catch {}
  }, [compositionWidth, compositionHeight]);

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
          // lazily create scene/mesh/rt for scaling modes
          if (!videoSceneRef.current) {
            const s = new THREE.Scene();
            (s as any).background = null;
            const aspect = compositionWidth / compositionHeight;
            const geom = new THREE.PlaneGeometry(aspect * 2, 2);
            const mat = new THREE.MeshBasicMaterial({ map: videoTexture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false });
            const m = new THREE.Mesh(geom, mat);
            s.add(m);
            videoSceneRef.current = s;
            videoMeshRef.current = m;
          } else {
            const m = videoMeshRef.current as THREE.Mesh;
            const mat = m.material as THREE.MeshBasicMaterial;
            if (mat.map !== videoTexture) { mat.map = videoTexture; mat.needsUpdate = true; }
          }
          // ensure RT size with device pixel ratio for crisp rendering
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const w = Math.max(2, Math.floor(compositionWidth * effectiveScale * dpr));
          const h = Math.max(2, Math.floor(compositionHeight * effectiveScale * dpr));
          if (!videoRtRef.current || videoRtRef.current.width !== w || videoRtRef.current.height !== h) {
            videoRtRef.current?.dispose();
            videoRtRef.current = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
          }
          // apply fit mode scaling on mesh
          const m = videoMeshRef.current as THREE.Mesh;
          const compAspect = (compositionWidth > 0 && compositionHeight > 0) ? (compositionWidth / compositionHeight) : (16/9);
          const vid = (videoTexture.image as any) as HTMLVideoElement | HTMLImageElement;
          const va = (vid && (vid as any).videoWidth && (vid as any).videoHeight) ? (vid as any).videoWidth / (vid as any).videoHeight : compAspect;
          const mode = (item as any).fitMode || baseVideoFit || defaultFitSnapshot || 'cover';
          const repeatMode = (item as any).backgroundRepeat as ('no-repeat'|'repeat'|'repeat-x'|'repeat-y') || 'no-repeat';
          let sizeMode = (item as any).backgroundSizeMode as ('cover'|'contain'|'auto'|'custom') | undefined;
          // If no explicit background size mode, derive from fitMode so UI controls work
          if (!sizeMode) {
            if (mode === 'cover') sizeMode = 'cover';
            else if (mode === 'contain') sizeMode = 'contain';
            else if (mode === 'stretch') sizeMode = 'auto';
          }
          const sizeCustom = (item as any).backgroundSizeCustom as string | undefined;
          let scaleX = 1;
          let scaleY = 1;
          // When repeating, keep mesh at full plane size and control tiling purely via texture repeat
          if (mode === 'tile') {
            // Force repeat tiling to fill space
            const mat = (m.material as THREE.MeshBasicMaterial);
            const map = videoTexture;
            if (map) {
              map.wrapS = THREE.RepeatWrapping;
              map.wrapT = THREE.RepeatWrapping;
          const compAspect = (compositionWidth > 0 && compositionHeight > 0) ? (compositionWidth / compositionHeight) : (16/9);
              const texAspect = va;
              // Choose tile size that preserves source aspect; set repeats to fill plane
              const planeW = compAspect * 2;
              const planeH = 2;
              const tileH = planeH; // one tile height = plane height
              const tileW = tileH * texAspect;
              const repX = Math.max(1, Math.ceil(planeW / tileW));
              const repY = 1;
              map.repeat.set(repX, repY);
              map.offset.set(0, 0);
              map.needsUpdate = true;
            }
            // Keep plane at composition size
            m.scale.set(1, 1, 1);
          } else if (repeatMode === 'no-repeat') {
            if (mode === 'cover') {
              // Keep plane at composition size; cropping handled via texture repeat/offset below
              scaleX = 1;
              scaleY = 1;
            } else if (mode === 'contain') {
              if (va > compAspect) {
                scaleY = compAspect / va;
              } else {
                scaleX = va / compAspect;
              }
            } else if (mode === 'cover' || mode === 'fill') {
              // Covered by texture cropping path above; leave scale 1
              scaleX = 1; scaleY = 1;
            } else if (mode === 'none') {
              scaleX = (vid as any)?.videoWidth ? ((vid as any).videoWidth / compositionWidth) : 1;
              scaleY = (vid as any)?.videoHeight ? ((vid as any).videoHeight / compositionHeight) : 1;
            } else {
              // stretch: leave scale 1,1
            }
          }
          m.scale.set(scaleX, scaleY, 1);
          // Handle background-repeat by tiling via texture repeat/wrap
          const mat = (m.material as THREE.MeshBasicMaterial);
          const map = videoTexture;
          if (map) {
            map.wrapS = (repeatMode === 'repeat' || repeatMode === 'repeat-x') ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            map.wrapT = (repeatMode === 'repeat' || repeatMode === 'repeat-y') ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            // Compute repeat to preserve aspect and match CSS-like size modes
            let repX = 1, repY = 1;
            let offX = 0, offY = 0;
            const planeW = compAspect * 2;
            const planeH = 2;
            const texAspect = va; // w/h
            if (repeatMode !== 'no-repeat') {
              let tileW = planeW;
              let tileH = planeH;
              const setFromWH = (w: number, h: number) => {
                tileW = Math.max(0.0001, w);
                tileH = Math.max(0.0001, h);
              };
              if (sizeMode === 'contain' || !sizeMode) {
                // Fit one tile fully inside plane
                const wFit = planeH * texAspect;
                if (wFit <= planeW) setFromWH(wFit, planeH);
                else setFromWH(planeW, planeW / texAspect);
              } else if (sizeMode === 'cover') {
                // One tile covers plane
                const wCover = planeH * texAspect;
                if (wCover >= planeW) setFromWH(wCover, planeH);
                else setFromWH(planeW, planeW / texAspect);
              } else if (sizeMode === 'auto') {
                // Height matches plane, width by aspect
                setFromWH(planeH * texAspect, planeH);
              } else if (sizeMode === 'custom' && sizeCustom) {
                const parts = sizeCustom.trim().split(/\s+/);
                const parseUnit = (v: string, total: number) => {
                  if (!v || v === 'auto') return NaN;
                  if (v.endsWith('%')) return (parseFloat(v) / 100) * total;
                  if (v.endsWith('px')) return parseFloat(v) / (window.devicePixelRatio || 1) / 100; // rough px->plane scaling
                  const n = parseFloat(v);
                  return isNaN(n) ? NaN : n;
                };
                let w = parseUnit(parts[0] || '', planeW);
                let h = parseUnit(parts[1] || '', planeH);
                if (isNaN(w) && isNaN(h)) {
                  // fallback to auto
                  w = planeH * texAspect; h = planeH;
                } else if (isNaN(w)) {
                  w = h * texAspect;
                } else if (isNaN(h)) {
                  h = w / texAspect;
                }
                setFromWH(w, h);
              }
              // Convert tile size to repeats
              repX = Math.max(0.0001, planeW / tileW);
              repY = Math.max(0.0001, planeH / tileH);
              if (repeatMode === 'repeat-x') repY = 1;
              if (repeatMode === 'repeat-y') repX = 1;
            } else {
              // no-repeat: emulate CSS background-size cover/contain using repeat+offset cropping
              map.wrapS = THREE.ClampToEdgeWrapping;
              map.wrapT = THREE.ClampToEdgeWrapping;
              if (sizeMode === 'cover') {
                if (texAspect > compAspect) {
                  // crop sides
                  repX = Math.max(0.0001, compAspect / texAspect);
                  repY = 1;
                  offX = (1 - repX) / 2;
                } else if (texAspect < compAspect) {
                  repX = 1;
                  repY = Math.max(0.0001, texAspect / compAspect);
                  offY = (1 - repY) / 2;
                } else {
                  repX = 1; repY = 1;
                }
              } else if (sizeMode === 'contain') {
                repX = 1; repY = 1; // full frame; bars come from background
              } else if (sizeMode === 'auto') {
                // Height-fit: same as contain here; final plane is composition sized
                repX = 1; repY = 1;
              }
            }
            map.repeat.set(repX, repY);
            map.offset.set(offX, offY);
            map.needsUpdate = true;
          }
          // render to RT that is sized to the composition; then final display plane will match composition, so video 'cover' will fill fully
          const currentRT = gl.getRenderTarget();
          const prevClear = new THREE.Color();
          gl.getClearColor(prevClear);
          const prevAlpha = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;
          gl.setClearColor(0x000000, 0);
          gl.setRenderTarget(videoRtRef.current!);
          gl.clear(true, true, true);
          gl.render(videoSceneRef.current!, camera);
          gl.setRenderTarget(currentRT);
          gl.setClearColor(prevClear, prevAlpha);
          currentTexture = videoRtRef.current!.texture;
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
    const list: React.ReactNode[] = [];
    items.forEach((item, idx) => {
      if (item.type === 'video') return;
      const EffectComponent = getEffectComponentSync(item.effectId);
      if (!EffectComponent) return;
      const params = item.params || {};
      const extras: Record<string, any> = { compositionWidth, compositionHeight };
      if (item.type === 'effect') {
        const stageRT = rtRefs.current[idx]!;
        const candidate = inputTextures[idx] || null;
        extras.videoTexture = stageRT && candidate === stageRT.texture ? null : candidate;
        extras.isGlobal = false;
        const src = extras.videoTexture as any;
        const isSRGB = !!(src && (src.isVideoTexture || src.isCanvasTexture));
        extras.inputIsSRGB = isSRGB;
      }
      const md: any = (EffectComponent as any)?.metadata || {};
      const replacesVideo: boolean = md?.replacesVideo === true;
      const bgTex = ((): THREE.Texture | null => {
        const stageRT = rtRefs.current[idx]!;
        const candidate = inputTextures[idx] || null;
        if (stageRT && candidate === stageRT.texture) return null;
        return candidate as THREE.Texture | null;
      })();
      if (((item.type === 'effect' && !replacesVideo) || item.type === 'source') && bgTex) {
        const aspect = compositionWidth / compositionHeight;
        const portalKey = `portal-bg-${idx}-${item.effectId || 'unknown'}-${(item as any).__uniqueKey || ''}`;
        list.push(
          React.createElement(
            React.Fragment,
            { key: portalKey },
            createPortal(
              React.createElement(
                'mesh',
                { key: `bg-${idx}-${item.effectId || 'unknown'}-${(item as any).__uniqueKey || ''}`, renderOrder: -1000 },
                React.createElement('planeGeometry', { args: [aspect * 2, 2] }),
                React.createElement('meshBasicMaterial', { map: bgTex, transparent: true, toneMapped: false, depthTest: false, depthWrite: false })
              ),
              offscreenScenes[idx],
              portalKey
            )
          )
        );
      }
      const fxPortalKey = `portal-fx-${idx}-${item.effectId || 'unknown'}-${(item as any).__uniqueKey || ''}`;
      list.push(
        React.createElement(
          React.Fragment,
          { key: fxPortalKey },
          createPortal(
            React.createElement(EffectComponent, { key: `effect-${idx}-${item.effectId || 'unknown'}-${(item as any).__uniqueKey || ''}`, ...params, ...extras }),
            offscreenScenes[idx],
            fxPortalKey
          )
        )
      );
    });
    return list;
  }, [items, offscreenScenes, inputTextures, compositionWidth, compositionHeight]);

  // Display final texture
  // Always render the final texture on a plane matching the composition aspect
  // The content was already laid out into the RT sized to composition.
  const displayAspect = useMemo(() => compositionWidth / compositionHeight, [compositionWidth, compositionHeight]);

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


