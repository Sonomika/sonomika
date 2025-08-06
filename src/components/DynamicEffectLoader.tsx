import React, { Suspense } from 'react';
import { useEffectManager } from '../utils/EffectManager';

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
    <Suspense fallback={fallback}>
      <LazyEffectComponent {...props} />
    </Suspense>
  );
};

/**
 * Dynamic Effect with Error Boundary
 * 
 * This component provides error handling for dynamic effects
 */
export const DynamicEffectWithErrorBoundary: React.FC<DynamicEffectProps> = (props) => {
  return (
    <ErrorBoundary>
      <DynamicEffect {...props} />
    </ErrorBoundary>
  );
};

/**
 * Error Boundary for Dynamic Effects
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Dynamic effect error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <mesh>
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial color={0xff0000} />
        </mesh>
      );
    }

    return this.props.children;
  }
}

export default DynamicEffect; 