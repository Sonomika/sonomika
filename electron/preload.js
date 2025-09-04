"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs = require('fs');
const path = require('path');
const os = require('os');
console.log('=== PRELOAD SCRIPT LOADED ===');
console.log('contextBridge available:', !!electron_1.contextBridge);
console.log('ipcRenderer available:', !!electron_1.ipcRenderer);
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
        onMirrorWindowClosed: (callback) => {
            electron_1.ipcRenderer.on('mirror-window-closed', callback);
        },
        openMirrorWindow: () => electron_1.ipcRenderer.send('open-mirror-window'),
        closeMirrorWindow: () => electron_1.ipcRenderer.send('close-mirror-window'),
        sendCanvasData: (dataUrl) => {
            console.log('Preload: sendCanvasData called');
            electron_1.ipcRenderer.send('sendCanvasData', dataUrl);
        },
        setMirrorAspectRatio: (width, height) => {
            console.log('Preload: setMirrorAspectRatio called', width, height);
            electron_1.ipcRenderer.send('set-mirror-aspect', width, height);
        },
        resizeMirrorWindow: (width, height) => {
            console.log('Preload: resizeMirrorWindow called', width, height);
            electron_1.ipcRenderer.send('resize-mirror-window', width, height);
        },
        readLocalFileAsBase64: (filePath) => {
            return electron_1.ipcRenderer.invoke('read-local-file-base64', filePath);
        },
        showOpenDialog: (options) => {
            return electron_1.ipcRenderer.invoke('show-open-dialog', options);
        },
        showSaveDialog: (options) => {
            return electron_1.ipcRenderer.invoke('show-save-dialog', options);
        },
        readFileText: (filePath) => {
            return electron_1.ipcRenderer.invoke('read-file-text', filePath);
        },
        saveFile: (filePath, content) => {
            return electron_1.ipcRenderer.invoke('save-file', filePath, content);
        },
        saveBinaryFile: (filePath, data) => {
            return electron_1.ipcRenderer.invoke('save-binary-file', filePath, data);
        },
        getSystemAudioStream: () => {
            return electron_1.ipcRenderer.invoke('get-system-audio-stream');
        },
        toggleAppFullscreen: () => {
            console.log('Preload: toggleAppFullscreen called');
            electron_1.ipcRenderer.send('toggle-app-fullscreen');
        }
    });
    console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld completed ===');

    // Expose encrypted auth storage bridge
    try {
        electron_1.contextBridge.exposeInMainWorld('authStorage', {
            isEncryptionAvailableSync: () => {
                try { return electron_1.ipcRenderer.sendSync('authStorage:isEncryptionAvailableSync'); } catch (_a) { return false; }
            },
            saveSync: (key, plainText) => {
                try { return electron_1.ipcRenderer.sendSync('authStorage:saveSync', key, plainText); } catch (_b) { return false; }
            },
            loadSync: (key) => {
                try { return electron_1.ipcRenderer.sendSync('authStorage:loadSync', key); } catch (_c) { return null; }
            },
            removeSync: (key) => {
                try { return electron_1.ipcRenderer.sendSync('authStorage:removeSync', key); } catch (_d) { return false; }
            },
        });
    } catch (e) {
        console.warn('Failed to expose authStorage in preload:', e);
    }
    // Expose safe fs API
    electron_1.contextBridge.exposeInMainWorld('fsApi', {
        listDirectory: (dirPath) => {
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                return entries.map((entry) => {
                    const full = path.join(dirPath, entry.name);
                    let size = undefined;
                    let mtimeMs = undefined;
                    try {
                        const st = fs.statSync(full);
                        size = entry.isDirectory() ? undefined : st.size;
                        mtimeMs = st.mtimeMs;
                    }
                    catch (_a) { }
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
        exists: (p) => { try {
            return fs.existsSync(p);
        }
        catch (_a) {
            return false;
        } },
        join: (...parts) => path.join(...parts),
        sep: path.sep,
        homedir: () => os.homedir(),
        platform: () => process.platform,
        roots: () => {
            const roots = [];
            try {
                if (process.platform === 'win32') {
                    for (let i = 65; i <= 90; i++) {
                        const letter = String.fromCharCode(i);
                        const drive = `${letter}:${path.sep}`;
                        try {
                            if (fs.existsSync(drive))
                                roots.push(drive);
                        }
                        catch (_a) { }
                    }
                }
                else {
                    roots.push(path.sep);
                }
            }
            catch (_b) { }
            return roots;
        }
    });
}
catch (error) {
    console.error('=== PRELOAD SCRIPT ERROR ===', error);
}
