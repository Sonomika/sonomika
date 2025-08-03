import React, { useRef, useEffect, useState } from 'react';

interface FilmFlickerEffectProps {
  intensity?: number;
  speed?: number;
  frequency?: number;
  color?: string;
}

export const FilmFlickerEffect: React.FC<FilmFlickerEffectProps> = ({
  intensity = 0.2,
  speed = 1,
  frequency = 24, // 24fps film flicker
  color = '#ffffff'
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

    let startTime = Date.now();
    
    const animate = () => {
      if (!isActive) return;

      const currentTime = Date.now();
      const elapsed = (currentTime - startTime) * speed / 1000;
      
      // Create flicker pattern
      const flickerIntensity = Math.sin(elapsed * frequency * Math.PI * 2) * 0.5 + 0.5;
      const flickerNoise = Math.random() * 0.3;
      const totalFlicker = (flickerIntensity + flickerNoise) * intensity;
      
      // Create overlay
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Parse color
      const colorValue = parseInt(color.replace('#', ''), 16);
      const r = (colorValue >> 16) & 255;
      const g = (colorValue >> 8) & 255;
      const b = colorValue & 255;
      
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${totalFlicker})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [intensity, speed, frequency, color, isActive]);

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
        zIndex: 1001,
        mixBlendMode: 'overlay'
      }}
    />
  );
}; 