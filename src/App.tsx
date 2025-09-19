import React, { useState, useEffect, useRef } from 'react';
import { LayerManager } from './components/LayerManager';
import { CompositionSettings } from './components/CompositionSettings';
import CloudPresetBrowser from './components/CloudPresetBrowser';
import { PresetModal } from './components/PresetModal';
import { CustomTitleBar } from './components/CustomTitleBar';
import { SettingsDialog } from './components/SettingsDialog';
import { UIDemo } from './components/ui';
import { Toaster } from './components/ui';
import { AdvancedMirrorDialog } from './components/AdvancedMirrorDialog';
import { RecordSettingsDialog } from './components/RecordSettingsDialog';
import { useStore } from './store/store';
import { effectCache } from './utils/EffectCache';
import { CanvasStreamManager } from './utils/CanvasStream';
import { AdvancedMirrorStreamManager } from './utils/AdvancedMirrorStream';
import './index.css';
import { MIDIManager } from './midi/MIDIManager';
import { MIDIProcessor } from './utils/MIDIProcessor';
import { KeyboardInputManager } from './utils/KeyboardInputManager';
import { attachLFOEngineGlobalListeners } from './engine/LFOEngine';
import { handleRedirectIfPresent } from './lib/dropbox';
import { useToast } from './hooks/use-toast';
import DebugOverlay from './components/DebugOverlay';

// Effects are loaded dynamically - no hardcoded imports needed

// Type declaration for the exposed API
declare global {
  interface Window {
    electron?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      toggleMirror: () => void;
      onToggleMirror: (callback: () => void) => void;
      onMirrorWindowClosed: (callback: () => void) => void;
      openMirrorWindow: () => void;
      closeMirrorWindow: () => void;
      sendCanvasData: (dataUrl: string) => void;
        toggleAppFullscreen: () => void;
        onWindowState?: (cb: (state: { maximized: boolean }) => void) => void;
        onRecordStart?: (handler: () => void) => void;
        onRecordSettings?: (handler: () => void) => void;
    };
  }
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="tw-bg-black tw-text-white tw-min-h-screen tw-p-5 tw-flex tw-flex-col tw-items-center tw-justify-center">
          <h1 className="tw-text-xl tw-font-semibold tw-mb-2">Something went wrong!</h1>
          <p className="tw-mb-4">Error: {this.state.error?.message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="tw-inline-flex tw-items-center tw-justify-center tw-px-5 tw-py-2.5 tw-bg-neutral-800 tw-text-neutral-100 tw-rounded tw-border tw-border-neutral-700 hover:tw-bg-neutral-700 tw-transition-colors"
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [isMirrorOpen, setIsMirrorOpen] = useState(false);
  const [compositionSettingsOpen, setCompositionSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showUIDemo, setShowUIDemo] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [advMirrorOpen, setAdvMirrorOpen] = useState(false);
  const [cloudBrowserOpen, setCloudBrowserOpen] = useState(false);
  const [recordSettingsOpen, setRecordSettingsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  
  const [debugMode, setDebugMode] = useState(false);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const streamManagerRef = useRef<CanvasStreamManager | null>(null);
  const advStreamRef = useRef<AdvancedMirrorStreamManager | null>(null);
  const usingDummyCanvas = useRef<boolean>(false);
  const { savePreset, loadPreset, accessibilityEnabled, accentColor, midiMappings, neutralContrast } = useStore() as any;
  const lastSaveRef = useRef<number>(0);
  
  // Modal states
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'save' | 'new' | 'load' | 'manage';
    title: string;
    message: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
  }>({
    isOpen: false,
    type: 'save',
    title: '',
    message: '',
  });

  const { toast } = useToast();
  const { recordSettings, setRecordSettings } = useStore() as any;
  const { showTimeline, setShowTimeline } = useStore() as any;

  // Convert a hex color (e.g., #00bcd4) to HSL components for CSS var usage
  const hexToHslComponents = (hex: string): { h: number; s: number; l: number } => {
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    const r = parseInt(normalized.slice(1, 3), 16) / 255;
    const g = parseInt(normalized.slice(3, 5), 16) / 255;
    const b = parseInt(normalized.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  };

  useEffect(() => {
    // Mark Electron environment for CSS targeting (e.g., scrollbar styling)
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
      console.log('App startup - Electron detected:', isElectron);
      if (isElectron) {
        document.body.classList.add('is-electron');
        console.log('Electron APIs available:', Object.keys((window as any).electron || {}));
      }
    } catch (error) {
      console.error('Error checking Electron environment:', error);
    }

    // Auto-load user effects from remembered directories (Electron only)
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
      if (isElectron) {
        const enabled = localStorage.getItem('vj-autoload-user-effects-enabled') === '1';
        if (enabled) {
          // Preferred single FX directory
          const singleDir = localStorage.getItem('vj-fx-user-dir');
          // Backward-compat: legacy array key
          const legacyRaw = localStorage.getItem('vj-autoload-user-effects-dirs') || '[]';
          let legacyDirs: string[] = [];
          try { legacyDirs = JSON.parse(legacyRaw) || []; } catch {}

          const dirs = singleDir ? [singleDir] : (Array.isArray(legacyDirs) ? legacyDirs.slice(0, 1) : []);
          if (dirs.length > 0) {
            (async () => {
              try {
                const { EffectDiscovery } = await import('./utils/EffectDiscovery');
                const discovery = EffectDiscovery.getInstance();
                let loaded = 0;
                for (const d of dirs) {
                  try {
                    const items = await discovery.loadUserEffectsFromDirectory(String(d));
                    loaded += items.length;
                  } catch (e) {
                    console.warn('Autoload user effects failed for dir:', d, e);
                  }
                }
                if (loaded > 0) {
                  console.log(`Autoloaded ${loaded} user effect(s) from ${dirs[0]}`);
                }
              } catch (e) {
                console.warn('Autoload user effects init failed', e);
              }
            })();
          }
        }
      }
      // Always autoload @bank portable items so the tab is populated
      (async () => {
        try {
          const { EffectDiscovery } = await import('./utils/EffectDiscovery');
          const discovery = EffectDiscovery.getInstance();
          // Gather from multiple glob roots to avoid missing files across build contexts
          const maps: Array<Record<string, () => Promise<string>>> = [
            (import.meta as any).glob('../bank/**/*.{js,mjs}', { as: 'raw', eager: false }),
            (import.meta as any).glob('../../bank/**/*.{js,mjs}', { as: 'raw', eager: false }),
            (import.meta as any).glob('../bank/effects/**/*.js', { as: 'raw', eager: false }),
            (import.meta as any).glob('../bank/sources/**/*.js', { as: 'raw', eager: false }),
          ];
          const combined: Record<string, () => Promise<string>> = Object.assign({}, ...maps);
          let loaded = 0;
          // Optional mtime hash skip
          const COUNT_KEY = 'vj-bank-count';
          let prevCount = 0; try { prevCount = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10) || 0; } catch {}
          for (const [p, loader] of Object.entries(combined)) {
            try {
              const code = await (loader as any)();
              await discovery.loadUserEffectFromContent(code, p);
              loaded += 1;
            } catch (e) {
              console.warn('Bank autoload item failed:', p, e);
            }
          }
          if (loaded > 0) {
            console.log(`Autoloaded ${loaded} @bank item(s)`);
            try { window.dispatchEvent(new CustomEvent('vj-bank-updated')); } catch {}
            try { localStorage.setItem(COUNT_KEY, String(loaded)); } catch {}
          } else if (prevCount > 0) {
            // No new items; still refresh list so UI stays in sync
            try { window.dispatchEvent(new CustomEvent('vj-bank-updated')); } catch {}
          }
        } catch (e) {
          console.warn('Bank autoload failed', e);
        }
      })();
    } catch {}

    // Handle Dropbox OAuth redirect (web only)
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
      if (!isElectron) {
        handleRedirectIfPresent().catch(() => {});
      }
    } catch {}

    // Attach global LFO engine listeners (column/global play events)
    try { attachLFOEngineGlobalListeners(); } catch {}
    // Wire MIDI + Keyboard globally so mappings work app-wide
    try {
      const mgr = MIDIManager.getInstance();
      const proc = MIDIProcessor.getInstance();
      proc.setMappings((useStore.getState() as any).midiMappings || []);
      const onNote = (n: number, v: number, ch: number) => proc.handleNoteMessage(n, v, ch);
      const onCC = (c: number, v: number, ch: number) => proc.handleCCMessage(c, v, ch);
      mgr.addNoteCallback(onNote);
      mgr.addCCCallback(onCC);

      const keyMgr = KeyboardInputManager.getInstance();
      const onKey = (k: string, mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }) => proc.handleKeyMessage(k, mods);
      keyMgr.addKeyCallback(onKey);
    } catch {}
    // Detect Windows taskbar and adjust app height
    const adjustForTaskbar = () => {
      const viewportHeight = window.innerHeight;
      const screenHeight = window.screen.height;
      const taskbarHeight = screenHeight - viewportHeight;

      if (taskbarHeight > 0) {
        // Taskbar detected, adjust the app
        document.documentElement.style.setProperty('--taskbar-height', `${taskbarHeight}px`);
        document.body.style.minHeight = `calc(100vh - ${taskbarHeight}px)`;
        const rootEl = document.getElementById('root');
        if (rootEl) rootEl.style.minHeight = `calc(100vh - ${taskbarHeight}px)`;
      } else {
        // No taskbar detected, use full height
        document.documentElement.style.setProperty('--taskbar-height', '0px');
        document.body.style.minHeight = '100vh';
        const rootEl = document.getElementById('root');
        if (rootEl) rootEl.style.minHeight = '100vh';
      }
    };

    // Initial adjustment
    adjustForTaskbar();

    // Adjust on window resize
    window.addEventListener('resize', adjustForTaskbar);

    return () => {
      window.removeEventListener('resize', adjustForTaskbar);
    };
  }, []);

  // Keep processor mappings up-to-date when store mappings change
  useEffect(() => {
    try {
      const proc = MIDIProcessor.getInstance();
      proc.setMappings(midiMappings || []);
    } catch {}
  }, [midiMappings]);

  // Wire Electron debug menu events
  useEffect(() => {
    try { (window as any).electron?.onDebugToggleOverlay?.(() => setShowDebugOverlay((v) => !v)); } catch {}
    try { (window as any).electron?.onDebugOpenPanel?.(() => setDebugMode(true)); } catch {}
  }, []);

  // Renderer hotkey: Ctrl/Cmd+Shift+D toggles overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      if (ctrlOrCmd && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDebugOverlay((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Subscribe to window maximize state changes
  useEffect(() => {
    try {
      if (window.electron && window.electron.onWindowState) {
        window.electron.onWindowState((state) => setIsMaximized(!!state?.maximized));
      }
    } catch {}
  }, []);

  // Apply accent color to CSS vars on mount and when it changes
  useEffect(() => {
    try {
      const color = accentColor || '#00bcd4';
      // Absolute color for direct usages
      document.documentElement.style.setProperty('--accent-color', color);
      // HSL components for Tailwind and hsl(var(--accent)) usages
      const { h, s, l } = hexToHslComponents(color);
      document.documentElement.style.setProperty('--accent', `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`);
    } catch {}
  }, [accentColor]);

  // Apply neutral contrast CSS variables on mount and when it changes
  useEffect(() => {
    try {
      const factor = typeof neutralContrast === 'number' ? neutralContrast : 1;
      (useStore.getState() as any).setNeutralContrast(factor);
    } catch {}
  }, [neutralContrast]);

  // Background LFO/Random engine stays active regardless of which UI is focused
  // Removed background loop to avoid interference with panel engine

  // Auto-save preset every 30 seconds (disabled by default)
  useEffect(() => {
    // Set to true to enable auto-backup
    const enableAutoBackup = false;
    
    if (!enableAutoBackup) {
      return; // Skip auto-backup if disabled
    }
    
    const autoSaveInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastSave = now - lastSaveRef.current;
      
      // Only save if it's been at least 30 seconds since last save
      if (timeSinceLastSave >= 30000) {
        const presetKey = savePreset(`auto-backup-${new Date().toISOString().slice(0, 19)}`);
        if (presetKey) {
          console.log('💾 Auto-saved preset:', presetKey);
          lastSaveRef.current = now;
        }
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(autoSaveInterval);
    };
  }, [savePreset]);

  // Debug: Test persistence on mount (disabled by default)
  useEffect(() => {
    // Set to true to enable debug testing
    const enableDebugTesting = false;
    
    if (!enableDebugTesting) {
      return; // Skip debug testing if disabled
    }
    
    console.log('🔧 App mounted - testing persistence...');
    
    // Test manual preset save
    setTimeout(() => {
      const testPresetKey = savePreset('debug-test-preset');
      console.log('🧪 Test preset saved:', testPresetKey);
      
      // Check localStorage
      const storageData = localStorage.getItem('vj-app-storage');
      console.log('🧪 localStorage exists:', !!storageData);
      console.log('🧪 localStorage size:', storageData?.length || 0, 'bytes');
    }, 2000);
  }, [savePreset]);

  // Listen for menu toggle-mirror event
  useEffect(() => {
    if (window.electron) {
      window.electron.onToggleMirror(() => {
        handleMirrorToggle();
      });
      window.electron.onMirrorWindowClosed(() => {
        console.log('Mirror window closed event received, updating state');
        setIsMirrorOpen(false);
        // Clean up stream manager
        if (streamManagerRef.current) {
          streamManagerRef.current.closeMirrorWindow();
          streamManagerRef.current = null;
        }
      });
      (window.electron as any).onToggleAdvancedMirror?.(() => {
        setAdvMirrorOpen(true);
      });
    }
  }, []);

  // Start effect preloading early for faster effects browser
  // Removed early effect preloading to improve startup responsiveness

  // Monitor for real Three.js canvas when using dummy canvas
  useEffect(() => {
    if (!isMirrorOpen || !usingDummyCanvas.current || !streamManagerRef.current) {
      return;
    }

    const checkForRealCanvas = () => {
      // Look for a Three.js canvas (not our dummy one)
      const canvases = document.querySelectorAll('canvas');
      const realCanvas = Array.from(canvases).find(canvas => 
        canvas.id !== 'dummy-mirror-canvas' && 
        canvas.width > 0 && 
        canvas.height > 0
      ) as HTMLCanvasElement;

      if (realCanvas) {
        console.log('Real canvas found, switching from dummy canvas');
        streamManagerRef.current?.updateCanvas(realCanvas);
        usingDummyCanvas.current = false;
        
        // Remove dummy canvas
        const dummyCanvas = document.getElementById('dummy-mirror-canvas');
        if (dummyCanvas) {
          dummyCanvas.remove();
        }
        
        // Stop checking
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkForRealCanvas()) {
      return;
    }

    // Set up interval to check for real canvas
    const interval = setInterval(() => {
      if (checkForRealCanvas()) {
        clearInterval(interval);
      }
    }, 500);

    // Cleanup
    return () => {
      clearInterval(interval);
    };
  }, [isMirrorOpen]);

  const handleMirrorToggle = async () => {
    try {
      if (isMirrorOpen) {
        // Close mirror window
        streamManagerRef.current?.closeMirrorWindow();
        setIsMirrorOpen(false);
      } else {
        // Find or create the main canvas element
        let canvas = document.querySelector('canvas') as HTMLCanvasElement;
        
        if (!canvas) {
          console.log('No canvas found yet, mirror will open and wait for content');
          // Create a dummy canvas to allow mirror window to open
          canvas = document.createElement('canvas');
          canvas.width = 1920;
          canvas.height = 1080;
          // Add it to DOM temporarily (hidden)
          canvas.style.display = 'none';
          canvas.id = 'dummy-mirror-canvas';
          document.body.appendChild(canvas);
          usingDummyCanvas.current = true;
          
          // Fill with black background
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '48px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for content...', canvas.width / 2, canvas.height / 2);
          }
        } else {
          usingDummyCanvas.current = false;
        }

        console.log('Found/created canvas for streaming:', canvas);
        console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
        
        // Reduced wait time for faster opening
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Set minimum dimensions if canvas is too small
        if (canvas.width === 0 || canvas.height === 0) {
          console.log('Canvas has zero dimensions, setting default size');
          canvas.width = 1920;
          canvas.height = 1080;
        }
        
        // Create stream manager and open mirror window immediately
        streamManagerRef.current = new CanvasStreamManager(canvas);
        await streamManagerRef.current.openMirrorWindow();
        setIsMirrorOpen(true);
      }
    } catch (error) {
      console.error('Mirror window error:', error);
      // Removed alert to reduce popups
    }
  };

  const handleWindowMinimize = () => {
    console.log('=== HANDLE WINDOW MINIMIZE CALLED ===');
    console.log('window.electron available:', !!window.electron);
    console.log('window.electron.minimize available:', !!(window.electron && window.electron.minimize));
    if (window.electron) {
      console.log('Calling window.electron.minimize()...');
      window.electron.minimize();
    } else {
      console.log('window.electron is not available!');
    }
  };

  const handleWindowMaximize = () => {
    console.log('=== HANDLE WINDOW MAXIMIZE CALLED ===');
    console.log('window.electron available:', !!window.electron);
    console.log('window.electron.maximize available:', !!(window.electron && window.electron.maximize));
    if (window.electron) {
      console.log('Calling window.electron.maximize()...');
      window.electron.maximize();
    } else {
      console.log('window.electron is not available!');
    }
  };

  const handleToggleAppFullscreen = () => {
    if (window.electron && window.electron.toggleAppFullscreen) {
      window.electron.toggleAppFullscreen();
    }
  };

  const handleWindowClose = () => {
    console.log('=== HANDLE WINDOW CLOSE CALLED ===');
    console.log('window.electron available:', !!window.electron);
    if (window.electron) {
      console.log('Calling window.electron.close()');
      window.electron.close();
    } else {
      console.log('window.electron is not available');
    }
  };



  const handleNewPreset = () => {
    try {
      console.log('[New Set] Opening confirmation modal');
      setModalConfig({
        isOpen: true,
        type: 'new',
        title: 'Create New Set',
        message: 'You may have unsaved changes. Would you like to save before creating a new set?',
        confirmText: 'Save and Create New',
        cancelText: 'Cancel'
      });
    } catch (e) {
      console.error('Failed to open new set confirmation:', e);
    }
  };

  const handleSavePreset = () => {
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.showSaveDialog;
      if (isElectron) {
        (async () => {
          const presetName = `preset-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.vjpreset`;
          const result = await (window as any).electron.showSaveDialog({
            title: 'Save Set',
            defaultPath: presetName,
            filters: [{ name: 'VJ Preset', extensions: ['vjpreset', 'json'] }]
          });
          if (!result.canceled && result.filePath) {
            const { savePreset } = useStore.getState();
            const base = String(result.filePath).split(/[\\\/]/).pop() || presetName;
            const chosenName = base.replace(/\.(vjpreset|json)$/i, '');
            const key = savePreset(chosenName);
            if (key) {
              // regenerate content using current store for reliable save
              const state = useStore.getState() as any;
              const preset = {
                name: key,
                displayName: key,
                timestamp: Date.now(),
                version: '1.0.0',
                description: `VJ Preset: ${key}`,
                data: {
                  scenes: state.scenes,
                  currentSceneId: state.currentSceneId,
                  playingColumnId: state.playingColumnId,
                  bpm: state.bpm,
                  sidebarVisible: state.sidebarVisible,
                  midiMappings: state.midiMappings,
                  selectedLayerId: state.selectedLayerId,
                  previewMode: state.previewMode,
                  transitionType: state.transitionType,
                  transitionDuration: state.transitionDuration,
                  compositionSettings: state.compositionSettings,
                  assets: state.assets,
                }
              };
              await (window as any).electron.saveFile(result.filePath, JSON.stringify(preset, null, 2));
            }
          }
        })();
      } else {
        // Fallback to existing web modal flow
        const { currentPresetName } = useStore.getState() as any;
        setModalConfig({
          isOpen: true,
          type: 'save',
          title: 'Save Set',
          message: 'Enter a name for your set:',
          placeholder: 'My Set',
          defaultValue: currentPresetName || '',
          confirmText: 'Save',
          cancelText: 'Cancel'
        });
      }
    } catch (e) {
      console.error('Save preset failed:', e);
    }
  };

  const handleLoadPreset = () => {
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.showOpenDialog;
      if (isElectron) {
        (async () => {
          const result = await (window as any).electron.showOpenDialog({
            title: 'Load Set',
            properties: ['openFile'],
            filters: [{ name: 'VJ Preset', extensions: ['vjpreset', 'json'] }]
          });
          if (!result.canceled && result.filePaths && result.filePaths[0]) {
            const content = await (window as any).electron.readFileText(result.filePaths[0]);
            if (content) {
              const { loadPresetFromContent } = useStore.getState() as any;
              if (typeof loadPresetFromContent === 'function') {
                await loadPresetFromContent(content, String(result.filePaths[0]).split(/[\\\/]/).pop());
              } else {
                const blob = new Blob([content], { type: 'application/json' });
                const file = new File([blob], result.filePaths[0]);
                await loadPreset(file);
              }
            }
          }
        })();
      } else {
        // Web: open cloud preset browser
        setCloudBrowserOpen(true);
      }
    } catch (e) {
      console.error('Load preset failed:', e);
    }
  };

  const handleCompositionSettings = () => {
    setCompositionSettingsOpen(true);
  };

  useEffect(() => {
    // Toggle global class to control accessibility highlights
    const root = document.documentElement;
    if (accessibilityEnabled) {
      root.classList.remove('a11y-off');
      root.classList.add('a11y-on');
    } else {
      root.classList.remove('a11y-on');
      root.classList.add('a11y-off');
    }
  }, [accessibilityEnabled]);

  const handleToggleUIDemo = () => {
    setShowUIDemo(!showUIDemo);
  };

  

  const handleToggleDebug = () => {
    setDebugMode(!debugMode);
    setShowDebugOverlay((v) => !v);
  };

  const handleModalClose = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  const handleModalConfirm = (value: string) => {
    switch (modalConfig.type) {
      case 'new': {
        console.log('[New Set] Confirmed save-then-create');
        try {
          const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.showSaveDialog;
          if (isElectron) {
            (async () => {
              const presetName = `preset-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.vjpreset`;
              const result = await (window as any).electron.showSaveDialog({
                title: 'Save Set',
                defaultPath: presetName,
                filters: [{ name: 'VJ Preset', extensions: ['vjpreset', 'json'] }]
              });
              if (!result.canceled && result.filePath) {
                const { savePreset } = useStore.getState();
                const base = String(result.filePath).split(/[\\\/]/).pop() || presetName;
                const chosenName = base.replace(/\.(vjpreset|json)$/i, '');
                const key = savePreset(chosenName);
                if (key) {
                  const state = useStore.getState() as any;
                  const preset = {
                    name: key,
                    displayName: key,
                    timestamp: Date.now(),
                    version: '1.0.0',
                    description: `VJ Preset: ${key}`,
                    data: {
                      scenes: state.scenes,
                      currentSceneId: state.currentSceneId,
                      playingColumnId: state.playingColumnId,
                      bpm: state.bpm,
                      sidebarVisible: state.sidebarVisible,
                      midiMappings: state.midiMappings,
                      selectedLayerId: state.selectedLayerId,
                      previewMode: state.previewMode,
                      transitionType: state.transitionType,
                      transitionDuration: state.transitionDuration,
                      compositionSettings: state.compositionSettings,
                      assets: state.assets,
                    }
                  };
                  await (window as any).electron.saveFile(result.filePath, JSON.stringify(preset, null, 2));

                  const { resetToDefault } = useStore.getState();
                  console.log('[New Set] Saved. Resetting to default and reloading');
                  resetToDefault();
                  window.location.reload();
                }
              }
            })();
          } else {
            // Web: warn if duplicate name, then save to cloud and reset
            const { listCloudPresets, savePreset, resetToDefault } = useStore.getState() as any;
            const defaultName = value?.trim() || `preset-${new Date().toISOString().slice(0, 19)}`;
            (async () => {
              try {
                const items = await listCloudPresets();
                const exists = (items || []).some((it: any) => (it?.name || '').toLowerCase() === defaultName.toLowerCase());
                if (exists) {
                  const ok = window.confirm(`A preset named "${defaultName}" already exists. Overwrite?`);
                  if (!ok) return;
                }
              } catch {}
              const savedName = savePreset(defaultName);
              if (savedName) {
                console.log('[New Set] Web saved. Resetting to default and reloading');
                resetToDefault();
                window.location.reload();
              }
            })();
          }
        } catch (e) {
          console.error('Save before new set failed:', e);
        }
        break;
      }
        
      case 'save': {
        // Save preset with custom name, warn about duplicates (web)
        const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
        const { savePreset, listCloudPresets } = useStore.getState() as any;
        const presetName = value.trim() || `preset-${new Date().toISOString().slice(0, 19)}`;
        if (!isElectron) {
          (async () => {
            try {
              const items = await listCloudPresets();
              const exists = (items || []).some((it: any) => (it?.name || '').toLowerCase() === presetName.toLowerCase());
              if (exists) {
                const ok = window.confirm(`A preset named "${presetName}" already exists. Overwrite?`);
                if (!ok) return;
              }
            } catch {}
            const savedNameAsync = savePreset(presetName);
            if (savedNameAsync) {
              console.log('Preset saved:', savedNameAsync);
            } else {
              console.error('Failed to save preset');
            }
          })();
          break;
        }
        const savedName = savePreset(presetName);
        if (savedName) {
          console.log('Preset saved:', savedName);
        } else {
          console.error('Failed to save preset');
        }
        break;
      }
        
      default:
        break;
    }
  };

  const handleAdvancedMirror = async (opts?: { count?: number; orientation?: 'horizontal' | 'vertical' }) => {
    try {
      let canvas = document.querySelector('canvas') as HTMLCanvasElement;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        canvas.style.display = 'none';
        canvas.id = 'dummy-mirror-canvas';
        document.body.appendChild(canvas);
      }
      advStreamRef.current = new AdvancedMirrorStreamManager(canvas);
      const count = Math.max(1, opts?.count ?? 1);
      const orientation = (opts?.orientation ?? 'horizontal');
      advStreamRef.current.openWithUniformSlices({ count, orientation });
    } catch (e) {
      console.error('Advanced mirror error', e);
    }
  };

  useEffect(() => {
    const startHandler = async () => {
      try {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas || !(canvas as any).captureStream) return;
        const stream: MediaStream = (canvas as any).captureStream(30);
        const supportsVP9 = (window as any).MediaRecorder && MediaRecorder.isTypeSupported('video/webm;codecs=vp9');
        const mime = supportsVP9 ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: mime });
          const buffer = new Uint8Array(await blob.arrayBuffer());
          try {
            // Check if Electron APIs are available
            if (!(window as any).electron) {
              throw new Error('Electron APIs not available');
            }
            
            if (typeof (window as any).electron.showSaveDialog !== 'function') {
              throw new Error('showSaveDialog function not available');
            }
            
            if (typeof (window as any).electron.saveBinaryFile !== 'function') {
              throw new Error('saveBinaryFile function not available');
            }
            
            const result = await (window as any).electron.showSaveDialog({
              title: 'Save Recording',
              defaultPath: 'recording.webm',
              filters: [{ name: 'WebM', extensions: ['webm'] }]
            });
            if (result && !result.canceled && result.filePath) {
              const ok = await (window as any).electron.saveBinaryFile(result.filePath, buffer);
              if (ok) {
                toast({ description: 'Recording saved successfully.' });
              } else {
                toast({ description: 'Failed to save recording.' });
              }
            } else {
              toast({ description: 'Recording save canceled.' });
            }
          } catch (error) {
            console.error('Error saving recording:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ description: 'Error saving recording: ' + errorMessage });
          }
        };
        recorder.start();
        toast({ description: 'Recording started...' });
      } catch {}
    };
    const settingsHandler = () => {
      toast({ description: 'Record Settings coming soon.' });
    };
    try { (window as any).electron?.onRecordStart?.(startHandler); } catch {}
    try { (window as any).electron?.onRecordSettings?.(settingsHandler); } catch {}
    return () => {
      // no-op: listeners are process-wide; safe to leave in dev
    };
  }, [toast]);

  return (
    <ErrorBoundary>
      <CustomTitleBar
        onMinimize={handleWindowMinimize}
        onMaximize={handleWindowMaximize}
        isMaximized={isMaximized}
        onClose={handleWindowClose}
        onMirror={handleMirrorToggle}
        onToggleAppFullscreen={handleToggleAppFullscreen}
        onNewPreset={handleNewPreset}
        onSavePreset={handleSavePreset}
        onLoadPreset={handleLoadPreset}
        onCompositionSettings={handleCompositionSettings}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleTimeline={() => setShowTimeline(!showTimeline)}
        onToggleUIDemo={handleToggleUIDemo}
        debugMode={debugMode}
        onToggleDebug={handleToggleDebug}
        onSignOut={async () => {
          try {
            // Only applicable on web where Supabase is configured
            const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
            if (!isElectron) {
              const { getSupabase } = await import('./lib/supabaseClient');
              const supabase = getSupabase();
              await supabase.auth.signOut();
              window.location.reload();
            }
          } catch {}
        }}
        onAdvancedMirror={() => { setAdvMirrorOpen(true); }}
        isRecording={isRecording}
        onRecord={() => {
          // Reuse the same startHandler logic inline
          (async () => {
            try {
              if (isRecording && recorderRef.current) { 
                try { 
                  console.log('Stopping recording...');
                  recorderRef.current.stop(); 
                  // Update state immediately when stop is pressed
                  setIsRecording(false);
                  // Clean up any active audio streams
                  const audioTracks = document.querySelectorAll('audio');
                  audioTracks.forEach(audio => {
                    if (audio.srcObject) {
                      const stream = audio.srcObject as MediaStream;
                      stream.getTracks().forEach(track => track.stop());
                    }
                  });
                  console.log('Recording stop requested');
                } catch (error) {
                  console.error('Error stopping recording:', error);
                  // Still update state even if there's an error
                  setIsRecording(false);
                } 
                return; 
              }
              const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
              if (!canvas || !(canvas as any).captureStream) return;
              const fps = 30; // Fixed export FPS
              const videoStream: MediaStream = (canvas as any).captureStream(fps);
              
              // Get audio stream based on settings
              let audioStream: MediaStream | null = null;
              const audioSource = recordSettings?.audioSource || 'none';
              
              if (audioSource === 'microphone') {
                try {
                  audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch (err) {
                  console.warn('Failed to get microphone access:', err);
                  toast({ description: 'Microphone access denied. Recording without audio.' });
                }
              } else if (audioSource === 'app') {
                try {
                  // Use app audio context manager to get internal audio
                  const { audioContextManager } = await import('./utils/AudioContextManager');
                  await audioContextManager.initialize();
                  audioStream = audioContextManager.getAppAudioStream();
                  
                  if (!audioStream) {
                    throw new Error('Failed to get app audio stream');
                  }
                } catch (err) {
                  console.warn('Failed to get app audio access:', err);
                  toast({ description: 'App audio access failed. Recording without audio.' });
                }
              } else if (audioSource === 'system') {
                try {
                  // Check if we're in Electron
                  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
                  if (!isElectron) {
                    // Fallback to web getDisplayMedia for non-Electron environments
                    audioStream = await navigator.mediaDevices.getDisplayMedia({ 
                      audio: { 
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                      }, 
                      video: false 
                    });
                  } else {
                    // Use Electron's native desktop capturer for system audio
                    const result = await (window as any).electron.getSystemAudioStream();
                    if (result.success) {
                      // Create a MediaStream from the desktop capturer source
                      const stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                          mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: result.sourceId
                          }
                        } as any
                      });
                      audioStream = stream;
                    } else {
                      throw new Error(result.error || 'Failed to get system audio source');
                    }
                  }
                } catch (err) {
                  console.warn('Failed to get system audio access:', err);
                  toast({ description: 'System audio access denied. Recording without audio.' });
                }
              }
              
              // Combine video and audio streams
              const combinedStream = new MediaStream([...videoStream.getVideoTracks()]);
              if (audioStream && audioStream.getAudioTracks().length > 0) {
                combinedStream.addTrack(audioStream.getAudioTracks()[0]);
              }
              
              const useVp9 = (recordSettings?.codec === 'vp9');
              const supportsVP9 = (window as any).MediaRecorder && MediaRecorder.isTypeSupported('video/webm;codecs=vp9');
              const mime = (useVp9 && supportsVP9) ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
              // Bitrate by quality (rough defaults). Users can refine later.
              const quality = (recordSettings?.quality || 'medium') as 'low' | 'medium' | 'high';
              const bits = quality === 'high' ? 12_000_000 : quality === 'medium' ? 6_000_000 : 3_000_000;
              const audioBitrate = recordSettings?.audioBitrate || 128000;
              const recorder = new MediaRecorder(combinedStream, { mimeType: mime, videoBitsPerSecond: bits, audioBitsPerSecond: audioBitrate });
              const chunks: BlobPart[] = [];
              recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
              recorder.onstop = async () => {
                console.log('Recording onstop callback triggered');
                const blob = new Blob(chunks, { type: mime });
                const buffer = new Uint8Array(await blob.arrayBuffer());
                console.log('Recording blob size:', blob.size, 'bytes');
                
                try {
                  // Check if we're running in Electron
                  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
                  console.log('Running in Electron:', isElectron);
                  console.log('Window electron object:', (window as any).electron);
                  console.log('Available methods:', (window as any).electron ? Object.keys((window as any).electron) : 'none');
                  
                  // Check if Electron APIs are available
                  if (!isElectron || !(window as any).electron) {
                    console.error('Electron APIs not available, trying fallback...');
                    // Fallback: create download link
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'recording.webm';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast({ description: 'Recording downloaded (Electron APIs not available).' });
                    return;
                  }
                  
                  if (typeof (window as any).electron.showSaveDialog !== 'function') {
                    throw new Error('showSaveDialog function not available');
                  }
                  
                  if (typeof (window as any).electron.saveBinaryFile !== 'function') {
                    throw new Error('saveBinaryFile function not available');
                  }
                  
                  console.log('Electron APIs available, showing save dialog...');
                  const result = await (window as any).electron.showSaveDialog({
                    title: 'Save Recording',
                    defaultPath: 'recording.webm',
                    filters: [{ name: 'WebM', extensions: ['webm'] }]
                  });
                  console.log('Save dialog result:', result);
                  
                  if (result && !result.canceled && result.filePath) {
                    console.log('Saving to file:', result.filePath);
                    const ok = await (window as any).electron.saveBinaryFile(result.filePath, buffer);
                    console.log('Save result:', ok);
                    if (ok) {
                      toast({ description: 'Recording saved successfully.' });
                    } else {
                      toast({ description: 'Failed to save recording.' });
                    }
                  } else {
                    console.log('Save dialog was canceled or no file path provided');
                    toast({ description: 'Recording save canceled.' });
                  }
                } catch (error) {
                  console.error('Error in save process:', error);
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  toast({ description: 'Error saving recording: ' + errorMessage });
                  
                  // Fallback: try download if Electron APIs fail
                  try {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'recording.webm';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast({ description: 'Recording downloaded as fallback.' });
                  } catch (fallbackError) {
                    console.error('Fallback download also failed:', fallbackError);
                    toast({ description: 'Failed to save or download recording.' });
                  }
                }
                
                // Clean up audio streams
                if (audioStream) {
                  audioStream.getTracks().forEach(track => track.stop());
                }
                setIsRecording(false);
                recorderRef.current = null;
                console.log('Recording cleanup completed');
              };
              recorder.start();
              recorderRef.current = recorder;
              const audioInfo = audioSource === 'none' ? 'no audio' : `${audioSource} @ ${audioBitrate/1000}kbps`;
              toast({ description: `Recording started (@ 30fps, ${quality}, ${audioInfo})...` });
              setIsRecording(true);
              console.log('Recording started, isRecording set to true');
            } catch {}
          })();
        }}
        onRecordSettings={() => { setRecordSettingsOpen(true); }}
      />
      
      <div className="tw-bg-black tw-text-white tw-min-h-screen lg:tw-h-screen tw-flex tw-flex-col">

        <div className="vj-app-content tw-flex-1 tw-pt-8 lg:tw-pt-16 tw-overflow-y-auto lg:tw-min-h-0 lg:tw-overflow-y-auto">
          {showUIDemo ? (
            <UIDemo onClose={() => setShowUIDemo(false)} />
          ) : (
            <LayerManager onClose={() => {}} debugMode={debugMode} />
          )}
        </div>
      </div>
      
      <PresetModal
        isOpen={modalConfig.isOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        onSecondary={modalConfig.type === 'new' ? () => { try { const { resetToDefault } = useStore.getState(); resetToDefault(); window.location.reload(); } catch (e) { console.error('Failed to discard and create new set:', e); } } : undefined}
        title={modalConfig.title}
        message={modalConfig.message}
        placeholder={modalConfig.placeholder}
        defaultValue={modalConfig.defaultValue}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        secondaryText={modalConfig.type === 'new' ? "Don't Save" : undefined}
      />
      
      <CompositionSettings
        isOpen={compositionSettingsOpen}
        onClose={() => setCompositionSettingsOpen(false)}
      />
      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RecordSettingsDialog open={recordSettingsOpen} onOpenChange={setRecordSettingsOpen} />
      <AdvancedMirrorDialog open={advMirrorOpen} onOpenChange={setAdvMirrorOpen} onStart={(opts) => handleAdvancedMirror(opts)} />
      <Toaster />
      <CloudPresetBrowser open={cloudBrowserOpen} onOpenChange={setCloudBrowserOpen} />
      <DebugOverlay visible={!!showDebugOverlay} />
    </ErrorBoundary>
  );
}

export default App;