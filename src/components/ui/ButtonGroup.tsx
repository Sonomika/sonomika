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
    small: 'h-[30px] py-4 px-8 text-xs',
    medium: 'h-[30px] py-6 px-12 text-xs',
    large: 'h-[30px] py-8 px-16 text-xs'
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
            className={`button-option ${option.value === value ? 'active' : ''} ${sizeClasses[size]}`}
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
