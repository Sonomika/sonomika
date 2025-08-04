import { SelfContainedEffect } from './DynamicEffectLoader';

/**
 * Effect Discovery System
 * 
 * This system scans for effects in the effects folder and loads them dynamically.
 * Users can drop their custom effects into the effects folder and they will be
 * automatically discovered and loaded.
 */

export class EffectDiscovery {
  private static instance: EffectDiscovery;
  private discoveredEffects: Map<string, SelfContainedEffect> = new Map();

  private constructor() {}

  static getInstance(): EffectDiscovery {
    if (!EffectDiscovery.instance) {
      EffectDiscovery.instance = new EffectDiscovery();
    }
    return EffectDiscovery.instance;
  }

  /**
   * Discover effects in the effects folder
   * This would typically scan the filesystem, but for now we'll use a predefined list
   */
  async discoverEffects(): Promise<SelfContainedEffect[]> {
    const effects: SelfContainedEffect[] = [];

    // List of effect files to try loading
    const effectFiles = [
      '../effects/example/RainbowWaveEffect',
      // Add more effect files here as they're created
    ];

    for (const filePath of effectFiles) {
      try {
        const module = await import(filePath);
        if (module.exportEffect) {
          const effect = module.exportEffect();
          this.discoveredEffects.set(effect.id, effect);
          effects.push(effect);
          console.log(`Discovered effect: ${effect.name} (${effect.id})`);
        }
      } catch (error) {
        console.warn(`Could not load effect from ${filePath}:`, error);
      }
    }

    return effects;
  }

  /**
   * Get all discovered effects
   */
  getDiscoveredEffects(): SelfContainedEffect[] {
    return Array.from(this.discoveredEffects.values());
  }

  /**
   * Get a specific effect by ID
   */
  getEffect(id: string): SelfContainedEffect | undefined {
    return this.discoveredEffects.get(id);
  }

  /**
   * Get effects by category
   */
  getEffectsByCategory(category: string): SelfContainedEffect[] {
    return Array.from(this.discoveredEffects.values())
      .filter(effect => effect.category === category);
  }

  /**
   * Get all categories from discovered effects
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.discoveredEffects.forEach(effect => {
      categories.add(effect.category);
    });
    return Array.from(categories);
  }

  /**
   * Reload all effects (useful when new effects are added)
   */
  async reloadEffects(): Promise<void> {
    this.discoveredEffects.clear();
    await this.discoverEffects();
  }
}

/**
 * Helper function to create a self-contained effect
 * This makes it easier for users to create their own effects
 */
export function createSelfContainedEffect(
  id: string,
  name: string,
  description: string,
  category: string,
  icon: string,
  author: string,
  version: string,
  metadata: any,
  createEffect: (width: number, height: number) => any
): SelfContainedEffect {
  return {
    id,
    name,
    description,
    category,
    icon,
    author,
    version,
    metadata,
    createEffect
  };
} 