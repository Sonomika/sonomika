"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
console.log('=== PRELOAD SCRIPT LOADED ===');
console.log('contextBridge available:', !!electron_1.contextBridge);
console.log('ipcRenderer available:', !!electron_1.ipcRenderer);
console.log('fs available:', !!fs_1.default);
console.log('path available:', !!path_1.default);
console.log('os available:', !!os_1.default);
// Simple test to see if we can access Node.js modules
try {
    console.log('=== PRELOAD SCRIPT: Testing Node.js access ===');
    console.log('Current directory:', process.cwd());
    console.log('Platform:', process.platform);
    console.log('Node version:', process.version);
}
catch (e) {
    console.error('Failed to access Node.js globals:', e);
}
// Test if we can access the global object
console.log('=== PRELOAD SCRIPT: Testing global access ===');
try {
    console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld starting ===');
    // Expose protected methods that allow the renderer process to use
    // the ipcRenderer without exposing the entire object
    electron_1.contextBridge.exposeInMainWorld('electron', {
        minimize: () => {
            console.log('Preload: minimize called');
            electron_1.ipcRenderer.send('window-minimize');
        },
        maximize: () => {
            console.log('Preload: maximize called');
            electron_1.ipcRenderer.send('window-maximize');
        },
        close: () => {
            console.log('Preload: close called');
            electron_1.ipcRenderer.send('window-close');
        },
        toggleMirror: () => electron_1.ipcRenderer.send('toggle-mirror'),
        onToggleMirror: (callback) => {
            electron_1.ipcRenderer.on('toggle-mirror', callback);
        },
        openMirrorWindow: () => electron_1.ipcRenderer.send('open-mirror-window'),
        closeMirrorWindow: () => electron_1.ipcRenderer.send('close-mirror-window'),
        sendCanvasData: (dataUrl) => {
            console.log('Preload: sendCanvasData called');
            // Forward to mirror renderer via dedicated channel
            electron_1.ipcRenderer.send('sendCanvasData', dataUrl);
        },
        toggleFullscreen: () => {
            console.log('Preload: toggleFullscreen called');
            electron_1.ipcRenderer.send('toggle-fullscreen');
        },
        resizeMirrorWindow: (width, height) => {
            console.log('Preload: resizeMirrorWindow called', width, height);
            electron_1.ipcRenderer.send('resize-mirror-window', width, height);
        },
        // Read a local file from disk and return base64 string (renderer-safe)
        readLocalFileAsBase64: (filePath) => {
            return electron_1.ipcRenderer.invoke('read-local-file-base64', filePath);
        }
    });
    console.log('=== PRELOAD SCRIPT: electron API exposed successfully ===');
    // Expose a minimal, safe filesystem API for the renderer (read-only)
    console.log('=== PRELOAD SCRIPT: Starting to expose fsApi ===');
    electron_1.contextBridge.exposeInMainWorld('fsApi', {
        listDirectory: (dirPath) => {
            console.log('Preload: fsApi.listDirectory called with:', dirPath);
            try {
                const entries = fs_1.default.readdirSync(dirPath, { withFileTypes: true });
                console.log('Preload: fsApi.listDirectory success, found', entries.length, 'entries');
                return entries.map((entry) => {
                    const full = path_1.default.join(dirPath, entry.name);
                    let size = undefined;
                    let mtimeMs = undefined;
                    try {
                        const st = fs_1.default.statSync(full);
                        size = entry.isDirectory() ? undefined : st.size;
                        mtimeMs = st.mtimeMs;
                    }
                    catch { }
                    return {
                        name: entry.name,
                        path: full,
                        isDirectory: entry.isDirectory(),
                        size,
                        mtimeMs,
                    };
                });
            }
            catch (e) {
                console.warn('fsApi.listDirectory error:', e);
                return [];
            }
        },
        exists: (p) => {
            try {
                return fs_1.default.existsSync(p);
            }
            catch {
                return false;
            }
        },
        join: (...parts) => path_1.default.join(...parts),
        sep: path_1.default.sep,
        homedir: () => os_1.default.homedir(),
        platform: () => process.platform,
        roots: () => {
            console.log('Preload: fsApi.roots called');
            const roots = [];
            try {
                if (process.platform === 'win32') {
                    for (let i = 65; i <= 90; i++) {
                        const letter = String.fromCharCode(i);
                        const drive = `${letter}:${path_1.default.sep}`;
                        try {
                            if (fs_1.default.existsSync(drive))
                                roots.push(drive);
                        }
                        catch { }
                    }
                }
                else {
                    roots.push(path_1.default.sep);
                }
                console.log('Preload: fsApi.roots returning:', roots);
            }
            catch { }
            return roots;
        }
    });
    console.log('=== PRELOAD SCRIPT: fsApi exposed successfully ===');
    console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld completed ===');
}
catch (error) {
    console.error('=== PRELOAD SCRIPT ERROR ===', error);
    if (error instanceof Error) {
        console.error('Error stack:', error.stack);
    }
}
