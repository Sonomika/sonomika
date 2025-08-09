import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectComponent } from '../utils/EffectLoader';

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

// Video texture component for R3F
const VideoTexture: React.FC<{ 
  video: HTMLVideoElement; 
  opacity: number; 
  blendMode: string;
  effects?: any;
}> = ({ video, opacity, blendMode, effects }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);

  useEffect(() => {
    if (video) {
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
      setTexture(videoTexture);
    }
  }, [video]);

  useFrame(() => {
    if (texture) {
      texture.needsUpdate = true;
    }
  });

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

// Image texture component for R3F
const ImageTexture: React.FC<{ 
  image: HTMLImageElement; 
  opacity: number; 
  blendMode: string;
  effects?: any;
}> = ({ image, opacity, blendMode, effects }) => {
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
const EffectLayer: React.FC<{ 
  asset: any;
  layer: any; 
  frameCount: number;
}> = ({ asset, layer, frameCount }) => {
  const effectId = asset.asset.id;
  const EffectComponent = useEffectComponent(effectId);

  if (!EffectComponent) {
    // No effect found - return null instead of hardcoded fallback
    return null;
  }

  return (
    <EffectComponent 
      {...layer.params}
      opacity={layer.opacity}
      blendMode={layer.blendMode}
    />
  );
};

// Main scene component for R3F
const CanvasScene: React.FC<{
  assets: Array<{
    type: 'image' | 'video' | 'effect';
    asset: any;
    layer: any;
  }>;
  isPlaying: boolean;
  frameCount: number;
}> = ({ assets, isPlaying, frameCount }) => {
  const { camera } = useThree();
  const [loadedAssets, setLoadedAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });

  // Load assets
  useEffect(() => {
    const loadAssets = async () => {
      const newImages = new Map<string, HTMLImageElement>();
      const newVideos = new Map<string, HTMLVideoElement>();

      for (const assetData of assets) {
        const { asset, layer } = assetData;
        
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
            video.src = getAssetPath(asset);
            video.muted = true;
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.backgroundColor = '#000000';
            
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
  }, [assets]);

  // Handle play/pause
  useEffect(() => {
    loadedAssets.videos.forEach(video => {
      if (isPlaying) {
        video.play().catch(console.warn);
      } else {
        video.pause();
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
      <color attach="background" args={[0, 0, 0]} />
      
      {/* Render assets */}
      {assets.map((assetData, index) => {
        const { type, asset, layer } = assetData;
        const key = `${asset.id}-${index}`;

        if (type === 'image') {
          const img = loadedAssets.images.get(asset.id);
          if (img) {
            return (
              <ImageTexture
                key={key}
                image={img}
                opacity={layer.opacity || 1}
                blendMode={layer.blendMode || 'add'}
                effects={layer.effects}
              />
            );
          }
        } else if (type === 'video') {
          const video = loadedAssets.videos.get(asset.id);
          if (video) {
            return (
              <VideoTexture
                key={key}
                video={video}
                opacity={layer.opacity || 1}
                blendMode={layer.blendMode || 'add'}
                effects={layer.effects}
              />
            );
          }
        } else if (type === 'effect') {
          return (
            <EffectLayer
              key={key}
              asset={assetData}
              layer={layer}
              frameCount={frameCount}
            />
          );
        }

        return null;
      })}
    </>
  );
};

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
  
  const [frameCount, setFrameCount] = useState(0);

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
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000000' }}>
          <Canvas
            camera={{ position: [0, 0, 2], fov: 75 }}
            style={{ width: '100%', height: '100%' }}
          >
            <CanvasScene 
              assets={assets} 
              isPlaying={isPlaying} 
              frameCount={frameCount}
            />
          </Canvas>
        </div>
      </div>
      </div>
  );
}; 