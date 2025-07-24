import { BaseEffect, EffectMetadata } from './BaseEffect';

export class GlobalDatamoshEffect extends BaseEffect {
  private previousFrames: ImageData[] = [];
  private maxFrames = 5;
  private blockSize = 32;
  private glitchIntensity = 0.1;
  private temporalOffset = 0;
  private spatialOffset = 0;
  private colorShift = 0;

  constructor(width: number, height: number) {
    super(width, height);
  }

  getMetadata(): EffectMetadata {
    return {
      name: 'Global Datamosh',
      description: 'Applies datamosh effect to the entire composition',
      parameters: [
        {
          name: 'glitchIntensity',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.1
        },
        {
          name: 'blockSize',
          type: 'number',
          min: 8,
          max: 64,
          step: 4,
          default: 32
        },
        {
          name: 'temporalOffset',
          type: 'number',
          min: 0,
          max: 10,
          step: 1,
          default: 0
        },
        {
          name: 'spatialOffset',
          type: 'number',
          min: 0,
          max: 50,
          step: 1,
          default: 0
        },
        {
          name: 'colorShift',
          type: 'number',
          min: 0,
          max: 50,
          step: 1,
          default: 0
        }
      ]
    };
  }

  setParameter(name: string, value: number | boolean | string): void {
    super.setParameter(name, value);
    
    // Update local properties for direct access
    switch (name) {
      case 'glitchIntensity':
        this.glitchIntensity = value as number;
        break;
      case 'blockSize':
        this.blockSize = value as number;
        break;
      case 'temporalOffset':
        this.temporalOffset = value as number;
        break;
      case 'spatialOffset':
        this.spatialOffset = value as number;
        break;
      case 'colorShift':
        this.colorShift = value as number;
        break;
    }
  }

  processCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    if (!ctx) {
      console.error('🎬 No canvas context provided');
      return;
    }

    console.log('🎬 GlobalDatamoshEffect.processCanvas called');

    const width = canvas.width;
    const height = canvas.height;

    console.log('🎬 Canvas dimensions:', width, 'x', height);

    // Capture current frame
    const currentFrame = ctx.getImageData(0, 0, width, height);
    console.log('🎬 Captured current frame');
    
    // Add to frame history
    this.previousFrames.push(currentFrame);
    if (this.previousFrames.length > this.maxFrames) {
      this.previousFrames.shift();
    }

    console.log('🎬 Frame history length:', this.previousFrames.length);

    // Only process if we have previous frames
    if (this.previousFrames.length < 2) {
      console.log('🎬 Not enough frames yet, waiting...');
      return;
    }

    // Create a temporary canvas for processing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error('🎬 Failed to get temp canvas context');
      return;
    }

    tempCanvas.width = width;
    tempCanvas.height = height;

    // Draw the current frame to temp canvas
    tempCtx.putImageData(currentFrame, 0, 0);
    console.log('🎬 Drew current frame to temp canvas');

    // Apply datamosh effect
    this.applyDatamosh(tempCtx, width, height);
    console.log('🎬 Applied datamosh effect to temp canvas');

    // Copy the processed result back to the original canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0);
    
    console.log('🎬 Datamosh effect applied successfully');
  }

  private applyDatamosh(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    console.log('🎬 applyDatamosh called with params:', {
      glitchIntensity: this.glitchIntensity,
      blockSize: this.blockSize,
      temporalOffset: this.temporalOffset,
      spatialOffset: this.spatialOffset,
      colorShift: this.colorShift
    });

    const blocksX = Math.floor(width / this.blockSize);
    const blocksY = Math.floor(height / this.blockSize);

    console.log('🎬 Processing blocks:', blocksX, 'x', blocksY);

    // Get a random previous frame for temporal borrowing
    const randomFrameIndex = Math.floor(Math.random() * this.previousFrames.length);
    const previousFrame = this.previousFrames[randomFrameIndex];
    console.log('🎬 Using previous frame at index:', randomFrameIndex);

    // Create temporary canvas for the previous frame
    const prevCanvas = document.createElement('canvas');
    const prevCtx = prevCanvas.getContext('2d');
    if (!prevCtx) {
      console.error('🎬 Failed to get previous frame canvas context');
      return;
    }

    prevCanvas.width = width;
    prevCanvas.height = height;
    prevCtx.putImageData(previousFrame, 0, 0);
    console.log('🎬 Set up previous frame canvas');

    let blocksProcessed = 0;
    let blocksApplied = 0;

    // Process each block
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        blocksProcessed++;
        
        // Random chance to apply datamosh to this block
        if (Math.random() < this.glitchIntensity) {
          blocksApplied++;
          const sourceX = bx * this.blockSize;
          const sourceY = by * this.blockSize;
          
          // Calculate offset for spatial borrowing
          const offsetX = Math.floor(Math.random() * this.spatialOffset) - this.spatialOffset / 2;
          const offsetY = Math.floor(Math.random() * this.temporalOffset);
          
          const targetX = sourceX + offsetX;
          const targetY = sourceY + offsetY;

          // Ensure coordinates are within bounds
          if (targetX >= 0 && targetX + this.blockSize <= width &&
              targetY >= 0 && targetY + this.blockSize <= height) {
            
            // Copy block from previous frame with color shift
            const blockData = prevCtx.getImageData(targetX, targetY, this.blockSize, this.blockSize);
            
            // Apply color channel shift
            if (this.colorShift > 0) {
              const data = blockData.data;
              for (let i = 0; i < data.length; i += 4) {
                // Shift red channel
                if (i + this.colorShift * 4 < data.length) {
                  data[i] = data[i + this.colorShift * 4] || data[i];
                }
                // Shift blue channel
                if (i + 2 + this.colorShift * 4 < data.length) {
                  data[i + 2] = data[i + 2 + this.colorShift * 4] || data[i + 2];
                }
              }
            }

            // Draw the block with some transparency for trail effect
            ctx.globalAlpha = 0.8;
            ctx.putImageData(blockData, sourceX, sourceY);
            ctx.globalAlpha = 1.0;
          }
        }
      }
    }

    console.log('🎬 Datamosh processing complete. Blocks processed:', blocksProcessed, 'Blocks applied:', blocksApplied);
  }

  render(deltaTime: number): void {
    // This effect is applied to the canvas directly via processCanvas
    // No additional rendering needed here
  }
} 