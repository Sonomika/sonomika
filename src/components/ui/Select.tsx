import React from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';

export interface SelectOption<V extends string | number = string | number> {
  value: V;
  label?: string;
}

interface SelectProps<V extends string | number = string | number> {
  value: V;
  onChange: (value: V) => void;
  options: Array<SelectOption<V>>;
  className?: string;
  placeholder?: string;
}

export function Select<V extends string | number = string | number>({
  value,
  onChange,
  options,
  className = '',
  placeholder = 'Select...'
}: SelectProps<V>) {
  const [open, setOpen] = React.useState(false);

  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`tw-inline-flex tw-w-full tw-items-center tw-justify-between tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2 tw-py-1 tw-text-neutral-100 hover:tw-bg-neutral-800 ${className}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onMouseDown={(e) => {
            // ensure Radix receives the pointer down to toggle open state
            e.preventDefault();
          }}
        >
          <span className="tw-truncate tw-text-left">
            {selected?.label ?? String(selected?.value ?? placeholder)}
          </span>
          <span className="tw-ml-2 tw-text-neutral-400">▼</span>
        </button>
      </PopoverTrigger>
      {open && (
        <PopoverContent className="tw-min-w-[180px] tw-py-1 tw-text-sm">
          <div className="tw-flex tw-flex-col">
            {options.map((opt) => (
              <button
                key={String(opt.value)}
                className={`tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 hover:tw-bg-neutral-800 ${opt.value === value ? 'tw-text-white' : 'tw-text-neutral-300'}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label ?? String(opt.value)}</span>
                {opt.value === value && <span>•</span>}
              </button>
            ))}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}


