import React from 'react';
import { EffectDiscovery, ReactSelfContainedEffect, ReactEffectInstance } from './EffectDiscovery';

/**
 * Centralized Effect Manager
 * 
 * This manager automatically discovers and loads all effects from the effects folder.
 * Components can use this manager to get effects without hardcoding imports.
 */
export class EffectManager {
  private static instance: EffectManager;
  private effectDiscovery: EffectDiscovery;
  private loadedEffects: Map<string, ReactSelfContainedEffect> = new Map();
  private effectComponents: Map<string, React.ComponentType<any>> = new Map();

  private constructor() {
    this.effectDiscovery = EffectDiscovery.getInstance();
  }

  static getInstance(): EffectManager {
    if (!EffectManager.instance) {
      EffectManager.instance = new EffectManager();
    }
    return EffectManager.instance;
  }

  /**
   * Initialize the effect manager and discover all effects
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Effect Manager...');
    
    try {
      const effects = await this.effectDiscovery.discoverEffects();
      
      effects.forEach(effect => {
        this.loadedEffects.set(effect.id, effect);
        console.log(`✅ Registered effect: ${effect.id} (${effect.name})`);
      });

      console.log(`🎯 EffectManager: Loaded ${this.loadedEffects.size} effects`);
      
      if (this.loadedEffects.size === 0) {
        console.warn('⚠️ No effects discovered. This might be due to:');
        console.warn('   - No effects in the effects folder');
        console.warn('   - Effects not properly exported');
        console.warn('   - Dynamic discovery not working in current environment');
      }
    } catch (error) {
      console.error('❌ Error initializing Effect Manager:', error);
      throw error;
    }
  }

  /**
   * Get all available effects
   */
  getAvailableEffects(): ReactSelfContainedEffect[] {
    return Array.from(this.loadedEffects.values());
  }

  /**
   * Get effect by ID
   */
  getEffect(id: string): ReactSelfContainedEffect | undefined {
    return this.loadedEffects.get(id);
  }

  /**
   * Get effects by category
   */
  getEffectsByCategory(category: string): ReactSelfContainedEffect[] {
    return Array.from(this.loadedEffects.values())
      .filter(effect => effect.category === category);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.loadedEffects.forEach(effect => {
      categories.add(effect.category);
    });
    return Array.from(categories);
  }

  /**
   * Create an effect instance
   */
  createEffect(id: string, width: number, height: number): ReactEffectInstance | null {
    const effect = this.loadedEffects.get(id);
    if (!effect) {
      console.warn(`Effect "${id}" not found`);
      return null;
    }
    return effect.createEffect(width, height);
  }

  /**
   * Get effect component for React rendering
   */
  async getEffectComponent(id: string): Promise<React.ComponentType<any> | null> {
    // Check if we already have the component cached
    if (this.effectComponents.has(id)) {
      return this.effectComponents.get(id) || null;
    }

    // Try to get it from the effect discovery
    const component = await this.effectDiscovery.getEffectComponent(id);
    if (component) {
      this.effectComponents.set(id, component);
    }
    return component;
  }

  /**
   * Get lazy-loaded effect component
   */
  getLazyEffectComponent(id: string): React.LazyExoticComponent<React.ComponentType<any>> {
    return React.lazy(async () => {
      const component = await this.getEffectComponent(id);
      if (!component) {
        throw new Error(`Effect component "${id}" not found`);
      }
      return { default: component };
    });
  }

  /**
   * Check if an effect exists
   */
  hasEffect(id: string): boolean {
    return this.loadedEffects.has(id);
  }

  /**
   * Get effect metadata
   */
  getEffectMetadata(id: string) {
    const effect = this.loadedEffects.get(id);
    return effect?.metadata;
  }

  /**
   * Reload all effects (useful when new effects are added)
   */
  async reloadEffects(): Promise<void> {
    this.loadedEffects.clear();
    this.effectComponents.clear();
    await this.initialize();
  }

  /**
   * Get effects for the effects browser
   */
  getEffectsForBrowser() {
    return Array.from(this.loadedEffects.values()).map(effect => ({
      id: effect.id,
      name: effect.name,
      description: effect.description,
      category: effect.category,
      icon: effect.icon,
      author: effect.author,
      version: effect.version
    }));
  }
}

/**
 * React hook to use the effect manager
 */
export function useEffectManager() {
  const [manager] = React.useState(() => EffectManager.getInstance());
  const [isInitialized, setIsInitialized] = React.useState(false);

  React.useEffect(() => {
    if (!isInitialized) {
      manager.initialize().then(() => {
        setIsInitialized(true);
      });
    }
  }, [manager, isInitialized]);

  return {
    manager,
    isInitialized,
    effects: manager.getAvailableEffects(),
    categories: manager.getCategories(),
    getEffect: manager.getEffect.bind(manager),
    getEffectsByCategory: manager.getEffectsByCategory.bind(manager),
    createEffect: manager.createEffect.bind(manager),
    getEffectComponent: manager.getEffectComponent.bind(manager),
    getLazyEffectComponent: manager.getLazyEffectComponent.bind(manager),
    hasEffect: manager.hasEffect.bind(manager),
    reloadEffects: manager.reloadEffects.bind(manager)
  };
}

/**
 * Helper function to get a lazy-loaded effect component
 */
export function getLazyEffect(id: string): React.LazyExoticComponent<React.ComponentType<any>> {
  const manager = EffectManager.getInstance();
  return manager.getLazyEffectComponent(id);
}

/**
 * Helper function to get all available effects
 */
export function getAvailableEffects(): ReactSelfContainedEffect[] {
  const manager = EffectManager.getInstance();
  return manager.getAvailableEffects();
} 