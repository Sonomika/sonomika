export class CanvasStreamManager {
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private isWindowOpen: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    console.log('CanvasStreamManager initialized with canvas:', {
      width: canvas.width,
      height: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
      devicePixelRatio: window.devicePixelRatio
    });
  }

  async openMirrorWindow(): Promise<void> {
    try {
      // Get canvas stream at higher quality
      this.stream = this.canvas!.captureStream(60); // 60 FPS for smooth video
      
      // Set the canvas stream to use the canvas's native resolution
      const tracks = this.stream.getVideoTracks();
      if (tracks.length > 0) {
        const track = tracks[0];
        const settings = track.getSettings();
        console.log('Canvas stream settings:', settings);
      }

      // Use Electron IPC to open mirror window
      if (window.electron && window.electron.openMirrorWindow) {
        window.electron.openMirrorWindow();
        this.isWindowOpen = true;
        
        // Wait a bit for the window to be created, then send the stream
        setTimeout(() => {
          this.sendStreamToWindow();
        }, 500);
        
        console.log('Mirror window opened via Electron');
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
          video {
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
        <video id="mirror-video" autoplay muted></video>
        <script>
          const video = document.getElementById('mirror-video');
          // The stream will be set by the parent window
        </script>
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

    // Set the video stream
    const video = streamWindow.document.getElementById('mirror-video') as HTMLVideoElement;
    video.srcObject = this.stream;
  }

  private sendStreamToWindow(): void {
    // Send the MediaStream to the Electron mirror window
    if (this.stream && window.electron && window.electron.sendCanvasData) {
      // Convert the MediaStream to a data URL for transfer
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const video = document.createElement('video');
      
      video.srcObject = this.stream;
      video.onloadedmetadata = () => {
        // Use 960x540 resolution (50% of 1920x1080) to match mirror window
        canvas.width = 960;
        canvas.height = 540;
        
        // Start capturing frames
        const captureFrame = () => {
          if (ctx && video.videoWidth > 0) {
            // Draw the video content scaled to 960x540
            ctx.drawImage(video, 0, 0, 960, 540);
            // Use higher quality JPEG (0.95 instead of 0.8)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            window.electron.sendCanvasData(dataUrl);
          }
          requestAnimationFrame(captureFrame);
        };
        
        video.play();
        captureFrame();
      };
      
      console.log('Stream ready to send to Electron window at 1920x1080 resolution');
    }
  }

  closeMirrorWindow(): void {
    if (window.electron && window.electron.closeMirrorWindow) {
      window.electron.closeMirrorWindow();
      this.isWindowOpen = false;
    }
    this.stream = null;
  }

  isMirrorWindowOpen(): boolean {
    return this.isWindowOpen;
  }
} 