import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import EffectLoader from './EffectLoader';
import { useEffectComponent } from '../utils/EffectLoader';

interface ColumnPreviewProps {
  column: any;
  width: number;
  height: number;
  isPlaying: boolean;
  bpm: number;
  globalEffects?: any[];
}

// Video texture component for R3F
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

// Image texture component for R3F
const ImageTexture: React.FC<{ 
  image: HTMLImageElement; 
  opacity: number; 
  blendMode: string;
  effects?: any;
}> = ({ image, opacity, blendMode, effects }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [aspectRatio, setAspectRatio] = useState(16/9); // Default 16:9

  useEffect(() => {
    if (image) {
      const imageTexture = new THREE.Texture(image);
      imageTexture.minFilter = THREE.LinearFilter;
      imageTexture.magFilter = THREE.LinearFilter;
      setTexture(imageTexture);
      
      // Calculate aspect ratio
      if (image.naturalWidth && image.naturalHeight) {
        const ratio = image.naturalWidth / image.naturalHeight;
        console.log('Image aspect ratio:', ratio, 'Dimensions:', image.naturalWidth, 'x', image.naturalHeight);
        setAspectRatio(ratio);
      }
    }
  }, [image]);

  if (!texture) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
      <meshBasicMaterial 
        map={texture} 
        transparent 
        opacity={opacity}
        blending={getBlendMode(blendMode)}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// Effect component for R3F


const EffectLayer: React.FC<{ 
  layer: any; 
  frameCount: number;
}> = ({ layer, frameCount }) => {
  const effectId = layer.asset?.id || layer.asset?.name;
  
  console.log('🔍 EffectLayer - layer asset:', layer.asset);
  console.log('🔍 EffectLayer - effectId:', effectId);
  console.log('🔍 EffectLayer - layer params:', layer.params);
  
  const EffectComponent = useEffectComponent(effectId);

  if (!EffectComponent) {
    console.warn(`No effect component found for ID: ${effectId}`);
    return null;
  }

  console.log('✅ EffectLayer - EffectComponent found, rendering with props:', {
    ...layer.params,
    opacity: layer.opacity,
    blendMode: layer.blendMode
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
    />
  );
};

// Main scene component for R3F
const ColumnScene: React.FC<{
  column: any;
  isPlaying: boolean;
  frameCount: number;
  bpm: number;
  globalEffects?: any[];
  compositionWidth?: number;
  compositionHeight?: number;
}> = ({ column, isPlaying, frameCount, bpm, globalEffects = [], compositionWidth, compositionHeight }) => {
  const { camera } = useThree();
  const [assets, setAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });
  
  // Use ref to track loaded assets to prevent infinite loops
  const loadedAssetsRef = useRef<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });

  // Performance optimization: removed excessive logging

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
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = asset.path;
            });
            newImages.set(asset.id, img);
            console.log(`✅ Image loaded for layer ${layer.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load image for layer ${layer.name}:`, error);
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
            console.log(`✅ Video loaded for layer ${layer.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load video for layer ${layer.name}:`, error);
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
        frameCount={frameCount}
      />
    );
  };

  return (
    <>
      {/* Background */}
      <color attach="background" args={[0, 0, 0]} />
      

      
      {/* Render all layers */}
      {(() => {
        // Find all video layers and effect layers
        const videoLayers = sortedLayers.filter(layer => 
          layer.asset && layer.asset.type === 'video'
        );
        const effectLayers = sortedLayers.filter(layer => 
          layer.asset && (
            layer.asset.type === 'p5js' || 
            layer.asset.type === 'effect' || 
            layer.asset.type === 'threejs' ||
            layer.asset.isEffect
          )
        );

        console.log('Layers - Video:', videoLayers.map(l => l.name), 'Effects:', effectLayers.map(l => l.name));

        const renderedElements: React.ReactElement[] = [];

        // First, render video layers
        // Create video textures map outside the loop to avoid hooks in loops
        const videoTextures = useMemo(() => {
          const textures = new Map();
          videoLayers.forEach((videoLayer) => {
            const video = assets.videos.get(videoLayer.asset.id);
            if (video) {
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

        videoLayers.forEach((videoLayer, index) => {
          const video = assets.videos.get(videoLayer.asset.id);
          if (!video) return;

          const key = `video-${videoLayer.id}-${index}`;

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
            
            // Calculate proper aspect ratio for video (memoized)
            const videoAspectRatio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16/9;
            const compositionAspectRatio = compositionWidth && compositionHeight ? compositionWidth / compositionHeight : 16/9;
            
            // Scale video to fit composition while maintaining aspect ratio
            const scaleX = Math.max(compositionAspectRatio / videoAspectRatio, 1);
            const scaleY = Math.max(videoAspectRatio / compositionAspectRatio, 1);
            const finalScaleX = compositionAspectRatio * 2 * scaleX;
            const finalScaleY = 2 * scaleY;
            
            // Get video texture from the map
            const videoTexture = videoTextures.get(videoLayer.asset.id);
            
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

            // Render both the base video and the effect on top
            renderedElements.push(
              <React.Fragment key={`${key}-container`}>
                {/* Render the base video first */}
                <mesh key={`${key}-video`}>
                  <planeGeometry args={[finalScaleX, finalScaleY]} />
                  <meshBasicMaterial 
                    map={videoTexture}
                    transparent
                    opacity={videoLayer.opacity || 1}
                    blending={getBlendMode(videoLayer.blendMode || 'add')}
                  />
                </mesh>
                
                {/* Render the effect on top */}
                <EffectLayer 
                  key={effectKey}
                  layer={mockEffectLayer}
                  frameCount={frameCount}
                />
              </React.Fragment>
            );
          } else {
            // Render normal video
            renderedElements.push(
              <VideoTexture
                key={key}
                video={video}
                opacity={videoLayer.opacity || 1}
                blendMode={videoLayer.blendMode || 'add'}
                effects={videoLayer.effects}
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

export const ColumnPreview: React.FC<ColumnPreviewProps> = React.memo(({ 
  column, 
  width, 
  height, 
  isPlaying, 
  bpm,
  globalEffects = []
}) => {
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Animation frame counter
  useEffect(() => {
    if (!isPlaying) return;

    let animationId: number;
    const animate = () => {
      setFrameCount(prev => prev + 1);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isPlaying]);

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
          backgroundColor: '#000000', 
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.1s ease-in-out'
        }}>
          {/* Full width container */}
          <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#000000',
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
                preserveDrawingBuffer: true,
                antialias: true,
                powerPreference: 'high-performance'
              }}
              onCreated={({ gl, camera }) => {
                gl.setClearColor(0x000000, 0); // transparent black
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
                    gl.domElement.width = containerWidth;
                    gl.domElement.height = containerHeight;
                    
                    // Update container height to match aspect ratio
                    container.style.height = `${containerHeight}px`;
                  } catch (error) {
                    console.error('Error in canvas setup:', error);
                  }
                }
                
                // Add resize observer to maintain aspect ratio
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
                      gl.domElement.width = containerWidth;
                      gl.domElement.height = containerHeight;
                      
                      container.style.height = `${containerHeight}px`;
                    } catch (error) {
                      console.error('Error in resize observer:', error);
                    }
                  }
                });
                
                if (container) {
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
          frameCount={frameCount} 
          bpm={bpm}
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