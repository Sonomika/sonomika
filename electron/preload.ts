import { contextBridge, ipcRenderer } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Quiet preload verbosity in development
(() => {
  try {
    const log = console.log.bind(console);
    const warn = console.warn.bind(console);
    const noisy = /^(Preload:|\[preload\]|=== PRELOAD SCRIPT)/;
    console.log = (...args: any[]) => {
      const first = args[0];
      if (typeof first === 'string' && noisy.test(first)) return;
      return log(...args);
    };
    console.warn = (...args: any[]) => {
      const first = args[0];
      if (typeof first === 'string' && noisy.test(first)) return;
      return warn(...args);
    };
  } catch {}
})();

// console.log('=== PRELOAD SCRIPT LOADED ===');
// console.log('contextBridge available:', !!contextBridge);
// console.log('ipcRenderer available:', !!ipcRenderer);
// console.log('fs available:', !!fs);
// console.log('path available:', !!path);
// console.log('os available:', !!os);

// Simple test to see if we can access Node.js modules
try {
  // console.log('=== PRELOAD SCRIPT: Testing Node.js access ===');
  // console.log('Current directory:', process.cwd());
  // console.log('Platform:', process.platform);
  // console.log('Node version:', process.version);
} catch (e) {
  console.error('Failed to access Node.js globals:', e);
}

// Test if we can access the global object
// console.log('=== PRELOAD SCRIPT: Testing global access ===');
try {
  // console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld starting ===');
  
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('electron', {
    onDebugToggleOverlay: (cb: () => void) => {
      ipcRenderer.on('debug:toggleOverlay', () => { try { cb(); } catch {} });
    },
    onDebugOpenPanel: (cb: () => void) => {
      ipcRenderer.on('debug:openPanel', () => { try { cb(); } catch {} });
    },
    minimize: () => {
      // console.log('Preload: minimize called');
      ipcRenderer.send('window-minimize');
    },
    maximize: () => {
      // console.log('Preload: maximize called');
      ipcRenderer.send('window-maximize');
    },
    close: () => {
      // console.log('Preload: close called');
      ipcRenderer.send('window-close');
    },
    toggleMirror: () => ipcRenderer.send('toggle-mirror'),
    onToggleMirror: (callback: () => void) => {
      ipcRenderer.on('toggle-mirror', callback);
    },
    onToggleAdvancedMirror: (callback: () => void) => {
      ipcRenderer.on('toggle-advanced-mirror', callback);
    },
    openMirrorWindow: () => ipcRenderer.send('open-mirror-window'),
    closeMirrorWindow: () => ipcRenderer.send('close-mirror-window'),
    setMirrorBackground: (color: string) => ipcRenderer.send('set-mirror-bg', color),
    sendCanvasData: (dataUrl: string) => {
      // console.log('Preload: sendCanvasData called');
      // Forward to mirror renderer via dedicated channel
      ipcRenderer.send('sendCanvasData', dataUrl);
    },
    toggleFullscreen: () => {
      // console.log('Preload: toggleFullscreen called');
      ipcRenderer.send('toggle-fullscreen');
    },
    onRecordStart: (cb: () => void) => {
      ipcRenderer.on('record:start', () => { try { cb(); } catch {} });
    },
    onRecordSettings: (cb: () => void) => {
      ipcRenderer.on('record:settings', () => { try { cb(); } catch {} });
    },
    resizeMirrorWindow: (width: number, height: number) => {
      // console.log('Preload: resizeMirrorWindow called', width, height);
      ipcRenderer.send('resize-mirror-window', width, height);
    },
    setMirrorAspectRatio: (width: number, height: number) => {
      ipcRenderer.send('set-mirror-aspect', width, height);
    },
    toggleAppFullscreen: () => {
      // console.log('Preload: toggleAppFullscreen called');
      ipcRenderer.send('toggle-app-fullscreen');
    },
    onWindowState: (cb: (state: { maximized: boolean }) => void) => {
      ipcRenderer.on('window-state', (_, state) => {
        try { cb(state); } catch {}
      });
    },
    // Read a local file from disk and return base64 string (renderer-safe)
    readLocalFileAsBase64: (filePath: string): Promise<string> => ipcRenderer.invoke('read-local-file-base64', filePath),
    showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
    saveFile: (filePath: string, content: string) => ipcRenderer.invoke('save-file', filePath, content),
    saveBinaryFile: (filePath: string, data: Uint8Array) => ipcRenderer.invoke('save-binary-file', filePath, data),
    readFileText: (filePath: string) => ipcRenderer.invoke('read-file-text', filePath)
  });

  // Advanced mirror API
  contextBridge.exposeInMainWorld('advancedMirror', {
    open: (slices: Array<{ id: string; title?: string; width?: number; height?: number; x?: number; y?: number }>) => {
      // console.log('[preload] advanced-mirror:open', slices?.map?.(s => s?.id));
      ipcRenderer.send('advanced-mirror:open', slices);
    },
    closeAll: () => {
      // console.log('[preload] advanced-mirror:closeAll');
      ipcRenderer.send('advanced-mirror:closeAll');
    },
    sendSliceData: (id: string, dataUrl: string) => {
      // Avoid flooding console, but log ids
      // console.log('[preload] advanced-mirror:sendSliceData', id, dataUrl?.length);
      ipcRenderer.send('advanced-mirror:sendSliceData', id, dataUrl);
    },
    setSliceBackground: (id: string, color: string) => {
      ipcRenderer.send('advanced-mirror:setBg', id, color);
    },
    resizeSliceWindow: (id: string, width: number, height: number) => {
      ipcRenderer.send('advanced-mirror:resize', id, width, height);
    },
    toggleSliceFullscreen: (id: string) => {
      ipcRenderer.send('advanced-mirror:toggleFullscreen', id);
    }
  });

  // Also expose advanced mirror helpers under window.electron for broader compatibility
  try {
    const existing = (globalThis as any).electron || {};
    (globalThis as any).electron = {
      ...existing,
      advancedMirrorOpen: (slices: Array<{ id: string; title?: string; width?: number; height?: number; x?: number; y?: number }>) => {
        // console.log('[preload] electron.advancedMirrorOpen');
        ipcRenderer.send('advanced-mirror:open', slices);
      },
      advancedMirrorCloseAll: () => {
        // console.log('[preload] electron.advancedMirrorCloseAll');
        ipcRenderer.send('advanced-mirror:closeAll');
      },
      advancedMirrorSendSliceData: (id: string, dataUrl: string) => {
        ipcRenderer.send('advanced-mirror:sendSliceData', id, dataUrl);
      },
      advancedMirrorSetBg: (id: string, color: string) => {
        ipcRenderer.send('advanced-mirror:setBg', id, color);
      },
      advancedMirrorResize: (id: string, width: number, height: number) => {
        ipcRenderer.send('advanced-mirror:resize', id, width, height);
      }
    };
  } catch {}
  
  // console.log('=== PRELOAD SCRIPT: electron API exposed successfully ===');
  
  // Expose a minimal, safe filesystem API for the renderer (read-only)
  // console.log('=== PRELOAD SCRIPT: Starting to expose fsApi ===');
  contextBridge.exposeInMainWorld('fsApi', {
    listDirectory: (dirPath: string) => {
      // console.log('Preload: fsApi.listDirectory called with:', dirPath);
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        // console.log('Preload: fsApi.listDirectory success, found', entries.length, 'entries');
        return entries.map((entry) => {
          const full = path.join(dirPath, entry.name);
          let size: number | undefined = undefined;
          let mtimeMs: number | undefined = undefined;
          try {
            const st = fs.statSync(full);
            size = entry.isDirectory() ? undefined : st.size;
            mtimeMs = st.mtimeMs;
          } catch {}
          return {
            name: entry.name,
            path: full,
            isDirectory: entry.isDirectory(),
            size,
            mtimeMs,
          };
        });
      } catch (e) {
        console.warn('fsApi.listDirectory error:', e);
        return [] as Array<{ name: string; path: string; isDirectory: boolean; size?: number; mtimeMs?: number }>;
      }
    },
    exists: (p: string) => {
      try { return fs.existsSync(p); } catch { return false; }
    },
    join: (...parts: string[]) => path.join(...parts),
    sep: path.sep,
    homedir: () => os.homedir(),
    platform: () => process.platform,
    roots: () => {
      // console.log('Preload: fsApi.roots called');
      const roots: string[] = [];
      try {
        if (process.platform === 'win32') {
          for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const drive = `${letter}:${path.sep}`;
            try { if (fs.existsSync(drive)) roots.push(drive); } catch {}
          }
        } else {
          roots.push(path.sep);
        }
        // console.log('Preload: fsApi.roots returning:', roots);
      } catch {}
      return roots;
    }
  });

  // Auth storage API for secure session persistence
  contextBridge.exposeInMainWorld('authStorage', {
    isEncryptionAvailable: async (): Promise<boolean> => ipcRenderer.invoke('authStorage:isEncryptionAvailable'),
    isEncryptionAvailableSync: (): boolean => ipcRenderer.sendSync('authStorage:isEncryptionAvailableSync'),
    save: async (key: string, plainText: string): Promise<boolean> => ipcRenderer.invoke('authStorage:save', key, plainText),
    saveSync: (key: string, plainText: string): boolean => ipcRenderer.sendSync('authStorage:saveSync', key, plainText),
    load: async (key: string): Promise<string | null> => ipcRenderer.invoke('authStorage:load', key),
    loadSync: (key: string): string | null => ipcRenderer.sendSync('authStorage:loadSync', key),
    remove: async (key: string): Promise<boolean> => ipcRenderer.invoke('authStorage:remove', key),
    removeSync: (key: string): boolean => ipcRenderer.sendSync('authStorage:removeSync', key),
    loadAll: async (): Promise<Record<string, string>> => ipcRenderer.invoke('authStorage:loadAll'),
  });
  
  // console.log('=== PRELOAD SCRIPT: fsApi exposed successfully ===');
  // console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld completed ===');
} catch (error) {
  console.error('=== PRELOAD SCRIPT ERROR ===', error);
  if (error instanceof Error) {
    console.error('Error stack:', error.stack);
  }
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
      onToggleAdvancedMirror: (callback: () => void) => void;
      openMirrorWindow: () => void;
      closeMirrorWindow: () => void;
      sendCanvasData: (dataUrl: string) => void;
      toggleFullscreen: () => void;
      onRecordStart: (cb: () => void) => void;
      onRecordSettings: (cb: () => void) => void;
      resizeMirrorWindow: (width: number, height: number) => void;
      toggleAppFullscreen: () => void;
      readLocalFileAsBase64: (filePath: string) => Promise<string>;
      showOpenDialog: (options: any) => Promise<any>;
      showSaveDialog: (options: any) => Promise<any>;
      saveFile: (filePath: string, content: string) => Promise<boolean>;
      saveBinaryFile: (filePath: string, data: Uint8Array) => Promise<boolean>;
      readFileText: (filePath: string) => Promise<string | null>;
      setMirrorAspectRatio: (width: number, height: number) => void;
    };
    advancedMirror: {
      open: (slices: Array<{ id: string; title?: string; width?: number; height?: number; x?: number; y?: number }>) => void;
      closeAll: () => void;
      sendSliceData: (id: string, dataUrl: string) => void;
      setSliceBackground: (id: string, color: string) => void;
      resizeSliceWindow: (id: string, width: number, height: number) => void;
      toggleSliceFullscreen: (id: string) => void;
    };
    authStorage: {
      isEncryptionAvailable: () => Promise<boolean>;
      isEncryptionAvailableSync: () => boolean;
      save: (key: string, plainText: string) => Promise<boolean>;
      saveSync: (key: string, plainText: string) => boolean;
      load: (key: string) => Promise<string | null>;
      loadSync: (key: string) => string | null;
      remove: (key: string) => Promise<boolean>;
      removeSync: (key: string) => boolean;
      loadAll: () => Promise<Record<string, string>>;
    };
    fsApi: {
      listDirectory: (dirPath: string) => Array<{ name: string; path: string; isDirectory: boolean; size?: number; mtimeMs?: number }>;
      exists: (p: string) => boolean;
      join: (...parts: string[]) => string;
      sep: string;
      homedir: () => string;
      platform: () => string;
      roots: () => string[];
    };
  }
} 