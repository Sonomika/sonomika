import { useEffect, Component, ErrorInfo, ReactNode, useState, useRef } from 'react';
import { LayerManager } from './components/LayerManager';
import { MIDIMapper } from './components/MIDIMapper';
import { CanvasStreamManager } from './utils/CanvasStream';
import './index.css';

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
  const testCanvasRef = useRef<HTMLCanvasElement>(null);

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

  // Animate test canvas
  useEffect(() => {
    const canvas = testCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const animate = () => {
      time += 0.02;
      
      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw animated pattern
      ctx.fillStyle = '#4444ff';
      ctx.beginPath();
      ctx.arc(
        320 + Math.sin(time) * 100, 
        240 + Math.cos(time) * 100, 
        50, 
        0, 
        2 * Math.PI
      );
      ctx.fill();
      
      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('VJ Mirror Test', 320, 240);
      ctx.fillText(`Time: ${time.toFixed(1)}s`, 320, 280);
      
      animationId = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
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

  console.log('App component rendering');

  return (
    <ErrorBoundary>
      <div style={{
        backgroundColor: '#000000',
        color: '#ffffff',
        height: '100vh',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="app-header">
          <h1>VJ App Test</h1>
          <button
            onClick={handleMirrorToggle}
            className={`mirror-button ${isMirrorOpen ? 'active' : ''}`}
          >
            {isMirrorOpen ? 'Close Mirror' : 'Open Mirror'}
          </button>
        </div>
        <p>If you can see this, the app is working!</p>

        {/* Hidden test canvas for mirror streaming */}
        <canvas 
          ref={testCanvasRef}
          id="test-mirror-canvas" 
          width="640" 
          height="480" 
          style={{ 
            position: 'absolute', 
            top: '-9999px', 
            left: '-9999px',
            backgroundColor: '#000000'
          }}
        />

        <div style={{ flex: 1, marginTop: '20px', height: 'calc(100vh - 120px)' }}>
          <LayerManager onClose={() => {}} />
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App; 