import { contextBridge, ipcRenderer } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('=== PRELOAD SCRIPT LOADED ===');
console.log('contextBridge available:', !!contextBridge);
console.log('ipcRenderer available:', !!ipcRenderer);
console.log('fs available:', !!fs);
console.log('path available:', !!path);
console.log('os available:', !!os);

// Simple test to see if we can access Node.js modules
try {
  console.log('=== PRELOAD SCRIPT: Testing Node.js access ===');
  console.log('Current directory:', process.cwd());
  console.log('Platform:', process.platform);
  console.log('Node version:', process.version);
} catch (e) {
  console.error('Failed to access Node.js globals:', e);
}

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
  
  console.log('=== PRELOAD SCRIPT: electron API exposed successfully ===');
  
  // Expose a minimal, safe filesystem API for the renderer (read-only)
  console.log('=== PRELOAD SCRIPT: Starting to expose fsApi ===');
  contextBridge.exposeInMainWorld('fsApi', {
    listDirectory: (dirPath: string) => {
      console.log('Preload: fsApi.listDirectory called with:', dirPath);
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        console.log('Preload: fsApi.listDirectory success, found', entries.length, 'entries');
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
      console.log('Preload: fsApi.roots called');
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
        console.log('Preload: fsApi.roots returning:', roots);
      } catch {}
      return roots;
    }
  });
  
  console.log('=== PRELOAD SCRIPT: fsApi exposed successfully ===');
  console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld completed ===');
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
      openMirrorWindow: () => void;
      closeMirrorWindow: () => void;
      sendCanvasData: (dataUrl: string) => void;
      toggleFullscreen: () => void;
      resizeMirrorWindow: (width: number, height: number) => void;
      readLocalFileAsBase64: (filePath: string) => Promise<string>;
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