import React, { useState, useRef, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent, Dialog, DialogContent, DialogClose, Button } from './ui';
import { useStore } from '../store/store';

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
          <div className="tw-text-white tw-text-sm tw-font-bold tw-ml-[3px] tw-px-3 tw-py-2 tw-rounded tw-transition-colors app-no-drag">sonomika</div>
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
              <svg className="tw-w-3.5 tw-h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 3h4v2H5v2H3V3zm10 0H9v2h2v2h2V3zM3 11h2v2h2v2H3v-4zm10 0v4h-2v-2h-2v-2h4z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="app-no-drag tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
              e.preventDefault(); e.stopPropagation(); onMinimize && onMinimize();
            }} aria-label="Minimize">
              <svg className="tw-w-3.5 tw-h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button className="app-no-drag tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-neutral-700 tw-transition-colors" onClick={(e) => { 
              e.preventDefault(); e.stopPropagation(); onMaximize && onMaximize();
            }} aria-label={isMaximized ? 'Restore' : 'Maximize'} title={isMaximized ? 'Restore' : 'Maximize'}>
              {isMaximized ? (
                // Restore icon (overlapping squares like Cursor)
                <svg className="tw-w-3.5 tw-h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              ) : (
                // Maximize icon (single square)
                <svg className="tw-w-3.5 tw-h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </button>
            <button 
              className="app-no-drag tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-bg-transparent tw-border-0 hover:tw-text-white hover:tw-bg-[#e81123] tw-transition-colors" 
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>
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
                    {offlineActive ? (
                      <button 
                        className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          setOfflineActive(false); 
                          try { onOfflineStop && onOfflineStop(); } catch {}
                          try { 
                            // Ask user where to save
                            const result = await (window as any).electron?.showSaveDialog?.({
                              title: 'Save Movie',
                              defaultPath: `${(useStore.getState() as any).currentPresetName || 'movie'}.mp4`,
                              filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
                            });
                            if (!result || result.canceled || !result.filePath) { setExternalMenuOpen(false); return; }
                            const fps = Math.round(((window as any).__offlineRecord?.fpsEstimate || 0));
                            // App audio is captured automatically during recording; just finish with destPath
                            const res = await (window as any).electron?.offlineRenderFinish?.({ destPath: result.filePath, fps: (fps > 0 ? fps : undefined) });
                            if (!res?.success) {
                              const msg = res?.error || 'Unknown error';
                              (window as any).alert?.(`Saved MP4 failed: ${msg}`);
                            } else {
                              (window as any).alert?.(`Saved MP4: ${res.videoPath}`);
                            }
                          } catch (err) {
                            (window as any).alert?.('Saved MP4 failed. Is ffmpeg-static installed?');
                          }
                          setExternalMenuOpen(false); 
                        }}
                      >
                        Stop Recording (offline)
                      </button>
                    ) : (
                      <button 
                        className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                        onClick={(e) => { e.stopPropagation(); setOfflineActive(true); onOfflineStart && onOfflineStart(); setExternalMenuOpen(false); }}
                      >
                        Start Recording (offline)
                      </button>
                    )}
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); try { (useStore.getState() as any).setMirrorKeepPreview?.(false); } catch {} onMirror && onMirror(); setExternalMenuOpen(false); }}
                    >
                      Mirror (No preview)
                    </button>
                  <button 
                    className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                    onClick={(e) => { e.stopPropagation(); onMirrorFullscreen && onMirrorFullscreen(); setExternalMenuOpen(false); }}
                  >
                    Fullscreen Output
                  </button>
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); onAdvancedMirror && onAdvancedMirror(); setExternalMenuOpen(false); }}
                    >
                      Advanced Mirror
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
          {/* Help dropdown */}
          <div className="menu-item-dropdown app-no-drag" ref={helpMenuRef}>
            <Popover open={helpMenuOpen} onOpenChange={setHelpMenuOpen}>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent`}
                >
                  Help
                </button>
              </PopoverTrigger>
              {helpMenuOpen && (
                <PopoverContent className="tw-min-w-[180px] app-no-drag" align="start" side="bottom" >
                  <div className="tw-flex tw-flex-col tw-py-1">
                    
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>
          {process.env.NODE_ENV === 'development' && onStyleGuide && (
            <button 
              className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" 
              onClick={onStyleGuide}
            >
              Style Guide
            </button>
          )}

          {/* Developer dropdown: move to far right */}
          <div className="menu-item-dropdown app-no-drag tw-ml-auto" ref={devMenuRef}>
            <Popover open={devMenuOpen} onOpenChange={setDevMenuOpen}>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent`}
                >
                  Developer
                </button>
              </PopoverTrigger>
              {devMenuOpen && (
                <PopoverContent className="tw-min-w-[200px] app-no-drag" align="end" side="bottom" >
                  <div className="tw-flex tw-flex-col tw-py-1">
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); onToggleUIDemo && onToggleUIDemo(); setDevMenuOpen(false); }}
                    >
                      UI Demo
                    </button>
                    {process.env.NODE_ENV === 'development' && onToggleDebug && (
                      <button 
                        className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                        onClick={(e) => { e.stopPropagation(); onToggleDebug?.(); setDevMenuOpen(false); }}
                      >
                        {debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode'}
                      </button>
                    )}
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>

          
        </div>
      </div>

      {/* Mobile menu dialog */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent position="right" withClose={false} className="tw-w-[280px] tw-max-w-[280px] tw-rounded-none tw-border-l tw-border-neutral-800 tw-bg-neutral-900 tw-p-0 tw-shadow-lg">
          <div className="tw-flex tw-items-center tw-justify-between tw-px-4 tw-pt-4 tw-pb-2 tw-border-b tw-border-neutral-800">
            <div className="tw-text-sm tw-text-left">Menu</div>
            <DialogClose className="tw-bg-transparent tw-text-neutral-300 hover:tw-text-neutral-100 tw-p-0 tw-w-6 tw-h-6 tw-inline-flex tw-items-center tw-justify-center focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-ring focus:tw-ring-offset-2">
              <svg className="tw-w-4 tw-h-4" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="4.2" y1="4.2" x2="11.8" y2="11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="11.8" y1="4.2" x2="4.2" y2="11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`tw-transition-transform ${mobileFileOpen ? 'tw-rotate-90' : ''}`}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
              </button>
              {mobileFileOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onNewPreset?.(); setMobileMenuOpen(false); }}>New Set</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onSavePreset?.(); setMobileMenuOpen(false); }}>Save Set</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onLoadPreset?.(); setMobileMenuOpen(false); }}>Load Set</button>
                </div>
              )}

              {/* Timeline toggle */}
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onToggleTimeline?.(); setMobileMenuOpen(false); }}>Timeline</button>

              {/* External dropdown (mobile) */}
              <button
                className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800"
                onClick={() => setMobileExternalOpen(!mobileExternalOpen)}
              >
                <span>External</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`tw-transition-transform ${mobileExternalOpen ? 'tw-rotate-90' : ''}`}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
              </button>
              {mobileExternalOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { try { (useStore.getState() as any).setMirrorKeepPreview?.(true); } catch {} onMirror?.(); setMobileMenuOpen(false); }}>Mirror</button>
                  {offlineActive ? (
                    <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={async () => {
                      setOfflineActive(false);
                      try { onOfflineStop && onOfflineStop(); } catch {}
                      try {
                        const result = await (window as any).electron?.showSaveDialog?.({ title: 'Save Movie', defaultPath: `${(useStore.getState() as any).currentPresetName || 'movie'}.mp4`, filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]});
                        if (!result || result.canceled || !result.filePath) { setMobileMenuOpen(false); return; }
                        const fps = Math.round(((window as any).__offlineRecord?.fpsEstimate || 0));
                        const res = await (window as any).electron?.offlineRenderFinish?.({ destPath: result.filePath, fps: (fps > 0 ? fps : undefined) });
                        if (!res?.success) { (window as any).alert?.(`Saved MP4 failed: ${res?.error || 'Unknown error'}`); } else { (window as any).alert?.(`Saved MP4: ${res.videoPath}`); }
                      } catch { (window as any).alert?.('Saved MP4 failed. Is ffmpeg-static installed?'); }
                      setMobileMenuOpen(false);
                    }}>Stop Recording (offline)</button>
                  ) : (
                    <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { setOfflineActive(true); onOfflineStart && onOfflineStart(); setMobileMenuOpen(false); }}>Start Recording (offline)</button>
                  )}
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { try { (useStore.getState() as any).setMirrorKeepPreview?.(false); } catch {} onMirror?.(); setMobileMenuOpen(false); }}>Mirror (No preview)</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onAdvancedMirror?.(); setMobileMenuOpen(false); }}>Advanced Mirror</button>
                </div>
              )}

              {/* Record dropdown (mobile) */}
              <button
                className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800"
                onClick={() => setMobileRecordOpen(!mobileRecordOpen)}
              >
                <span>Record</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`tw-transition-transform ${mobileRecordOpen ? 'tw-rotate-90' : ''}`}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
              </button>
              {mobileRecordOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onRecord?.(); setMobileMenuOpen(false); }}>Record</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onRecordSettings?.(); setMobileMenuOpen(false); }}>Record Settings</button>
                </div>
              )}
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onCompositionSettings?.(); setMobileMenuOpen(false); }}>Composition Settings</button>
              {/* Developer dropdown (mobile) */}
              <button
                className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800"
                onClick={() => setMobileDevOpen(!mobileDevOpen)}
              >
                <span>Developer</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`tw-transition-transform ${mobileDevOpen ? 'tw-rotate-90' : ''}`}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
              </button>
              {mobileDevOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onToggleUIDemo?.(); setMobileMenuOpen(false); }}>UI Demo</button>
                  {process.env.NODE_ENV === 'development' && onToggleDebug && (
                    <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onToggleDebug?.(); setMobileMenuOpen(false); }}>{debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode'}</button>
                  )}
                </div>
              )}
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onOpenSettings?.(); setMobileMenuOpen(false); }}>Settings</button>
              
              
              {process.env.NODE_ENV === 'development' && onToggleDebug && (
                <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 tw-text-neutral-100 hover:tw-bg-neutral-800" onClick={() => { onToggleDebug?.(); setMobileMenuOpen(false); }}>Debug</button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      

      
    </div>
  );
}; 