import React from 'react';
import { KeyboardShortcuts } from '../utils/KeyboardShortcuts';
import { Dialog } from './ui';

interface Props {
  onClose: () => void;
}

export const ShortcutHelp: React.FC<Props> = ({ onClose }) => {
  const shortcuts = Array.from(KeyboardShortcuts.getInstance().getShortcuts());

  const formatKey = (key: string): string => {
    switch (key) {
      case ' ':
        return 'Space';
      case 'ArrowLeft':
        return '←';
      case 'ArrowRight':
        return '→';
      case 'ArrowUp':
        return '↑';
      case 'ArrowDown':
        return '↓';
      default:
        return key.toUpperCase();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Keyboard Shortcuts">
      <div className="shortcut-help tw-space-y-2">
        {shortcuts.map(([key, config]) => (
          <div key={key} className="tw-flex tw-items-center tw-gap-3">
            <kbd>{formatKey(key)}</kbd>
            <div>{config.description}</div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}; 