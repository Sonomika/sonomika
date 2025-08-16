import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, title, children, footer }) => {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tw-fixed tw-inset-0 tw-bg-black/60" />
        <DialogPrimitive.Content className="tw-fixed tw-left-1/2 tw-top-1/2 tw-w-[520px] tw-max-w-[95vw] tw--translate-x-1/2 tw--translate-y-1/2 tw-rounded-lg tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-xl tw-ring-1 tw-ring-black/10">
          <div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-neutral-800 tw-px-4 tw-py-3">
            {title ? <DialogPrimitive.Title className="tw-text-base tw-font-semibold">{title}</DialogPrimitive.Title> : <span />}
            <DialogPrimitive.Close className="tw-rounded tw-px-2 tw-py-1 tw-text-neutral-400 hover:tw-bg-neutral-800 hover:tw-text-neutral-200">×</DialogPrimitive.Close>
          </div>
          <div className="tw-p-4">{children}</div>
          {footer && <div className="tw-flex tw-justify-end tw-gap-2 tw-border-t tw-border-neutral-800 tw-p-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};


