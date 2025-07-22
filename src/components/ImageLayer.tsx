import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/store';

interface ImageLayerProps {
  layer: any;
  width: number;
  height: number;
  onUpdate: (updates: any) => void;
}

export const ImageLayer: React.FC<ImageLayerProps> = ({ layer, width, height, onUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (layer.asset?.path) {
      loadImage(layer.asset.path);
    }
  }, [layer.asset?.path]);

  const loadImage = (src: string) => {
    setIsLoading(true);
    setError(null);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      setImage(img);
      setIsLoading(false);
      
      // Auto-update layer with image dimensions
      onUpdate({
        metadata: {
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight
        }
      });
    };

    img.onerror = () => {
      setError('Failed to load image');
      setIsLoading(false);
    };

    img.src = src;
  };

  const renderImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate image position and size based on fit mode
    const { fitMode = 'cover', position = { x: 0.5, y: 0.5 } } = layer;
    
    let drawWidth = width;
    let drawHeight = height;
    let drawX = 0;
    let drawY = 0;

    const imageAspect = image.naturalWidth / image.naturalHeight;
    const canvasAspect = width / height;

    switch (fitMode) {
      case 'cover':
        if (imageAspect > canvasAspect) {
          drawHeight = width / imageAspect;
          drawY = (height - drawHeight) * position.y;
        } else {
          drawWidth = height * imageAspect;
          drawX = (width - drawWidth) * position.x;
        }
        break;
      
      case 'contain':
        if (imageAspect > canvasAspect) {
          drawWidth = height * imageAspect;
          drawX = (width - drawWidth) * position.x;
        } else {
          drawHeight = width / imageAspect;
          drawY = (height - drawHeight) * position.y;
        }
        break;
      
      case 'stretch':
        // Use full canvas size
        break;
      
      case 'tile':
        // Tile the image
        const tileWidth = image.naturalWidth;
        const tileHeight = image.naturalHeight;
        for (let y = 0; y < height; y += tileHeight) {
          for (let x = 0; x < width; x += tileWidth) {
            ctx.drawImage(image, x, y, tileWidth, tileHeight);
          }
        }
        return;
    }

    // Apply layer transformations
    ctx.save();
    ctx.translate(drawX + drawWidth / 2, drawY + drawHeight / 2);
    ctx.scale(layer.scale || 1, layer.scale || 1);
    ctx.rotate((layer.rotation || 0) * Math.PI / 180);
    ctx.translate(-drawWidth / 2, -drawHeight / 2);

    // Draw the image
    ctx.drawImage(image, 0, 0, drawWidth, drawHeight);
    ctx.restore();
  };

  useEffect(() => {
    renderImage();
  }, [image, layer, width, height]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onUpdate({
        asset: {
          path: result,
          name: file.name,
          type: 'image',
          size: file.size
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          onUpdate({
            asset: {
              path: result,
              name: file.name,
              type: 'image',
              size: file.size
            }
          });
        };
        reader.readAsDataURL(file);
      } else {
        setError('Please drop an image file');
      }
    }
  };

  return (
    <div className="image-layer">
      <div className="image-layer-header">
        <h3>Image Layer: {layer.name}</h3>
        <div className="image-controls">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id={`image-input-${layer.id}`}
          />
          <label htmlFor={`image-input-${layer.id}`} className="file-input-label">
            Choose Image
          </label>
        </div>
      </div>

      <div className="image-layer-content">
        <div
          className="image-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading image...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
            </div>
          ) : image ? (
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              className="image-canvas"
            />
          ) : (
            <div className="empty-state">
              <div className="upload-icon">📁</div>
              <p>Drop an image here or click to browse</p>
            </div>
          )}
        </div>
      </div>

      {image && (
        <div className="image-layer-controls">
          <div className="control-group">
            <label>Fit Mode:</label>
            <select
              value={layer.fitMode || 'cover'}
              onChange={(e) => onUpdate({ fitMode: e.target.value })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
              <option value="tile">Tile</option>
            </select>
          </div>

          <div className="control-group">
            <label>Scale: {layer.scale || 1}</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={layer.scale || 1}
              onChange={(e) => onUpdate({ scale: parseFloat(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <label>Rotation: {layer.rotation || 0}°</label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={layer.rotation || 0}
              onChange={(e) => onUpdate({ rotation: parseInt(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <label>Opacity: {Math.round((layer.opacity || 1) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.opacity || 1}
              onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <label>Position X: {Math.round((layer.position?.x || 0.5) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.position?.x || 0.5}
              onChange={(e) => onUpdate({ 
                position: { 
                  ...layer.position, 
                  x: parseFloat(e.target.value) 
                } 
              })}
            />
          </div>

          <div className="control-group">
            <label>Position Y: {Math.round((layer.position?.y || 0.5) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.position?.y || 0.5}
              onChange={(e) => onUpdate({ 
                position: { 
                  ...layer.position, 
                  y: parseFloat(e.target.value) 
                } 
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
}; 