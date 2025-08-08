import { contextBridge, ipcRenderer } from 'electron';

console.log('=== PRELOAD SCRIPT LOADED ===');
console.log('contextBridge available:', !!contextBridge);
console.log('ipcRenderer available:', !!ipcRenderer);

// Test if we can access the global object
console.log('=== PRELOAD SCRIPT: Testing global access ===');
try {
  console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld starting ===');
  
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('electron', {
    minimize: () => {
      console.log('Preload: minimize called');
      ipcRenderer.send('window-minimize');
    },
    maximize: () => {
      console.log('Preload: maximize called');
      ipcRenderer.send('window-maximize');
    },
    close: () => {
      console.log('Preload: close called');
      ipcRenderer.send('window-close');
    },
    toggleMirror: () => ipcRenderer.send('toggle-mirror'),
    onToggleMirror: (callback: () => void) => {
      ipcRenderer.on('toggle-mirror', callback);
    },
    openMirrorWindow: () => ipcRenderer.send('open-mirror-window'),
    closeMirrorWindow: () => ipcRenderer.send('close-mirror-window'),
    sendCanvasData: (dataUrl: string) => {
      console.log('Preload: sendCanvasData called');
      ipcRenderer.send('canvas-data', dataUrl);
    },
    toggleFullscreen: () => {
      console.log('Preload: toggleFullscreen called');
      ipcRenderer.send('toggle-fullscreen');
    },
    resizeMirrorWindow: (width: number, height: number) => {
      console.log('Preload: resizeMirrorWindow called', width, height);
      ipcRenderer.send('resize-mirror-window', width, height);
    },
    // Read a local file from disk and return base64 string (renderer-safe)
    readLocalFileAsBase64: (filePath: string): Promise<string> => {
      return ipcRenderer.invoke('read-local-file-base64', filePath);
    }
  });
  
  console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld completed ===');
} catch (error) {
  console.error('=== PRELOAD SCRIPT ERROR ===', error);
}

// Type declaration for the exposed API
declare global {
  interface Window {
    electron: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      toggleMirror: () => void;
      onToggleMirror: (callback: () => void) => void;
      openMirrorWindow: () => void;
      closeMirrorWindow: () => void;
      sendCanvasData: (dataUrl: string) => void;
      toggleFullscreen: () => void;
      resizeMirrorWindow: (width: number, height: number) => void;
      readLocalFileAsBase64: (filePath: string) => Promise<string>;
    };
  }
} 