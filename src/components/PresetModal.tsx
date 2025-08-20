import React, { useState, useEffect } from 'react';
import { Dialog } from './ui';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

export const PresetModal: React.FC<PresetModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel'
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
      <div className="tw-space-y-3">
        <h3 className="tw-text-base tw-font-semibold">{title}</h3>
        <p className="tw-text-neutral-300">{message}</p>
        {placeholder && (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            autoFocus
            className="tw-w-full tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2.5 tw-py-1.5 tw-text-neutral-100 placeholder:tw-text-neutral-500 focus:tw-outline-none focus:tw-ring-2"
            style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
          />
        )}
        <div className="tw-flex tw-justify-end tw-gap-2 tw-pt-2">
          <button className="tw-bg-neutral-800 tw-px-3 tw-py-1.5 tw-text-neutral-200 hover:tw-bg-neutral-700" onClick={onClose}>
            {cancelText}
          </button>
          <button className="tw-px-3 tw-py-1.5 tw-text-white" style={{ backgroundColor: 'var(--accent)' }} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </Dialog>
  );
}; 