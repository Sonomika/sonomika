"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
// Quiet preload verbosity in development
(() => {
    try {
        const log = console.log.bind(console);
        const warn = console.warn.bind(console);
        const noisy = /^(Preload:|\[preload\]|=== PRELOAD SCRIPT)/;
        console.log = (...args) => {
            const first = args[0];
            if (typeof first === 'string' && noisy.test(first))
                return;
            return log(...args);
        };
        console.warn = (...args) => {
            const first = args[0];
            if (typeof first === 'string' && noisy.test(first))
                return;
            return warn(...args);
        };
    }
    catch { }
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
}
catch (e) {
    console.error('Failed to access Node.js globals:', e);
}
// Test if we can access the global object
// console.log('=== PRELOAD SCRIPT: Testing global access ===');
try {
    // console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld starting ===');
    // Expose protected methods that allow the renderer process to use
    // the ipcRenderer without exposing the entire object
    electron_1.contextBridge.exposeInMainWorld('electron', {
        minimize: () => {
            // console.log('Preload: minimize called');
            electron_1.ipcRenderer.send('window-minimize');
        },
        maximize: () => {
            // console.log('Preload: maximize called');
            electron_1.ipcRenderer.send('window-maximize');
        },
        close: () => {
            // console.log('Preload: close called');
            electron_1.ipcRenderer.send('window-close');
        },
        toggleMirror: () => electron_1.ipcRenderer.send('toggle-mirror'),
        onToggleMirror: (callback) => {
            electron_1.ipcRenderer.on('toggle-mirror', callback);
        },
        onToggleAdvancedMirror: (callback) => {
            electron_1.ipcRenderer.on('toggle-advanced-mirror', callback);
        },
        openMirrorWindow: () => electron_1.ipcRenderer.send('open-mirror-window'),
        closeMirrorWindow: () => electron_1.ipcRenderer.send('close-mirror-window'),
        setMirrorBackground: (color) => electron_1.ipcRenderer.send('set-mirror-bg', color),
        sendCanvasData: (dataUrl) => {
            // console.log('Preload: sendCanvasData called');
            // Forward to mirror renderer via dedicated channel
            electron_1.ipcRenderer.send('sendCanvasData', dataUrl);
        },
        toggleFullscreen: () => {
            // console.log('Preload: toggleFullscreen called');
            electron_1.ipcRenderer.send('toggle-fullscreen');
        },
        resizeMirrorWindow: (width, height) => {
            // console.log('Preload: resizeMirrorWindow called', width, height);
            electron_1.ipcRenderer.send('resize-mirror-window', width, height);
        },
        setMirrorAspectRatio: (width, height) => {
            electron_1.ipcRenderer.send('set-mirror-aspect', width, height);
        },
        toggleAppFullscreen: () => {
            // console.log('Preload: toggleAppFullscreen called');
            electron_1.ipcRenderer.send('toggle-app-fullscreen');
        },
        onWindowState: (cb) => {
            electron_1.ipcRenderer.on('window-state', (_, state) => {
                try {
                    cb(state);
                }
                catch { }
            });
        },
        // Read a local file from disk and return base64 string (renderer-safe)
        readLocalFileAsBase64: (filePath) => electron_1.ipcRenderer.invoke('read-local-file-base64', filePath),
        showOpenDialog: (options) => electron_1.ipcRenderer.invoke('show-open-dialog', options),
        showSaveDialog: (options) => electron_1.ipcRenderer.invoke('show-save-dialog', options),
        saveFile: (filePath, content) => electron_1.ipcRenderer.invoke('save-file', filePath, content),
        readFileText: (filePath) => electron_1.ipcRenderer.invoke('read-file-text', filePath)
    });
    // Advanced mirror API
    electron_1.contextBridge.exposeInMainWorld('advancedMirror', {
        open: (slices) => {
            // console.log('[preload] advanced-mirror:open', slices?.map?.(s => s?.id));
            electron_1.ipcRenderer.send('advanced-mirror:open', slices);
        },
        closeAll: () => {
            // console.log('[preload] advanced-mirror:closeAll');
            electron_1.ipcRenderer.send('advanced-mirror:closeAll');
        },
        sendSliceData: (id, dataUrl) => {
            // Avoid flooding console, but log ids
            // console.log('[preload] advanced-mirror:sendSliceData', id, dataUrl?.length);
            electron_1.ipcRenderer.send('advanced-mirror:sendSliceData', id, dataUrl);
        },
        setSliceBackground: (id, color) => {
            electron_1.ipcRenderer.send('advanced-mirror:setBg', id, color);
        },
        resizeSliceWindow: (id, width, height) => {
            electron_1.ipcRenderer.send('advanced-mirror:resize', id, width, height);
        },
        toggleSliceFullscreen: (id) => {
            electron_1.ipcRenderer.send('advanced-mirror:toggleFullscreen', id);
        }
    });
    // Also expose advanced mirror helpers under window.electron for broader compatibility
    try {
        const existing = globalThis.electron || {};
        globalThis.electron = {
            ...existing,
            advancedMirrorOpen: (slices) => {
                // console.log('[preload] electron.advancedMirrorOpen');
                electron_1.ipcRenderer.send('advanced-mirror:open', slices);
            },
            advancedMirrorCloseAll: () => {
                // console.log('[preload] electron.advancedMirrorCloseAll');
                electron_1.ipcRenderer.send('advanced-mirror:closeAll');
            },
            advancedMirrorSendSliceData: (id, dataUrl) => {
                electron_1.ipcRenderer.send('advanced-mirror:sendSliceData', id, dataUrl);
            },
            advancedMirrorSetBg: (id, color) => {
                electron_1.ipcRenderer.send('advanced-mirror:setBg', id, color);
            },
            advancedMirrorResize: (id, width, height) => {
                electron_1.ipcRenderer.send('advanced-mirror:resize', id, width, height);
            }
        };
    }
    catch { }
    // console.log('=== PRELOAD SCRIPT: electron API exposed successfully ===');
    // Expose a minimal, safe filesystem API for the renderer (read-only)
    // console.log('=== PRELOAD SCRIPT: Starting to expose fsApi ===');
    electron_1.contextBridge.exposeInMainWorld('fsApi', {
        listDirectory: (dirPath) => {
            // console.log('Preload: fsApi.listDirectory called with:', dirPath);
            try {
                const entries = fs_1.default.readdirSync(dirPath, { withFileTypes: true });
                // console.log('Preload: fsApi.listDirectory success, found', entries.length, 'entries');
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
            // console.log('Preload: fsApi.roots called');
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
                // console.log('Preload: fsApi.roots returning:', roots);
            }
            catch { }
            return roots;
        }
    });
    // Auth storage API for secure session persistence
    electron_1.contextBridge.exposeInMainWorld('authStorage', {
        isEncryptionAvailable: async () => electron_1.ipcRenderer.invoke('authStorage:isEncryptionAvailable'),
        isEncryptionAvailableSync: () => electron_1.ipcRenderer.sendSync('authStorage:isEncryptionAvailableSync'),
        save: async (key, plainText) => electron_1.ipcRenderer.invoke('authStorage:save', key, plainText),
        saveSync: (key, plainText) => electron_1.ipcRenderer.sendSync('authStorage:saveSync', key, plainText),
        load: async (key) => electron_1.ipcRenderer.invoke('authStorage:load', key),
        loadSync: (key) => electron_1.ipcRenderer.sendSync('authStorage:loadSync', key),
        remove: async (key) => electron_1.ipcRenderer.invoke('authStorage:remove', key),
        removeSync: (key) => electron_1.ipcRenderer.sendSync('authStorage:removeSync', key),
        loadAll: async () => electron_1.ipcRenderer.invoke('authStorage:loadAll'),
    });
    // console.log('=== PRELOAD SCRIPT: fsApi exposed successfully ===');
    // console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld completed ===');
}
catch (error) {
    console.error('=== PRELOAD SCRIPT ERROR ===', error);
    if (error instanceof Error) {
        console.error('Error stack:', error.stack);
    }
}
