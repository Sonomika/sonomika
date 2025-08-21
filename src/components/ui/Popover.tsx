import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

type ContentProps = React.PropsWithChildren<{
  className?: string;
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
}>; 

export const PopoverContent: React.FC<ContentProps> = ({ children, className = '', sideOffset = 4, align = 'start', side = 'bottom' }) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      sideOffset={sideOffset}
      align={align}
      side={side}
      onOpenAutoFocus={(e) => {
        // prevent stealing focus from trigger to avoid immediate close in some contexts
        e.preventDefault();
      }}
      className={`tw-z-[10000] tw-rounded-md tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-none ${className}`}
    >
      {children}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
);


