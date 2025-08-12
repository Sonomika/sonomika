"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('=== MIRROR PRELOAD SCRIPT LOADED ===');
console.log('contextBridge available:', !!electron_1.contextBridge);
console.log('ipcRenderer available:', !!electron_1.ipcRenderer);
electron_1.contextBridge.exposeInMainWorld('mirrorAPI', {
    updateCanvas: (dataUrl) => {
        console.log('Mirror preload: updateCanvas called');
        const noStreamDiv = document.getElementById('no-stream');
        const mirrorImage = document.getElementById('mirror-image');
        console.log('Mirror preload: noStreamDiv found:', !!noStreamDiv);
        console.log('Mirror preload: mirrorImage found:', !!mirrorImage);
        if (noStreamDiv && mirrorImage) {
            noStreamDiv.style.display = 'none';
            mirrorImage.src = dataUrl;
            mirrorImage.style.display = 'block';
            console.log('Mirror window: image updated successfully');
        }
        else {
            console.log('Mirror preload: elements not found');
        }
    },
    toggleFullscreen: () => {
        try {
            electron_1.ipcRenderer.send('toggle-fullscreen');
        }
        catch (e) {
            console.warn('Mirror preload: toggleFullscreen failed', e);
        }
    },
    resizeMirrorWindow: (width, height) => {
        try {
            electron_1.ipcRenderer.send('resize-mirror-window', width, height);
        }
        catch (e) {
            console.warn('Mirror preload: resizeMirrorWindow failed', e);
        }
    }
});
// Listen for canvas updates from main process
electron_1.ipcRenderer.on('update-canvas', (event, dataUrl) => {
    console.log('Mirror preload: received update-canvas event');
    if (window.mirrorAPI && window.mirrorAPI.updateCanvas) {
        console.log('Mirror preload: calling window.mirrorAPI.updateCanvas');
        window.mirrorAPI.updateCanvas(dataUrl);
    }
    else {
        console.log('Mirror preload: window.mirrorAPI not available');
    }
});

// Listen for sendCanvasData events from CanvasStream
electron_1.ipcRenderer.on('sendCanvasData', (event, dataUrl) => {
    console.log('Mirror preload: received sendCanvasData event');
    if (window.mirrorAPI && window.mirrorAPI.updateCanvas) {
        console.log('Mirror preload: calling window.mirrorAPI.updateCanvas for sendCanvasData');
        window.mirrorAPI.updateCanvas(dataUrl);
    }
    else {
        console.log('Mirror preload: window.mirrorAPI not available for sendCanvasData');
    }
});
