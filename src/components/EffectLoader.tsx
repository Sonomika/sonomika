import React, { useEffect, useState, Suspense } from 'react';
import * as THREE from 'three';

interface EffectLoaderProps {
  videoTexture?: THREE.VideoTexture;
  fallback?: React.ReactNode;
}

export default function EffectLoader({ videoTexture, fallback = null }: EffectLoaderProps) {
  const [effects, setEffects] = useState<JSX.Element[]>([]);

  useEffect(() => {
    const modules = import.meta.glob('../effects/*.tsx');

    const loadEffects = async () => {
      const components: JSX.Element[] = [];

      for (const path in modules) {
        try {
          const mod = await modules[path]();
          const EffectComponent = mod.default;
          
          if (EffectComponent) {
            // Pass videoTexture to effects that need it
            components.push(
              <EffectComponent 
                key={path} 
                videoTexture={videoTexture}
              />
            );
          }
        } catch (error) {
          console.error(`Error loading effect from ${path}:`, error);
        }
      }

      setEffects(components);
    };

    loadEffects().catch(err => {
      console.error('Error loading effects:', err);
    });
  }, [videoTexture]);

  return <Suspense fallback={fallback}>{effects}</Suspense>;
} 