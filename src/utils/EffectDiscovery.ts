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
  isUserEffect?: boolean; // Add user effect flag for categorization
  // Optional original path (for classification like @bank)
  sourcePath?: string;
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
  // Registry for user-loaded effects from external directories
  private userEffects: Map<string, ReactSelfContainedEffect> = new Map();
  private userEffectImports: Map<string, () => Promise<any>> = new Map();

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
    // console.log('🚀 EffectDiscovery.discoverEffects() called');
    const effects: ReactSelfContainedEffect[] = [];

    // Get all effect files from the effects folder
    const effectFiles = await this.getEffectFiles();
    
    // console.log('🔍 EffectDiscovery: Found effect files:', effectFiles);
    
    for (const fileName of effectFiles) {
      try {
        // console.log(`🔍 Loading effect from file: ${fileName}`);
        const effect = await this.loadEffectFromFile(fileName);
        if (effect) {
          // console.log(`✅ Successfully loaded effect: ${effect.id} (${effect.name})`);
          this.discoveredEffects.set(effect.id, effect);
          effects.push(effect);
        } else {
          console.warn(`❌ Failed to load effect from file: ${fileName}`);
        }
      } catch (error) {
        console.warn(`❌ Could not load effect ${fileName}:`, error);
      }
    }

    // console.log(`🎯 EffectDiscovery: Total effects loaded: ${effects.length}`);
    // console.log('✅ Successfully loaded effects:', effects.map(e => e.id));
    // console.log('❌ Failed to load effects:', effects.filter(e => !e.id).map(e => e.name));
    return effects;
  }

  /**
   * Lightweight listing of available effects without importing modules
   * Returns quickly with filenames and derived minimal metadata.
   */
  async listAvailableEffectsLightweight(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    author: string;
    version: string;
    metadata: Partial<ReactEffectMetadata> & { folder?: string; isSource?: boolean; isUserEffect?: boolean };
    fileKey: string;
  }>> {
    const results: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      icon: string;
      author: string;
      version: string;
      metadata: Partial<ReactEffectMetadata> & { folder?: string; isSource?: boolean; isUserEffect?: boolean };
      fileKey: string;
    }> = [];

    // In the current app, effects are defined by the user in an external folder,
    // and are loaded into `userEffects` via Electron bridges. The lightweight
    // listing should therefore only surface those user effects and should not
    // scan bundled bank paths.
    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
    void isElectron; // reserved for future differentiation if needed

    const userEffects = Array.from(this.userEffects.values());
    for (const userEffect of userEffects) {
      results.push({
        id: userEffect.id,
        name: userEffect.name,
        description: userEffect.description,
        category: userEffect.category,
        icon: userEffect.icon,
        author: userEffect.author || 'User',
        version: userEffect.version || '1.0.0',
        metadata: {
          parameters: userEffect.metadata.parameters || [],
          category: userEffect.category,
          type: 'react-component',
          folder: userEffect.metadata.folder || 'user-effects',
          isSource: userEffect.metadata.isSource || false,
          isUserEffect: userEffect.metadata.isUserEffect !== false,
        },
        fileKey: (userEffect as any)?.metadata?.sourcePath || `user-${userEffect.id}`,
      });
    }

    return results;
  }

  /**
   * Electron-first lightweight listing using real filesystem scan.
   * Falls back to browser lightweight discovery when fs is unavailable.
   */
  async listAvailableEffectsFromFilesystem(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    author: string;
    version: string;
    metadata: Partial<ReactEffectMetadata> & { folder?: string; isSource?: boolean; isUserEffect?: boolean };
    fileKey: string;
  }>> {
    // If Electron/Node APIs are present, prefer true filesystem scan for immediate detection
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    if (!isElectron) {
      return this.listAvailableEffectsLightweight();
    }

    // In the "user folder only" model, we surface ONLY effects that have been
    // loaded via loadUserEffectsFromDirectory / loadUserEffectFromContent.
    // Internal/bundled bank effects are intentionally excluded.
    const results: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      icon: string;
      author: string;
      version: string;
      metadata: Partial<ReactEffectMetadata> & { folder?: string; isSource?: boolean; isUserEffect?: boolean };
      fileKey: string;
    }> = [];

    const userEffects = Array.from(this.userEffects.values());
    for (const userEffect of userEffects) {
      results.push({
        id: userEffect.id,
        name: userEffect.name,
        description: userEffect.description,
        category: userEffect.category,
        icon: userEffect.icon,
        author: userEffect.author || 'User',
        version: userEffect.version || '1.0.0',
        metadata: {
          parameters: userEffect.metadata.parameters || [],
          category: userEffect.category,
          type: 'react-component',
          folder: userEffect.metadata.folder || 'user-effects',
          isSource: userEffect.metadata.isSource || false,
          isUserEffect: userEffect.metadata.isUserEffect !== false,
        },
        fileKey: (userEffect as any)?.metadata?.sourcePath || `user-${userEffect.id}`,
      });
    }

    return results;
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
        
        // Get the effects folder paths - now we have effects and sources subfolders
        const bankFolderRoot = path.join(__dirname, '../bank');
        const effectsFolder = bankFolderRoot; // keep variable name for relative path calculations
        const visualEffectsFolderLegacy = path.join(effectsFolder, 'visual-effects');
        const visualEffectsFolderNew = path.join(effectsFolder, 'effects');
        const sourcesFolder = path.join(effectsFolder, 'sources');
        const bankFolder = path.join(effectsFolder, 'bank');
        const bankEffectsFolder = path.join(bankFolder, 'effects');
        const bankSourcesFolder = path.join(bankFolder, 'sources');
        
        // Recursively scan for all .tsx files in all effect folders
        let effectFiles: string[] = [];
        
        // Scan root bank folder recursively
        if (fs.existsSync(bankFolderRoot)) {
          effectFiles = effectFiles.concat(this.scanDirectoryRecursively(fs, path, bankFolderRoot));
        }
        
        // Scan effects folder (visual effects that modify content) - prefer new folder name, fallback to legacy
        if (fs.existsSync(visualEffectsFolderNew)) {
          const visualEffectFiles = this.scanDirectoryRecursively(fs, path, visualEffectsFolderNew);
          effectFiles = effectFiles.concat(visualEffectFiles.map((p: string) => p.replace(/^visual-effects\//, 'effects/')));
        } else if (fs.existsSync(visualEffectsFolderLegacy)) {
          const visualEffectFiles = this.scanDirectoryRecursively(fs, path, visualEffectsFolderLegacy);
          effectFiles = effectFiles.concat(visualEffectFiles.map((p: string) => p));
        }
        
        // Scan sources folder (generative content that creates new material)
        if (fs.existsSync(sourcesFolder)) {
          const sourceFiles = this.scanDirectoryRecursively(fs, path, sourcesFolder);
          effectFiles = effectFiles.concat(sourceFiles);
        }
        
        // Scan bank folders (curated built-in effect bank)
        if (fs.existsSync(bankEffectsFolder)) {
          const bankEffectFiles = this.scanDirectoryRecursively(fs, path, bankEffectsFolder);
          effectFiles = effectFiles.concat(bankEffectFiles);
        }
        if (fs.existsSync(bankSourcesFolder)) {
          const bankSourceFiles = this.scanDirectoryRecursively(fs, path, bankSourcesFolder);
          effectFiles = effectFiles.concat(bankSourceFiles);
        }
        
        return effectFiles;
        
      } else {
        // We're in a browser environment - use dynamic import discovery
        // console.log('🔍 Browser environment detected, using dynamic import discovery...');
        
        // Use a truly dynamic approach that doesn't rely on hardcoded lists
        const discoveredFiles: string[] = [];
        
        // Try to use Vite's glob for dynamic discovery without exposing the literal to the web build
        try {
          // console.log('🔍 Attempting to use glob for dynamic discovery...');
          const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
          if (!isElectron) {
            return [];
          }
          const globFn = (import.meta as any).glob as undefined | ((p: string, opts?: any) => Record<string, () => Promise<any>>);
          if (!globFn) return [];
          // This should dynamically discover all supported files in the effects directory and subdirectories
          const effectModules: Record<string, () => Promise<any>> = globFn('../bank/**/*.{tsx,jsx,ts,js}', { eager: false });
          
          // console.log('🔍 Found effect modules:', Object.keys(effectModules));
          
          // Process each discovered module
          for (const [modulePath, importFn] of Object.entries(effectModules)) {
            try {
              // Try to import the module to verify it's a valid effect
              await (importFn as any)();
              
              // Extract the effect path from the glob key and preserve extension
              const normalized = modulePath.replace('../bank/', '');
              discoveredFiles.push(normalized);
              // Register import function so we can load deterministically later
              this.browserEffectImports.set(normalized, importFn);
              // console.log(`✅ Discovered effect: ${effectName}`);
            } catch (error) {
              console.log(`❌ Failed to import effect: ${modulePath}`, error);
            }
          }
        } catch (error) {
          console.error('❌ import.meta.glob failed:', error);
          
          // If import.meta.glob fails, we'll return an empty array
          // This ensures we don't fall back to hardcoded patterns
          // console.log('⚠️ Dynamic discovery failed, returning empty array to avoid hardcoded fallbacks');
        }
        
        // console.log(`🎯 Discovered ${discoveredFiles.length} effects in browser environment`);
        // console.log('📋 Discovered files:', discoveredFiles);
        
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
        } else if ((/\.(tsx|ts|jsx|js)$/).test(item) && !item.startsWith('.')) {
          // Found a .tsx file, add it to the list
          // Convert to relative path from effects folder
          const relativePath = path.relative(path.join(__dirname, '../bank'), fullPath);
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
    // console.log(`🔍 loadEffectFromFile called with fileName: "${fileName}"`);
    
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
        // Only try bank imports in Electron environment
        const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
        if (isElectron) {
          // Fallback for Electron/Node where direct relative import works during build time
          const importPath = fileName.replace(/\.(tsx|ts|jsx|js)$/,'');
          // console.log(`🔍 Importing from path (fallback): "../bank/${importPath}"`);
          module = await eval(`import("../bank/${importPath}")`);
        } else {
          // Web version - bank effects not available
          console.log(`Web version: Bank effect ${fileName} not available`);
          return null;
        }
      }
      // console.log(`✅ Successfully imported module:`, module);
      
      // Try to get metadata from the module
      // Compute importPath only for logging/derived keys
      const importPathForKeys = fileName.replace(/\.(tsx|ts|jsx|js)$/,'');
      const component = module.default || module[`${importPathForKeys}Component`];
      const metadata = module.metadata || component?.metadata || module[`${importPathForKeys}Metadata`];
      
      // console.log(`🔍 Found metadata:`, metadata);
      // console.log(`🔍 Found component:`, component ? 'Yes' : 'No');
      // console.log(`🔍 Module keys:`, Object.keys(module));
      // console.log(`🔍 Module.default:`, module.default);
      // console.log(`🔍 Module.default type:`, typeof module.default);
      
      // Generic debugging for all effects
      // console.log(`🎯 Effect loading details for ${fileName}:`, {
      //   fileName,
      //   importPath: importPathForKeys,
      //   hasDefault: !!module.default,
      //   defaultType: typeof module.default,
      //   hasComponent: !!component,
      //   componentType: typeof component,
      //   moduleKeys: Object.keys(module)
      // });
      
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
      // console.log(`🔧 Effect ${id} is self-registered, skipping auto-registration`);

      // console.log(`✅ Created effect object:`, effect);
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
    // console.log(`🔍 generateEffectId called with fileName: "${fileName}"`);
    
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
      .replace(/\.(tsx|ts|js|jsx)$/, '') // Remove known extensions
      .replace(/-+$/, '') // Remove trailing hyphens
      .replace(/-+/g, '-'); // Replace multiple hyphens with single
    
    // console.log(`🔍 Generated effect ID: "${id}" from fileName: "${fileName}"`);
    return id;
  }



  /**
   * Generate effect name from filename
   */
  private generateEffectName(fileName: string): string {
    // Remove file extension first
    const nameWithoutExt = fileName.replace(/\.(tsx|ts|js|jsx)$/, '');
    
    // Convert CamelCase to Title Case
    return nameWithoutExt
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

    // If not found, try to import it dynamically (only in Electron)
    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
    if (isElectron) {
      try {
        const fileName = this.getFileNameFromId(id);
        const importPath = fileName.replace('.tsx', '');
        const module = await eval(`import("../bank/${importPath}")`);
        return module.default || module[`${importPath}Component`] || null;
      } catch (error) {
        console.warn(`Could not load component for effect ${id}:`, error);
        return null;
      }
    } else {
      // Web version - bank effects not available
      console.log(`Web version: Bank effect component ${id} not available`);
      return null;
    }
  }

  /**
   * Get filename from effect ID
   */
  private getFileNameFromId(id: string): string {
    // console.log(`🔍 getFileNameFromId called with id: "${id}"`);
    
    // If the ID is already a simple filename (no hyphens), just add .tsx (legacy default)
    if (!id.includes('-')) {
      const fileName = `${id}.tsx`;
      // console.log(`🔍 Simple filename detected, returning: "${fileName}"`);
      return fileName;
    }
    
    // Convert kebab-case back to CamelCase for complex names
    const fileName = id
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'Effect.tsx';
    
    // console.log(`🔍 Converted kebab-case to filename: "${fileName}"`);
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
   * Load user effects from an external directory
   * This allows users to load custom effects from any directory, including @src/
   */
  async loadUserEffectsFromDirectory(directoryPath: string): Promise<ReactSelfContainedEffect[]> {
    console.log(`🔍 Loading user effects from directory: ${directoryPath}`);
    const effects: ReactSelfContainedEffect[] = [];

    try {
      // Prefer Electron preload bridges (no nodeIntegration required)
      const fsApi = (window as any)?.fsApi;
      const electron = (window as any)?.electron;
      if (fsApi && electron && typeof fsApi.listDirectory === 'function' && typeof electron.readFileText === 'function') {
        const exists = (() => { try { return !!fsApi.exists?.(directoryPath); } catch { return false; } })();
        if (!exists) {
          console.warn(`❌ Directory does not exist: ${directoryPath}`);
          return effects;
        }
        const files = this.scanDirectoryRecursivelyFsApi(directoryPath);
        console.log(`🔍 Found ${files.length} user effect files in ${directoryPath}`);
        for (const absPath of files) {
          try {
            const code: string = await electron.readFileText(absPath);
            // Pass absolute path as sourceName so downstream listing can surface it
            const effect = await this.loadUserEffectFromContent(code, absPath);
            if (effect) {
              const userEffectId = `user-${effect.id}`;
              // Do NOT mutate the display name; keep the original effect name
              const userEffect = {
                ...effect,
                id: userEffectId,
                author: effect.author || 'User',
                metadata: {
                  ...effect.metadata,
                  folder: 'user-effects',
                  isUserEffect: true,
                  sourcePath: (effect as any)?.metadata?.sourcePath || absPath,
                },
              } as any;
              this.userEffects.set(userEffectId, userEffect);
              effects.push(userEffect);
              console.log(`✅ Loaded user effect: ${userEffectId} (${userEffect.name})`);
            }
          } catch (e) {
            console.warn(`❌ Could not load user effect from ${absPath}:`, e);
          }
        }
      } else if (typeof window !== 'undefined' && (window as any).require) {
        // Legacy Electron with nodeIntegration
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        if (!fs.existsSync(directoryPath)) {
          console.warn(`❌ Directory does not exist: ${directoryPath}`);
          return effects;
        }
        const userEffectFiles = this.scanDirectoryRecursively(fs, path, directoryPath);
        console.log(`🔍 Found ${userEffectFiles.length} user effect files in ${directoryPath}`);
        for (const filePath of userEffectFiles) {
          try {
            const effect = await this.loadUserEffectFromPath(filePath, directoryPath);
            if (effect) {
              const userEffectId = `user-${effect.id}`;
              // Preserve the original effect name without adding a suffix
              const userEffect = {
                ...effect,
                id: userEffectId,
                author: effect.author || 'User',
                metadata: {
                  ...effect.metadata,
                  folder: 'user-effects',
                  isUserEffect: true,
                  sourcePath: filePath,
                },
              } as any;
              this.userEffects.set(userEffectId, userEffect);
              effects.push(userEffect);
              console.log(`✅ Loaded user effect: ${userEffectId} (${userEffect.name})`);
            }
          } catch (error) {
            console.warn(`❌ Could not load user effect from ${filePath}:`, error);
          }
        }
      } else {
        // Non-Electron: silently skip to avoid console noise
        console.info('User effect autoload skipped (non-Electron environment).');
      }
    } catch (error) {
      console.error('❌ Error loading user effects:', error);
    }

    console.log(`🎯 Loaded ${effects.length} user effects from ${directoryPath}`);
    return effects;
  }

  /**
   * Load a user effect from a specific file path
   */
  private async loadUserEffectFromPath(filePath: string, baseDirectory: string): Promise<ReactSelfContainedEffect | null> {
    try {
      // Prefer direct content load via preload bridge if present
      const electron = (window as any)?.electron;
      if (electron && typeof electron.readFileText === 'function') {
        const code = await electron.readFileText(filePath);
        return await this.loadUserEffectFromContent(code, String(filePath).split(/[\\\/]/).pop());
      }

      const path = (window as any).require('path');
      const fs = (window as any).require('fs');
      const absolutePath = path.resolve(filePath);
      console.log(`🔍 Attempting to load user effect from: ${absolutePath}`);
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      const tempFileName = `temp-user-${Date.now()}-${path.basename(filePath)}`;
      const tempPath = path.join(__dirname, '../effects', tempFileName);
      try {
        fs.writeFileSync(tempPath, fileContent);
        // Only try effects imports in Electron environment
        const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
        let module: any;
        if (isElectron) {
          module = await eval(`import("../effects/${tempFileName.replace('.tsx', '')}")`);
        } else {
          // Web version - effects not available
          console.log(`Web version: Effects not available`);
          return null;
        }
        fs.unlinkSync(tempPath);
        const component = module.default || module[`${path.basename(filePath, '.tsx')}Component`];
        const metadata = module.metadata || component?.metadata || module[`${path.basename(filePath, '.tsx')}Metadata`];
        if (!component) { console.warn(`❌ No component found in user effect file: ${filePath}`); return null; }

        const baseFileName = path.basename(filePath);
        const id = this.generateEffectId(baseFileName);
        const name = metadata?.name || this.generateEffectName(baseFileName);
        const category = metadata?.category || 'User Effects';
        const description = metadata?.description || `${name} (user effect)`;
        const icon = metadata?.icon || '';

        const effect: ReactSelfContainedEffect = {
          id,
          name,
          description,
          category,
          icon,
          author: metadata?.author || 'User',
          version: metadata?.version || '1.0.0',
          metadata: {
            parameters: metadata?.parameters || [],
            category,
            type: 'react-component',
            component,
            folder: 'user-effects',
            isUserEffect: true
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

        return effect;
      } catch (importError) {
        // Clean up temporary file if it exists
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch {}
        throw importError;
      }
    } catch (error) {
      console.error(`❌ Error loading user effect from ${filePath}:`, error);
      return null;
    }
  }

  // Recursively scan directory using fsApi bridge
  private scanDirectoryRecursivelyFsApi(dirPath: string): string[] {
    const fsApi = (window as any)?.fsApi;
    const results: string[] = [];
    if (!fsApi || typeof fsApi.listDirectory !== 'function') return results;
    try {
      const stack: string[] = [dirPath];
      while (stack.length) {
        const current = stack.pop() as string;
        const entries: Array<{ name: string; path: string; isDirectory: boolean }>
          = fsApi.listDirectory(current) || [];
        for (const e of entries) {
          if (e.isDirectory) stack.push(e.path);
          else if (/\.(tsx?|jsx?|mjs)$/i.test(e.name) && !e.name.startsWith('.')) results.push(e.path);
        }
      }
    } catch (e) {
      console.warn('scanDirectoryRecursivelyFsApi error:', e);
    }
    return results;
  }

  /**
   * Get all effects including user effects
   */
  getAllEffects(): ReactSelfContainedEffect[] {
    const builtInEffects = Array.from(this.discoveredEffects.values());
    const userEffects = Array.from(this.userEffects.values());
    return [...builtInEffects, ...userEffects];
  }

  /**
   * Get user effects only
   */
  getUserEffects(): ReactSelfContainedEffect[] {
    return Array.from(this.userEffects.values());
  }

  /**
   * Clear user effects
   */
  clearUserEffects(): void {
    this.userEffects.clear();
    this.userEffectImports.clear();
  }

  /**
   * Remove a specific user effect by source name (e.g., 'ai-live-edit.js')
   */
  removeUserEffectBySourceName(sourceName: string): boolean {
    const idBase = sourceName.replace(/\.(js|mjs)$/i, '') || 'user-effect';
    const id = this.generateEffectId(`${idBase}.tsx`);
    const effectId = `user-${id}`;
    
    const removed = this.userEffects.delete(effectId);
    if (removed) {
      // Also try to remove from registry
      try {
        const { unregisterEffect } = require('./effectRegistry');
        unregisterEffect(effectId);
      } catch {}
    }
    return removed;
  }

  /**
   * Load a single user effect from raw JS module content (ESM), suitable for external .js files.
   * The module must export default React component and optional `metadata`.
   * Note: External JS must not use bare imports; rely on globals (window.React, window.THREE, window.r3f).
   */
  async loadUserEffectFromContent(moduleText: string, sourceName = 'user-effect.js'): Promise<ReactSelfContainedEffect | null> {
    try {
      // Sanitize TS-style `as any` casts in external JS to avoid syntax errors
      // Only for .js/.mjs portable modules
      let sanitized = moduleText;
      try {
        if (/\bas\s+any\b|\bas\s+number\b|\bas\s+string\b|\bas\s+unknown\b|\bas\s+boolean\b/.test(moduleText)) {
          sanitized = sanitized
            .replace(/\s+as\s+any\b/g, '')
            .replace(/\s+as\s+number\b/g, '')
            .replace(/\s+as\s+string\b/g, '')
            .replace(/\s+as\s+unknown\b/g, '')
            .replace(/\s+as\s+boolean\b/g, '');
        }
      } catch {}
      
      // Wrap the module code to inject stub refs that user effects might reference at module scope
      // This prevents "ReferenceError: X is not defined" errors during module evaluation
      // We inject these as const declarations before the user code so they're available in the same scope
      const stubRefs = [
        'feedbackCanvasRef', 
        'feedbackCtxRef',
        'feedbackTextureRef',
        'canvasRef', 
        'videoRef', 
        'audioRef', 
        'mainCanvasRef',
        'ctxRef',
        'glRef',
        'renderTargetRef',
        'outputCanvasRef',
        'inputCanvasRef',
        'sourceCanvasRef',
        'destinationCanvasRef',
        'textureRef',
        'inputTextureRef',
        'outputTextureRef',
        'sourceTextureRef',
        'destinationTextureRef',
        'previousTextureRef',
        'nextTextureRef',
        'webglRef',
        'webgl2Ref',
        'rendererRef',
        'sceneRef',
        'cameraRef'
      ];
      const stubDeclarations = stubRefs.map(refName => 
        `const ${refName} = { current: null };`
      ).join('\n');
      
      const wrappedCode = `${stubDeclarations}\n\n${sanitized}`;
      
      // Build a blob URL for dynamic import (CSP allows blob: but may block data:)
      const blob = new Blob([wrappedCode], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const module: any = await import(/* @vite-ignore */ url);
      try { URL.revokeObjectURL(url); } catch {}
      
      return await this.processLoadedUserEffectModule(module, sourceName);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // Provide more helpful context for common user effect errors
      if (errorMessage.includes('feedbackCanvasRef') || errorMessage.includes('is not defined')) {
        console.error(`Failed to load user effect from JS content: ${errorMessage}. User effects cannot reference React refs or browser-specific APIs. They should be pure React components that receive props.`, e);
      } else {
        console.error('Failed to load user effect from JS content:', e);
      }
      return null;
    }
  }

  /**
   * Process a successfully loaded user effect module
   */
  private async processLoadedUserEffectModule(module: any, sourceName: string): Promise<ReactSelfContainedEffect | null> {
    const component = module.default;
    const metadata = module.metadata || component?.metadata || {};
    if (!component || typeof component !== 'function') {
      console.warn('User JS did not export a default React component');
      return null;
    }

    const baseFileName = sourceName.replace(/[^a-zA-Z0-9_.\/-]/g, '');
    const idBase = baseFileName.replace(/\.(js|mjs)$/i, '') || 'user-effect';
    const fileSlug = this.generateEffectId(`${idBase}.tsx`); // reuse normalization
    const name = metadata?.name || this.generateEffectName(idBase);
    const category = metadata?.category || (metadata?.isSource ? 'Sources' : 'Effects');
    const description = metadata?.description || `${name} (user effect)`;
    const icon = metadata?.icon || '';

    // Canonical ID for presets: name-based slug so sets are portable across machines.
    const nameSlug = this.generateEffectId(`${name}.tsx`);
    const canonicalId = nameSlug || `user-${fileSlug || 'effect'}`;

    // Backwards-compatible legacy ID derived from file name (old behavior)
    const legacyId = `user-${fileSlug}`;

    const effectId = canonicalId;
    // Attach metadata to component so UI/EffectChain can read params directly
    try { (component as any).metadata = metadata; } catch {}

    // Register with effect registry so synchronous lookups work
    try {
      const { registerEffect } = await import('./effectRegistry');
      registerEffect(effectId, component as any);
      if (legacyId && legacyId !== effectId) {
        registerEffect(legacyId, component as any);
      }
    } catch {}

    const effect: ReactSelfContainedEffect = {
      id: effectId,
      name,
      description,
      category,
      icon,
      author: metadata?.author || 'User',
      version: metadata?.version || '1.0.0',
      metadata: {
        parameters: metadata?.parameters || [],
        category,
        type: 'react-component',
        component,
        folder: String(sourceName || '').includes('bank/') ? 'bank' : 'user-effects',
        isSource: !!metadata?.isSource,
        isUserEffect: !String(sourceName || '').includes('bank/'),
        sourcePath: sourceName,
      },
      createEffect: (width: number, height: number): ReactEffectInstance => ({
        id: effectId,
        name,
        component,
        width,
        height,
      }),
    };

    this.userEffects.set(effect.id, effect);
    return effect;
  }

  /**
   * Determine the folder category (visual-effects or sources) from a normalized path
   */
  private getFolderCategory(normalizedPath: string): string {
    if (normalizedPath.includes('/bank/sources/') || normalizedPath.startsWith('bank/sources/')) {
      return 'sources';
    }
    if (normalizedPath.includes('/bank/effects/') || normalizedPath.startsWith('bank/effects/')) {
      return 'effects';
    }
    if (normalizedPath.includes('effects') || normalizedPath.includes('visual-effects')) {
      return 'effects';
    } else if (normalizedPath.includes('sources')) {
      return 'sources';
    }
    if (normalizedPath.includes('external-bank')) return 'bank';
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