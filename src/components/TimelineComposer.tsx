import React, { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import EffectChain, { ChainItem } from './EffectChain';
import { getCachedVideoCanvas } from '../utils/AssetPreloader';
import { getEffectComponentSync } from '../utils/EffectLoader';
import { videoAssetManager } from '../utils/VideoAssetManager';
import EffectLoader from './EffectLoader';

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
const lastFrameCanvasCache: Map<string, HTMLCanvasElement> = new Map();

// Video texture component for R3F with fallback like ColumnPreview
const VideoTexture: React.FC<{ 
  video: HTMLVideoElement; 
  opacity: number; 
  blendMode: string;
  effects?: any;
  compositionWidth?: number;
  compositionHeight?: number;
  assetId?: string;
}> = ({ video, opacity, blendMode, effects, compositionWidth, compositionHeight, assetId }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  const [previousTexture, setPreviousTexture] = useState<THREE.VideoTexture | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallbackTexture, setFallbackTexture] = useState<THREE.CanvasTexture | null>(null);
  const liveMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const fallbackMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const frameReadyRef = useRef<boolean>(false);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
              if (assetId) lastFrameCanvasCache.set(assetId, canvas);
            }
          }
        } catch {}
      }
    };
    ensureCanvasAndTexture();
  }, [video, fallbackTexture, assetId]);

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
    }
    if (fallbackMaterialRef.current) {
      fallbackMaterialRef.current.opacity = opacity * fallbackAlpha;
      fallbackMaterialRef.current.transparent = true;
    }
    if (activeTexture && ready) {
      if (frameReadyRef.current) {
        activeTexture.needsUpdate = true;
        frameReadyRef.current = false;
      }
      // Also update previous texture during transition to keep it smooth
      if (isTransitioning && previousTexture) {
        previousTexture.needsUpdate = true;
      }
      // Keep fallback updated when possible
      if (canvas && fallbackTexture) {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            fallbackTexture.needsUpdate = true;
            if (assetId) lastFrameCanvasCache.set(assetId, canvas);
          }
        } catch {}
      }
    }
  });

  // During transition, use previous texture if available, otherwise use current texture
  const activeTexture = isTransitioning && previousTexture ? previousTexture : texture;
  
  // If no texture yet and no fallback, render nothing (mask handles initial); otherwise show fallback
  if (!activeTexture || video.readyState < 2) {
    const compositionAspectRatio = aspectRatio;
    const scaleX = Math.max(compositionAspectRatio / videoAspectRatio, 1);
    const scaleY = Math.max(videoAspectRatio / compositionAspectRatio, 1);
    const finalScaleX = compositionAspectRatio * 2 * scaleX;
    const finalScaleY = 2 * scaleY;
    return (
      <group>
        {fallbackTexture && (
          <mesh>
            <planeGeometry args={[finalScaleX, finalScaleY]} />
            <meshBasicMaterial ref={fallbackMaterialRef} map={fallbackTexture} transparent opacity={opacity} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    );
  }

  // Check if any effects are applied
  const hasEffects = effects && effects.length > 0;

  if (hasEffects) {
    // Use EffectLoader for any effects
    return (
      <EffectLoader 
        videoTexture={activeTexture}
        fallback={
          <mesh>
            <planeGeometry args={[aspectRatio * 2, 2]} />
            <meshBasicMaterial map={activeTexture} />
          </mesh>
        }
      />
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
        <mesh>
          <planeGeometry args={[finalScaleX, finalScaleY]} />
          <meshBasicMaterial ref={fallbackMaterialRef} map={fallbackTexture} transparent opacity={opacity} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Live on top */}
      <mesh ref={meshRef}>
        <planeGeometry args={[finalScaleX, finalScaleY]} />
        <meshBasicMaterial 
          ref={liveMaterialRef}
          map={activeTexture} 
          transparent 
          opacity={1}
          blending={getBlendMode(blendMode)}
          side={THREE.DoubleSide}
          alphaTest={0.1}
        />
      </mesh>
    </group>
  );
};

// Helper function to convert blend modes
const getBlendMode = (blendMode: string): THREE.Blending => {
  switch (blendMode) {
    case 'add':
      return THREE.AdditiveBlending;
    case 'multiply':
      return THREE.MultiplyBlending;
    case 'screen':
      return THREE.CustomBlending;
    case 'overlay':
      return THREE.CustomBlending;
    default:
      return THREE.AdditiveBlending;
  }
};

// Timeline Scene Component with effect support
const TimelineScene: React.FC<{
  activeClips: any[];
  isPlaying: boolean;
  currentTime: number;
  globalEffects?: any[];
  compositionWidth?: number;
  compositionHeight?: number;
  onFirstFrameReady?: () => void;
}> = ({ activeClips, isPlaying, currentTime, globalEffects = [], compositionWidth, compositionHeight, onFirstFrameReady }) => {
  const { camera } = useThree();
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

  const firstFrameReadyRef = useRef<boolean>(false);
  const frameCounterRef = useRef<number>(0);

  console.log('TimelineScene rendering with:', { activeClips, isPlaying, currentTime, assetsCount: assets.images.size + assets.videos.size });

  // Load assets with caching
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

        if (asset.type === 'image') {
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
        } else if (asset.type === 'video') {
          try {
            // Use persistent video per assetId
            let managed = videoAssetManager.get(key);
            if (!managed) {
              managed = await videoAssetManager.getOrCreate(asset, (a) => getAssetPath(a, true));
            }
            const video = managed.element;
            try { video.muted = true; } catch {}
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
  }, [activeClips]);

  // Handle play/pause and video synchronization
  useEffect(() => {
    assets.videos.forEach((video, assetId) => {
      // Find the clip that corresponds to this video
      const activeClip = activeClips.find(clip => clip.asset && clip.asset.id === assetId);
      
      if (isPlaying && activeClip) {
        const targetTime = activeClip.relativeTime || 0;
        
        // Sync video to correct time position to prevent positioning flashes
        if (Math.abs(video.currentTime - targetTime) > 0.15) {
          console.log(`Syncing video ${assetId} to time:`, targetTime);
          video.currentTime = targetTime;
        }
        
        // Force muted autoplay policy compliance and remove readyState gating
        try { video.muted = true; } catch {}
        try { video.playbackRate = 1; } catch {}
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
  }, [isPlaying, assets.videos, activeClips, currentTime]);

  // Additional video sync check during playback to prevent drift
  useEffect(() => {
    if (!isPlaying) return;

    const syncInterval = setInterval(() => {
      assets.videos.forEach((video, assetId) => {
        const activeClip = activeClips.find(clip => clip.asset && clip.asset.id === assetId);
        
        if (activeClip) {
          const targetTime = activeClip.relativeTime || 0;
          const drift = Math.abs(video.currentTime - targetTime);
          
          // Only sync if drift is significant (>200ms) to avoid constant seeking
          if (drift > 0.2) {
            console.log(`Correcting video drift for ${assetId}: ${drift.toFixed(2)}s`);
            video.currentTime = targetTime;
            try { if (video.paused) void video.play(); } catch {}
          }
        }
      });
    }, 200); // Check every 200ms - reduced frequency for better performance

    return () => clearInterval(syncInterval);
  }, [isPlaying, assets.videos, activeClips]);

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
    const hasVideos = activeClips.some((c: any) => c?.asset?.type === 'video');
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
    if (!clip?.asset) return 'unknown';
    if (clip.asset.type === 'video') return 'video';
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
      {(() => {
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

        // Build chains based on activeClips order
        activeClips.forEach((clip: any) => {
          const kind = classifyClip(clip);
          if (kind === 'video') {
            const video = assets.videos.get(clip.asset.id);
            if (!video) {
              if (currentChain.length > 0) { chains.push(currentChain); currentChain = []; }
              return;
            }
            if (currentChain.length > 0) { chains.push(currentChain); currentChain = []; }
            currentChain.push({ type: 'video', video, opacity: clip.opacity, blendMode: clip.blendMode, assetId: clip.asset?.id });
          } else if (kind === 'source') {
            const eid = resolveEffectId(clip.asset);
            if (eid) currentChain.push({ type: 'source', effectId: eid, params: mergeParams(clip) });
          } else if (kind === 'effect') {
            const eid = resolveEffectId(clip.asset);
            if (eid) currentChain.push({ type: 'effect', effectId: eid, params: mergeParams(clip) });
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
        // Persist last fully-built video chain to reuse briefly if incoming isn't ready
        const lastVideoChainRef = (TimelineScene as any).__lastVideoChainRef || { current: null as any };
        (TimelineScene as any).__lastVideoChainRef = lastVideoChainRef;
        // Build quick lookups for active clips by asset
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
          const v = assets.videos.get(c.asset.id);
          const anyV: any = v as any;
          const produced = anyV && (anyV.__firstFrameProduced || (v && v.readyState >= 2));
          return !produced;
        });

        let appendedFallback = false;
        chainsWithKeys.forEach(({ chain, idx }) => {
          const chainKey = chain.map((it) => it.type === 'video' ? 'video' : `${it.type}:${(it as any).effectId || 'eff'}`).join('|');
          const chainWithGlobals: ChainItem[] = enabledGlobals.length > 0
            ? ([...chain, ...enabledGlobals.map((ge: any) => ({ type: 'effect', effectId: ge.effectId, params: ge.params || {} }))] as ChainItem[])
            : chain;

          // Determine crossfade factor based on currentTime proximity to neighboring clip boundaries
          let opacity = 1;
          try {
            // Find clips backing this chain: any active clip at current time in activeClips that maps to items in this chain
            const thisVideoId = (chainWithGlobals.find((it) => it.type === 'video') as any)?.video as HTMLVideoElement | undefined;
            const thisAssetId = thisVideoId ? (activeClips.find((c: any) => assets.videos.get(c.asset?.id) === thisVideoId)?.asset?.id) : undefined;
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
              // For different videos at a cut, ensure we don't expose background by prioritizing outgoing until incoming is truly ready
              if (isIncoming && !produced) {
                opacity = 0; // hold off showing incoming until first frame exists
              } else if (isOutgoing && anyIncomingNotReady) {
                opacity = 1; // keep outgoing fully visible until incoming is ready
              } else {
                opacity = f; // default crossfade
              }
            }
          } catch {}

          const containsVideo = chainWithGlobals.some((it) => it.type === 'video');
          if (containsVideo && !anyIncomingNotReady) {
            // Update last chain snapshot only when stable
            lastVideoChainRef.current = chainWithGlobals;
          }

          if (chainWithGlobals.length === 1 && chainWithGlobals[0].type === 'video') {
            const v = chainWithGlobals[0] as Extract<ChainItem, { type: 'video' }>;
            // If this video is the incoming and not produced yet, skip drawing it this frame (hold outgoing)
            try {
              const thisAssetId = activeClips.find((c: any) => assets.videos.get(c.asset?.id) === v.video)?.asset?.id;
              const clipMeta = thisAssetId ? byAsset[thisAssetId] : undefined;
              const rel = clipMeta ? clipMeta.relativeTime : undefined;
              const isIncoming = rel != null && rel <= fadeWindowSec;
              const anyV: any = v.video as any;
              const produced = anyV && (anyV.__firstFrameProduced || (v.video && (v.video as any).readyState >= 2));
              if (isIncoming && !produced) {
                return; // skip rendering this incoming video chain
              }
            } catch {}
            elements.push(
              <VideoTexture
                key={`video-only-${chainKey}-${idx}`}
                video={v.video}
                opacity={typeof v.opacity === 'number' ? Math.max(0, Math.min(1, v.opacity * opacity)) : opacity}
                blendMode={'add'}
                effects={undefined}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                assetId={(activeClips.find((c: any) => c.asset && assets.videos.get(c.asset.id) === v.video)?.asset?.id) || undefined}
              />
            );
            renderedBaseThisFrame = true;
          } else {
            // Propagate baseAssetId from the chain's video (if any) so EffectChain can seed correctly
            const baseVid = chainWithGlobals.find((it) => it.type === 'video') as any;
            const baseAssetIdForChain = baseVid ? (activeClips.find((c: any) => c.asset && assets.videos.get(c.asset.id) === baseVid.video)?.asset?.id) : undefined;
            elements.push(
              <EffectChain
                key={`chain-${chainKey}-${idx}`}
                items={chainWithGlobals}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                opacity={opacity}
                baseAssetId={baseAssetIdForChain}
              />
            );
            if (baseVid) renderedBaseThisFrame = true;
          }
        });

        // If incoming isn't ready, re-append the last video chain so it continues to display beneath overlays
        if (anyIncomingNotReady && lastVideoChainRef.current && !appendedFallback) {
          const chainWithGlobals = lastVideoChainRef.current as ChainItem[];
          const chainKey = 'last-video-fallback';
          elements.push(
            <EffectChain
              key={`chain-${chainKey}`}
              items={chainWithGlobals}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              opacity={1}
              baseAssetId={(chainWithGlobals.find((it: any) => it.type === 'video') ? (activeClips.find((c: any) => c.asset && assets.videos.get(c.asset.id) === (chainWithGlobals.find((it: any) => it.type === 'video') as any).video)?.asset?.id) : undefined)}
            />
          );
          appendedFallback = true;
        }

        // Safety: if no base video was rendered at all this frame, draw the last stable video chain
        if (!renderedBaseThisFrame && lastVideoChainRef.current) {
          const chainWithGlobals = lastVideoChainRef.current as ChainItem[];
          elements.push(
            <EffectChain
              key={`chain-last-video-safety`}
              items={chainWithGlobals}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              opacity={1}
              baseAssetId={(chainWithGlobals.find((it: any) => it.type === 'video') ? (activeClips.find((c: any) => c.asset && assets.videos.get(c.asset.id) === (chainWithGlobals.find((it: any) => it.type === 'video') as any).video)?.asset?.id) : undefined)}
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
        return elements.map((el, i) => React.cloneElement(el, { key: `rendered-element-${i}` }));
      })()}
    </>
  );
};

// Main TimelineComposer Component
const TimelineComposer: React.FC<TimelineComposerProps> = ({
  activeClips,
  isPlaying,
  currentTime,
  width,
  height,
  globalEffects = [],
  tracks = []
}) => {
  const [maskVisible, setMaskVisible] = useState<boolean>(true);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const cutOverlayRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="tw-w-full tw-h-full tw-relative" style={{ background: '#000' }}>
      {maskVisible && (
        <div className="tw-absolute tw-inset-0 tw-bg-black tw-z-[5] tw-pointer-events-none" />
      )}
      <Canvas
        camera={{ position: [0, 0, 1], fov: 90 }}
        className="tw-w-full tw-h-full tw-block"
        dpr={[1, Math.min(1.5, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1)]}
        gl={{ 
          preserveDrawingBuffer: true,
          antialias: false,
          powerPreference: 'high-performance'
        }}
        onCreated={({ gl }) => {
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
        }}
        onError={(error) => {
          console.error('Timeline R3F Canvas error:', error);
        }}
      >
        <Suspense fallback={
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
        }>
          <TimelineScene
            activeClips={activeClips}
            isPlaying={isPlaying}
            currentTime={currentTime}
            globalEffects={globalEffects}
            compositionWidth={width}
            compositionHeight={height}
            onFirstFrameReady={() => setMaskVisible(false)}
          />
        </Suspense>
      </Canvas>
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