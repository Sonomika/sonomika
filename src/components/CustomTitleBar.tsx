import React, { useState, useRef, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './ui';

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
  debugMode?: boolean;
  onToggleDebug?: () => void;
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
  onStyleGuide,
  debugMode = false,
  onToggleDebug
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
    <div className="tw-fixed tw-top-0 tw-left-0 tw-right-0 tw-h-8 tw-bg-gradient-to-br tw-from-[#1a1a1a] tw-to-[#2a2a2a] tw-flex tw-items-center tw-justify-between tw-px-2 tw-border-b tw-border-neutral-800 tw-z-[5000] tw-select-none tw-cursor-grab app-drag-region">
      <div className="tw-flex tw-items-center tw-flex-none tw-min-w-[120px]">
        <div className="tw-text-white tw-text-[14px] tw-font-bold tw-ml-2 tw-px-3 tw-py-2 tw-rounded tw-transition-colors">VJ App</div>
      </div>
      
      <div className="tw-flex-1 tw-flex tw-justify-start tw-ml-5">
        <div className="tw-flex tw-items-center tw-gap-5">
          <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onMirror}>
            Mirror
          </button>
          <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onToggleAppFullscreen}>
            Fullscreen
          </button>
          <div className="menu-item-dropdown" ref={fileMenuRef}>
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag`}
                  onClick={handleFileMenuClick}
                >
                  File
                  <span className="tw-text-white">▼</span>
                </button>
              </PopoverTrigger>
              {fileMenuOpen && (
                <PopoverContent className="tw-min-w-[180px]" >
                  <div className="tw-flex tw-flex-col tw-py-1">
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800 tw-text-neutral-100"
                      onClick={() => handleMenuItemClick(onNewPreset)}
                    >
                      New Preset
                    </button>
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800 tw-text-neutral-100"
                      onClick={() => handleMenuItemClick(onSavePreset)}
                    >
                      Save Preset
                    </button>
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800 tw-text-neutral-100"
                      onClick={() => handleMenuItemClick(onLoadPreset)}
                    >
                      Load Preset
                    </button>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>
          <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onCompositionSettings}>
            Composition Settings
          </button>
          {process.env.NODE_ENV === 'development' && onStyleGuide && (
            <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onStyleGuide}>
              Style Guide
            </button>
          )}
          {process.env.NODE_ENV === 'development' && onToggleDebug && (
                         <button 
               className={`tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag`} 
               onClick={onToggleDebug}
               title={debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode'}
             >
               Debug
             </button>
          )}
        </div>
      </div>
      
      <div className="tw-flex tw-items-center tw-gap-1 app-no-drag">
        <button className="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-[12px] tw-text-neutral-300 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
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
        <button className="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-[12px] tw-text-neutral-300 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
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
          className="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-[12px] tw-text-neutral-300 hover:tw-text-white hover:tw-bg-[#e81123] tw-transition-colors tw-relative tw-z-[5001]" 
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
          title="Close Window"
        >
          <span>×</span>
        </button>
      </div>
    </div>
  );
}; 