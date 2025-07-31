import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

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
}> = ({ video, opacity, blendMode, effects }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);

  useEffect(() => {
    if (video) {
      console.log('Creating video texture for:', video.src);
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
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

  if (!texture) return null;

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
  layer: any; 
  frameCount: number;
}> = ({ layer, frameCount }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const time = frameCount / 60;

  // Simple animated effects for now
  useFrame(() => {
    if (meshRef.current) {
      const effectId = layer.asset.id || 'pulse';
      switch (effectId) {
        case 'pulse':
        case 'circle-pulse':
          const scale = 1 + Math.sin(time * 2) * 0.2;
          meshRef.current.scale.setScalar(scale);
          break;
        case 'rotation':
          meshRef.current.rotation.z = time * 2;
          break;
        case 'particles':
        case 'particle-system':
          // Simple pulsing for particle effect
          const pulse = Math.sin(time * 3) * 0.3 + 0.7;
          meshRef.current.scale.setScalar(pulse);
          break;
      }
    }
  });

  const geometry = useMemo(() => {
    const effectId = layer.asset.id || 'pulse';
    switch (effectId) {
      case 'square-pulse':
        return new THREE.BoxGeometry(1, 1, 1);
      case 'wave':
        return new THREE.SphereGeometry(0.5, 16, 16);
      case 'particles':
      case 'particle-system':
        return new THREE.SphereGeometry(0.3, 16, 16);
      default:
        return new THREE.SphereGeometry(0.5, 16, 16);
    }
  }, [layer.asset.id]);

  const material = useMemo(() => {
    const effectId = layer.asset.id || 'pulse';
    let color = new THREE.Color(0xff6666);
    
    switch (effectId) {
      case 'color-pulse':
        const hue = (time * 50) % 1;
        color.setHSL(hue, 1, 0.5);
        break;
      case 'square-pulse':
        color.setHex(0x66ff66);
        break;
      case 'wave':
        color.setHex(0x6666ff);
        break;
      case 'particles':
      case 'particle-system':
        color.setHex(0xffff00);
        break;
      case 'circle-pulse':
        color.setHex(0x0000ff);
        break;
    }

    return new THREE.MeshBasicMaterial({ 
      color, 
      transparent: true, 
      opacity: layer.opacity || 1,
      blending: getBlendMode(layer.blendMode || 'add')
    });
  }, [layer.asset.id, layer.opacity, layer.blendMode, time]);

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};

// Main scene component for R3F
const ColumnScene: React.FC<{
  column: any;
  isPlaying: boolean;
  frameCount: number;
}> = ({ column, isPlaying, frameCount }) => {
  const { camera } = useThree();
  const [assets, setAssets] = useState<{
    images: Map<string, HTMLImageElement>;
    videos: Map<string, HTMLVideoElement>;
  }>({ images: new Map(), videos: new Map() });

  console.log('ColumnScene rendering with:', { column, isPlaying, frameCount, assetsCount: assets.images.size + assets.videos.size });

  // Load assets
  useEffect(() => {
    const loadAssets = async () => {
      const newImages = new Map<string, HTMLImageElement>();
      const newVideos = new Map<string, HTMLVideoElement>();
        
        for (const layer of column.layers) {
          if (!layer.asset) continue;

          const asset = layer.asset;
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
            // Use proper asset path resolution
            const assetPath = getAssetPath(asset);
            console.log('Loading video with path:', assetPath, 'for asset:', asset.name);
            video.src = assetPath;
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
            console.log(`✅ Video loaded for layer ${layer.name}:`, asset.name);
          } catch (error) {
            console.error(`❌ Failed to load video for layer ${layer.name}:`, error);
          }
        }
      }

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
    camera.position.z = 2;
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

  return (
    <>
      {/* Background */}
      <color attach="background" args={[0, 0, 0]} />
      
      {/* Debug: Always show a test cube to confirm R3F is working */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={0x00ff00} />
      </mesh>
      
      {/* Render layers */}
      {sortedLayers.map((layer, index) => {
        if (!layer.asset) return null;

        const asset = layer.asset;
        const key = `${layer.id}-${index}`;

        console.log('Rendering layer:', layer.name, 'asset type:', asset.type);

        if (asset.type === 'image') {
          const img = assets.images.get(asset.id);
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
        } else if (asset.type === 'video') {
          const video = assets.videos.get(asset.id);
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
        } else if (asset.type === 'p5js' || asset.type === 'effect') {
          return (
            <EffectLayer
              key={key}
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

export const ColumnPreview: React.FC<ColumnPreviewProps> = ({ 
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
      <div className="preview-header-info">
        <h4>Column Preview (R3F)</h4>
        <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
      </div>
      <div className="preview-main-content">
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000000', position: 'relative' }}>
          {/* Fallback text to confirm component renders */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            zIndex: 1,
            pointerEvents: 'none'
          }}>
            R3F Loading...
          </div>
          
          <Canvas
            camera={{ position: [0, 0, 2], fov: 75 }}
            style={{ width: '100%', height: '100%' }}
            onCreated={({ gl }) => {
              console.log('R3F Canvas created successfully');
              gl.setClearColor(0x000000, 1);
            }}
            onError={(error) => {
              console.error('R3F Canvas error:', error);
              setError(`Canvas Error: ${error instanceof Error ? error.message : String(error)}`);
            }}
          >
            {/* Simple test mesh to confirm R3F works */}
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[0.5, 16, 16]} />
              <meshBasicMaterial color={0x00ff00} />
            </mesh>
            
            <ColumnScene 
              column={column} 
              isPlaying={isPlaying} 
              frameCount={frameCount}
            />
          </Canvas>
        </div>
      </div>
    </div>
  );
}; 