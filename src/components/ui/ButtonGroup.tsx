import React from 'react';

interface ButtonGroupProps {
  options: Array<{
    value: string | number;
    label: string;
    onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    title?: string;
  }>;
  value: string | number;
  onChange: (value: string | number) => void;
  className?: string;
  columns?: number;
  size?: 'small' | 'medium' | 'large';
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  options,
  value,
  onChange,
  className = '',
  columns = 4,
  size = 'medium'
}) => {
  const sizeClasses = {
    small: 'blend-btn text-xs',
    medium: 'blend-btn text-xs',
    large: 'blend-btn text-xs'
  };

  return (
    <div className={`button-group ${className}`}>
      <div 
        className="button-grid"
        style={{ 
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: size === 'small' ? '4px' : size === 'medium' ? '6px' : '8px'
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            className={`${sizeClasses[size]} ${option.value === value ? 'active' : ''}`}
            onClick={() => onChange(option.value)}
            onContextMenu={option.onContextMenu}
            title={option.title}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
