import React, { useState, useRef, useEffect } from 'react';

interface CustomTitleBarProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onMirror?: () => void;
  onNewPreset?: () => void;
  onSavePreset?: () => void;
  onLoadPreset?: () => void;
  onCompositionSettings?: () => void;
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  onMirror,
  onNewPreset,
  onSavePreset,
  onLoadPreset,
  onCompositionSettings
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
      <div className="title-bar-left" style={{ WebkitAppRegion: 'drag' as any }}>
        <div className="app-title">VJ App</div>
      </div>
      
      <div className="title-bar-center" style={{ WebkitAppRegion: 'no-drag' as any }}>
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
        </div>
      </div>
      
      <div className="title-bar-right" style={{ WebkitAppRegion: 'no-drag' as any }}>
        <button className="window-control minimize" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMinimize && onMinimize(); }}>
          <span>─</span>
        </button>
        <button className="window-control maximize" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMaximize && onMaximize(); }}>
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