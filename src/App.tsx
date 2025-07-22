import React, { useState, useEffect } from 'react';
import { useStore } from './store/store';
import { LayerManager } from './components/LayerManager';
import { ShortcutHelp } from './components/ShortcutHelp';

export const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // Get store state with error handling
  let storeState: any = null;
  try {
    storeState = useStore();
    console.log('Store loaded successfully:', storeState);
  } catch (err) {
    console.error('Error accessing store:', err);
    setError('Failed to initialize application state');
  }

  useEffect(() => {
    console.log('App component mounted');
    // Simulate loading time
    const timer = setTimeout(() => {
      console.log('Setting loading to false');
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + K for shortcut help
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setShowShortcutHelp(prev => !prev);
      }
      
      // Escape to close shortcut help
      if (event.key === 'Escape') {
        setShowShortcutHelp(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  console.log('App render - isLoading:', isLoading, 'error:', error, 'storeState:', storeState);

  if (error) {
    console.log('Rendering error screen');
    return (
      <div className="error-screen">
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Reload App</button>
      </div>
    );
  }

  if (isLoading) {
    console.log('Rendering loading state');
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <h2>Loading VJ Application...</h2>
        <button onClick={() => setIsLoading(false)}>Skip Loading</button>
      </div>
    );
  }

  console.log('Rendering main app');
  return (
    <div className="app" style={{ backgroundColor: '#1a1a1a', color: 'white', height: '100vh', overflow: 'hidden' }}>
      {/* Debug button */}
      <button 
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 9999,
          background: '#00bcd4',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
        onClick={() => {
          console.log('Debug button clicked');
          console.log('Store state:', storeState);
          console.log('Current scene:', storeState?.scenes?.find((s: any) => s.id === storeState?.currentSceneId));
        }}
      >
        Debug
      </button>
      
      {/* Main Layer Manager Interface */}
      <LayerManager onClose={() => {}} />
      
      {/* Shortcut Help Modal */}
      {showShortcutHelp && (
        <ShortcutHelp onClose={() => setShowShortcutHelp(false)} />
      )}
    </div>
  );
}; 