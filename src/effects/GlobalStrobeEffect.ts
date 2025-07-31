import { BaseEffect, EffectMetadata } from './BaseEffect';

export class GlobalStrobeEffect extends BaseEffect {
  private strobeFrequency = 10; // Hz
  private strobeIntensity = 0.5; // 0-1
  private strobeColor = [255, 255, 255]; // White strobe
  private strobeMode = 'flash'; // 'flash', 'color', 'invert'
  private performanceMode = 'medium'; // 'high', 'medium', 'low'
  private lastStrobeTime = 0;
  private lastStrobeState = false;
  private frameSkipCounter = 0;
  private frameSkipThreshold = 1; // Start with no frame skipping for smooth video
  private lastProcessTime = 0;
  private minProcessInterval = 16; // Minimum 16ms between processing (60fps)
  private hasStarted = false; // Track if strobe has started to avoid initial flash
  private startTime = 0; // Track when strobe effect was first applied

  constructor(width: number, height: number) {
    super(width, height);
  }

  getMetadata(): EffectMetadata {
    return {
      name: 'Global Strobe',
      description: 'Applies strobing/flashing effect to the entire composition',
      parameters: [
        {
          name: 'strobeFrequency',
          type: 'number',
          min: 1,
          max: 60,
          step: 1,
          default: 10
        },
        {
          name: 'strobeIntensity',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          default: 0.5
        },
        {
          name: 'strobeColor',
          type: 'color',
          default: '#ffffff'
        },
        {
          name: 'strobeMode',
          type: 'select',
          options: ['flash', 'color', 'invert'],
          default: 'flash'
        },
        {
          name: 'performanceMode',
          type: 'select',
          options: ['high', 'medium', 'low'],
          default: 'medium'
        }
      ]
    };
  }

  setParameter(name: string, value: number | boolean | string): void {
    super.setParameter(name, value);
    
    switch (name) {
      case 'strobeFrequency':
        this.strobeFrequency = value as number;
        break;
      case 'strobeIntensity':
        this.strobeIntensity = value as number;
        break;
      case 'strobeColor':
        if (typeof value === 'string') {
          // Convert hex color to RGB
          const hex = value.replace('#', '');
          this.strobeColor = [
            parseInt(hex.substr(0, 2), 16),
            parseInt(hex.substr(2, 2), 16),
            parseInt(hex.substr(4, 2), 16)
          ];
        }
        break;
      case 'strobeMode':
        this.strobeMode = value as string;
        break;
      case 'performanceMode':
        this.performanceMode = value as string;
        // Adjust frame skip threshold based on performance mode
        switch (value) {
          case 'high':
            this.minProcessInterval = 33; // ~30fps
            break;
          case 'medium':
            this.minProcessInterval = 16; // ~60fps
            break;
          case 'low':
            this.minProcessInterval = 8; // ~120fps
            break;
        }
        break;
    }
  }

  processCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    if (!ctx) {
      console.error('🎬 No canvas context provided');
      return;
    }

    // Zero-latency strobe effect - no canvas modifications
    const currentTime = performance.now();
    
    // Skip first frame to avoid initial flash
    if (!this.hasStarted) {
      this.hasStarted = true;
      this.startTime = currentTime;
      return; // Don't apply strobe on first frame
    }
    
    const strobePeriod = 1000 / this.strobeFrequency; // Convert Hz to milliseconds
    const timeInPeriod = (currentTime % strobePeriod) / strobePeriod;
    
    // Calculate strobe intensity based on time
    const strobeActive = timeInPeriod < this.strobeIntensity;
    
    // Only apply strobe when active - use zero-latency overlay
    if (strobeActive) {
      // Apply strobe effect as a pure overlay - no canvas modifications
      // This preserves video playback timing completely
      switch (this.strobeMode) {
        case 'flash':
          this.applyZeroLatencyFlashStrobe(ctx, canvas.width, canvas.height);
          break;
        case 'color':
          this.applyZeroLatencyColorStrobe(ctx, canvas.width, canvas.height);
          break;
        case 'invert':
          this.applyZeroLatencyInvertStrobe(ctx, canvas.width, canvas.height);
          break;
      }
    }
  }

  private applyFlashStrobe(data: Uint8ClampedArray, width: number, height: number): void {
    // Flash effect - brighten the entire image
    const flashIntensity = 0.3;
    const dataLength = data.length;
    
    // Optimized loop with pre-calculated values
    for (let i = 0; i < dataLength; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      data[i] = Math.min(255, r + (255 - r) * flashIntensity);     // Red
      data[i + 1] = Math.min(255, g + (255 - g) * flashIntensity); // Green
      data[i + 2] = Math.min(255, b + (255 - b) * flashIntensity); // Blue
    }
  }

  private applyColorStrobe(data: Uint8ClampedArray, width: number, height: number): void {
    // Color strobe - overlay with strobe color
    const [r, g, b] = this.strobeColor;
    const colorIntensity = 0.4;
    const dataLength = data.length;
    
    // Pre-calculate color values
    const rIntensity = r * colorIntensity;
    const gIntensity = g * colorIntensity;
    const bIntensity = b * colorIntensity;
    
    for (let i = 0; i < dataLength; i += 4) {
      data[i] = Math.min(255, data[i] + rIntensity);     // Red
      data[i + 1] = Math.min(255, data[i + 1] + gIntensity); // Green
      data[i + 2] = Math.min(255, data[i + 2] + bIntensity); // Blue
    }
  }

  private applyInvertStrobe(data: Uint8ClampedArray, width: number, height: number): void {
    // Invert strobe - invert colors
    const dataLength = data.length;
    
    for (let i = 0; i < dataLength; i += 4) {
      data[i] = 255 - data[i];         // Red
      data[i + 1] = 255 - data[i + 1]; // Green
      data[i + 2] = 255 - data[i + 2]; // Blue
    }
  }

  // Zero-latency strobe methods - pure overlay rendering
  private applyZeroLatencyFlashStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Pure overlay rendering - no canvas modifications
    // This preserves video playback timing completely
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyZeroLatencyColorStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Pure overlay rendering with strobe color
    const [r, g, b] = this.strobeColor;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyZeroLatencyInvertStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Pure overlay rendering for invert effect
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Video-optimized strobe methods - no context state changes
  private applyVideoOptimizedFlashStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use direct pixel manipulation to avoid context state changes
    // This preserves video playback timing by not modifying context state
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Apply flash effect directly to pixels
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] + 76);     // Red + 30%
      data[i + 1] = Math.min(255, data[i + 1] + 76); // Green + 30%
      data[i + 2] = Math.min(255, data[i + 2] + 76); // Blue + 30%
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  private applyVideoOptimizedColorStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use direct pixel manipulation with strobe color
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const [r, g, b] = this.strobeColor;
    
    // Apply color strobe directly to pixels
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] + r * 0.4);     // Red + strobe color
      data[i + 1] = Math.min(255, data[i + 1] + g * 0.4); // Green + strobe color
      data[i + 2] = Math.min(255, data[i + 2] + b * 0.4); // Blue + strobe color
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  private applyVideoOptimizedInvertStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use direct pixel manipulation for invert effect
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Apply invert effect directly to pixels
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];         // Red invert
      data[i + 1] = 255 - data[i + 1]; // Green invert
      data[i + 2] = 255 - data[i + 2]; // Blue invert
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  // Seamless strobe methods that don't modify context state
  private applySeamlessFlashStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use seamless compositing without changing context state
    const originalComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = originalComposite;
  }

  private applySeamlessColorStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use seamless compositing with strobe color
    const originalComposite = ctx.globalCompositeOperation;
    const [r, g, b] = this.strobeColor;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = originalComposite;
  }

  private applySeamlessInvertStrobe(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use seamless compositing for invert effect
    const originalComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = originalComposite;
  }

  // More efficient strobe methods that avoid getImageData/putImageData
  private applyFlashStrobeEfficient(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use canvas compositing instead of pixel manipulation
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  private applyColorStrobeEfficient(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use canvas compositing with strobe color
    const [r, g, b] = this.strobeColor;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  private applyInvertStrobeEfficient(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Use canvas compositing for invert effect
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  render(deltaTime: number): void {
    // This effect is applied to the canvas directly via processCanvas
    // No additional rendering needed here
  }
} 