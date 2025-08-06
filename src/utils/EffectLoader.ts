import { BaseEffect } from '../effects/BaseEffect';
import { DynamicEffectLoader } from './DynamicEffectLoader';

type EffectConstructor = new (width: number, height: number) => BaseEffect;

export class EffectLoader {
  private static instance: EffectLoader;
  private effectRegistry: Map<string, EffectConstructor>;
  private effectInstances: Map<string, BaseEffect>;

  private constructor() {
    this.effectRegistry = new Map();
    this.effectInstances = new Map();
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
    // First try the new dynamic effect loader
    try {
      const dynamicLoader = DynamicEffectLoader.getInstance();
      const availableEffects = dynamicLoader.getAvailableEffects();
      
      // Check if the effect exists in the dynamic loader
      const effect = availableEffects.find(e => e.name === name || e.id === name);
      if (effect) {
        return dynamicLoader.createEffect(effect.id, width, height);
      }
    } catch (error) {
      console.warn('Dynamic effect loader failed, falling back to legacy:', error);
    }

    // Fall back to legacy effect system
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
    const effects = Array.from(this.effectRegistry.keys());
    
    // Add dynamic effects
    try {
      const dynamicLoader = DynamicEffectLoader.getInstance();
      const dynamicEffects = dynamicLoader.getAvailableEffects();
      dynamicEffects.forEach(effect => {
        effects.push(effect.name);
      });
    } catch (error) {
      console.warn('Could not get dynamic effects:', error);
    }
    
    return effects;
  }
} 