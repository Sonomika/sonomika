export class CanvasStreamManager {
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private isWindowOpen: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async openMirrorWindow(): Promise<void> {
    try {
      // Get canvas stream
      this.stream = this.canvas!.captureStream(60); // 60 FPS

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
    // This method will be called to send the stream to the Electron window
    // For now, we'll use a simple approach - in a real implementation,
    // you might want to use a more sophisticated method like WebRTC or shared memory
    console.log('Stream ready to send to Electron window');
    
    // Note: In a full implementation, you would need to establish a connection
    // between the main window and mirror window to transfer the stream
    // This could be done via WebRTC, shared memory, or other methods
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