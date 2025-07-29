import React, { useEffect, useRef } from 'react';
import p5 from 'p5';

interface ColumnPreviewProps {
  column: any;
  width: number;
  height: number;
  isPlaying: boolean;
  bpm: number;
  globalEffects?: any[];
}

// PURE P5.JS RENDERER - No React in render loop
class PureP5Renderer {
  private p5Instance: p5 | null = null;
  private container: HTMLDivElement;
  private width: number;
  private height: number;
  private isPlaying: boolean = false;
  private bpm: number = 120;
  
  // Pure p5.js state management (no React refs)
  private videos = new Map<string, HTMLVideoElement>();
  private images = new Map<string, p5.Image>();
  private videoFrameCallbacks = new Map<string, number>();
  private frameCount = 0;
  
  constructor(container: HTMLDivElement, width: number, height: number) {
    this.container = container;
    this.width = width;
    this.height = height;
  }
  
  // PURE P5.JS SETUP - No React dependencies
  initialize(): void {
    const sketch = (p: p5) => {
      this.p5Instance = p;
      
      p.setup = () => {
        const canvas = p.createCanvas(this.width, this.height);
        canvas.parent(this.container);
        console.log('🎨 PURE P5.JS: Setup complete - canvas size:', this.width, this.height);
      };

      p.draw = () => {
        if (!this.isPlaying) {
          // Pause all videos when not playing
          this.videos.forEach(video => {
            if (!video.paused) {
              video.pause();
            }
          });
          return;
        }
        
        // Resume all videos when playing
        this.videos.forEach((video, videoId) => {
          if (video.paused) {
            video.play().catch(error => {
              console.warn('Video play failed:', error);
            });
          }
          
          // NUCLEAR VIDEO MONITORING - Prevent video from reaching the end
          if (video.currentTime >= video.duration - 0.05 && video.loop) {
            console.log('🎬 NUCLEAR PURE P5.JS: Force restarting video before end:', videoId, 'Time:', video.currentTime, 'Duration:', video.duration);
            
            // Immediately restart the video
            video.currentTime = 0;
            video.play().catch((error: any) => {
              console.error('🎬 Failed to restart video:', videoId, error);
            });
          }
        });
        
        this.frameCount++;
        
        // NUCLEAR CLEARING - Force black background to prevent blue flash
        p.background(0);
        
        // NUCLEAR DEBUGGING: Log frame rendering
        if (this.frameCount % 60 === 0) {
          console.log('🎬 PURE P5.JS: Frame:', this.frameCount, 'Videos:', this.videos.size, 'Is playing:', this.isPlaying);
        }
        
        // Render all videos (pure p5.js operations, no React)
        this.videos.forEach((video, videoId) => {
          this.renderVideo(p, video, videoId);
        });
      };
    };
    
    new p5(sketch);
  }
  
  // PURE P5.JS VIDEO RENDERING - No React dependencies
  private renderVideo(p: p5, video: HTMLVideoElement, videoId: string): void {
    if (video.readyState >= 2) {
      try {
        // NUCLEAR DEBUGGING: Log video rendering
        if (this.frameCount % 60 === 0) {
          console.log('🎬 PURE P5.JS: Rendering video:', videoId, 'Time:', video.currentTime, 'Duration:', video.duration);
        }
        
        // NUCLEAR LOOP DETECTION: Check if video is near end
        const isNearEnd = video.currentTime >= video.duration - 0.1;
        if (isNearEnd && this.frameCount % 60 === 0) {
          console.log('🎬 NUCLEAR PURE P5.JS: Video near end:', videoId, 'Time:', video.currentTime, 'Duration:', video.duration, 'Diff:', video.duration - video.currentTime);
        }
        
        // Use p5.js to create an image from the video
        const videoImg = p.createImage(video.videoWidth, video.videoHeight);
        
        // Get the video data and create an image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        
        if (tempCtx) {
          // NUCLEAR VIDEO DRAWING - Always draw video if ready
          tempCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
          
          // Convert canvas to image data
          const imageData = tempCtx.getImageData(0, 0, video.videoWidth, video.videoHeight);
          videoImg.loadPixels();
          
          // Copy pixel data
          for (let i = 0; i < imageData.data.length; i++) {
            videoImg.pixels[i] = imageData.data[i];
          }
          
          videoImg.updatePixels();
          
          // Draw the video frame
          p.image(videoImg, 0, 0, this.width, this.height);
        }
      } catch (error) {
        console.error('Error rendering video in pure p5.js:', error);
        // NUCLEAR FALLBACK: Black rectangle instead of blue
        p.fill(0, 0, 0, 255);
        p.rect(0, 0, this.width, this.height);
        console.log('🎬 NUCLEAR PURE P5.JS: Video error, drawing black for:', videoId);
      }
    } else {
      // NUCLEAR FALLBACK: Black rectangle instead of blue loading
      p.fill(0, 0, 0, 255);
      p.rect(0, 0, this.width, this.height);
      console.log('🎬 NUCLEAR PURE P5.JS: Video not ready, drawing black for:', videoId);
    }
  }
  
  // PURE P5.JS VIDEO MANAGEMENT - No React dependencies
  addVideo(videoId: string, asset: any): void {
    const video = document.createElement('video');
    video.src = asset.path || asset.filePath;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.backgroundColor = '#000000';
    
    // NUCLEAR VIDEO EVENT MONITORING - Track all video events
    video.addEventListener('loadeddata', () => {
      console.log('✅ PURE P5.JS: Video loaded:', asset.name);
    });
    
    video.addEventListener('ended', () => {
      console.log('🎬 NUCLEAR PURE P5.JS: Video ended event for:', asset.name);
    });
    
    video.addEventListener('timeupdate', () => {
      const currentTime = video.currentTime;
      const duration = video.duration;
      
      // NUCLEAR DEBUGGING: Log every timeupdate during loop transitions
      if (currentTime >= duration - 0.1) {
        console.log('🎬 NUCLEAR PURE P5.JS DEBUG: Video near end:', asset.name, 'Time:', currentTime, 'Duration:', duration, 'Diff:', duration - currentTime);
      }
    });
    
    video.addEventListener('error', (error) => {
      console.error('❌ PURE P5.JS: Video load error:', error);
    });
    
    video.load();
    this.videos.set(videoId, video);
  }
  
  // PURE P5.JS STATE MANAGEMENT - No React dependencies
  setPlaying(playing: boolean): void {
    this.isPlaying = playing;
  }
  
  setBPM(bpm: number): void {
    this.bpm = bpm;
  }
  
  // PURE P5.JS CLEANUP - No React dependencies
  destroy(): void {
    this.videos.forEach(video => {
      video.pause();
      video.src = '';
      video.load();
    });
    this.videos.clear();
    this.videoFrameCallbacks.clear();
    
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
  }
}

// React wrapper - Only for initialization, not rendering
export const ColumnPreview: React.FC<ColumnPreviewProps> = React.memo(({ 
  column, 
  width, 
  height, 
  isPlaying, 
  bpm,
  globalEffects = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PureP5Renderer | null>(null);

  // React only handles initialization, not rendering
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create pure p5.js renderer
    rendererRef.current = new PureP5Renderer(containerRef.current, width, height);
    rendererRef.current.initialize();
    
    // Add videos to pure renderer
    if (column && column.layers) {
      column.layers.forEach((layer: any) => {
        if (layer.asset && layer.asset.type === 'video') {
          rendererRef.current!.addVideo(layer.id, layer.asset);
        }
      });
    }
  }, [column, width, height]);

  // React only handles play/pause state changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setPlaying(isPlaying);
    }
  }, [isPlaying]);

  // React only handles BPM changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setBPM(bpm);
    }
  }, [bpm]);

  // React cleanup
  useEffect(() => {
    return () => {
      rendererRef.current?.destroy();
    };
  }, []);

  // React only provides the container, not the rendering
  return (
    <div className="column-preview">
      <div className="preview-header-info">
        <h4>Column Preview (Pure P5.js)</h4>
        <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
      </div>
      <div className="preview-main-content">
        <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: '#000000' }} />
      </div>
    </div>
  );
}); 