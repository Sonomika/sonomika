// Type definitions for TensorFlow.js and ml5.js loaded from CDN
// These are loaded via script tags in index.html and exposed as window.tf and window.ml5

declare global {
  interface Window {
    tf: {
      setBackend: (backend: string) => void;
      ready: () => Promise<void>;
      [key: string]: any; // Allow any other TensorFlow.js methods
    };
    ml5: any; // ml5.js loaded from CDN
  }
}

export {};

