import React, { useEffect, useRef, useState } from 'react';

interface EffectRendererProps {
  effectType: 'p5js' | 'threejs';
  effectName: string;
  effectFile: string;
  width: number;
  height: number;
  bpm?: number;
  isPlaying?: boolean;
}

export const EffectRenderer: React.FC<EffectRendererProps> = React.memo(({
  effectType,
  effectName,
  effectFile,
  width,
  height,
  bpm = 120,
  isPlaying = false
}) => {
  // Ensure we have valid dimensions
  const canvasWidth = width > 0 ? width : 1920;
  const canvasHeight = height > 0 ? height : 1080;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const effectRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEffect = async () => {
      try {
        console.log('Loading effect:', effectName, effectFile, effectType);
        console.log('Canvas ref:', canvasRef.current);
        console.log('Dimensions:', width, height);
        
        // Wait for canvas to be available
        let attempts = 0;
        while (!canvasRef.current && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 10));
          attempts++;
        }
        
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('Canvas not found after waiting');
          setError('Canvas not found');
          return;
        }

        // Use dynamic discovery instead of hardcoded imports
        let effectModule;
        try {
          const modules = (import.meta as any).glob('../effects/*.tsx');
          const effectPath = `../effects/${effectFile}`;
          
          if (modules[effectPath]) {
            effectModule = await modules[effectPath]();
          } else {
            console.error('Effect not found:', effectFile);
            setError(`Effect not found: ${effectName}`);
            return;
          }
        } catch (importError) {
          console.error('Failed to import effect:', importError);
          setError(`Failed to load effect: ${effectName}`);
          return;
        }

        // Get the effect class (assuming it's the default export)
        const EffectClass = effectModule.default || effectModule[effectName.replace(/\s+/g, '')];
        
        if (!EffectClass) {
          console.error('Effect class not found:', effectName);
          setError(`Effect class not found: ${effectName}`);
          return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Failed to get 2D context');
          setError('Failed to get 2D context');
          return;
        }

        // Create effect instance
        const effect = new EffectClass(canvasWidth, canvasHeight);
        effect.setBPM(bpm);
        effectRef.current = effect;
        
        console.log('Effect loaded successfully:', effectName);
        setIsLoaded(true);
        setError(null);

      } catch (error) {
        console.error('Error loading effect:', error);
        setError(`Error loading effect: ${error}`);
      }
    };

    // Load effect with fallback dimensions
    loadEffect();

    return () => {
      if (effectRef.current) {
        effectRef.current.cleanup?.();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [effectName, effectFile, effectType, width, height, bpm]);

  useEffect(() => {
    if (!isLoaded || !isPlaying || !effectRef.current) return;

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      if (!effectRef.current) return;

      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      try {
        // Render the effect
        effectRef.current.render(deltaTime);
        
        // Copy the effect's canvas to our display canvas
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx && effectRef.current.canvas) {
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          ctx.drawImage(effectRef.current.canvas, 0, 0, canvasWidth, canvasHeight);
        }
      } catch (error) {
        console.error('Error rendering effect:', error);
        setError(`Rendering error: ${error}`);
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLoaded, isPlaying, width, height]);

  useEffect(() => {
    if (effectRef.current) {
      effectRef.current.setBPM(bpm);
    }
  }, [bpm]);

  useEffect(() => {
    if (effectRef.current) {
      effectRef.current.resize(canvasWidth, canvasHeight);
    }
  }, [canvasWidth, canvasHeight]);

  if (error) {
    return (
      <div className="effect-error">
        <div className="error-icon">⚠️</div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="effect-loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading {effectName}...</div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        backgroundColor: 'transparent',
      }}
    />
  );
}); 