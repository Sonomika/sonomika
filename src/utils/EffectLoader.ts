import React from 'react';
import { getEffect } from './effectRegistry';
const DEBUG_EFFECTS = !!(typeof window !== 'undefined' && (window as any).__DEBUG_EFFECTS);

const normalizeEffectId = (id: string) =>
  String(id || '')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// Preload all effect modules eagerly once so they self-register synchronously
try {
  const eagerModules = (import.meta as any).glob('../bank/**/*.{tsx,jsx,ts,js}', { eager: true });
  if (DEBUG_EFFECTS) console.log('🧪 Eager-loaded effect modules:', Object.keys(eagerModules));
} catch (e) {
  if (DEBUG_EFFECTS) console.warn('⚠️ Eager preload failed; will rely on lazy loading only');
}

// Test what modules are available (lazy map)
const testModules = (import.meta as any).glob('../bank/**/*.{tsx,jsx,ts,js}');
if (DEBUG_EFFECTS) console.log('🧪 Available effect modules (lazy map):', Object.keys(testModules));

/**
 * Loads an effect component dynamically from the effects folder
 * @param effectId - The filename of the effect to load (without .tsx extension)
 * @returns A React component or null if loading fails
 */
export const loadEffectComponent = async (effectId: string): Promise<React.ComponentType<any> | null> => {
  if (DEBUG_EFFECTS) console.log(`🚀 loadEffectComponent called with effectId: ${effectId}`);
  
  // Handle undefined or invalid effect IDs
  if (!effectId || effectId === 'unknown' || effectId === 'undefined') {
    console.warn(`Invalid effect ID: ${effectId}`);
    return null;
  }

  try {
    const normalizedEffectId = normalizeEffectId(effectId);
    // Try to load the effect by filename directly (search subfolders)
    const modules = (import.meta as any).glob('../bank/**/*.{tsx,jsx,ts,js}');
    
    // Try the exact filename first
    const exactPathTsx = `../bank/${normalizedEffectId}.tsx`;
    const exactPathJs = `../bank/${normalizedEffectId}.js`;
    const exactPathTs = `../bank/${normalizedEffectId}.ts`;
    const exactPathJsx = `../bank/${normalizedEffectId}.jsx`;
    
    if (DEBUG_EFFECTS) {
      console.log(`🔍 Loading effect: ${effectId}`);
      console.log(`🔍 Available modules:`, Object.keys(modules));
      console.log(`🔍 Trying exact paths:`, { exactPathTsx, exactPathJs, exactPathTs, exactPathJsx });
    }

    const exact = modules[exactPathTsx] || modules[exactPathJs] || modules[exactPathTs] || modules[exactPathJsx];
    if (exact) {
      if (DEBUG_EFFECTS) console.log(`✅ Found effect at exact path`);
      try {
        const mod = await exact();
        if (DEBUG_EFFECTS) {
          console.log(`✅ Effect module loaded:`, mod);
          console.log(`🔍 Module keys:`, Object.keys(mod));
          console.log(`🔍 Module default:`, mod.default);
          console.log(`🔍 Module default type:`, typeof mod.default);
        }
        return mod.default;
      } catch (loadError) {
        console.error(`❌ Failed to load effect module ${effectId}:`, loadError);
        // Return null instead of crashing
        return null;
      }
    }

    // If exact match not found, try to find by partial match
    const availableFiles = Object.keys(modules);
    if (DEBUG_EFFECTS) console.log(`🔍 Available files:`, availableFiles);
    
    // Try to find a file that matches the effectId (could be kebab-case or original filename)
    const matchingFile = availableFiles.find(file => {
      const fileName = file.replace('../bank/', '').replace(/\.(tsx|ts|js|jsx)$/,'');
      
      // Check if the effectId matches the filename directly
      if (fileName === normalizedEffectId) return true;
      
      // Check if the effectId is a kebab-case version of the filename
      const kebabCaseFileName = fileName
        .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, (match) => `-${match.toLowerCase()}`)
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')
        .replace(/-+$/, '')
        .replace(/-+/g, '-');
      
      if (kebabCaseFileName === normalizedEffectId) return true;
      
      // Check if the filename is a kebab-case version of the effectId
      const camelCaseEffectId = normalizedEffectId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
      
      if (fileName === camelCaseEffectId || fileName === camelCaseEffectId + 'Effect') return true;
      
      // Fallback: check if either contains the other
      const matches = file.includes(normalizedEffectId) || normalizedEffectId.includes(fileName) || fileName.endsWith(`/${camelCaseEffectId}`) || fileName.endsWith(`/${camelCaseEffectId}Effect`);
      if (DEBUG_EFFECTS) console.log(`🔍 Checking file: ${file} (${fileName}) against ${normalizedEffectId} - matches: ${matches}`);
      return matches;
    });
    
    if (matchingFile) {
      if (DEBUG_EFFECTS) console.log(`✅ Found effect by partial match: ${matchingFile}`);
      try {
        const mod = await modules[matchingFile]();
        if (DEBUG_EFFECTS) {
          console.log(`✅ Effect module loaded:`, mod);
          console.log(`🔍 Module keys:`, Object.keys(mod));
          console.log(`🔍 Module default:`, mod.default);
          console.log(`🔍 Module default type:`, typeof mod.default);
        }
        return mod.default;
      } catch (loadError) {
        console.error(`❌ Failed to load effect module ${effectId} from ${matchingFile}:`, loadError);
        // Return null instead of crashing
        return null;
      }
    }

    // If no effect found, return null instead of hardcoding a fallback
    if (DEBUG_EFFECTS) console.warn(`No effect found for ID: ${effectId}`);
    return null;
  } catch (error) {
    if (DEBUG_EFFECTS) console.error(`Error loading effect ${effectId}:`, error);
    return null;
  }
};

/**
 * Hook to load an effect component with state management
 * @param effectId - The filename of the effect to load (without .tsx extension)
 * @returns The loaded effect component or null if still loading
 */
export const useEffectComponent = (effectId: string): React.ComponentType<any> | null => {
  if (DEBUG_EFFECTS) console.log(`🎯 useEffectComponent called with effectId: ${effectId}`);
  
  // ALWAYS call hooks first - never conditionally!
  const [EffectComponent, setEffectComponent] = React.useState<React.ComponentType<any> | null>(null);
  
  // Resolve common ID variants dynamically without hardcoded mappings
  const getUpdatedEffectId = (id: string) => {
    if (!id) return id;
    const camelCase = id
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    const withoutEffectSuffix = camelCase.replace(/Effect$/, '');
    // Prefer exact id first, then camelCase, then with Effect suffix
    const baseCandidates = [id, camelCase, `${camelCase}Effect`, withoutEffectSuffix];
    // Return the first candidate that matches a discovered module filename
    try {
      const modules = (import.meta as any).glob('../bank/**/*.{tsx,jsx,ts,js}');
      const available = new Set(
        Object.keys(modules)
          .map((p: string) => p.replace('../bank/', '').replace(/\.(tsx|ts|js|jsx)$/,''))
      );
      // Expand candidates with subfolder prefixes to handle sources/ and visual-effects/
      const expanded: string[] = [];
      for (const c of baseCandidates) {
        expanded.push(c);
        expanded.push(`sources/${c}`);
        expanded.push(`effects/${c}`); // bank/effects
        expanded.push(`visual-effects/${c}`); // legacy support
      }
      const match = expanded.find(c => available.has(c));
      return match || id;
    } catch {
      return id;
    }
  };

  const updatedEffectId = getUpdatedEffectId(effectId);
  if (DEBUG_EFFECTS) console.log(`🎯 Mapped effectId: ${effectId} -> ${updatedEffectId}`);

  React.useEffect(() => {
    if (DEBUG_EFFECTS) console.log(`🔄 useEffect triggered for effectId: ${effectId}`);
    
    const loadEffect = async () => {
      // Try to get from registry first
      const registeredEffect = getEffect(updatedEffectId);
      if (registeredEffect) {
        if (DEBUG_EFFECTS) console.log(`✅ Found effect in registry: ${updatedEffectId}`);
        setEffectComponent(() => registeredEffect);
        return;
      }
      
      // Handle undefined or invalid effect IDs
      const validEffectId = updatedEffectId && updatedEffectId !== 'unknown' && updatedEffectId !== 'undefined' 
        ? updatedEffectId 
        : null;
        
      if (!validEffectId) {
        if (DEBUG_EFFECTS) console.log(`❌ Invalid effectId: ${effectId}`);
        setEffectComponent(null);
        return;
      }
        
      if (DEBUG_EFFECTS) console.log(`📞 Calling loadEffectComponent with: ${validEffectId}`);
      const component = await loadEffectComponent(validEffectId);
      if (DEBUG_EFFECTS) console.log(`📦 Component loaded:`, component);
      setEffectComponent(() => component);
      // no-op
    };

    loadEffect();
  }, [effectId, updatedEffectId]);

  return EffectComponent;
};

/**
 * Non-hook version to get effect component synchronously from registry
 * Use this when you need to get effect components inside loops or other places where hooks can't be used
 * @param effectId - The effect ID to look up
 * @returns The effect component from registry or null if not found
 */
export const getEffectComponentSync = (effectId: string): React.ComponentType<any> | null => {
  if (DEBUG_EFFECTS) console.log(`🎯 getEffectComponentSync called with effectId: ${effectId}`);
  
  if (!effectId || effectId.trim() === '' || effectId === 'undefined') {
    if (DEBUG_EFFECTS) console.log(`❌ Invalid effectId provided: "${effectId}"`);
    return null;
  }
  const normalizedEffectId = normalizeEffectId(effectId);
  
  // Resolve common ID variants dynamically without hardcoded mappings
  const getUpdatedEffectId = (id: string) => {
    if (!id) return id;
    const camelCase = id
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    const withoutEffectSuffix = camelCase.replace(/Effect$/, '');
    const candidates = [id, camelCase, `${camelCase}Effect`, withoutEffectSuffix];
    try {
      const modules = (import.meta as any).glob('../bank/**/*.tsx');
      const available = new Set(Object.keys(modules).map((p: string) => p.replace('../bank/', '').replace('.tsx', '')));
      const expanded: string[] = [];
      for (const c of candidates) {
        expanded.push(c);
        expanded.push(`sources/${c}`);
        expanded.push(`effects/${c}`); // bank/effects
        expanded.push(`visual-effects/${c}`); // legacy support
      }
      const match = expanded.find(c => available.has(c));
      return match || id;
    } catch {
      return id;
    }
  };

  const updatedEffectId = getUpdatedEffectId(normalizedEffectId);
  if (DEBUG_EFFECTS) console.log(`🎯 Mapped effectId: ${effectId} -> ${updatedEffectId}`);
  
  // Try to get from registry (synchronous only)
  let registeredEffect = getEffect(updatedEffectId);
  if (!registeredEffect && updatedEffectId.includes('/')) {
    const base = updatedEffectId.split('/').pop() as string;
    registeredEffect = getEffect(base) || getEffect(base.replace(/Effect$/, '')) || null;
  }
  if (!registeredEffect) {
    const base = normalizedEffectId.split('/').pop() as string;
    registeredEffect = getEffect(base) || getEffect(base.replace(/Effect$/, '')) || null;
  }
  if (!registeredEffect) {
    // Try prefixed variants once more
    registeredEffect = getEffect(`sources/${normalizedEffectId}`) || getEffect(`effects/${normalizedEffectId}`) || getEffect(`visual-effects/${normalizedEffectId}`) || null;
  }
  if (registeredEffect) {
    if (DEBUG_EFFECTS) console.log(`✅ Found effect in registry (sync):`, registeredEffect?.name || updatedEffectId);
    return registeredEffect;
  }
  
  // If not in registry, return null (no async loading in sync version)
  if (DEBUG_EFFECTS) console.log(`❌ Effect not found in registry: ${updatedEffectId}`);
  return null;
}; 