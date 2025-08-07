// src/utils/effectRegistry.ts

const registry = new Map<string, React.FC<any>>();

export const registerEffect = (id: string, component: React.FC<any>) => {
  console.log(`🔧 Registering effect: ${id}`);
  console.log(`🔧 Component type:`, typeof component);
  console.log(`🔧 Component name:`, component.name);
  registry.set(id, component);
  console.log(`🔧 Registry size after registration:`, registry.size);
  console.log(`🔧 Registry keys:`, Array.from(registry.keys()));
};

export const getEffect = (id: string): React.FC<any> | null => {
  const effect = registry.get(id);
  console.log(`🔧 Getting effect: ${id} - found: ${!!effect}`);
  console.log(`🔧 Registry keys:`, Array.from(registry.keys()));
  console.log(`🔧 Registry size:`, registry.size);
  if (effect) {
    console.log(`🔧 Effect component name:`, effect.name);
    console.log(`🔧 Effect component type:`, typeof effect);
  }
  return effect || null;
};

export const getAllRegisteredEffects = (): string[] => {
  return Array.from(registry.keys());
};

export const clearRegistry = () => {
  registry.clear();
  console.log('🔧 Effect registry cleared');
};
