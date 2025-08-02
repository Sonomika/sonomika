import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';

        // Lazy load effects
        const KaleidoscopeEffect = React.lazy(() => import('../effects/KaleidoscopeEffect'));
        const ParticleEffect = React.lazy(() => import('../effects/ParticleEffect'));
        const CirclePulseEffect = React.lazy(() => import('../effects/CirclePulseEffect'));
        const SquarePulseEffect = React.lazy(() => import('../effects/SquarePulseEffect'));
        const WaveEffect = React.lazy(() => import('../effects/WaveEffect'));
        const GeometricPatternEffect = React.lazy(() => import('../effects/GeometricPatternEffect'));
        const AudioReactiveEffect = React.lazy(() => import('../effects/AudioReactiveEffect'));
        const ColorPulseEffect = React.lazy(() => import('../effects/ColorPulseEffect'));
        const BPMParticleEffect = React.lazy(() => import('../effects/BPMParticleEffect'));
        
        // Lazy load global effects
        const GlobalStrobeEffect = React.lazy(() => import('../effects/GlobalStrobeEffect.tsx'));
        const GlobalDatamoshEffect = React.lazy(() => import('../effects/GlobalDatamoshEffect.tsx'));
        const GlobalVideoWaveSliceEffect = React.lazy(() => import('../effects/GlobalVideoWaveSliceEffect.tsx'));

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
  const [aspectRatio, setAspectRatio] = useState(16/9); // Default 16:9

  useEffect(() => {
    if (video) {
      console.log('Creating video texture for:', video.src);
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.generateMipmaps = false;
      setTexture(videoTexture);
      
      // Calculate aspect ratio when video metadata is loaded
      const updateAspectRatio = () => {
        if (video.videoWidth && video.videoHeight) {
          const ratio = video.videoWidth / video.videoHeight;
          console.log('Video aspect ratio:', ratio, 'Dimensions:', video.videoWidth, 'x', video.videoHeight);
          console.log('Setting plane geometry to:', [ratio * 2, 2]);
          setAspectRatio(ratio);
        }
      };
      
      video.addEventListener('loadedmetadata', updateAspectRatio);
      if (video.readyState >= 1) {
        updateAspectRatio();
      }
      
      return () => {
        video.removeEventListener('loadedmetadata', updateAspectRatio);
      };
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

  // Check if kaleidoscope effect is applied
  const hasKaleidoscopeEffect = effects?.some((effect: any) => 
    effect.id === 'kaleidoscope' || effect.name === 'Kaleidoscope Effect'
  );

  if (hasKaleidoscopeEffect) {
    // Import and render KaleidoscopeEffect
    return (
      <Suspense fallback={
        <mesh>
          <planeGeometry args={[aspectRatio * 2, 2]} />
          <meshBasicMaterial color={0xff0000} />
        </mesh>
      }>
        <KaleidoscopeEffect videoTexture={texture} />
      </Suspense>
    );
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[aspectRatio * 2, 2]} />
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
  bpm: number;
  globalEffects?: any[];
}> = ({ column, isPlaying, frameCount, bpm, globalEffects = [] }) => {
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

  console.log('ColumnScene rendering with:', { column, isPlaying, frameCount, assetsCount: assets.images.size + assets.videos.size });

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
          layer.asset && (layer.asset.type === 'p5js' || layer.asset.type === 'effect' || layer.asset.type === 'threejs')
        );

        console.log('Video layers:', videoLayers.map(l => l.name));
        console.log('Effect layers:', effectLayers.map(l => l.name));
        console.log('All layers:', sortedLayers.map(l => ({ name: l.name, asset: l.asset?.name, type: l.asset?.type })));

        const renderedElements: React.ReactElement[] = [];

        // First, render video layers
        videoLayers.forEach((videoLayer, index) => {
          const video = assets.videos.get(videoLayer.asset.id);
          if (!video) return;

          const key = `video-${videoLayer.id}-${index}`;

          // Check if there's a kaleidoscope effect layer that should be applied to this video
          const kaleidoscopeEffectLayer = effectLayers.find(effectLayer => {
            const effectAsset = effectLayer.asset;
            return effectAsset && (
              effectAsset.id === 'kaleidoscope' || 
              effectAsset.name === 'Kaleidoscope Effect' ||
              effectAsset.name === 'Kaleidoscope'
            );
          });

          console.log('Video layer:', videoLayer.name, 'has kaleidoscope effect:', !!kaleidoscopeEffectLayer);

          if (kaleidoscopeEffectLayer) {
            // Apply kaleidoscope effect to the video
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0xff0000} />
                </mesh>
              }>
                <KaleidoscopeEffect videoTexture={new THREE.VideoTexture(video)} />
              </Suspense>
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
              />
            );
          }
        });

        // Then, render standalone effects
        effectLayers.forEach((effectLayer, index) => {
          const effectAsset = effectLayer.asset;
          if (!effectAsset) return;

          const key = `effect-${effectLayer.id}-${index}`;

          // Check for particle effect
          console.log('Checking effect:', effectAsset.id, effectAsset.name);
          if (effectAsset.id === 'particle-effect' || effectAsset.name === 'Particle Effect') {
            console.log('Rendering standalone particle effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <ParticleEffect count={1500} speed={0.8} size={0.03} spread={10} />
              </Suspense>
            );
          }
          // Also check for R3F Particle System
          if (effectAsset.id === 'r3f-particle-system' || effectAsset.name === 'R3F Particle System') {
            console.log('Rendering R3F particle system');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <ParticleEffect count={1500} speed={0.8} size={0.03} spread={10} />
              </Suspense>
            );
          }
          // Check for BPM Particle Effect
          if (effectAsset.id === 'bpm-particle-effect' || effectAsset.name === 'BPM Particle Effect') {
            console.log('Rendering BPM Particle Effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ffff} />
                </mesh>
              }>
                <BPMParticleEffect 
                  count={1000}
                  speed={0.5}
                  size={0.02}
                  color="#ffffff"
                  spread={10}
                  pulseIntensity={0.5}
                />
              </Suspense>
            );
          }
          // Check for Circle Pulse Effect
          if (effectAsset.id === 'circle-pulse-effect' || effectAsset.name === 'Circle Pulse Effect') {
            console.log('Rendering Circle Pulse Effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <CirclePulseEffect size={0.8} speed={1.0} color="blue" bpm={bpm} />
              </Suspense>
            );
          }
          // Check for Square Pulse Effect
          if (effectAsset.id === 'square-pulse-effect' || effectAsset.name === 'Square Pulse Effect') {
            console.log('Rendering Square Pulse Effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <SquarePulseEffect size={0.8} speed={1.0} color="red" bpm={bpm} />
              </Suspense>
            );
          }
          // Check for Wave Effect
          if (effectAsset.id === 'wave-effect' || effectAsset.name === 'Wave Effect') {
            console.log('Rendering Wave Effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <WaveEffect amplitude={0.5} frequency={2.0} speed={1.0} color="cyan" bpm={bpm} />
              </Suspense>
            );
          }
          // Check for Geometric Pattern Effect
          if (effectAsset.id === 'geometric-pattern-effect' || effectAsset.name === 'Geometric Pattern Effect') {
            console.log('Rendering Geometric Pattern Effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <GeometricPatternEffect pattern="spiral" speed={1.0} color="magenta" bpm={bpm} complexity={5} />
              </Suspense>
            );
          }
          // Check for Audio Reactive Effect
          if (effectAsset.id === 'audio-reactive-effect' || effectAsset.name === 'Audio Reactive Effect') {
            console.log('Rendering Audio Reactive Effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <AudioReactiveEffect sensitivity={0.5} frequency={440} color="orange" bpm={bpm} mode="bars" />
              </Suspense>
            );
          }
          // Check for Color Pulse Effect
          if (effectAsset.id === 'color-pulse-effect' || effectAsset.name === 'Color Pulse Effect') {
            console.log('Rendering Color Pulse Effect');
            renderedElements.push(
              <Suspense key={key} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0x00ff00} />
                </mesh>
              }>
                <ColorPulseEffect intensity={0.5} colorSpeed={0.1} autoColor={true} bpm={bpm} mode="gradient" />
              </Suspense>
            );
          }
          // Add other standalone effects here as needed
        });

        // Apply global effects as post-processing layer
        const activeGlobalEffect = globalEffects.find((effect: any) => effect.enabled);
        
        if (activeGlobalEffect) {
          console.log('🌐 Applying global effect:', activeGlobalEffect.effectId);
          
          // Create a post-processing effect that affects all layers
          const globalEffectKey = `global-effect-${activeGlobalEffect.id}`;
          
          // Check for specific global effects
          if (activeGlobalEffect.effectId === 'global-strobe' || activeGlobalEffect.effectId === 'Global Strobe') {
            console.log('🌐 Rendering Global Strobe Effect');
            renderedElements.push(
              <Suspense key={globalEffectKey} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0xffffff} />
                </mesh>
              }>
                <GlobalStrobeEffect bpm={bpm} />
              </Suspense>
            );
          } else if (activeGlobalEffect.effectId === 'global-datamosh' || activeGlobalEffect.effectId === 'Global Datamosh') {
            console.log('🌐 Rendering Global Datamosh Effect');
            renderedElements.push(
              <Suspense key={globalEffectKey} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0xffffff} />
                </mesh>
              }>
                <GlobalDatamoshEffect bpm={bpm} />
              </Suspense>
            );
          } else if (activeGlobalEffect.effectId === 'video-wave-slice' || activeGlobalEffect.effectId === 'Video Wave Slice') {
            console.log('🌐 Rendering Global Video Wave Slice Effect');
            renderedElements.push(
              <Suspense key={globalEffectKey} fallback={
                <mesh>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial color={0xffffff} />
                </mesh>
              }>
                <GlobalVideoWaveSliceEffect bpm={bpm} />
              </Suspense>
            );
          } else {
            // Generic global effect fallback
            console.log('🌐 Rendering generic global effect:', activeGlobalEffect.effectId);
            renderedElements.push(
              <mesh key={globalEffectKey}>
                <planeGeometry args={[2, 2]} />
                <meshBasicMaterial 
                  color={0xffffff} 
                  transparent 
                  opacity={0.1}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            );
          }
        }

        return renderedElements;
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
              style={{ width: '100%', height: '100%' }}
              gl={{ 
                preserveDrawingBuffer: true,
                antialias: true,
                powerPreference: 'high-performance'
              }}
              onCreated={({ gl }) => {
                console.log('R3F Canvas created successfully');
                gl.setClearColor(0x000000, 1);
                
                // Set canvas to render at full composition resolution
                const compositionSettings = useStore.getState().compositionSettings;
                const targetWidth = compositionSettings.width || 1920;
                const targetHeight = compositionSettings.height || 1080;
                
                // Update the renderer size to composition resolution
                gl.setSize(targetWidth, targetHeight, false);
                
                console.log(`Canvas set to composition resolution: ${targetWidth}x${targetHeight}`);
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
              />
            </Canvas>
          </div>
        </div>
      </div>
    </div>
  );
}); 