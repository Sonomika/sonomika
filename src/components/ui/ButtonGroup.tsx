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
    small: 'tw-text-xs',
    medium: 'tw-text-xs',
    large: 'tw-text-xs'
  };

  return (
    <div className={`tw-mt-2 ${className}`}>
      <div 
        className="tw-grid"
        style={{ 
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: size === 'small' ? '4px' : size === 'medium' ? '6px' : '8px'
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            className={`${sizeClasses[size]} tw-rounded tw-bg-neutral-900 tw-text-neutral-200 hover:tw-bg-neutral-800 tw-border tw-border-neutral-800 tw-px-2 tw-py-1 ${option.value === value ? 'tw-text-white' : ''}`}
            style={option.value === value ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
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
