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
      return this.preloadPromise;
    }

    console.log('🚀 EffectCache: Starting effect preloading...');
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
    console.log('🔄 EffectCache: Preloading effects...');

    // Known effect files - we can expand this dynamically later
    const knownEffects = [
      'ASCIIVideoEffect',
      'RotatingSquareGlitchEffect', 
      'MatrixNumbersEffect',
      'Video3DSliceEffect',
      'DataVisualizationEffect',
      'PixelateEffect',
      'AdvancedGlitchEffect',
      'MonjoriShaderEffect',
      'VideoWarpEffect',
      'VideoSliceOffsetEffect',
      'VideoSlideEffect',
      'RotatingParticleEffect',
      'ChromaticAberrationEffect',
      'ShaderToyEffect',
      'VideoDatamoshGlitch',
      'PCDPointCloudEffect',
      'PointCloudEffect',
      'PulseHexagon',
      'TestEffect',
      'GenericPulseEffect'
    ];

    // Load effects in parallel for maximum speed
    const loadPromises = knownEffects.map(effectName => 
      this.loadAndCacheEffect(effectName)
    );

    // Wait for all effects to load (or fail)
    const results = await Promise.allSettled(loadPromises);
    
    // Count successes and failures
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    const endTime = performance.now();
    const loadTime = endTime - startTime;

    console.log(`✅ EffectCache: Preloading complete!`);
    console.log(`📊 Stats: ${succeeded} loaded, ${failed} failed, ${loadTime.toFixed(2)}ms total`);
    console.log(`🎯 Cache size: ${this.cache.size} effects`);

    this.isPreloaded = true;
  }

  /**
   * Load and cache a single effect
   */
  private async loadAndCacheEffect(effectName: string): Promise<void> {
    const startTime = performance.now();
    
    try {
      console.log(`🔄 Loading effect: ${effectName}`);
      
      // Dynamic import with @vite-ignore for faster builds
      const module = await import(/* @vite-ignore */ `../effects/${effectName}`);
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
      
      console.log(`✅ Cached effect: ${id} (${cachedEffect.loadTime.toFixed(2)}ms)`);
      
    } catch (error) {
      console.warn(`❌ Failed to load effect ${effectName}:`, error);
      throw error;
    }
  }

  /**
   * Generate effect ID from filename (consistent with existing system)
   */
  private generateEffectId(fileName: string): string {
    return fileName
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
    return fileName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/Effect$/, '')
      .trim();
  }

  /**
   * Clear cache (for testing/debugging)
   */
  clearCache(): void {
    this.cache.clear();
    this.preloadPromise = null;
    this.isPreloaded = false;
    console.log('🧹 EffectCache: Cache cleared');
  }
}

// Export singleton instance
export const effectCache = EffectCache.getInstance();
