import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { getEffectComponentSync } from '../utils/EffectLoader';
import { getCachedVideoCanvas } from '../utils/AssetPreloader';
import { useStore } from '../store/store';
import { EffectErrorBoundary } from './EffectErrorBoundary';

export type ChainItem =
  | { type: 'video'; video: HTMLVideoElement; assetId?: string; opacity?: number; blendMode?: string; fitMode?: 'cover' | 'contain' | 'stretch' | 'none' | 'tile'; backgroundSizeMode?: 'cover' | 'contain' | 'auto' | 'custom'; backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y'; backgroundSizeCustom?: string; renderScale?: number; __uniqueKey?: string }
  | { type: 'source'; effectId: string; params?: Record<string, any>; opacity?: number; __uniqueKey?: string }
  | { type: 'effect'; effectId: string; params?: Record<string, any>; opacity?: number; __uniqueKey?: string };

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
  const { gl, camera, invalidate } = useThree();
  // Scratch RT used for stage output before mixing
  const mixRtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  // Output RT used when we need a mixed "currentTexture" without a stage RT (e.g. video overlay)
  const mixOutRtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const mixSceneRef = useRef<THREE.Scene | null>(null);
  const mixMeshRef = useRef<THREE.Mesh | null>(null);
  const transparentTexRef = useRef<THREE.DataTexture | null>(null);
  const lastMixSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Cache per-video textures/RTs so we can stack multiple videos in one chain
  const videoTexMapRef = useRef<Map<HTMLVideoElement, THREE.VideoTexture>>(new Map());
  const videoRtMapRef = useRef<Map<string, THREE.WebGLRenderTarget>>(new Map());
  const videoSceneRef = useRef<THREE.Scene | null>(null);
  const videoMeshRef = useRef<THREE.Mesh | null>(null);
  const [seedTexture, setSeedTexture] = useState<THREE.CanvasTexture | null>(null);

  // Per-stage render targets to keep texture identity stable
  const rtRefs = useRef<Array<THREE.WebGLRenderTarget | null>>([]);

  function seedRenderTarget(
    gl: THREE.WebGLRenderer,
    rt: THREE.WebGLRenderTarget,
    texture: THREE.Texture | null,
    camera: THREE.Camera
  ) {
    if (!rt || !texture) return;
    const scene = new THREE.Scene();
    const aspect = rt.width / rt.height;
    const geom = new THREE.PlaneGeometry(aspect * 2, 2);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
    const mesh = new THREE.Mesh(geom, mat);
    scene.add(mesh);

    const prevTarget = gl.getRenderTarget();
    const prevColor = new THREE.Color();
    gl.getClearColor(prevColor);
    const prevAlpha = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;

    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.render(scene, camera);

    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevColor, prevAlpha);

    geom.dispose();
    mat.dispose();
  }

  // Determine effective render scale for video only (fallback 1)
  const defaultVideoRenderScale = (useStore as any).getState?.()?.defaultVideoRenderScale ?? 1;
  const effectiveScaleFor = (it: any) => {
    const raw = it?.renderScale;
    const n = raw != null ? (typeof raw === 'number' ? raw : parseFloat(String(raw))) : defaultVideoRenderScale;
    return Number.isFinite(n) ? Math.max(0.1, Math.min(1, n)) : defaultVideoRenderScale;
  };

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
      // Seed newly created RTs with the last valid final texture to avoid first-frame empties
      rtRefs.current.forEach((rt) => {
        if (rt) seedRenderTarget(gl, rt, (finalTextureRef as any)?.current || null, camera);
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
        // Seed new RT with previous final texture
        seedRenderTarget(gl, rtRefs.current[i]!, (finalTextureRef as any)?.current || null, camera);
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
        // Seed resized RT with previous final texture
        seedRenderTarget(gl, rtRefs.current[i]!, (finalTextureRef as any)?.current || null, camera);
      }
    }
  };

  // Build a stable signature for scene structure that ignores param changes
  const sceneSignature = useMemo(() => {
    return items
      .map((it, idx) => (it.type === 'effect' ? `effect:${(it as any).effectId}:${idx}:${(it as any).__uniqueKey || ''}` : `${it.type}:${idx}`))
      .join('|');
  }, [items]);

  // Track structure changes to avoid black flash during transitions
  const prevSceneSignatureRef = useRef(sceneSignature);
  const framesSinceStructureChangeRef = useRef(0); // Start at 0 to skip clears on mount
  const mountTimeRef = useRef(Date.now());
  const lastStructureChangeTimeRef = useRef(Date.now());

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
    return () => {
      // Dispose cached video textures + RTs
      try {
        videoTexMapRef.current.forEach((t) => { try { t.dispose(); } catch {} });
        videoTexMapRef.current.clear();
      } catch {}
      try {
        videoRtMapRef.current.forEach((rt) => { try { rt.dispose(); } catch {} });
        videoRtMapRef.current.clear();
      } catch {}
      try { mixRtRef.current?.dispose(); } catch {}
      try { mixOutRtRef.current?.dispose(); } catch {}
      try { transparentTexRef.current?.dispose(); } catch {}
    };
  }, []);

  const getVideoTextureFor = (video: HTMLVideoElement) => {
    const existing = videoTexMapRef.current.get(video);
    if (existing) return existing;
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
    videoTexMapRef.current.set(video, tex);
    return tex;
  };

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
    // Ensure no automatic clears between passes
    try { (gl as any).autoClear = false; } catch {}

    // Track structure changes to avoid black flash during transitions
    const now = Date.now();
    if (prevSceneSignatureRef.current !== sceneSignature) {
      prevSceneSignatureRef.current = sceneSignature;
      framesSinceStructureChangeRef.current = 0;
      lastStructureChangeTimeRef.current = now;
    } else {
      framesSinceStructureChangeRef.current++;
    }

    // Only clear the canvas if we're NOT in a transition.
    // Use time since mount/change to be robust against component remounts.
    // Skip clears for 250ms after mount OR 250ms after structure change.
    const timeSinceMount = now - mountTimeRef.current;
    const timeSinceStructureChange = now - lastStructureChangeTimeRef.current;
    const inTransition = timeSinceMount < 250 || timeSinceStructureChange < 250;

    if (!inTransition) {
      // Explicitly clear the default framebuffer once per frame to avoid trails
      // when preserveDrawingBuffer is true and the canvas clear alpha is 0
      try {
        const prevTarget = gl.getRenderTarget();
        const prevClear = new THREE.Color();
        gl.getClearColor(prevClear);
        const prevAlpha = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;
        gl.setRenderTarget(null);
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, true);
        gl.setRenderTarget(prevTarget);
        gl.setClearColor(prevClear, prevAlpha);
      } catch {}
    }
    ensureRTs();
    // Shared scratch RT for per-stage opacity mixing
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.floor(compositionWidth * dpr));
      const h = Math.max(2, Math.floor(compositionHeight * dpr));
      if (!mixRtRef.current || lastMixSizeRef.current.w !== w || lastMixSizeRef.current.h !== h) {
        mixRtRef.current?.dispose();
        mixRtRef.current = new THREE.WebGLRenderTarget(w, h, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        });
        lastMixSizeRef.current = { w, h };
      }
      if (!mixOutRtRef.current || mixOutRtRef.current.width !== w || mixOutRtRef.current.height !== h) {
        mixOutRtRef.current?.dispose();
        mixOutRtRef.current = new THREE.WebGLRenderTarget(w, h, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        });
      }
      if (!transparentTexRef.current) {
        const data = new Uint8Array([0, 0, 0, 0]);
        const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
        t.needsUpdate = true;
        try { (t as any).colorSpace = (THREE as any).LinearSRGBColorSpace || (t as any).colorSpace; } catch {}
        transparentTexRef.current = t;
      }
      if (!mixSceneRef.current || !mixMeshRef.current) {
        const s = new THREE.Scene();
        (s as any).background = null;
        const aspect = compositionWidth / compositionHeight;
        const geom = new THREE.PlaneGeometry(aspect * 2, 2);
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthTest: false,
          depthWrite: false,
          uniforms: {
            tBase: { value: transparentTexRef.current },
            tTop: { value: transparentTexRef.current },
            uOpacity: { value: 1.0 },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D tBase;
            uniform sampler2D tTop;
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
              vec4 base = texture2D(tBase, vUv);
              vec4 top = texture2D(tTop, vUv);
              gl_FragColor = mix(base, top, clamp(uOpacity, 0.0, 1.0));
            }
          `,
        });
        const m = new THREE.Mesh(geom, mat);
        s.add(m);
        mixSceneRef.current = s;
        mixMeshRef.current = m;
      } else {
        // Keep geometry aspect in sync with composition
        const m = mixMeshRef.current as THREE.Mesh;
        const aspect = compositionWidth / compositionHeight;
        const newGeom = new THREE.PlaneGeometry(aspect * 2, 2);
        const oldGeom = m.geometry as THREE.BufferGeometry | undefined;
        m.geometry = newGeom;
        try { oldGeom?.dispose(); } catch {}
      }
    } catch {}

    let currentTexture: THREE.Texture | null = seedTexture || null;
    const nextInputTextures: Array<THREE.Texture | null> = items.map(() => null);

    // Step 1: find base as we go bottom->top within this chain
    items.forEach((item, idx) => {
      if (item.type === 'video') {
        const prevTexture = currentTexture;
        const videoTexture = getVideoTextureFor(item.video);
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
          // ensure RT size with device pixel ratio for crisp rendering (per-video scale)
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const scale = effectiveScaleFor(item);
          const w = Math.max(2, Math.floor(compositionWidth * scale * dpr));
          const h = Math.max(2, Math.floor(compositionHeight * scale * dpr));
          const key = String((item as any).assetId || idx);
          const existingRt = videoRtMapRef.current.get(key);
          let videoRt = existingRt;
          if (!videoRt || videoRt.width !== w || videoRt.height !== h) {
            try { videoRt?.dispose(); } catch {}
            videoRt = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
            videoRtMapRef.current.set(key, videoRt);
            // Seed video RT with previous final texture
            seedRenderTarget(gl, videoRt, (finalTextureRef as any)?.current || null, camera);
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
          // Do not clear color; preserve prior contents to avoid flashes
          gl.setClearColor(0x000000, 0);
          gl.setRenderTarget(videoRt!);
          // Clear depth/stencil each frame so seeded depth values do not block new draws
          gl.clear(false, true, true);
          gl.render(videoSceneRef.current!, camera);
          gl.setRenderTarget(currentRT);
          gl.setClearColor(prevClear, prevAlpha);
          const videoOut = videoRt!.texture;

          // If there's already content below, composite this video over it using opacity
          const stageOpacityRaw = (item as any).opacity;
          const stageOpacity = Number.isFinite(Number(stageOpacityRaw)) ? Math.max(0, Math.min(1, Number(stageOpacityRaw))) : 1;
          if (prevTexture && stageOpacity < 0.999 && mixSceneRef.current && mixMeshRef.current && mixOutRtRef.current) {
            const mat = mixMeshRef.current.material as THREE.ShaderMaterial;
            mat.uniforms.tBase.value = prevTexture;
            mat.uniforms.tTop.value = videoOut;
            mat.uniforms.uOpacity.value = stageOpacity;
            const currentRT2 = gl.getRenderTarget();
            const prevClear2 = new THREE.Color();
            gl.getClearColor(prevClear2);
            const prevAlpha2 = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;
            gl.setClearColor(0x000000, 0);
            gl.setRenderTarget(mixOutRtRef.current);
            gl.clear(true, true, true);
            gl.render(mixSceneRef.current, camera);
            gl.setRenderTarget(currentRT2);
            gl.setClearColor(prevClear2, prevAlpha2);
            currentTexture = mixOutRtRef.current.texture;
          } else if (!prevTexture && stageOpacity < 0.999 && mixSceneRef.current && mixMeshRef.current && mixOutRtRef.current) {
            const mat = mixMeshRef.current.material as THREE.ShaderMaterial;
            mat.uniforms.tBase.value = transparentTexRef.current;
            mat.uniforms.tTop.value = videoOut;
            mat.uniforms.uOpacity.value = stageOpacity;
            const currentRT2 = gl.getRenderTarget();
            const prevClear2 = new THREE.Color();
            gl.getClearColor(prevClear2);
            const prevAlpha2 = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;
            gl.setClearColor(0x000000, 0);
            gl.setRenderTarget(mixOutRtRef.current);
            gl.clear(true, true, true);
            gl.render(mixSceneRef.current, camera);
            gl.setRenderTarget(currentRT2);
            gl.setClearColor(prevClear2, prevAlpha2);
            currentTexture = mixOutRtRef.current.texture;
          } else {
            currentTexture = videoOut;
          }
        nextInputTextures[idx] = currentTexture;
      } else if (item.type === 'source') {
        const rt = rtRefs.current[idx]!;
        const currentRT = gl.getRenderTarget();
        // For sources, treat the stage as replacing content each frame — no previous-pass background
        const bgMesh = bgMeshesRef.current[idx];
        if (bgMesh) {
          bgMesh.visible = false;
          const mat = bgMesh.material as THREE.MeshBasicMaterial;
          if (mat.map) { (mat as any).map = null; mat.needsUpdate = true; }
        }
        const prevClear = new THREE.Color();
        gl.getClearColor(prevClear);
        const prevAlpha = (gl as any).getClearAlpha ? (gl as any).getClearAlpha() : 1;
        const stageOpacityRaw = (item as any).opacity;
        const stageOpacity = Number.isFinite(Number(stageOpacityRaw)) ? Math.max(0, Math.min(1, Number(stageOpacityRaw))) : 1;
        const needsMix = stageOpacity < 0.999;
        const scratch = mixRtRef.current;
        const mixScene = mixSceneRef.current;
        const mixMesh = mixMeshRef.current;
        const baseTex = currentTexture || transparentTexRef.current;

        // Render source output (no background) either directly or into scratch for mixing
        gl.setClearColor(0x000000, 0);
        gl.setRenderTarget(needsMix && scratch ? scratch : rt);
        gl.clear(true, true, true);
        gl.render(offscreenScenes[idx], camera);

        if (needsMix && scratch && mixScene && mixMesh) {
          const mat = mixMesh.material as THREE.ShaderMaterial;
          mat.uniforms.tBase.value = baseTex;
          mat.uniforms.tTop.value = scratch.texture;
          mat.uniforms.uOpacity.value = stageOpacity;
          gl.setRenderTarget(rt);
          gl.clear(true, true, true);
          gl.render(mixScene, camera);
        }

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
        
        // Only render if effect component is loaded
        if (EffectComponent) {
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
          // Guard: Effects are filters and must not render a blank/black frame when their
          // `videoTexture` input hasn't propagated yet (common when toggling effects on/off).
          // If we render without a valid input, many effects fall back to opaque black for 1 frame.
          const stageInputCandidate = inputTextures[idx] || null;
          const safeStageInput = (stageInputCandidate && stageInputCandidate !== rt.texture) ? stageInputCandidate : null;
          if (!safeStageInput) {
            // Skip writing this stage's RT; keep showing the previous texture.
            // (This avoids a one-frame black flash at effect activation.)
          } else {
            const stageOpacityRaw = (item as any).opacity;
            const stageOpacity = Number.isFinite(Number(stageOpacityRaw)) ? Math.max(0, Math.min(1, Number(stageOpacityRaw))) : 1;
            const needsMix = stageOpacity < 0.999;
            const scratch = mixRtRef.current;
            const mixScene = mixSceneRef.current;
            const mixMesh = mixMeshRef.current;
            const baseTex = currentTexture || transparentTexRef.current;

            gl.setClearColor(0x000000, 0);
            gl.setRenderTarget(needsMix && scratch ? scratch : rt);
            // Clear depth/stencil to prevent earlier frames from blocking renders
            gl.clear(true, true, true);
            gl.render(offscreenScenes[idx], camera);

            if (needsMix && scratch && mixScene && mixMesh) {
              const mat = mixMesh.material as THREE.ShaderMaterial;
              mat.uniforms.tBase.value = baseTex;
              mat.uniforms.tTop.value = scratch.texture;
              mat.uniforms.uOpacity.value = stageOpacity;
              gl.setRenderTarget(rt);
              gl.clear(true, true, true);
              gl.render(mixScene, camera);
            }

            gl.setRenderTarget(currentRT);
            gl.setClearColor(prevClear, prevAlpha);
            currentTexture = rt.texture;
          }
        }
        // If effect not loaded yet, keep previous texture (don't update currentTexture)
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

  // Track which effects are loaded to trigger portal rebuild when they become available
  const [effectsLoadedTrigger, setEffectsLoadedTrigger] = useState(0);
  const effectsLoadedKey = useMemo(() => {
    return items
      .filter(item => item.type !== 'video')
      .map(item => {
        const EffectComponent = getEffectComponentSync(item.effectId);
        return EffectComponent ? '1' : '0';
      })
      .join('');
  }, [items, effectsLoadedTrigger]);

  // Poll for effect availability on mount and when items change
  React.useEffect(() => {
    const checkEffects = () => {
      const anyUnloaded = items.some(item => {
        if (item.type === 'video') return false;
        return !getEffectComponentSync(item.effectId);
      });
      
      if (anyUnloaded) {
        // Schedule a re-check to catch when effects finish loading
        const timer = setTimeout(() => {
          setEffectsLoadedTrigger(prev => prev + 1);
          invalidate();
        }, 100);
        return () => clearTimeout(timer);
      }
    };
    
    checkEffects();
  }, [items, effectsLoadedTrigger, invalidate]);

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
              offscreenScenes[idx]
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
            React.createElement(
              EffectErrorBoundary,
              { 
                effectId: item.effectId,
                children: React.createElement(
                  EffectComponent, 
                  { key: `effect-${idx}-${item.effectId || 'unknown'}-${(item as any).__uniqueKey || ''}`, ...params, ...extras }
                )
              }
            ),
            offscreenScenes[idx]
          )
        )
      );
    });
    return list;
  }, [items, offscreenScenes, inputTextures, compositionWidth, compositionHeight, effectsLoadedKey]);

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


