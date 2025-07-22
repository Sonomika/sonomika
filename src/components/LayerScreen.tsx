import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { RenderLoop } from '../utils/RenderLoop';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';

interface LayerScreenProps {
  className?: string;
  selectedLayerId?: string | null;
  onClose?: () => void;
}

export const LayerScreen: React.FC<LayerScreenProps> = ({ 
  className = '', 
  selectedLayerId,
  onClose 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [fps, setFps] = useState(0);
  
  const { scenes, currentSceneId, selectedLayerId: globalSelectedLayerId, bpm } = useStore() as any;
  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
  
  // Use provided selectedLayerId or fall back to global selected layer
  const layerId = selectedLayerId || globalSelectedLayerId;
  
  const findLayerById = (scene: any, layerId: string) => {
    if (!scene || !scene.columns) return null;
    
    for (const column of scene.columns) {
      if (!column.layers) continue;
      
      for (const layer of column.layers) {
        if (layer.id === layerId) {
          return layer;
        }
      }
    }
    return null;
  };
  
  // Find the selected layer
  const selectedLayer = layerId ? findLayerById(currentScene, layerId) : null;

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
      if (!ctx || !selectedLayer) return;

      const { width, height } = canvas;
      const displayWidth = width / window.devicePixelRatio;
      const displayHeight = height / window.devicePixelRatio;

      // Clear canvas
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Render only the selected layer
      renderLayer(ctx, selectedLayer, 0, 0, displayWidth, displayHeight, deltaTime);

      // Update performance metrics
      performanceMonitor.recordFrame();
      const metrics = performanceMonitor.getMetrics();
      setFps(metrics.fps);
    };

    renderLoop.addCallback(render);

    return () => {
      renderLoop.removeCallback(render);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [selectedLayer, bpm]);

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
      // Calculate aspect ratio
      const imgAspect = img.width / img.height;
      const layerAspect = width / height;

      let drawWidth = width;
      let drawHeight = height;
      let drawX = 0;
      let drawY = 0;

      if (imgAspect > layerAspect) {
        // Image is wider than layer
        drawHeight = width / imgAspect;
        drawY = (height - drawHeight) / 2;
      } else {
        // Image is taller than layer
        drawWidth = height * imgAspect;
        drawX = (width - drawWidth) / 2;
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

    // For now, just show a placeholder
    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Video Layer', width / 2, height / 2);
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

  const toggleInfo = () => {
    setShowInfo(!showInfo);
  };

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  // Show layer screen when a layer is selected
  useEffect(() => {
    setIsVisible(!!selectedLayer);
  }, [selectedLayer]);

  if (!isVisible || !selectedLayer) return null;

  return (
    <div 
      ref={containerRef}
      className={`layer-screen ${className}`}
    >
      <div className="layer-screen-header">
        <h3>Layer Preview: {selectedLayer.name || 'Unnamed Layer'}</h3>
        <div className="layer-screen-controls">
          <button
            className="control-button"
            onClick={toggleInfo}
            title="Toggle Layer Info"
          >
            ℹ️
          </button>
          <button
            className="control-button"
            onClick={handleClose}
            title="Close Layer Preview"
          >
            ×
          </button>
        </div>
      </div>

      <div className="layer-screen-content">
        <canvas
          ref={canvasRef}
          className="layer-canvas"
          style={{ display: 'block' }}
        />
      </div>

      {/* Layer info overlay */}
      {showInfo && (
        <div className="layer-info-overlay">
          <div className="layer-info">
            <h4>Layer Information</h4>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Type:</span>
                <span className="info-value">{selectedLayer.type}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Opacity:</span>
                <span className="info-value">{(selectedLayer.opacity || 1) * 100}%</span>
              </div>
              <div className="info-item">
                <span className="info-label">Scale:</span>
                <span className="info-value">{selectedLayer.scale || 1}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Rotation:</span>
                <span className="info-value">{selectedLayer.rotation || 0}°</span>
              </div>
              <div className="info-item">
                <span className="info-label">FPS:</span>
                <span className={`info-value ${fps >= 55 ? 'good' : fps >= 30 ? 'warning' : 'bad'}`}>
                  {Math.round(fps)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 