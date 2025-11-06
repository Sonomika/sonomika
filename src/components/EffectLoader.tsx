import React, { Suspense } from 'react';
import * as THREE from 'three';
import { getAllRegisteredEffects, getEffect } from '../utils/effectRegistry';
import { EffectErrorBoundary } from './EffectErrorBoundary';

interface EffectLoaderProps {
  videoTexture?: THREE.Texture;
  fallback?: React.ReactNode;
  effectId?: string; // Optional: if provided, render only this specific effect
  params?: any; // Optional: parameters to pass to the effect
  isGlobal?: boolean; // Optional: indicates if this is a global effect
}

// Component to render a single specific effect
export const SingleEffectLoader: React.FC<{
  effectId: string;
  videoTexture?: THREE.Texture;
  fallback?: React.ReactNode;
  params?: any;
  isGlobal?: boolean;
}> = ({ effectId, videoTexture, fallback = null, params = {}, isGlobal = false }) => {
  console.log(`🎯 SingleEffectLoader called with effectId: ${effectId}`);
  
  const EffectComponent = getEffect(effectId);
  
  console.log(`🎯 EffectComponent found: ${!!EffectComponent}`);
  
  if (!EffectComponent) {
    console.warn(`Effect not found: ${effectId}`);
    return fallback ? <>{fallback}</> : null;
  }

  console.log(`🎯 SingleEffectLoader rendering effect: ${effectId} with params:`, params);

  return (
    <EffectErrorBoundary effectId={effectId}>
      <Suspense fallback={fallback}>
        <EffectComponent 
          videoTexture={videoTexture}
          isGlobal={isGlobal}
          {...params}
        />
      </Suspense>
    </EffectErrorBoundary>
  );
};

export default function EffectLoader({ videoTexture, fallback = null, effectId, params, isGlobal = false }: EffectLoaderProps) {
  // If a specific effectId is provided, render only that effect
  if (effectId) {
    return (
      <SingleEffectLoader
        effectId={effectId}
        videoTexture={videoTexture}
        fallback={fallback}
        params={params}
        isGlobal={isGlobal}
      />
    );
  }

  // Otherwise, render all registered effects (original behavior)
  const registeredEffects = getAllRegisteredEffects();
  
  const effects = registeredEffects.map(effectId => {
    const EffectComponent = getEffect(effectId);
    if (!EffectComponent) return null;
    
    return (
      <EffectErrorBoundary key={effectId} effectId={effectId}>
        <EffectComponent 
          videoTexture={videoTexture}
        />
      </EffectErrorBoundary>
    );
  }).filter(Boolean);

  return <Suspense fallback={fallback}>{effects}</Suspense>;
} 