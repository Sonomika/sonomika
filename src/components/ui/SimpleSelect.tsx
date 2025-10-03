import React from 'react';
import { ChevronDownIcon } from '@radix-ui/react-icons';

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
    <div className={`tw-relative tw-w-full tw-min-w-0`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`tw-block tw-w-full tw-min-w-0 tw-pr-8 tw-pl-3 tw-py-2 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-rounded-md tw-text-sm tw-appearance-none tw-truncate focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-sky-600 focus:tw-ring-offset-0 ${className}`}
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
      <ChevronDownIcon aria-hidden="true" className="tw-pointer-events-none tw-absolute tw-right-2 tw-top-1/2 tw-h-4 tw-w-4 tw--translate-y-1/2 tw-text-neutral-400" />
    </div>
  );
};
