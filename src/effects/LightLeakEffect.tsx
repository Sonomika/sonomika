import React, { useRef, useEffect, useState } from 'react';

interface LightLeakEffectProps {
  intensity?: number;
  speed?: number;
  color?: string;
  position?: 'left' | 'right' | 'top' | 'bottom';
  width?: number;
}

export const LightLeakEffect: React.FC<LightLeakEffectProps> = ({
  intensity = 0.3,
  speed = 1,
  color = '#ff6b35',
  position = 'right',
  width = 0.2
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
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Parse color
      const colorValue = parseInt(color.replace('#', ''), 16);
      const r = (colorValue >> 16) & 255;
      const g = (colorValue >> 8) & 255;
      const b = colorValue & 255;
      
      // Create light leak gradient
      let gradient: CanvasGradient;
      
      if (position === 'left') {
        gradient = ctx.createLinearGradient(0, 0, canvas.width * width, 0);
      } else if (position === 'right') {
        gradient = ctx.createLinearGradient(canvas.width * (1 - width), 0, canvas.width, 0);
      } else if (position === 'top') {
        gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * width);
      } else { // bottom
        gradient = ctx.createLinearGradient(0, canvas.height * (1 - width), 0, canvas.height);
      }
      
      // Add flicker to intensity
      const flicker = Math.sin(elapsed * 2) * 0.3 + 0.7;
      const totalIntensity = intensity * flicker;
      
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${totalIntensity})`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${totalIntensity * 0.5})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [intensity, speed, color, position, width, isActive]);

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
        zIndex: 1002,
        mixBlendMode: 'screen'
      }}
    />
  );
}; 