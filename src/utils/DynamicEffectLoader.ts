import { BaseEffect, EffectMetadata } from '../effects/BaseEffect';

// Interface for self-contained effects
export interface SelfContainedEffect {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  author?: string;
  version?: string;
  metadata: EffectMetadata;
  createEffect: (width: number, height: number) => BaseEffect;
}

// Effect manifest interface
export interface EffectManifest {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  author?: string;
  version?: string;
  entryPoint: string; // Path to the main effect file
  dependencies?: string[];
}

export class DynamicEffectLoader {
  private static instance: DynamicEffectLoader;
  private effectRegistry: Map<string, SelfContainedEffect> = new Map();
  private effectManifests: Map<string, EffectManifest> = new Map();

  private constructor() {
    this.loadBuiltInEffects();
  }

  static getInstance(): DynamicEffectLoader {
    if (!DynamicEffectLoader.instance) {
      DynamicEffectLoader.instance = new DynamicEffectLoader();
    }
    return DynamicEffectLoader.instance;
  }

  private loadBuiltInEffects(): void {
    // Load example effects
    try {
      // Import and register the example effect
      import('../effects/example/RainbowWaveEffect').then(module => {
        if (module.exportEffect) {
          const effect = module.exportEffect();
          this.registerEffect(effect);
          console.log(`Loaded custom effect: ${effect.name}`);
        }
      }).catch(error => {
        console.warn('Could not load example effect:', error);
      });

      // Import and register the test timeline effect
      import('../effects/TestTimelineEffect').then(module => {
        if (module.exportEffect) {
          const effect = module.exportEffect();
          this.registerEffect(effect);
          console.log(`Loaded test timeline effect: ${effect.name}`);
        }
      }).catch(error => {
        console.warn('Could not load test timeline effect:', error);
      });
    } catch (error) {
      console.warn('Error loading built-in effects:', error);
    }
  }

  // Register a self-contained effect
  registerEffect(effect: SelfContainedEffect): void {
    this.effectRegistry.set(effect.id, effect);
  }

  // Load effects from a folder
  async loadEffectsFromFolder(folderPath: string): Promise<void> {
    try {
      // In a real implementation, this would scan the folder for effect files
      // For now, we'll provide a template for users to follow
      console.log(`Loading effects from folder: ${folderPath}`);
      
      // This would typically:
      // 1. Scan folder for .js/.ts files
      // 2. Look for effect manifests
      // 3. Dynamically import effect modules
      // 4. Register them with the system
    } catch (error) {
      console.error('Error loading effects from folder:', error);
    }
  }

  // Get all available effects
  getAvailableEffects(): SelfContainedEffect[] {
    return Array.from(this.effectRegistry.values());
  }

  // Get effect by ID
  getEffect(id: string): SelfContainedEffect | undefined {
    return this.effectRegistry.get(id);
  }

  // Create an effect instance
  createEffect(id: string, width: number, height: number): BaseEffect {
    const effect = this.effectRegistry.get(id);
    if (!effect) {
      throw new Error(`Effect "${id}" not found`);
    }
    return effect.createEffect(width, height);
  }

  // Get effects by category
  getEffectsByCategory(category: string): SelfContainedEffect[] {
    return Array.from(this.effectRegistry.values())
      .filter(effect => effect.category === category);
  }

  // Get all categories
  getCategories(): string[] {
    const categories = new Set<string>();
    this.effectRegistry.forEach(effect => {
      categories.add(effect.category);
    });
    return Array.from(categories);
  }
} 