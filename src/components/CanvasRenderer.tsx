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

export const CanvasRenderer: React.FC<CanvasRendererProps> = React.memo(({
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
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationRef = useRef<number>();
  const effectsRef = useRef<Map<string, any>>(new Map());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastFrameRef = useRef<Map<string, ImageData>>(new Map());
  const videoStateRef = useRef<Map<string, { isLooping: boolean, lastValidTime: number }>>(new Map());
  const doubleVideoRefs = useRef<Map<string, { primary: HTMLVideoElement, secondary: HTMLVideoElement }>>(new Map());
  const frameBufferRef = useRef<Map<string, ImageData[]>>(new Map());
  const loopTransitionRef = useRef<Map<string, boolean>>(new Map());
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
        ctxRef.current = canvas.getContext('2d');
        if (!ctxRef.current) {
          console.error('🎬 Failed to get 2D context');
          setError('Failed to get 2D context');
          return;
        }

        console.log('🎬 Canvas context obtained successfully');

        // Create buffer canvas for video rendering optimization
        bufferCanvasRef.current = document.createElement('canvas');
        bufferCanvasRef.current.width = canvasWidth;
        bufferCanvasRef.current.height = canvasHeight;
        bufferCtxRef.current = bufferCanvasRef.current.getContext('2d');

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
            // Create double video elements for seamless looping
            const primaryVideo = document.createElement('video');
            const secondaryVideo = document.createElement('video');
            
            // Use the same asset path resolution as LayerManager
            const assetPath = getAssetPath(asset);
            console.log('🎬 Creating double video elements for:', asset.name, 'Path:', assetPath);
            
            // Configure primary video
            primaryVideo.src = assetPath;
            primaryVideo.muted = true;
            primaryVideo.loop = true; // Enable native looping as backup
            primaryVideo.autoplay = isPlaying;
            primaryVideo.crossOrigin = 'anonymous';
            primaryVideo.playsInline = true;
            primaryVideo.preload = 'auto';
            primaryVideo.style.backgroundColor = '#000000';
            
            // Configure secondary video (backup for seamless loop)
            secondaryVideo.src = assetPath;
            secondaryVideo.muted = true;
            secondaryVideo.loop = true; // Enable native looping
            secondaryVideo.autoplay = false;
            secondaryVideo.crossOrigin = 'anonymous';
            secondaryVideo.playsInline = true;
            secondaryVideo.preload = 'auto';
            secondaryVideo.style.backgroundColor = '#000000';
            
            // Pre-load secondary video to ensure it's ready
            secondaryVideo.load();
            
            // Store both videos
            videoRefs.current.set(asset.id, primaryVideo);
            doubleVideoRefs.current.set(asset.id, { primary: primaryVideo, secondary: secondaryVideo });
            
            // IMMEDIATE CLONING: Create a third video element as backup
            const backupVideo = document.createElement('video');
            backupVideo.src = assetPath;
            backupVideo.muted = true;
            backupVideo.loop = true; // Enable native looping
            backupVideo.autoplay = false;
            backupVideo.crossOrigin = 'anonymous';
            backupVideo.playsInline = true;
            backupVideo.preload = 'auto';
            backupVideo.style.backgroundColor = '#000000';
            backupVideo.load();
            
            // Store backup video in the double video refs
            const currentDouble = doubleVideoRefs.current.get(asset.id);
            if (currentDouble) {
              // Replace secondary with backup, keep primary
              currentDouble.secondary = backupVideo;
            }
            console.log('🎬 Video elements created:', asset.name, 'Primary:', primaryVideo, 'Secondary:', secondaryVideo);
            
            // Try to start playing the primary video
            if (isPlaying) {
              primaryVideo.play().catch(error => {
                console.error('🎬 Failed to start video playback:', asset.name, error);
              });
            }
            
            // Add event listeners for debugging and loop handling
            primaryVideo.addEventListener('loadstart', () => console.log('🎬 Video loadstart:', asset.name));
            primaryVideo.addEventListener('loadeddata', () => console.log('🎬 Video loadeddata:', asset.name));
            primaryVideo.addEventListener('canplay', () => console.log('🎬 Video canplay:', asset.name));
            primaryVideo.addEventListener('error', (e) => console.error('🎬 Video error:', asset.name, e));
            
            // Advanced loop handling to prevent blue flash
            primaryVideo.addEventListener('seeking', () => {
              primaryVideo.style.backgroundColor = '#000000';
              // Mark as not looping during seek
              videoStateRef.current.set(asset.id, { isLooping: false, lastValidTime: primaryVideo.currentTime });
            });
            
            primaryVideo.addEventListener('ended', () => {
              if (layer.loopMode === 'loop' || layer.loopMode === 'ping-pong') {
                // Mark as looping and in transition
                videoStateRef.current.set(asset.id, { isLooping: true, lastValidTime: primaryVideo.duration });
                loopTransitionRef.current.set(asset.id, true);
                
                // Immediately preserve the last frame if we have it
                const frames = frameBufferRef.current.get(asset.id);
                if (frames && frames.length > 0) {
                  lastFrameRef.current.set(asset.id, frames[frames.length - 1]);
                }
                
                // Switch to secondary video for seamless loop
                const doubleVideo = doubleVideoRefs.current.get(asset.id);
                if (doubleVideo) {
                  // Start secondary video immediately
                  doubleVideo.secondary.currentTime = 0;
                  doubleVideo.secondary.play().catch(error => {
                    console.error('🎬 Failed to start secondary video:', asset.name, error);
                  });
                  
                  // Switch references
                  videoRefs.current.set(asset.id, doubleVideo.secondary);
                  doubleVideoRefs.current.set(asset.id, { 
                    primary: doubleVideo.secondary, 
                    secondary: doubleVideo.primary 
                  });
                  
                  // Reset transition after a few frames
                  setTimeout(() => {
                    loopTransitionRef.current.set(asset.id, false);
                  }, 100); // 100ms should be enough for the transition
                }
              }
            });
            
                        // NUCLEAR VIDEO MONITORING - Prevent video from ever ending
            primaryVideo.addEventListener('timeupdate', () => {
              const currentTime = primaryVideo.currentTime;
              const duration = primaryVideo.duration;
              
              // NUCLEAR OPTION: Force restart video before it ends
              if (currentTime >= duration - 0.05 && (layer.loopMode === 'loop' || layer.loopMode === 'ping-pong')) {
                console.log('🎬 NUCLEAR: Force restarting video before end:', asset.name, 'Time:', currentTime, 'Duration:', duration);
                
                // Immediately restart the video
                primaryVideo.currentTime = 0;
                primaryVideo.play().catch(error => {
                  console.error('🎬 Failed to restart video:', asset.name, error);
                });
                
                // Mark as transitioning
                loopTransitionRef.current.set(asset.id, true);
                videoStateRef.current.set(asset.id, { isLooping: true, lastValidTime: currentTime });
                
                // Reset transition after a few frames
                setTimeout(() => {
                  loopTransitionRef.current.set(asset.id, false);
                }, 100);
              }
              
              // NUCLEAR DEBUGGING: Log every timeupdate during loop transitions
              if (currentTime >= duration - 0.1) {
                console.log('🎬 NUCLEAR DEBUG: Video near end:', asset.name, 'Time:', currentTime, 'Duration:', duration, 'Diff:', duration - currentTime);
              }
              
              // Detect if we're in a loop transition
              if (currentTime < 0.1 && (layer.loopMode === 'loop' || layer.loopMode === 'ping-pong')) {
                // We just looped - keep the looping state for a few frames
                videoStateRef.current.set(asset.id, { isLooping: true, lastValidTime: currentTime });
                loopTransitionRef.current.set(asset.id, true);
                
                // Reset transition after a few frames
                setTimeout(() => {
                  loopTransitionRef.current.set(asset.id, false);
                }, 150);
              } else if (currentTime > 0.1 && currentTime < duration - 0.1) {
                // Normal playback - not looping
                videoStateRef.current.set(asset.id, { isLooping: false, lastValidTime: currentTime });
                loopTransitionRef.current.set(asset.id, false);
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
      const ctx = ctxRef.current;
      if (!ctx) return;

      // NUCLEAR CANVAS CLEARING - Force black background everywhere
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      
      // Set canvas background color to prevent any blue flash
      if (canvasRef.current) {
        canvasRef.current.style.backgroundColor = '#000000';
        // Force the canvas element itself to have black background
        canvasRef.current.style.setProperty('background-color', '#000000', 'important');
      }

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
      // Performance: Only log every 60 frames (once per second at 60fps)
      if (Math.random() < 0.016) {
        console.log('🎬 Canvas animation loop - assets:', assets.length, 'videoRefs:', videoRefs.current.size, 'imageRefs:', imageRefs.current.size);
      }
      assets.forEach(({ type, asset, layer }) => {
        if (type === 'video') {
          const video = videoRefs.current.get(asset.id);
          console.log('🎬 Rendering video:', asset.name, 'Asset ID:', asset.id, 'Video ref:', video, 'Ready state:', video?.readyState, 'Current time:', video?.currentTime, 'Duration:', video?.duration);
          
          // NUCLEAR DEBUGGING: Log every frame during loop transitions
          const videoState = videoStateRef.current.get(asset.id) || { isLooping: false, lastValidTime: 0 };
          const isNearEnd = video && video.currentTime >= (video.duration || 0) - 0.05;
          const isLooping = videoState.isLooping;
          const isInTransition = loopTransitionRef.current.get(asset.id) || false;
          
          if (isNearEnd || isLooping || isInTransition) {
            console.log('🎬 LOOP DEBUG:', asset.name, 'Near end:', isNearEnd, 'Looping:', isLooping, 'Transition:', isInTransition, 'Time:', video?.currentTime, 'Duration:', video?.duration);
          }
          
          if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA
                        // Ultra-aggressive loop detection and seamless rendering
            const videoState = videoStateRef.current.get(asset.id) || { isLooping: false, lastValidTime: 0 };
            const isNearEnd = video.currentTime >= video.duration - 0.05; // Much tighter threshold
            const isLooping = videoState.isLooping;
            const isInTransition = loopTransitionRef.current.get(asset.id) || false;
            
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
            
            // Performance: Only log video rendering occasionally
            if (Math.random() < 0.01) {
              console.log('🎬 Drawing video:', asset.name, 'Time:', video.currentTime, 'Duration:', video.duration, 'Looping:', isLooping, 'Transition:', isInTransition);
            }
            
            // NUCLEAR VIDEO RENDERING - Always render something, never show blank
            if (bufferCtxRef.current) {
              bufferCtxRef.current.clearRect(0, 0, canvasWidth, canvasHeight);
              
              // NUCLEAR STRATEGY: Always render video if available, regardless of state
              if (video.readyState >= 2) {
                // ALWAYS draw the video, even if it's at the end
                bufferCtxRef.current.drawImage(video, drawX, drawY, drawWidth, drawHeight);
                
                // Store frame continuously for backup
                const imageData = bufferCtxRef.current.getImageData(0, 0, canvasWidth, canvasHeight);
                lastFrameRef.current.set(asset.id, imageData);
                
                console.log('🎬 NUCLEAR: Drew video frame:', asset.name, 'Time:', video.currentTime, 'Duration:', video.duration);
              }
              // NUCLEAR FALLBACK: Use last frame if video not ready
              else if (lastFrameRef.current.has(asset.id)) {
                const lastFrame = lastFrameRef.current.get(asset.id);
                if (lastFrame) {
                  bufferCtxRef.current.putImageData(lastFrame, 0, 0);
                  console.log('🎬 NUCLEAR: Using last frame for:', asset.name);
                }
              }
              // NUCLEAR EMERGENCY: Pure black if nothing else works
              else {
                bufferCtxRef.current.fillStyle = '#000000';
                bufferCtxRef.current.fillRect(0, 0, canvasWidth, canvasHeight);
                console.log('🎬 NUCLEAR: Drawing black for:', asset.name);
              }
              
              ctx.drawImage(bufferCanvasRef.current!, 0, 0);
            } else {
              // Direct rendering fallback with same nuclear logic
              if (video.readyState >= 2) {
                ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
                console.log('🎬 NUCLEAR: Direct video draw:', asset.name);
              } else if (lastFrameRef.current.has(asset.id)) {
                const lastFrame = lastFrameRef.current.get(asset.id);
                if (lastFrame) {
                  ctx.putImageData(lastFrame, 0, 0);
                  console.log('🎬 NUCLEAR: Direct last frame for:', asset.name);
                }
              } else {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                console.log('🎬 NUCLEAR: Direct black for:', asset.name);
              }
            }
            hasRenderedContent = true;
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
      
      // Clean up video elements to prevent memory leaks
      videoRefs.current.forEach(video => {
        video.pause();
        video.src = '';
        video.load();
      });
      videoRefs.current.clear();
      
      // Clean up double video elements
      doubleVideoRefs.current.forEach(({ primary, secondary }) => {
        primary.pause();
        primary.src = '';
        primary.load();
        secondary.pause();
        secondary.src = '';
        secondary.load();
      });
      doubleVideoRefs.current.clear();
      
      // Clean up buffer canvas
      if (bufferCanvasRef.current) {
        bufferCanvasRef.current.width = 0;
        bufferCanvasRef.current.height = 0;
        bufferCanvasRef.current = null;
        bufferCtxRef.current = null;
      }
      
      // Clean up last frame storage
      lastFrameRef.current.clear();
      videoStateRef.current.clear();
      frameBufferRef.current.clear();
      loopTransitionRef.current.clear();
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
    
    // Also update double video elements
    doubleVideoRefs.current.forEach(({ primary, secondary }, assetId) => {
      if (isPlaying) {
        primary.play().catch(error => {
          console.error('Failed to start primary video playback:', assetId, error);
        });
      } else {
        primary.pause();
        secondary.pause();
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
    <div style={{ 
      width: '100%', 
      height: '100%', 
      backgroundColor: '#000000',
      position: 'relative'
    }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          backgroundColor: '#000000',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
    </div>
  );
}); 