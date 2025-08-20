// SelfContainedEffect interface moved here since DynamicEffectLoader was deleted
export interface SelfContainedEffect {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  author?: string;
  version?: string;
  metadata: any;
  createEffect: (width: number, height: number) => any;
}

/**
 * Parameter interface for effects
 */
export interface EffectParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'color';
  value: any;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Extended metadata interface for React-based effects
 */
export interface ReactEffectMetadata {
  parameters: EffectParameter[];
  category: string;
  type: 'react-component';
  component?: React.ComponentType<any>;
  folder?: string; // Add folder information for categorization
  isSource?: boolean; // Add source flag for categorization
}

/**
 * Extended self-contained effect interface for React components
 */
export interface ReactSelfContainedEffect {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  author?: string;
  version?: string;
  metadata: ReactEffectMetadata;
  createEffect: (width: number, height: number) => ReactEffectInstance;
}

/**
 * Interface for React effect instances
 */
export interface ReactEffectInstance {
  id: string;
  name: string;
  component: React.ComponentType<any>;
  width: number;
  height: number;
  params?: Record<string, any>;
}

/**
 * Effect Discovery System
 * 
 * This system automatically scans for effects in the effects folder and loads them dynamically.
 * Users can drop their custom effects into the effects folder and they will be
 * automatically discovered and loaded without requiring changes to other files.
 */
export class EffectDiscovery {
  private static instance: EffectDiscovery;
  private discoveredEffects: Map<string, ReactSelfContainedEffect> = new Map();
  private effectComponents: Map<string, React.ComponentType<any>> = new Map();
  // In browser builds, keep a registry from discovered effect file -> import fn (via import.meta.glob)
  private browserEffectImports: Map<string, () => Promise<any>> = new Map();

  private constructor() {}

  static getInstance(): EffectDiscovery {
    if (!EffectDiscovery.instance) {
      EffectDiscovery.instance = new EffectDiscovery();
    }
    return EffectDiscovery.instance;
  }

  /**
   * Discover and load all effects from the effects folder
   * This automatically scans for effect files and loads them
   */
  async discoverEffects(): Promise<ReactSelfContainedEffect[]> {
    console.log('🚀 EffectDiscovery.discoverEffects() called');
    const effects: ReactSelfContainedEffect[] = [];

    // Get all effect files from the effects folder
    const effectFiles = await this.getEffectFiles();
    
    console.log('🔍 EffectDiscovery: Found effect files:', effectFiles);
    
    for (const fileName of effectFiles) {
      try {
        console.log(`🔍 Loading effect from file: ${fileName}`);
        const effect = await this.loadEffectFromFile(fileName);
        if (effect) {
          console.log(`✅ Successfully loaded effect: ${effect.id} (${effect.name})`);
          this.discoveredEffects.set(effect.id, effect);
          effects.push(effect);
        } else {
          console.warn(`❌ Failed to load effect from file: ${fileName}`);
        }
      } catch (error) {
        console.warn(`❌ Could not load effect ${fileName}:`, error);
      }
    }

    console.log(`🎯 EffectDiscovery: Total effects loaded: ${effects.length}`);
    console.log('✅ Successfully loaded effects:', effects.map(e => e.id));
    console.log('❌ Failed to load effects:', effects.filter(e => !e.id).map(e => e.name));
    return effects;
  }

  /**
   * Get all effect files from the effects folder
   * This is a REAL filesystem scanner, not a hardcoded list!
   */
  private async getEffectFiles(): Promise<string[]> {
    try {
      // In Electron, we can use Node.js APIs to scan the filesystem
      if (typeof window !== 'undefined' && (window as any).require) {
        // We're in Electron, use Node.js fs module
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        
        // Get the effects folder paths - now we have visual-effects and sources subfolders
        const effectsFolder = path.join(__dirname, '../effects');
        const visualEffectsFolder = path.join(effectsFolder, 'visual-effects');
        const sourcesFolder = path.join(effectsFolder, 'sources');
        
        // Recursively scan for all .tsx files in all effect folders
        let effectFiles: string[] = [];
        
        // Scan main effects folder (for any remaining effects)
        if (fs.existsSync(effectsFolder)) {
          effectFiles = effectFiles.concat(this.scanDirectoryRecursively(fs, path, effectsFolder));
        }
        
        // Scan visual-effects folder (visual effects that modify content)
        if (fs.existsSync(visualEffectsFolder)) {
          const visualEffectFiles = this.scanDirectoryRecursively(fs, path, visualEffectsFolder);
          effectFiles = effectFiles.concat(visualEffectFiles);
        }
        
        // Scan sources folder (generative content that creates new material)
        if (fs.existsSync(sourcesFolder)) {
          const sourceFiles = this.scanDirectoryRecursively(fs, path, sourcesFolder);
          effectFiles = effectFiles.concat(sourceFiles);
        }
        
        return effectFiles;
        
      } else {
        // We're in a browser environment - use dynamic import discovery
        console.log('🔍 Browser environment detected, using dynamic import discovery...');
        
        // Use a truly dynamic approach that doesn't rely on hardcoded lists
        const discoveredFiles: string[] = [];
        
        // Try to use Vite's import.meta.glob for dynamic discovery
        try {
          console.log('🔍 Attempting to use import.meta.glob for dynamic discovery...');
          
          // This should dynamically discover all .tsx files in the effects directory and subdirectories
          const effectModules: Record<string, () => Promise<any>> = (import.meta as any).glob('../effects/**/*.tsx', { eager: false });
          
          console.log('🔍 Found effect modules:', Object.keys(effectModules));
          
          // Process each discovered module
          for (const [modulePath, importFn] of Object.entries(effectModules)) {
            try {
              // Try to import the module to verify it's a valid effect
              await (importFn as any)();
              
              // Extract the effect name from the path
              // Remove '../effects/' prefix and '.tsx' extension
              const effectName = modulePath
                .replace('../effects/', '')
                .replace('.tsx', '');
              
              const fileKey = `${effectName}.tsx`;
              discoveredFiles.push(fileKey);
              // Register import function so we can load deterministically later
              this.browserEffectImports.set(fileKey, importFn);
              console.log(`✅ Discovered effect: ${effectName}`);
            } catch (error) {
              console.log(`❌ Failed to import effect: ${modulePath}`, error);
            }
          }
        } catch (error) {
          console.error('❌ import.meta.glob failed:', error);
          
          // If import.meta.glob fails, we'll return an empty array
          // This ensures we don't fall back to hardcoded patterns
          console.log('⚠️ Dynamic discovery failed, returning empty array to avoid hardcoded fallbacks');
        }
        
        console.log(`🎯 Discovered ${discoveredFiles.length} effects in browser environment`);
        console.log('📋 Discovered files:', discoveredFiles);
        
        return discoveredFiles;
      }
      
    } catch (error) {
      console.error('Error scanning effects folder:', error);
      return [];
    }
  }

  /**
   * Recursively scan a directory for .tsx files
   */
  private scanDirectoryRecursively(fs: any, path: any, dirPath: string): string[] {
    const effectFiles: string[] = [];
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = this.scanDirectoryRecursively(fs, path, fullPath);
          effectFiles.push(...subFiles);
        } else if (item.endsWith('.tsx') && !item.startsWith('.')) {
          // Found a .tsx file, add it to the list
          // Convert to relative path from effects folder
          const relativePath = path.relative(path.join(__dirname, '../effects'), fullPath);
          effectFiles.push(relativePath.replace(/\\/g, '/')); // Normalize path separators
        }
      }
    } catch (error) {
      console.warn(`Could not scan directory ${dirPath}:`, error);
    }
    
    return effectFiles;
  }

  /**
   * Load an effect from a file
   */
  private async loadEffectFromFile(fileName: string): Promise<ReactSelfContainedEffect | null> {
    console.log(`🔍 loadEffectFromFile called with fileName: "${fileName}"`);
    
    if (!fileName || fileName.trim() === '') {
      console.error('❌ loadEffectFromFile received empty or undefined fileName');
      return null;
    }
    
    try {
      // Prefer using the browserEffectImports registry when running in browser
      let module: any;
      const isBrowser = typeof window !== 'undefined' && !(window as any).require;
      if (isBrowser && this.browserEffectImports.has(fileName)) {
        const importFn = this.browserEffectImports.get(fileName)!;
        module = await importFn();
      } else {
        // Fallback for Electron/Node where direct relative import works during build time
        const importPath = fileName.replace('.tsx', '');
        console.log(`🔍 Importing from path (fallback): "../effects/${importPath}"`);
        module = await import(/* @vite-ignore */ `../effects/${importPath}`);
      }
      console.log(`✅ Successfully imported module:`, module);
      
      // Try to get metadata from the module
      // Compute importPath only for logging/derived keys
      const importPathForKeys = fileName.replace('.tsx', '');
      const component = module.default || module[`${importPathForKeys}Component`];
      const metadata = module.metadata || component?.metadata || module[`${importPathForKeys}Metadata`];
      
      console.log(`🔍 Found metadata:`, metadata);
      console.log(`🔍 Found component:`, component ? 'Yes' : 'No');
      console.log(`🔍 Module keys:`, Object.keys(module));
      console.log(`🔍 Module.default:`, module.default);
      console.log(`🔍 Module.default type:`, typeof module.default);
      
      // Generic debugging for all effects
      console.log(`🎯 Effect loading details for ${fileName}:`, {
        fileName,
        importPath: importPathForKeys,
        hasDefault: !!module.default,
        defaultType: typeof module.default,
        hasComponent: !!component,
        componentType: typeof component,
        moduleKeys: Object.keys(module)
      });
      
      if (!component) {
        console.warn(`❌ No component found in ${fileName}`);
        return null;
      }

      // Normalize path and use basename for IDs/names
      const normalizedPath = fileName.replace(/\\/g, '/');
      const baseFileName = normalizedPath.split('/').pop() || fileName;

      // Determine the folder category (visual-effects or sources)
      const folderCategory = this.getFolderCategory(normalizedPath);

      // Generate effect ID from basename
      const id = this.generateEffectId(baseFileName);
      
      // Get effect name from metadata or generate from basename
      const name = metadata?.name || this.generateEffectName(baseFileName);
      
      // Get category from metadata or default to 'Other'
      const category = metadata?.category || 'Other';
      
      // Get description from metadata or generate default
      const description = metadata?.description || `${name} effect`;
      
      // Get icon from metadata; no emoji/icons per project rules
      const icon = metadata?.icon || '';

      const effect: ReactSelfContainedEffect = {
        id,
        name,
        description,
        category,
        icon,
        author: metadata?.author || 'VJ System',
        version: metadata?.version || '1.0.0',
        metadata: {
          parameters: metadata?.parameters || [],
          category,
          type: 'react-component',
          component,
          folder: folderCategory, // Add folder information for proper categorization
          isSource: folderCategory === 'sources' // Mark as source if in sources folder
        },
        createEffect: (width: number, height: number): ReactEffectInstance => {
          return {
            id,
            name,
            component,
            width,
            height
          };
        }
      };

      // Note: Effects are self-registered in their own files, so we don't need to auto-register here
      // This prevents duplicate registrations
      console.log(`🔧 Effect ${id} is self-registered, skipping auto-registration`);

      console.log(`✅ Created effect object:`, effect);
      return effect;
    } catch (error) {
      console.error(`❌ Error loading effect from file ${fileName}:`, error);
      return null;
    }
  }

  /**
   * Generate effect ID from filename
   */
  private generateEffectId(fileName: string): string {
    console.log(`🔍 generateEffectId called with fileName: "${fileName}"`);
    
    if (!fileName || fileName.trim() === '') {
      console.error('❌ generateEffectId received empty or undefined fileName');
      return 'unknown-effect';
    }
    
    // Convert CamelCase to kebab-case and keep "effect" suffix
    // Handle consecutive uppercase letters properly (e.g., "BPM" -> "bpm")
    const id = fileName
      .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, (match) => `-${match.toLowerCase()}`) // Handle consecutive uppercase at word boundaries
      .replace(/([A-Z])/g, '-$1') // Handle single uppercase
      .toLowerCase()
      .replace(/^-/, '')
      .replace(/\.tsx$/, '') // Remove .tsx extension
      .replace(/-+$/, '') // Remove trailing hyphens
      .replace(/-+/g, '-'); // Replace multiple hyphens with single
    
    console.log(`🔍 Generated effect ID: "${id}" from fileName: "${fileName}"`);
    return id;
  }



  /**
   * Generate effect name from filename
   */
  private generateEffectName(fileName: string): string {
    // Convert CamelCase to Title Case
    return fileName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/Effect$/, '')
      .trim();
  }

  /**
   * Get all discovered effects
   */
  getDiscoveredEffects(): ReactSelfContainedEffect[] {
    return Array.from(this.discoveredEffects.values());
  }

  /**
   * Get a specific effect by ID
   */
  getEffect(id: string): ReactSelfContainedEffect | undefined {
    return this.discoveredEffects.get(id);
  }

  /**
   * Get effects by category
   */
  getEffectsByCategory(category: string): ReactSelfContainedEffect[] {
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
   * Get effect component by ID (for React rendering)
   */
  async getEffectComponent(id: string): Promise<React.ComponentType<any> | null> {
    const effect = this.discoveredEffects.get(id);
    if (!effect) return null;

    // Try to get the component from the effect's metadata
    const component = effect.metadata.component;
    if (component) return component;

    // If not found, try to import it dynamically
    try {
      const fileName = this.getFileNameFromId(id);
      const importPath = fileName.replace('.tsx', '');
      const module = await import(/* @vite-ignore */ `../effects/${importPath}`);
      return module.default || module[`${importPath}Component`] || null;
    } catch (error) {
      console.warn(`Could not load component for effect ${id}:`, error);
      return null;
    }
  }

  /**
   * Get filename from effect ID
   */
  private getFileNameFromId(id: string): string {
    console.log(`🔍 getFileNameFromId called with id: "${id}"`);
    
    // If the ID is already a simple filename (no hyphens), just add .tsx
    if (!id.includes('-')) {
      const fileName = `${id}.tsx`;
      console.log(`🔍 Simple filename detected, returning: "${fileName}"`);
      return fileName;
    }
    
    // Convert kebab-case back to CamelCase for complex names
    const fileName = id
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'Effect.tsx';
    
    console.log(`🔍 Converted kebab-case to filename: "${fileName}"`);
    return fileName;
  }

  /**
   * Reload all effects (useful when new effects are added)
   */
  async reloadEffects(): Promise<void> {
    this.discoveredEffects.clear();
    this.effectComponents.clear();
    await this.discoverEffects();
  }

  /**
   * Determine the folder category (visual-effects or sources) from a normalized path
   */
  private getFolderCategory(normalizedPath: string): string {
    if (normalizedPath.includes('visual-effects')) {
      return 'visual-effects';
    } else if (normalizedPath.includes('sources')) {
      return 'sources';
    }
    return 'other'; // Default category
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
  metadata: ReactEffectMetadata,
  createEffect: (width: number, height: number) => ReactEffectInstance
): ReactSelfContainedEffect {
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