import React, { useEffect, useState } from 'react';
import { useStore } from './store/store';
import { MIDIManager } from './midi/MIDIManager';
import { BPMManager } from './engine/BPMManager';
import { KeyboardShortcuts } from './utils/KeyboardShortcuts';
import { ProjectManager } from './utils/ProjectManager';
import { Sidebar } from './components/Sidebar';
import { CompositionScreen } from './components/CompositionScreen';
import { LayerPreview } from './components/LayerPreview';
import { ShortcutHelp } from './components/ShortcutHelp';
import { AppState } from './store/types';

type StoreActions = {
  toggleSidebar: () => void;
};

type Store = AppState & StoreActions;

export const App: React.FC = () => {
  const store = useStore() as Store;
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Initialize managers
      MIDIManager.getInstance();
      BPMManager.getInstance();
      KeyboardShortcuts.getInstance();

      // Handle window resize
      const handleResize = () => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      };

      // Auto-save project state periodically
      const autoSaveInterval = setInterval(() => {
        try {
          ProjectManager.getInstance().saveProject(store);
        } catch (error) {
          console.error('Error auto-saving project:', error);
        }
      }, 30000); // Save every 30 seconds

      window.addEventListener('resize', handleResize);

      // Save project state before unloading
      const handleBeforeUnload = () => {
        try {
          ProjectManager.getInstance().saveProject(store);
        } catch (error) {
          console.error('Error saving project before unload:', error);
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      // Add shortcut for help dialog
      KeyboardShortcuts.getInstance().registerShortcut('?', {
        handler: () => setShowShortcutHelp(prev => !prev),
        description: 'Toggle keyboard shortcuts help',
        category: 'Help',
      });

      setIsLoading(false);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        clearInterval(autoSaveInterval);
        try {
          BPMManager.getInstance().cleanup();
          KeyboardShortcuts.getInstance().cleanup();
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      };
    } catch (error) {
      console.error('Error initializing app:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsLoading(false);
    }
  }, [store]);

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: 'white',
        backgroundColor: '#1a1a1a',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div>
          <h2>Error Loading VJ Application</h2>
          <p style={{ color: '#ff6b6b' }}>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: 'white',
        backgroundColor: '#1a1a1a'
      }}>
        Loading VJ Application...
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <CompositionScreen dimensions={dimensions} />
        <LayerPreview dimensions={dimensions} />
      </div>
      {showShortcutHelp && <ShortcutHelp onClose={() => setShowShortcutHelp(false)} />}
    </div>
  );
}; 