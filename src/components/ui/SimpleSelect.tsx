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
    <div className={`tw-relative tw-w-full`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`tw-w-full tw-pr-8 tw-pl-3 tw-py-2 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-rounded-md tw-text-sm tw-appearance-none focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-sky-600 focus:tw-ring-offset-0 ${className}`}
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
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="tw-pointer-events-none tw-absolute tw-right-2 tw-top-1/2 tw-h-4 tw-w-4 tw--translate-y-1/2 tw-text-neutral-400"
        fill="currentColor"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clipRule="evenodd" />
      </svg>
    </div>
  );
};
