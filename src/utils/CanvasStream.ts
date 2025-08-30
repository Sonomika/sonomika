import { useStore } from '../store/store';

export class CanvasStreamManager {
  private canvas: HTMLCanvasElement | null = null;
  private isWindowOpen: boolean = false;
  private animationId: number | null = null;
  private browserWindow: Window | null = null;
  private mirrorCanvas: HTMLCanvasElement | null = null;
  private mirrorCtx: CanvasRenderingContext2D | null = null;
  private blobUrl: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  // Method to update canvas reference when real canvas becomes available
  updateCanvas(newCanvas: HTMLCanvasElement): void {
    console.log('CanvasStreamManager: Updating canvas reference');
    this.canvas = newCanvas;
    
    // If we're already streaming, the next frame will use the new canvas
    if (this.isWindowOpen) {
      console.log('CanvasStreamManager: Will use new canvas for next frame');
    }
  }

  async openMirrorWindow(): Promise<void> {
    try {
      // Use Electron IPC to open mirror window
      if (window.electron && window.electron.openMirrorWindow) {
        window.electron.openMirrorWindow();
        this.isWindowOpen = true;
        
        // Immediately set the mirror window aspect ratio and size to match the composition
        try {
          const comp = (useStore.getState() as any).compositionSettings || {};
          const w = Math.max(1, Number(comp.width) || 1920);
          const h = Math.max(1, Number(comp.height) || 1080);
          // Lock aspect ratio
          (window as any).electron?.setMirrorAspectRatio?.(w, h);
          // Resize window to exact comp size
          (window as any).electron?.resizeMirrorWindow?.(w, h);
        } catch {}

        // Reduced wait time for faster opening - start streaming immediately
        setTimeout(() => {
          this.startCanvasCapture();
        }, 100);
        
      } else {
        // Fallback to browser window if not in Electron
        this.openBrowserWindow();
      }
    } catch (error) {
      console.error('Failed to open mirror window:', error);
      throw error;
    }
  }

  private async openBrowserWindow(): Promise<void> {
    // Fallback for browser environment
    const comp = (useStore.getState() as any).compositionSettings || {};
    const compW = Math.max(1, Number(comp.width) || 1920);
    const compH = Math.max(1, Number(comp.height) || 1080);
    const aspect = compW / compH;
    
    // Start with canvas dimensions, then scale down if needed to fit screen
    let winW = compW;
    let winH = compH;
    
    // Get screen dimensions and scale down if window is too large
    const maxW = Math.floor((window.screen?.availWidth || window.innerWidth) * 0.9);
    const maxH = Math.floor((window.screen?.availHeight || window.innerHeight) * 0.9);
    
    if (winW > maxW || winH > maxH) {
      const scaleW = maxW / winW;
      const scaleH = maxH / winH;
      const scale = Math.min(scaleW, scaleH);
      winW = Math.floor(winW * scale);
      winH = Math.floor(winH * scale);
    }
    
    // Ensure minimum size
    winW = Math.max(480, winW);
    winH = Math.max(270, winH);
    
    const features = `width=${winW},height=${winH},resizable=yes,scrollbars=no,status=no,location=no`;
    
    // Create HTML content for the mirror window
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>sonomika - Mirror</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
            background: #000;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
          }
          canvas {
            width: 100%;
            height: 100%;
            object-fit: contain;
            image-rendering: auto;
          }
          /* Hide any UI in mirror window */
          .mirror-info { display: none; }
          .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-size: 16px;
            opacity: 0.7;
          }
        </style>
      </head>
      <body>
        <div class="loading">Loading mirror...</div>
        <canvas id="mirror-canvas"></canvas>
        <script>
          // Ensure the page is properly loaded
          document.addEventListener('DOMContentLoaded', function() {
            console.log('Mirror window loaded successfully');
            document.title = 'sonomika - Mirror';
            
            // Hide loading message once canvas is ready
            const canvas = document.getElementById('mirror-canvas');
            if (canvas) {
              const loading = document.querySelector('.loading');
              if (loading) loading.style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `;

    // Create blob URL instead of data URL to avoid browser security restrictions
    const blob = new Blob([htmlContent], { type: 'text/html' });
    this.blobUrl = URL.createObjectURL(blob);
    const streamWindow = window.open(this.blobUrl, 'mirror_window', features);

    if (!streamWindow) {
      throw new Error('Failed to open mirror window');
    }

    // Wait for the window to load and DOM to be ready
    await new Promise(resolve => {
      if (streamWindow.document.readyState === 'complete') {
        resolve(true);
      } else {
        streamWindow.addEventListener('load', resolve, { once: true });
      }
    });

    // Wait a bit more for DOM elements to be fully available
    await new Promise(resolve => setTimeout(resolve, 100));

    // Cache refs for drawing in web environment
    this.browserWindow = streamWindow;
    this.mirrorCanvas = streamWindow.document.getElementById('mirror-canvas') as HTMLCanvasElement | null;
    this.mirrorCtx = this.mirrorCanvas ? this.mirrorCanvas.getContext('2d') : null;

    // Log for debugging
    console.log('Mirror window canvas found:', !!this.mirrorCanvas);
    console.log('Mirror window context found:', !!this.mirrorCtx);

    // Sync backing store size with viewport for crisp rendering
    const resizeMirrorCanvas = () => {
      if (!this.browserWindow || !this.mirrorCanvas) return;
      const dpr = this.browserWindow.devicePixelRatio || 1;
      const width = Math.floor(this.browserWindow.innerWidth * dpr);
      const height = Math.floor(this.browserWindow.innerHeight * dpr);
      if (this.mirrorCanvas.width !== width || this.mirrorCanvas.height !== height) {
        this.mirrorCanvas.width = width;
        this.mirrorCanvas.height = height;
        console.log('Mirror canvas resized to:', width, 'x', height);
      }
    };

    resizeMirrorCanvas();
    this.browserWindow.addEventListener('resize', resizeMirrorCanvas);
    // Resize on fullscreen transitions as well
    ['fullscreenchange','webkitfullscreenchange','msfullscreenchange'].forEach(evt => {
      try { this.browserWindow!.document.addEventListener(evt as any, () => setTimeout(resizeMirrorCanvas, 0)); } catch {}
    });
    this.browserWindow.addEventListener('beforeunload', () => {
      this.closeMirrorWindow();
    });

    // Toggle fullscreen on double-click (enter only; exit via Esc/F11/Chrome UI)
    try {
      const docAny: any = this.browserWindow.document;
      const target: any = this.mirrorCanvas || this.browserWindow.document.documentElement;
      const requestFs = (target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen)?.bind(target);
      (this.mirrorCanvas || this.browserWindow.document.body).addEventListener('dblclick', () => {
        try {
          const isFs = docAny.fullscreenElement || docAny.webkitFullscreenElement || docAny.msFullscreenElement;
          if (!isFs && requestFs) requestFs();
        } catch {}
      });
    } catch {}

    this.isWindowOpen = true;
    // Start streaming frames to the browser window
    this.startCanvasCapture();
  }

  private startCanvasCapture(): void {
    if (!this.canvas) {
      return;
    }

    // Set mirror background to match composition
    try {
      const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
      const electronAny: any = (window as any).electron;
      if (electronAny && typeof electronAny.setMirrorBackground === 'function') {
        electronAny.setMirrorBackground(bg);
      }
    } catch {}

    let lastFrameTime = 0;
    const mq = (useStore.getState() as any).mirrorQuality || 'medium';
    const targetFPS = mq === 'low' ? 30 : 60;
    const frameInterval = 1000 / targetFPS;
    let lastDataUrl = '';

    // Use global rAF for stability across window state changes
    const raf = requestAnimationFrame;
    const caf = cancelAnimationFrame;

    const captureFrame = () => {
      const now = performance.now();
      
      if ((now - lastFrameTime) >= frameInterval) {
        // Ensure we have a valid, non-zero canvas reference
        try {
          const needsReplacement = !this.canvas || !this.canvas.isConnected || this.canvas.width === 0 || this.canvas.height === 0;
          if (needsReplacement) {
            const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
            console.log('Available canvases:', canvases.map(c => ({ id: c.id, width: c.width, height: c.height, connected: c.isConnected })));
            const replacement = canvases.find(c => c.id !== 'dummy-mirror-canvas' && c.width > 0 && c.height > 0);
            if (replacement) {
              console.log('Replacing canvas with:', replacement.id, replacement.width, 'x', replacement.height);
              this.canvas = replacement;
            } else {
              console.log('No replacement canvas found, using current canvas:', this.canvas?.id, this.canvas?.width, 'x', this.canvas?.height);
            }
          }
        } catch (e) {
          console.warn('Canvas replacement error:', e);
        }

        // Check if canvas has content
        if (this.canvas && this.canvas.width > 0 && this.canvas.height > 0) {
          // Debug: log canvas state occasionally
          if (Math.random() < 0.01) {
            console.log('Canvas streaming state:', {
              canvasId: this.canvas.id,
              canvasSize: `${this.canvas.width}x${this.canvas.height}`,
              hasElectron: !!(window.electron && window.electron.sendCanvasData),
              hasBrowserWindow: !!(this.browserWindow && !this.browserWindow.closed),
              hasMirrorCtx: !!this.mirrorCtx,
              hasMirrorCanvas: !!this.mirrorCanvas
            });
          }
          try {
            if (window.electron && window.electron.sendCanvasData) {
              // Electron path: composite to (at least) a supersampled size and send as JPEG data URL
              const comp = (useStore.getState() as any).compositionSettings || {};
              const compW = Math.max(1, Number(comp.width) || 1920);
              const compH = Math.max(1, Number(comp.height) || 1080);
              // Determine render target by mirror quality
              const minLongestEdge = mq === 'low' ? 540 : (mq === 'medium' ? 720 : 1080);
              const longest = Math.max(compW, compH);
              const upscale = longest < minLongestEdge ? (minLongestEdge / longest) : 1;
              const targetWidth = Math.max(1, Math.round(compW * upscale));
              const targetHeight = Math.max(1, Math.round(compH * upscale));
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = targetWidth;
              tempCanvas.height = targetHeight;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
                // Fill background
                tempCtx.fillStyle = bg;
                tempCtx.fillRect(0, 0, targetWidth, targetHeight);
                // Draw original canvas preserving aspect ratio (contain)
                const srcW = this.canvas!.width;
                const srcH = this.canvas!.height;
                const scale = Math.min(targetWidth / srcW, targetHeight / srcH);
                const drawW = Math.floor(srcW * scale);
                const drawH = Math.floor(srcH * scale);
                const dx = Math.floor((targetWidth - drawW) / 2);
                const dy = Math.floor((targetHeight - drawH) / 2);
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = (mq === 'low' ? 'low' : (mq === 'medium' ? 'medium' : 'high')) as any;
                tempCtx.drawImage(this.canvas!, dx, dy, drawW, drawH);
                // Use a slightly higher quality for fewer artifacts at scale
                const jpegQ = mq === 'low' ? 0.6 : (mq === 'medium' ? 0.85 : 0.95);
                const dataUrl = tempCanvas.toDataURL('image/jpeg', jpegQ);
                if (dataUrl !== lastDataUrl && dataUrl.length > 100) {
                  window.electron.sendCanvasData(dataUrl);
                  lastDataUrl = dataUrl;
                }
              }
            } else if (this.browserWindow && !this.browserWindow.closed && this.mirrorCtx && this.mirrorCanvas) {
              // Web path: draw directly to the mirror window canvas, preserving aspect ratio (contain)
              const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
              const destW = this.mirrorCanvas.width;
              const destH = this.mirrorCanvas.height;

              // Clear with background
              this.mirrorCtx.save();
              this.mirrorCtx.fillStyle = bg;
              this.mirrorCtx.fillRect(0, 0, destW, destH);

              const srcW = this.canvas.width;
              const srcH = this.canvas.height;
              // Use contain scaling to fit entire canvas within window while maintaining aspect ratio
              const scale = Math.min(destW / srcW, destH / srcH);
              const drawW = Math.floor(srcW * scale);
              const drawH = Math.floor(srcH * scale);
              const dx = Math.floor((destW - drawW) / 2);
              const dy = Math.floor((destH - drawH) / 2);

              // Favor speed to avoid potential throttling during fullscreen transitions
              this.mirrorCtx.imageSmoothingEnabled = true;
              try { (this.mirrorCtx as any).imageSmoothingQuality = (mq === 'low' ? 'low' : (mq === 'medium' ? 'medium' : 'high')); } catch {}
              this.mirrorCtx.drawImage(this.canvas, dx, dy, drawW, drawH);
              this.mirrorCtx.restore();
              
              // Debug logging (only log occasionally to avoid spam)
              if (Math.random() < 0.01) { // Log ~1% of frames
                console.log('Canvas streaming to mirror:', { srcW, srcH, destW, destH, drawW, drawH, dx, dy });
              }
            } else {
              // Browser mirror closed: stop streaming
              if (this.browserWindow && this.browserWindow.closed) {
                this.closeMirrorWindow();
              }
            }
          } catch (error) {
            // Silently handle canvas capture errors
            console.warn('Canvas capture error:', error);
          }
        }
        
        lastFrameTime = now;
      }
      
      this.animationId = raf(captureFrame);
    };

    captureFrame();
  }

  closeMirrorWindow(): void {
    if (this.animationId) {
      // Try to cancel on the appropriate window context
      try {
        if (this.browserWindow) {
          this.browserWindow.cancelAnimationFrame(this.animationId);
        } else {
          cancelAnimationFrame(this.animationId);
        }
      } catch {
        try { cancelAnimationFrame(this.animationId); } catch {}
      }
      this.animationId = null;
    }
    
    if (window.electron && window.electron.closeMirrorWindow) {
      window.electron.closeMirrorWindow();
    }

    if (this.browserWindow && !this.browserWindow.closed) {
      try { this.browserWindow.close(); } catch {}
    }
    
    // Clean up blob URL
    if (this.blobUrl) {
      try { URL.revokeObjectURL(this.blobUrl); } catch {}
      this.blobUrl = null;
    }
    
    this.browserWindow = null;
    this.mirrorCanvas = null;
    this.mirrorCtx = null;
    this.isWindowOpen = false;
  }

  isMirrorWindowOpen(): boolean {
    return this.isWindowOpen;
  }
}