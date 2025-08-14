import React, { useState, useRef, useEffect } from 'react';

interface CustomTitleBarProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onMirror?: () => void;
  onToggleAppFullscreen?: () => void;
  onNewPreset?: () => void;
  onSavePreset?: () => void;
  onLoadPreset?: () => void;
  onCompositionSettings?: () => void;
  onStyleGuide?: () => void;
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  onMirror,
  onToggleAppFullscreen,
  onNewPreset,
  onSavePreset,
  onLoadPreset,
  onCompositionSettings,
  onStyleGuide
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
          <button className="menu-item" onClick={onToggleAppFullscreen}>
            Fullscreen
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
                  onClick={() => handleMenuItemClick(onNewPreset)}
                >
                  New Preset
                </button>
                <button 
                  className="dropdown-item"
                  onClick={() => handleMenuItemClick(onSavePreset)}
                >
                  Save Preset
                </button>
                <button 
                  className="dropdown-item"
                  onClick={() => handleMenuItemClick(onLoadPreset)}
                >
                  Load Preset
                </button>

              </div>
            )}
          </div>
          <button className="menu-item" onClick={onCompositionSettings}>
            Composition Settings
          </button>
          {process.env.NODE_ENV === 'development' && onStyleGuide && (
            <button className="menu-item" onClick={onStyleGuide}>
              Style Guide
            </button>
          )}
        </div>
      </div>
      
      <div className="title-bar-right">
        <button className="window-control minimize" onClick={(e) => { 
          console.log('=== MINIMIZE BUTTON CLICKED ===');
          console.log('Event:', e);
          console.log('onMinimize function:', onMinimize);
          e.preventDefault(); 
          e.stopPropagation(); 
          if (onMinimize) {
            console.log('Calling onMinimize...');
            onMinimize();
          } else {
            console.log('onMinimize is undefined!');
          }
        }}>
          <span>─</span>
        </button>
        <button className="window-control maximize" onClick={(e) => { 
          console.log('=== MAXIMIZE BUTTON CLICKED ===');
          console.log('Event:', e);
          console.log('onMaximize function:', onMaximize);
          e.preventDefault(); 
          e.stopPropagation(); 
          if (onMaximize) {
            console.log('Calling onMaximize...');
            onMaximize();
          } else {
            console.log('onMaximize is undefined!');
          }
        }}>
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
          style={{ position: 'relative', zIndex: 5001 }}
          title="Close Window"
        >
          <span>×</span>
        </button>
      </div>
    </div>
  );
}; 