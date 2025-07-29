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

// PURE CANVAS RENDERER - No React in render loop
class PureCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private isRunning = false;
  
  // Video management (pure canvas, no React refs)
  private videoElements = new Map<string, HTMLVideoElement>();
  private imageElements = new Map<string, HTMLImageElement>();
  private lastFrames = new Map<string, ImageData>();
  private videoStates = new Map<string, { isLooping: boolean, lastValidTime: number }>();
  
  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = width;
    this.canvas.height = height;
    
    // NUCLEAR CANVAS SETUP - Force black background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, width, height);
    this.canvas.style.backgroundColor = '#000000';
  }
  
  // PURE CANVAS VIDEO MANAGEMENT - No React dependencies
  addVideo(assetId: string, asset: any, layer: any): void {
    const video = document.createElement('video');
    video.src = asset.path || asset.filePath;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.preload = 'auto';
    video.style.backgroundColor = '#000000';
    
    // NUCLEAR VIDEO MONITORING - Pure canvas event handling
    video.addEventListener('timeupdate', () => {
      const currentTime = video.currentTime;
      const duration = video.duration;
      
      // NUCLEAR OPTION: Force restart video before it ends
      if (currentTime >= duration - 0.05 && (layer.loopMode === 'loop' || layer.loopMode === 'ping-pong')) {
        console.log('🎬 NUCLEAR PURE CANVAS: Force restarting video before end:', asset.name);
        video.currentTime = 0;
        video.play().catch((error: any) => {
          console.error('🎬 Failed to restart video:', asset.name, error);
        });
      }
    });
    
    this.videoElements.set(assetId, video);
  }
  
  // PURE CANVAS RENDER LOOP - No React, no virtual DOM
  startRenderLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const render = () => {
      if (!this.isRunning) return;
      
      // NUCLEAR CANVAS CLEARING - Pure canvas operations
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      // PURE CANVAS VIDEO RENDERING - Direct operations, no React
      this.videoElements.forEach((video, assetId) => {
        if (video.readyState >= 2) {
          // Calculate aspect ratio
          const videoAspect = video.videoWidth / video.videoHeight;
          const canvasAspect = this.canvas.width / this.canvas.height;
          
          let drawWidth, drawHeight, drawX, drawY;
          
          if (videoAspect > canvasAspect) {
            drawWidth = this.canvas.width;
            drawHeight = this.canvas.width / videoAspect;
            drawX = 0;
            drawY = (this.canvas.height - drawHeight) / 2;
          } else {
            drawHeight = this.canvas.height;
            drawWidth = this.canvas.height * videoAspect;
            drawX = (this.canvas.width - drawWidth) / 2;
            drawY = 0;
          }
          
          // NUCLEAR VIDEO DRAWING - Always draw video if ready
          this.ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
          
          // Store frame for backup
          const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
          this.lastFrames.set(assetId, imageData);
          
          console.log('🎬 NUCLEAR PURE CANVAS: Drew video frame:', assetId, 'Time:', video.currentTime, 'Duration:', video.duration);
        } else if (this.lastFrames.has(assetId)) {
          // Use last frame if video not ready
          const lastFrame = this.lastFrames.get(assetId);
          if (lastFrame) {
            this.ctx.putImageData(lastFrame, 0, 0);
            console.log('🎬 NUCLEAR PURE CANVAS: Using last frame for:', assetId);
          }
        } else {
          // Nuclear fallback - pure black
          this.ctx.fillStyle = '#000000';
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          console.log('🎬 NUCLEAR PURE CANVAS: Drawing black for:', assetId);
        }
      });
      
      this.animationId = requestAnimationFrame(render);
    };
    
    render();
  }
  
  stopRenderLoop(): void {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  // PURE CANVAS CLEANUP - No React dependencies
  destroy(): void {
    this.stopRenderLoop();
    this.videoElements.forEach(video => {
      video.pause();
      video.src = '';
      video.load();
    });
    this.videoElements.clear();
    this.lastFrames.clear();
    this.videoStates.clear();
  }
}

// React wrapper - Only for initialization, not rendering
export const CanvasRenderer: React.FC<CanvasRendererProps> = React.memo(({
  assets,
  width,
  height,
  bpm = 120,
  isPlaying = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PureCanvasRenderer | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // React only handles initialization, not rendering
  useEffect(() => {
    if (!canvasRef.current) return;
    
    try {
      // Create pure canvas renderer
      rendererRef.current = new PureCanvasRenderer(canvasRef.current, width, height);
      
      // Add assets to pure renderer
      assets.forEach(({ asset, layer }) => {
        if (asset.type === 'video') {
          rendererRef.current!.addVideo(asset.id, asset, layer);
        }
      });
      
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [assets, width, height]);

  // React only handles play/pause state changes
  useEffect(() => {
    if (!rendererRef.current) return;
    
    if (isPlaying) {
      rendererRef.current.startRenderLoop();
    } else {
      rendererRef.current.stopRenderLoop();
    }
  }, [isPlaying]);

  // React cleanup
  useEffect(() => {
    return () => {
      rendererRef.current?.destroy();
    };
  }, []);

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

  // React only provides the canvas element, not the rendering
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      backgroundColor: '#000000',
      position: 'relative'
    }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
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