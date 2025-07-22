import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { RenderLoop } from '../utils/RenderLoop';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';

interface CompositionScreenProps {
  className?: string;
}

export const CompositionScreen: React.FC<CompositionScreenProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState(0);
  
  const { currentSceneId, scenes, bpm } = useStore() as any;
  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize render loop
    const renderLoop = RenderLoop.getInstance();
    const performanceMonitor = PerformanceMonitor.getInstance();

    const render = (deltaTime: number) => {
      if (!ctx || !currentScene) return;

      const { width, height } = canvas;
      const displayWidth = width / window.devicePixelRatio;
      const displayHeight = height / window.devicePixelRatio;

      // Clear canvas
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Render scene layers
      renderScene(ctx, currentScene, displayWidth, displayHeight, deltaTime);

      // Update performance metrics
      performanceMonitor.recordFrame();
      const metrics = performanceMonitor.getMetrics();
      setFps(metrics.fps);
      setFrameTime(metrics.frameTime);
    };

    renderLoop.addCallback(render);

    return () => {
      renderLoop.removeCallback(render);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [currentSceneId, currentScene, bpm]);

  const renderScene = (
    ctx: CanvasRenderingContext2D,
    scene: any,
    width: number,
    height: number,
    deltaTime: number
  ) => {
    if (!scene || !scene.columns) return;

    // Create a temporary canvas for compositing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCanvas.width = width;
    tempCanvas.height = height;

    // Render each column
    scene.columns.forEach((column: any, columnIndex: number) => {
      if (!column.layers) return;

      // Calculate column position (3 columns across screen)
      const columnWidth = width / 3;
      const columnX = columnIndex * columnWidth;

      // Render layers in this column
      column.layers.forEach((layer: any, layerIndex: number) => {
        if (!layer.enabled) return;

        // Calculate layer position within column
        const layerHeight = height / 3;
        const layerY = layerIndex * layerHeight;

        // Apply layer opacity
        tempCtx.globalAlpha = layer.opacity || 1.0;

        // Render layer content
        renderLayer(tempCtx, layer, columnX, layerY, columnWidth, layerHeight, deltaTime);
      });
    });

    // Composite final result to main canvas
    ctx.drawImage(tempCanvas, 0, 0);
  };

  const renderLayer = (
    ctx: CanvasRenderingContext2D,
    layer: any,
    x: number,
    y: number,
    width: number,
    height: number,
    deltaTime: number
  ) => {
    if (!layer || !layer.type) return;

    // Save context state
    ctx.save();

    // Apply layer transformations
    ctx.translate(x + width / 2, y + height / 2);
    ctx.scale(layer.scale || 1, layer.scale || 1);
    ctx.rotate((layer.rotation || 0) * Math.PI / 180);
    ctx.translate(-width / 2, -height / 2);

    // Render based on layer type
    switch (layer.type) {
      case 'effect':
        renderEffectLayer(ctx, layer, width, height, deltaTime);
        break;
      case 'image':
        renderImageLayer(ctx, layer, width, height);
        break;
      case 'video':
        renderVideoLayer(ctx, layer, width, height);
        break;
      case 'shader':
        renderShaderLayer(ctx, layer, width, height, deltaTime);
        break;
      case 'p5js':
        renderP5JSLayer(ctx, layer, width, height, deltaTime);
        break;
      case 'threejs':
        renderThreeJSLayer(ctx, layer, width, height, deltaTime);
        break;
      default:
        // Default placeholder
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.strokeRect(0, 0, width, height);
        break;
    }

    // Restore context state
    ctx.restore();
  };

  const renderEffectLayer = (
    ctx: CanvasRenderingContext2D,
    layer: any,
    width: number,
    height: number,
    deltaTime: number
  ) => {
    if (!layer.effect) return;

    // Create a temporary canvas for the effect
    const effectCanvas = document.createElement('canvas');
    const effectCtx = effectCanvas.getContext('2d');
    if (!effectCtx) return;

    effectCanvas.width = width;
    effectCanvas.height = height;

    // Set up the effect context
    layer.effect.setCanvas(effectCanvas);
    layer.effect.setBPM(bpm);

    // Render the effect
    layer.effect.render(deltaTime);

    // Composite the effect result
    ctx.drawImage(effectCanvas, 0, 0);
  };

  const renderImageLayer = (
    ctx: CanvasRenderingContext2D,
    layer: any,
    width: number,
    height: number
  ) => {
    if (!layer.asset || !layer.asset.path) return;

    const img = new Image();
    img.onload = () => {
      // Calculate aspect ratio and fit mode
      const { fitMode = 'cover', position = { x: 0.5, y: 0.5 } } = layer;
      
      let drawWidth = width;
      let drawHeight = height;
      let drawX = 0;
      let drawY = 0;

      const imgAspect = img.naturalWidth / img.naturalHeight;
      const layerAspect = width / height;

      switch (fitMode) {
        case 'cover':
          if (imgAspect > layerAspect) {
            drawHeight = width / imgAspect;
            drawY = (height - drawHeight) * position.y;
          } else {
            drawWidth = height * imgAspect;
            drawX = (width - drawWidth) * position.x;
          }
          break;
        
        case 'contain':
          if (imgAspect > layerAspect) {
            drawWidth = height * imgAspect;
            drawX = (width - drawWidth) * position.x;
          } else {
            drawHeight = width / imgAspect;
            drawY = (height - drawHeight) * position.y;
          }
          break;
        
        case 'stretch':
          // Use full layer size
          break;
        
        case 'tile':
          // Tile the image
          const tileWidth = img.naturalWidth;
          const tileHeight = img.naturalHeight;
          for (let y = 0; y < height; y += tileHeight) {
            for (let x = 0; x < width; x += tileWidth) {
              ctx.drawImage(img, x, y, tileWidth, tileHeight);
            }
          }
          return;
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    };
    img.src = layer.asset.path;
  };

  const renderVideoLayer = (
    ctx: CanvasRenderingContext2D,
    layer: any,
    width: number,
    height: number
  ) => {
    if (!layer.asset || !layer.asset.path) return;

    // Create a video element for rendering
    const video = document.createElement('video');
    video.src = layer.asset.path;
    video.muted = layer.muted || true;
    video.loop = layer.loop || false;
    video.crossOrigin = 'anonymous';

    video.onloadeddata = () => {
      // Calculate aspect ratio and fit mode
      const { fitMode = 'cover', position = { x: 0.5, y: 0.5 } } = layer;
      
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

      ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
    };

    // Start playing if autoplay is enabled
    if (layer.autoplay) {
      video.play();
    }
  };

  const renderShaderLayer = (
    ctx: CanvasRenderingContext2D,
    layer: any,
    width: number,
    height: number,
    deltaTime: number
  ) => {
    // GLSL shader rendering will be implemented with WebGL
    ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Shader Layer', width / 2, height / 2);
  };

  const renderP5JSLayer = (
    ctx: CanvasRenderingContext2D,
    layer: any,
    width: number,
    height: number,
    deltaTime: number
  ) => {
    // p5.js sketch rendering will be implemented
    ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('p5.js Layer', width / 2, height / 2);
  };

  const renderThreeJSLayer = (
    ctx: CanvasRenderingContext2D,
    layer: any,
    width: number,
    height: number,
    deltaTime: number
  ) => {
    // Three.js module rendering will be implemented
    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Three.js Layer', width / 2, height / 2);
  };

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
            <span className="metric-label">FPS:</span>
            <span className={`metric-value ${fps >= 55 ? 'good' : fps >= 30 ? 'warning' : 'bad'}`}>
              {Math.round(fps)}
            </span>
          </div>
          <div className="performance-metric">
            <span className="metric-label">Frame Time:</span>
            <span className={`metric-value ${frameTime <= 16.67 ? 'good' : frameTime <= 33 ? 'warning' : 'bad'}`}>
              {frameTime.toFixed(1)}ms
            </span>
          </div>
          <div className="performance-metric">
            <span className="metric-label">BPM:</span>
            <span className="metric-value">{bpm}</span>
          </div>
        </div>
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
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
        >
          {isFullscreen ? '⛶' : '⛶'}
        </button>
      </div>
    </div>
  );
}; 