import React, { useEffect, useRef, useState } from 'react';

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
  
  // Helper function to get proper file path for Electron (same as LayerManager)
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const effectsRef = useRef<Map<string, any>>(new Map());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // Ensure we have valid dimensions
  const canvasWidth = Math.max(width, 640);
  const canvasHeight = Math.max(height, 480);
  
  console.log('🎬 Canvas dimensions - input:', { width, height }, 'calculated:', { canvasWidth, canvasHeight });

  // Check if canvas is ready
  useEffect(() => {
    const checkCanvas = () => {
      if (canvasRef.current) {
        console.log('Canvas element is ready');
        setCanvasReady(true);
      } else {
        console.log('Canvas not ready yet, retrying...');
        setTimeout(checkCanvas, 50);
      }
    };
    checkCanvas();
  }, []);

  useEffect(() => {
    const loadEffects = async () => {
      try {
        console.log('🎬 Loading effects for canvas:', assets.length, 'assets');
        console.log('🎬 Canvas ref:', canvasRef.current);
        console.log('🎬 Canvas ready state:', canvasReady);
        
        // Wait for canvas to be available
        let attempts = 0;
        while (!canvasRef.current && attempts < 100) {
          await new Promise(resolve => setTimeout(resolve, 20));
          attempts++;
          console.log('🎬 Waiting for canvas, attempt:', attempts);
        }
        
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('🎬 Canvas not found after waiting');
          setError('Canvas not found');
          return;
        }

        console.log('🎬 Canvas found, getting context...');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('🎬 Failed to get 2D context');
          setError('Failed to get 2D context');
          return;
        }

        console.log('🎬 Canvas context obtained successfully');

        // Load all effects
        const effectAssets = assets.filter(asset => 
          asset.type === 'effect' || 
          asset.asset.isEffect || 
          asset.asset.type === 'p5js' || 
          asset.asset.type === 'threejs'
        );
        
        console.log('🎬 Effect assets to load:', effectAssets.length);

        for (const { asset } of effectAssets) {
          try {
            const effectFile = asset.filePath?.split('/').pop() || asset.path?.split('/').pop() || 'ColorPulse.ts';
            console.log('🎬 Loading effect:', asset.name, effectFile, asset.type);
            
            // Dynamic import
            const effectModule = await import(`../effects/${effectFile}`);
            const EffectClass = effectModule.default || effectModule[asset.name.replace(/\s+/g, '')];
            
            if (EffectClass) {
              const effect = new EffectClass(canvasWidth, canvasHeight);
              effect.setBPM(bpm);
              effectsRef.current.set(asset.id, effect);
              console.log('🎬 Effect loaded successfully:', asset.name);
            }
          } catch (error) {
            console.error('🎬 Error loading effect:', asset.name, error);
          }
        }

        // Load videos and images
        const mediaAssets = assets.filter(asset => 
          asset.type === 'video' || asset.type === 'image'
        );

        console.log('🎬 Media assets to load:', mediaAssets.map(({ asset }) => ({ name: asset.name, id: asset.id, type: asset.type })));

        for (const { asset, layer } of mediaAssets) {
          if (asset.type === 'video') {
            const video = document.createElement('video');
            // Use the same asset path resolution as LayerManager
            const assetPath = getAssetPath(asset);
            console.log('🎬 Creating video element for:', asset.name, 'Path:', assetPath);
            video.src = assetPath;
            video.muted = true;
            video.loop = layer.loopMode === 'loop' || layer.loopMode === 'ping-pong';
            video.autoplay = isPlaying;
            video.crossOrigin = 'anonymous';
            videoRefs.current.set(asset.id, video);
            console.log('🎬 Video element created:', asset.name, 'Video element:', video);
            
            // Try to start playing the video
            if (isPlaying) {
              video.play().catch(error => {
                console.error('🎬 Failed to start video playback:', asset.name, error);
              });
            }
            
            // Add event listeners for debugging and loop handling
            video.addEventListener('loadstart', () => console.log('🎬 Video loadstart:', asset.name));
            video.addEventListener('loadeddata', () => console.log('🎬 Video loadeddata:', asset.name));
            video.addEventListener('canplay', () => console.log('🎬 Video canplay:', asset.name));
            video.addEventListener('error', (e) => console.error('🎬 Video error:', asset.name, e));
            
            // Prevent blue flash on loop by setting background color
            video.addEventListener('seeking', () => {
              // Set video background to black to prevent blue flash
              video.style.backgroundColor = '#000000';
            });
            
            video.addEventListener('ended', () => {
              // Ensure smooth loop transition
              if (video.loop) {
                video.currentTime = 0;
                video.play().catch(error => {
                  console.error('🎬 Failed to restart video on loop:', asset.name, error);
                });
              }
            });
          } else if (asset.type === 'image') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            // Use the same asset path resolution as LayerManager
            const assetPath = getAssetPath(asset);
            img.src = assetPath;
            imageRefs.current.set(asset.id, img);
            console.log('🎬 Image loaded:', asset.name, 'Path:', assetPath);
            
            // Add event listeners for debugging
            img.addEventListener('load', () => console.log('🎬 Image loaded successfully:', asset.name));
            img.addEventListener('error', (e) => console.error('🎬 Image error:', asset.name, e));
          }
        }

        setIsLoaded(true);
        setError(null);
        console.log('🎬 Canvas loading completed successfully');

      } catch (error) {
        console.error('🎬 Error loading effects:', error);
        setError(`Error loading effects: ${error}`);
      }
    };

    if (canvasReady) {
      loadEffects();
    }

    return () => {
      effectsRef.current.forEach(effect => {
        effect.cleanup?.();
      });
      effectsRef.current.clear();
      videoRefs.current.clear();
      imageRefs.current.clear();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
      }, [assets, canvasWidth, canvasHeight, bpm, canvasReady]);

  useEffect(() => {
    if (!isLoaded || !isPlaying) return;

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      if (!canvasRef.current) return;

      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas with black background to prevent blue flash
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Render effects first (background)
      effectsRef.current.forEach((effect, assetId) => {
        try {
          effect.render(deltaTime);
          // Draw effect canvas onto main canvas
          ctx.drawImage(effect.canvas, 0, 0, canvasWidth, canvasHeight);
        } catch (error) {
          console.error('Error rendering effect:', error);
        }
      });

      // Render videos and images on top
      let hasRenderedContent = false;
      console.log('🎬 Canvas animation loop - assets:', assets.length, 'videoRefs:', videoRefs.current.size, 'imageRefs:', imageRefs.current.size);
      assets.forEach(({ type, asset, layer }) => {
        if (type === 'video') {
          const video = videoRefs.current.get(asset.id);
          console.log('🎬 Rendering video:', asset.name, 'Asset ID:', asset.id, 'Video ref:', video, 'Ready state:', video?.readyState);
          if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA
            // Check if video is at the end and about to loop
            const isNearEnd = video.currentTime >= video.duration - 0.1;
            
            // Calculate aspect ratio to fit video properly
            const videoAspect = video.videoWidth / video.videoHeight;
            const canvasAspect = canvasWidth / canvasHeight;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (videoAspect > canvasAspect) {
              // Video is wider than canvas
              drawWidth = canvasWidth;
              drawHeight = canvasWidth / videoAspect;
              drawX = 0;
              drawY = (canvasHeight - drawHeight) / 2;
            } else {
              // Video is taller than canvas
              drawHeight = canvasHeight;
              drawWidth = canvasHeight * videoAspect;
              drawX = (canvasWidth - drawWidth) / 2;
              drawY = 0;
            }
            
            // Only draw if video is not at the very end (prevents flash)
            if (!isNearEnd || video.currentTime > 0) {
              console.log('🎬 Drawing video:', asset.name, 'Dimensions:', drawWidth, drawHeight, drawX, drawY);
              ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
              hasRenderedContent = true;
            } else {
              console.log('🎬 Skipping video frame near end to prevent flash:', asset.name);
            }
          } else {
            console.log('🎬 Video not ready:', asset.name, 'Ready state:', video?.readyState);
          }
        } else if (type === 'image') {
          const img = imageRefs.current.get(asset.id);
          console.log('🎬 Rendering image:', asset.name, 'Image ref:', img, 'Complete:', img?.complete);
          if (img && img.complete) {
            // Calculate aspect ratio to fit image properly
            const imgAspect = img.naturalWidth / img.naturalHeight;
            const canvasAspect = canvasWidth / canvasHeight;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (imgAspect > canvasAspect) {
              // Image is wider than canvas
              drawWidth = canvasWidth;
              drawHeight = canvasWidth / imgAspect;
              drawX = 0;
              drawY = (canvasHeight - drawHeight) / 2;
            } else {
              // Image is taller than canvas
              drawHeight = canvasHeight;
              drawWidth = canvasHeight * imgAspect;
              drawX = (canvasWidth - drawWidth) / 2;
              drawY = 0;
            }
            
            console.log('🎬 Drawing image:', asset.name, 'Dimensions:', drawWidth, drawHeight, drawX, drawY);
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            hasRenderedContent = true;
          } else {
            console.log('🎬 Image not ready:', asset.name, 'Complete:', img?.complete);
          }
        }
      });

      // Show placeholder if no content was rendered
      if (!hasRenderedContent && assets.length > 0) {
        console.log('🎬 No content rendered, showing placeholder');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Loading content...', canvasWidth / 2, canvasHeight / 2);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLoaded, isPlaying, assets, canvasWidth, canvasHeight]);

  useEffect(() => {
    effectsRef.current.forEach(effect => {
      effect.setBPM(bpm);
    });
  }, [bpm]);

  // Update video play state when isPlaying changes
  useEffect(() => {
    videoRefs.current.forEach((video, assetId) => {
      if (isPlaying) {
        video.play().catch(error => {
          console.error('Failed to start video playback:', assetId, error);
        });
      } else {
        video.pause();
      }
    });
  }, [isPlaying]);

  useEffect(() => {
    effectsRef.current.forEach(effect => {
      effect.resize(canvasWidth, canvasHeight);
    });
  }, [canvasWidth, canvasHeight]);

  if (error) {
    return (
      <div className="canvas-error">
        <div className="error-icon">⚠️</div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="canvas-loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading canvas...</div>
      </div>
    );
  }

  console.log('🎬 Rendering canvas with dimensions:', canvasWidth, canvasHeight);
  console.log('🎬 Canvas ref:', canvasRef.current);
  console.log('🎬 Is loaded:', isLoaded);
  console.log('🎬 Error:', error);
  
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    console.error('🎬 Invalid canvas dimensions:', canvasWidth, canvasHeight);
    return (
      <div className="canvas-error">
        <div className="error-icon">⚠️</div>
        <div className="error-message">Invalid canvas dimensions</div>
      </div>
    );
  }
  
  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        backgroundColor: 'transparent',
      }}
    />
  );
}; 