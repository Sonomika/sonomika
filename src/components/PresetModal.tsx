import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  onSecondary?: () => void;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  secondaryText?: string;
}

export const PresetModal: React.FC<PresetModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSecondary,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  secondaryText
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  const handleConfirm = () => {
    onConfirm(value);
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
   >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <div className="tw-space-y-3 tw-mt-2">
          {placeholder && (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              autoFocus
              className="tw-w-full tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2.5 tw-py-1.5 tw-text-neutral-100 placeholder:tw-text-neutral-500 focus:tw-outline-none focus:tw-ring-2"
              style={{ ['--tw-ring-color' as any]: 'var(--accent-color)' }}
            />
          )}
          <div className="tw-flex tw-justify-end tw-gap-2 tw-pt-2">
            {secondaryText && onSecondary && (
              <button className="tw-bg-neutral-800 tw-px-3 tw-py-1.5 tw-text-neutral-200 hover:tw-bg-neutral-700" onClick={() => { onSecondary(); onClose(); }}>
                {secondaryText}
              </button>
            )}
            <button className="tw-bg-neutral-800 tw-px-3 tw-py-1.5 tw-text-neutral-200 hover:tw-bg-neutral-700" onClick={onClose}>
              {cancelText}
            </button>
            <button className="tw-px-3 tw-py-1.5 tw-text-neutral-200 tw-bg-neutral-800 tw-border tw-border-neutral-800 hover:tw-bg-neutral-700" onClick={handleConfirm}>
              {confirmText}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 