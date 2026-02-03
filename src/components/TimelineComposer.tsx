import React, { Suspense, useEffect, useState, useRef, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import EffectChain, { ChainItem } from './EffectChain';
import { getCachedVideoCanvas, clearCachedVideoCanvas } from '../utils/AssetPreloader';
import { getEffectComponentSync } from '../utils/EffectLoader';
import { videoAssetManager } from '../utils/VideoAssetManager';
import EffectLoader from './EffectLoader';
import { debounce } from '../utils/debounce';
import { LOOP_MODES } from '../constants/video';
import { useVideoOptionsStore } from '../store/videoOptionsStore';

// If you don't see this in DevTools Console, you're not running the updated code.
try { console.log('[Sonomika][TimelineComposer] loaded (timeline opacity/blend debug v3)'); } catch {}

// Deterministic PRNG for timeline "Random" playback (stable per loop)
const hashStringToUint32 = (s: string): number => {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const mapTimelineTimeToVideoTime = (relSec: number, durationSec: number, mode: string, seedKey: string, randomBpm?: number): number => {
  const d = Number(durationSec || 0);
  const t = Math.max(0, Number(relSec || 0));
  if (!(d > 0)) return t;
  const eps = 0.001;
  const safeD = Math.max(eps * 2, d);
  const m = String(mode || LOOP_MODES.LOOP);
  if (m === LOOP_MODES.NONE) return Math.min(t, Math.max(0, safeD - eps));

  if (m === LOOP_MODES.LOOP) return (t % safeD);

  if (m === LOOP_MODES.REVERSE) {
    const wrapped = (t % safeD);
    return Math.max(0, safeD - wrapped);
  }

  if (m === LOOP_MODES.PING_PONG) {
    const span = safeD * 2;
    const x = t % span;
    return x <= safeD ? x : (span - x);
  }

  if (m === LOOP_MODES.RANDOM) {
    const bpm = clampBpm(Number(randomBpm || 120));
    const beatIdx = Math.floor((t * bpm) / 60);
    const rng = mulberry32(hashStringToUint32(`${seedKey}:beat:${beatIdx}`));
    return eps + rng() * Math.max(0, safeD - eps * 2);
  }

  return (t % safeD);
};

const getTimelineClipLoopMode = (clip: any): string => {
  try {
    const clipId = String(clip?.id || '');
    if (!clipId) return LOOP_MODES.LOOP;
    const layerId = `timeline-layer-${clipId}`;
    const st: any = (useVideoOptionsStore as any).getState?.();
    const opts = st?.getVideoOptionsForLayer ? st.getVideoOptionsForLayer(layerId, true) : null;
    const m = String(opts?.loopMode || '');
    return m || LOOP_MODES.LOOP;
  } catch {
    return LOOP_MODES.LOOP;
  }
};

const getTimelineClipRandomBpm = (clip: any, fallbackBpm: number): number => {
  try {
    const clipId = String(clip?.id || '');
    if (!clipId) return fallbackBpm;
    const layerId = `timeline-layer-${clipId}`;
    const st: any = (useVideoOptionsStore as any).getState?.();
    const opts = st?.getVideoOptionsForLayer ? st.getVideoOptionsForLayer(layerId, true) : null;
    const speed = String(opts?.randomSpeed || '').toLowerCase();
    if (speed === 'slow') return 30;
    if (speed === 'medium') return 60;
    if (speed === 'fast') return 120;
    if (speed === 'insane') return 240;
    const v = Number(opts?.randomBpm);
    return Number.isFinite(v) && v > 0 ? v : fallbackBpm;
  } catch {
    return fallbackBpm;
  }
};

const clampBpm = (v: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 120;
  return Math.max(1, Math.min(500, Math.floor(n)));
};

// When there are no active clips, explicitly clear the canvas so the last frame
// cannot "stick" (R3F renderer has autoClear=false for anti-flash behavior).
const ClearOnNoActiveClips: React.FC<{ hasActiveClips: boolean }> = ({ hasActiveClips }) => {
  const { gl } = useThree();
  const lastHadClipsRef = useRef<boolean>(false);

  useEffect(() => {
    const lastHad = lastHadClipsRef.current;
    // Clear when we transition to "no active clips", and also on initial empty mount.
    if (!hasActiveClips && (!lastHad || lastHad)) {
      try { (gl as any).clear?.(true, true, true); } catch {}
    }
    lastHadClipsRef.current = hasActiveClips;
  }, [hasActiveClips, gl]);

  return null;
};
// Drives rendering while the document is hidden (minimized) to avoid rAF throttling
const HiddenRenderDriver: React.FC = () => {
  const { gl, scene, camera } = useThree();
  React.useEffect(() => {
    let timer: number | null = null;
    const fps = 30;
    const frameInterval = Math.max(16, Math.floor(1000 / fps));
    const start = () => {
      if (timer != null) return;
      timer = window.setInterval(() => {
        try { gl.render(scene, camera as any); } catch {}
      }, frameInterval);
    };
    const stop = () => {
      if (timer != null) { try { clearInterval(timer); } catch {} timer = null; }
    };
    const handle = () => { (document as any).hidden ? start() : stop(); };
    try { document.addEventListener('visibilitychange', handle); } catch {}
    handle();
    return () => {
      stop();
      try { document.removeEventListener('visibilitychange', handle); } catch {}
    };
  }, [gl, scene, camera]);
  return null;
};

interface TimelineComposerProps {
  activeClips: any[];
  isPlaying: boolean;
  currentTime: number;
  width: number;
  height: number;
  bpm?: number;
  globalEffects?: any[];
  tracks?: any[];
}

// Cache last frame canvases per asset to avoid flashes across mounts
// Limit cache size to prevent memory leaks during extended playback
const MAX_CANVAS_CACHE_SIZE = 50;
const lastFrameCanvasCache: Map<string, HTMLCanvasElement> = new Map();

// Helper to maintain cache size limit (LRU-style)
const addToCanvasCache = (key: string, canvas: HTMLCanvasElement) => {
  if (lastFrameCanvasCache.size >= MAX_CANVAS_CACHE_SIZE) {
    // Remove oldest entry (first in Map)
    const firstKey = lastFrameCanvasCache.keys().next().value;
    if (firstKey) {
      const oldCanvas = lastFrameCanvasCache.get(firstKey);
      if (oldCanvas) {
        // Clear canvas memory
        try {
          oldCanvas.width = 1;
          oldCanvas.height = 1;
          const ctx = oldCanvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, 1, 1);
        } catch {}
      }
      lastFrameCanvasCache.delete(firstKey);
    }
  }
  lastFrameCanvasCache.set(key, canvas);
};

const clearTimelineFallbackCache = (assetId: string) => {
  if (!assetId) return;
  const canvas = lastFrameCanvasCache.get(assetId);
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const w = canvas.width || 0;
      const h = canvas.height || 0;
      ctx.clearRect(0, 0, w, h);
      if (w > 0 && h > 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
};

// Video texture component for R3F with fallback like ColumnPreview
const VideoTexture: React.FC<{ 
  video: HTMLVideoElement; 
  opacity: number; 
  blendMode: string;
  effects?: any;
  compositionWidth?: number;
  compositionHeight?: number;
  assetId?: string;
  renderOrder?: number;
}> = ({ video, opacity, blendMode, effects, compositionWidth, compositionHeight, assetId, renderOrder = 0 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  const [previousTexture, setPreviousTexture] = useState<THREE.VideoTexture | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallbackTexture, setFallbackTexture] = useState<THREE.CanvasTexture | null>(null);
  const liveMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const fallbackMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const frameReadyRef = useRef<boolean>(false);
  const lastTimeUpdateRef = useRef<number>(-1);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const applyBlendMode = (mat: THREE.MeshBasicMaterial | null) => {
    if (!mat) return;
    // Ensure we can blend with layers underneath.
    mat.transparent = true;
    // We rely on premultiplied alpha so "opacity" influences color blending modes.
    // Without this, modes like Multiply can visually wipe the underlying layer when source has black.
    (mat as any).premultipliedAlpha = true;
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;

    // Keep alpha behaving like normal transparency across modes.
    mat.blendEquationAlpha = THREE.AddEquation;
    mat.blendSrcAlpha = THREE.SrcAlphaFactor;
    mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;

    const mode = String(blendMode || 'add');
    switch (mode) {
      case 'normal': {
        // Premultiplied alpha "source over": src + dst * (1 - srcA)
        mat.blendSrc = THREE.OneFactor;
        mat.blendDst = THREE.OneMinusSrcAlphaFactor;
        mat.blendEquation = THREE.AddEquation;
        break;
      }
      case 'add': {
        // Additive (respecting opacity via premultiplied rgb).
        mat.blendSrc = THREE.OneFactor;
        mat.blendDst = THREE.OneFactor;
        mat.blendEquation = THREE.AddEquation;
        break;
      }
      case 'multiply': {
        // Multiply with opacity:
        // out = dst*(1-a) + (dst*src)*a
        // With PREMULTIPLIED_ALPHA, src.rgb already includes 'a', so:
        // out = dst*(1-srcA) + (dst*src.rgb)
        mat.blendSrc = THREE.DstColorFactor;
        mat.blendDst = THREE.OneMinusSrcAlphaFactor;
        mat.blendEquation = THREE.AddEquation;
        break;
      }
      case 'screen': {
        // Screen approximation via fixed-function blending:
        // out = src + dst * (1 - srcColor)
        mat.blendSrc = THREE.OneFactor;
        mat.blendDst = THREE.OneMinusSrcColorFactor;
        mat.blendEquation = THREE.AddEquation;
        break;
      }
      case 'overlay': {
        // Overlay isn't representable with fixed-function blending; approximate with Screen.
        mat.blendSrc = THREE.OneFactor;
        mat.blendDst = THREE.OneMinusSrcColorFactor;
        mat.blendEquation = THREE.AddEquation;
        break;
      }
      case 'difference': {
        // True "Difference" (abs(dst - src)) needs a shader. As a fallback we do dst - src.
        mat.blendSrc = THREE.OneFactor;
        mat.blendDst = THREE.OneFactor;
        mat.blendEquation = THREE.ReverseSubtractEquation;
        break;
      }
      default: {
        mat.blendSrc = THREE.OneFactor;
        mat.blendDst = THREE.OneFactor;
        mat.blendEquation = THREE.AddEquation;
        break;
      }
    }

    mat.needsUpdate = true;
  };
  
  // Use composition settings for aspect ratio instead of video's natural ratio
  const aspectRatio = compositionWidth && compositionHeight ? compositionWidth / compositionHeight : 16/9;
  
  // Calculate video's natural aspect ratio for proper scaling
  const [videoAspectRatio, setVideoAspectRatio] = useState(16/9);
  
  useEffect(() => {
    if (video && video.videoWidth && video.videoHeight) {
      const naturalRatio = video.videoWidth / video.videoHeight;
      setVideoAspectRatio(naturalRatio);
    }
  }, [video]);

  useEffect(() => {
    if (video) {
      // Start transition state
      setIsTransitioning(true);
      
      // Clear any existing transition timeout
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.generateMipmaps = false;
      try {
        (videoTexture as any).colorSpace = (THREE as any).SRGBColorSpace || (videoTexture as any).colorSpace;
        if (!(videoTexture as any).colorSpace && (THREE as any).sRGBEncoding) {
          (videoTexture as any).encoding = (THREE as any).sRGBEncoding;
        }
      } catch {}
      
      // Store previous texture for smooth transition
      if (texture) {
        setPreviousTexture(texture);
      }
      
      setTexture(videoTexture);
      
      // Wait for video to be ready before ending transition
      const checkVideoReady = () => {
        if (video.readyState >= 2) {
          setIsTransitioning(false);
          // Dispose previous texture after a short delay to ensure smooth transition
          transitionTimeoutRef.current = setTimeout(() => {
            if (previousTexture) {
              previousTexture.dispose?.();
              setPreviousTexture(null);
            }
          }, 100); // 100ms delay to ensure smooth transition
        } else {
          // Check again on next frame
          requestAnimationFrame(checkVideoReady);
        }
      };
      
      checkVideoReady();
    }
    
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [video]);

  // RVFC-driven invalidation for live texture
  useEffect(() => {
    const anyVideo: any = video as any;
    if (!video || typeof anyVideo.requestVideoFrameCallback !== 'function') return;
    let handle: any;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      frameReadyRef.current = true;
      try { handle = anyVideo.requestVideoFrameCallback(tick); } catch {}
    };
    try { handle = anyVideo.requestVideoFrameCallback(tick); } catch {}
    return () => {
      stopped = true;
      try { anyVideo.cancelVideoFrameCallback?.(handle); } catch {}
    };
  }, [video]);

  // Initialize fallback canvas/texture and seed from preloader if available
  useEffect(() => {
    if (!video) return;
    const ensureCanvasAndTexture = () => {
      if (!offscreenCanvasRef.current) {
        if (assetId && lastFrameCanvasCache.has(assetId)) {
          offscreenCanvasRef.current = lastFrameCanvasCache.get(assetId)!;
        } else {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
      }
      const canvas = offscreenCanvasRef.current;
      if (video.videoWidth && video.videoHeight) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (!fallbackTexture) {
          const tex = new THREE.CanvasTexture(canvas);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          setFallbackTexture(tex);
        }
        // Seed from preloader's first frame if present
        try {
          const seeded = assetId ? (getCachedVideoCanvas(assetId) || null) : null;
          if (seeded) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(seeded, 0, 0, canvas.width, canvas.height);
              if (fallbackTexture) fallbackTexture.needsUpdate = true;
              if (assetId) addToCanvasCache(assetId, canvas);
            }
          }
        } catch {}
      }
    };
    ensureCanvasAndTexture();
  }, [video, fallbackTexture, assetId]);

  // Ensure blend settings update when user changes blendMode.
  useEffect(() => {
    applyBlendMode(liveMaterialRef.current);
    applyBlendMode(fallbackMaterialRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blendMode]);

  // Update textures and control opacity
  useFrame(() => {
    // During transition, use previous texture if available, otherwise use current texture
    const activeTexture = isTransitioning && previousTexture ? previousTexture : texture;
    const ready = !!(activeTexture && video.readyState >= 2);
    const canvas = offscreenCanvasRef.current;
    const hasFallback = !!(fallbackTexture && canvas && canvas.width > 0 && canvas.height > 0);
    let liveAlpha = 1;
    let fallbackAlpha = 0;
    if (!ready) {
      liveAlpha = 0;
      fallbackAlpha = hasFallback ? 1 : 0;
    }
    if (liveMaterialRef.current) {
      liveMaterialRef.current.opacity = opacity * liveAlpha;
      liveMaterialRef.current.transparent = true;
      applyBlendMode(liveMaterialRef.current);
    }
    if (fallbackMaterialRef.current) {
      fallbackMaterialRef.current.opacity = opacity * fallbackAlpha;
      fallbackMaterialRef.current.transparent = true;
      applyBlendMode(fallbackMaterialRef.current);
    }
    if (activeTexture && ready) {
      const t = Number(video?.currentTime || 0);
      const timeChanged = lastTimeUpdateRef.current < 0 || Math.abs(t - lastTimeUpdateRef.current) > 0.0005;
      if (frameReadyRef.current || timeChanged) {
        activeTexture.needsUpdate = true;
        frameReadyRef.current = false;
        lastTimeUpdateRef.current = t;
      }
      // Also update previous texture during transition to keep it smooth
      if (isTransitioning && previousTexture) {
        previousTexture.needsUpdate = true;
      }
      // Keep fallback updated when possible
      if (canvas && fallbackTexture && (timeChanged || !(video as any).requestVideoFrameCallback)) {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            fallbackTexture.needsUpdate = true;
            if (assetId) addToCanvasCache(assetId, canvas);
          }
        } catch {}
      }
    }
  });

  // During transition, use previous texture if available, otherwise use current texture
  const activeTexture = isTransitioning && previousTexture ? previousTexture : texture;
  // FX input should never be empty: use fallback/previous when video not ready
  const inputTexture: THREE.Texture | null = (video.readyState >= 2)
    ? (activeTexture as THREE.Texture | null)
    : ((fallbackTexture as THREE.Texture | null) || (previousTexture as unknown as THREE.Texture | null));

  // Check if any effects are applied
  const hasEffects = effects && effects.length > 0;

  if (hasEffects) {
    // Always feed FX chain a valid texture even when video isn't ready yet
    return (
      <EffectLoader 
        videoTexture={inputTexture || undefined}
        fallback={
          <mesh>
            <planeGeometry args={[aspectRatio * 2, 2]} />
            <meshBasicMaterial map={inputTexture || undefined} />
          </mesh>
        }
      />
    );
  }

  // If no effects: If not ready, render fallback directly
  if (!activeTexture || video.readyState < 2) {
    const compositionAspectRatio = aspectRatio;
    const scaleX = Math.max(compositionAspectRatio / videoAspectRatio, 1);
    const scaleY = Math.max(videoAspectRatio / compositionAspectRatio, 1);
    const finalScaleX = compositionAspectRatio * 2 * scaleX;
    const finalScaleY = 2 * scaleY;
    return (
      <group>
        {fallbackTexture && (
          <mesh renderOrder={renderOrder}>
            <planeGeometry args={[finalScaleX, finalScaleY]} />
            <meshBasicMaterial ref={fallbackMaterialRef} map={fallbackTexture} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={opacity >= 1} />
          </mesh>
        )}
      </group>
    );
  }

  // For square preview (1080x1080), use square geometry and scale video to cover
  const compositionAspectRatio = aspectRatio;
  const scaleX = Math.max(compositionAspectRatio / videoAspectRatio, 1);
  const scaleY = Math.max(videoAspectRatio / compositionAspectRatio, 1);
  const finalScaleX = compositionAspectRatio * 2 * scaleX;
  const finalScaleY = 2 * scaleY;
  
  return (
    <group>
      {/* Fallback behind */}
      {fallbackTexture && (
        <mesh renderOrder={renderOrder}>
          <planeGeometry args={[finalScaleX, finalScaleY]} />
          <meshBasicMaterial ref={fallbackMaterialRef} map={fallbackTexture} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={opacity >= 1} />
        </mesh>
      )}
      {/* Live on top */}
      <mesh ref={meshRef} renderOrder={renderOrder + 1}>
        <planeGeometry args={[finalScaleX, finalScaleY]} />
        <meshBasicMaterial 
          ref={liveMaterialRef}
          map={activeTexture} 
          transparent 
          opacity={opacity}
          blending={THREE.CustomBlending}
          side={THREE.DoubleSide}
          alphaTest={0.01}
          depthTest={opacity >= 1}
          depthWrite={opacity >= 1}
        />
      </mesh>
    </group>
  );
};

// Timeline Scene Component with effect support - memoized for performance
const TimelineScene: React.FC<{
  activeClips: any[];
  isPlaying: boolean;
  currentTime: number;
  bpm?: number;
  globalEffects?: any[];
  compositionWidth?: number;
  compositionHeight?: number;
  onFirstFrameReady?: () => void;
}> = ({ activeClips, isPlaying, currentTime, bpm, globalEffects = [], compositionWidth, compositionHeight, onFirstFrameReady }) => {
  const { camera } = useThree();
  // Subscribe so opacity/blend changes in Layer Options trigger re-render
  const timelineVideoOptions = useVideoOptionsStore((s) => s.timelineVideoOptionsByLayer);
  const [assets, setAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });
  
  const loadedAssetsRef = useRef<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });

  // Global asset cache to persist videos across timeline changes
  const globalAssetCacheRef = useRef<{
    videos: Map<string, HTMLVideoElement>;
  }>({ videos: new Map() });

  // Timeline clips are stored in a few different shapes (some omit asset.type).
  // We need robust detection so stacked layers render (opacity/blend depend on it).
  const isVideoClip = React.useCallback((clip: any): boolean => {
    try {
      if (!clip) return false;
      if (clip?.asset?.type === 'video') return true;
      if (clip?.type === 'video') return true;
      const name = String(clip?.asset?.name || clip?.name || '');
      const path = String(clip?.asset?.filePath || clip?.asset?.path || '');
      const s = `${name} ${path}`.toLowerCase();
      return /\.(mp4|mov|m4v|webm|mkv|avi|wmv|flv)\b/.test(s);
    } catch {
      return false;
    }
  }, []);

  const isImageClip = React.useCallback((clip: any): boolean => {
    try {
      if (!clip) return false;
      if (clip?.asset?.type === 'image') return true;
      if (clip?.type === 'image') return true;
      const name = String(clip?.asset?.name || clip?.name || '');
      const path = String(clip?.asset?.filePath || clip?.asset?.path || '');
      const s = `${name} ${path}`.toLowerCase();
      return /\.(png|jpg|jpeg|gif|webp|bmp)\b/.test(s);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const onVideoPrimed = (event: Event) => {
      const detail: any = (event as CustomEvent)?.detail;
      const assetKey = detail?.assetKey;
      const element: HTMLVideoElement | undefined = detail?.element;
      if (!assetKey) return;
      const video = element || videoAssetManager.get(assetKey)?.element;
      if (!video) return;
      globalAssetCacheRef.current.videos.set(assetKey, video);
    };
    try { document.addEventListener('timelineVideoPrimed', onVideoPrimed as any); } catch {}
    return () => {
      try { document.removeEventListener('timelineVideoPrimed', onVideoPrimed as any); } catch {}
    };
  }, []);

  const firstFrameReadyRef = useRef<boolean>(false);
  const frameCounterRef = useRef<number>(0);

  // Memoize asset key extraction to avoid recalculating on every render
  const activeAssetKeys = useMemo(() => {
    return activeClips
      .filter(clip => clip.asset)
      .map(clip => String(clip.asset.id))
      .sort()
      .join('|');
  }, [activeClips]);

  // Load assets with caching - only reload when asset IDs change
  useEffect(() => {
    const loadAssets = async () => {
      const newImages = new Map<string, HTMLImageElement>();
      const newVideos = new Map<string, HTMLVideoElement>();
        
      for (const clip of activeClips) {
        if (!clip.asset) continue;

        const asset = clip.asset;
        const key = String(asset.id);
        
        // Check if asset is already loaded
        if (loadedAssetsRef.current.images.has(key)) {
          newImages.set(key, loadedAssetsRef.current.images.get(key)!);
          continue;
        }
        if (loadedAssetsRef.current.videos.has(key)) {
          newVideos.set(key, loadedAssetsRef.current.videos.get(key)!);
          continue;
        }

        if (asset.type === 'image' || isImageClip(clip)) {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = asset.path;
            });
            newImages.set(key, img);
            console.log(`✅ Image loaded for clip ${clip.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load image for clip ${clip.name}:`, error);
          }
        } else if (asset.type === 'video' || isVideoClip(clip)) {
          try {
            // Normalize asset.type so downstream path logic and video manager behave consistently.
            const normalizedAsset = { ...(asset || {}), type: 'video' as const };
            // Use persistent video per assetId
            let managed = videoAssetManager.get(key);
            if (!managed) {
              managed = await videoAssetManager.getOrCreate(normalizedAsset as any, (a) => getAssetPath(a, true));
            }
            const video = managed.element;
            try { video.muted = true; } catch {}
            // Prime: ensure metadata/first frame are available even when timeline is stopped.
            // Without this, some clips render as nothing (readyState < 2) so opacity/blend appear broken.
            try { (video as any).playsInline = true; } catch {}
            try { video.preload = 'auto'; } catch {}
            try { video.load?.(); } catch {}
            try {
              if ((video as any).readyState < 2) {
                // Best-effort decode first frame (muted autoplay should succeed in Electron).
                const p = video.play();
                if (p && typeof (p as any).then === 'function') {
                  (p as any).then(() => {
                    try { video.pause(); } catch {}
                    try { video.currentTime = 0; } catch {}
                  }).catch(() => {});
                }
              }
            } catch {}
            globalAssetCacheRef.current.videos.set(key, video);
            newVideos.set(key, video);
            console.log(`✅ Video manager provided element for clip ${clip.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load video for clip ${clip.name}:`, error);
          }
        }
      }

      // Performance optimization: limit to 5 concurrent videos to prevent memory issues
      const MAX_CONCURRENT_VIDEOS = 5;
      if (newVideos.size > MAX_CONCURRENT_VIDEOS) {
        console.log(`Limiting videos to ${MAX_CONCURRENT_VIDEOS} for better performance`);
        const videoArray = Array.from(newVideos.entries());
        const limitedVideos = new Map(videoArray.slice(0, MAX_CONCURRENT_VIDEOS));
        
        // Store in ref for future use
        loadedAssetsRef.current = { images: newImages, videos: limitedVideos };
        setAssets({ images: newImages, videos: limitedVideos });
      } else {
        // Store in ref for future use
        loadedAssetsRef.current = { images: newImages, videos: newVideos };
        setAssets({ images: newImages, videos: newVideos });
      }
    };

    loadAssets();
  }, [activeAssetKeys]); // Only reload when asset IDs change, not on every clip update

  // Handle play/pause and video synchronization
  useEffect(() => {
    assets.videos.forEach((video, assetId) => {
      // Find the clip that corresponds to this video
      const activeClip = activeClips.find((clip) => {
        const clipAssetId = clip?.asset?.id;
        return clipAssetId != null && String(clipAssetId) === String(assetId);
      });
      
      if (isPlaying && activeClip) {
        const rawRel = Number(activeClip.relativeTime || 0);
        const mode = getTimelineClipLoopMode(activeClip);
        const rbpm = getTimelineClipRandomBpm(activeClip, clampBpm(Number(bpm || 120)));
        const targetTime = mapTimelineTimeToVideoTime(rawRel, Number(video.duration || 0), mode, String((activeClip as any)?.id || assetId), rbpm);
        const currentBeforeSync = typeof video.currentTime === 'number' ? video.currentTime : 0;
        
        // Sync video to correct time position to prevent positioning flashes
        const syncThreshold = mode === LOOP_MODES.RANDOM ? 0.03 : 0.15;
        if (Math.abs(currentBeforeSync - targetTime) > syncThreshold) {
          video.currentTime = targetTime;
          const rewoundToStart = currentBeforeSync - targetTime > 0.4 && targetTime < 0.1;
          if (rewoundToStart) {
            try { clearTimelineFallbackCache(String(assetId)); } catch {}
            try { clearCachedVideoCanvas(String(assetId)); } catch {}
          }
        }

        // Force muted autoplay policy compliance and remove readyState gating
        try { video.muted = true; } catch {}
        try { video.playbackRate = 1; } catch {}
        // Play the video (Random mode also plays continuously, with periodic random jumps)
        if (video.paused) {
          const p = video.play();
          if (p && typeof (p as any).catch === 'function') {
            (p as any).catch((err: any) => {
              console.warn('Could not auto-play video, retrying muted:', err);
              try { video.muted = true; void video.play(); } catch {}
            });
          }
        }
      } else {
        // Pause video if not playing or not in active clips
        if (!video.paused) {
          video.pause();
        }
      }
    });
  }, [isPlaying, assets.videos, activeClips, currentTime, bpm]);

  // On stop in timeline mode, reset all timeline videos to start
  useEffect(() => {
    const resetAllVideos = () => {
      try {
        // Reset currently loaded videos
        assets.videos.forEach((video) => {
          try { video.pause(); } catch {}
          try { video.currentTime = 0; } catch {}
        });
        // Also reset any videos in the local cache to cover non-active ones
        try {
          (globalAssetCacheRef.current?.videos || new Map()).forEach((video) => {
            try { video.pause(); } catch {}
            try { video.currentTime = 0; } catch {}
          });
        } catch {}
      } catch {}
    };

    const onGlobalStop = () => resetAllVideos();
    const onTimelineStop = () => resetAllVideos();
    const onVideoStop = () => resetAllVideos();

    try { document.addEventListener('globalStop', onGlobalStop as any); } catch {}
    try { document.addEventListener('timelineStop', onTimelineStop as any); } catch {}
    try { document.addEventListener('videoStop', onVideoStop as any); } catch {}
    return () => {
      try { document.removeEventListener('globalStop', onGlobalStop as any); } catch {}
      try { document.removeEventListener('timelineStop', onTimelineStop as any); } catch {}
      try { document.removeEventListener('videoStop', onVideoStop as any); } catch {}
    };
  }, [assets.videos]);

  // Ensure paused timeline seeks reflect the current playhead position
  useEffect(() => {
    try {
      assets.videos.forEach((video, assetId) => {
        const activeClip = activeClips.find((clip) => {
          const clipAssetId = clip?.asset?.id;
          return clipAssetId != null && String(clipAssetId) === String(assetId);
        });
        if (!activeClip) {
          return;
        }
        const rawRel = Math.max(0, Number(activeClip.relativeTime || 0));
        const mode = getTimelineClipLoopMode(activeClip);
        const rbpm = getTimelineClipRandomBpm(activeClip, clampBpm(Number(bpm || 120)));
        const targetTime = mapTimelineTimeToVideoTime(rawRel, Number(video.duration || 0), mode, String((activeClip as any)?.id || assetId), rbpm);
        const th = mode === LOOP_MODES.RANDOM ? 0.03 : 0.05;
        if (Math.abs((video.currentTime || 0) - targetTime) > th) {
          try { video.currentTime = targetTime; } catch {}
        }
      });
    } catch {}
  }, [currentTime, activeClips, assets.videos, bpm]);

  // Additional video sync check during playback to prevent drift - optimized to reduce overhead
  useEffect(() => {
    if (!isPlaying) return;

    // Reduce sync frequency when not actively playing to save CPU
    const syncInterval = setInterval(() => {
      assets.videos.forEach((video, assetId) => {
        const activeClip = activeClips.find((clip) => {
          const clipAssetId = clip?.asset?.id;
          return clipAssetId != null && String(clipAssetId) === String(assetId);
        });
        
        if (activeClip) {
          const rawRel = Number(activeClip.relativeTime || 0);
          const mode = getTimelineClipLoopMode(activeClip);
          const rbpm = getTimelineClipRandomBpm(activeClip, clampBpm(Number(bpm || 120)));
          const targetTime = mapTimelineTimeToVideoTime(rawRel, Number(video.duration || 0), mode, String((activeClip as any)?.id || assetId), rbpm);
          const drift = Math.abs(video.currentTime - targetTime);
          
          // Only sync if drift is significant (>300ms) - increased threshold for better performance
          const driftThreshold = mode === LOOP_MODES.RANDOM ? 0.05 : 0.3;
          if (drift > driftThreshold) {
            video.currentTime = targetTime;
            // Resume playback if paused (including Random mode - plays continuously with periodic jumps)
            try { if (video.paused) void video.play(); } catch {}
          }
        }
      });
    }, 500); // Check every 500ms instead of 200ms for better performance

    return () => clearInterval(syncInterval);
  }, [isPlaying, assets.videos, activeAssetKeys, bpm]); // Use memoized asset keys

  // Set up camera
  useEffect(() => {
    camera.position.z = 1;
    if ('fov' in camera) {
      (camera as THREE.PerspectiveCamera).fov = 90;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Signal first frame ready when a video is ready or after a couple of frames for effects-only
  useFrame(() => {
    if (firstFrameReadyRef.current) return;
    const hasVideos = activeClips.some((c: any) => isVideoClip(c));
    const anyReady = Array.from(assets.videos.values()).some(v => v.readyState >= 2);
    frameCounterRef.current += 1;
    const enoughFrames = frameCounterRef.current >= 2;
    if (anyReady || (!hasVideos && enoughFrames)) {
      firstFrameReadyRef.current = true;
      try { onFirstFrameReady && onFirstFrameReady(); } catch {}
    }
  });

  // Helper function to build a correct file:// URL across platforms (Windows-friendly)
  const toFileURL = (absPath: string) => {
    try {
      let p = String(absPath || '');
      // Normalize backslashes to forward slashes
      p = p.replace(/\\/g, '/');
      // Ensure leading slash for drive letters (C:/...)
      if (!p.startsWith('/')) p = '/' + p;
      return 'file://' + p;
    } catch {
      return 'file://' + absPath;
    }
  };

  // Helper function to get proper file path for Electron
  const getAssetPath = (asset: any, useForPlayback: boolean = false) => {
    if (!asset) return '';
    console.log('getAssetPath called with asset:', asset, 'useForPlayback:', useForPlayback);
    
    // For video playback, prioritize file paths over blob URLs
    if (useForPlayback && asset.type === 'video') {
      if (asset.filePath) {
        const filePath = toFileURL(asset.filePath);
        console.log('Using file path for video playback:', filePath);
        return filePath;
      }
      if (asset.path && asset.path.startsWith('file://')) {
        console.log('Using existing file URL for video playback:', asset.path);
        return asset.path;
      }
      if (asset.path && asset.path.startsWith('local-file://')) {
        const filePath = asset.path.replace('local-file://', '');
        const standardPath = toFileURL(filePath);
        console.log('Converting local-file to file for video playback:', standardPath);
        return standardPath;
      }
    }
    
    // For thumbnails and other uses, prioritize blob URLs
    if (asset.path && asset.path.startsWith('blob:')) {
      console.log('Using blob URL:', asset.path);
      return asset.path;
    }
    
    if (asset.filePath) {
      const filePath = toFileURL(asset.filePath);
      console.log('Using file protocol:', filePath);
      return filePath;
    }
    
    if (asset.path && asset.path.startsWith('file://')) {
      console.log('Using existing file URL:', asset.path);
      return asset.path;
    }
    
    if (asset.path && asset.path.startsWith('local-file://')) {
      const filePath = asset.path.replace('local-file://', '');
      const standardPath = `file://${filePath}`;
      console.log('Converting local-file to file:', standardPath);
      return standardPath;
    }
    
    if (asset.path && asset.path.startsWith('data:')) {
      console.log('Using data URL:', asset.path);
      return asset.path;
    }
    
    console.log('Using fallback path:', asset.path);
    return asset.path || '';
  };

  // Helper to resolve and classify effects similar to ColumnPreview
  const resolveEffectId = (asset: any): string | null => {
    if (!asset) return null;
    let effectId: string | null = null;
    if (asset.effect) {
      effectId = asset.effect.id || asset.effect.name || asset.effect.type || null;
    } else {
      effectId = asset.id || asset.name || asset.filePath || null;
    }
    if (effectId && effectId.endsWith('.tsx')) {
      effectId = effectId.replace('.tsx', '').replace(/^.*[\\\/]/, '');
    }
    return effectId;
  };

  const classifyClip = (clip: any): 'video' | 'source' | 'effect' | 'unknown' => {
    if (!clip) return 'unknown';
    if (isVideoClip(clip)) return 'video';
    if (!clip?.asset) return 'unknown';
    const effectId = resolveEffectId(clip.asset);
    if (!effectId) return 'unknown';
    const Comp = getEffectComponentSync(effectId);
    const md = (Comp as any)?.metadata;
    if (md?.isSource === true || md?.folder === 'sources') return 'source';
    return 'effect';
  };

  return (
    <>
      {/* Keep scene background transparent to avoid one-frame clears */}
      {(() => {
        try {
          const { gl, scene } = useThree();
          (gl as any).setClearAlpha?.(0);
          (scene as any).background = null;
        } catch {}
        return null;
      })()}
      
      {/* Render all clips using chain-based stacking with global effects appended */}
      {useMemo(() => {
        // If there are no active clips at this time, we should render black (not the last chain).
        // This prevents the output from "freezing" on the last rendered frame when clips are deleted
        // or when the playhead enters a gap.
        if (!activeClips || activeClips.length === 0) {
          try {
            (window as any).__vj_timeline_is_playing__ = Boolean(isPlaying);
            (window as any).__vj_timeline_active_layers__ = [];
          } catch {}
          try {
            const lastChainRef = (TimelineScene as any).__lastChainRef;
            const lastChainKeyRef = (TimelineScene as any).__lastChainKeyRef;
            const lastStructureKeyRef = (TimelineScene as any).__lastStructureKeyRef;
            if (lastChainRef) lastChainRef.current = null;
            if (lastChainKeyRef) lastChainKeyRef.current = '';
            if (lastStructureKeyRef) lastStructureKeyRef.current = '';
          } catch {}
          return [];
        }

        const chains: ChainItem[][] = [];
        let currentChain: ChainItem[] = [];

        const mergeParams = (src: any): Record<string, any> => {
          const out: Record<string, any> = {};
          const merge = (obj: any) => {
            if (!obj) return;
            Object.keys(obj).forEach((k) => {
              const v: any = obj[k];
              out[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
            });
          };
          merge(src?.params);
          const nested = src?.asset?.effect?.params;
          merge(nested);
          return out;
        };

        // Resolve video options per clip for opacity/blend (timeline mode)
        const videoOptsState = (useVideoOptionsStore as any).getState?.();
        const getOpts = videoOptsState?.getVideoOptionsForLayer;
        const getParamVal = (p: any) => (p && typeof p === 'object' && 'value' in p ? p.value : p);
        const getFadeFactor = (c: any) => {
          try {
            // New: fadeIn/fadeOut can be controlled separately.
            // Legacy: fadeEnabled + fadeDurationMs means both in/out enabled.
            const legacyEnabled = Boolean(getParamVal(c?.params?.fadeEnabled));
            const legacyMsRaw = getParamVal(c?.params?.fadeDurationMs ?? c?.params?.fadeDuration);
            const legacyMs = Number(legacyMsRaw);
            const legacyMsClamped = (Number.isFinite(legacyMs) && legacyMs > 0) ? legacyMs : 0;

            const inEnabledRaw = getParamVal(c?.params?.fadeInEnabled);
            const outEnabledRaw = getParamVal(c?.params?.fadeOutEnabled);
            const inEnabled = (inEnabledRaw === undefined && outEnabledRaw === undefined) ? legacyEnabled : Boolean(inEnabledRaw);
            const outEnabled = (inEnabledRaw === undefined && outEnabledRaw === undefined) ? legacyEnabled : Boolean(outEnabledRaw);
            if (!inEnabled && !outEnabled) return 1;

            const inMsRaw = getParamVal(c?.params?.fadeInDurationMs ?? c?.params?.fadeInDuration);
            const outMsRaw = getParamVal(c?.params?.fadeOutDurationMs ?? c?.params?.fadeOutDuration);
            const inMs = Number(inMsRaw);
            const outMs = Number(outMsRaw);

            const rel = Math.max(0, Number(c?.relativeTime || 0));
            const dur = Math.max(0.0001, Number(c?.duration || 0.0001));

            const inSec = (Number.isFinite(inMs) && inMs > 0) ? (inMs / 1000) : (legacyMsClamped > 0 ? legacyMsClamped / 1000 : 0);
            const outSec = (Number.isFinite(outMs) && outMs > 0) ? (outMs / 1000) : (legacyMsClamped > 0 ? legacyMsClamped / 1000 : 0);

            const fdIn = (inEnabled && inSec > 0) ? Math.min(inSec, dur) : 0;
            const fdOut = (outEnabled && outSec > 0) ? Math.min(outSec, dur) : 0;

            const inFactor = (fdIn > 0 && rel < fdIn) ? Math.max(0, Math.min(1, rel / fdIn)) : 1;
            const outFactor = (fdOut > 0 && (dur - rel) < fdOut) ? Math.max(0, Math.min(1, (dur - rel) / fdOut)) : 1;
            return Math.max(0, Math.min(1, Math.min(inFactor, outFactor)));
          } catch {
            return 1;
          }
        };
        const getClipOpacityAndBlend = (c: any) => {
          if (!getOpts || !c?.id) return { opacity: typeof c?.opacity === 'number' ? c.opacity : 1, blendMode: c?.blendMode || 'add' };
          const opts = getOpts(`timeline-layer-${c.id}`, true);
          const fade = getFadeFactor(c);
          return {
            opacity: (typeof opts?.opacity === 'number' ? opts.opacity : (typeof c?.opacity === 'number' ? c.opacity : 1)) * fade,
            blendMode: opts?.blendMode || c?.blendMode || 'add',
          };
        };
        // Layer order: timeline UI shows displayTracks = reverse(nonAudio), so first track in array = bottom row.
        // We must draw bottom layer first (back), top layer last (front). Sort by track index ascending so
        // track-1 (bottom row) is first, track-2, track-3 (top row) last.
        const trackOrder = (c: any) => {
          const id = String(c?.trackId || '');
          const num = parseInt(id.replace(/^track-/, ''), 10);
          return Number.isFinite(num) ? num : 9999;
        };
        const sortedClips = [...activeClips].sort((a, b) => trackOrder(a) - trackOrder(b));
        // Build chains based on sorted order (bottom track first = back, top track last = front)
        const assetKey = (c: any) => (c?.asset?.id != null ? String(c.asset.id) : '');
        sortedClips.forEach((clip: any) => {
          const kind = classifyClip(clip);
          if (kind === 'video') {
            const video = assets.videos.get(assetKey(clip));
            if (!video) {
              if (currentChain.length > 0) { chains.push(currentChain); currentChain = []; }
              return;
            }
            if (currentChain.length > 0) { chains.push(currentChain); currentChain = []; }
            const { opacity: clipOpacity, blendMode: clipBlend } = getClipOpacityAndBlend(clip);
            currentChain.push({ type: 'video', video, opacity: clipOpacity, blendMode: clipBlend, assetId: clip.asset?.id });
          } else if (kind === 'source') {
            const eid = resolveEffectId(clip.asset);
            if (eid) {
              const fade = getFadeFactor(clip);
              const baseOpacity = (() => {
                const v = getParamVal(clip?.params?.opacity);
                return typeof v === 'number' ? v : 1;
              })();
              currentChain.push({ type: 'source', effectId: eid, params: mergeParams(clip), opacity: Math.max(0, Math.min(1, baseOpacity * fade)), __uniqueKey: `timeline-${clip.id}` });
            }
          } else if (kind === 'effect') {
            const eid = resolveEffectId(clip.asset);
            if (eid) {
              const fade = getFadeFactor(clip);
              const baseOpacity = (() => {
                const v = getParamVal(clip?.params?.opacity);
                return typeof v === 'number' ? v : 1;
              })();
              currentChain.push({ type: 'effect', effectId: eid, params: mergeParams(clip), opacity: Math.max(0, Math.min(1, baseOpacity * fade)), __uniqueKey: `timeline-${clip.id}` });
            }
          } else {
            if (currentChain.length > 0) { chains.push(currentChain); currentChain = []; }
          }
        });
        if (currentChain.length > 0) { chains.push(currentChain); currentChain = []; }

        // Enabled global effects to append to each chain
        const enabledGlobals = Array.isArray(globalEffects) ? globalEffects.filter((g: any) => g && g.enabled) : [];

        const elements: React.ReactElement[] = [];
        let renderedBaseThisFrame = false;
        // Compute blending across successive chains for a short window around cuts
        const CROSSFADE_MS = 160; // chosen for minimal perceptibility
        const chainsWithKeys = chains.map((chain, idx) => ({ chain, idx }));
        // Persist last fully-built chain (video or effect) to support crossfade at cuts
        const lastChainRef = (TimelineScene as any).__lastChainRef || { current: null as any };
        (TimelineScene as any).__lastChainRef = lastChainRef;
        const lastChainKeyRef = (TimelineScene as any).__lastChainKeyRef || { current: '' as string };
        (TimelineScene as any).__lastChainKeyRef = lastChainKeyRef;
        // Track structure-only signature (ignoring per-clip unique keys) to detect identical back-to-back effects
        const lastStructureKeyRef = (TimelineScene as any).__lastStructureKeyRef || { current: '' as string };
        (TimelineScene as any).__lastStructureKeyRef = lastStructureKeyRef;

        // Build quick lookups for active clips by asset and timing window
        const fadeWindowSec = CROSSFADE_MS / 1000;
        const byAsset: Record<string, { relativeTime: number; duration: number; startTime: number; trackId?: string }> = {} as any;
        activeClips.forEach((c: any) => {
          if (c?.asset?.id != null) {
            byAsset[c.asset.id] = {
              relativeTime: Math.max(0, c.relativeTime || 0),
              duration: Math.max(0.001, c.duration || 0.001),
              startTime: c.startTime || 0,
              trackId: c.trackId
            };
          }
        });
        const anyIncomingNotReady = activeClips.some((c: any) => {
          if (!c?.asset?.id) return false;
          const rel = Math.max(0, c.relativeTime || 0);
          if (rel > fadeWindowSec) return false;
          const v = assets.videos.get(String(c.asset.id));
          const anyV: any = v as any;
          const produced = anyV && (anyV.__firstFrameProduced || (v && v.readyState >= 2));
          return !produced;
        });

        let appendedFallback = false;
        // If an incoming video isn't ready yet, immediately draw the previous chain first
        if (anyIncomingNotReady && (TimelineScene as any).__lastChainRef && (TimelineScene as any).__lastChainRef.current && !appendedFallback) {
          const chainWithGlobals = (TimelineScene as any).__lastChainRef.current as ChainItem[];
          const chainKey = 'last-video-fallback-early';
          elements.push(
            <EffectChain
              key={`chain-${chainKey}`}
              items={chainWithGlobals}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              opacity={1}
              baseAssetId={(chainWithGlobals.find((it: any) => it.type === 'video') ? (activeClips.find((c: any) => c.asset && assets.videos.get(String(c.asset?.id ?? '')) === (chainWithGlobals.find((it: any) => it.type === 'video') as any).video)?.asset?.id) : undefined)}
            />
          );
          appendedFallback = true;
        }

        chainsWithKeys.forEach(({ chain, idx }) => {
          const chainKey = chain.map((it) => {
            if (it.type === 'video') return 'video';
            const uk = (it as any).__uniqueKey || '';
            return `${it.type}:${(it as any).effectId || 'eff'}#${uk}`;
          }).join('|');
          // Structure key ignores __uniqueKey so identical adjacent effects won't be treated as a new chain visually
          const structureKey = chain.map((it) => {
            if (it.type === 'video') return 'video';
            return `${it.type}:${(it as any).effectId || 'eff'}`;
          }).join('|');
          const chainWithGlobals: ChainItem[] = enabledGlobals.length > 0
            ? ([...chain, ...enabledGlobals.map((ge: any) => ({ type: 'effect', effectId: ge.effectId, params: ge.params || {} }))] as ChainItem[])
            : chain;
          try { console.log('[TimelineScene] Chain', { idx, key: chainKey, items: chainWithGlobals.length }); } catch {}

          // Determine crossfade factor based on currentTime proximity to neighboring clip boundaries
          let opacity = 1;
          try {
            // Find clips backing this chain: any active clip at current time in activeClips that maps to items in this chain
            const thisVideoId = (chainWithGlobals.find((it) => it.type === 'video') as any)?.video as HTMLVideoElement | undefined;
            const thisAssetId = thisVideoId ? (activeClips.find((c: any) => assets.videos.get(String(c.asset?.id ?? '')) === thisVideoId)?.asset?.id) : undefined;
            // Find nearest previous/next boundary across all tracks
            const times: number[] = [];
            activeClips.forEach((c: any) => {
              if (!c?.asset) return;
              times.push(c.startTime);
              times.push(c.startTime + c.duration);
            });
            let minEdgeDistMs = Infinity;
            for (const t of times) {
              const dist = Math.abs((currentTime - t) * 1000);
              if (dist < minEdgeDistMs) minEdgeDistMs = dist;
            }
            if (minEdgeDistMs <= CROSSFADE_MS) {
              const f = Math.max(0, Math.min(1, minEdgeDistMs / CROSSFADE_MS));
              // Determine incoming/outgoing behavior using relativeTime
              const clipMeta = thisAssetId ? byAsset[thisAssetId] : undefined;
              const rel = clipMeta ? clipMeta.relativeTime : undefined;
              const dur = clipMeta ? clipMeta.duration : undefined;
              const anyV: any = thisVideoId as any;
              const produced = anyV && (anyV.__firstFrameProduced || (thisVideoId && (thisVideoId as any).readyState >= 2));
              const isIncoming = rel != null && rel <= fadeWindowSec;
              const isOutgoing = rel != null && dur != null && (dur - rel) <= fadeWindowSec;
              const sameStructureAsPrev = Boolean(lastStructureKeyRef.current) && lastStructureKeyRef.current === structureKey;

              // Check if video source is unchanged (only effects changed) - avoid crossfade for effect-only changes
              const sameVideoAsPrev = (() => {
                const prevChain = lastChainRef.current as ChainItem[] | null;
                if (!prevChain) return false;
                const prevVideo = prevChain.find((it) => it.type === 'video') as any;
                const currVideo = chainWithGlobals.find((it) => it.type === 'video') as any;
                // Same video element means same source; effect changes shouldn't trigger crossfade
                return prevVideo?.video && currVideo?.video && prevVideo.video === currVideo.video;
              })();

              // For different videos at a cut, ensure we don't expose background by prioritizing outgoing until incoming is truly ready
              if (sameVideoAsPrev) {
                // Effect-only change (same video) - no crossfade, avoid black flash
                opacity = 1;
              } else if (!sameStructureAsPrev && isIncoming && !produced) {
                opacity = 0; // hold off showing incoming until first frame exists
              } else if (!sameStructureAsPrev && isOutgoing && anyIncomingNotReady) {
                opacity = 1; // keep outgoing fully visible until incoming is ready
              } else {
                opacity = sameStructureAsPrev ? 1 : f; // keep full opacity for identical-effect cuts
              }
              try { console.log('[TimelineScene] Crossfade', { idx, key: chainKey, f: Number(f.toFixed(2)), incoming: isIncoming, outgoing: isOutgoing, holdIncoming: isIncoming && !produced, anyIncomingNotReady, sameVideoAsPrev }); } catch {}

              // Also render previous chain behind with 1 - f to avoid black at effect-only cuts
              const prevChain = lastChainRef.current as ChainItem[] | null;
              const prevKey = lastChainKeyRef.current;
              const outOpacity = 1 - f;
              if (!sameStructureAsPrev && prevChain && prevKey && prevKey !== chainKey && outOpacity > 0) {
                try { console.log('[TimelineScene] Prev overlay', { prevKey, key: chainKey, outOpacity: Number(outOpacity.toFixed(2)) }); } catch {}
                elements.push(
                  <EffectChain
                    key={`chain-prev-${prevKey}-${idx}`}
                    items={prevChain}
                    compositionWidth={compositionWidth}
                    compositionHeight={compositionHeight}
                    opacity={outOpacity}
                    baseAssetId={(prevChain.find((it: any) => it.type === 'video') ? (activeClips.find((c: any) => c.asset && assets.videos.get(String(c.asset?.id ?? '')) === (prevChain.find((it: any) => it.type === 'video') as any).video)?.asset?.id) : undefined)}
                  />
                );
              }
            }
          } catch {}

          const containsVideo = chainWithGlobals.some((it) => it.type === 'video');

          if (chainWithGlobals.length === 1 && chainWithGlobals[0].type === 'video') {
            const v = chainWithGlobals[0] as Extract<ChainItem, { type: 'video' }>;
            // IMPORTANT: Always render the chain even if the incoming video isn't ready yet.
            // VideoTexture already has a fallback path; skipping here prevents stacked layers from appearing.
            elements.push(
              <VideoTexture
                key={`video-only-${chainKey}-${idx}`}
                video={v.video}
                opacity={typeof v.opacity === 'number' ? Math.max(0, Math.min(1, v.opacity * opacity)) : opacity}
                blendMode={v.blendMode || 'add'}
                effects={undefined}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                assetId={(activeClips.find((c: any) => c.asset && assets.videos.get(String(c.asset?.id ?? '')) === v.video)?.asset?.id) || undefined}
                renderOrder={idx * 10}
              />
            );
            renderedBaseThisFrame = true;
          } else {
            // Propagate baseAssetId from the chain's video (if any) so EffectChain can seed correctly
            const baseVid = chainWithGlobals.find((it) => it.type === 'video') as any;
            const baseAssetIdForChain = baseVid ? (activeClips.find((c: any) => c.asset && assets.videos.get(String(c.asset?.id ?? '')) === baseVid.video)?.asset?.id) : undefined;
            // Use stable key based on video asset (not chainKey which changes with effects)
            // This prevents React from remounting EffectChain when effects are added/removed,
            // which would cause finalTextureRef to reset and show a black frame.
            const stableKey = baseAssetIdForChain ? `chain-video-${baseAssetIdForChain}-${idx}` : `chain-${chainKey}-${idx}`;
            elements.push(
              <EffectChain
                key={stableKey}
                items={chainWithGlobals}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                opacity={opacity}
                baseAssetId={baseAssetIdForChain}
              />
            );
            if (baseVid) renderedBaseThisFrame = true;
          }

          // Update last chain snapshot for next-frame crossfade
          lastChainRef.current = chainWithGlobals;
          lastChainKeyRef.current = chainKey;
          lastStructureKeyRef.current = structureKey;
          try { console.log('[TimelineScene] Last chain updated', { key: chainKey }); } catch {}
        });

        // If incoming isn't ready, re-append the last chain so it continues to display beneath overlays
        if (anyIncomingNotReady && lastChainRef.current && !appendedFallback) {
          const chainWithGlobals = lastChainRef.current as ChainItem[];
          const chainKey = 'last-video-fallback';
          elements.push(
            <EffectChain
              key={`chain-${chainKey}`}
              items={chainWithGlobals}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              opacity={1}
              baseAssetId={(chainWithGlobals.find((it: any) => it.type === 'video') ? (activeClips.find((c: any) => c.asset && assets.videos.get(String(c.asset?.id ?? '')) === (chainWithGlobals.find((it: any) => it.type === 'video') as any).video)?.asset?.id) : undefined)}
            />
          );
          appendedFallback = true;
        }

        // Safety: if no base video was rendered at all this frame, draw the last stable video chain
        // Only do this safety fallback when there are active clips but a base didn't render
        // (e.g. incoming not ready). Never do it for gaps / zero active clips.
        if (activeClips.length > 0 && !renderedBaseThisFrame && lastChainRef.current) {
          const chainWithGlobals = lastChainRef.current as ChainItem[];
          elements.push(
            <EffectChain
              key={`chain-last-video-safety`}
              items={chainWithGlobals}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              opacity={1}
              baseAssetId={(chainWithGlobals.find((it: any) => it.type === 'video') ? (activeClips.find((c: any) => c.asset && assets.videos.get(String(c.asset?.id ?? '')) === (chainWithGlobals.find((it: any) => it.type === 'video') as any).video)?.asset?.id) : undefined)}
            />
          );
        }

        // Expose active layers for engines (LFO) while timeline is playing
        try {
          const layersForEngine = activeClips.map((clip: any) => ({
            id: `timeline-layer-${clip.id}`,
            clipId: clip.id,
            type: clip.type,
            name: clip.name,
            opacity: typeof clip.opacity === 'number' ? clip.opacity : 1,
            params: clip.params || {},
            asset: clip.asset,
          }));
          (window as any).__vj_timeline_is_playing__ = Boolean(isPlaying);
          (window as any).__vj_timeline_active_layers__ = layersForEngine;
        } catch {}

        // Debug snapshot (always-on; used by overlay in TimelineComposer)
        try {
          const st: any = (useVideoOptionsStore as any).getState?.();
          const getOpts = st?.getVideoOptionsForLayer;
          const clipDebug = (activeClips || []).map((c: any) => {
            const assetId = c?.asset?.id != null ? String(c.asset.id) : '';
            const v = assetId ? assets.videos.get(assetId) : undefined;
            const opts = getOpts && c?.id ? getOpts(`timeline-layer-${c.id}`, true) : null;
            return {
              id: String(c?.id || ''),
              trackId: String(c?.trackId || ''),
              name: String(c?.name || c?.asset?.name || ''),
              kind: classifyClip(c),
              assetId,
              assetType: String(c?.asset?.type || ''),
              hasVideoEl: Boolean(v),
              readyState: v ? (v as any).readyState : null,
              paused: v ? Boolean((v as any).paused) : null,
              cur: v ? Number((v as any).currentTime || 0) : null,
              opacity: typeof opts?.opacity === 'number' ? opts.opacity : null,
              blendMode: opts?.blendMode || null,
            };
          });
          (window as any).__vj_timeline_debug__ = {
            t: Number(currentTime || 0),
            playing: Boolean(isPlaying),
            clips: clipDebug,
            videosLoaded: Array.from(assets.videos.keys()),
          };
        } catch {}
        return elements.map((el, i) => React.cloneElement(el, { key: `rendered-element-${i}` }));
      }, [activeClips, assets.videos, currentTime, globalEffects, compositionWidth, compositionHeight, timelineVideoOptions])}
    </>
  );
};

// Memoize TimelineScene to prevent unnecessary re-renders
const MemoizedTimelineScene = React.memo(TimelineScene);

// Main TimelineComposer Component
const TimelineComposer: React.FC<TimelineComposerProps> = ({
  activeClips,
  isPlaying,
  currentTime,
  width,
  height,
  bpm = 120,
  globalEffects = [],
  tracks = []
}) => {
  try { (window as any).__vj_timeline_composer_loaded__ = true; } catch {}
  try { console.log('[Sonomika][TimelineComposer] render', { activeClips: Array.isArray(activeClips) ? activeClips.length : null, t: currentTime, playing: isPlaying }); } catch {}
  const [maskVisible, setMaskVisible] = useState<boolean>(true);
  const [debugText, setDebugText] = useState<string>('');
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const cutOverlayRef = useRef<HTMLDivElement | null>(null);

  // Always-on debug overlay (inline styles so it can't be "invisible" due to CSS/Tailwind issues).
  // Set window.__vj_timeline_debug_enabled__ = false to hide.
  const showDebug = typeof window !== 'undefined' ? ((window as any).__vj_timeline_debug_enabled__ !== false) : false;
  useEffect(() => {
    if (!showDebug) return;
    const tick = () => {
      try {
        const d: any = (window as any).__vj_timeline_debug__;
        if (!d) {
          setDebugText('timeline debug overlay active\n(waiting for __vj_timeline_debug__)');
          return;
        }
        const lines: string[] = [];
        lines.push(`t=${Number(d.t || 0).toFixed(2)} playing=${Boolean(d.playing)}`);
        const clips = Array.isArray(d.clips) ? d.clips : [];
        lines.push(`clips=${clips.length} videosLoaded=${Array.isArray(d.videosLoaded) ? d.videosLoaded.length : 0}`);
        clips.forEach((c: any) => {
          lines.push(
            `${c.trackId} ${c.kind} ${c.name} ` +
            `assetId=${c.assetId} type=${c.assetType} hasVideo=${c.hasVideoEl} ` +
            `rs=${c.readyState} op=${c.opacity} bm=${c.blendMode}`
          );
        });
        setDebugText(lines.join('\n'));
      } catch {}
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [showDebug]);

  return (
    <div className="tw-w-full tw-h-full tw-relative" style={{ background: '#000' }}>
      {maskVisible && (
        <div className="tw-absolute tw-inset-0 tw-bg-black tw-z-[5] tw-pointer-events-none" />
      )}
      {showDebug && debugText && (
        <pre style={{
          position: 'absolute',
          left: 8,
          top: 8,
          zIndex: 9999,
          pointerEvents: 'none',
          fontSize: 10,
          lineHeight: 1.2,
          color: '#86efac', // green-300
          background: 'rgba(0,0,0,0.75)',
          border: '1px solid rgba(34,197,94,0.35)',
          borderRadius: 6,
          padding: 8,
          maxWidth: '95%',
          whiteSpace: 'pre-wrap',
        }}>
          {debugText}
        </pre>
      )}
      <div className="tw-absolute tw-inset-0 tw-flex tw-items-center tw-justify-center">
        <div style={{ aspectRatio: `${width}/${height}`, width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }} className="tw-flex tw-items-center tw-justify-center">
          <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        key={`timeline-canvas-${width}x${height}`}
        camera={{ position: [0, 0, 1], fov: 90 }}
        className="tw-w-full tw-h-full tw-block"
        dpr={1}
        gl={{ 
          preserveDrawingBuffer: true,
          antialias: false,
          powerPreference: 'high-performance'
        }}
        onCreated={({ gl, camera }) => {
          console.log('Timeline R3F Canvas created successfully');
          try { (gl as any).autoClear = false; } catch {}
          // Keep alpha to let the black container show through and avoid red flashes
          try { (gl as any).setClearColor?.(0x000000, 0); } catch {}
          // Keep a handle to the canvas for cut overlays
          try { canvasElRef.current = (gl as any).domElement as HTMLCanvasElement; } catch {}
          // Renderer color space and tone mapping
          try {
            if ((gl as any).outputColorSpace !== undefined && (THREE as any).SRGBColorSpace) {
              (gl as any).outputColorSpace = (THREE as any).SRGBColorSpace;
            } else if ((gl as any).outputEncoding !== undefined && (THREE as any).sRGBEncoding) {
              (gl as any).outputEncoding = (THREE as any).sRGBEncoding;
            }
            (gl as any).toneMapping = (THREE as any).NoToneMapping;
          } catch {}

          // Keep internal render buffer fixed to composition size, while fitting visually inside container
          const container = gl.domElement.parentElement;
          if (container) {
            const resizeOnce = () => {
              const rect = container.getBoundingClientRect();
              const containerW = Math.max(1, rect.width);
              const containerH = Math.max(1, rect.height);
              const compW = Math.max(1, Number(width) || 1920);
              const compH = Math.max(1, Number(height) || 1080);
              const scale = Math.min(containerW / compW, containerH / compH);
              const cssW = Math.max(1, Math.floor(compW * scale));
              const cssH = Math.max(1, Math.floor(compH * scale));

              // Camera aspect locked to composition
              if (camera && 'aspect' in camera) {
                (camera as THREE.PerspectiveCamera).aspect = compW / compH;
                camera.updateProjectionMatrix();
              }

              // Keep internal buffer EXACTLY at composition resolution
              gl.setPixelRatio(1);
              gl.setSize(compW, compH, false);
              gl.domElement.style.width = '100%';
              gl.domElement.style.height = '100%';
              gl.domElement.style.maxWidth = '100%';
              gl.domElement.style.maxHeight = '100%';
            };
            try { resizeOnce(); } catch {}

            if ((gl as any).__vjResizeObserver) {
              try { (gl as any).__vjResizeObserver.disconnect(); } catch {}
            }
            const ro = new ResizeObserver(debounce(() => {
              try { resizeOnce(); } catch {}
            }, 300)); // Increased debounce from 200ms to 300ms for better performance
            try {
              (gl as any).__vjResizeObserver = ro;
              ro.observe(container);
            } catch {}
          }
        }}
        onError={(error) => {
          console.error('Timeline R3F Canvas error:', error);
        }}
      >
        <HiddenRenderDriver />
        <ClearOnNoActiveClips hasActiveClips={Array.isArray(activeClips) && activeClips.length > 0} />
        <Suspense fallback={
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
        }>
          <MemoizedTimelineScene
            activeClips={activeClips}
            isPlaying={isPlaying}
            currentTime={currentTime}
            bpm={bpm}
            globalEffects={globalEffects}
            compositionWidth={width}
            compositionHeight={height}
            onFirstFrameReady={() => setMaskVisible(false)}
          />
        </Suspense>
      </Canvas>
          </div>
        </div>
      </div>
      {/* Cut overlay element (DOM), created dynamically on clip switches */}
      {(() => {
        if (!cutOverlayRef.current) {
          const el = document.createElement('div');
          el.style.position = 'absolute';
          el.style.inset = '0';
          el.style.pointerEvents = 'none';
          el.style.opacity = '0';
          el.style.zIndex = '6';
          cutOverlayRef.current = el;
          const parent = el?.parentElement || document.querySelector('.tw-w-full.tw-h-full.tw-relative');
          try { (parent || document.body).appendChild(el); } catch {}
        }
        return null;
      })()}
    </div>
  );
};

export default TimelineComposer; 