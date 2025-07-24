import { BaseEffect, EffectMetadata } from './BaseEffect';

export class VideoGlitchBlocksEffect extends BaseEffect {
  private blockSize = 32;
  private glitchIntensity = 0.3;
  private colorShift = 5;
  private timeOffset = 0;
  private glitchBlocks: Array<{x: number, y: number, width: number, height: number, offsetX: number, offsetY: number}> = [];

  constructor(width: number, height: number) {
    super(width, height);
  }

  getMetadata(): EffectMetadata {
    return {
      name: 'Video Glitch Blocks',
      description: 'Creates random glitch blocks with color shifts',
      parameters: [
        {
          name: 'blockSize',
          type: 'number',
          min: 16,
          max: 64,
          step: 4,
          default: 32
        },
        {
          name: 'glitchIntensity',
          type: 'number',
          min: 0.1,
          max: 0.8,
          step: 0.05,
          default: 0.3
        },
        {
          name: 'colorShift',
          type: 'number',
          min: 0,
          max: 20,
          step: 1,
          default: 5
        }
      ]
    };
  }

  setParameter(name: string, value: number | boolean | string): void {
    super.setParameter(name, value);
    
    switch (name) {
      case 'blockSize':
        this.blockSize = value as number;
        break;
      case 'glitchIntensity':
        this.glitchIntensity = value as number;
        break;
      case 'colorShift':
        this.colorShift = value as number;
        break;
    }
  }

  processCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    if (!ctx) return;

    console.log('🎬 VideoGlitchBlocksEffect.processCanvas called');

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

    // Apply glitch blocks effect
    this.applyGlitchBlocks(tempCtx, width, height);

    // Copy the processed result back to the original canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0);
    
    console.log('🎬 Video glitch blocks effect applied successfully');
  }

  private applyGlitchBlocks(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    console.log('🎬 applyGlitchBlocks called with params:', {
      blockSize: this.blockSize,
      glitchIntensity: this.glitchIntensity,
      colorShift: this.colorShift
    });

    const blocksX = Math.floor(width / this.blockSize);
    const blocksY = Math.floor(height / this.blockSize);
    let blocksApplied = 0;

    // Update glitch blocks every few frames
    if (Math.random() < 0.1) {
      this.glitchBlocks = [];
      
      // Create random glitch blocks
      for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
          if (Math.random() < this.glitchIntensity) {
            const x = bx * this.blockSize;
            const y = by * this.blockSize;
            const blockWidth = this.blockSize + Math.random() * 20;
            const blockHeight = this.blockSize + Math.random() * 20;
            const offsetX = (Math.random() - 0.5) * 50;
            const offsetY = (Math.random() - 0.5) * 30;
            
            this.glitchBlocks.push({
              x, y, width: blockWidth, height: blockHeight, offsetX, offsetY
            });
          }
        }
      }
    }

    // Apply glitch blocks
    this.glitchBlocks.forEach(block => {
      // Get the block data
      const blockData = ctx.getImageData(block.x, block.y, block.width, block.height);
      
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

      // Clear the original block area
      ctx.clearRect(block.x, block.y, block.width, block.height);
      
      // Draw the block with offset
      ctx.putImageData(blockData, block.x + block.offsetX, block.y + block.offsetY);
      
      blocksApplied++;
    });

    // Update time offset for animation
    this.timeOffset += 0.05;

    console.log('🎬 Glitch blocks processing complete. Blocks applied:', blocksApplied);
  }

  render(deltaTime: number): void {
    // This effect is applied to the canvas directly via processCanvas
  }
} 