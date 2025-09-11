import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectComponent } from '../utils/EffectLoader';
import { useStore } from '../store/store';
import { WorkerFrameRenderer } from '../utils/WorkerFrameRenderer';
import { FRAME_BUFFER_CONFIG, VIDEO_PIPELINE_CONFIG } from '../constants/video';
import { WorkerVideoPipeline } from '../utils/WorkerVideoPipeline';
import { WorkerCanvasDrawer } from '../utils/WorkerCanvasDrawer';
import { demuxWithMediaSource } from '../utils/Demuxers';

interface CanvasRendererProps {
  assets: Array<{
    type: 'image' | 'video' | 'effect';
    asset: any;
    layer: any;
  }>;
  width: number;
  height: number;
  bpm?: number;
  isPlaying?: boolean;
}

// Worker-backed CanvasTexture for video when supported
const WorkerVideoTexture: React.FC<{ 
  video: HTMLVideoElement; 
  opacity: number; 
  blendMode: string;
}> = ({ video, opacity, blendMode }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | THREE.Texture | null>(null);
  const rendererRef = useRef<WorkerFrameRenderer | null>(null);
  const pipelineRef = useRef<WorkerVideoPipeline | null>(null);
  const drawerRef = useRef<WorkerCanvasDrawer | null>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const [fallback, setFallback] = useState<boolean>(false);

  useEffect(() => {
    if (!video) return;
    const w = Math.max(1, video.videoWidth || 640);
    const h = Math.max(1, video.videoHeight || 360);

    // Prefer decode worker pipeline delivering ImageBitmap frames
    const ensureCaptureVideo = async (): Promise<HTMLVideoElement> => {
      let cap = captureVideoRef.current;
      if (!cap) {
        cap = document.createElement('video');
        cap.src = video.currentSrc || video.src;
        cap.muted = true;
        cap.playsInline = true;
        cap.preload = 'auto';
        captureVideoRef.current = cap;
      }
      if (cap.readyState < 1) {
        await new Promise<void>((resolve) => {
          const onMeta = () => { resolve(); };
          cap!.addEventListener('loadedmetadata', onMeta, { once: true });
          try { cap!.load(); } catch {}
        });
      }
      return cap;
    };

    const pipeline = new WorkerVideoPipeline({
      src: video.currentSrc || video.src,
      width: w,
      height: h,
      nbFramesToCheck: VIDEO_PIPELINE_CONFIG.NB_FRAMES_TO_CHECK,
      requestMarginMs: VIDEO_PIPELINE_CONFIG.REQUEST_MARGIN_MS,
      maxQueueSize: VIDEO_PIPELINE_CONFIG.MAX_QUEUE_SIZE,
      clock: () => (video.currentTime || 0),
      onQueueStats: ({ size }) => { try {
        // Passively bubble queue size to overlay by updating registry meta
        // The registry entry is already updated inside the pipeline, overlay reads from there.
      } catch {} },
      onFrame: (bitmap) => {
        // Prefer worker canvas drawing for zero main-thread painting
        let drawer = drawerRef.current;
        if (!drawer) {
          drawer = new WorkerCanvasDrawer({ width: w, height: h, onFrame: () => { try { const t: any = texture as any; if (t) t.needsUpdate = true; } catch {} } });
          drawer.start();
          drawerRef.current = drawer;
          const canvas = drawer.canvas!;
          const canvasTex = new THREE.CanvasTexture(canvas);
          canvasTex.minFilter = THREE.LinearFilter;
          canvasTex.magFilter = THREE.LinearFilter;
          canvasTex.format = THREE.RGBAFormat;
          canvasTex.generateMipmaps = false;
          try {
            (canvasTex as any).colorSpace = (THREE as any).SRGBColorSpace || (canvasTex as any).colorSpace;
            if (!(canvasTex as any).colorSpace && (THREE as any).sRGBEncoding) {
              (canvasTex as any).encoding = (THREE as any).sRGBEncoding;
            }
          } catch {}
          setTexture(canvasTex);
        }
        try { drawer.draw(bitmap); } finally { try { bitmap.close?.(); } catch {} }
      },
      // Fallback capture path: createImageBitmap at a target time
      fallbackCapture: async (timeSec: number) => {
        try {
          const cap = await ensureCaptureVideo();
          await new Promise<void>((resolve, reject) => {
            const onSeeked = () => resolve();
            const onErr = () => reject(new Error('seek error'));
            cap.addEventListener('seeked', onSeeked, { once: true });
            cap.addEventListener('error', onErr, { once: true });
            try { cap.currentTime = timeSec; } catch { resolve(); }
          });
          const bmp: ImageBitmap = await (window as any).createImageBitmap(cap);
          return bmp;
        } catch { return null; }
      },
      chunkFeeder: async (push) => {
        try { await demuxWithMediaSource(video.currentSrc || video.src, push); } catch {}
      }
    });
    pipeline.start();
    pipelineRef.current = pipeline;

    // If Offscreen worker-draw path is supported and preferred, we can still run it as fallback
    let renderer: WorkerFrameRenderer | null = null;
    if (WorkerFrameRenderer.isSupported()) {
      try {
        renderer = new WorkerFrameRenderer(video, {
          width: w,
          height: h,
          maxInFlightFrames: FRAME_BUFFER_CONFIG.MAX_IN_FLIGHT_FRAMES,
          onFrame: () => { try { if (texture) (texture as any).needsUpdate = true; } catch {} }
        });
        // Do not start by default; reserve as fallback if pipeline fails
      } catch {}
    }
    rendererRef.current = renderer;

    // Event-driven flushing on seek/rate changes
    const onSeeking = () => { try { pipeline.flush(); } catch {} };
    const onRate = () => { try { pipeline.flush(); } catch {} };
    try { video.addEventListener('seeking', onSeeking); } catch {}
    try { video.addEventListener('ratechange', onRate); } catch {}

    return () => {
      try { pipeline.stop(); } catch {}
      pipelineRef.current = null;
      try { (texture as any)?.dispose?.(); } catch {}
      setTexture(null);
      try { drawerRef.current?.stop?.(); } catch {}
      drawerRef.current = null;
      try { renderer?.stop?.(); } catch {}
      rendererRef.current = null;
      try { video.removeEventListener('seeking', onSeeking); } catch {}
      try { video.removeEventListener('ratechange', onRate); } catch {}
      captureVideoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  if (fallback) {
    return (
      <VideoTexture video={video} opacity={opacity} blendMode={blendMode} />
    );
  }

  if (!texture) {
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0} />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial 
        map={texture} 
        transparent 
        opacity={opacity}
        blending={getBlendMode(blendMode)}
      />
    </mesh>
  );
};

// Video texture component for R3F with persistence during transitions
const VideoTexture: React.FC<{ 
  video: HTMLVideoElement; 
  opacity: number; 
  blendMode: string;
}> = ({ video, opacity, blendMode }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  const [previousTexture, setPreviousTexture] = useState<THREE.VideoTexture | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const frameReadyRef = useRef<boolean>(false);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      // Ensure correct color space to avoid washed-out appearance
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

  // Prefer requestVideoFrameCallback to invalidate texture only when a decoded frame is ready
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

  // Fallback: mark texture as updated on the next frame when RVFC signaled
  useFrame(() => {
    if (texture && frameReadyRef.current) {
      texture.needsUpdate = true;
      frameReadyRef.current = false;
    }
    
    // Also update previous texture during transition to keep it smooth
    if (isTransitioning && previousTexture) {
      previousTexture.needsUpdate = true;
    }
  });

  // During transition, use previous texture if available, otherwise use current texture
  const activeTexture = isTransitioning && previousTexture ? previousTexture : texture;
  
  if (!activeTexture) {
    // Render a transparent placeholder instead of null to prevent black flash
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0} />
      </mesh>
    );
  }

  // Effects are now handled separately as layers, not directly in VideoTexture
  // This component just renders the base video

  // Default video rendering without effects
  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial 
        map={activeTexture} 
        transparent 
        opacity={opacity}
        blending={getBlendMode(blendMode)}
      />
    </mesh>
  );
};

// Image texture component for R3F
const ImageTexture: React.FC<{ 
  image: HTMLImageElement; 
  opacity: number; 
  blendMode: string;
}> = ({ image, opacity, blendMode }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (image) {
      const imageTexture = new THREE.Texture(image);
      imageTexture.minFilter = THREE.LinearFilter;
      imageTexture.magFilter = THREE.LinearFilter;
      setTexture(imageTexture);
    }
  }, [image]);

  if (!texture) {
    // Render a transparent placeholder instead of null to prevent black flash
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0} />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial 
        map={texture} 
        transparent 
        opacity={opacity}
        blending={getBlendMode(blendMode)}
      />
    </mesh>
  );
};

// Effect component for R3F
const EffectLayer = React.memo<{ 
  asset: any;
  layer: any; 
}>(({ asset, layer }) => {
  const effectId = asset.asset.id;
  console.log('🎨 EffectLayer: Rendering effect:', effectId, 'with params:', layer.params);
  
  const EffectComponent = useEffectComponent(effectId);

  if (!EffectComponent) {
    console.warn('❌ EffectLayer: Effect component not found for:', effectId);
    return null;
  }

  // Check if this effect needs a video texture and if we have one available
  let videoTexture = null;
  if (layer.params && layer.params.videoTexture) {
    videoTexture = layer.params.videoTexture;
    console.log('✅ EffectLayer: Video texture available for effect:', effectId);
  } else {
    console.log('⚠️ EffectLayer: No video texture for effect:', effectId);
  }

  // Memoize flattened params to prevent object recreation on every render
  const flatParams = useMemo(() => {
    const src = layer.params || {};
    const out: Record<string, any> = {};
    Object.keys(src).forEach((k) => {
      const v: any = (src as any)[k];
      out[k] = v && typeof v === 'object' && 'value' in v ? v.value : v;
    });
    return out;
  }, [layer.params]);

  return (
    <EffectComponent 
      {...flatParams}
      videoTexture={videoTexture}
      opacity={layer.opacity}
      blendMode={layer.blendMode}
    />
  );
});

// Main scene component for R3F
const CanvasScene: React.FC<{
  assets: Array<{
    type: 'image' | 'video' | 'effect';
    asset: any;
    layer: any;
  }>;
  isPlaying: boolean;
  backgroundColor: string;
}> = ({ assets, isPlaying, backgroundColor }) => {
  const { camera } = useThree();
  const [loadedAssets, setLoadedAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });
  
  // Cache video textures to avoid recreating them on every render (prevents flashes)
  const videoTextureCacheRef = useRef<Map<HTMLVideoElement, THREE.VideoTexture>>(new Map());
  
  // Memoize stable params to prevent object recreation on every render
  const stableParamsCacheRef = useRef<Map<string, any>>(new Map());
  
  // Keep video textures updated
  useFrame((state) => {
    // Update all video textures to ensure they're current
    if (!isPlaying) return;
    loadedAssets.videos.forEach((video) => {
      if (video && video.readyState >= 2) {
        // Video is ready, ensure texture updates
        const videoTextures = assets
          .filter(a => a.type === 'effect')
          .map(effectAsset => {
            const effectLayer = effectAsset.layer;
            if (effectLayer && effectLayer.params && effectLayer.params.videoTexture) {
              return effectLayer.params.videoTexture;
            }
            return null;
          })
          .filter(Boolean);
        
        // Log texture updates every 60 frames
        if (state.clock.elapsedTime % 1 < 0.016) {
          console.log('🎬 Updating video textures:', {
            count: videoTextures.length,
            time: state.clock.elapsedTime,
            readyState: video.readyState
          });
        }
        
        videoTextures.forEach(texture => {
          if (texture && texture.needsUpdate !== undefined) {
            texture.needsUpdate = true;
          }
        });
      }
    });
  });

  // Load assets
  // Derive a stable signature for media assets only (images/videos), so changing
  // effect parameters does not cause video elements to reload (and restart)
  const mediaAssetsKey = useMemo(() => {
    try {
      const parts = assets
        .filter(a => a.type === 'image' || a.type === 'video')
        .map(a => {
          const asset = (a as any).asset || {};
          const id = asset.id ?? '';
          const path = asset.path ?? '';
          const filePath = asset.filePath ?? '';
          return `${a.type}:${id}:${path}:${filePath}`;
        });
      return parts.join('|');
    } catch {
      return '';
    }
  }, [assets]);

  useEffect(() => {
    const loadAssets = async () => {
      const newImages = new Map<string, HTMLImageElement>();
      const newVideos = new Map<string, HTMLVideoElement>();

      for (const assetData of assets.filter(a => a.type === 'image' || a.type === 'video')) {
        const { asset } = assetData;
        
        if (assetData.type === 'image') {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = getAssetPath(asset);
            });
            newImages.set(asset.id, img);
            console.log(`✅ Image loaded:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load image:`, error);
          }
        } else if (assetData.type === 'video') {
          try {
            const video = document.createElement('video');
            video.src = getAssetPath(asset, true); // Use file path for video playback
            video.muted = true;
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.backgroundColor = backgroundColor || '#000000';
            
            await new Promise((resolve, reject) => {
              video.addEventListener('loadeddata', resolve);
              video.addEventListener('error', reject);
              video.load();
            });
            
            newVideos.set(asset.id, video);
            console.log(`✅ Video loaded:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load video:`, error);
          }
        }
      }

      setLoadedAssets({ images: newImages, videos: newVideos });
    };

    loadAssets();
  }, [mediaAssetsKey]);

  // Prune cached textures when videos change
  useEffect(() => {
    const cache = videoTextureCacheRef.current;
    const activeVideos = new Set(Array.from(loadedAssets.videos.values()));
    Array.from(cache.keys()).forEach((videoEl) => {
      if (!activeVideos.has(videoEl)) {
        const tex = cache.get(videoEl);
        if (tex) {
          tex.dispose?.();
        }
        cache.delete(videoEl);
      }
    });
  }, [loadedAssets.videos]);

  // Handle play/pause
  useEffect(() => {
    loadedAssets.videos.forEach(video => {
      if (isPlaying) {
        try { const p = video.play(); if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {}); } catch {}
      } else {
        try { video.pause(); } catch {}
      }
    });
  }, [isPlaying, loadedAssets.videos]);

  // Set up camera
  useEffect(() => {
    camera.position.z = 2;
  }, [camera]);

  return (
    <>
      {/* Background */}
      <color attach="background" args={[backgroundColor || '#000000']} />
      
      {/* Render assets */}
      {assets.map((assetData) => {
        const { type, asset, layer } = assetData;
        const key = asset.id;

        if (type === 'image') {
          const img = loadedAssets.images.get(asset.id);
          if (img) {
            return (
              <ImageTexture
                key={key}
                image={img}
                opacity={layer.opacity || 1}
                blendMode={layer.blendMode || 'add'}
              />
            );
          }
        } else if (type === 'video') {
          const video = loadedAssets.videos.get(asset.id);
          if (video) {
            return (
              (WorkerFrameRenderer.isSupported() ? (
                <WorkerVideoTexture
                  key={key}
                  video={video}
                  opacity={layer.opacity || 1}
                  blendMode={layer.blendMode || 'add'}
                />
              ) : (
                <VideoTexture
                  key={key}
                  video={video}
                  opacity={layer.opacity || 1}
                  blendMode={layer.blendMode || 'add'}
                />
              ))
            );
          }
        } else if (type === 'effect') {
            // For effect layers, check if they need video textures
  let videoTexture = null;
  
  // Look for video layers that this effect might be targeting
  const videoAssets = assets.filter(a => a.type === 'video');
  if (videoAssets.length > 0) {
    // For now, use the first available video texture
    const firstVideo = loadedAssets.videos.get(videoAssets[0].asset.id);
    if (firstVideo) {
      // Reuse a cached THREE.VideoTexture for this HTMLVideoElement
      const cache = videoTextureCacheRef.current;
      let vt = cache.get(firstVideo) || null;
      if (!vt) {
        console.log('📹 Creating new VideoTexture for:', videoAssets[0].asset.id);
        vt = new THREE.VideoTexture(firstVideo);
        vt.minFilter = THREE.LinearFilter;
        vt.magFilter = THREE.LinearFilter;
        vt.format = THREE.RGBAFormat;
        vt.generateMipmaps = false;
        cache.set(firstVideo, vt);
      } else {
        console.log('♻️ Reusing cached VideoTexture:', vt.uuid);
      }
      videoTexture = vt;
    }
  }
          
                    console.log('🎨 EffectLayer: Creating effect with video texture:', !!videoTexture);
          
          // Create stable params to prevent object recreation on every render
          const effectKey = `${assetData.asset.id}-${videoTexture?.uuid || 'no-video'}`;
          let stableParams = stableParamsCacheRef.current.get(effectKey);
          if (!stableParams || stableParams.videoTexture !== videoTexture) {
            stableParams = {
              ...layer.params,
              videoTexture: videoTexture
            };
            stableParamsCacheRef.current.set(effectKey, stableParams);
          }
          
          return (
            <EffectLayer
              key={key}
              asset={assetData}
              layer={{
                ...layer,
                params: stableParams
              }}
            />
          );
        }

        return null;
      })}
    </>
  );
};

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

export const CanvasRenderer: React.FC<CanvasRendererProps> = ({
  assets,
  width,
  height,
  bpm = 120,
  isPlaying = false
}) => {
  console.log('🎬 CanvasRenderer props:', { assets, width, height, bpm, isPlaying });
  console.log('🎬 Assets count:', assets.length);
  assets.forEach((asset, index) => {
    console.log(`🎬 Asset ${index}:`, asset);
  });
  
  const { compositionSettings } = useStore() as any;
  const backgroundColor = compositionSettings?.backgroundColor || '#000000';

  // Ensure we have valid dimensions
  const canvasWidth = Math.max(width, 640);
  const canvasHeight = Math.max(height, 480);
  
  console.log('🎬 Canvas dimensions - input:', { width, height }, 'calculated:', { canvasWidth, canvasHeight });

    return (
    <div className="canvas-renderer">
      <div className="renderer-header-info">
        <h4>Canvas Renderer (React Three Fiber)</h4>
        <span className="renderer-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
      </div>
      <div className="renderer-main-content">
        <div className="tw-w-full tw-h-full" style={{ backgroundColor }}>
          <Canvas
            camera={{ position: [0, 0, 2], fov: 75 }}
            className="tw-w-full tw-h-full"
            dpr={[1, Math.min(1.5, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1)]}
            gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance', antialias: false }}
            onCreated={({ gl }) => {
              gl.autoClear = false; // Do not auto-clear between frames
              gl.setClearColor('#000000', 1); // Solid background once
              // Renderer color management to prevent washed-out colors
              try {
                if ((gl as any).outputColorSpace !== undefined && (THREE as any).SRGBColorSpace) {
                  (gl as any).outputColorSpace = (THREE as any).SRGBColorSpace;
                } else if ((gl as any).outputEncoding !== undefined && (THREE as any).sRGBEncoding) {
                  (gl as any).outputEncoding = (THREE as any).sRGBEncoding;
                }
                (gl as any).toneMapping = (THREE as any).NoToneMapping;
              } catch {}
            }}
          >
            <CanvasScene 
              assets={assets} 
              isPlaying={isPlaying} 
              backgroundColor={backgroundColor}
            />
          </Canvas>
        </div>
      </div>
      </div>
  );
}; 