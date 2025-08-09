export class CanvasStreamManager {
  private canvas: HTMLCanvasElement | null = null;
  private isWindowOpen: boolean = false;
  private animationId: number | null = null;

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
            height: 100vh;
            overflow: hidden;
          }
          canvas {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          .mirror-info {
            position: absolute;
            top: 10px;
            left: 10px;
            color: #fff;
            font-family: monospace;
            font-size: 12px;
            background: rgba(0,0,0,0.7);
            padding: 5px 10px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="mirror-info">VJ Mirror Output</div>
        <canvas id="mirror-canvas"></canvas>
      </body>
      </html>
    `;

    // Write content to the new window
    streamWindow.document.write(htmlContent);
    streamWindow.document.close();

    // Wait for the window to load
    await new Promise(resolve => {
      if (streamWindow.document.readyState === 'complete') {
        resolve(true);
      } else {
        streamWindow.addEventListener('load', resolve);
      }
    });

    // Start streaming the canvas directly
    this.startCanvasCapture();
  }

  private startCanvasCapture(): void {
    if (!this.canvas || !window.electron) {
      return;
    }

    let lastFrameTime = 0;
    const targetFPS = 60; // Match main preview window at 60 FPS
    const frameInterval = 1000 / targetFPS;
    let lastDataUrl = '';

    const captureFrame = () => {
      const now = performance.now();
      
      if ((now - lastFrameTime) >= frameInterval) {
        // Check if canvas has content
        if (this.canvas!.width > 0 && this.canvas!.height > 0) {
          try {
            // Capture at full composition resolution (1920x1080)
            const originalWidth = this.canvas!.width;
            const originalHeight = this.canvas!.height;
            
            // Temporarily resize canvas to composition resolution if needed
            const targetWidth = 1920;
            const targetHeight = 1080;
            
            if (this.canvas!.width !== targetWidth || this.canvas!.height !== targetHeight) {
              // Create a temporary canvas for high-res capture
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = targetWidth;
              tempCanvas.height = targetHeight;
              const tempCtx = tempCanvas.getContext('2d');
              
              if (tempCtx) {
                // Draw the original canvas scaled to target resolution
                tempCtx.drawImage(this.canvas!, 0, 0, targetWidth, targetHeight);
                const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9); // Higher quality for mirror
                
                if (dataUrl !== lastDataUrl && dataUrl.length > 100) {
                  if (window.electron && window.electron.sendCanvasData) {
                    window.electron.sendCanvasData(dataUrl);
                    lastDataUrl = dataUrl;
                  }
                }
              }
            } else {
              // Canvas is already at target resolution
              const dataUrl = this.canvas!.toDataURL('image/jpeg', 0.9);
              
              if (dataUrl !== lastDataUrl && dataUrl.length > 100) {
                if (window.electron && window.electron.sendCanvasData) {
                  window.electron.sendCanvasData(dataUrl);
                  lastDataUrl = dataUrl;
                }
              }
            }
          } catch (error) {
            // Silently handle canvas capture errors
            console.warn('Canvas capture error:', error);
          }
        }
        
        lastFrameTime = now;
      }
      
      this.animationId = requestAnimationFrame(captureFrame);
    };

    captureFrame();
  }

  closeMirrorWindow(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    if (window.electron && window.electron.closeMirrorWindow) {
      window.electron.closeMirrorWindow();
      this.isWindowOpen = false;
    }
  }

  isMirrorWindowOpen(): boolean {
    return this.isWindowOpen;
  }
} 