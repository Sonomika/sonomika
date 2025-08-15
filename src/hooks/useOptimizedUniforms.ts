import { useRef, useCallback } from 'react';
import * as THREE from 'three';

/**
 * Hook to optimize uniform updates by tracking parameter changes
 * Only updates uniforms when values actually change, preventing unnecessary redraws
 */
export function useOptimizedUniforms() {
  const prevParamsRef = useRef<Record<string, any>>({});

  const updateUniforms = useCallback((
    material: THREE.ShaderMaterial | null,
    params: Record<string, any>,
    epsilon: number = 1e-6
  ) => {
    if (!material) return;

    const prevParams = prevParamsRef.current;
    const updatedParams: Record<string, any> = {};

    Object.entries(params).forEach(([key, value]) => {
      const prevValue = prevParams[key];
      
      // Check if value has changed
      let hasChanged = false;
      
      if (typeof value === 'number' && typeof prevValue === 'number') {
        hasChanged = Math.abs(prevValue - value) > epsilon;
      } else {
        hasChanged = prevValue !== value;
      }

      if (hasChanged) {
        // Update the uniform
        if (material.uniforms[key]) {
          material.uniforms[key].value = value;
        }
        updatedParams[key] = value;
      } else {
        // Keep the previous value
        updatedParams[key] = prevValue;
      }
    });

    // Update the reference with current values
    prevParamsRef.current = updatedParams;
  }, []);

  const resetParams = useCallback(() => {
    prevParamsRef.current = {};
  }, []);

  return { updateUniforms, resetParams };
}
