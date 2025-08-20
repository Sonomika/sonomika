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
    root.render(
      <React.StrictMode>
        <App />
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