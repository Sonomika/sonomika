import { BaseEffect, EffectMetadata } from './BaseEffect';

export class WebCodecsEffect extends BaseEffect {
  private encoder: any;
  private decoder: any;
  private isWebCodecsReady: boolean = false;
  private frameCount: number = 0;
  private lastFrame: ImageData | null = null;

  getMetadata(): EffectMetadata {
    return {
      name: 'WebCodecs Effect',
      description: 'Advanced video processing using WebCodecs API',
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
          name: 'glitchIntensity',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.1,
          default: 0.3
        },
        {
          name: 'codec',
          type: 'select',
          options: ['vp8', 'vp9'],
          default: 'vp8'
        }
      ],
    };
  }

  async initialize(): Promise<void> {
    if (!this.canvas || !this.ctx) return;

    // Check if WebCodecs is supported
    if (!('VideoEncoder' in window) || !('VideoDecoder' in window)) {
      console.warn('WebCodecs not supported, falling back to visual effect');
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

    const speed = this.params.speed as number || 2;
    
    if (chunk.type === "key") {
      this.decoder.decode(chunk);
    } else {
      // Apply speed multiplier
      for (let i = 0; i < speed; i++) {
        this.decoder.decode(chunk);
      }
    }
  }

  private handleDecodedFrame(frame: any): void {
    if (!this.ctx || !this.canvas) return;

    const { width, height } = this.canvas;
    const glitchIntensity = this.params.glitchIntensity as number || 0.3;

    // Apply glitch effect based on intensity
    this.ctx.save();
    
    // Random glitch offset
    if (Math.random() < glitchIntensity) {
      const offsetX = (Math.random() - 0.5) * 20 * glitchIntensity;
      const offsetY = (Math.random() - 0.5) * 15 * glitchIntensity;
      this.ctx.translate(offsetX, offsetY);
    }

    // Draw the decoded frame
    this.ctx.drawImage(frame, 0, 0, width, height);
    this.ctx.restore();

    frame.close();
  }

  render(deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { width, height } = this.canvas;
    const time = this.frameCount * deltaTime;

    if (this.isWebCodecsReady && this.encoder) {
      // Use WebCodecs for advanced processing
      try {
        // Create video frame from current canvas
        const imageData = this.ctx.getImageData(0, 0, width, height);
        
        // Create temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          
          // Create video frame
          const frame = new (window as any).VideoFrame(tempCanvas, {
            timestamp: this.frameCount * 1000000,
          });

          // Encode the frame
          this.encoder.encode(frame, { 
            keyFrame: this.frameCount % 30 === 0 // Keyframe every 30 frames
          });
          
          frame.close();
        }
      } catch (error) {
        console.error('Error in WebCodecs processing:', error);
        this.renderFallback(deltaTime);
      }
    } else {
      // Fallback visual effect
      this.renderFallback(deltaTime);
    }

    this.frameCount++;
  }

  private renderFallback(deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { width, height } = this.canvas;
    const time = this.frameCount * deltaTime;
    const glitchIntensity = this.params.glitchIntensity as number || 0.3;

    // Create a glitch-like visual effect
    this.ctx.save();
    
    // Apply random glitch effects
    if (Math.random() < glitchIntensity * 0.5) {
      // Random color shift
      this.ctx.filter = `hue-rotate(${Math.sin(time) * 30}deg)`;
    }

    if (Math.random() < glitchIntensity * 0.3) {
      // Random offset
      const offsetX = (Math.random() - 0.5) * 10 * glitchIntensity;
      const offsetY = (Math.random() - 0.5) * 8 * glitchIntensity;
      this.ctx.translate(offsetX, offsetY);
    }

    // Draw geometric patterns that simulate video artifacts
    this.ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + Math.sin(time * 2) * 0.05})`;
    
    // Draw multiple rectangles with different rotations
    for (let i = 0; i < 3; i++) {
      this.ctx.save();
      this.ctx.translate(
        width / 2 + Math.sin(time * 3 + i) * 20,
        height / 2 + Math.cos(time * 2 + i) * 15
      );
      this.ctx.rotate(time + i * 0.5);
      this.ctx.fillRect(-40, -40, 80, 80);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  setParameter(name: string, value: any): void {
    super.setParameter(name, value);
    
    // Reinitialize WebCodecs if codec changes
    if (name === 'codec' && this.isWebCodecsReady) {
      this.cleanup();
      this.initialize();
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
    this.lastFrame = null;
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