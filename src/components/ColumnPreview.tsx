import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import EffectLoader from './EffectLoader';
import { getCachedVideo, getCachedVideoCanvas } from '../utils/AssetPreloader';
import { useEffectComponent, getEffectComponentSync } from '../utils/EffectLoader';
import EffectChain, { ChainItem } from './EffectChain';
import { debounce } from '../utils/debounce';

interface ColumnPreviewProps {
  column: any;
  width: number;
  height: number;
  isPlaying: boolean;
  bpm: number;
  globalEffects?: any[];
  overridesKey?: string;
}

// Cache last frame canvases per asset to avoid flashes across mounts
const lastFrameCanvasCache: Map<string, HTMLCanvasElement> = new Map();

// Video texture component for R3F
const VideoTexture: React.FC<{ 
  video: HTMLVideoElement; 
  opacity: number; 
  effects?: any;
  compositionWidth?: number;
  compositionHeight?: number;
  cacheKey?: string;
}> = ({ video, opacity, effects, compositionWidth, compositionHeight, cacheKey }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallbackTexture, setFallbackTexture] = useState<THREE.CanvasTexture | null>(null);
  const liveMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const fallbackMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const liveAlphaRef = useRef(1);
  const fallbackReadyRef = useRef(false);
  const lastTimeRef = useRef(0);
  const loopGuardUntilRef = useRef(0);
  const frameReadyRef = useRef<boolean>(false);
  
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
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.generateMipmaps = false;
      // Ensure correct color space to avoid washed-out appearance
      // Support both newer and older Three.js versions
      try {
        (videoTexture as any).colorSpace = (THREE as any).SRGBColorSpace || (videoTexture as any).colorSpace;
        if (!(videoTexture as any).colorSpace && (THREE as any).sRGBEncoding) {
          (videoTexture as any).encoding = (THREE as any).sRGBEncoding;
        }
      } catch {}
      setTexture(videoTexture);
    }
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

  // Initialize and keep an updated canvas-based fallback texture with the last good frame
  useEffect(() => {
    if (!video) return;
    const onTimeUpdate = () => {
      const current = video.currentTime || 0;
      const duration = video.duration || 0;
      if (duration > 0) {
        // Detect loop wrap-around (from end to start)
        if (lastTimeRef.current > duration - 0.08 && current < 0.08) {
          loopGuardUntilRef.current = performance.now() + 400; // hold fallback a bit longer across loop
          liveAlphaRef.current = 0;
        }
        // Pre-capture last frame shortly before loop to avoid black
        if (current > duration - 0.2) {
          const canvas = offscreenCanvasRef.current;
          if (canvas && fallbackTexture) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                fallbackTexture.needsUpdate = true;
              } catch {}
            }
          }
        }
      }
      lastTimeRef.current = current;
    };
    const armGuard = () => {
      loopGuardUntilRef.current = performance.now() + 400;
      liveAlphaRef.current = 0;
    };
    const ensureCanvasAndTexture = () => {
      if (!offscreenCanvasRef.current) {
        // Try to reuse from cache first
        if (cacheKey && lastFrameCanvasCache.has(cacheKey)) {
          offscreenCanvasRef.current = lastFrameCanvasCache.get(cacheKey)!;
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
          try {
            (tex as any).colorSpace = (THREE as any).SRGBColorSpace || (tex as any).colorSpace;
            if (!(tex as any).colorSpace && (THREE as any).sRGBEncoding) {
              (tex as any).encoding = (THREE as any).sRGBEncoding;
            }
          } catch {}
          setFallbackTexture(tex);
        }
        // If preloader captured a first frame, seed immediately
        try {
          // Prefer explicit asset id if available on the video element
          let seeded: HTMLCanvasElement | null = null;
          try {
            const layerAssetId = (video as any).dataset?.assetId || null;
            if (layerAssetId) seeded = getCachedVideoCanvas(layerAssetId) || null;
          } catch {}
          if (!seeded && cacheKey) {
            seeded = getCachedVideoCanvas(cacheKey.replace(/^video-only-/, '')) || null;
          }
          if (seeded) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(seeded, 0, 0, canvas.width, canvas.height);
              if (fallbackTexture) fallbackTexture.needsUpdate = true;
              if (cacheKey) lastFrameCanvasCache.set(cacheKey, canvas);
            }
          }
        } catch {}
        // Try to seed the fallback immediately from the current frame
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const draw = () => {
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                if (fallbackTexture) fallbackTexture.needsUpdate = true;
                if (cacheKey) lastFrameCanvasCache.set(cacheKey, canvas);
              } catch {}
            };
            // Prefer requestVideoFrameCallback if available for accurate timing
            const anyVideo: any = video as any;
            if (typeof anyVideo.requestVideoFrameCallback === 'function') {
              anyVideo.requestVideoFrameCallback(() => draw());
            } else {
              // Fallback to RAF to give video element a tick
              requestAnimationFrame(draw);
            }
          }
        } catch {}
      }
    };
    ensureCanvasAndTexture();
    const onLoadedData = () => ensureCanvasAndTexture();
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeking', armGuard);
    video.addEventListener('waiting', armGuard);
    video.addEventListener('stalled', armGuard);
    video.addEventListener('suspend', armGuard);
    video.addEventListener('ended', armGuard);
    return () => {
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeking', armGuard);
      video.removeEventListener('waiting', armGuard);
      video.removeEventListener('stalled', armGuard);
      video.removeEventListener('suspend', armGuard);
      video.removeEventListener('ended', armGuard);
    };
  }, [video, fallbackTexture, cacheKey]);

  // Update fallback only on real video frames when supported to reduce CPU/GPU work
  useEffect(() => {
    if (!video || !fallbackTexture) return;
    const anyVideo: any = video as any;
    if (typeof anyVideo.requestVideoFrameCallback !== 'function') return;

    let stop = false;
    const canvas = offscreenCanvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    const tick = () => {
      if (stop || !ctx || !canvas) return;
      try {
        if (video.videoWidth && video.videoHeight) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          fallbackTexture.needsUpdate = true;
          if (cacheKey) lastFrameCanvasCache.set(cacheKey, canvas);
        }
      } catch {}
      anyVideo.requestVideoFrameCallback(tick);
    };
    const handle = anyVideo.requestVideoFrameCallback(tick);
    return () => {
      stop = true;
      try { anyVideo.cancelVideoFrameCallback?.(handle); } catch {}
    };
  }, [video, fallbackTexture, cacheKey]);

  useFrame(() => {
    const ready = !!(texture && video.readyState >= 2);
    const canvas = offscreenCanvasRef.current;
    const hasFallback = !!(fallbackTexture && canvas && canvas.width > 0 && canvas.height > 0);
    const guardActive = performance.now() < loopGuardUntilRef.current;

    let liveAlpha = 1;
    let fallbackAlpha = 0;

    if (guardActive || !ready) {
      // Show cached frame only (no fade)
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

    if (texture && ready) {
      if (frameReadyRef.current) {
        texture.needsUpdate = true;
        frameReadyRef.current = false;
      }
      // If rVFC isn't available, do occasional updates inline
      if (!(video as any).requestVideoFrameCallback && canvas && fallbackTexture) {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            fallbackTexture.needsUpdate = true;
            if (cacheKey) lastFrameCanvasCache.set(cacheKey, canvas);
          }
        } catch {}
      }
    }
  });

  // Compute geometry scale for both live and fallback
  const compositionAspectRatio = aspectRatio;
  const scaleX = Math.max(compositionAspectRatio / videoAspectRatio, 1);
  const scaleY = Math.max(videoAspectRatio / compositionAspectRatio, 1);
  const finalScaleX = compositionAspectRatio * 2 * scaleX;
  const finalScaleY = 2 * scaleY;

  if (!texture && !fallbackTexture) {
    // Nothing to render yet
    return (
      <mesh>
        <planeGeometry args={[aspectRatio * 2, 2]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0} />
      </mesh>
    );
  }

  // Check if any effects are applied
  const hasEffects = effects && effects.length > 0;
  
  if (hasEffects) {
    // Use EffectLoader for any effects
    return (
      <EffectLoader 
        videoTexture={texture ?? undefined}
        fallback={
          <mesh>
            <planeGeometry args={[aspectRatio * 2, 2]} />
            <meshBasicMaterial map={texture} />
          </mesh>
        }
      />
    );
  }

  // For square preview (1080x1080), use square geometry and scale video to cover
  return (
    <group>
      {/* Render fallback first so it sits behind */}
      {fallbackTexture && (
        <mesh>
          <planeGeometry args={[finalScaleX, finalScaleY]} />
          <meshBasicMaterial ref={fallbackMaterialRef} map={fallbackTexture} transparent opacity={opacity} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Render live video on top; if not ready, we'll keep it transparent while fallback shows */}
      {texture && (
        <mesh ref={meshRef}>
          <planeGeometry args={[finalScaleX, finalScaleY]} />
          <meshBasicMaterial 
            ref={liveMaterialRef}
            map={texture} 
            transparent
            opacity={1}
            blending={THREE.NormalBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};

// Effect component for R3F


const EffectLayer: React.FC<{ 
  layer: any; 
  isGlobal?: boolean;
}> = ({ layer, isGlobal = false }) => {
  const effectId = layer.asset?.id || layer.asset?.name;
  
  console.log('🔍 EffectLayer - layer asset:', layer.asset);
  console.log('🔍 EffectLayer - effectId:', effectId);
  console.log('🔍 EffectLayer - layer params:', layer.params);
  console.log('🔍 EffectLayer - isGlobal:', isGlobal);
  
  const EffectComponent = useEffectComponent(effectId);

  if (!EffectComponent) {
    console.warn(`No effect component found for ID: ${effectId}`);
    return null;
  }

  console.log('✅ EffectLayer - EffectComponent found, rendering with props:', {
    ...layer.params,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    isGlobal
  });

  // Convert parameter objects to direct values for the effect component
  const effectProps = { ...layer.params };
  
  // Convert parameter objects with 'value' property to direct values
  Object.keys(effectProps).forEach(key => {
    if (effectProps[key] && typeof effectProps[key] === 'object' && 'value' in effectProps[key]) {
      effectProps[key] = effectProps[key].value;
    }
  });

  console.log('✅ EffectLayer - Converted props for effect:', effectProps);

  return (
    <EffectComponent 
      {...effectProps}
      opacity={layer.opacity}
      blendMode={layer.blendMode}
      isGlobal={isGlobal}
    />
  );
};

// Main scene component for R3F
const ColumnScene: React.FC<{
  column: any;
  isPlaying: boolean;
  globalEffects?: any[];
  compositionWidth?: number;
  compositionHeight?: number;
  onFirstFrameReady?: () => void;
}> = ({ column, isPlaying, globalEffects = [], compositionWidth, compositionHeight, onFirstFrameReady }) => {
  const { camera, gl, scene } = useThree();
  const [assets, setAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });
  const pendingRestartRef = useRef<boolean>(false);
  const firstFrameReadyRef = useRef<boolean>(false);
  const frameCounterRef = useRef<number>(0);
  
  // Reset first-frame readiness whenever the column changes so we don't unmask too early
  useEffect(() => {
    firstFrameReadyRef.current = false;
    frameCounterRef.current = 0;
  }, [column?.id]);
  
  // Use ref to track loaded assets to prevent infinite loops
  const loadedAssetsRef = useRef<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });

  // Local cache remains for continuity within this component instance,
  // but we also consult the global preloader cache to avoid flashes.
  const globalAssetCacheRef = useRef<{ videos: Map<string, HTMLVideoElement> }>({ videos: new Map() });

  // Performance optimization: removed excessive logging

  // Cleanup function to revoke blob URLs
  useEffect(() => {
    return () => {
      // Clean up blob URLs when component unmounts
      assets.images.forEach((img) => {
        if (img.src && img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src);
        }
      });
      assets.videos.forEach((video) => {
        if (video.src && video.src.startsWith('blob:')) {
          URL.revokeObjectURL(video.src);
        }
      });
    };
  }, [assets.images, assets.videos]);

  // Load assets with caching
  useEffect(() => {
    const loadAssets = async () => {
      const newImages = new Map<string, HTMLImageElement>();
      const newVideos = new Map<string, HTMLVideoElement>();
        
      for (const layer of column.layers) {
        if (!layer.asset) continue;

        const asset = layer.asset;
        
        // Check if asset is already loaded
        if (loadedAssetsRef.current.images.has(asset.id)) {
          newImages.set(asset.id, loadedAssetsRef.current.images.get(asset.id)!);
          continue;
        }
        if (loadedAssetsRef.current.videos.has(asset.id)) {
          newVideos.set(asset.id, loadedAssetsRef.current.videos.get(asset.id)!);
          continue;
        }

        if (asset.type === 'image') {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            // Ensure we have a valid path before loading
            let assetPath = asset.path;
            if (!assetPath || (assetPath.startsWith('blob:') && !assetPath.includes('localhost')) || 
                (assetPath.startsWith('blob:') && assetPath.includes('localhost') && assetPath.includes('5173'))) {
              // Try to restore from base64 if available
              if (asset.base64Data) {
                console.log('Restoring image from base64 for:', asset.name);
                const restoredBlobURL = convertBase64ToBlobURL(asset.base64Data, asset.type);
                if (restoredBlobURL) {
                  assetPath = restoredBlobURL;
                  console.log('Image restored successfully from base64');
                }
              }
            }
            
            if (!assetPath) {
              console.warn('No valid path for image asset:', asset.name);
              continue;
            }
            
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = (e) => {
                console.error('Failed to load image:', asset.name, 'path:', assetPath, 'error:', e);
                reject(e);
              };
              img.src = assetPath;
            });
            newImages.set(asset.id, img);
            console.log(`✅ Image loaded for layer ${layer.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load image for layer ${layer.name}:`, error);
          }
        } else if (asset.type === 'video') {
          try {
            // Prefer globally preloaded/cached video first to prevent flash during column switches
            let video = getCachedVideo(asset.id) || globalAssetCacheRef.current.videos.get(asset.id);
            
            if (video) {
              console.log('✅ Using cached video for asset:', asset.name);
              // Ensure cached video has the layer ID attribute
              video.setAttribute('data-layer-id', layer.id);
              newVideos.set(asset.id, video);
            } else {
              console.log('Loading new video with path:', getAssetPath(asset, true), 'for asset:', asset.name);
              video = document.createElement('video');
              
              // Ensure we have a valid path before loading
              let assetPath = getAssetPath(asset, true); // Use file path for video playback
              if (!assetPath || (assetPath.startsWith('blob:') && !assetPath.includes('localhost')) || 
                  (assetPath.startsWith('blob:') && assetPath.includes('localhost') && assetPath.includes('5173'))) {
                // Try to restore from base64 if available
                if (asset.base64Data) {
                  console.log('Restoring video from base64 for:', asset.name);
                  const restoredBlobURL = convertBase64ToBlobURL(asset.base64Data, asset.type);
                  if (restoredBlobURL) {
                    assetPath = restoredBlobURL;
                    console.log('Video restored successfully from base64');
                  }
                }
              }
              
              if (!assetPath) {
                console.warn('No valid path for video asset:', asset.name);
                continue;
              }
              
              video.src = assetPath;
              video.muted = true;
              video.loop = true;
              video.autoplay = true;
              video.playsInline = true;
              video.style.backgroundColor = 'transparent';
              video.crossOrigin = 'anonymous';
              video.setAttribute('data-layer-id', layer.id); // Add layer ID for playMode control
              try { (video as any).dataset = { ...(video as any).dataset, assetId: asset.id }; } catch {}
              try { (video as any)["__layerKey"] = layer.id; } catch {}
              
              // Performance optimization for column switching
              video.preload = 'auto'; // Preload video data to reduce flash on column switch
              video.style.imageRendering = 'optimizeSpeed';

              await new Promise<void>((resolve, reject) => {
                const onReady = () => {
                  // Ensure we have dimensions before resolving
                  if (video!.videoWidth > 0 && video!.videoHeight > 0) {
                    resolve();
                  } else {
                    // Some browsers fire loadeddata early; poll once more
                    setTimeout(() => resolve(), 0);
                  }
                };
                video!.addEventListener('loadeddata', onReady, { once: true });
                video!.addEventListener('error', (e) => {
                  console.error('Video loading error:', asset.name, 'path:', assetPath, 'error:', e);
                  reject(e);
                });
                video!.load();
              });

              try {
                const p = video.play();
                if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {});
              } catch {}

              // Cache locally for this component, while global cache is managed by preloader
              globalAssetCacheRef.current.videos.set(asset.id, video);
              newVideos.set(asset.id, video);
              console.log(`✅ Video ready and cached for layer ${layer.name}:`, asset.name);
            }
          } catch (error) {
            console.error(`❌ Failed to prepare video for layer ${layer.name}:`, error);
          }
        }
      }

      // Store in ref for future use
      loadedAssetsRef.current = { images: newImages, videos: newVideos };
      setAssets({ images: newImages, videos: newVideos });
    };

    loadAssets();
  }, [column]);

  // Handle play/pause without resetting on param changes
  const prevIsPlayingRef = useRef<boolean>(false);
  useEffect(() => {
    const isTimelinePreview = column?.id === 'timeline-preview';
    if (isPlaying) {
      const justStarted = !prevIsPlayingRef.current;
      column.layers.forEach((layer: any) => {
        if (!layer?.asset || layer.asset.type !== 'video') return;
        const video = assets.videos.get(layer.asset.id);
        if (!video) return;
        if (!isTimelinePreview && justStarted) {
          const mode = (layer as any).playMode ?? 'restart';
          if (mode === 'restart') {
            try { video.currentTime = 0; } catch {}
          }
        }
        try {
          const p = video.play();
          if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {});
        } catch {}
      });
    } else {
      assets.videos.forEach(video => {
        try { video.pause(); } catch {}
      });
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, assets.videos, column.layers, column?.id]);

  // New: handle video playMode events using assets cache within ColumnScene
  useEffect(() => {
    const handleVideoRestart = (e: CustomEvent) => {
      const { layerId, columnId } = e.detail || {};
      if (columnId !== column.id) return;
      const targetLayer = column.layers.find((l: any) => l.id === layerId);
      if (!targetLayer || !targetLayer.asset) return;
      const video = assets.videos.get(targetLayer.asset.id);
      if (video) {
        try { video.currentTime = 0; } catch {}
        try { const p = video.play(); if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {}); } catch {}
      }
    };

    const handleVideoContinue = (e: CustomEvent) => {
      const { layerId, columnId } = e.detail || {};
      if (columnId !== column.id) return;
      const targetLayer = column.layers.find((l: any) => l.id === layerId);
      if (!targetLayer || !targetLayer.asset) return;
      const video = assets.videos.get(targetLayer.asset.id);
      if (video && video.paused) {
        try { const p = video.play(); if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {}); } catch {}
      }
    };

    document.addEventListener('videoRestart', handleVideoRestart as EventListener);
    document.addEventListener('videoContinue', handleVideoContinue as EventListener);
    const handleColumnPlayEvt = (e: CustomEvent) => {
      const { columnId } = e.detail || {};
      if (columnId !== column.id) return;
      // Mark restart pending; we'll try now and on subsequent asset updates
      pendingRestartRef.current = true;
      const tryRestart = () => {
        let handledAny = false;
        column.layers.forEach((l: any) => {
          if (!l?.asset || l.asset.type !== 'video') return;
          const mode = (l as any).playMode ?? 'restart';
          const v = assets.videos.get(l.asset.id);
          if (mode === 'restart' && v) {
            try { v.currentTime = 0; } catch {}
            try { const p = v.play(); if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {}); } catch {}
            handledAny = true;
          }
        });
        if (handledAny) pendingRestartRef.current = false;
        return handledAny;
      };
      // Immediate and a couple of retries to cover async asset readiness
      if (!tryRestart()) {
        setTimeout(tryRestart, 60);
        setTimeout(tryRestart, 140);
      }
    };
    document.addEventListener('columnPlay', handleColumnPlayEvt as EventListener);
    return () => {
      document.removeEventListener('videoRestart', handleVideoRestart as EventListener);
      document.removeEventListener('videoContinue', handleVideoContinue as EventListener);
      document.removeEventListener('columnPlay', handleColumnPlayEvt as EventListener);
    };
  }, [column.id, column.layers, assets.videos]);

  // If assets arrive after a columnPlay, complete pending restart
  useEffect(() => {
    if (!pendingRestartRef.current) return;
    let handledAny = false;
    column.layers.forEach((l: any) => {
      if (!l?.asset || l.asset.type !== 'video') return;
      const mode = (l as any).playMode ?? 'restart';
      const v = assets.videos.get(l.asset.id);
      if (mode === 'restart' && v) {
        try { v.currentTime = 0; } catch {}
        try { const p = v.play(); if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {}); } catch {}
        handledAny = true;
      }
    });
    if (handledAny) pendingRestartRef.current = false;
  }, [assets.videos, column.layers]);

  // Set up camera
  useEffect(() => {
    camera.position.z = 1;
    if ('fov' in camera) {
      (camera as THREE.PerspectiveCamera).fov = 90;
      camera.updateProjectionMatrix();
    }
    // Ensure camera is looking at the center
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Signal first frame ready: when any video is ready or when effects-only have rendered a couple of frames
  useFrame(() => {
    if (firstFrameReadyRef.current) return;
    const hasVideos = column.layers.some((l: any) => l.asset?.type === 'video');
    const anyReady = Array.from(assets.videos.values()).some(v => v.readyState >= 2);
    frameCounterRef.current += 1;
    const enoughFrames = frameCounterRef.current >= 2;
    if (anyReady || (!hasVideos && enoughFrames)) {
      firstFrameReadyRef.current = true;
      try { onFirstFrameReady && onFirstFrameReady(); } catch {}
    }
  });

  // Sort layers from bottom to top
  const sortedLayers = useMemo(() => {
    return [...column.layers].sort((a, b) => {
      const aNum = parseInt(a.name.replace('Layer ', ''));
      const bNum = parseInt(b.name.replace('Layer ', ''));
      return bNum - aNum; // Descending order (3, 2, 1)
    });
  }, [column.layers]);

  // (Removed conditional background logic; canvas kept transparent)

  // Helper function to get proper file path for Electron
  const getAssetPath = (asset: any, useForPlayback: boolean = false) => {
    if (!asset) return '';
    console.log('getAssetPath called with asset:', asset, 'useForPlayback:', useForPlayback);
    
    // For video playback, prioritize file paths over blob URLs
    if (useForPlayback && asset.type === 'video') {
      if (asset.filePath) {
        const filePath = `file://${asset.filePath}`;
        console.log('Using file path for video playback:', filePath);
        return filePath;
      }
      if (asset.path && asset.path.startsWith('file://')) {
        console.log('Using existing file URL for video playback:', asset.path);
        return asset.path;
      }
      if (asset.path && asset.path.startsWith('local-file://')) {
        const filePath = asset.path.replace('local-file://', '');
        const standardPath = `file://${filePath}`;
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
      const filePath = `file://${asset.filePath}`;
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

  // Helper function to convert base64 data back to blob URL
  const convertBase64ToBlobURL = (base64Data: string, type: string) => {
    try {
      // Remove the data URL prefix if present
      const base64WithoutPrefix = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      
      // Validate base64 data
      if (!base64WithoutPrefix || base64WithoutPrefix.length === 0) {
        console.error('Invalid base64 data');
        return null;
      }
      
      // Decode base64 to binary
      const byteCharacters = atob(base64WithoutPrefix);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      
      // Create blob with proper MIME type
      const blob = new Blob([byteArray], { type });
      
      // Validate blob
      if (blob.size === 0) {
        console.error('Created blob is empty');
        return null;
      }
      
      const blobURL = URL.createObjectURL(blob);
      
      // Validate blob URL format
      if (!blobURL.startsWith('blob:')) {
        console.error('Invalid blob URL format:', blobURL);
        return null;
      }
      
      console.log('Successfully created blob URL:', blobURL, 'for type:', type, 'size:', byteArray.length);
      return blobURL;
    } catch (error) {
      console.error('Error converting base64 to blob URL:', error);
      return null;
    }
  };

  // Unified effect rendering system
  const renderEffect = (effectId: string, effectName: string, params: any = {}, isGlobal: boolean = false) => {
    const effectKey = isGlobal ? `global-${effectId}` : `layer-${effectId}`;
    const effectParams = params || {};
    
    console.log(`🎨 Rendering ${isGlobal ? 'global' : 'layer'} effect:`, effectId, effectName, effectParams);

    // Create a mock layer object for the effect
    const mockLayer = {
      asset: {
        id: effectId,
        name: effectName,
        type: 'effect'
      },
      params: effectParams,
      opacity: 1,
      blendMode: 'add'
    };

    return (
      <EffectLayer 
        key={effectKey}
        layer={mockLayer}
        isGlobal={isGlobal}
      />
    );
  };

  return (
    <>
      {/* Keep canvas fully transparent; placeholder sits behind persistently */}
      {(() => {
        try { gl.setClearAlpha(0); } catch {}
        try { (scene as any).background = null; } catch {}
        return null;
      })()}
      

      
      {/* Render all layers using chain-based stacking */}
      {(() => {
        const layersBottomUp = [...sortedLayers].reverse();

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

        const classifyLayer = (layer: any): 'video' | 'source' | 'effect' | 'unknown' => {
          if (!layer?.asset) return 'unknown';
          if (layer.asset.type === 'video') return 'video';
          const effectId = resolveEffectId(layer.asset);
          if (!effectId) return 'unknown';
          const Comp = getEffectComponentSync(effectId);
          const md = (Comp as any)?.metadata;
          if (md?.isSource === true || md?.folder === 'sources') return 'source';
          return 'effect';
        };

        const chains: ChainItem[][] = [];
        const normalizeParams = (layer: any): Record<string, any> => {
          const out: Record<string, any> = {};
          const merge = (obj: any) => {
            if (!obj) return;
            Object.keys(obj).forEach((k) => {
              const v: any = obj[k];
              out[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
            });
          };
          // layer.params first
          merge(layer?.params);
          // merge nested effect params if present
          const nestedParams = layer?.asset?.effect?.params;
          merge(nestedParams);
          return out;
        };
        let current: ChainItem[] = [];

        const finalize = () => {
          if (current.length > 0) {
            chains.push(current);
            current = [];
          }
        };

        for (const layer of layersBottomUp) {
          const kind = classifyLayer(layer);
          if (kind === 'video') {
            const video = assets.videos.get(layer.asset.id);
            if (!video) {
              finalize();
              continue;
            }
            if (current.length > 0) finalize(); // enforce: video must be bottom-most in its stack
            current.push({ 
              type: 'video', 
              video, 
              assetId: layer.asset.id, 
              opacity: layer.opacity, 
              blendMode: layer.blendMode,
              fitMode: (layer as any)?.fitMode,
              backgroundSizeMode: (layer as any)?.backgroundSizeMode,
              backgroundRepeat: (layer as any)?.backgroundRepeat,
              backgroundSizeCustom: (layer as any)?.backgroundSizeCustom,
              renderScale: (layer as any)?.renderScale,
              __uniqueKey: `video-${layer.id}`
            });
          } else if (kind === 'source') {
            const effectId = resolveEffectId(layer.asset);
            if (!effectId) continue;
            current.push({ 
              type: 'source', 
              effectId, 
              params: { ...normalizeParams(layer) }, // Clone params
              __uniqueKey: `source-${layer.id}`
            });
          } else if (kind === 'effect') {
            const effectId = resolveEffectId(layer.asset);
            if (!effectId) continue;
            current.push({ 
              type: 'effect', 
              effectId, 
              params: { ...normalizeParams(layer) }, // Clone params
              __uniqueKey: `effect-${layer.id}`
            });
              } else {
            // Unknown/empty layer: skip without breaking the chain so effects across gaps still apply
            // (was: finalize())
            // no-op
          }
        }
        finalize();

        const elements: React.ReactElement[] = [];

        // Determine any enabled global effects to append to each chain
        const enabledGlobalEffects = Array.isArray(globalEffects)
          ? globalEffects.filter((ge: any) => ge && ge.enabled)
          : [];

        chains.forEach((chain, chainIndex) => {
          const chainKey = chain.map((it) => {
            if (it.type === 'video') {
              const v: any = (it as any).video;
              const lid = (v && (v as any)["__layerKey"]) || 'vid';
              // Include effective fit mode; fall back to global default if unspecified
              const fm = (it as any).fitMode || 'cover';
              const br = (it as any).backgroundRepeat || 'no-repeat';
              const bsm = (it as any).backgroundSizeMode || 'auto';
              return `video:${lid}:${fm}:${br}:${bsm}`;
            }
            return `${it.type}:${(it as any).effectId || 'eff'}`;
          }).join('|');
          // Try to include the layer's row and source column id in the key for uniqueness
          const rowHint = (() => {
            try {
              const vItem: any = (chain || []).find((it: any) => it?.type === 'video');
              const row = vItem?.video?.__rowNum || vItem?.video?.rowNum || null;
              const srcCol = vItem?.video?.__sourceColumnId || vItem?.video?.sourceColumnId || null;
              if (row || srcCol) return `r${row || 'x'}-c${srcCol || 'x'}`;
            } catch {}
            return 'r?-c?';
          })();
          // Append enabled global effects at the end of each chain so they run as part of the chain
          const chainWithGlobals: ChainItem[] = enabledGlobalEffects.length > 0
            ? ([...chain, ...enabledGlobalEffects.map((ge: any, globalIndex) => {
                // Normalize global params: unwrap { value } objects to raw values like layer params
                const normalizedParams: Record<string, any> = {};
                if (ge && ge.params) {
                  Object.keys(ge.params).forEach((k) => {
                    const v = ge.params[k];
                    normalizedParams[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
                  });
                }
                return {
                  type: 'effect' as const,
                  effectId: ge.effectId,
                  params: normalizedParams,
                };
              })] as ChainItem[])
            : chain;
          
          // Render current chain (no crossfade logic)
          elements.push(
            <EffectChain
              key={`chain-${column?.id || 'col'}-${rowHint}-${chainIndex}-${chainKey}`}
              items={chainWithGlobals}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
            />
          );
        });

        return elements;
      })()}
    </>
  );
};

// Note: kept for compatibility in case of future use (no-op here)
const getBlendMode = (_blendMode: string): THREE.Blending => THREE.AdditiveBlending;

export const ColumnPreview: React.FC<ColumnPreviewProps> = React.memo(({ 
  column, 
  width, 
  height, 
  isPlaying, 
  bpm,
  globalEffects = [],
  overridesKey,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [maskVisible, setMaskVisible] = useState<boolean>(true);
  
  // Re-arm mask whenever the column changes so background never shows during switch
  useEffect(() => {
    try { setMaskVisible(true); } catch {}
    // Signal mirror to freeze on last frame while new column warms up
    try { window.dispatchEvent(new CustomEvent('mirrorFreeze', { detail: { freeze: true } })); } catch {}
  }, [column?.id]);
  // Use composition background color behind the transparent canvas so sources show correct bg
  const compositionBg = (() => {
    try {
      return useStore.getState().compositionSettings?.backgroundColor || '#000000';
    } catch {
      return '#000000';
    }
  })();

  // No React state-driven frame loop; R3F useFrame handles rendering
  // (Handlers moved into ColumnScene using assets cache)

  // Error boundary
  if (error) {
    return (
      <div className="tw-w-full tw-h-full tw-flex tw-flex-col">
        <div className="tw-flex tw-items-center tw-justify-between tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800">
          <h4 className="tw-text-sm tw-text-white">Column Preview - Error</h4>
        </div>
        <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center tw-bg-neutral-900">
          <div className="tw-text-center tw-text-red-500 tw-space-y-2">
            <h3 className="tw-text-base">Rendering Error</h3>
            <p className="tw-text-sm">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="tw-rounded tw-bg-sky-600 hover:tw-bg-sky-500 tw-text-white tw-px-3 tw-py-1.5"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-w-full tw-h-full tw-flex tw-flex-col">
      <div className="tw-flex-1">
           <div className="tw-relative tw-flex tw-items-center tw-justify-center tw-w-full tw-h-full" style={{ background: compositionBg, willChange: 'transform', contain: 'layout paint size style' }}>
            {/* Full width container */}
           <div className="tw-w-full tw-h-full tw-bg-transparent tw-relative tw-overflow-hidden">
              {/* Black mask overlay to hide composition background until first frame is ready */}
              {maskVisible && (
                <div className="tw-absolute tw-inset-0 tw-bg-black tw-z-[5] tw-pointer-events-none" />
              )}
              {/* Debug indicator removed */}
              
              {/* Background is provided by wrapper via compositionBg; keep this layer transparent */}
             <div className="tw-absolute tw-inset-0 tw-bg-transparent tw-pointer-events-none" />
 
              <Canvas
                camera={{ position: [0, 0, 1], fov: 90 }}
               className="tw-w-full tw-h-full tw-block tw-bg-transparent"
                dpr={Math.min(window.devicePixelRatio || 1, 2)}
                gl={{ 
                  alpha: true,
                  preserveDrawingBuffer: true,
                  antialias: false,
                  powerPreference: 'high-performance',
                  premultipliedAlpha: false
                }}
              onCreated={({ gl, camera }) => {
                // Check if this column contains only source effects
                const hasOnlySourceEffects = column.layers.every((layer: any) => {
                  if (!layer.asset) return true;
                  
                  // Check multiple locations for source effect identification
                  const isSource = 
                    // Direct asset metadata
                    layer.asset.metadata?.folder === 'sources' || 
                    layer.asset.metadata?.isSource === true ||
                    layer.asset.category === 'Sources' ||
                    // Nested effect metadata (from EffectsBrowser drag)
                    layer.asset.effect?.metadata?.folder === 'sources' ||
                    layer.asset.effect?.metadata?.isSource === true ||
                    layer.asset.effect?.category === 'Sources' ||
                    // Check if the asset itself is marked as a source
                    layer.asset.isSource === true;
                  
                  return isSource;
                });
                
                // Renderer color management to prevent washed-out colors
                try {
                  if ((gl as any).outputColorSpace !== undefined && (THREE as any).SRGBColorSpace) {
                    (gl as any).outputColorSpace = (THREE as any).SRGBColorSpace;
                  } else if ((gl as any).outputEncoding !== undefined && (THREE as any).sRGBEncoding) {
                    (gl as any).outputEncoding = (THREE as any).sRGBEncoding;
                  }
                  (gl as any).toneMapping = (THREE as any).NoToneMapping;
                } catch {}

                if (hasOnlySourceEffects) {
                  // For source effects, keep canvas transparent and let composition layer underneath show through
                  try { gl.setClearAlpha(0); } catch {}
                  try { (gl as any).setClearColor?.(0x000000, 0); } catch {}
                  try { (gl as any).domElement.style.background = 'transparent'; } catch {}
                  gl.domElement.style.background = 'transparent';
                  console.log('🎨 R3F Canvas created with transparent background for sources');
                } else {
                  // Non-source: ensure opaque clear so content is not blended with page background
                  try { gl.setClearAlpha(1); } catch {}
                  console.log('🎨 R3F Canvas created with opaque background for mixed/non-source content');
                }
                
                console.log('R3F Canvas created successfully');
                
                // Force the renderer to respect the container's aspect ratio
                const container = gl.domElement.parentElement;
                if (container) {
                  try {
                    // Use the rendered box as-is; its parent already enforces the composition aspect ratio
                    const rect = container.getBoundingClientRect();
                    const widthPx = Math.max(1, rect.width);
                    const heightPx = Math.max(1, rect.height);

                    // Update camera aspect to current box ratio
                    if (camera && 'aspect' in camera) {
                      (camera as THREE.PerspectiveCamera).aspect = widthPx / heightPx;
                      camera.updateProjectionMatrix();
                    }

                    // Set device pixel ratio for crisp rendering
                    const dpr = Math.min(window.devicePixelRatio || 1, 2);
                    gl.setPixelRatio(dpr);
                    
                    // Size renderer to the container box with proper pixel ratio
                    gl.setSize(widthPx, heightPx, false);
                    gl.domElement.style.width = '100%';
                    gl.domElement.style.height = '100%';
                  } catch (error) {
                    console.error('Error in canvas setup:', error);
                  }
                }
                
                // Add resize observer to maintain aspect ratio (single instance)
                if ((gl as any).__vjResizeObserver) {
                  try { (gl as any).__vjResizeObserver.disconnect(); } catch {}
                }
                // Debounce expensive resize computations
                const handleResize = debounce(() => {
                  if (container) {
                    try {
                      const rect = container.getBoundingClientRect();
                      const widthPx = Math.max(1, rect.width);
                      const heightPx = Math.max(1, rect.height);

                      if (camera && 'aspect' in camera) {
                        (camera as THREE.PerspectiveCamera).aspect = widthPx / heightPx;
                        camera.updateProjectionMatrix();
                      }

                      // Maintain device pixel ratio for crisp rendering
                      const dpr = Math.min(window.devicePixelRatio || 1, 2);
                      gl.setPixelRatio(dpr);
                      gl.setSize(widthPx, heightPx, false);
                      gl.domElement.style.width = '100%';
                      gl.domElement.style.height = '100%';
                    } catch (error) {
                      console.error('Error in resize observer:', error);
                    }
                  }
                }, 200);

                const resizeObserver = new ResizeObserver(() => handleResize());
                
                if (container) {
                  (gl as any).__vjResizeObserver = resizeObserver;
                  resizeObserver.observe(container);
                }
              }}
              onError={(error) => {
                console.error('R3F Canvas error:', error);
                setError(`Canvas Error: ${error instanceof Error ? error.message : String(error)}`);
              }}
            >
              <ColumnScene 
                key={`scene-${width}x${height}-${column?.id || 'col'}-${overridesKey || 'base'}`}
                column={column} 
                isPlaying={isPlaying} 
                globalEffects={globalEffects}
                compositionWidth={width}
                compositionHeight={height}
                onFirstFrameReady={() => {
                  setMaskVisible(false);
                  // Unfreeze mirror when first frame is ready
                  try { window.dispatchEvent(new CustomEvent('mirrorFreeze', { detail: { freeze: false } })); } catch {}
                }}
              />
            </Canvas>
          </div>
        </div>
      </div>
    </div>
  );
}); 