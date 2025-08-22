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
  onOpenSettings?: () => void;
  onToggleUIDemo?: () => void;
  onStyleGuide?: () => void;
  debugMode?: boolean;
  onToggleDebug?: () => void;
  onSignOut?: () => void;
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
  onOpenSettings,
  onToggleUIDemo,
  onStyleGuide,
  debugMode = false,
  onToggleDebug,
  onSignOut
}) => {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  // Detect Electron vs Web
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

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
    <div className="tw-fixed tw-top-0 tw-left-0 tw-right-0 tw-h-16 tw-z-[5000] tw-select-none">
      {/* Top system bar: logo + window controls */}
      <div className="tw-h-8 tw-flex tw-items-center tw-justify-between tw-px-2 tw-cursor-grab app-drag-region" style={{ backgroundColor: '#111' }}>
        <div className="tw-flex tw-items-center tw-flex-none tw-min-w-[120px]">
          <div className="tw-text-white tw-text-[14px] tw-font-bold tw-ml-2 tw-px-3 tw-py-2 tw-rounded tw-transition-colors app-no-drag">sonomika</div>
        </div>
        {isElectron && (
          <div className="tw-flex tw-items-center tw-gap-1 app-no-drag">
            <button className="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
              e.preventDefault(); e.stopPropagation(); onMinimize && onMinimize();
            }} aria-label="Minimize">
              <svg className="tw-w-3.5 tw-h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button className="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
              e.preventDefault(); e.stopPropagation(); onMaximize && onMaximize();
            }} aria-label="Maximize">
              <svg className="tw-w-3.5 tw-h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3.75" y="3.75" width="8.5" height="8.5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button 
              className="tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-[#e81123] tw-transition-colors" 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose && onClose(); }}
              title="Close Window"
              aria-label="Close"
            >
              <svg className="tw-w-3.5 tw-h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="4.2" y1="4.2" x2="11.8" y2="11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="11.8" y1="4.2" x2="4.2" y2="11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {!isElectron && onSignOut && (
          <div className="tw-flex tw-items-center tw-gap-1 app-no-drag">
            <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border tw-border-neutral-700 hover:tw-bg-neutral-800" onClick={() => onSignOut?.()}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Secondary app bar: menus and controls */}
      <div className="tw-h-8 tw-flex tw-items-center tw-justify-start tw-px-2 tw-cursor-grab app-drag-region" style={{ backgroundColor: '#111' }}>
        <div className="tw-flex tw-items-center tw-gap-5">
          <div className="menu-item-dropdown app-no-drag" ref={fileMenuRef}>
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent`}
                  onClick={handleFileMenuClick}
                >
                  File
                </button>
              </PopoverTrigger>
              {fileMenuOpen && (
                <PopoverContent className="tw-min-w-[180px] app-no-drag" align="start" side="bottom" >
                  <div className="tw-flex tw-flex-col tw-py-1">
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); onNewPreset && onNewPreset(); setFileMenuOpen(false); }}
                    >
                      New Set
                    </button>
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); onSavePreset && onSavePreset(); setFileMenuOpen(false); }}
                    >
                      Save Set
                    </button>
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); onLoadPreset && onLoadPreset(); setFileMenuOpen(false); }}
                    >
                      Load Set
                    </button>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>
          <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onMirror}>
            Mirror
          </button>
          {isElectron && (
            <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onToggleAppFullscreen}>
              Fullscreen
            </button>
          )}
          <button 
            className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" 
            onClick={onToggleUIDemo}
          >
            UI Demo
          </button>
          <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onCompositionSettings}>
            Composition Settings
          </button>
          <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onOpenSettings}>
            Settings
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
    </div>
  );
}; 