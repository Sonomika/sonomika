import { useEffect, Component, ErrorInfo, ReactNode, useState, useRef } from 'react';
import { LayerManager } from './components/LayerManager';
import { CanvasStreamManager } from './utils/CanvasStream';
import { CustomTitleBar } from './components/CustomTitleBar';
import './index.css';

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
    };
  }
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
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
  const streamManagerRef = useRef<CanvasStreamManager | null>(null);

  useEffect(() => {
    console.log('App component mounted');

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



  // Listen for menu toggle-mirror event
  useEffect(() => {
    if (window.electron) {
      window.electron.onToggleMirror(() => {
        handleMirrorToggle();
      });
    }
  }, []);

  const handleMirrorToggle = async () => {
    try {
      if (isMirrorOpen) {
        // Close mirror window
        streamManagerRef.current?.closeMirrorWindow();
        setIsMirrorOpen(false);
      } else {
        // Debug: List all canvases
        const allCanvases = document.querySelectorAll('canvas');
        console.log('All canvases found:', allCanvases.length);
        allCanvases.forEach((canvas, index) => {
          console.log(`Canvas ${index}:`, canvas, 'classes:', canvas.className, 'id:', canvas.id);
        });
        
        // Find the main canvas element - try multiple selectors
        let canvas = document.querySelector('.preview-content canvas') as HTMLCanvasElement;
        
        if (!canvas) {
          canvas = document.querySelector('.canvas-renderer canvas') as HTMLCanvasElement;
        }
        
        if (!canvas) {
          canvas = document.querySelector('.composition-canvas') as HTMLCanvasElement;
        }
        
        if (!canvas) {
          canvas = document.querySelector('canvas') as HTMLCanvasElement;
        }
        
        if (!canvas) {
          canvas = document.getElementById('test-mirror-canvas') as HTMLCanvasElement;
        }
        
        if (!canvas) {
          console.error('No canvas found for streaming');
          alert('No canvas found for streaming. Please make sure the VJ app is running with content.');
          return;
        }

        console.log('Found canvas for streaming:', canvas);
        
        // Create stream manager and open mirror window
        streamManagerRef.current = new CanvasStreamManager(canvas);
        await streamManagerRef.current.openMirrorWindow();
        setIsMirrorOpen(true);
      }
    } catch (error) {
      console.error('Mirror window error:', error);
      alert('Failed to open mirror window: ' + error);
    }
  };

  const handleWindowMinimize = () => {
    if (window.electron) {
      window.electron.minimize();
    }
  };

  const handleWindowMaximize = () => {
    if (window.electron) {
      window.electron.maximize();
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

  const handleNewSet = () => {
    console.log('New Set clicked');
    // TODO: Implement new set functionality
    alert('New Set functionality coming soon!');
  };

  const handleSaveSet = () => {
    console.log('Save Set clicked');
    // TODO: Implement save set functionality
    alert('Save Set functionality coming soon!');
  };

  const handleOpenSet = () => {
    console.log('Open Set clicked');
    // TODO: Implement open set functionality
    alert('Open Set functionality coming soon!');
  };

  console.log('App component rendering');

  return (
    <ErrorBoundary>
      <CustomTitleBar
        onMinimize={handleWindowMinimize}
        onMaximize={handleWindowMaximize}
        onClose={handleWindowClose}
        onMirror={handleMirrorToggle}
        onNewSet={handleNewSet}
        onSaveSet={handleSaveSet}
        onOpenSet={handleOpenSet}
      />
      
      <div style={{
        backgroundColor: '#000000',
        color: '#ffffff',
        height: '100vh',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ flex: 1, marginTop: '20px', height: 'calc(100vh - 120px)' }}>
          <LayerManager onClose={() => {}} />
        </div>


      </div>
    </ErrorBoundary>
  );
}

export default App; 