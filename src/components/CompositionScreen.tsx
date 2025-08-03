import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { VideoLoopManager } from '../utils/VideoLoopManager';
import { VIDEO_ELEMENT_CONFIG } from '../constants/video';
import type { VideoLayer } from '../types/layer';
import { FilmNoiseEffect } from '../effects/FilmNoiseEffect';
import { FilmFlickerEffect } from '../effects/FilmFlickerEffect';
import { LightLeakEffect } from '../effects/LightLeakEffect';

interface CompositionScreenProps {
  className?: string;
}

// PURE COMPOSITION RENDERER - No React in render loop
class PureCompositionRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private isRunning = false;
  
  // Pure composition state management (no React refs)
  private videoElements = new Map<string, HTMLVideoElement>();
  private imageElements = new Map<string, HTMLImageElement>();
  private lastFrames = new Map<string, ImageData>();
  private scene: any = null;
  private bpm: number = 120;
  
  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    this.canvas.width = width;
    this.canvas.height = height;
    
    // NUCLEAR CANVAS SETUP - Force dark background
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, width, height);
    this.canvas.style.backgroundColor = '#1a1a1a';
  }
  
  // PURE COMPOSITION VIDEO MANAGEMENT - No React dependencies
  addVideo(layerId: string, asset: any, layer: any): void {
    const video = document.createElement('video');
    video.src = asset.path || asset.filePath;
    video.muted = VIDEO_ELEMENT_CONFIG.MUTED;
    video.loop = false; // Don't use native loop, handle it manually
    video.autoplay = VIDEO_ELEMENT_CONFIG.AUTOPLAY;
    video.crossOrigin = VIDEO_ELEMENT_CONFIG.CROSS_ORIGIN;
    video.playsInline = VIDEO_ELEMENT_CONFIG.PLAYS_INLINE;
    video.preload = VIDEO_ELEMENT_CONFIG.PRELOAD;
    video.style.backgroundColor = VIDEO_ELEMENT_CONFIG.BACKGROUND_COLOR;
    
    // NUCLEAR VIDEO MONITORING - Pure composition event handling
    video.addEventListener('timeupdate', () => {
      // Use centralized VideoLoopManager for all loop mode logic
      VideoLoopManager.handleLoopMode(video, layer as VideoLayer, layerId);
    });
    
    video.addEventListener('ended', () => {
      console.log('🎬 NUCLEAR PURE COMPOSITION: Video ended event:', layer.name, 'Loop mode:', layer.loopMode);
      
      // Handle ended event for loop modes
      if (layer.loopMode === 'loop' || layer.loopMode === 'ping-pong') {
        video.currentTime = 0;
        video.play().catch((error: any) => {
          console.error('🎬 Failed to restart video after ended event:', layer.name, error);
        });
      }
    });
    
    // Cleanup function to clear intervals using VideoLoopManager
    const cleanup = () => {
      VideoLoopManager.cleanup(layerId);
    };
    
    // Store cleanup function with video element
    (video as any).cleanup = cleanup;
    
    this.videoElements.set(layerId, video);
  }
  
  // PURE COMPOSITION RENDER LOOP - No React, no virtual DOM
  startRenderLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const render = () => {
      if (!this.isRunning) return;
      
      // NUCLEAR CANVAS CLEARING - Pure composition operations
      this.ctx.fillStyle = '#1a1a1a';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      if (!this.scene || !this.scene.columns) {
        this.animationId = requestAnimationFrame(render);
        return;
      }
      
      // PURE COMPOSITION SCENE RENDERING - Direct operations, no React
      this.scene.columns.forEach((column: any, columnIndex: number) => {
        if (!column.layers) return;
        
        // Calculate column position (3 columns across screen)
        const columnWidth = this.canvas.width / 3;
        const columnX = columnIndex * columnWidth;
        
        // Render layers in this column
        column.layers.forEach((layer: any, layerIndex: number) => {
          if (!layer.enabled) return;
          
          // Calculate layer position within column
          const layerHeight = this.canvas.height / 3;
          const layerY = layerIndex * layerHeight;
          
          // Apply layer opacity
          this.ctx.globalAlpha = layer.opacity || 1.0;
          
          // Render layer content
          this.renderLayer(layer, columnX, layerY, columnWidth, layerHeight);
        });
      });
      
      this.animationId = requestAnimationFrame(render);
    };
    
    render();
  }
  
  // PURE COMPOSITION LAYER RENDERING - No React dependencies
  private renderLayer(layer: any, x: number, y: number, width: number, height: number): void {
    if (!layer || !layer.type) return;
    
    // Debug layer dimensions
    if (layer.type === 'video') {
      console.log('🎬 Layer dimensions:', layer.name, 'Width:', width, 'Height:', height, 'Aspect:', width/height);
    }
    
    // Save context state
    this.ctx.save();
    
    // Apply layer transformations
    this.ctx.translate(x + width / 2, y + height / 2);
    this.ctx.scale(layer.scale || 1, layer.scale || 1);
    this.ctx.rotate((layer.rotation || 0) * Math.PI / 180);
    this.ctx.translate(-width / 2, -height / 2);
    
    // Render based on layer type
    switch (layer.type) {
      case 'video':
        this.renderVideoLayer(layer, width, height);
        break;
      case 'image':
        this.renderImageLayer(layer, width, height);
        break;
      default:
        // Default placeholder
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.strokeRect(0, 0, width, height);
        break;
    }
    
    // Restore context state
    this.ctx.restore();
  }
  
  // PURE COMPOSITION VIDEO RENDERING - No React dependencies
  private renderVideoLayer(layer: any, width: number, height: number): void {
    if (!layer.asset || !layer.asset.path) return;
    
    // Get or create video element for this layer
    let video = this.videoElements.get(layer.id);
    if (!video) {
      video = document.createElement('video');
      video.src = layer.asset.path;
      video.muted = layer.muted || true;
      video.loop = false; // Handle looping manually for better control
      video.crossOrigin = 'anonymous';
      video.autoplay = layer.autoplay || true;
      video.playsInline = true;
      video.preload = 'auto';
      video.style.backgroundColor = '#1a1a1a';
      
      // Debug video dimensions when loaded
      video.addEventListener('loadedmetadata', () => {
        if (video) {
          console.log('🎬 Video loaded:', layer.name, 'Video dimensions:', video.videoWidth, 'x', video.videoHeight, 'Aspect:', video.videoWidth/video.videoHeight);
        }
      });
      
      // Store video element for reuse
      this.videoElements.set(layer.id, video);
    }
    
    // NUCLEAR VIDEO DRAWING - Always draw video if ready
    if (video.readyState >= 2) {
      // Calculate aspect ratio and fit mode - default to 'contain' to show full video
      const { fitMode = 'contain', position = { x: 0.5, y: 0.5 } } = layer;
      
      let drawWidth = width;
      let drawHeight = height;
      let drawX = 0;
      let drawY = 0;
      
      const videoAspect = video.videoWidth / video.videoHeight;
      const layerAspect = width / height;
      
      switch (fitMode) {
        case 'cover':
          if (videoAspect > layerAspect) {
            drawHeight = width / videoAspect;
            drawY = (height - drawHeight) * position.y;
          } else {
            drawWidth = height * videoAspect;
            drawX = (width - drawWidth) * position.x;
          }
          break;
        
        case 'contain':
          if (videoAspect > layerAspect) {
            drawWidth = height * videoAspect;
            drawX = (width - drawWidth) * position.x;
          } else {
            drawHeight = width / videoAspect;
            drawY = (height - drawHeight) * position.y;
          }
          break;
        
        case 'stretch':
          // Use full layer size
          break;
      }
      
      // Draw video frame to canvas
      this.ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
      
      console.log('🎬 NUCLEAR PURE COMPOSITION: Drew video frame:', layer.name, 'Time:', video.currentTime, 'Duration:', video.duration, 'FitMode:', fitMode, 'VideoAspect:', videoAspect, 'LayerAspect:', layerAspect);
    } else {
      // Video not ready, show black
      this.ctx.fillStyle = '#1a1a1a';
      this.ctx.fillRect(0, 0, width, height);
      console.log('🎬 NUCLEAR PURE COMPOSITION: Video not ready, drawing black for:', layer.name);
    }
  }
  
  // PURE COMPOSITION IMAGE RENDERING - No React dependencies
  private renderImageLayer(layer: any, width: number, height: number): void {
    if (!layer.asset || !layer.asset.path) return;
    
    // For now, just draw a placeholder
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.strokeRect(0, 0, width, height);
  }
  
  stopRenderLoop(): void {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  // PURE COMPOSITION STATE MANAGEMENT - No React dependencies
  setScene(scene: any): void {
    this.scene = scene;
    
    // Add videos for new scene
    if (scene && scene.columns) {
      scene.columns.forEach((column: any) => {
        if (column.layers) {
          column.layers.forEach((layer: any) => {
            if (layer.asset && layer.asset.type === 'video') {
              this.addVideo(layer.id, layer.asset, layer);
            }
          });
        }
      });
    }
  }
  
  setBPM(bpm: number): void {
    this.bpm = bpm;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, width, height);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }
  
  // PURE COMPOSITION CLEANUP - No React dependencies
  destroy(): void {
    this.stopRenderLoop();
    this.videoElements.forEach((video, layerId) => {
      // Clean up any intervals associated with this video
      if ((video as any).cleanup) {
        (video as any).cleanup();
      }
      video.pause();
      video.src = '';
      video.load();
    });
    this.videoElements.clear();
    this.lastFrames.clear();
    // Clean up all VideoLoopManager intervals
    VideoLoopManager.cleanupAll();
  }
}

// React wrapper - Only for initialization, not rendering
export const CompositionScreen: React.FC<CompositionScreenProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PureCompositionRenderer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showFilmEffects, setShowFilmEffects] = useState(true);
  
  const { currentSceneId, scenes, bpm } = useStore() as any;
  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);

  // React only handles initialization, not rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    // Create pure composition renderer
    const rect = container.getBoundingClientRect();
    // Use 1920x1080 as base resolution but scale down to fit container
    const baseWidth = 1920;
    const baseHeight = 1080;
    
    // Calculate scale to fit the container while maintaining aspect ratio
    const scaleX = rect.width / baseWidth;
    const scaleY = rect.height / baseHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Set canvas to 1920x1080 for high resolution
    canvas.width = baseWidth;
    canvas.height = baseHeight;
    
    // Scale the canvas style to fit the container
    canvas.style.width = `${baseWidth * scale}px`;
    canvas.style.height = `${baseHeight * scale}px`;
    
    rendererRef.current = new PureCompositionRenderer(canvas, baseWidth, baseHeight);
    
    // Set initial scene
    if (currentScene) {
      rendererRef.current.setScene(currentScene);
    }
    
    // Start render loop
    rendererRef.current.startRenderLoop();
    
    // Handle resize
    const resizeCanvas = () => {
      const newRect = container.getBoundingClientRect();
      const baseWidth = 1920;
      const baseHeight = 1080;
      
      // Calculate scale to fit the container while maintaining aspect ratio
      const scaleX = newRect.width / baseWidth;
      const scaleY = newRect.height / baseHeight;
      const scale = Math.min(scaleX, scaleY);
      
      // Keep canvas at 1920x1080 resolution
      canvas.width = baseWidth;
      canvas.height = baseHeight;
      
      // Scale the canvas style to fit the container
      canvas.style.width = `${baseWidth * scale}px`;
      canvas.style.height = `${baseHeight * scale}px`;
      
      // Update renderer with new dimensions
      if (rendererRef.current) {
        rendererRef.current.resize(baseWidth, baseHeight);
      }
    };
    
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      rendererRef.current?.destroy();
    };
  }, [currentSceneId]);

  // React only handles scene changes
  useEffect(() => {
    if (rendererRef.current && currentScene) {
      rendererRef.current.setScene(currentScene);
    }
  }, [currentScene]);

  // React only handles BPM changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setBPM(bpm);
    }
  }, [bpm]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const togglePerformance = () => {
    setShowPerformance(!showPerformance);
  };

  const toggleFilmEffects = () => {
    setShowFilmEffects(!showFilmEffects);
  };

  // React only provides the container and controls, not the rendering
  return (
    <div 
      ref={containerRef}
      className={`composition-screen ${className} ${isFullscreen ? 'fullscreen' : ''}`}
    >
      <canvas
        ref={canvasRef}
        className="composition-canvas"
        style={{ display: 'block' }}
      />
      
      {/* Performance overlay */}
      {showPerformance && (
        <div className="performance-overlay">
          <div className="performance-metric">
            <span className="metric-label">BPM:</span>
            <span className="metric-value">{bpm}</span>
          </div>
        </div>
      )}

      {/* Global Effects Overlay */}
      {showFilmEffects && (
        <GlobalEffectsRenderer globalEffects={currentScene?.globalEffects || []} />
      )}
      
      {/* Controls overlay */}
      <div className="composition-controls">
        <button
          className="control-button"
          onClick={togglePerformance}
          title="Toggle Performance Monitor"
        >
          📊
        </button>
        <button
          className="control-button"
          onClick={toggleFilmEffects}
          title="Toggle Film Effects"
        >
          🎬
        </button>
        <button
          className="control-button"
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
        >
          {isFullscreen ? '⛶' : '⛶'}
        </button>
      </div>
    </div>
  );
}; 

// Global Effects Renderer Component
const GlobalEffectsRenderer: React.FC<{ globalEffects: any[] }> = ({ globalEffects }) => {
  const enabledEffects = globalEffects.filter((effect: any) => effect.enabled);
  
  return (
    <>
      {enabledEffects.map((effect: any) => {
        switch (effect.effectId) {
          case 'film-noise':
            return (
              <FilmNoiseEffect
                key={effect.id}
                intensity={effect.params?.intensity?.value || 0.3}
                color={effect.params?.color?.value || '#ffffff'}
                opacity={0.1}
              />
            );
          case 'film-flicker':
            return (
              <FilmFlickerEffect
                key={effect.id}
                intensity={effect.params?.intensity?.value || 0.2}
                speed={effect.params?.speed?.value || 1}
                color={effect.params?.color?.value || '#ffffff'}
              />
            );
          case 'light-leak':
            return (
              <LightLeakEffect
                key={effect.id}
                intensity={effect.params?.intensity?.value || 0.3}
                color={effect.params?.color?.value || '#ff6b35'}
                position={effect.params?.position?.value || 'right'}
                speed={effect.params?.speed?.value || 0.5}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}; 