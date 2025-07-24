import { BaseEffect, EffectMetadata } from './BaseEffect';

export class VideoEncoder extends BaseEffect {
  private encoder: any;
  private decoder: any;
  private isWebCodecsReady: boolean = false;
  private speed: number = 2;
  private useKeyFrame: boolean = false;
  private videoElement: HTMLVideoElement | null = null;
  private frameCount: number = 0;

  getMetadata(): EffectMetadata {
    return {
      name: 'Video Encoder',
      description: 'Applies WebCodecs encoding/decoding to video with speed control',
      parameters: [
        {
          name: 'speed',
          type: 'number',
          min: 1,
          max: 10,
          step: 1,
          default: 2
        },
        {
          name: 'useKeyFrame',
          type: 'boolean',
          default: false
        },
        {
          name: 'codec',
          type: 'select',
          options: ['vp8', 'vp9', 'h264'],
          default: 'vp8'
        }
      ],
    };
  }

  async initialize(): Promise<void> {
    if (!this.canvas || !this.ctx) return;

    // Check if WebCodecs is supported
    if (!('VideoEncoder' in window) || !('VideoDecoder' in window)) {
      console.error('WebCodecs not supported in this browser');
      return;
    }

    try {
      await this.setupWebCodecs();
      this.isWebCodecsReady = true;
    } catch (error) {
      console.error('Failed to initialize WebCodecs:', error);
    }
  }

  private async setupWebCodecs(): Promise<void> {
    if (!this.canvas || !this.ctx) return;

    const { width, height } = this.canvas;
    const codec = this.params.codec as string || 'vp8';

    // Create encoder
    this.encoder = new (window as any).VideoEncoder({
      output: (chunk: any) => this.handleEncodedChunk(chunk),
      error: (err: any) => console.error("Encoder error:", err),
    });

    await this.encoder.configure({
      codec: codec,
      width: width,
      height: height,
    });

    // Create decoder
    this.decoder = new (window as any).VideoDecoder({
      output: (frame: any) => this.handleDecodedFrame(frame),
      error: (err: any) => console.error("Decoder error:", err),
    });

    await this.decoder.configure({
      codec: codec,
    });
  }

  private handleEncodedChunk(chunk: any): void {
    if (!this.decoder) return;

    if (chunk.type === "key") {
      this.decoder.decode(chunk);
    } else {
      const speed = this.params.speed as number || 2;
      for (let i = 0; i < speed; i++) {
        this.decoder.decode(chunk);
      }
    }
  }

  private handleDecodedFrame(frame: any): void {
    if (!this.ctx || !this.canvas) return;

    const { width, height } = this.canvas;

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw the decoded frame
    this.ctx.save();
    this.ctx.drawImage(frame, 0, 0, width, height);
    this.ctx.restore();

    frame.close();
  }

  render(deltaTime: number): void {
    if (!this.ctx || !this.canvas || !this.isWebCodecsReady) return;

    const { width, height } = this.canvas;

    // Create a video frame from the current canvas state
    try {
      // Get the current canvas as an image
      const imageData = this.ctx.getImageData(0, 0, width, height);
      
      // Create a temporary canvas to convert to video frame
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (tempCtx) {
        tempCtx.putImageData(imageData, 0, 0);
        
        // Create video frame from canvas
        const frame = new (window as any).VideoFrame(tempCanvas, {
          timestamp: this.frameCount * 1000000, // microseconds
        });

        // Encode the frame
        this.encoder.encode(frame, { 
          keyFrame: this.params.useKeyFrame as boolean || false 
        });
        
        frame.close();
        this.frameCount++;
      }
    } catch (error) {
      console.error('Error creating video frame:', error);
    }
  }

  setParameter(name: string, value: any): void {
    super.setParameter(name, value);
    
    // Update speed parameter
    if (name === 'speed') {
      this.speed = value;
    }
    
    // Update keyframe parameter
    if (name === 'useKeyFrame') {
      this.useKeyFrame = value;
    }
  }

  cleanup(): void {
    if (this.encoder) {
      this.encoder.close();
      this.encoder = null;
    }
    
    if (this.decoder) {
      this.decoder.close();
      this.decoder = null;
    }
    
    this.isWebCodecsReady = false;
    this.frameCount = 0;
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    
    // Reinitialize WebCodecs with new dimensions
    if (this.isWebCodecsReady) {
      this.cleanup();
      this.initialize();
    }
  }
} 