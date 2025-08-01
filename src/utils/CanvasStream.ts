export class CanvasStreamManager {
  private streamWindow: Window | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async openMirrorWindow(): Promise<void> {
    try {
      // Get canvas stream
      this.stream = this.canvas!.captureStream(60); // 60 FPS

      // Open new window
      this.streamWindow = window.open(
        '',
        'mirror_window',
        'width=1280,height=720,resizable=yes,scrollbars=no,status=no,location=no'
      );

      if (!this.streamWindow) {
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
      this.streamWindow.document.write(htmlContent);
      this.streamWindow.document.close();

      // Wait for the window to load
      await new Promise(resolve => {
        if (this.streamWindow!.document.readyState === 'complete') {
          resolve(true);
        } else {
          this.streamWindow!.addEventListener('load', resolve);
        }
      });

      // Set the video stream
      const video = this.streamWindow.document.getElementById('mirror-video') as HTMLVideoElement;
      video.srcObject = this.stream;

      console.log('Mirror window opened successfully');
    } catch (error) {
      console.error('Failed to open mirror window:', error);
      throw error;
    }
  }

  closeMirrorWindow(): void {
    if (this.streamWindow && !this.streamWindow.closed) {
      this.streamWindow.close();
      this.streamWindow = null;
    }
    this.stream = null;
  }

  isMirrorWindowOpen(): boolean {
    return this.streamWindow !== null && !this.streamWindow.closed;
  }
} 