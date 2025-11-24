/**
 * AI Template Loader
 * 
 * Dynamically discovers and loads AI provider templates from the templates directory.
 * Similar to how effects are discovered, templates are loaded from src/ai-templates/
 */

import { AITemplate } from '../types/aiTemplate';

export class AITemplateLoader {
  private static instance: AITemplateLoader;
  private templates: Map<string, AITemplate> = new Map();
  private loaded: boolean = false;

  private constructor() {}

  static getInstance(): AITemplateLoader {
    if (!AITemplateLoader.instance) {
      AITemplateLoader.instance = new AITemplateLoader();
    }
    return AITemplateLoader.instance;
  }

  /**
   * Reload templates (forces refresh even if already loaded)
   */
  async reloadTemplates(): Promise<void> {
    this.loaded = false;
    this.templates.clear();
    await this.loadTemplates();
  }

  /**
   * Load all templates from the templates directory
   * Priority: User templates in Documents folder > Bundled templates from extraResources > Module imports
   */
  async loadTemplates(): Promise<void> {
    if (this.loaded) return;

    try {
      console.log('🔄 Loading AI templates...');
      
      // Clear templates map first to ensure fresh load
      this.templates.clear();
      
      // Strategy 1: Check if Documents folder EXISTS (even if empty)
      // If folder exists, ONLY load templates from there - respects user deletions
      // If folder doesn't exist, load bundled templates as fallback
      const electron = (window as any)?.electron;
      const fsApi = (window as any)?.fsApi;
      
      console.log(`🔍 Electron APIs check:`, {
        electron: !!electron,
        fsApi: !!fsApi,
        getDocumentsFolder: !!(electron?.getDocumentsFolder),
        listDirectory: !!(fsApi?.listDirectory),
        exists: !!(fsApi?.exists),
      });
      
      if (!electron) {
        console.warn('⚠️  window.electron is not available');
      }
      if (!fsApi) {
        console.warn('⚠️  window.fsApi is not available');
      }
      
      let userFolderExists = false;
      let userTemplateFiles: string[] = [];
      
      if (electron?.getDocumentsFolder && fsApi) {
        try {
          const docsResult = await electron.getDocumentsFolder();
          if (docsResult?.success && docsResult?.path) {
            // getDocumentsFolder() already returns Documents/Sonomika, so just add ai-templates
            const aiTemplatesPath = fsApi.join(docsResult.path, 'ai-templates');
            console.log(`🔍 Checking for user templates...`);
            console.log(`   Documents/Sonomika path: ${docsResult.path}`);
            console.log(`   AI templates path: ${aiTemplatesPath}`);
            
            // First check if folder exists using fsApi.exists
            const folderExists = fsApi.exists && fsApi.exists(aiTemplatesPath);
            
            if (folderExists) {
              // Folder EXISTS - list contents (may be empty)
              try {
                const entries = fsApi.listDirectory(aiTemplatesPath) || [];
                // Check what template files are in it
                const templateEntries = entries.filter((entry: any) => 
                  !entry.isDirectory && entry.name && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))
                );
                userTemplateFiles = templateEntries.map((e: any) => e.name);
                userFolderExists = true; // Folder exists, regardless of whether it has files
                console.log(`✅ User templates folder EXISTS at: ${aiTemplatesPath}`);
                console.log(`   Found ${userTemplateFiles.length} template file(s) in folder`);
                if (userTemplateFiles.length > 0) {
                  console.log(`   Files: ${userTemplateFiles.join(', ')}`);
                } else {
                  console.log(`   ⚠️  Folder is EMPTY - respecting user deletion (NO templates will be shown)`);
                }
              } catch (e) {
                // Folder exists but can't list it (permission issue?)
                console.log(`⚠️  User templates folder exists but cannot list contents: ${aiTemplatesPath}`);
                console.log(`   Error: ${e}`);
                userFolderExists = true; // Still exists, just can't read it - respect user by showing nothing
              }
            } else {
              // Folder doesn't exist
              console.log(`❌ User templates folder does NOT exist at: ${aiTemplatesPath}`);
              console.log(`   Will load bundled templates as fallback`);
              userFolderExists = false;
            }
          }
        } catch (e) {
          console.error('❌ Could not check Documents folder:', e);
          console.error('   Error details:', String(e));
        }
      } else {
        console.warn('⚠️  Electron APIs not available - cannot check user templates folder');
        console.warn('   electron:', !!electron, 'fsApi:', !!fsApi);
      }

      if (userFolderExists) {
        // User folder EXISTS - ONLY load from there (respects deletions, even if folder is empty)
        // If user deleted all templates, folder exists but is empty, so we show no templates
        console.log(`📁 User templates folder exists - loading ONLY from user folder (no bundled fallback)`);
        await this.loadUserTemplates();
        console.log(`✅ Final result: ${this.templates.size} template(s) loaded from Documents folder`);
        if (this.templates.size > 0) {
          console.log(`   Templates: ${Array.from(this.templates.keys()).join(', ')}`);
        } else {
          console.log(`   ⚠️  NO templates loaded - folder is empty (user deletion respected)`);
        }
        // CRITICAL: Don't load bundled templates - user has full control
        // Even if folder is empty, we respect that and show no templates
      } else {
        // User folder doesn't exist - load bundled templates as fallback (first time setup)
        console.log('📦 User templates folder does not exist - loading bundled templates as fallback');
        
        // Try loading from extraResources first
        await this.loadTemplatesFromExtraResources();
        console.log(`After extraResources load: ${this.templates.size} templates`);

        // Then try dynamic imports
        await this.loadBundledTemplates();
        console.log(`After bundled load: ${this.templates.size} templates`);

        // Note: Direct imports removed - templates are loaded from Documents folder
        // or from extraResources. If no templates found, user needs to check their setup.
      }
      
      if (this.templates.size === 0) {
        console.error('❌ No AI templates loaded! Checked:');
        console.error('  - Bundled modules (via import)');
        console.error('  - Documents/Sonomika/ai-templates/');
        console.error('  - extraResources/src/ai-templates/');
        console.error('  - Direct imports');
      } else {
        console.log(`✅ Loaded ${this.templates.size} AI template(s):`, Array.from(this.templates.keys()));
      }
      this.loaded = true;
    } catch (error) {
      console.error('Failed to load AI templates:', error);
      this.loaded = true; // Mark as loaded even on error to prevent retry loops
    }
  }

  /**
   * Load user templates from Documents/Sonomika/ai-templates/ folder
   */
  private async loadUserTemplates(): Promise<void> {
    try {
      // Check if we're in Electron and can access Documents folder
      const electron = (window as any)?.electron;
      const fsApi = (window as any)?.fsApi;
      
      if (!electron?.getDocumentsFolder || !fsApi?.listDirectory || !electron?.readFileText) {
        return; // Not in Electron or APIs not available
      }

      const docsResult = await electron.getDocumentsFolder();
      if (!docsResult?.success || !docsResult?.path) {
        return;
      }

      // getDocumentsFolder() already returns Documents/Sonomika, so just add ai-templates
      const aiTemplatesPath = fsApi.join(docsResult.path, 'ai-templates');
      
      console.log(`📂 loadUserTemplates() - Loading from: ${aiTemplatesPath}`);
      
      // Check if user templates folder exists
      let entries: any[] = [];
      try {
        entries = fsApi.listDirectory(aiTemplatesPath) || [];
        console.log(`   Found ${entries.length} total entries in folder`);
      } catch (e) {
        // Folder doesn't exist yet, that's okay
        console.log(`   Folder doesn't exist or can't be accessed: ${e}`);
        return;
      }

      // Filter to template files only - we only support plain JavaScript user templates (.js)
      const templateFiles = entries.filter((entry: any) => 
        !entry.isDirectory && entry.name && entry.name.endsWith('.js')
      );
      console.log(`   Found ${templateFiles.length} template file(s) to load`);

      // Load each template file (.ts or .js files for user templates)
      for (const entry of templateFiles) {
        // Check if it's a file (not a directory) and ends with .js or .ts
        if (entry.isDirectory || (!entry.name.endsWith('.js') && !entry.name.endsWith('.ts'))) {
          continue; // Skip directories and non-template files
        }

        const filePath = fsApi.join(aiTemplatesPath, entry.name);
        try {
          const fileContent = await electron.readFileText(filePath);
          
          console.log(`   📄 Reading template file: ${entry.name} (${fileContent.length} chars)`);
          
          // For user templates we expect plain JavaScript, so use the content as-is
          const processedContent = fileContent;
          
          console.log(`   🔧 Using user template code as-is (${processedContent.length} chars)`);
          
          // Execute the template code in a safe context
          const exports: any = {};
          const module: any = { exports };
          
          // Simplified execution: The function body IS the module scope.
          // We explicitly return the exports at the end.
          const functionBody = `
            ${processedContent}
            
            // Return the exported value
            if (typeof module !== 'undefined' && module.exports && (module.exports.default || module.exports)) {
              return module.exports.default || module.exports;
            }
            if (typeof exports !== 'undefined' && exports.default) {
              return exports.default;
            }
            return exports;
          `;
          
          try {
            // Create a function that acts as the module wrapper
            // Arguments: exports, module, require (dummy)
            const templateFactory = new Function('exports', 'module', 'require', functionBody);
            
            // Execute it
            const dummyRequire = () => ({});
            const template = templateFactory(exports, module, dummyRequire);
            
            console.log(`   🔍 Template execution result:`, template ? `Found template with id: ${template.id || 'unknown'}` : 'null or undefined');
          
            // Temporarily disable Grok by ID
            if (template && this.isValidTemplate(template) && template.id !== 'grok') {
              // User templates override bundled ones
              this.templates.set(template.id, template);
              console.log(`   ✅ Loaded user AI template: ${template.id} (${template.name}) from ${filePath}`);
            } else {
              console.log(`   ⚠️  Failed to load template from ${filePath}: invalid or missing`);
              if (template) {
                console.log(`      Template object keys:`, Object.keys(template || {}));
              }
            }
          } catch (execError) {
            console.error(`   ❌ Failed to execute template code from ${filePath}:`, execError);
            console.error(`      Error message:`, String(execError));
            console.error(`      Error stack:`, execError instanceof Error ? execError.stack : 'no stack');
          }
        } catch (error) {
          console.error(`   ❌ Failed to read/process user template from ${filePath}:`, error);
        }
      }
      
      console.log(`📂 loadUserTemplates() complete - loaded ${this.templates.size} template(s) total`);
    } catch (error) {
      console.error('Could not load user templates:', error);
    }
  }

  /**
   * Load bundled templates from src/ai-templates/
   */
  private async loadBundledTemplates(): Promise<void> {
    // Try multiple approaches to load templates
    
    // Approach 1: Try importing bundled modules (works in both dev and packaged app)
    const bundledTemplates = [
      { id: 'openai', paths: ['../ai-templates/openai', './ai-templates/openai'] },
      { id: 'grok', paths: ['../ai-templates/grok', './ai-templates/grok'] },
      { id: 'gemini', paths: ['../ai-templates/gemini', './ai-templates/gemini'] },
    ];

    for (const { id, paths } of bundledTemplates) {
      // Skip if already loaded
      if (this.templates.has(id)) {
        continue;
      }

      // Try each path
      for (const templatePath of paths) {
        try {
          const module = await import(templatePath);
          const template = module.default;
          if (template && this.isValidTemplate(template)) {
            this.templates.set(template.id, template);
            console.log(`Loaded bundled AI template via import: ${template.id} (${template.name}) from ${templatePath}`);
            break; // Success, move to next template
          }
        } catch (error) {
          // Try next path
          console.debug(`Import failed for ${id} from ${templatePath}:`, error);
        }
      }
    }

    // Approach 2: Try glob-based discovery for any additional bundled templates
    try {
      const templateGlobs: Record<string, () => Promise<any>> = {
        ...(import.meta as any).glob('../ai-templates/**/*.ts', { eager: false }),
        ...(import.meta as any).glob('../ai-templates/**/*.js', { eager: false }),
      };

      for (const [path, loader] of Object.entries(templateGlobs)) {
        // Skip already loaded templates
        if (path.includes('openai') || path.includes('grok') || path.includes('gemini')) {
          continue;
        }

        try {
          const module = await loader();
          const template = module.default || module.template;
          
          if (template && this.isValidTemplate(template) && template.id !== 'grok') {
            // Only add if not already loaded
            if (!this.templates.has(template.id)) {
              this.templates.set(template.id, template);
              console.log(`Loaded bundled AI template: ${template.id} (${template.name}) from ${path}`);
            }
          }
        } catch (error) {
          console.warn(`Failed to load bundled template from ${path}:`, error);
        }
      }
    } catch (error) {
      // Glob might not work in all contexts, that's okay
      console.debug('Glob-based template discovery not available:', error);
    }
  }

  /**
   * Load templates from extraResources (packaged app location)
   * Templates are in resources/src/ai-templates/
   */
  private async loadTemplatesFromExtraResources(): Promise<void> {
    try {
      const electron = (window as any)?.electron;
      const fsApi = (window as any)?.fsApi;
      
      if (!electron?.readFileText || !fsApi?.join || !fsApi?.listDirectory) {
        return;
      }

      // Check extraResources location: resources/src/ai-templates
      const resourcesPath = (process as any).resourcesPath;
      if (!resourcesPath) {
        console.debug('No resourcesPath available for loading templates from extraResources');
        return;
      }

      const extraResourcesPath = fsApi.join(resourcesPath, 'src', 'ai-templates');
      
      // Check if the path exists
      let entries: any[] = [];
      try {
        entries = fsApi.listDirectory(extraResourcesPath) || [];
        console.log(`Found ${entries.length} files in extraResources: ${extraResourcesPath}`);
      } catch (e) {
        console.debug(`extraResources path doesn't exist: ${extraResourcesPath}`, e);
        return;
      }

      // Load each template file
      for (const entry of entries) {
        if (entry.isDirectory || (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js'))) {
          continue;
        }

        const filePath = entry.path || fsApi.join(extraResourcesPath, entry.name);
        try {
          const fileContent = await electron.readFileText(filePath);
          
          if (!fileContent || fileContent.trim().length === 0) {
            console.warn(`Empty template file: ${filePath}`);
            continue;
          }
          
          // Execute the template code
          const exports: any = {};
          const module: any = { exports };
          
          const wrappedCode = `
            (function(exports, module) {
              ${fileContent}
              if (typeof module.exports !== 'undefined') {
                return module.exports.default || module.exports;
              }
              if (typeof exports.default !== 'undefined') {
                return exports.default;
              }
              return null;
            })
          `;
          
          const templateFactory = new Function('exports', 'module', `return ${wrappedCode}`)(exports, module);
          const template = templateFactory(exports, module);
          
          if (template && this.isValidTemplate(template) && template.id !== 'grok') {
            if (!this.templates.has(template.id)) {
              this.templates.set(template.id, template);
              console.log(`Loaded bundled AI template from extraResources: ${template.id} (${template.name}) from ${filePath}`);
            }
          } else {
            console.warn(`Invalid template loaded from ${filePath}`);
          }
        } catch (error) {
          console.warn(`Failed to load template from extraResources ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.debug('Could not load templates from extraResources:', error);
    }
  }

  /**
   * Get all loaded templates
   */
  getAllTemplates(): AITemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): AITemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get the default template (OpenAI if available, otherwise first template)
   */
  getDefaultTemplate(): AITemplate | undefined {
    return this.templates.get('openai') || this.getAllTemplates()[0];
  }

  /**
   * Validate template structure
   */
  private isValidTemplate(template: any): template is AITemplate {
    return (
      template &&
      typeof template.id === 'string' &&
      typeof template.name === 'string' &&
      typeof template.apiEndpoint === 'string' &&
      typeof template.defaultModel === 'string' &&
      Array.isArray(template.models) &&
      typeof template.buildRequestBody === 'function' &&
      typeof template.buildRequestHeaders === 'function' &&
      typeof template.extractResponseText === 'function'
    );
  }


  /**
   * Reload templates (useful if templates are added dynamically)
   */
  async reload(): Promise<void> {
    this.templates.clear();
    this.loaded = false;
    await this.loadTemplates();
  }
}

