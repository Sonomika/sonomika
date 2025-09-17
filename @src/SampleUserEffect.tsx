import React from 'react';

// Sample user effect metadata
export const metadata = {
  name: 'Sample User Effect',
  description: 'A sample effect loaded from user directory',
  category: 'User Effects',
  author: 'User',
  version: '1.0.0',
  parameters: [
    {
      name: 'intensity',
      type: 'number' as const,
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.1
    },
    {
      name: 'color',
      type: 'color' as const,
      value: '#ff0000'
    }
  ]
};

interface SampleUserEffectProps {
  width: number;
  height: number;
  intensity?: number;
  color?: string;
}

const SampleUserEffect: React.FC<SampleUserEffectProps> = ({ 
  width, 
  height, 
  intensity = 0.5,
  color = '#ff0000'
}) => {
  return (
    <div 
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: color,
        opacity: intensity,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '24px',
        fontWeight: 'bold',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}
    >
      Sample User Effect
    </div>
  );
};

export default SampleUserEffect;
