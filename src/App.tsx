import { useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { LayerManager } from './components/LayerManager';
import { MIDIMapper } from './components/MIDIMapper';
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
        <h1>VJ App Test</h1>
        <p>If you can see this, the app is working!</p>

        <div style={{ flex: 1, marginTop: '20px' }}>
          <LayerManager onClose={() => {}} />
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App; 