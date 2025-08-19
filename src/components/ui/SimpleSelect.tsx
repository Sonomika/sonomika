import React from 'react';

interface SelectOption {
  value: string;
  label?: string;
}

interface SimpleSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export const SimpleSelect: React.FC<SimpleSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = ''
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`tw-w-full tw-px-3 tw-py-2 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-rounded-md tw-text-sm focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-sky-600 focus:tw-ring-offset-0 ${className}`}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} className="tw-bg-neutral-900 tw-text-neutral-100">
          {option.label || option.value}
        </option>
      ))}
    </select>
  );
};
