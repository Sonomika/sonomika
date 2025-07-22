import { BaseEffect } from '../effects/BaseEffect';
import { CirclePulse } from '../effects/CirclePulse';
import { ColorPulse } from '../effects/ColorPulse';
import { TestEffect } from '../effects/TestEffect';
import { Waveform } from '../effects/Waveform';
import { ParticleSystem } from '../effects/ParticleSystem';
import { GeometricPattern } from '../effects/GeometricPattern';
import { AudioReactive } from '../effects/AudioReactive';
import { TransitionEffect } from '../effects/TransitionEffect';

type EffectConstructor = new (width: number, height: number) => BaseEffect;

export class EffectLoader {
  private static instance: EffectLoader;
  private effectRegistry: Map<string, EffectConstructor>;
  private effectInstances: Map<string, BaseEffect>;

  private constructor() {
    this.effectRegistry = new Map();
    this.effectInstances = new Map();

    // Register built-in effects
    this.registerEffect('CirclePulse', CirclePulse);
    this.registerEffect('ColorPulse', ColorPulse);
    this.registerEffect('TestEffect', TestEffect);
    this.registerEffect('Waveform', Waveform);
    this.registerEffect('ParticleSystem', ParticleSystem);
    this.registerEffect('GeometricPattern', GeometricPattern);
    this.registerEffect('AudioReactive', AudioReactive);
    this.registerEffect('TransitionEffect', TransitionEffect);
  }

  static getInstance(): EffectLoader {
    if (!EffectLoader.instance) {
      EffectLoader.instance = new EffectLoader();
    }
    return EffectLoader.instance;
  }

  registerEffect(name: string, effectClass: EffectConstructor): void {
    this.effectRegistry.set(name, effectClass);
  }

  createEffect(name: string, width: number, height: number): BaseEffect {
    const effectClass = this.effectRegistry.get(name);
    if (!effectClass) {
      throw new Error(`Effect "${name}" not found`);
    }

    const effect = new effectClass(width, height);
    const instanceId = `${name}_${Date.now()}`;
    this.effectInstances.set(instanceId, effect);
    return effect;
  }

  getEffect(instanceId: string): BaseEffect | undefined {
    return this.effectInstances.get(instanceId);
  }

  removeEffect(instanceId: string): void {
    const effect = this.effectInstances.get(instanceId);
    if (effect) {
      effect.cleanup();
      this.effectInstances.delete(instanceId);
    }
  }

  getAvailableEffects(): string[] {
    return Array.from(this.effectRegistry.keys());
  }
} 