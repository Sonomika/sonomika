import { useStore } from '../store/store';

export class CanvasStreamManager {
  private canvas: HTMLCanvasElement | null = null;
  private isWindowOpen: boolean = false;
  private animationId: number | null = null;
  private browserWindow: Window | null = null;
  private mirrorCanvas: HTMLCanvasElement | null = null;
  private mirrorCtx: CanvasRenderingContext2D | null = null;

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
    const streamWindow = window.open(
      '',
      'mirror_window',
      'width=1280,height=720,resizable=yes,scrollbars=no,status=no,location=no'
    );

    if (!streamWindow) {
      throw new Error('Failed to open mirror window');
    }

    // Create HTML content for the mirror window
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>VJ Mirror Output</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            overflow: hidden;
          }
          canvas {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          /* Hide any UI in mirror window */
          .mirror-info { display: none; }
        </style>
      </head>
      <body>
        <canvas id="mirror-canvas"></canvas>
      </body>
      </html>
    `;

    // Write content to the new window (stays same-origin for scripting)
    streamWindow.document.write(htmlContent);
    streamWindow.document.close();

    // Wait for the window to load
    await new Promise(resolve => {
      if (streamWindow.document.readyState === 'complete') {
        resolve(true);
      } else {
        streamWindow.addEventListener('load', resolve, { once: true });
      }
    });

    // Replace about:blank with a friendlier same-origin path without reloading
    try {
      streamWindow.document.title = 'VJ Mirror Output';
      const desiredPath = '/mirror';
      const currentUrl = new URL(streamWindow.location.href);
      if (currentUrl.pathname !== desiredPath) {
        streamWindow.history.replaceState({}, 'VJ Mirror Output', desiredPath);
      }
    } catch {}

    // Cache refs for drawing in web environment
    this.browserWindow = streamWindow;
    this.mirrorCanvas = streamWindow.document.getElementById('mirror-canvas') as HTMLCanvasElement | null;
    this.mirrorCtx = this.mirrorCanvas ? this.mirrorCanvas.getContext('2d') : null;

    // Sync backing store size with viewport for crisp rendering
    const resizeMirrorCanvas = () => {
      if (!this.browserWindow || !this.mirrorCanvas) return;
      const dpr = this.browserWindow.devicePixelRatio || 1;
      const width = Math.floor(this.browserWindow.innerWidth * dpr);
      const height = Math.floor(this.browserWindow.innerHeight * dpr);
      if (this.mirrorCanvas.width !== width || this.mirrorCanvas.height !== height) {
        this.mirrorCanvas.width = width;
        this.mirrorCanvas.height = height;
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
    const targetFPS = 60; // Match main preview window at 60 FPS
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
            const replacement = canvases.find(c => c.id !== 'dummy-mirror-canvas' && c.width > 0 && c.height > 0);
            if (replacement) {
              this.canvas = replacement;
            }
          }
        } catch {}

        // Check if canvas has content
        if (this.canvas && this.canvas.width > 0 && this.canvas.height > 0) {
          try {
            if (window.electron && window.electron.sendCanvasData) {
              // Electron path: composite to 1920x1080 and send as JPEG data URL
              const targetWidth = 1920;
              const targetHeight = 1080;
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = targetWidth;
              tempCanvas.height = targetHeight;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
                // Fill background
                tempCtx.fillStyle = bg;
                tempCtx.fillRect(0, 0, targetWidth, targetHeight);
                // Draw original canvas scaled to target
                tempCtx.drawImage(this.canvas!, 0, 0, targetWidth, targetHeight);
                const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
                if (dataUrl !== lastDataUrl && dataUrl.length > 100) {
                  window.electron.sendCanvasData(dataUrl);
                  lastDataUrl = dataUrl;
                }
              }
            } else if (this.browserWindow && !this.browserWindow.closed && this.mirrorCtx && this.mirrorCanvas) {
              // Web path: draw directly to the mirror window canvas, preserving aspect ratio (cover)
              const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
              const destW = this.mirrorCanvas.width;
              const destH = this.mirrorCanvas.height;

              // Clear with background
              this.mirrorCtx.save();
              this.mirrorCtx.fillStyle = bg;
              this.mirrorCtx.fillRect(0, 0, destW, destH);

              const srcW = this.canvas.width;
              const srcH = this.canvas.height;
              const scale = Math.max(destW / srcW, destH / srcH);
              const drawW = Math.floor(srcW * scale);
              const drawH = Math.floor(srcH * scale);
              const dx = Math.floor((destW - drawW) / 2);
              const dy = Math.floor((destH - drawH) / 2);

              // Favor speed to avoid potential throttling during fullscreen transitions
              this.mirrorCtx.imageSmoothingEnabled = false;
              this.mirrorCtx.drawImage(this.canvas, dx, dy, drawW, drawH);
              this.mirrorCtx.restore();
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
    this.browserWindow = null;
    this.mirrorCanvas = null;
    this.mirrorCtx = null;
    this.isWindowOpen = false;
  }

  isMirrorWindowOpen(): boolean {
    return this.isWindowOpen;
  }
}