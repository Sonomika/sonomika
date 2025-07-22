import React from 'react';
import { KeyboardShortcuts } from '../utils/KeyboardShortcuts';

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Keyboard Shortcuts</h2>

        <div className="shortcut-help">
          {shortcuts.map(([key, config]) => (
            <React.Fragment key={key}>
              <kbd>{formatKey(key)}</kbd>
              <div>{config.description}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}; 