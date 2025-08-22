import React, { useState, useEffect, useRef } from 'react';
import { LayerManager } from './components/LayerManager';
import { CompositionSettings } from './components/CompositionSettings';
import { PresetModal } from './components/PresetModal';
import { CustomTitleBar } from './components/CustomTitleBar';
import { SettingsDialog } from './components/SettingsDialog';
import { UIDemo } from './components/ui';
import { Toaster } from './components/ui';
import { AdvancedMirrorDialog } from './components/AdvancedMirrorDialog';
import { useStore } from './store/store';
import { effectCache } from './utils/EffectCache';
import { CanvasStreamManager } from './utils/CanvasStream';
import { AdvancedMirrorStreamManager } from './utils/AdvancedMirrorStream';
import './index.css';
import { attachLFOEngineGlobalListeners } from './engine/LFOEngine';
import { handleRedirectIfPresent } from './lib/dropbox';

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
      openMirrorWindow: () => void;
      closeMirrorWindow: () => void;
      sendCanvasData: (dataUrl: string) => void;
        toggleAppFullscreen: () => void;
        onWindowState?: (cb: (state: { maximized: boolean }) => void) => void;
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
        <div className="tw-bg-black tw-text-white tw-h-screen tw-p-5 tw-flex tw-flex-col tw-items-center tw-justify-center">
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
  
  const [debugMode, setDebugMode] = useState(false);
  const streamManagerRef = useRef<CanvasStreamManager | null>(null);
  const advStreamRef = useRef<AdvancedMirrorStreamManager | null>(null);
  const usingDummyCanvas = useRef<boolean>(false);
  const { savePreset, loadPreset, accessibilityEnabled, accentColor } = useStore() as any;
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

  useEffect(() => {
    // Handle Dropbox OAuth redirect (web only)
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
      if (!isElectron) {
        handleRedirectIfPresent().catch(() => {});
      }
    } catch {}

    // Attach global LFO engine listeners (column/global play events)
    try { attachLFOEngineGlobalListeners(); } catch {}
    // Detect Windows taskbar and adjust app height
    const adjustForTaskbar = () => {
      const viewportHeight = window.innerHeight;
      const screenHeight = window.screen.height;
      const taskbarHeight = screenHeight - viewportHeight;

      if (taskbarHeight > 0) {
        // Taskbar detected, adjust the app
        document.documentElement.style.setProperty('--taskbar-height', `${taskbarHeight}px`);
        document.body.style.height = `calc(100vh - ${taskbarHeight}px)`;
        document.getElementById('root')!.style.height = `calc(100vh - ${taskbarHeight}px)`;
      } else {
        // No taskbar detected, use full height
        document.documentElement.style.setProperty('--taskbar-height', '0px');
        document.body.style.height = '100vh';
        document.getElementById('root')!.style.height = '100vh';
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

  // Subscribe to window maximize state changes
  useEffect(() => {
    try {
      if (window.electron && window.electron.onWindowState) {
        window.electron.onWindowState((state) => setIsMaximized(!!state?.maximized));
      }
    } catch {}
  }, []);

  // Apply accent color to CSS var on mount and when it changes
  useEffect(() => {
    try {
      const color = accentColor || '#00bcd4';
      document.documentElement.style.setProperty('--accent', color);
    } catch {}
  }, [accentColor]);

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
      (window.electron as any).onToggleAdvancedMirror?.(() => {
        setAdvMirrorOpen(true);
      });
    }
  }, []);

  // Start effect preloading early for faster effects browser
  useEffect(() => {
    console.log('🚀 App: Starting early effect preloading...');
    effectCache.startPreloading().catch(error => {
      console.warn('⚠️ Early effect preloading failed:', error);
    });
  }, []);

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
            ctx.font = '48px Arial';
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
            const key = savePreset(presetName.replace(/\.(vjpreset|json)$/i, ''));
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
        setModalConfig({
          isOpen: true,
          type: 'save',
          title: 'Save Set',
          message: 'Enter a name for your set:',
          placeholder: 'My Awesome Set',
          defaultValue: '',
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
              const blob = new Blob([content], { type: 'application/json' });
              const file = new File([blob], result.filePaths[0]);
              await loadPreset(file);
            }
          }
        })();
      } else {
        // Web fallback
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.vjpreset,.json';
        fileInput.style.display = 'none';
        fileInput.onchange = async (e) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          if (file) await loadPreset(file);
          document.body.removeChild(fileInput);
        };
        document.body.appendChild(fileInput);
        fileInput.click();
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
                const key = savePreset(presetName.replace(/\.(vjpreset|json)$/i, ''));
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
            // Web fallback: save to file then reset
            const { savePreset, resetToDefault } = useStore.getState();
            const defaultName = value?.trim() || `preset-${new Date().toISOString().slice(0, 19)}`;
            const savedName = savePreset(defaultName);
            if (savedName) {
              console.log('[New Set] Web saved. Resetting to default and reloading');
              resetToDefault();
              window.location.reload();
            }
          }
        } catch (e) {
          console.error('Save before new set failed:', e);
        }
        break;
      }
        
      case 'save':
        // Save preset with custom name
        const { savePreset } = useStore.getState();
        const presetName = value.trim() || `preset-${new Date().toISOString().slice(0, 19)}`;
        const savedName = savePreset(presetName);
        
        if (savedName) {
          console.log('Preset saved:', savedName);
          // The file will be downloaded automatically by the savePreset function
        } else {
          console.error('Failed to save preset');
        }
        break;
        
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
      />
      
      <div className="tw-bg-black tw-text-white tw-h-screen tw-flex tw-flex-col">

        <div className="tw-flex-1 tw-pt-16 md:tw-overflow-hidden tw-overflow-y-auto">
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
      <AdvancedMirrorDialog open={advMirrorOpen} onOpenChange={setAdvMirrorOpen} onStart={(opts) => handleAdvancedMirror(opts)} />
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;