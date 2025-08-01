import React from 'react';

interface CustomTitleBarProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onMirror?: () => void;
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  onMirror
}) => {
  return (
    <div className="custom-title-bar">
      <div className="title-bar-left">
        <div className="app-title">VJ App</div>
      </div>
      
      <div className="title-bar-center">
        <div className="menu-bar">
          <button className="menu-item" onClick={onMirror}>
            <span className="menu-icon">🪞</span>
            Mirror
          </button>
          <button className="menu-item">
            <span className="menu-icon">📁</span>
            File
          </button>
          <button className="menu-item">
            <span className="menu-icon">⚙️</span>
            Settings
          </button>
        </div>
      </div>
      
      <div className="title-bar-right">
        <button className="window-control minimize" onClick={onMinimize}>
          <span>─</span>
        </button>
        <button className="window-control maximize" onClick={onMaximize}>
          <span>□</span>
        </button>
        <button 
          className="window-control close" 
          onClick={(e) => {
            console.log('=== CLOSE BUTTON CLICKED ===');
            console.log('Event:', e);
            console.log('Target:', e.target);
            console.log('Current target:', e.currentTarget);
            e.preventDefault();
            e.stopPropagation();
            if (onClose) {
              console.log('Calling onClose function...');
              onClose();
            } else {
              console.log('onClose function is undefined!');
            }
          }}
          style={{
            backgroundColor: 'rgba(0, 0, 255, 0.1)',
            border: '1px solid rgba(0, 0, 255, 0.3)',
            position: 'relative',
            zIndex: 1002
          }}
          title="Close Window"
        >
          <span>×</span>
        </button>
      </div>
    </div>
  );
}; 