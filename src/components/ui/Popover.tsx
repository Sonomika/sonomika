import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

type ContentProps = React.PropsWithChildren<{ className?: string; sideOffset?: number }>; 

export const PopoverContent: React.FC<ContentProps> = ({ children, className = '', sideOffset = 4 }) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      sideOffset={sideOffset}
      onOpenAutoFocus={(e) => {
        // prevent stealing focus from trigger to avoid immediate close in some contexts
        e.preventDefault();
      }}
      className={`tw-z-[10000] tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-lg ${className}`}
    >
      {children}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
);


