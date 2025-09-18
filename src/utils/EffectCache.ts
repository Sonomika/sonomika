// Effect Preloading and Caching System
export interface CachedEffect {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  author: string;
  version: string;
  component: React.ComponentType<any>;
  metadata: any;
  loadTime: number;
}

export class EffectCache {
  private static instance: EffectCache;
  private cache = new Map<string, CachedEffect>();
  private preloadPromise: Promise<void> | null = null;
  private isPreloaded = false;

  private constructor() {}

  static getInstance(): EffectCache {
    if (!EffectCache.instance) {
      EffectCache.instance = new EffectCache();
    }
    return EffectCache.instance;
  }

  /**
   * Start preloading effects in the background
   */
  async startPreloading(): Promise<void> {
    if (this.preloadPromise) {
      // console.log('🔄 EffectCache: Preloading already in progress, waiting...');
      return this.preloadPromise;
    }

    if (this.isPreloaded) {
      // console.log('✅ EffectCache: Effects already preloaded');
      return Promise.resolve();
    }

    // console.log('🚀 EffectCache: Starting effect preloading...');
    this.preloadPromise = this.preloadAllEffects();
    return this.preloadPromise;
  }

  /**
   * Get cached effects (returns immediately if preloaded)
   */
  getCachedEffects(): CachedEffect[] {
    return Array.from(this.cache.values());
  }

  /**
   * Check if effects are already preloaded
   */
  isEffectsPreloaded(): boolean {
    return this.isPreloaded;
  }

  /**
   * Get a specific effect from cache
   */
  getCachedEffect(id: string): CachedEffect | undefined {
    return this.cache.get(id);
  }

  /**
   * Preload all effects by importing them
   */
  private async preloadAllEffects(): Promise<void> {
    const startTime = performance.now();
    // console.log('🔄 EffectCache: Preloading effects...');

    // Use the existing EffectDiscovery system instead of reinventing the wheel
    let discoveredEffects: any[] = [];
    try {
      // Import and use EffectDiscovery for consistent effect loading
      const { EffectDiscovery } = await import('./EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      discoveredEffects = await discovery.discoverEffects();
      // console.log('🔍 EffectCache: Using EffectDiscovery, found effects:', discoveredEffects.length);
    } catch (e) {
      console.warn('⚠️ EffectCache: EffectDiscovery failed, no effects will be loaded', e);
      discoveredEffects = [];
    }

    // Load effects in parallel for maximum speed
    const loadPromises = discoveredEffects.map(effect => 
      this.loadAndCacheEffectFromDiscovery(effect)
    );

    // Wait for all effects to load (or fail)
    const results = await Promise.allSettled(loadPromises);
    
    // Count successes and failures
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    const endTime = performance.now();
    const loadTime = endTime - startTime;

    // console.log(`✅ EffectCache: Preloading complete!`);
    // console.log(`📊 Stats: ${succeeded} loaded, ${failed} failed, ${loadTime.toFixed(2)}ms total`);
    // console.log(`🎯 Cache size: ${this.cache.size} effects`);

    this.isPreloaded = true;
  }

  /**
   * Load and cache a single effect from EffectDiscovery
   */
  private async loadAndCacheEffectFromDiscovery(effect: any): Promise<void> {
    const startTime = performance.now();
    
    try {
      // console.log(`🔄 Loading effect from discovery: ${effect.id}`);
      
      // Extract metadata from the discovered effect
      const metadata = effect.metadata || {};
      
      // Generate effect ID (use kebab-case for consistency)
      const id = this.generateEffectId(effect.id);
      
      const cachedEffect: CachedEffect = {
        id,
        name: metadata.name || this.generateEffectName(this.basename(effect.id)),
        description: metadata.description || `${metadata.name || this.basename(effect.id)} effect`,
        category: metadata.category || 'Effects',
        icon: metadata.icon || '✨',
        author: metadata.author || 'VJ System',
        version: metadata.version || '1.0.0',
        component: effect.component || effect.createEffect,
        metadata,
        loadTime: performance.now() - startTime
      };

      // Cache the effect
      this.cache.set(id, cachedEffect);
      
      // console.log(`✅ Cached effect: ${id} (${cachedEffect.loadTime.toFixed(2)}ms)`);
      
    } catch (error) {
      console.warn(`❌ Failed to load effect ${effect.id}:`, error);
      throw error;
    }
  }

  /**
   * Load and cache a single effect (legacy method - kept for compatibility)
   */
  private async loadAndCacheEffect(effectName: string, modulePath: string): Promise<void> {
    const startTime = performance.now();
    
    try {
      // console.log(`🔄 Loading effect: ${effectName} from ${modulePath}`);
      
      // Dynamic import with @vite-ignore for faster builds
      // Use the full module path for import
      // console.log(`📁 Importing from path: ${modulePath}`);
      
      // Try different import strategies
      let module;
      try {
        // First try the direct path
        module = await import(/* @vite-ignore */ modulePath);
      } catch (directImportError) {
        console.warn(`⚠️ Direct import failed for ${modulePath}, trying alternative:`, directImportError);
        
        // Try with the effect name as a fallback
        try {
          const fallbackPath = `../bank/${effectName}`;
          // console.log(`🔄 Trying fallback path: ${fallbackPath}`);
          module = await import(/* @vite-ignore */ fallbackPath);
        } catch (fallbackError) {
          console.error(`❌ Both import methods failed for ${effectName}:`, fallbackError);
          throw fallbackError;
        }
      }
      const component = module.default || module[effectName];
      
      if (!component) {
        throw new Error(`No component found in ${effectName}`);
      }

      // Extract metadata
      const metadata = (component as any).metadata || {};
      
      // Generate effect ID (use kebab-case for consistency)
      const id = this.generateEffectId(effectName);
      
      const cachedEffect: CachedEffect = {
        id,
        name: metadata.name || this.generateEffectName(effectName),
        description: metadata.description || `${metadata.name || effectName} effect`,
        category: metadata.category || 'Effects',
        icon: metadata.icon || '✨',
        author: metadata.author || 'VJ System',
        version: metadata.version || '1.0.0',
        component,
        metadata,
        loadTime: performance.now() - startTime
      };

      // Cache the effect
      this.cache.set(id, cachedEffect);
      
      // console.log(`✅ Cached effect: ${id} (${cachedEffect.loadTime.toFixed(2)}ms)`);
      
    } catch (error) {
      console.warn(`❌ Failed to load effect ${effectName}:`, error);
      throw error;
      }
    }

  /**
   * Generate effect ID from filename (consistent with existing system)
   */
  private generateEffectId(fileName: string): string {
    const base = this.basename(fileName);
    return base
      .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, (match) => `-${match.toLowerCase()}`)
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '')
      .replace(/effect$/, '-effect')
      .replace(/-+/g, '-');
  }

  /**
   * Generate effect name from filename
   */
  private generateEffectName(fileName: string): string {
    const base = this.basename(fileName);
    return base
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/Effect$/, '')
      .trim();
  }

  private basename(pathStr: string): string {
    const norm = pathStr.replace(/\\/g, '/');
    const parts = norm.split('/');
    return (parts.pop() || pathStr).replace(/\.tsx?$/i, '');
  }

  /**
   * Clear cache (for testing/debugging)
   */
  clearCache(): void {
    this.cache.clear();
    this.preloadPromise = null;
    this.isPreloaded = false;
    // console.log('🧹 EffectCache: Cache cleared');
  }
}

// Export singleton instance
export const effectCache = EffectCache.getInstance();
