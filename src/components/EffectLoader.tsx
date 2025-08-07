import React, { Suspense } from 'react';
import * as THREE from 'three';
import { getAllRegisteredEffects, getEffect } from '../utils/effectRegistry';

interface EffectLoaderProps {
  videoTexture?: THREE.VideoTexture;
  fallback?: React.ReactNode;
  effectId?: string; // Optional: if provided, render only this specific effect
  params?: any; // Optional: parameters to pass to the effect
}

// Component to render a single specific effect
export const SingleEffectLoader: React.FC<{
  effectId: string;
  videoTexture?: THREE.VideoTexture;
  fallback?: React.ReactNode;
  params?: any;
}> = ({ effectId, videoTexture, fallback = null, params = {} }) => {
  console.log(`🎯 SingleEffectLoader called with effectId: ${effectId}`);
  
  const EffectComponent = getEffect(effectId);
  
  console.log(`🎯 EffectComponent found: ${!!EffectComponent}`);
  
  if (!EffectComponent) {
    console.warn(`Effect not found: ${effectId}`);
    return fallback ? <>{fallback}</> : null;
  }

  console.log(`🎯 SingleEffectLoader rendering effect: ${effectId} with params:`, params);

  return (
    <Suspense fallback={fallback}>
      <EffectComponent 
        videoTexture={videoTexture}
        {...params}
      />
    </Suspense>
  );
};

export default function EffectLoader({ videoTexture, fallback = null, effectId, params }: EffectLoaderProps) {
  // If a specific effectId is provided, render only that effect
  if (effectId) {
    return (
      <SingleEffectLoader
        effectId={effectId}
        videoTexture={videoTexture}
        fallback={fallback}
        params={params}
      />
    );
  }

  // Otherwise, render all registered effects (original behavior)
  const registeredEffects = getAllRegisteredEffects();
  
  const effects = registeredEffects.map(effectId => {
    const EffectComponent = getEffect(effectId);
    if (!EffectComponent) return null;
    
    return (
      <EffectComponent 
        key={effectId} 
        videoTexture={videoTexture}
      />
    );
  }).filter(Boolean);

  return <Suspense fallback={fallback}>{effects}</Suspense>;
} 