import React, { Suspense } from 'react';
import { useEffectManager } from '../utils/EffectManager';
import { EffectErrorBoundary } from './EffectErrorBoundary';

interface DynamicEffectProps {
  effectId: string;
  fallback?: React.ReactNode;
  [key: string]: any; // Allow any additional props
}

/**
 * Dynamic Effect Loader Component
 * 
 * This component dynamically loads effects using the EffectManager
 * instead of hardcoded imports. It automatically handles loading
 * and provides fallback rendering.
 */
export const DynamicEffect: React.FC<DynamicEffectProps> = ({ 
  effectId, 
  fallback = <mesh><planeGeometry args={[2, 2]} /><meshBasicMaterial color={0x888888} /></mesh>,
  ...props 
}) => {
  const { getLazyEffectComponent, hasEffect } = useEffectManager();

  console.log(`🔍 DynamicEffect called with effectId: "${effectId}"`);

  // Check if effectId is valid
  if (!effectId || effectId === 'undefined' || effectId.trim() === '') {
    console.error(`❌ DynamicEffect received invalid effectId: "${effectId}"`);
    return <>{fallback}</>;
  }

  // Check if effect exists
  if (!hasEffect(effectId)) {
    console.warn(`❌ Effect "${effectId}" not found`);
    return <>{fallback}</>;
  }

  console.log(`✅ Effect "${effectId}" found, loading component...`);

  // Get the lazy-loaded component
  const LazyEffectComponent = getLazyEffectComponent(effectId);

  return (
    <EffectErrorBoundary effectId={effectId}>
      <Suspense fallback={fallback}>
        <LazyEffectComponent {...props} />
      </Suspense>
    </EffectErrorBoundary>
  );
};

/**
 * Dynamic Effect with Error Boundary
 * 
 * This component provides error handling for dynamic effects
 * Note: The main DynamicEffect component now includes error handling by default
 */
export const DynamicEffectWithErrorBoundary: React.FC<DynamicEffectProps> = (props) => {
  // Now just an alias since DynamicEffect includes error boundary by default
  return <DynamicEffect {...props} />;
};

export default DynamicEffect; 