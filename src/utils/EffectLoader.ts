import React from 'react';
import { getEffect } from './effectRegistry';

// Test what modules are available
const testModules = (import.meta as any).glob('../effects/*.tsx');
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
    // Try to load the effect by filename directly
    const modules = (import.meta as any).glob('../effects/*.tsx');
    
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
      const matches = file.includes(effectId) || effectId.includes(fileName);
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
  
  // Handle backward compatibility: map kebab-case IDs to camelCase IDs
  const getUpdatedEffectId = (id: string) => {
    const idMappings: Record<string, string> = {
      'pulse-hexagon': 'PulseHexagon',
      'hexagon': 'PulseHexagon',
      'bpm-particles-effect': 'BPMParticlesEffect',
      'video-pulse-effect': 'VideoPulseEffect',
      'generic-pulse-effect': 'GenericPulseEffect',
      'test-effect': 'TestEffect',
      'red-dot-effect': 'RedDotEffect'
    };
    return idMappings[id] || id;
  };

  const updatedEffectId = getUpdatedEffectId(effectId);
  console.log(`🎯 Mapped effectId: ${effectId} -> ${updatedEffectId}`);
  
  // Try to get from registry first
  const registeredEffect = getEffect(updatedEffectId);
  if (registeredEffect) {
    console.log(`✅ Found effect in registry: ${updatedEffectId}`);
    return registeredEffect;
  }
  
  // Fallback to dynamic loading if not in registry
  const [EffectComponent, setEffectComponent] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    console.log(`🔄 useEffect triggered for effectId: ${effectId}`);
    
    const loadEffect = async () => {
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
    };

    loadEffect();
  }, [effectId, updatedEffectId]);

  return EffectComponent;
}; 