import React, { useRef, useEffect, useState } from 'react';

interface FilmNoiseEffectProps {
  intensity?: number;
  speed?: number;
  color?: string;
  opacity?: number;
}

export const FilmNoiseEffect: React.FC<FilmNoiseEffectProps> = ({
  intensity = 0.3,
  speed = 1,
  color = '#ffffff',
  opacity = 0.1
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match parent
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Noise generation
    let frame = 0;
    const animate = () => {
      if (!isActive) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Create noise pattern
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Generate random noise
        const noise = Math.random() * intensity;
        const alpha = noise * opacity * 255;
        
        // Parse color
        const colorValue = parseInt(color.replace('#', ''), 16);
        const r = (colorValue >> 16) & 255;
        const g = (colorValue >> 8) & 255;
        const b = colorValue & 255;
        
        data[i] = r;     // Red
        data[i + 1] = g; // Green
        data[i + 2] = b; // Blue
        data[i + 3] = alpha; // Alpha
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      frame++;
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [intensity, speed, color, opacity, isActive]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
        mixBlendMode: 'overlay'
      }}
    />
  );
}; 