import { BaseEffect, EffectMetadata } from './BaseEffect';

export class VideoWaveSliceEffect extends BaseEffect {
  private waveAmplitude = 30;
  private waveFrequency = 0.02;
  private sliceHeight = 4;
  private timeOffset = 0;
  private colorShift = 3;

  constructor(width: number, height: number) {
    super(width, height);
  }

  getMetadata(): EffectMetadata {
    return {
      name: 'Video Wave Slice',
      description: 'Creates wave-like slicing distortion',
      parameters: [
        {
          name: 'waveAmplitude',
          type: 'number',
          min: 10,
          max: 100,
          step: 5,
          default: 30
        },
        {
          name: 'waveFrequency',
          type: 'number',
          min: 0.01,
          max: 0.1,
          step: 0.01,
          default: 0.02
        },
        {
          name: 'sliceHeight',
          type: 'number',
          min: 2,
          max: 10,
          step: 1,
          default: 4
        },
        {
          name: 'colorShift',
          type: 'number',
          min: 0,
          max: 10,
          step: 1,
          default: 3
        }
      ]
    };
  }

  setParameter(name: string, value: number | boolean | string): void {
    super.setParameter(name, value);
    
    switch (name) {
      case 'waveAmplitude':
        this.waveAmplitude = value as number;
        break;
      case 'waveFrequency':
        this.waveFrequency = value as number;
        break;
      case 'sliceHeight':
        this.sliceHeight = value as number;
        break;
      case 'colorShift':
        this.colorShift = value as number;
        break;
    }
  }

  processCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    if (!ctx) return;

    console.log('🎬 VideoWaveSliceEffect.processCanvas called');

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

    // Apply wave slice effect
    this.applyWaveSlice(tempCtx, width, height);

    // Copy the processed result back to the original canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0);
    
    console.log('🎬 Video wave slice effect applied successfully');
  }

  private applyWaveSlice(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    console.log('🎬 applyWaveSlice called with params:', {
      waveAmplitude: this.waveAmplitude,
      waveFrequency: this.waveFrequency,
      sliceHeight: this.sliceHeight,
      colorShift: this.colorShift
    });

    const slices = Math.floor(height / this.sliceHeight);
    let slicesApplied = 0;

    // Process each slice
    for (let i = 0; i < slices; i++) {
      const y = i * this.sliceHeight;
      
      // Calculate wave offset based on position and time
      const waveOffset = Math.sin(this.timeOffset + i * this.waveFrequency) * this.waveAmplitude;
      
      // Get the slice data
      const sliceData = ctx.getImageData(0, y, width, this.sliceHeight);
      
      // Apply color channel shift
      if (this.colorShift > 0) {
        const data = sliceData.data;
        for (let j = 0; j < data.length; j += 4) {
          // Shift red channel
          if (j + this.colorShift * 4 < data.length) {
            data[j] = data[j + this.colorShift * 4] || data[j];
          }
          // Shift blue channel
          if (j + 2 + this.colorShift * 4 < data.length) {
            data[j + 2] = data[j + 2 + this.colorShift * 4] || data[j + 2];
          }
        }
      }
      
      // Clear the original slice area
      ctx.clearRect(0, y, width, this.sliceHeight);
      
      // Draw the slice with wave offset
      ctx.putImageData(sliceData, waveOffset, y);
      
      slicesApplied++;
    }

    // Update time offset for animation
    this.timeOffset += 0.05;

    console.log('🎬 Wave slice processing complete. Slices applied:', slicesApplied);
  }

  render(deltaTime: number): void {
    // This effect is applied to the canvas directly via processCanvas
  }
} 