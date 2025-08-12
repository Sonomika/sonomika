import React from 'react';
import { getEffect } from './effectRegistry';

// Test what modules are available
const testModules = (import.meta as any).glob('../effects/**/*.tsx');
console.log('🧪 TEST: Available effect modules:', Object.keys(testModules));

/**
 * Loads an effect component dynamically from the effects folder
 * @param effectId - The filename of the effect to load (without .tsx extension)
 * @returns A React component or null if loading fails
 */
export const loadEffectComponent = async (effectId: string): Promise<React.ComponentType<any> | null> => {
  console.log(`🚀 loadEffectComponent called with effectId: ${effectId}`);
  
  // Handle undefined or invalid effect IDs
  if (!effectId || effectId === 'unknown' || effectId === 'undefined') {
    console.warn(`Invalid effect ID: ${effectId}`);
    return null;
  }

  try {
    // Try to load the effect by filename directly (search subfolders)
    const modules = (import.meta as any).glob('../effects/**/*.tsx');
    
    // Try the exact filename first
    const exactPath = `../effects/${effectId}.tsx`;
    
    console.log(`🔍 Loading effect: ${effectId}`);
    console.log(`🔍 Available modules:`, Object.keys(modules));
    console.log(`🔍 Trying exact path: ${exactPath} - exists: ${!!modules[exactPath]}`);
    
    if (modules[exactPath]) {
      console.log(`✅ Found effect at: ${exactPath}`);
      const mod = await modules[exactPath]();
      console.log(`✅ Effect module loaded:`, mod);
      console.log(`🔍 Module keys:`, Object.keys(mod));
      console.log(`🔍 Module default:`, mod.default);
      console.log(`🔍 Module default type:`, typeof mod.default);
      return mod.default;
    }

    // If exact match not found, try to find by partial match
    const availableFiles = Object.keys(modules);
    console.log(`🔍 Available files:`, availableFiles);
    
    // Try to find a file that matches the effectId (could be kebab-case or original filename)
    const matchingFile = availableFiles.find(file => {
      const fileName = file.replace('../effects/', '').replace('.tsx', '');
      
      // Check if the effectId matches the filename directly
      if (fileName === effectId) return true;
      
      // Check if the effectId is a kebab-case version of the filename
      const kebabCaseFileName = fileName
        .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, (match) => `-${match.toLowerCase()}`)
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')
        .replace(/-+$/, '')
        .replace(/-+/g, '-');
      
      if (kebabCaseFileName === effectId) return true;
      
      // Check if the filename is a kebab-case version of the effectId
      const camelCaseEffectId = effectId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
      
      if (fileName === camelCaseEffectId || fileName === camelCaseEffectId + 'Effect') return true;
      
      // Fallback: check if either contains the other
      const matches = file.includes(effectId) || effectId.includes(fileName) || fileName.endsWith(`/${camelCaseEffectId}`) || fileName.endsWith(`/${camelCaseEffectId}Effect`);
      console.log(`🔍 Checking file: ${file} (${fileName}) against ${effectId} - matches: ${matches}`);
      return matches;
    });
    
    if (matchingFile) {
      console.log(`✅ Found effect by partial match: ${matchingFile}`);
      const mod = await modules[matchingFile]();
      console.log(`✅ Effect module loaded:`, mod);
      console.log(`🔍 Module keys:`, Object.keys(mod));
      console.log(`🔍 Module default:`, mod.default);
      console.log(`🔍 Module default type:`, typeof mod.default);
      return mod.default;
    }

    // If no effect found, return null instead of hardcoding a fallback
    console.warn(`No effect found for ID: ${effectId}`);
    return null;
  } catch (error) {
    console.error(`Error loading effect ${effectId}:`, error);
    return null;
  }
};

/**
 * Hook to load an effect component with state management
 * @param effectId - The filename of the effect to load (without .tsx extension)
 * @returns The loaded effect component or null if still loading
 */
export const useEffectComponent = (effectId: string): React.ComponentType<any> | null => {
  console.log(`🎯 useEffectComponent called with effectId: ${effectId}`);
  
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
    const candidates = [id, camelCase, `${camelCase}Effect`, withoutEffectSuffix];
    // Return the first candidate that matches a discovered module filename
    try {
      const modules = (import.meta as any).glob('../effects/**/*.tsx');
      const available = new Set(Object.keys(modules).map((p: string) => p.replace('../effects/', '').replace('.tsx', '')));
      const match = candidates.find(c => available.has(c));
      return match || id;
    } catch {
      return id;
    }
  };

  const updatedEffectId = getUpdatedEffectId(effectId);
  console.log(`🎯 Mapped effectId: ${effectId} -> ${updatedEffectId}`);

  React.useEffect(() => {
    console.log(`🔄 useEffect triggered for effectId: ${effectId}`);
    
    const loadEffect = async () => {
      // Try to get from registry first
      const registeredEffect = getEffect(updatedEffectId);
      if (registeredEffect) {
        console.log(`✅ Found effect in registry: ${updatedEffectId}`);
        setEffectComponent(() => registeredEffect);
        return;
      }
      
      // Handle undefined or invalid effect IDs
      const validEffectId = updatedEffectId && updatedEffectId !== 'unknown' && updatedEffectId !== 'undefined' 
        ? updatedEffectId 
        : null;
        
      if (!validEffectId) {
        console.log(`❌ Invalid effectId: ${effectId}`);
        setEffectComponent(null);
        return;
      }
        
      console.log(`📞 Calling loadEffectComponent with: ${validEffectId}`);
      const component = await loadEffectComponent(validEffectId);
      console.log(`📦 Component loaded:`, component);
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
  console.log(`🎯 getEffectComponentSync called with effectId: ${effectId}`);
  
  if (!effectId || effectId.trim() === '' || effectId === 'undefined') {
    console.log(`❌ Invalid effectId provided: "${effectId}"`);
    return null;
  }
  
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
      const modules = (import.meta as any).glob('../effects/**/*.tsx');
      const available = new Set(Object.keys(modules).map((p: string) => p.replace('../effects/', '').replace('.tsx', '')));
      const match = candidates.find(c => available.has(c));
      return match || id;
    } catch {
      return id;
    }
  };

  const updatedEffectId = getUpdatedEffectId(effectId);
  console.log(`🎯 Mapped effectId: ${effectId} -> ${updatedEffectId}`);
  
  // Try to get from registry (synchronous only)
  const registeredEffect = getEffect(updatedEffectId);
  if (registeredEffect) {
    console.log(`✅ Found effect in registry: ${updatedEffectId}`);
    return registeredEffect;
  }
  
  // If not in registry, return null (no async loading in sync version)
  console.log(`❌ Effect not found in registry: ${updatedEffectId}`);
  return null;
}; 