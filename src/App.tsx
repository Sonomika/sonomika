import React, { useState, useEffect, useRef } from 'react';
import { LayerManager } from './components/LayerManager';
import { CompositionSettings } from './components/CompositionSettings';
import { PresetModal } from './components/PresetModal';
import { CustomTitleBar } from './components/CustomTitleBar';
import { StyleGuide } from './components/StyleGuide';
import { useStore } from './store/store';
import { effectCache } from './utils/EffectCache';
import { CanvasStreamManager } from './utils/CanvasStream';
import './index.css';

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
        <div style={{ 
          backgroundColor: '#000000', 
          color: '#ffffff', 
          height: '100vh', 
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <h1>Something went wrong!</h1>
          <p>Error: {this.state.error?.message}</p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ffffff',
              color: '#000000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
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
  const [styleGuideOpen, setStyleGuideOpen] = useState(false);
  const streamManagerRef = useRef<CanvasStreamManager | null>(null);
  const usingDummyCanvas = useRef<boolean>(false);
  const { savePreset, loadPreset } = useStore();
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
    setModalConfig({
      isOpen: true,
      type: 'new',
      title: 'New Preset',
      message: 'Are you sure you want to create a new preset? This will reset all current settings to default.',
      confirmText: 'Yes, Reset',
      cancelText: 'Cancel'
    });
  };

  const handleSavePreset = () => {
    // Show modal to get custom preset name
    setModalConfig({
      isOpen: true,
      type: 'save',
      title: 'Save Preset',
      message: 'Enter a name for your preset:',
      placeholder: 'My Awesome Preset',
      defaultValue: '',
      confirmText: 'Save',
      cancelText: 'Cancel'
    });
  };

  const handleLoadPreset = () => {
    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.vjpreset,.json';
    fileInput.style.display = 'none';
    
    fileInput.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      
                if (file) {
            try {
              const success = await loadPreset(file);
              if (success) {
                console.log(`Preset "${file.name}" loaded successfully!`);
                // Removed alert to reduce popups
              } else {
                console.error('Failed to load preset. Please check the file format.');
                // Removed alert to reduce popups
              }
            } catch (error) {
              console.error('Error loading preset:', error);
              // Removed alert to reduce popups
            }
          }
      
      // Clean up
      document.body.removeChild(fileInput);
    };
    
    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
  };

  const handleCompositionSettings = () => {
    setCompositionSettingsOpen(true);
  };

  // Check if we're on the style guide route
  useEffect(() => {
    if (window.location.pathname === '/__style') {
      setStyleGuideOpen(true);
    }
  }, []);

  const handleStyleGuideClose = () => {
    setStyleGuideOpen(false);
    window.history.pushState({}, '', '/');
  };

  const handleModalClose = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  const handleModalConfirm = (value: string) => {
    switch (modalConfig.type) {
      case 'new':
        // Reset to default state
        const { resetToDefault } = useStore.getState();
        resetToDefault();
        
        // Reload the page to ensure clean state
        window.location.reload();
        break;
        
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

  return (
    <ErrorBoundary>
      <CustomTitleBar
        onMinimize={handleWindowMinimize}
        onMaximize={handleWindowMaximize}
        onClose={handleWindowClose}
        onMirror={handleMirrorToggle}
        onToggleAppFullscreen={handleToggleAppFullscreen}
        onNewPreset={handleNewPreset}
        onSavePreset={handleSavePreset}
        onLoadPreset={handleLoadPreset}
        onCompositionSettings={handleCompositionSettings}
        onStyleGuide={() => setStyleGuideOpen(true)}
      />
      
      <div style={{
        backgroundColor: '#000000',
        color: '#ffffff',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}>

        <div style={{ flex: 1, height: 'calc(100vh - 32px)' }}>
          {styleGuideOpen ? (
            <StyleGuide onClose={handleStyleGuideClose} />
          ) : (
            <LayerManager onClose={() => {}} />
          )}
        </div>
      </div>
      
      <PresetModal
        isOpen={modalConfig.isOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        placeholder={modalConfig.placeholder}
        defaultValue={modalConfig.defaultValue}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
      />
      
      <CompositionSettings
        isOpen={compositionSettingsOpen}
        onClose={() => setCompositionSettingsOpen(false)}
      />
    </ErrorBoundary>
  );
}

export default App; 