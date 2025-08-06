import React from 'react';

/**
 * Loads an effect component dynamically from the effects folder
 * @param effectId - The filename of the effect to load (without .tsx extension)
 * @returns A React component or null if loading fails
 */
export const loadEffectComponent = async (effectId: string): Promise<React.ComponentType<any> | null> => {
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
      return mod.default;
    }

    // If exact match not found, try to find by partial match
    const availableFiles = Object.keys(modules);
    const matchingFile = availableFiles.find(file => 
      file.includes(effectId) || effectId.includes(file.replace('../effects/', '').replace('.tsx', ''))
    );
    
    if (matchingFile) {
      console.log(`✅ Found effect by partial match: ${matchingFile}`);
      const mod = await modules[matchingFile]();
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
  const [EffectComponent, setEffectComponent] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    const loadEffect = async () => {
      // Handle undefined or invalid effect IDs
      const validEffectId = effectId && effectId !== 'unknown' && effectId !== 'undefined' 
        ? effectId 
        : null;
        
      if (!validEffectId) {
        setEffectComponent(null);
        return;
      }
        
      const component = await loadEffectComponent(validEffectId);
      setEffectComponent(() => component);
    };

    loadEffect();
  }, [effectId]);

  return EffectComponent;
}; 