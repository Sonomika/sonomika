import React from 'react';

/**
 * Loads an effect component dynamically from the effects folder
 * @param effectId - The ID of the effect to load
 * @returns A React component or null if loading fails
 */
export const loadEffectComponent = async (effectId: string): Promise<React.ComponentType<any> | null> => {
  // Handle undefined or invalid effect IDs
  if (!effectId || effectId === 'unknown' || effectId === 'undefined') {
    console.warn(`Invalid effect ID: ${effectId}`);
    return null;
  }

  try {
    // Try to load the specific effect
    const modules = (import.meta as any).glob('../effects/*.tsx');
    
    // Convert kebab-case to PascalCase for file matching
    const pascalCaseId = effectId.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
    
    const possiblePaths = [
      `../effects/${effectId}.tsx`,                    // kebab-case.tsx
      `../effects/${effectId}Effect.tsx`,              // kebab-caseEffect.tsx
      `../effects/${pascalCaseId}.tsx`,                // PascalCase.tsx
      `../effects/${pascalCaseId}Effect.tsx`,          // PascalCaseEffect.tsx
      `../effects/${pascalCaseId.replace('Effect', '')}Effect.tsx` // PascalCase.tsx (if already has Effect)
    ];

    console.log(`🔍 Loading effect: ${effectId} -> ${pascalCaseId}`);
    console.log(`🔍 Available modules:`, Object.keys(modules));
    
    for (const path of possiblePaths) {
      console.log(`🔍 Trying path: ${path} - exists: ${!!modules[path]}`);
      if (modules[path]) {
        console.log(`✅ Found effect at: ${path}`);
        const mod = await modules[path]();
        return mod.default;
      }
    }



    // If no specific effect found, return null instead of hardcoding a fallback
    console.warn(`No effect found for ID: ${effectId}`);
    return null;
  } catch (error) {
    console.error(`Error loading effect ${effectId}:`, error);
    return null;
  }
};

/**
 * Hook to load an effect component with state management
 * @param effectId - The ID of the effect to load
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