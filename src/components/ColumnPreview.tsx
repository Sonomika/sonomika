import React, { useEffect, useRef } from 'react';
import p5 from 'p5';

interface ColumnPreviewProps {
  column: any;
  width: number;
  height: number;
  isPlaying: boolean;
  bpm: number;
}

export const ColumnPreview: React.FC<ColumnPreviewProps> = ({ 
  column, 
  width, 
  height, 
  isPlaying, 
  bpm 
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  // Create a hash of layer properties to detect changes
  const layerHash = column ? JSON.stringify(column.layers.map((layer: any) => ({
    id: layer.id,
    blendMode: layer.blendMode,
    opacity: layer.opacity,
    asset: layer.asset?.id
  }))) : '';

  useEffect(() => {
    if (!canvasRef.current || !column) return;

    // Clean up previous instance
    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
      p5InstanceRef.current = null;
    }

    const sketch = (p: p5) => {
      let layers: any[] = [];
      let images: Map<string, p5.Image> = new Map();
      let videos: Map<string, HTMLVideoElement> = new Map();
      let frameCount = 0;

      p.setup = () => {
        const canvas = p.createCanvas(width, height);
        canvas.parent(canvasRef.current!);
        console.log('🎨 ColumnPreview p5.js setup - canvas size:', width, height);
        
        // Load all layer assets
        loadLayerAssets();
      };

      p.draw = () => {
        if (!isPlaying) {
          // Pause all videos when not playing
          videos.forEach(video => {
            if (!video.paused) {
              video.pause();
            }
          });
          return;
        }
        
        // Resume all videos when playing
        videos.forEach(video => {
          if (video.paused) {
            video.play().catch(error => {
              console.warn('Video play failed:', error);
            });
          }
        });
        
        frameCount++;
        // Clear with black background to prevent blue flash
        p.background(0);
        
        // Render layers from bottom to top (layer 3, 2, 1)
        const sortedLayers = [...column.layers].sort((a, b) => {
          const aNum = parseInt(a.name.replace('Layer ', ''));
          const bNum = parseInt(b.name.replace('Layer ', ''));
          return bNum - aNum; // Descending order (3, 2, 1)
        });

        // console.log('🎨 Rendering layers:', sortedLayers.map(l => l.name));

        sortedLayers.forEach((layer, index) => {
          if (!layer.asset) return;

          const asset = layer.asset;
          // console.log(`🎨 Rendering layer ${layer.name} with asset:`, asset.name, asset.type);

          if (asset.type === 'image') {
            const img = images.get(asset.id);
            if (img) {
              renderImageLayer(p, img, layer, frameCount);
            }
          } else if (asset.type === 'video') {
            const video = videos.get(asset.id);
            if (video) {
              renderVideoLayer(p, video, layer, frameCount);
            }
          } else if (asset.type === 'p5js' || asset.type === 'effect') {
            renderEffectLayer(p, layer, frameCount);
          }
        });
      };

      const loadLayerAssets = async () => {
        console.log('🎨 Loading assets for column:', column.id);
        
        for (const layer of column.layers) {
          if (!layer.asset) continue;

          const asset = layer.asset;
          // console.log(`🎨 Loading asset for layer ${layer.name}:`, asset.name);

          if (asset.type === 'image') {
            try {
              const img = await loadImage(asset.path);
              images.set(asset.id, img);
              console.log(`✅ Image loaded for layer ${layer.name}:`, asset.name);
            } catch (error) {
              console.error(`❌ Failed to load image for layer ${layer.name}:`, error);
            }
          } else if (asset.type === 'video') {
            try {
              const video = await loadVideo(asset.path);
              videos.set(asset.id, video);
              console.log(`✅ Video loaded for layer ${layer.name}:`, asset.name);
            } catch (error) {
              console.error(`❌ Failed to load video for layer ${layer.name}:`, error);
            }
          }
        }
      };

      const loadImage = (path: string): Promise<p5.Image> => {
        return new Promise((resolve, reject) => {
          p.loadImage(path, 
            (img) => resolve(img),
            (error) => reject(error)
          );
        });
      };

      const loadVideo = (path: string): Promise<HTMLVideoElement> => {
        return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.src = path;
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          video.playsInline = true;
          
          // Set background color to prevent blue flash
          video.style.backgroundColor = '#000000';
          
          video.addEventListener('loadeddata', () => {
            console.log('✅ Video loaded:', path);
            // Start playing the video
            video.play().catch(error => {
              console.warn('Video autoplay failed:', error);
            });
            resolve(video);
          });
          
          video.addEventListener('error', (error) => {
            console.error('❌ Video load error:', error);
            reject(error);
          });
          
          // Prevent blue flash on loop by handling seeking and ended events
          video.addEventListener('seeking', () => {
            video.style.backgroundColor = '#000000';
          });
          
          video.addEventListener('ended', () => {
            // Ensure smooth loop transition
            if (video.loop) {
              video.currentTime = 0;
              video.play().catch(error => {
                console.warn('Video loop restart failed:', error);
              });
            }
          });
          
          video.load();
        });
      };

      const renderImageLayer = (p: p5, img: p5.Image, layer: any, frameCount: number) => {
        p.push();
        
        // Apply layer transformations
        p.translate(width / 2, height / 2);
        
        // Apply opacity
        p.tint(255, (layer.opacity || 1) * 255);
        
        // Apply blend mode - use p5.js constants
        const blendMode = layer.blendMode || 'add';
        switch (blendMode) {
          case 'add':
            p.blendMode(p.ADD);
            break;
          case 'multiply':
            p.blendMode(p.MULTIPLY);
            break;
          case 'screen':
            p.blendMode(p.SCREEN);
            break;
          case 'overlay':
            p.blendMode(p.OVERLAY);
            break;
          case 'soft-light':
            p.blendMode(p.SOFT_LIGHT);
            break;
          case 'hard-light':
            p.blendMode(p.HARD_LIGHT);
            break;
          case 'dodge':
            p.blendMode(p.DODGE);
            break;
          case 'burn':
            p.blendMode(p.BURN);
            break;
          case 'difference':
            p.blendMode(p.DIFFERENCE);
            break;
          case 'exclusion':
            p.blendMode(p.EXCLUSION);
            break;
          default:
            p.blendMode(p.ADD); // Default to ADD for stacking
        }
        
        // Calculate image dimensions to fit canvas
        const imgAspect = img.width / img.height;
        const canvasAspect = width / height;
        
        let drawWidth, drawHeight;
        if (imgAspect > canvasAspect) {
          drawWidth = width;
          drawHeight = width / imgAspect;
        } else {
          drawHeight = height;
          drawWidth = height * imgAspect;
        }
        
        // Apply layer effects
        if (layer.effects) {
          // Apply any layer effects here
          if (layer.effects.rotation) {
            p.rotate(p.radians(layer.effects.rotation));
          }
          if (layer.effects.scale) {
            p.scale(layer.effects.scale);
          }
        }
        
        p.image(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        p.pop();
      };

      const renderVideoLayer = (p: p5, video: HTMLVideoElement, layer: any, frameCount: number) => {
        p.push();
        
        // Apply layer transformations
        p.translate(width / 2, height / 2);
        
        // Apply opacity
        p.tint(255, (layer.opacity || 1) * 255);
        
        // Apply blend mode - use p5.js constants
        const blendMode = layer.blendMode || 'add';
        switch (blendMode) {
          case 'add':
            p.blendMode(p.ADD);
            break;
          case 'multiply':
            p.blendMode(p.MULTIPLY);
            break;
          case 'screen':
            p.blendMode(p.SCREEN);
            break;
          case 'overlay':
            p.blendMode(p.OVERLAY);
            break;
          case 'soft-light':
            p.blendMode(p.SOFT_LIGHT);
            break;
          case 'hard-light':
            p.blendMode(p.HARD_LIGHT);
            break;
          case 'dodge':
            p.blendMode(p.DODGE);
            break;
          case 'burn':
            p.blendMode(p.BURN);
            break;
          case 'difference':
            p.blendMode(p.DIFFERENCE);
            break;
          case 'exclusion':
            p.blendMode(p.EXCLUSION);
            break;
          default:
            p.blendMode(p.ADD); // Default to ADD for stacking
        }
        
        // Calculate video dimensions to fit canvas
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = width / height;
        
        let drawWidth, drawHeight;
        if (videoAspect > canvasAspect) {
          drawWidth = width;
          drawHeight = width / videoAspect;
        } else {
          drawHeight = height;
          drawWidth = height * videoAspect;
        }
        
        // Apply layer effects
        if (layer.effects) {
          if (layer.effects.rotation) {
            p.rotate(p.radians(layer.effects.rotation));
          }
          if (layer.effects.scale) {
            p.scale(layer.effects.scale);
          }
        }
        
        // Render video using p5.js - create a video element and draw it
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
          try {
            // Use p5.js to create an image from the video
            const videoImg = p.createImage(video.videoWidth, video.videoHeight);
            
            // Get the video data and create an image
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            
            if (tempCtx) {
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
              p.image(videoImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            }
          } catch (error) {
            console.error('Error rendering video in p5.js:', error);
            // Fallback to placeholder
            p.fill(100, 100, 255, (layer.opacity || 1) * 255);
            p.rect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            p.fill(255);
            p.textAlign(p.CENTER, p.CENTER);
            p.text('VIDEO ERROR', 0, 0);
          }
        } else {
          // Video not ready yet, show loading placeholder
          p.fill(100, 100, 255, (layer.opacity || 1) * 255);
          p.rect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          p.fill(255);
          p.textAlign(p.CENTER, p.CENTER);
          p.text('LOADING...', 0, 0);
        }
        p.pop();
      };

      const renderEffectLayer = (p: p5, layer: any, frameCount: number) => {
        p.push();
        
        // Apply layer transformations
        p.translate(width / 2, height / 2);
        
        // Apply opacity
        p.tint(255, (layer.opacity || 1) * 255);
        
        // Apply blend mode - use p5.js constants
        const blendMode = layer.blendMode || 'add';
        switch (blendMode) {
          case 'add':
            p.blendMode(p.ADD);
            break;
          case 'multiply':
            p.blendMode(p.MULTIPLY);
            break;
          case 'screen':
            p.blendMode(p.SCREEN);
            break;
          case 'overlay':
            p.blendMode(p.OVERLAY);
            break;
          case 'soft-light':
            p.blendMode(p.SOFT_LIGHT);
            break;
          case 'hard-light':
            p.blendMode(p.HARD_LIGHT);
            break;
          case 'dodge':
            p.blendMode(p.DODGE);
            break;
          case 'burn':
            p.blendMode(p.BURN);
            break;
          case 'difference':
            p.blendMode(p.DIFFERENCE);
            break;
          case 'exclusion':
            p.blendMode(p.EXCLUSION);
            break;
          default:
            p.blendMode(p.ADD); // Default to ADD for stacking
        }
        
        // Render effect based on type
        if (layer.asset.type === 'p5js') {
          renderP5JSEffect(p, layer, frameCount);
        } else {
          renderGenericEffect(p, layer, frameCount);
        }
        
        p.pop();
      };

      const renderP5JSEffect = (p: p5, layer: any, frameCount: number) => {
        const time = frameCount / 60; // Convert to seconds
        const effectId = layer.asset.id || 'pulse';
        
        p.push();
        p.noStroke();
        
        switch (effectId) {
          case 'pulse':
            // Circle pulse effect
            p.fill(255, 100, 100, (layer.opacity || 1) * 255);
            const circleSize = 50 + Math.sin(time * 2) * 20;
            p.ellipse(0, 0, circleSize, circleSize);
            break;
            
          case 'square-pulse':
            // Square pulse effect
            p.fill(100, 255, 100, (layer.opacity || 1) * 255);
            const squareSize = 60 + Math.sin(time * 3) * 25;
            p.rectMode(p.CENTER);
            p.rect(0, 0, squareSize, squareSize);
            break;
            
          case 'wave':
            // Wave effect
            p.fill(100, 100, 255, (layer.opacity || 1) * 255);
            for (let i = 0; i < 10; i++) {
              const waveSize = 30 + Math.sin(time * 2 + i * 0.5) * 15;
              p.ellipse(i * 20 - 90, 0, waveSize, waveSize);
            }
            break;
            
          case 'particles':
            // Particle system
            p.fill(255, 255, 100, (layer.opacity || 1) * 255);
            for (let i = 0; i < 20; i++) {
              const x = Math.sin(time + i * 0.3) * 50;
              const y = Math.cos(time + i * 0.3) * 50;
              const size = 5 + Math.sin(time * 2 + i) * 3;
              p.ellipse(x, y, size, size);
            }
            break;
            
          case 'geometric':
            // Geometric pattern
            p.fill(255, 100, 255, (layer.opacity || 1) * 255);
            p.rectMode(p.CENTER);
            for (let i = 0; i < 4; i++) {
              p.push();
              p.rotate(time + i * p.PI / 2);
              const rectSize = 40 + Math.sin(time * 2) * 10;
              p.rect(0, 0, rectSize, rectSize);
              p.pop();
            }
            break;
            
          case 'audio-reactive':
            // Audio reactive effect (placeholder)
            p.fill(255, 150, 50, (layer.opacity || 1) * 255);
            const audioSize = 40 + Math.sin(time * 4) * 15;
            p.ellipse(0, 0, audioSize, audioSize);
            break;
            
          case 'color-pulse':
            // Color pulse effect
            const hue = (time * 50) % 360;
            p.fill(p.color(`hsla(${hue}, 100%, 50%, ${layer.opacity || 1})`));
            const colorSize = 45 + Math.sin(time * 2.5) * 20;
            p.ellipse(0, 0, colorSize, colorSize);
            break;
            
          default:
            // Default circle effect
            p.fill(255, 100, 100, (layer.opacity || 1) * 255);
            const defaultSize = 50 + Math.sin(time * 2) * 20;
            p.ellipse(0, 0, defaultSize, defaultSize);
        }
        
        p.pop();
      };

      const renderGenericEffect = (p: p5, layer: any, frameCount: number) => {
        // Generic effect rendering
        const time = frameCount / 60;
        
        p.push();
        p.noStroke();
        p.fill(100, 100, 255, (layer.opacity || 1) * 255);
        
        // Animated rectangle effect
        const size = 60 + Math.cos(time * 1.5) * 15;
        p.rect(-size / 2, -size / 2, size, size);
        
        p.pop();
      };
    };

    // Create new p5 instance
    p5InstanceRef.current = new p5(sketch);

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
        p5InstanceRef.current = null;
      }
    };
  }, [column, width, height, isPlaying, bpm, layerHash]);

  return (
    <div className="column-preview">
      <div ref={canvasRef} className="p5-canvas-container" />
      {!isPlaying && (
        <div className="preview-overlay">
          <div className="preview-status">Paused</div>
        </div>
      )}
    </div>
  );
}; 