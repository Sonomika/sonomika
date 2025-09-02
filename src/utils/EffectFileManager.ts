// Effect File Manager
// Handles creation, saving, and management of AI-generated effect files

import { GeneratedEffectCode } from '../services/OpenAIService';

export interface EffectFileInfo {
  id: string;
  name: string;
  description: string;
  category: 'visual-effects' | 'sources';
  filePath: string;
  createdAt: Date;
  modifiedAt: Date;
  size: number;
}

export class EffectFileManager {
  private static instance: EffectFileManager;
  private aiGeneratedEffectsPath: string;

  private constructor() {
    // Determine the path for AI-generated effects
    this.aiGeneratedEffectsPath = 'src/effects/ai-generated';
  }

  static getInstance(): EffectFileManager {
    if (!EffectFileManager.instance) {
      EffectFileManager.instance = new EffectFileManager();
    }
    return EffectFileManager.instance;
  }

  // Save a generated effect to the file system
  async saveEffect(effect: GeneratedEffectCode): Promise<EffectFileInfo> {
    try {
      // Ensure the AI-generated effects directory exists
      await this.ensureDirectoryExists();

      // Determine the file path based on category
      const categoryPath = effect.category === 'sources' ? 'sources' : 'visual-effects';
      const fileName = this.generateFileName(effect.name);
      const filePath = `${this.aiGeneratedEffectsPath}/${categoryPath}/${fileName}`;

      // Create the file content
      const fileContent = this.formatEffectCode(effect);

      // Save the file (in Electron, we can use Node.js fs)
      if (typeof window !== 'undefined' && (window as any).require) {
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        
        // Ensure the category directory exists
        const categoryDir = path.join(__dirname, `../effects/ai-generated/${categoryPath}`);
        if (!fs.existsSync(categoryDir)) {
          fs.mkdirSync(categoryDir, { recursive: true });
        }

        // Write the file
        const fullPath = path.join(__dirname, `../effects/ai-generated/${categoryPath}/${fileName}`);
        fs.writeFileSync(fullPath, fileContent, 'utf8');

        // Get file stats
        const stats = fs.statSync(fullPath);

        return {
          id: effect.id,
          name: effect.name,
          description: effect.description,
          category: effect.category,
          filePath: fullPath,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          size: stats.size,
        };
      } else {
        // In browser environment, we can't write files directly
        // Instead, we'll store in localStorage and trigger a download
        const fileContent = this.formatEffectCode(effect);
        const blob = new Blob([fileContent], { type: 'text/typescript' });
        const url = URL.createObjectURL(blob);
        
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return {
          id: effect.id,
          name: effect.name,
          description: effect.description,
          category: effect.category,
          filePath: `downloads/${fileName}`,
          createdAt: new Date(),
          modifiedAt: new Date(),
          size: blob.size,
        };
      }
    } catch (error) {
      console.error('Failed to save effect:', error);
      throw new Error(`Failed to save effect: ${error}`);
    }
  }

  // List all AI-generated effects
  async listAIGeneratedEffects(): Promise<EffectFileInfo[]> {
    try {
      if (typeof window !== 'undefined' && (window as any).require) {
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        
        const effects: EffectFileInfo[] = [];
        const basePath = path.join(__dirname, '../effects/ai-generated');
        
        if (!fs.existsSync(basePath)) {
          return effects;
        }

        // Scan both visual-effects and sources directories
        const categories = ['visual-effects', 'sources'];
        
        for (const category of categories) {
          const categoryPath = path.join(basePath, category);
          if (fs.existsSync(categoryPath)) {
            const files = fs.readdirSync(categoryPath);
            
            for (const file of files) {
              if (file.endsWith('.tsx')) {
                const filePath = path.join(categoryPath, file);
                const stats = fs.statSync(filePath);
                
                // Extract effect info from filename
                const name = this.extractNameFromFileName(file);
                const id = this.generateIdFromFileName(file);
                
                effects.push({
                  id,
                  name,
                  description: `AI-generated ${category === 'sources' ? 'source' : 'effect'}`,
                  category: category as 'visual-effects' | 'sources',
                  filePath,
                  createdAt: stats.birthtime,
                  modifiedAt: stats.mtime,
                  size: stats.size,
                });
              }
            }
          }
        }

        return effects.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
      } else {
        // In browser, return empty array
        return [];
      }
    } catch (error) {
      console.error('Failed to list AI-generated effects:', error);
      return [];
    }
  }

  // Delete an AI-generated effect
  async deleteEffect(effectId: string): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && (window as any).require) {
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        
        // Find the effect file
        const effects = await this.listAIGeneratedEffects();
        const effect = effects.find(e => e.id === effectId);
        
        if (!effect) {
          throw new Error('Effect not found');
        }

        // Delete the file
        fs.unlinkSync(effect.filePath);
        return true;
      } else {
        // In browser, we can't delete files
        return false;
      }
    } catch (error) {
      console.error('Failed to delete effect:', error);
      return false;
    }
  }

  // Load an effect file
  async loadEffect(effectId: string): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && (window as any).require) {
        const fs = (window as any).require('fs');
        
        // Find the effect file
        const effects = await this.listAIGeneratedEffects();
        const effect = effects.find(e => e.id === effectId);
        
        if (!effect) {
          return null;
        }

        // Read the file content
        return fs.readFileSync(effect.filePath, 'utf8');
      } else {
        return null;
      }
    } catch (error) {
      console.error('Failed to load effect:', error);
      return null;
    }
  }

  // Ensure the AI-generated effects directory exists
  private async ensureDirectoryExists(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).require) {
      const fs = (window as any).require('fs');
      const path = (window as any).require('path');
      
      const basePath = path.join(__dirname, '../effects/ai-generated');
      if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
      }

      // Ensure category directories exist
      const categories = ['visual-effects', 'sources'];
      for (const category of categories) {
        const categoryPath = path.join(basePath, category);
        if (!fs.existsSync(categoryPath)) {
          fs.mkdirSync(categoryPath, { recursive: true });
        }
      }
    }
  }

  // Generate a safe filename from effect name
  private generateFileName(effectName: string): string {
    // Convert to kebab-case and add timestamp for uniqueness
    const kebabCase = effectName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const timestamp = Date.now();
    return `${kebabCase}-${timestamp}.tsx`;
  }

  // Extract name from filename
  private extractNameFromFileName(fileName: string): string {
    // Remove .tsx extension and timestamp
    const withoutExt = fileName.replace('.tsx', '');
    const parts = withoutExt.split('-');
    
    // Remove timestamp (last part if it's a number)
    if (parts.length > 1 && !isNaN(Number(parts[parts.length - 1]))) {
      parts.pop();
    }
    
    // Convert back to title case
    return parts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // Generate ID from filename
  private generateIdFromFileName(fileName: string): string {
    const withoutExt = fileName.replace('.tsx', '');
    return withoutExt.replace(/-/g, '-');
  }

  // Format the effect code for saving
  private formatEffectCode(effect: GeneratedEffectCode): string {
    // Add header comment
    const header = `// AI Generated Effect: ${effect.name}
// Generated on: ${new Date().toISOString()}
// Description: ${effect.description}
// Category: ${effect.category}

`;

    return header + effect.code;
  }

  // Validate effect code before saving
  validateEffectCode(code: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required imports
    if (!code.includes('import React')) {
      errors.push('Missing React import');
    }
    if (!code.includes('@react-three/fiber')) {
      errors.push('Missing React Three Fiber import');
    }
    if (!code.includes('three')) {
      errors.push('Missing Three.js import');
    }

    // Check for required structure
    if (!code.includes('registerEffect')) {
      errors.push('Missing effect registration');
    }
    if (!code.includes('.metadata')) {
      errors.push('Missing metadata definition');
    }
    if (!code.includes('export default')) {
      errors.push('Missing default export');
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /setTimeout\s*\(/,
      /setInterval\s*\(/,
      /XMLHttpRequest/,
      /fetch\s*\(/,
      /import\s*\(/,
    ];

    dangerousPatterns.forEach(pattern => {
      if (pattern.test(code)) {
        errors.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export default EffectFileManager;


