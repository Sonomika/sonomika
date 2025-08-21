import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './tw.css';

// Effects are loaded dynamically - no hardcoded imports needed

const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

const mount = async () => {
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  if (isElectron) {
    // Attempt silent session bootstrap before rendering
    try {
      const { getSupabase } = await import('./lib/supabaseClient');
      const supabase = getSupabase();
      // Touch auth to trigger refresh machinery
      await supabase.auth.getSession();
    } catch {}
    const { AuthGate } = await import('./components/AuthGate');
    root.render(
      <React.StrictMode>
        <AuthGate>
          <App />
        </AuthGate>
      </React.StrictMode>
    );
  } else {
    const { AuthGate } = await import('./components/AuthGate');
    root.render(
      <React.StrictMode>
        <AuthGate>
          <App />
        </AuthGate>
      </React.StrictMode>
    );
  }
};

mount();