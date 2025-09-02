import React, { useState, useRef, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent, Dialog, DialogContent, DialogHeader, DialogTitle } from './ui';
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
  onToggleUIDemo?: () => void;
  onStyleGuide?: () => void;
  debugMode?: boolean;
  onToggleDebug?: () => void;
  onSignOut?: () => void;
  isMaximized?: boolean;
  onAdvancedMirror?: () => void;
  onRecord?: () => void;
  onRecordSettings?: () => void;
  isRecording?: boolean;
  recordUntilStop?: boolean;
  onToggleRecordUntilStop?: () => void;
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
  onSignOut,
  isMaximized = false,
  onAdvancedMirror,
  onRecord,
  onRecordSettings,
  isRecording,
  recordUntilStop,
  onToggleRecordUntilStop
}) => {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFileOpen, setMobileFileOpen] = useState(false);
  const [mobileModeOpen, setMobileModeOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [externalMenuOpen, setExternalMenuOpen] = useState(false);
  const externalMenuRef = useRef<HTMLDivElement>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [openaiDialogOpen, setOpenaiDialogOpen] = useState(false);
  const { showTimeline, setShowTimeline, currentPresetName } = (useStore() as any) || {};

  // Detect Electron vs Web
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

  // Radix Popover handles outside clicks when controlled via open/onOpenChange
  // so we avoid manual document listeners that could intercept item clicks

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
          {currentPresetName && (
            <>
              <div className="tw-text-neutral-500 tw-px-2 app-no-drag">/</div>
              <div className="tw-text-xs tw-text-neutral-300 app-no-drag tw-truncate tw-max-w-[40vw]">
                {currentPresetName}
              </div>
            </>
          )}
        </div>
        {isElectron && (
          <div className="tw-flex tw-items-center tw-gap-1 app-no-drag">
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
            <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border tw-border-neutral-700 hover:tw-bg-neutral-800" onClick={() => onSignOut?.()}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Secondary app bar: menus and controls */}
      <div className="tw-h-8 tw-flex tw-items-center tw-justify-start tw-px-2 tw-cursor-grab app-drag-region" style={{ backgroundColor: '#111' }}>
        {/* Mobile hamburger */}
        <button
          className="tw-inline-flex lg:tw-hidden tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-text-neutral-200 tw-bg-transparent tw-border-0 app-no-drag"
          aria-label="Open menu"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMobileMenuOpen(true); }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>
        </button>

        <div className="tw-flex tw-items-center tw-gap-5 tw-hidden lg:tw-flex">
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
                      onClick={(e) => { e.stopPropagation(); onMirror && onMirror(); setExternalMenuOpen(false); }}
                    >
                      Mirror
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
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z"/></svg>
                    )}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="tw-min-w-[180px] app-no-drag" align="start" side="bottom" >
                <div className="tw-flex tw-flex-col tw-py-1">
                  <button 
                    className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                    onClick={(e) => { e.stopPropagation(); onRecord && onRecord(); }}
                  >
                    {isRecording ? 'Stop Recording' : 'Record'}
                  </button>
                  <button
                    className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                    onClick={(e) => { e.stopPropagation(); onToggleRecordUntilStop && onToggleRecordUntilStop(); }}
                    aria-pressed={!!recordUntilStop}
                  >
                    <span>Record until Stop</span>
                    {recordUntilStop && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z"/></svg>
                    )}
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
          <button className="tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent app-no-drag" onClick={onOpenSettings}>
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
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); setOpenaiDialogOpen(true); setHelpMenuOpen(false); }}
                    >
                      OpenAI API Key
                    </button>
                    <button 
                      className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); setApiDialogOpen(true); setHelpMenuOpen(false); }}
                    >
                      API
                    </button>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>
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

          {/* Mode menu with tick indicator */}
          <div className="menu-item-dropdown app-no-drag" ref={modeMenuRef}>
            <Popover open={modeMenuOpen} onOpenChange={setModeMenuOpen}>
              <PopoverTrigger asChild>
                <button 
                  className={`tw-inline-flex tw-items-center tw-gap-1 tw-px-2 tw-py-1 tw-text-xs tw-text-white tw-bg-transparent tw-border-0 tw-outline-none focus:tw-outline-none focus:tw-ring-0 tw-shadow-none tw-appearance-none hover:tw-bg-transparent`}
                >
                  Mode
                </button>
              </PopoverTrigger>
              {modeMenuOpen && (
                <PopoverContent className="tw-min-w-[160px] app-no-drag" align="start" side="bottom">
                  <div className="tw-flex tw-flex-col tw-py-1">
                    <button 
                      className="tw-flex tw-items-center tw-justify-between tw-w-full tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); setShowTimeline?.(false); setModeMenuOpen(false); }}
                    >
                      <span>Column</span>
                      {!showTimeline && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z"/></svg>
                      )}
                    </button>
                    <button 
                      className="tw-flex tw-items-center tw-justify-between tw-w-full tw-px-3 tw-py-1.5 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100 tw-border-none tw-shadow-none"
                      onClick={(e) => { e.stopPropagation(); setShowTimeline?.(true); setModeMenuOpen(false); }}
                    >
                      <span>Timeline</span>
                      {showTimeline && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z"/></svg>
                      )}
                    </button>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          </div>
        </div>
      </div>

      {/* Mobile menu dialog */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent className="tw-w-[95vw] tw-max-w-sm tw-max-h-[85vh] tw-overflow-hidden tw-p-0">
          <DialogHeader className="tw-px-4 tw-pt-4 tw-pb-2">
            <DialogTitle className="tw-text-sm">Menu</DialogTitle>
          </DialogHeader>
          <div className="tw-border-t tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-200 tw-max-h-[70vh] tw-overflow-y-auto">
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
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onNewPreset?.(); setMobileMenuOpen(false); }}>New Set</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onSavePreset?.(); setMobileMenuOpen(false); }}>Save Set</button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onLoadPreset?.(); setMobileMenuOpen(false); }}>Load Set</button>
                </div>
              )}

              {/* Mode group */}
              <button
                className="tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-text-neutral-100"
                onClick={() => setMobileModeOpen(!mobileModeOpen)}
              >
                <span>Mode</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`tw-transition-transform ${mobileModeOpen ? 'tw-rotate-90' : ''}`}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
              </button>
              {mobileModeOpen && (
                <div className="tw-ml-2 tw-space-y-1">
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { setShowTimeline?.(false); setMobileMenuOpen(false); }}>
                    <div className="tw-flex tw-items-center tw-justify-between tw-w-full">
                      <span>Column</span>
                      {!showTimeline && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z"/></svg>
                      )}
                    </div>
                  </button>
                  <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { setShowTimeline?.(true); setMobileMenuOpen(false); }}>
                    <div className="tw-flex tw-items-center tw-justify-between tw-w-full">
                      <span>Timeline</span>
                      {showTimeline && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19l11-11-1.4-1.4z"/></svg>
                      )}
                    </div>
                  </button>
                </div>
              )}

              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onMirror?.(); setMobileMenuOpen(false); }}>Mirror</button>
              {/* Record group */}
              <button
                className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800"
                onClick={() => { onRecord?.(); setMobileMenuOpen(false); }}
              >
                Record
              </button>
              <button
                className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800"
                onClick={() => { onRecordSettings?.(); setMobileMenuOpen(false); }}
              >
                Record Settings
              </button>
              {isElectron && (
                <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onToggleAppFullscreen?.(); setMobileMenuOpen(false); }}>Fullscreen</button>
              )}
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onToggleUIDemo?.(); setMobileMenuOpen(false); }}>UI Demo</button>
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onCompositionSettings?.(); setMobileMenuOpen(false); }}>Composition Settings</button>
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onOpenSettings?.(); setMobileMenuOpen(false); }}>Settings</button>
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { setOpenaiDialogOpen(true); setMobileMenuOpen(false); }}>Help › OpenAI API Key</button>
              <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { setApiDialogOpen(true); setMobileMenuOpen(false); }}>Help › API</button>
              {process.env.NODE_ENV === 'development' && onToggleDebug && (
                <button className="tw-block tw-w-full tw-text-left tw-px-3 tw-py-2 tw-text-sm hover:tw-bg-neutral-800" onClick={() => { onToggleDebug?.(); setMobileMenuOpen(false); }}>Debug</button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* API Docs dialog */}
      <Dialog open={apiDialogOpen} onOpenChange={setApiDialogOpen}>
        <DialogContent className="tw-w-[92vw] tw-max-w-3xl tw-max-h-[80vh] tw-overflow-auto">
          <DialogHeader>
            <DialogTitle className="tw-text-sm">API</DialogTitle>
          </DialogHeader>
          <div className="tw-text-neutral-200 tw-text-xs tw-space-y-5">
            <section>
              <div className="tw-font-semibold tw-mb-2">Entry point</div>
              <pre className="tw-bg-neutral-900 tw-text-neutral-200 tw-p-3 tw-rounded tw-overflow-auto"><code>{`import { engine, midi, ui, effects, store } from '@/api';`}</code></pre>
            </section>
            <section>
              <div className="tw-font-semibold tw-mb-2">Engine</div>
              <pre className="tw-bg-neutral-900 tw-text-neutral-200 tw-p-3 tw-rounded tw-overflow-auto"><code>{`const clock = engine.getClock();
clock.setBpm(128);
clock.start();

const lfo = engine.getLFOEngine();
engine.attachLFOEngineGlobalListeners();`}</code></pre>
            </section>
            <section>
              <div className="tw-font-semibold tw-mb-2">MIDI</div>
              <pre className="tw-bg-neutral-900 tw-text-neutral-200 tw-p-3 tw-rounded tw-overflow-auto"><code>{`const mm = midi.MIDIManager.getInstance();
mm.addCCCallback((cc, value, ch) => {
  if (cc === 1) engine.getClock().setBpm(60 + value);
});`}</code></pre>
            </section>
            <section>
              <div className="tw-font-semibold tw-mb-2">Effects</div>
              <pre className="tw-bg-neutral-900 tw-text-neutral-200 tw-p-3 tw-rounded tw-overflow-auto"><code>{`// Discover available effects dynamically (no hardcoded names)
const discovery = effects.EffectDiscovery.getInstance();
await discovery.discoverEffects();
const list = discovery.getDiscoveredEffects();

// Access registry helpers
const ids = effects.getAllRegisteredEffects();`}</code></pre>
            </section>
            <section>
              <div className="tw-font-semibold tw-mb-2">Store</div>
              <pre className="tw-bg-neutral-900 tw-text-neutral-200 tw-p-3 tw-rounded tw-overflow-auto"><code>{`import { store } from '@/api';
const { useStore } = store;
const isPlaying = useStore.getState().isGlobalPlaying;
useStore.getState().globalPlay();`}</code></pre>
            </section>
            <section>
              <div className="tw-font-semibold tw-mb-2">UI</div>
              <pre className="tw-bg-neutral-900 tw-text-neutral-200 tw-p-3 tw-rounded tw-overflow-auto"><code>{`import { ui } from '@/api';
// Example: <ui.Button>Click</ui.Button>`}</code></pre>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* OpenAI Key Help dialog */}
      <Dialog open={openaiDialogOpen} onOpenChange={setOpenaiDialogOpen}>
        <DialogContent className="tw-w-[92vw] tw-max-w-2xl tw-max-h-[80vh] tw-overflow-auto">
          <DialogHeader>
            <DialogTitle className="tw-text-sm">Get an OpenAI (ChatGPT) API Key</DialogTitle>
          </DialogHeader>
          <div className="tw-text-neutral-200 tw-text-xs tw-space-y-4">
            <div>Follow these steps to use the AI Effect Generator:</div>
            <ol className="tw-list-decimal tw-ml-5 tw-space-y-2">
              <li>
                Go to <a className="tw-text-blue-400" href="https://platform.openai.com/" target="_blank" rel="noreferrer">OpenAI Platform</a> and sign in.
              </li>
              <li>
                Ensure billing is enabled: <a className="tw-text-blue-400" href="https://platform.openai.com/account/billing" target="_blank" rel="noreferrer">Billing settings</a>.
              </li>
              <li>
                Create a key: <a className="tw-text-blue-400" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">API Keys</a> → “Create new secret key”, then copy it (starts with <code>sk-</code>).
              </li>
              <li>
                In this app, open Settings → paste the key under “OpenAI API Key”, click “Save Key”, then “Test Connection”.
              </li>
            </ol>
            <div className="tw-text-neutral-300">
              Security: your key is stored locally and encrypted via Electron safeStorage. Do not share it or commit it to Git.
            </div>
            <div>
              Full guide: <span className="tw-text-neutral-300">docs/GET_OPENAI_API_KEY.md</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}; 