import React, { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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
    return null;
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
  bpm?: number;
  globalEffects?: any[];
  compositionWidth?: number;
  compositionHeight?: number;
}> = ({ activeClips, isPlaying, currentTime, bpm = 120, globalEffects = [], compositionWidth, compositionHeight }) => {
  const { camera } = useThree();
  const [assets, setAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });
  
  const loadedAssetsRef = useRef<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });

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
            const video = document.createElement('video');
            const assetPath = getAssetPath(asset);
            console.log('Loading video with path:', assetPath, 'for asset:', asset.name);
            video.src = assetPath;
            video.muted = true;
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.backgroundColor = 'transparent';
            
            await new Promise<void>((resolve, reject) => {
              video.addEventListener('loadeddata', () => {
                console.log('Video loaded successfully:', asset.name);
                resolve();
              });
              video.addEventListener('error', reject);
              video.load();
            });
            
            newVideos.set(asset.id, video);
            console.log(`✅ Video loaded for clip ${clip.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load video for clip ${clip.name}:`, error);
          }
        }
      }

      // Store in ref for future use
      loadedAssetsRef.current = { images: newImages, videos: newVideos };
      setAssets({ images: newImages, videos: newVideos });
    };

    loadAssets();
  }, [activeClips]);

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
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Helper function to get proper file path for Electron
  const getAssetPath = (asset: any) => {
    if (!asset) return '';
    console.log('getAssetPath called with asset:', asset);
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

  // Unified effect rendering system using dynamic loading
  const renderEffect = (effectId: string, effectName: string, params: any = {}, isGlobal: boolean = false) => {
    const effectKey = isGlobal ? `global-${effectId}` : `layer-${effectId}`;
    const effectParams = params || {};
    
    console.log(`🎨 Rendering ${isGlobal ? 'global' : 'layer'} effect:`, effectId, effectName, effectParams);
    
    // Use SimpleEffectLoader for all effects
    const effectNames = [effectId].filter(Boolean);

    
    return (
      <EffectLoader
        key={effectKey}
        fallback={
          <mesh>
            <planeGeometry args={[4, 4]} />
            <meshBasicMaterial color={0x888888} />
          </mesh>
        }
      />
    );
  };

  return (
    <>
      {/* Background */}
      <color attach="background" args={[0, 0, 0]} />
      
      {/* Render all layers using unified system */}
      {(() => {
        // Find all video layers and effect layers
        const videoLayers = activeClips.filter(clip => 
          clip.asset && clip.asset.type === 'video'
        );
        const effectLayers = activeClips.filter(clip => 
          clip.asset && (
            clip.asset.type === 'p5js' || 
            clip.asset.type === 'effect' || 
            clip.asset.type === 'threejs' ||
            clip.asset.isEffect
          )
        );

        console.log('Timeline video layers:', videoLayers.map(l => l.name));
        console.log('Timeline effect layers:', effectLayers.map(l => l.name));
        console.log('Timeline all clips:', activeClips.map(l => ({ name: l.name, asset: l.asset?.name, type: l.asset?.type })));

        const renderedElements: React.ReactElement[] = [];

        // First, render video layers
        videoLayers.forEach((videoClip, index) => {
          const video = assets.videos.get(videoClip.asset.id);
          if (!video) return;

          const key = `video-${videoClip.id}-${index}`;

          // Check if there are any effect layers that should be applied to this video
          const effectLayersForVideo = effectLayers.filter(effectLayer => {
            const effectAsset = effectLayer.asset;
            return effectAsset && effectAsset.type === 'effect';
          });

          if (effectLayersForVideo.length > 0) {
            // Apply the first effect to the video
            const firstEffect = effectLayersForVideo[0];
            const effectNames = [firstEffect.asset.id].filter(Boolean);

            
            renderedElements.push(
              <React.Fragment key={`${key}-container`}>
                <mesh key={`${key}-video`}>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial map={new THREE.VideoTexture(video)} />
                </mesh>
                <EffectLoader
                  key={`${key}-effects`}
                  fallback={
                    <mesh>
                      <planeGeometry args={[2, 2]} />
                      <meshBasicMaterial color={0xff0000} />
                    </mesh>
                  }
                />
              </React.Fragment>
            );
          } else {
            // Render normal video
            renderedElements.push(
              <VideoTexture
                key={key}
                video={video}
                opacity={videoClip.opacity || 1}
                blendMode={videoClip.blendMode || 'add'}
                effects={videoClip.effects}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
              />
            );
          }
        });

        // Then, render standalone effects using unified system
        effectLayers.forEach((effectLayer, index) => {
          const effectAsset = effectLayer.asset;
          if (!effectAsset) return;


          
          // Use unified effect renderer for all effects
          const renderedEffect = renderEffect(
            effectAsset.id, 
            effectAsset.name, 
            effectLayer.params, 
            false // isGlobal = false for layer effects
          );
          
          if (renderedEffect) {
            renderedElements.push(renderedEffect);
            console.log('🎨 Added timeline effect to rendered elements:', effectAsset.id);
          }
        });

        // Apply global effects using unified system
        const activeGlobalEffect = globalEffects.find((effect: any) => effect.enabled);
        
        if (activeGlobalEffect) {
          console.log('🌐 Applying timeline global effect:', activeGlobalEffect.effectId);
          
          // Use unified effect renderer for global effects
          const renderedGlobalEffect = renderEffect(
            activeGlobalEffect.effectId,
            activeGlobalEffect.effectId, // Use effectId as name for globals
            activeGlobalEffect.params,
            true // isGlobal = true for global effects
          );
          
          if (renderedGlobalEffect) {
            renderedElements.push(renderedGlobalEffect);
            console.log('🌐 Added timeline global effect to rendered elements:', activeGlobalEffect.effectId);
          }
        }

        return renderedElements.map((element, index) => 
          React.cloneElement(element, { key: `rendered-element-${index}` })
        );
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
  bpm = 120,
  globalEffects = []
}) => {
  return (
    <div className="timeline-composer" style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 1], fov: 90 }}
        style={{ 
          width: '100%', 
          height: '100%',
          display: 'block'
        }}
        gl={{ 
          preserveDrawingBuffer: true,
          antialias: true,
          powerPreference: 'high-performance'
        }}
        onCreated={({ gl, camera }) => {
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
            bpm={bpm}
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