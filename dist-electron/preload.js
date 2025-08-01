"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
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
        openMirrorWindow: () => electron_1.ipcRenderer.send('open-mirror-window'),
        closeMirrorWindow: () => electron_1.ipcRenderer.send('close-mirror-window')
    });
    console.log('=== PRELOAD SCRIPT: contextBridge.exposeInMainWorld completed ===');
}
catch (error) {
    console.error('=== PRELOAD SCRIPT ERROR ===', error);
}
