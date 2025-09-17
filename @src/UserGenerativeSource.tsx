import React, { useEffect, useRef } from 'react';

// Sample user source metadata
export const metadata = {
  name: 'User Generative Source',
  description: 'A generative source effect loaded from user directory',
  category: 'User Sources',
  author: 'User',
  version: '1.0.0',
  isSource: true,
  parameters: [
    {
      name: 'speed',
      type: 'number' as const,
      value: 1,
      min: 0.1,
      max: 3,
      step: 0.1
    },
    {
      name: 'primaryColor',
      type: 'color' as const,
      value: '#00ff00'
    },
    {
      name: 'secondaryColor',
      type: 'color' as const,
      value: '#0000ff'
    }
  ]
};

interface UserGenerativeSourceProps {
  width: number;
  height: number;
  speed?: number;
  primaryColor?: string;
  secondaryColor?: string;
}

const UserGenerativeSource: React.FC<UserGenerativeSourceProps> = ({ 
  width, 
  height, 
  speed = 1,
  primaryColor = '#00ff00',
  secondaryColor = '#0000ff'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      timeRef.current += 0.016 * speed; // ~60fps * speed

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Create animated gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      const offset1 = (Math.sin(timeRef.current) + 1) / 2;
      const offset2 = (Math.cos(timeRef.current * 1.5) + 1) / 2;
      
      gradient.addColorStop(0, primaryColor);
      gradient.addColorStop(offset1, secondaryColor);
      gradient.addColorStop(1, primaryColor);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Add some animated shapes
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 4;

      for (let i = 0; i < 6; i++) {
        const angle = (timeRef.current + i * Math.PI / 3) * speed;
        const x = centerX + Math.cos(angle) * radius * offset2;
        const y = centerY + Math.sin(angle) * radius * offset1;
        
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? primaryColor : secondaryColor;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, speed, primaryColor, secondaryColor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block'
      }}
    />
  );
};

export default UserGenerativeSource;
