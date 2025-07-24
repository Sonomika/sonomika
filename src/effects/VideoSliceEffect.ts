import { BaseEffect, EffectMetadata } from './BaseEffect';

export class VideoSliceEffect extends BaseEffect {
  private sliceHeight = 30;
  private offsetAmount = 80;
  private sliceCount = 0;
  private timeOffset = 0;

  constructor(width: number, height: number) {
    super(width, height);
  }

  getMetadata(): EffectMetadata {
    return {
      name: 'Video Slice',
      description: 'Slices video into horizontal strips with offset',
      parameters: [
        {
          name: 'sliceHeight',
          type: 'number',
          min: 5,
          max: 100,
          step: 1,
          default: 30
        },
        {
          name: 'offsetAmount',
          type: 'number',
          min: 0,
          max: 200,
          step: 1,
          default: 80
        },
        {
          name: 'sliceCount',
          type: 'number',
          min: 0,
          max: 20,
          step: 1,
          default: 0
        }
      ]
    };
  }

  setParameter(name: string, value: number | boolean | string): void {
    super.setParameter(name, value);
    
    switch (name) {
      case 'sliceHeight':
        this.sliceHeight = value as number;
        break;
      case 'offsetAmount':
        this.offsetAmount = value as number;
        break;
      case 'sliceCount':
        this.sliceCount = value as number;
        break;
    }
  }

  processCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    if (!ctx) return;

    console.log('🎬 VideoSliceEffect.processCanvas called');

    const width = canvas.width;
    const height = canvas.height;

    // Capture current frame
    const currentFrame = ctx.getImageData(0, 0, width, height);
    
    // Create temporary canvas for processing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCanvas.width = width;
    tempCanvas.height = height;

    // Draw the current frame to temp canvas
    tempCtx.putImageData(currentFrame, 0, 0);

    // Check if canvas has content
    const imageData = tempCtx.getImageData(0, 0, width, height);
    let hasContent = false;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i] !== 0 || imageData.data[i + 1] !== 0 || imageData.data[i + 2] !== 0) {
        hasContent = true;
        break;
      }
    }

    if (!hasContent) {
      console.log('🎬 Adding test pattern to empty canvas');
      // Create a more visible test pattern
      tempCtx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      tempCtx.fillRect(0, 0, width, height);
      tempCtx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      tempCtx.fillRect(width/4, height/4, width/2, height/2);
      tempCtx.fillStyle = 'rgba(0, 0, 255, 0.8)';
      tempCtx.fillRect(width/2, height/2, width/4, height/4);
      tempCtx.fillStyle = 'rgba(255, 255, 0, 0.8)';
      tempCtx.fillRect(0, height/2, width/4, height/4);
    }

    // Apply slice effect
    this.applySliceEffect(tempCtx, width, height);

    // Copy the processed result back to the original canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0);
    
    console.log('🎬 Video slice effect applied successfully');
  }

  private applySliceEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    console.log('🎬 applySliceEffect called with params:', {
      sliceHeight: this.sliceHeight,
      offsetAmount: this.offsetAmount,
      sliceCount: this.sliceCount
    });

    const slices = Math.floor(height / this.sliceHeight);
    let slicesApplied = 0;

    // Process each slice
    for (let i = 0; i < slices; i++) {
      const y = i * this.sliceHeight;
      
      // Skip some slices based on sliceCount parameter
      if (this.sliceCount > 0 && i % this.sliceCount !== 0) {
        continue;
      }

      // Calculate offset based on slice position and time
      const offsetX = Math.sin(this.timeOffset + i * 0.2) * this.offsetAmount;
      
      // Get the slice data
      const sliceData = ctx.getImageData(0, y, width, this.sliceHeight);
      
      // Clear the original slice area
      ctx.clearRect(0, y, width, this.sliceHeight);
      
      // Draw the slice with offset
      ctx.putImageData(sliceData, offsetX, y);
      
      slicesApplied++;
    }

    // Update time offset for animation
    this.timeOffset += 0.15;

    console.log('🎬 Slice processing complete. Slices applied:', slicesApplied);
  }

  render(deltaTime: number): void {
    // This effect is applied to the canvas directly via processCanvas
  }
} 