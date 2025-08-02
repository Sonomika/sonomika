import React, { useState, useRef, useEffect } from 'react';

interface CustomTitleBarProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onMirror?: () => void;
  onNewSet?: () => void;
  onSaveSet?: () => void;
  onOpenSet?: () => void;
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  onMirror,
  onNewSet,
  onSaveSet,
  onOpenSet
}) => {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFileMenuClick = () => {
    setFileMenuOpen(!fileMenuOpen);
  };

  const handleMenuItemClick = (action: (() => void) | undefined) => {
    setFileMenuOpen(false);
    if (action) {
      action();
    }
  };

  return (
    <div className="custom-title-bar">
      <div className="title-bar-left">
        <div className="app-title">VJ App</div>
      </div>
      
      <div className="title-bar-center">
        <div className="menu-bar">
          <button className="menu-item" onClick={onMirror}>
            Mirror
          </button>
          <div className="menu-item-dropdown" ref={fileMenuRef}>
            <button 
              className={`menu-item ${fileMenuOpen ? 'active' : ''}`} 
              onClick={handleFileMenuClick}
            >
              File
              <span className="dropdown-arrow">▼</span>
            </button>
            {fileMenuOpen && (
              <div className="dropdown-menu">
                <button 
                  className="dropdown-item"
                  onClick={() => handleMenuItemClick(onNewSet)}
                >
                  New Set
                </button>
                <button 
                  className="dropdown-item"
                  onClick={() => handleMenuItemClick(onSaveSet)}
                >
                  Save Set
                </button>
                <button 
                  className="dropdown-item"
                  onClick={() => handleMenuItemClick(onOpenSet)}
                >
                  Open Set
                </button>
              </div>
            )}
          </div>
          <button className="menu-item">
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