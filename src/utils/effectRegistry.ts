// src/utils/effectRegistry.ts

const registry = new Map<string, React.FC<any>>();

export const registerEffect = (id: string, component: React.FC<any>) => {
  console.log(`🔧 Registering effect: ${id}`);
  registry.set(id, component);
};

export const getEffect = (id: string): React.FC<any> | null => {
  const effect = registry.get(id);
  console.log(`🔧 Getting effect: ${id} - found: ${!!effect}`);
  return effect || null;
};

export const getAllRegisteredEffects = (): string[] => {
  return Array.from(registry.keys());
};

export const clearRegistry = () => {
  registry.clear();
  console.log('🔧 Effect registry cleared');
};
