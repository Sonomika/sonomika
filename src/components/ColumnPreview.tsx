import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import EffectLoader from './EffectLoader';
import { useEffectComponent, getEffectComponentSync } from '../utils/EffectLoader';

interface ColumnPreviewProps {
  column: any;
  width: number;
  height: number;
  isPlaying: boolean;
  bpm: number;
  globalEffects?: any[];
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
      texture.needsUpdate = true;
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
}> = ({ column, isPlaying, globalEffects = [], compositionWidth, compositionHeight }) => {
  const { camera, gl, scene } = useThree();
  const [assets, setAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });
  
  // Use ref to track loaded assets to prevent infinite loops
  const loadedAssetsRef = useRef<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });

  // Global asset cache to persist videos across column switches
  const globalAssetCacheRef = useRef<{
    videos: Map<string, HTMLVideoElement>;
  }>({ videos: new Map() });

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
            // Check global cache first to prevent flash during column switches
            let video = globalAssetCacheRef.current.videos.get(asset.id);
            
            if (video) {
              console.log('✅ Using cached video for asset:', asset.name);
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

              try { void video.play(); } catch {}

              // Cache the video globally for future column switches
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

  // Handle play/pause
  useEffect(() => {
    assets.videos.forEach(video => {
      if (isPlaying) {
        video.play().catch(console.warn);
      } else {
        video.pause();
      }
    });
  }, [isPlaying, assets.videos]);

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
      

      
      {/* Render all layers */}
      {(() => {
        // Find all video layers and effect layers
        const videoLayers = sortedLayers.filter(layer => 
          layer.asset && layer.asset.type === 'video'
        );
        const effectLayers = sortedLayers.filter(layer => {
          if (!layer.asset) return false;
          
          // Check multiple ways an asset can be identified as an effect
          const isEffect = 
            layer.asset.type === 'p5js' || 
            layer.asset.type === 'effect' || 
            layer.asset.type === 'threejs' ||
            layer.asset.isEffect === true ||
            // Check if it's a source effect from EffectsBrowser
            (layer.asset.type === 'effect' && layer.asset.effect) ||
            // Check if it has effects array
            (layer.effects && layer.effects.length > 0);
          
          console.log('🔍 Layer filtering check:', {
            name: layer.name,
            assetType: layer.asset.type,
            isEffect: layer.asset.isEffect,
            hasEffect: !!layer.asset.effect,
            hasEffects: !!layer.effects,
            effectsCount: layer.effects?.length || 0,
            isEffectResult: isEffect,
            asset: layer.asset
          });
          
          if (isEffect) {
            console.log('🎨 Effect layer detected:', {
              name: layer.name,
              assetType: layer.asset.type,
              isEffect: layer.asset.isEffect,
              hasEffects: !!layer.effects,
              effectsCount: layer.effects?.length || 0,
              asset: layer.asset
            });
          }
          
          return isEffect;
        });

        console.log('Layers - Video:', videoLayers.map(l => l.name), 'Effects:', effectLayers.map(l => l.name));
        
        // Debug: Show full layer structure for source effects
        console.log('🔍 Full layer structure for debugging:', sortedLayers.map(layer => ({
          name: layer.name,
          asset: layer.asset,
          effects: layer.effects,
          assetType: layer.asset?.type,
          isEffect: layer.asset?.isEffect,
          hasEffects: !!layer.effects,
          effectsCount: layer.effects?.length || 0
        })));
        
        // Debug: Show detailed layer content
        console.log('🔍 Detailed layer content:', sortedLayers.map(layer => {
          if (layer.asset) {
            return {
              name: layer.name,
              assetKeys: Object.keys(layer.asset),
              assetType: layer.asset.type,
              isEffect: layer.asset.isEffect,
              hasEffect: !!layer.asset.effect,
              effectKeys: layer.asset.effect ? Object.keys(layer.asset.effect) : null,
              metadata: layer.asset.metadata,
              effectMetadata: layer.asset.effect?.metadata,
              effects: layer.effects
            };
          }
          return { name: layer.name, asset: null };
        }));

        const renderedElements: React.ReactElement[] = [];

        // First, render video layers
        // Create video textures map outside the loop to avoid hooks in loops
        const videoTextures = useMemo(() => {
          const textures = new Map();
          videoLayers.forEach((videoLayer) => {
            const video = assets.videos.get(videoLayer.asset.id);
            if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
              const texture = new THREE.VideoTexture(video);
              texture.minFilter = THREE.LinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.format = THREE.RGBAFormat;
              texture.generateMipmaps = false;
              texture.needsUpdate = true; // Force texture update
              textures.set(videoLayer.asset.id, texture);
            }
          });
          return textures;
        }, [videoLayers, assets.videos]);

        // Update video textures when playing
        useEffect(() => {
          if (isPlaying) {
            videoTextures.forEach((texture) => {
              texture.needsUpdate = true;
            });
          }
        }, [videoTextures, isPlaying]);

        videoLayers.forEach((videoLayer) => {
          const video = assets.videos.get(videoLayer.asset.id);
          if (!video) return;

          const key = `video-${videoLayer.id}`;

          // Check if there are any effect layers that should be applied to this video
          const effectLayersForVideo = effectLayers.filter(effectLayer => {
            const effectAsset = effectLayer.asset;
            return effectAsset && (effectAsset.type === 'effect' || effectAsset.type === 'threejs');
          });

          if (effectLayersForVideo.length > 0) {
            // Apply the first effect to the video
            const firstEffect = effectLayersForVideo[0];
            const effectAsset = firstEffect.asset;
            console.log('🎨 Video effect asset:', effectAsset);
            
            // Handle nested effect structure
            let effectId = null;
            if (effectAsset.effect) {
              // Nested effect structure: {type: 'effect', effect: {...}}
              effectId = effectAsset.effect.id || effectAsset.effect.name || effectAsset.effect.type;
            } else {
              // Direct effect structure
              effectId = effectAsset.id || effectAsset.name;
            }
            
            // If we still don't have an ID, try to extract from filePath or generate from name
            if (!effectId) {
              if (effectAsset.filePath) {
                effectId = effectAsset.filePath.replace('.tsx', '').replace(/^.*[\\\/]/, '');
              } else if (effectAsset.name) {
                effectId = effectAsset.name;
              } else {
                console.warn('No valid effect ID found for effect asset:', effectAsset);
                return; // Skip rendering this effect instead of using 'unknown'
              }
            }
            
            // Use filename directly - no conversion needed
            console.log('🎨 Using effect ID for video:', effectId);
            
            // Calculate proper aspect ratio for video (handled in VideoTexture)
            
            // Scale video to fit composition while maintaining aspect ratio
            // (computed in VideoTexture instead)
            
            // Get video texture from the map
            const videoTexture = videoTextures.get(videoLayer.asset.id);
            
            // Check if this effect replaces the video
            const EffectComponent = getEffectComponentSync(effectId);
            const effectMetadata = EffectComponent ? (EffectComponent as any).metadata : null;
            const replacesVideo = effectMetadata?.replacesVideo === true;
            
            console.log('🎬 Effect metadata check:', { effectId, replacesVideo, metadata: effectMetadata });
            
            // Create a stable key for the effect component
            const effectKey = `effect-${effectId}-${key}`;
            
            // Create a mock layer for the effect with video texture
            const mockEffectLayer = {
              asset: {
                id: effectId,
                name: effectAsset.effect?.name || effectAsset.name || effectId,
                type: 'effect'
              },
              params: {
                ...firstEffect.params,
                ...effectAsset.effect?.params, // Include nested effect params
                videoTexture: videoTexture // Pass video texture to effect
              },
              opacity: firstEffect.opacity || 1,
              blendMode: firstEffect.blendMode || 'add'
            };

            if (replacesVideo) {
              // Render a fading fallback/live video underneath the replacing effect to avoid flashes
              renderedElements.push(
                <React.Fragment key={`${key}-replaced`}>
                  <VideoTexture
                    video={video}
                    opacity={videoLayer.opacity || 1}
                    effects={undefined}
                    compositionWidth={compositionWidth}
                    compositionHeight={compositionHeight}
                    cacheKey={videoLayer.asset?.id || String(key)}
                  />
                  <EffectLayer 
                    key={effectKey}
                    layer={mockEffectLayer}
                  />
                </React.Fragment>
              );
            } else {
              // Render both the base video (with fading fallback) and the effect on top
              renderedElements.push(
                <React.Fragment key={`${key}-container`}>
                  <VideoTexture
                    video={video}
                    opacity={videoLayer.opacity || 1}
                    effects={undefined}
                    compositionWidth={compositionWidth}
                    compositionHeight={compositionHeight}
                    cacheKey={videoLayer.asset?.id || String(key)}
                  />
                  <EffectLayer 
                    key={effectKey}
                    layer={mockEffectLayer}
                  />
                </React.Fragment>
              );
            }
          } else {
            // Render normal video
            renderedElements.push(
              <VideoTexture
                key={key}
                video={video}
                opacity={videoLayer.opacity || 1}
                effects={videoLayer.effects}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                cacheKey={videoLayer.asset?.id || String(key)}
              />
            );
          }
        });

        // Then, render standalone effects using unified system
        effectLayers.forEach((effectLayer) => {
          const effectAsset = effectLayer.asset;
          if (!effectAsset) return;

          console.log('🎨 Processing effect layer:', effectLayer.name, 'asset:', effectAsset, 'asset keys:', Object.keys(effectAsset));
          
            // Use unified effect renderer for all effects
          // Handle different effect data structures
          let effectId = null;
          if (effectAsset.effect) {
            // Nested effect structure: {type: 'effect', effect: {...}}
            effectId = effectAsset.effect.id || effectAsset.effect.name || effectAsset.effect.type;
          } else {
            // Direct effect structure
            effectId = effectAsset.id || effectAsset.name;
          }
          
          // If we still don't have an ID, try to extract from filePath or generate from name
          if (!effectId) {
            if (effectAsset.filePath) {
              effectId = effectAsset.filePath.replace('.tsx', '').replace(/^.*[\\\/]/, '');
            } else if (effectAsset.name) {
              effectId = effectAsset.name;
            } else {
              console.warn('No valid effect ID found for effect asset:', effectAsset);
              return; // Skip rendering this effect instead of using 'unknown'
            }
          }
          
          // Use filename directly - no conversion needed
          console.log('🎨 Standalone effect ID resolved:', effectId);
          console.log('🎨 Effect asset structure:', effectAsset);
          
          const effectName = effectAsset.name || effectAsset.id || 'Unknown Effect';
          
          console.log('🎨 Using effect ID:', effectId, 'name:', effectName, 'asset:', effectAsset);
          
           const renderedEffect = renderEffect(
            effectId, 
            effectName, 
            effectLayer.params, 
            false // isGlobal = false for layer effects
          );
          
          if (renderedEffect) {
            renderedElements.push(renderedEffect);
            console.log('🎨 Added effect to rendered elements:', effectAsset.id);
          }
        });

        // Apply global effects using unified system
        const activeGlobalEffect = globalEffects.find((effect: any) => effect.enabled);
        
        console.log('🌐 Global effects array:', globalEffects);
        console.log('🌐 Active global effect:', activeGlobalEffect);
        
        if (activeGlobalEffect) {
          console.log('🌐 Applying global effect:', activeGlobalEffect.effectId);
          console.log('🌐 Global effect params:', activeGlobalEffect.params);
          
          // Use unified effect renderer for global effects
          const renderedGlobalEffect = renderEffect(
            activeGlobalEffect.effectId,
            activeGlobalEffect.effectId, // Use effectId as name for globals
            activeGlobalEffect.params,
            true // isGlobal = true for global effects
          );
          
          if (renderedGlobalEffect) {
            renderedElements.push(renderedGlobalEffect);
            console.log('🌐 Added global effect to rendered elements:', activeGlobalEffect.effectId);
          }
        }

        return renderedElements.map((element, index) => 
          React.cloneElement(element, { key: `rendered-element-${index}` })
        );
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
  globalEffects = []
}) => {
  const [error, setError] = useState<string | null>(null);

  // No React state-driven frame loop; R3F useFrame handles rendering

  console.log('ColumnPreview rendering with:', { column, isPlaying });

  // Error boundary
  if (error) {
    return (
      <div className="column-preview">
        <div className="preview-header-info">
          <h4>Column Preview - Error</h4>
        </div>
        <div className="preview-main-content">
          <div style={{ 
            width: '100%', 
            height: '100%', 
            backgroundColor: '#1a1a1a',
            color: '#ff0000',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column'
          }}>
            <h3>Rendering Error</h3>
            <p>{error}</p>
            <button 
              onClick={() => setError(null)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#00bcd4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="column-preview">
      <div className="preview-main-content">
           <div style={{ 
          width: '100%', 
          height: '100%', 
          background: 'transparent',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
             willChange: 'transform',
             contain: 'layout paint size style'
        }}>
          {/* Full width container */}
          <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Debug indicator */}
            <div style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '10px',
              fontWeight: 'normal',
              zIndex: 1,
              pointerEvents: 'none',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              padding: '2px 6px',
              borderRadius: '3px'
            }}>
              R3F
            </div>
            
            {/* Persistent last-frame placeholder layer */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#111',
              overflow: 'hidden'
            }}>
              {/* This element is visually behind the canvas; video frames render on top */}
            </div>

            <Canvas
              camera={{ position: [0, 0, 1], fov: 90 }}
              style={{ 
                width: '100%', 
                height: '100%',
                display: 'block',
                background: 'transparent'
              }}
              gl={{ 
                alpha: true,
                preserveDrawingBuffer: false,
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
                    // Get the composition settings from the store
                    const compositionSettings = useStore.getState().compositionSettings;
                    const targetAspectRatio = compositionSettings.width / compositionSettings.height;
                    
                    // Calculate container dimensions based on target aspect ratio
                    const containerRect = container.getBoundingClientRect();
                    const containerWidth = containerRect.width;
                    const containerHeight = containerWidth / targetAspectRatio;
                    
                    // Update camera aspect ratio to match target
                    if (camera && 'aspect' in camera) {
                      (camera as THREE.PerspectiveCamera).aspect = targetAspectRatio;
                      camera.updateProjectionMatrix();
                    }
                    
                    // Set renderer size to match calculated dimensions
                    gl.setSize(containerWidth, containerHeight, false);
                    
                    // Force canvas element to match calculated dimensions
                     gl.domElement.style.width = `${containerWidth}px`;
                     gl.domElement.style.height = `${containerHeight}px`;
                     // Avoid forcing canvas backing-store resize every tick; let R3F manage
                    
                    // Update container height to match aspect ratio
                    container.style.height = `${containerHeight}px`;
                  } catch (error) {
                    console.error('Error in canvas setup:', error);
                  }
                }
                
                // Add resize observer to maintain aspect ratio (single instance)
                if ((gl as any).__vjResizeObserver) {
                  try { (gl as any).__vjResizeObserver.disconnect(); } catch {}
                }
                const resizeObserver = new ResizeObserver(() => {
                  if (container) {
                    try {
                      const compositionSettings = useStore.getState().compositionSettings;
                      const targetAspectRatio = compositionSettings.width / compositionSettings.height;
                      
                      const containerRect = container.getBoundingClientRect();
                      const containerWidth = containerRect.width;
                      const containerHeight = containerWidth / targetAspectRatio;
                      
                      if (camera && 'aspect' in camera) {
                        (camera as THREE.PerspectiveCamera).aspect = targetAspectRatio;
                        camera.updateProjectionMatrix();
                      }
                      
                       gl.setSize(containerWidth, containerHeight, false);
                       gl.domElement.style.width = `${containerWidth}px`;
                       gl.domElement.style.height = `${containerHeight}px`;
                      
                      container.style.height = `${containerHeight}px`;
                    } catch (error) {
                      console.error('Error in resize observer:', error);
                    }
                  }
                });
                
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
                column={column} 
                isPlaying={isPlaying} 
                globalEffects={globalEffects}
                compositionWidth={width}
                compositionHeight={height}
              />
            </Canvas>
          </div>
        </div>
      </div>
    </div>
  );
}); 