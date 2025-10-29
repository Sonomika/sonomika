import './utils/quietConsole';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { preloadInterFonts } from './lib/fontLoader';
import { initGLTFLoaderGlobal } from './lib/initGLTFLoader';
import { initThreeAddonsGlobal } from './lib/initThreeAddons';
import './index.css';
import './tw.css';

// Effects are loaded dynamically - no hardcoded imports needed

const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

const mount = async () => {
  // Expose globals for external ESM user effects (no bare imports)
  try {
    (window as any).React = React;
    const THREE = await import('three');
    (window as any).THREE = THREE;
  } catch {}
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  try { await preloadInterFonts(); } catch {}
  if (isElectron) {
    // Expose globals for external JS effects
    try {
      (window as any).React = React;
      const THREE = await import('three');
      (window as any).THREE = THREE;
      const r3f = await import('@react-three/fiber');
      (window as any).r3f = r3f;
      // Ensure GLTFLoader is globally available for external effects
      initGLTFLoaderGlobal();
      // Expose ConvexGeometry and BufferGeometryUtils for external convex source
      initThreeAddonsGlobal();
    } catch {}
    // Electron: run app without Supabase/AuthGate
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } else {
    // Also expose globals on web for portable external effects (within CSP limits)
    try {
      (window as any).React = React;
      const THREE = await import('three');
      (window as any).THREE = THREE;
      const r3f = await import('@react-three/fiber');
      (window as any).r3f = r3f;
    } catch {}
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