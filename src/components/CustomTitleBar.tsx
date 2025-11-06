import React, { useState, useRef, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent, Dialog, DialogContent, DialogClose, Button } from './ui';
import { useStore } from '../store/store';
import { EnterFullScreenIcon, MinusIcon, SquareIcon, Cross2Icon, HamburgerMenuIcon, ChevronRightIcon } from '@radix-ui/react-icons';

interface CustomTitleBarProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onMirror?: () => void;
  onToggleAppFullscreen?: () => void;
  onNewPreset?: () => void;
  onSavePreset?: () => void;
  onSaveAsPreset?: () => void;
  onLoadPreset?: () => void;
  onCompositionSettings?: () => void;
  onOpenSettings?: () => void;
  onToggleTimeline?: () => void;
  onToggleUIDemo?: () => void;
  onStyleGuide?: () => void;
  debugMode?: boolean;
  onToggleDebug?: () => void;
  onSignOut?: () => void;
  isMaximized?: boolean;
  onAdvancedMirror?: () => void;
  onMirrorFullscreen?: () => void;
  onRecord?: () => void;
  onRecordSettings?: () => void;
  isRecording?: boolean;
  onRenderMovie?: () => void;
  onOfflineStart?: () => void;
  onOfflineStop?: () => void;
  onOfflineSave?: () => void;
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  onMirror,
  onToggleAppFullscreen,
  onNewPreset,
  onSavePreset,
  onSaveAsPreset,
  onLoadPreset,
  onCompositionSettings,
  onOpenSettings,
  onToggleTimeline,
  onToggleUIDemo,
  onStyleGuide,
  debugMode = false,
  onToggleDebug,
  onSignOut,
  isMaximized = false,
  onAdvancedMirror,
  onMirrorFullscreen,
  onRecord,
  onRecordSettings,
  isRecording,
  onRenderMovie,
  onOfflineStart,
  onOfflineStop,
  onOfflineSave
}) => {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFileOpen, setMobileFileOpen] = useState(false);
  const [mobileExternalOpen, setMobileExternalOpen] = useState(false);
  const [mobileRecordOpen, setMobileRecordOpen] = useState(false);
  const [mobileDevOpen, setMobileDevOpen] = useState(false);
  
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [externalMenuOpen, setExternalMenuOpen] = useState(false);
  const externalMenuRef = useRef<HTMLDivElement>(null);
  const [offlineActive, setOfflineActive] = useState<boolean>(false);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const devMenuRef = useRef<HTMLDivElement>(null);
  
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  // API docs removed
  const { currentPresetName, showTimeline } = (useStore() as any) || {};

  // Detect Electron vs Web
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

  // Resolve logo path for both dev and production
  // Vite copies public/icons/ to dist/icons/ during build
  // With base: './', we need to use relative path from index.html location
  const getLogoPath = () => {
    // In production, dist/icons/sonomika.svg should exist
    // Use relative path which works with base: './'
    return './icons/sonomika.svg';
  };

  // Radix Popover handles outside clicks when controlled via open/onOpenChange
  // so we avoid manual document listeners that could intercept item clicks

  // Expose mobile menu opener only on mobile viewports
  useEffect(() => {
    const setHandler = () => { (window as any).__openMobileMenu = () => setMobileMenuOpen(true); };
    const clearHandler = () => { try { delete (window as any).__openMobileMenu; } catch {} };
    let remove: (() => void) | null = null;
    try {
      const mq = window.matchMedia('(min-width: 900px)'); // header breakpoint
      const update = () => {
        if (mq.matches) {
          clearHandler(); // desktop/tablet: disable
        } else {
          setHandler(); // mobile: enable
        }
      };
      update();
      const listener = () => update();
      if (typeof (mq as any).addEventListener === 'function') {
        (mq as any).addEventListener('change', listener);
        remove = () => { try { (mq as any).removeEventListener('change', listener); } catch {} };
      } else {
        (mq as any).addListener(listener);
        remove = () => { try { (mq as any).removeListener(listener); } catch {} };
      }
    } catch {
      // Fallback: assume desktop and keep disabled
      clearHandler();
    }
    return () => { if (remove) remove(); clearHandler(); };
  }, []);

  const handleMenuItemClick = (action: (() => void) | undefined) => {
    setFileMenuOpen(false);
    if (action) {
      action();
    }
  };

  return (
    <div className="tw-fixed tw-top-0 tw-left-0 tw-right-0 tw-h-8 lg:tw-h-16 hdr-900-h-16 tw-z-[5000] tw-select-none">
      {/* Top system bar: logo + window controls */}
      <div className="tw-h-8 tw-flex tw-items-center tw-justify-between tw-pl-0 tw-pr-2 tw-cursor-grab app-drag-region" style={{ backgroundColor: '#0d0d0d' }}>
        <div className="tw-flex tw-items-center tw-flex-none tw-min-w-[120px]">
          <div className="tw-ml-[3px] tw-px-3 tw-py-2 tw-rounded tw-transition-colors app-no-drag">
            <img src={getLogoPath()} alt="sonomika" className="tw-h-3 tw-w-auto logo-svg" onError={(e) => {
              const target = e.target as HTMLImageElement;
              // Try multiple fallback paths
              const fallbacks = [
                '/icons/sonomika.svg',
                './icons/sonomika.svg',
                '../icons/sonomika.svg',
                'icons/sonomika.svg'
              ];
              const currentIndex = fallbacks.indexOf(target.src);
              if (currentIndex < fallbacks.length - 1) {
                target.src = fallbacks[currentIndex + 1];
              }
            }} />
          </div>
          {currentPresetName && (
            <>
              <div className="tw-text-neutral-500 tw-pl-[2px] tw-pr-2 app-no-drag">/</div>
              <div className="tw-text-xs tw-text-neutral-300 app-no-drag tw-truncate tw-max-w-[40vw]">
                {currentPresetName}
              </div>
            </>
          )}
        </div>
        {isElectron && (
          <div className="tw-flex tw-items-center tw-gap-1 app-no-drag">
            <button className="app-no-drag tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
              e.preventDefault(); e.stopPropagation(); onToggleAppFullscreen && onToggleAppFullscreen();
            }} aria-label="Fullscreen" title="Fullscreen">
              <EnterFullScreenIcon className="tw-w-3.5 tw-h-3.5" />
            </button>
            <button className="app-no-drag tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
              e.preventDefault(); e.stopPropagation(); onMinimize && onMinimize();
            }} aria-label="Minimize">
              <MinusIcon className="tw-w-3.5 tw-h-3.5" />
            </button>
            <button className="app-no-drag tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
              e.preventDefault(); e.stopPropagation(); onMaximize && onMaximize();
            }} aria-label={isMaximized ? 'Restore' : 'Maximize'} title={isMaximized ? 'Restore' : 'Maximize'}>
              {isMaximized ? (
                // Restore icon (overlapping squares like Cursor)
                <SquareIcon className="tw-w-3.5 tw-h-3.5" />
              ) : (
                // Maximize icon (single square)
                <SquareIcon className="tw-w-3.5 tw-h-3.5" />
              )}
            </button>
            <button 
              className="app-no-drag tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-[#e81123] tw-transition-colors" 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose && onClose(); }}
              title="Close Window"
              aria-label="Close"
            >
              <Cross2Icon className="tw-w-3.5 tw-h-3.5" />
            </button>
          </div>
        )}
        {!isElectron && onSignOut && (
          <div className="tw-flex tw-items-center tw-gap-1 app-no-drag">
            <Button variant="outline" size="sm" onClick={() => onSignOut?.()}>
              Sign out
            </Button>
          </div>
        )}
      </div>

      {/* Secondary app bar: menus and controls (hidden on small; show at >=900px) */}
      <div className="tw-h-8 tw-hidden hdr-900-flex tw-items-center tw-justify-start tw-px-2 tw-cursor-grab app-drag-region" style={{ backgroundColor: '#0d0d0d' }}>
        {/* Mobile hamburger (hidden; toolbar provides one near Stop) */}
        <button
          className="tw-hidden lg:tw-hidden tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-text-neutral-200 tw-bg-transparent tw-border-0 app-no-drag"
          aria-label="Open menu"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMobileMenuOpen(true); }}
        >
          <HamburgerMenuIcon className="tw-w-4 tw-h-4" />
        </button>

        <div className="tw-flex tw-items-center tw-gap-5">
          <div className="menu-item-dropdown app-no-drag" ref={fileMenuRef}>
            <Popover open={fileMenuOpen} onOpenChange={setFileMenuOpen}>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent`}
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
                    onClick={(e) => { e.stopPropagation(); onSaveAsPreset && onSaveAsPreset(); setFileMenuOpen(false); }}
                  >
                    Save As…
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
          
          <button 
            className="tw-px-2 tw-py-1 tw-text-xs tw-text-[hsl(var(--accent))] tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" 
            onClick={onToggleTimeline}
          >
            {showTimeline ? 'Columns' : 'Timeline'}
          </button>
          
          <button 
            className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" 
            onClick={onCompositionSettings}
          >
            Composition Settings
          </button>
          {/* External dropdown before Settings */}
          <div className="menu-item-dropdown app-no-drag" ref={externalMenuRef}>
            <Popover open={externalMenuOpen} onOpenChange={setExternalMenuOpen}>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent`}
                >
                  External
                </button>
              </PopoverTrigger>
              {externalMenuOpen && (
                <PopoverContent className="tw-min-w-[180px] app-no-drag" align="start" side="bottom" >
                  <div className="tw-flex tw-flex-col tw-py-1">
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); try { (useStore.getState() as any).setMirrorKeepPreview?.(true); } catch {} onMirror && onMirror(); setExternalMenuOpen(false); }}
                    >
                      Mirror
                    </button>
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); try { (useStore.getState() as any).setMirrorKeepPreview?.(false); } catch {} onMirror && onMirror(); setExternalMenuOpen(false); }}
                    >
                      Mirror (No preview)
                    </button>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>

          {/* Record dropdown */}
          <div className="menu-item-dropdown app-no-drag">
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent`}
                >
                  <span className="tw-inline-flex tw-items-center tw-gap-1">
                    Record
                    {isRecording && (
                      <div className="tw-w-3 tw-h-3 tw-bg-red-500 tw-rounded-full tw-animate-pulse"></div>
                    )}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="tw-min-w-[180px] app-no-drag" align="start" side="bottom" >
                <div className="tw-flex tw-flex-col tw-py-1">
                  <button 
                    className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      console.log('Record button clicked, isRecording:', isRecording);
                      onRecord && onRecord(); 
                    }}
                  >
                    {isRecording ? 'Stop Recording' : 'Record'}
                  </button>
                  <button 
                    className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                    onClick={(e) => { e.stopPropagation(); onRecordSettings && onRecordSettings(); }}
                  >
                    Record Settings
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <button 
            className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" 
            onClick={onOpenSettings}
          >
            Settings
          </button>
          {/* Help menu removed per request */}
          {process.env.NODE_ENV === 'development' && onStyleGuide && (
            <button 
              className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" 
              onClick={onStyleGuide}
            >
              Style Guide
            </button>
          )}

          {/* Developer dropdown removed per request */}

          
        </div>
      </div>

      {/* Mobile menu dialog */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent position="right" withClose={false} className="tw-w-[280px] tw-max-w-[280px] tw-rounded-none tw-border-l tw-border-neutral-800 tw-bg-neutral-900 tw-p-0 tw-shadow-lg">
          <div className="tw-flex tw-items-center tw-justify-between tw-px-4 tw-pt-4 tw-pb-2 tw-border-b tw-border-neutral-800">
            <div className="tw-text-sm tw-text-left">Menu</div>
            <DialogClose className="tw-bg-transparent tw-text-neutral-300 hover:tw-text-neutral-100 tw-p-0 tw-w-6 tw-h-6 tw-inline-flex tw-items-center tw-justify-center focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-ring focus:tw-ring-offset-2">
              <Cross2Icon className="tw-w-4 tw-h-4" />
              <span className="tw-sr-only">Close</span>
            </DialogClose>
          </div>
          <div className="tw-bg-neutral-900 tw-text-neutral-200 tw-flex tw-flex-col tw-h-[calc(100vh-42px)] tw-overflow-y-auto">
            <div className="tw-p-2 tw-space-y-1">
              {/* File group */}
              <button
                className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100"
                onClick={() => setMobileFileOpen(!mobileFileOpen)}
              >
                <span>File</span>
                <ChevronRightIcon className={`tw-w-3.5 tw-h-3.5 tw-transition-transform ${mobileFileOpen ? 'tw-rotate-90' : ''}`} />
              </button>
              {mobileFileOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onNewPreset?.(); setMobileMenuOpen(false); }}>New Set</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onSavePreset?.(); setMobileMenuOpen(false); }}>Save Set</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onSaveAsPreset?.(); setMobileMenuOpen(false); }}>Save As…</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onLoadPreset?.(); setMobileMenuOpen(false); }}>Load Set</button>
                </div>
              )}

              {/* Timeline/Columns toggle (match desktop label) */}
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onToggleTimeline?.(); setMobileMenuOpen(false); }}>{showTimeline ? 'Columns' : 'Timeline'}</button>

              {/* External dropdown (mobile) */}
              <button
                className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800"
                onClick={() => setMobileExternalOpen(!mobileExternalOpen)}
              >
                <span>External</span>
                <ChevronRightIcon className={`tw-w-3.5 tw-h-3.5 tw-transition-transform ${mobileExternalOpen ? 'tw-rotate-90' : ''}`} />
              </button>
              {mobileExternalOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { try { (useStore.getState() as any).setMirrorKeepPreview?.(true); } catch {} onMirror?.(); setMobileMenuOpen(false); }}>Mirror</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { try { (useStore.getState() as any).setMirrorKeepPreview?.(false); } catch {} onMirror?.(); setMobileMenuOpen(false); }}>Mirror (No preview)</button>
                </div>
              )}

              {/* Record dropdown (mobile) */}
              <button
                className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800"
                onClick={() => setMobileRecordOpen(!mobileRecordOpen)}
              >
                <span>Record</span>
                <ChevronRightIcon className={`tw-w-3.5 tw-h-3.5 tw-transition-transform ${mobileRecordOpen ? 'tw-rotate-90' : ''}`} />
              </button>
              {mobileRecordOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onRecord?.(); setMobileMenuOpen(false); }}>Record</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onRecordSettings?.(); setMobileMenuOpen(false); }}>Record Settings</button>
                </div>
              )}
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onCompositionSettings?.(); setMobileMenuOpen(false); }}>Composition Settings</button>
              {/* Settings */}
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onOpenSettings?.(); setMobileMenuOpen(false); }}>Settings</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      

      
    </div>
  );
}; 