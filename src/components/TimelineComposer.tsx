import React, { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import EffectChain, { ChainItem } from './EffectChain';
import { getEffectComponentSync } from '../utils/EffectLoader';
import EffectLoader from './EffectLoader';

interface TimelineComposerProps {
  activeClips: any[];
  isPlaying: boolean;
  currentTime: number;
  width: number;
  height: number;
  bpm?: number;
  globalEffects?: any[];
}

// Video texture component for R3F (same as ColumnPreview)
const VideoTexture: React.FC<{ 
  video: HTMLVideoElement; 
  opacity: number; 
  blendMode: string;
  effects?: any;
  compositionWidth?: number;
  compositionHeight?: number;
}> = ({ video, opacity, blendMode, effects, compositionWidth, compositionHeight }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  
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
      console.log('Creating video texture for:', video.src);
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.generateMipmaps = false;
      setTexture(videoTexture);
    }
  }, [video]);

  useFrame(() => {
    if (texture && video.readyState >= 2) {
      texture.needsUpdate = true;
    }
  });

  if (!texture || video.readyState < 2) {
    console.log('Video not ready, readyState:', video.readyState);
    // Render a transparent placeholder instead of null to prevent black flash
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
        videoTexture={texture}
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
  const compositionAspectRatio = aspectRatio;
  const scaleX = Math.max(compositionAspectRatio / videoAspectRatio, 1);
  const scaleY = Math.max(videoAspectRatio / compositionAspectRatio, 1);
  const finalScaleX = compositionAspectRatio * 2 * scaleX;
  const finalScaleY = 2 * scaleY;
  
  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[finalScaleX, finalScaleY]} />
      <meshBasicMaterial 
        map={texture} 
        transparent 
        opacity={opacity}
        blending={getBlendMode(blendMode)}
        side={THREE.DoubleSide}
        alphaTest={0.1}
      />
    </mesh>
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
}> = ({ activeClips, isPlaying, currentTime, globalEffects = [], compositionWidth, compositionHeight }) => {
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

  console.log('TimelineScene rendering with:', { activeClips, isPlaying, currentTime, assetsCount: assets.images.size + assets.videos.size });

  // Load assets with caching
  useEffect(() => {
    const loadAssets = async () => {
      const newImages = new Map<string, HTMLImageElement>();
      const newVideos = new Map<string, HTMLVideoElement>();
        
      for (const clip of activeClips) {
        if (!clip.asset) continue;

        const asset = clip.asset;
        
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
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = asset.path;
            });
            newImages.set(asset.id, img);
            console.log(`✅ Image loaded for clip ${clip.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load image for clip ${clip.name}:`, error);
          }
        } else if (asset.type === 'video') {
          try {
            // Check global cache first to prevent flash during timeline changes
            let video = globalAssetCacheRef.current.videos.get(asset.id);
            
            if (video) {
              console.log('✅ Using cached video for asset:', asset.name);
              newVideos.set(asset.id, video);
              continue; // Skip the loading process
            }
            
            console.log('Loading new video with path:', getAssetPath(asset, true), 'for asset:', asset.name);
            video = document.createElement('video');
            const assetPath = getAssetPath(asset, true); // Use file path for video playback
            video.src = assetPath;
            video.muted = true;
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.backgroundColor = 'transparent';
            
            // Performance optimization for timeline playback and column switching
            video.style.imageRendering = 'optimizeSpeed';
            video.preload = 'auto'; // Changed from 'metadata' to 'auto' for better caching
            
            await new Promise<void>((resolve, reject) => {
              video.addEventListener('loadeddata', () => {
                console.log('Video loaded successfully:', asset.name);
                resolve();
              });
              video.addEventListener('error', reject);
              video.load();
            });
            
            // Cache the video globally for future timeline/column switches
            globalAssetCacheRef.current.videos.set(asset.id, video);
            newVideos.set(asset.id, video);
            console.log(`✅ Video loaded and cached for clip ${clip.name}:`, asset.name);
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
        
        if (video.paused) {
          video.play().catch(() => {
            console.warn('Could not auto-play video');
          });
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
      {/* Background */}
      <color attach="background" args={[0, 0, 0]} />
      
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
            currentChain.push({ type: 'video', video, opacity: clip.opacity, blendMode: clip.blendMode });
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
        chains.forEach((chain) => {
          const chainKey = chain.map((it) => it.type === 'video' ? 'video' : `${it.type}:${(it as any).effectId || 'eff'}`).join('|');
          const chainWithGlobals: ChainItem[] = enabledGlobals.length > 0
            ? ([...chain, ...enabledGlobals.map((ge: any) => ({ type: 'effect', effectId: ge.effectId, params: ge.params || {} }))] as ChainItem[])
            : chain;

          if (chainWithGlobals.length === 1 && chainWithGlobals[0].type === 'video') {
            const v = chainWithGlobals[0] as Extract<ChainItem, { type: 'video' }>;
            elements.push(
              <VideoTexture
                key={`video-only-${chainKey}`}
                video={v.video}
                opacity={typeof v.opacity === 'number' ? v.opacity : 1}
                blendMode={'add'}
                effects={undefined}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
              />
            );
          } else {
            elements.push(
              <EffectChain
                key={`chain-${chainKey}`}
                items={chainWithGlobals}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
              />
            );
          }
        });

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
  globalEffects = []
}) => {
  return (
    <div className="tw-w-full tw-h-full">
      <Canvas
        camera={{ position: [0, 0, 1], fov: 90 }}
        className="tw-w-full tw-h-full tw-block"
        gl={{ 
          preserveDrawingBuffer: true,
          antialias: true,
          powerPreference: 'high-performance'
        }}
        onCreated={({ gl }) => {
          console.log('Timeline R3F Canvas created successfully');
          gl.setClearColor(0x000000, 1);
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
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default TimelineComposer; 