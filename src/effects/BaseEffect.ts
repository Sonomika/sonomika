export interface EffectParameter {
  name: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean | string;
  options?: string[];
}

export interface EffectMetadata {
  name: string;
  description: string;
  parameters: EffectParameter[];
}

export abstract class BaseEffect {
  public readonly canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D | null;
  protected params: Record<string, number | boolean | string> = {};
  protected bpm: number = 120;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');

    if (!this.ctx) {
      throw new Error('Failed to get 2D context');
    }

    // Initialize parameters with default values
    const metadata = this.getMetadata();
    metadata.parameters.forEach(param => {
      this.params[param.name] = param.default;
    });
  }

  abstract getMetadata(): EffectMetadata;

  abstract render(deltaTime: number): void;

  setParameter(name: string, value: number | boolean | string): void {
    const metadata = this.getMetadata();
    const param = metadata.parameters.find(p => p.name === name);
    if (!param) return;

    // Validate and clamp number values
    if (param.type === 'number' && typeof value === 'number') {
      const min = param.min ?? 0;
      const max = param.max ?? 1;
      value = Math.max(min, Math.min(max, value));
    }

    // Validate select values
    if (param.type === 'select' && typeof value === 'string') {
      if (!param.options?.includes(value)) return;
    }

    this.params[name] = value;
  }

  getParameter(name: string): number | boolean | string | undefined {
    return this.params[name];
  }

  setBPM(bpm: number): void {
    this.bpm = bpm;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  cleanup(): void {
    // Override in subclasses if needed
  }
} 