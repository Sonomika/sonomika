import { app, BrowserWindow, protocol, Menu, ipcMain, safeStorage, dialog, powerSaveBlocker } from 'electron';
import fs from 'fs';
import path from 'path';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      if (windows[0].isMinimized()) windows[0].restore();
      windows[0].focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;
let mirrorWindow: BrowserWindow | null = null;
let mirrorPowerSaveBlockId: number | null = null;
let outputWindow: BrowserWindow | null = null;
let outputAspectRatio: number | null = null;
let mirrorAspectRatio: number | null = null;
// Advanced mirror windows keyed by slice id
const advancedMirrorWindows: Map<string, BrowserWindow> = new Map();
let encryptedAuthStore: Record<string, Buffer> = {};

function getAuthStoreFilePath() {
  const userData = app.getPath('userData');
  return path.join(userData, 'auth_store.json');
}

function loadEncryptedAuthStoreFromDisk() {
  try {
    const fp = getAuthStoreFilePath();
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf8');
      const json = JSON.parse(raw) as Record<string, string>;
      encryptedAuthStore = Object.fromEntries(
        Object.entries(json).map(([k, base64]) => [k, Buffer.from(base64, 'base64')])
      );
    }
  } catch (e) {
    console.warn('Failed to load encrypted auth store, starting empty:', e);
    encryptedAuthStore = {};
  }
}

function persistEncryptedAuthStoreToDisk() {
  try {
    const fp = getAuthStoreFilePath();
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const json: Record<string, string> = Object.fromEntries(
      Object.entries(encryptedAuthStore).map(([k, buf]) => [k, buf.toString('base64')])
    );
    fs.writeFileSync(fp, JSON.stringify(json), 'utf8');
  } catch (e) {
    console.warn('Failed to persist encrypted auth store:', e);
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Remove default window frame
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    },
    show: false, // Don't show until ready
  });

  // Debug preload path
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload script path:', preloadPath);
  console.log('Preload script exists:', require('fs').existsSync(preloadPath));
  
  // Read and log the first few lines of the preload script
  if (require('fs').existsSync(preloadPath)) {
    const preloadContent = require('fs').readFileSync(preloadPath, 'utf8');
    console.log('Preload script first 200 chars:', preloadContent.substring(0, 200));
  }

  // Disable CSP entirely for development
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    console.log('Setting CSP headers for URL:', details.url);
    
    // Remove CSP headers entirely for development
    const responseHeaders = {
      ...details.responseHeaders,
      'Content-Security-Policy': []
    };
    
    console.log('CSP headers disabled for development');
    
    callback({
      responseHeaders
    });
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
    // Prevent background throttling
    mainWindow!.webContents.setBackgroundThrottling(false);
  });

  // Ensure renderer-created child windows (via window.open) are chrome-less for output
  try {
    mainWindow.webContents.setWindowOpenHandler((details) => {
      const isOutput = details.frameName === 'output-canvas';
      if (isOutput) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            title: 'Output',
            frame: false,
            titleBarStyle: 'hidden',
            autoHideMenuBar: true,
            backgroundColor: '#000000',
            fullscreenable: true,
            resizable: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: false,
              backgroundThrottling: false,
            },
          },
        } as any;
      }
      return { action: 'allow' } as any;
    });

    mainWindow.webContents.on('did-create-window', (childWindow, details: any) => {
      try {
        if (details?.frameName === 'output-canvas') {
          outputWindow = childWindow;
          try { childWindow.removeMenu(); } catch {}
          try { childWindow.setMenuBarVisibility(false); } catch {}
          try { childWindow.webContents.setBackgroundThrottling(false); } catch {}
          try {
            if (outputAspectRatio && isFinite(outputAspectRatio) && outputAspectRatio > 0) {
              childWindow.setAspectRatio(outputAspectRatio);
            }
          } catch {}
          try {
            childWindow.on('closed', () => {
              outputWindow = null;
            });
          } catch {}
        }
      } catch {}
    });
  } catch {}

  // Forward window state to renderer
  mainWindow.on('maximize', () => {
    try { mainWindow?.webContents.send('window-state', { maximized: true }); } catch {}
  });
  mainWindow.on('unmaximize', () => {
    try { mainWindow?.webContents.send('window-state', { maximized: false }); } catch {}
  });

  // Check if we're in development mode
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    console.log('Running in development mode');
    // Try to load from dev server with better error handling
    const loadDevURL = (port: number, retryCount = 0) => {
      const url = `http://localhost:${port}`;
      console.log(`Trying to load: ${url} (attempt ${retryCount + 1})`);
      
      mainWindow!.loadURL(url).then(() => {
        console.log(`Successfully loaded: ${url}`);
        mainWindow!.webContents.openDevTools();
      }).catch((error) => {
        console.log(`Failed to load ${url}:`, error.message);
        
        // Retry logic with exponential backoff
        if (retryCount < 3) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
          console.log(`Retrying in ${delay}ms...`);
          setTimeout(() => loadDevURL(port, retryCount + 1), delay);
        } else {
          console.log('All ports failed, loading fallback HTML');
          const candidatePaths = [
            path.join(__dirname, '../web/index.html'),
            path.join(__dirname, '../dist/index.html'),
            path.join(__dirname, '../index.html'),
            path.join(__dirname, '../../index.html'),
          ];
          const found = candidatePaths.find(p => {
            try { return fs.existsSync(p); } catch { return false; }
          });
          if (found) {
            console.log('Loading fallback file:', found);
            mainWindow!.loadFile(found).catch((error) => {
              console.error('Failed to load fallback HTML:', error);
              mainWindow!.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>`);
            });
          } else {
            console.warn('No fallback index.html found. Loading data URL.');
            mainWindow!.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>`);
          }
        }
      });
    };
    
    // Only try Electron dev server port 5173
    setTimeout(() => loadDevURL(5173), 500);
  } else {
    console.log('Running in production mode');
    const prodCandidates = [
      path.join(__dirname, '../web/index.html'),
      path.join(__dirname, '../dist/index.html')
    ];
    const found = prodCandidates.find(p => {
      try { return fs.existsSync(p); } catch { return false; }
    });
    if (found) {
      console.log('Loading production file:', found);
      mainWindow.loadFile(found);
    } else {
      console.error('No production index.html found at', prodCandidates);
      mainWindow.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>`);
    }
  }

  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded successfully');
  });
  // Extra crash/instrumentation hooks
  try {
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      console.error('[electron] render-process-gone', details);
    });
    mainWindow.webContents.on('unresponsive', () => {
      console.error('[electron] webContents became unresponsive');
    });
    mainWindow.webContents.on('media-started-playing', () => {
      console.log('[electron] media-started-playing');
    });
    mainWindow.webContents.on('media-paused', () => {
      console.log('[electron] media-paused');
    });
  } catch {}

  // Handle window errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMirrorWindow() {
  if (mirrorWindow && !mirrorWindow.isDestroyed()) {
    mirrorWindow.focus();
    return;
  }
  
  // Note: Window will be resized to canvas dimensions by the renderer
  // via resize-mirror-window IPC call

  mirrorWindow = new BrowserWindow({
    width: 1920, // Start with standard HD size; will be resized to canvas dimensions
    height: 1080, // Start with standard HD size; will be resized to canvas dimensions
    title: 'sonomika',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'mirror-preload.js'),
      backgroundThrottling: false
    },
    show: false,
    resizable: true, // Allow resizing
    maximizable: true, // Allow maximizing
    fullscreen: false,
    kiosk: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    focusable: true,
    movable: true,
    frame: false, // Keep borderless but add custom controls
    titleBarStyle: 'hidden',
    transparent: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    minWidth: 480, // Minimum size
    minHeight: 270
  });

  // Create HTML content for the mirror window
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>sonomika</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
          font-family: monospace;
        }
        /* Make the background draggable */
        body::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          -webkit-app-region: drag;
          z-index: 0;
        }
        img {
          width: 100%;
          height: 100%;
          object-fit: contain; /* Changed from cover to contain to show full canvas */
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          image-rendering: pixelated; /* Prefer crisp scaling */
          transition: opacity 0.1s ease-in-out;
          -webkit-app-region: drag; /* Make image draggable */
          position: relative;
          z-index: 1;
        }
        
        /* When in fullscreen, use contain to avoid letterboxing */
        body:fullscreen img,
        body:-webkit-full-screen img {
          object-fit: contain;
        }
        .no-stream {
          color: #fff;
          text-align: center;
          font-size: 14px;
          -webkit-app-region: no-drag; /* Don't drag when clicking text */
          position: relative;
          z-index: 1;
        }
        #mirror-image {
          opacity: 0;
          transition: opacity 0.2s ease-in-out;
        }
        #mirror-image.loaded {
          opacity: 1;
        }
        /* Custom resize handles */
        .resize-handle {
          position: absolute;
          background: transparent;
          z-index: 1000;
          -webkit-app-region: no-drag; /* Prevent dragging on resize handles */
        }
        .resize-handle.nw { top: 0; left: 0; width: 10px; height: 10px; cursor: nw-resize; }
        .resize-handle.ne { top: 0; right: 0; width: 10px; height: 10px; cursor: ne-resize; }
        .resize-handle.sw { bottom: 0; left: 0; width: 10px; height: 10px; cursor: sw-resize; }
        .resize-handle.se { bottom: 0; right: 0; width: 10px; height: 10px; cursor: se-resize; }
        .resize-handle.n { top: 0; left: 10px; right: 10px; height: 10px; cursor: n-resize; }
        .resize-handle.s { bottom: 0; left: 10px; right: 10px; height: 10px; cursor: s-resize; }
        .resize-handle.w { left: 0; top: 10px; bottom: 10px; width: 10px; cursor: w-resize; }
        .resize-handle.e { right: 0; top: 10px; bottom: 10px; width: 10px; cursor: e-resize; }
      </style>
    </head>
    <body ondblclick="toggleFullscreen()">
      <div id="no-stream" class="no-stream">Waiting for stream...</div>
      <img id="mirror-image" style="display: none;" onload="this.classList.add('loaded');" onclick="handleImageClick(event)" ondblclick="handleImageDoubleClick(event)">
      
      <!-- Resize handles -->
      <div class="resize-handle nw"></div>
      <div class="resize-handle ne"></div>
      <div class="resize-handle sw"></div>
      <div class="resize-handle se"></div>
      <div class="resize-handle n"></div>
      <div class="resize-handle s"></div>
      <div class="resize-handle w"></div>
      <div class="resize-handle e"></div>
      
      <script>
        let isFullSize = false;
        
        function toggleFullscreen() {
          // Send message to main process to toggle fullscreen
          if (window.mirrorAPI && window.mirrorAPI.toggleFullscreen) {
            window.mirrorAPI.toggleFullscreen();
          }
        }
        
        function handleImageClick(event) {
          // Prevent dragging when clicking on the image
          event.stopPropagation();
        }
        
        function handleImageDoubleClick(event) {
          // Prevent dragging when double-clicking on the image
          event.stopPropagation();
          
          // Toggle between canvas size and full size
          if (window.mirrorAPI && window.mirrorAPI.resizeMirrorWindow) {
            if (isFullSize) {
              // Switch back to canvas size (will be sent by renderer)
              // For now, use a reasonable default that will be updated
              window.mirrorAPI.resizeMirrorWindow(1920, 1080);
              isFullSize = false;
            } else {
              // Switch to full size
              window.mirrorAPI.resizeMirrorWindow(1920, 1080);
              isFullSize = true;
            }
          }
        }
      </script>
    </body>
    </html>
  `;

  mirrorWindow.loadURL(`data:text/html,${encodeURIComponent(htmlContent)}`);

  mirrorWindow.once('ready-to-show', () => {
    mirrorWindow!.show();
    mirrorWindow!.center();
    // Apply a safe default aspect ratio until renderer provides composition ratio
    // The renderer will send the actual canvas dimensions via set-mirror-aspect
    try { mirrorWindow!.setAspectRatio(mirrorAspectRatio || (1920 / 1080)); } catch {}
    try {
      if (mirrorPowerSaveBlockId == null) {
        mirrorPowerSaveBlockId = powerSaveBlocker.start('prevent-display-sleep');
      }
      mirrorWindow!.webContents.setBackgroundThrottling(false);
    } catch {}
  });

  // Handle keyboard events for the mirror window
  mirrorWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      mirrorWindow!.close();
    }
  });

  mirrorWindow.on('closed', () => {
    try { if (mirrorPowerSaveBlockId != null) { powerSaveBlocker.stop(mirrorPowerSaveBlockId); } } catch {}
    mirrorPowerSaveBlockId = null;
    
    // Notify main app that mirror window was closed
    console.log('Mirror window closed, notifying main app');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mirror-window-closed');
    }
    mirrorWindow = null;
  });
}

function closeMirrorWindow() {
  if (mirrorWindow && !mirrorWindow.isDestroyed()) {
    mirrorWindow.close();
    mirrorWindow = null;
  }
}

function createAdvancedMirrorWindow(id: string, opts?: { width?: number; height?: number; x?: number; y?: number; title?: string }) {
  // Reuse if exists
  const existing = advancedMirrorWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    try { existing.focus(); } catch {}
    return existing;
  }

  // Resolve preload: prefer mirror-preload.js if present, else fall back to preload.js
  const mirrorPreload = path.join(__dirname, 'mirror-preload.js');
  const fallbackPreload = path.join(__dirname, 'preload.js');
  const preloadPath = fs.existsSync(mirrorPreload) ? mirrorPreload : fallbackPreload;

  const win = new BrowserWindow({
    width: opts?.width ?? 960,
    height: opts?.height ?? 540,
    x: opts?.x,
    y: opts?.y,
    title: opts?.title ?? `VJ Mirror Slice: ${id}`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: preloadPath
    },
    show: false,
    resizable: true,
    maximizable: true,
    fullscreen: false,
    kiosk: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    focusable: true,
    movable: true,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    thickFrame: false,
    hasShadow: false,
    backgroundColor: '#000000',
    fullscreenable: true,
    autoHideMenuBar: true,
    minWidth: 320,
    minHeight: 180
  });

  // Remove all chrome: no menu bar on slice windows
  try { win.setMenuBarVisibility(false); } catch {}
  try { win.removeMenu(); } catch {}

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${(opts?.title ?? `VJ Mirror Slice: ${id}`)}</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
          font-family: monospace;
        }
        /* Make the background draggable */
        body::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          -webkit-app-region: drag;
          z-index: 0;
        }
        img { width: 100%; height: 100%; object-fit: cover; image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; transition: opacity 0.1s ease-in-out; -webkit-app-region: drag; position: relative; z-index: 1; }
        #mirror-image { opacity: 0; transition: opacity 0.2s ease-in-out; }
        #mirror-image.loaded { opacity: 1; }
      </style>
    </head>
    <body ondblclick="toggleFullscreen()">
      <img id="mirror-image" style="display: none;" onload="this.classList.add('loaded');">
      <script>
        function toggleFullscreen() {
          try { window.advancedMirror && window.advancedMirror.toggleSliceFullscreen && window.advancedMirror.toggleSliceFullscreen('${id}'); } catch {}
        }
      <\/script>
    </body>
    </html>
  `;

  win.loadURL(`data:text/html,${encodeURIComponent(htmlContent)}`);
  // Show explicitly to avoid relying on ready-to-show for data URLs
  try { win.show(); win.center(); } catch {}
  win.once('ready-to-show', () => {
    try { if (!win.isVisible()) { win.show(); win.center(); } } catch {}
  });
  win.on('closed', () => {
    advancedMirrorWindows.delete(id);
  });

  // Handle keyboard events for the advanced mirror window
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      win.close();
    }
  });

  advancedMirrorWindows.set(id, win);
  return win;
}

function createCustomMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'VJ App',
      submenu: [
        {
          label: 'About VJ App',
          role: 'about'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'External',
      submenu: [
        {
          label: 'Mirror Window',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-mirror');
            }
          }
        },
        {
          label: 'Advanced Mirror',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-advanced-mirror');
            }
          }
        }
      ]
    },
    {
      label: 'Record',
      submenu: [
        {
          label: 'Record',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('record:start');
            }
          }
        },
        {
          label: 'Record Settings',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('record:settings');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Mirror Window',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-mirror');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        }
      ]
    },
    {
      label: 'Developer',
      submenu: [
        {
          label: 'Toggle Debug Overlay',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            try { mainWindow?.webContents.send('debug:toggleOverlay'); } catch {}
          }
        },
        {
          label: 'Show Debug Panel',
          accelerator: 'CmdOrCtrl+Alt+D',
          click: () => {
            try { mainWindow?.webContents.send('debug:openPanel'); } catch {}
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  console.log('Electron app is ready');
  try {
    // Allow audio playback without a user gesture to avoid play() stalls
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  } catch {}
  
  // Prevent app from pausing when windows lose focus
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  
  // Create custom menu
  createCustomMenu();

  // Load persisted auth store
  loadEncryptedAuthStoreFromDisk();
  
  // Register protocol for local file access
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const filePath = request.url.replace('local-file://', '');
    console.log('Loading local file:', filePath);
    console.log('Request URL:', request.url);
    console.log('File path resolved:', filePath);
    callback(filePath);
  });
  
  // Set up IPC handlers
  ipcMain.handle('show-open-dialog', async (event, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow!, options);
    return result;
  });

  ipcMain.handle('show-save-dialog', async (event, options: Electron.SaveDialogOptions) => {
    console.log('Show save dialog called with options:', options);
    const result = await dialog.showSaveDialog(mainWindow!, options);
    console.log('Save dialog result:', result);
    return result;
  });

  ipcMain.handle('save-file', async (event, filePath: string, content: string) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf8');
      return true;
    } catch (e) {
      console.error('Failed to save file:', e);
      return false;
    }
  });

  ipcMain.handle('save-binary-file', async (event, filePath: string, data: Uint8Array) => {
    try {
      console.log('Saving binary file to:', filePath, 'Size:', data.length, 'bytes');
      await fs.promises.writeFile(filePath, Buffer.from(data));
      console.log('Binary file saved successfully');
      return true;
    } catch (e) {
      console.error('Failed to save binary file:', e);
      return false;
    }
  });

  // Offline render: save frames then stitch to MP4
  const os = require('os');
  const { spawn } = require('child_process');
  const ffmpegPath = (() => { 
    try { 
      const p = require('ffmpeg-static'); 
      console.log('[offline] ffmpeg-static path:', p);
      return p; 
    } catch (e) { 
      console.warn('[offline] ffmpeg-static not found');
      return null; 
    } 
  })();
  let offlineSession: null | { dir: string; name: string; fps: number; index: number; width: number; height: number; quality?: 'low'|'medium'|'high' } = null;
  let offlineAudioPath: string | null = null;

  ipcMain.handle('offline-render:start', async (_e, opts: { name: string; fps: number; width: number; height: number; quality?: 'low'|'medium'|'high' }) => {
    try {
      const base = path.join(app.getPath('userData'), 'offline-renders');
      const dir = path.join(base, `${Date.now()}_${(opts?.name||'movie').replace(/[^a-z0-9_-]/ig,'_')}`);
      await fs.promises.mkdir(dir, { recursive: true });
      offlineSession = { dir, name: String(opts?.name || 'movie'), fps: Number(opts?.fps)||0, index: 0, width: Number(opts?.width)||1920, height: Number(opts?.height)||1080, quality: (opts?.quality || 'medium') };
      offlineAudioPath = null;
      console.log('[offline] start', { dir, fps: offlineSession.fps || 'preview', quality: offlineSession.quality, size: `${offlineSession.width}x${offlineSession.height}` });
      return { success: true, dir };
    } catch (e) {
      console.error('[offline] start error', e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('offline-render:frame', async (_e, payload: { dataUrl: string }) => {
    if (!offlineSession) return { success: false, error: 'No session' };
    try {
      const p = offlineSession;
      const file = path.join(p.dir, `frame_${String(p.index).padStart(6,'0')}.png`);
      const base64 = String(payload?.dataUrl || '').replace(/^data:image\/png;base64,/, '');
      await fs.promises.writeFile(file, Buffer.from(base64, 'base64'));
      p.index += 1;
      if (p.index % 60 === 0) { console.log('[offline] saved frames:', p.index); }
      return { success: true, index: p.index };
    } catch (e) {
      console.error('[offline] frame error', e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('offline-render:finish', async (_e, payload: { audioPath?: string; destPath?: string; fps?: number }) => {
    if (!offlineSession) return { success: false, error: 'No session' };
    const p = offlineSession; offlineSession = null;
    try {
      if (!p || !isFinite(p.index) || p.index <= 0) {
        return { success: false, error: 'No frames captured' };
      }
      if (!ffmpegPath) throw new Error('ffmpeg-static not found');
      // Destination: use user-selected path when provided
      const desired = (payload?.destPath && typeof payload.destPath === 'string') ? String(payload.destPath) : '';
      const outFile = desired && desired.trim().length > 0
        ? (desired.toLowerCase().endsWith('.mp4') ? desired : `${desired}.mp4`)
        : path.join(p.dir, `${p.name}.mp4`);
      const outDir = path.dirname(outFile);
      try { await fs.promises.mkdir(outDir, { recursive: true }); } catch {}
      // Build ffmpeg args: read PNG sequence -> H.264 MP4
      const inputPattern = path.join(outDir, 'frame_%06d.png');
      // IMPORTANT: input frames are always in p.dir
      const inputFrames = path.join(p.dir, 'frame_%06d.png');
      const fpsOverride = Number(payload?.fps) || 0;
      const effectiveFps = fpsOverride > 0 ? fpsOverride : (p.fps && p.fps > 0 ? p.fps : 0);
      // Prefer glob pattern to tolerate dropped frame indices
      const globPattern = path.join(p.dir, 'frame_*.png').replace(/\\/g, '/');
      const args = [
        '-y',
        // Use measured/override fps when available to match preview timing
        ...(effectiveFps > 0 ? ['-framerate', String(effectiveFps)] : []),
        '-safe', '0',
        '-pattern_type', 'glob',
        '-i', globPattern,
      ];
      let audioInput = undefined as unknown as string; // Temporarily disable audio mux to restore working export
      // If we have an audio path, wait briefly for it to be written (>0 bytes)
      const fileReady = async (fp: string) => {
        try { const st = await fs.promises.stat(fp); return st.isFile() && st.size > 0; } catch { return false; }
      };
      if (audioInput) {
        try {
          for (let i = 0; i < 15; i++) {
            if (await fileReady(audioInput)) break;
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!(await fileReady(audioInput))) {
            console.warn('[offline] audio not ready, skipping audio mux');
            audioInput = undefined as unknown as string;
          }
        } catch {
          audioInput = undefined as unknown as string;
        }
      }
      if (audioInput) {
        args.push('-i', audioInput, '-shortest');
      }
      // Map quality to CRF
      const crf = p.quality === 'high' ? '16' : p.quality === 'low' ? '24' : '18';
      args.push(
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', crf,
        outFile
      );
      const runFfmpeg = (argv: string[]) => new Promise<void>((resolve, reject) => {
        console.log('[offline] finish: spawning ffmpeg', ffmpegPath, argv.join(' '));
        const proc = spawn(ffmpegPath, argv, { stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: true });
        let errBuf = '';
        proc.stderr?.on('data', (d: Buffer) => { try { const t = d.toString(); errBuf += t; console.log('[ffmpeg]', t.trim()); } catch {} });
        proc.on('error', reject);
        proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${errBuf.split('\n').slice(-6).join('\n')}`)));
      });
      try {
        await runFfmpeg(args);
      } catch (err) {
        // Fallback: try video-only if audio caused failure
        if (audioInput) {
          console.warn('[offline] mux with audio failed, retrying without audio');
          const noAudioArgs = args.slice(0, 0);
          // rebuild without audio input (-i audio ... -shortest)
          const baseArgs: string[] = [
            '-y',
            ...(effectiveFps > 0 ? ['-framerate', String(effectiveFps)] : []),
            '-safe', '0',
            '-pattern_type', 'glob',
            '-i', globPattern,
            '-pix_fmt', 'yuv420p',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', crf,
            outFile
          ];
          await runFfmpeg(baseArgs);
        } else {
          throw err;
        }
      }
      console.log('[offline] finished. Video at', outFile);
      try { if (offlineAudioPath) { await fs.promises.unlink(offlineAudioPath); } } catch {}
      offlineAudioPath = null;
      return { success: true, videoPath: outFile };
    } catch (e) {
      console.error('[offline] finish error', e);
      return { success: false, error: String(e) };
    }
  });

  // System audio capture for recording
  ipcMain.handle('get-system-audio-stream', async () => {
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      });
      
      if (sources.length === 0) {
        throw new Error('No screen sources available');
      }

      // Get the primary display source
      const primarySource = sources.find((source: any) => source.name === 'Entire Screen') || sources[0];
      
      return {
        success: true,
        sourceId: primarySource.id
      };
    } catch (e) {
      console.error('Failed to get system audio stream:', e);
      return {
        success: false,
        error: String(e)
      };
    }
  });

  ipcMain.handle('read-file-text', async (event, filePath: string) => {
    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      return data;
    } catch (e) {
      console.error('Failed to read file:', e);
      return null;
    }
  });
  ipcMain.handle('read-local-file-base64', async (event, filePath: string) => {
    try {
      const data = await fs.promises.readFile(filePath);
      return data.toString('base64');
    } catch (err: any) {
      console.error('Failed to read local file:', filePath, err);
      throw err;
    }
  });

  // Efficient raw byte reader for audio analysis and Blob URLs
  ipcMain.handle('read-audio-bytes', async (_e, urlOrPath: string) => {
    try {
      const { fileURLToPath } = require('url');
      const asPath = typeof urlOrPath === 'string' && urlOrPath.startsWith('file:')
        ? fileURLToPath(urlOrPath)
        : urlOrPath;
      const buf: Buffer = await fs.promises.readFile(asPath);
      // Return ArrayBuffer view of Buffer without extra copy
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (err) {
      console.error('read-audio-bytes failed for', urlOrPath, err);
      // Return empty ArrayBuffer on failure
      return new ArrayBuffer(0);
    }
  });

  // Secure auth storage via safeStorage
  ipcMain.handle('authStorage:isEncryptionAvailable', () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  });

  // Synchronous variants for storage adapter compatibility
  ipcMain.on('authStorage:isEncryptionAvailableSync', (event) => {
    try {
      event.returnValue = safeStorage.isEncryptionAvailable();
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.handle('authStorage:save', async (event, key: string, plainText: string) => {
    try {
      if (!key) return false;
      if (plainText === undefined || plainText === null || plainText === '') {
        delete encryptedAuthStore[key];
        persistEncryptedAuthStoreToDisk();
        return true;
      }
      if (safeStorage.isEncryptionAvailable()) {
        encryptedAuthStore[key] = safeStorage.encryptString(plainText);
      } else {
        encryptedAuthStore[key] = Buffer.from(plainText, 'utf8');
      }
      persistEncryptedAuthStoreToDisk();
      return true;
    } catch (e) {
      console.error('Failed to save auth blob:', e);
      return false;
    }
  });

  ipcMain.on('authStorage:saveSync', (event, key: string, plainText: string) => {
    try {
      if (!key) { event.returnValue = false; return; }
      if (plainText === undefined || plainText === null || plainText === '') {
        delete encryptedAuthStore[key];
        persistEncryptedAuthStoreToDisk();
        event.returnValue = true;
        return;
      }
      if (safeStorage.isEncryptionAvailable()) {
        encryptedAuthStore[key] = safeStorage.encryptString(plainText);
      } else {
        encryptedAuthStore[key] = Buffer.from(plainText, 'utf8');
      }
      persistEncryptedAuthStoreToDisk();
      event.returnValue = true;
    } catch (e) {
      console.error('Failed to save auth blob (sync):', e);
      event.returnValue = false;
    }
  });

  ipcMain.handle('authStorage:load', async (event, key: string) => {
    try {
      if (!key) return null;
      const buf = encryptedAuthStore[key];
      if (!buf) return null;
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf);
      }
      return buf.toString('utf8');
    } catch (e) {
      console.error('Failed to load auth blob:', e);
      return null;
    }
  });

  ipcMain.on('authStorage:loadSync', (event, key: string) => {
    try {
      if (!key) { event.returnValue = null; return; }
      const buf = encryptedAuthStore[key];
      if (!buf) { event.returnValue = null; return; }
      if (safeStorage.isEncryptionAvailable()) {
        event.returnValue = safeStorage.decryptString(buf);
      } else {
        event.returnValue = buf.toString('utf8');
      }
    } catch (e) {
      console.error('Failed to load auth blob (sync):', e);
      event.returnValue = null;
    }
  });

  ipcMain.handle('authStorage:remove', async (event, key: string) => {
    try {
      if (!key) return false;
      delete encryptedAuthStore[key];
      persistEncryptedAuthStoreToDisk();
      return true;
    } catch (e) {
      console.error('Failed to remove auth blob:', e);
      return false;
    }
  });

  ipcMain.on('authStorage:removeSync', (event, key: string) => {
    try {
      if (!key) { event.returnValue = false; return; }
      delete encryptedAuthStore[key];
      persistEncryptedAuthStoreToDisk();
      event.returnValue = true;
    } catch (e) {
      console.error('Failed to remove auth blob (sync):', e);
      event.returnValue = false;
    }
  });

  ipcMain.handle('authStorage:loadAll', async () => {
    try {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(encryptedAuthStore)) {
        try {
          if (safeStorage.isEncryptionAvailable()) {
            result[k] = safeStorage.decryptString(v);
          } else {
            result[k] = v.toString('utf8');
          }
        } catch {}
      }
      return result;
    } catch (e) {
      console.error('Failed to loadAll auth blobs:', e);
      return {} as Record<string, string>;
    }
  });

  // App (main window) fullscreen toggle that covers taskbar on Windows
  ipcMain.on('toggle-app-fullscreen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { screen } = require('electron');
      if (mainWindow.isKiosk() || mainWindow.isFullScreen()) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setBounds({ width: 1200, height: 800 });
        mainWindow.center();
      } else {
        const bounds = mainWindow.getBounds();
        const display = screen.getDisplayMatching(bounds);
        mainWindow.setBounds({
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height
        });
        mainWindow.setMenuBarVisibility(false);
        mainWindow.setFullScreenable(true);
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setKiosk(true);
        mainWindow.setFullScreen(true);
      }
    }
  });

  ipcMain.on('window-minimize', () => {
    console.log('Main: window-minimize IPC received');
    if (mainWindow) {
      console.log('Main: calling mainWindow.minimize()');
      mainWindow.minimize();
    } else {
      console.log('Main: mainWindow is null');
    }
  });
  
  ipcMain.on('window-maximize', () => {
    console.log('Main: window-maximize IPC received');
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        console.log('Main: calling mainWindow.unmaximize()');
        mainWindow.unmaximize();
        try { mainWindow.webContents.send('window-state', { maximized: false }); } catch {}
      } else {
        console.log('Main: calling mainWindow.maximize()');
        mainWindow.maximize();
        try { mainWindow.webContents.send('window-state', { maximized: true }); } catch {}
      }
    } else {
      console.log('Main: mainWindow is null');
    }
  });
  
  ipcMain.on('window-close', () => {
    console.log('Main: window-close IPC received');
    if (mainWindow) {
      console.log('Main: calling mainWindow.close()');
      mainWindow.close();
    } else {
      console.log('Main: mainWindow is null');
    }
  });
  
  ipcMain.on('toggle-mirror', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-mirror');
    }
  });

  ipcMain.on('open-mirror-window', () => {
    createMirrorWindow();
  });

  ipcMain.on('close-mirror-window', () => {
    closeMirrorWindow();
  });

  // Allow renderer to set mirror window background to match composition
  ipcMain.on('set-mirror-bg', (event, color: string) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      const safe = typeof color === 'string' ? color.replace(/'/g, "\\'") : '#000000';
      mirrorWindow.webContents.executeJavaScript(`document.body.style.background='${safe}'`);
    }
  });

  ipcMain.on('canvas-data', (event, dataUrl) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      // Forward to mirror renderer via IPC handled in mirror preload
      mirrorWindow.webContents.send('update-canvas', dataUrl);
    }
  });

  // Handle sendCanvasData from CanvasStream (update DOM directly to avoid preload mismatch)
  ipcMain.on('sendCanvasData', (event, dataUrl) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      try {
        const escaped = (typeof dataUrl === 'string' ? dataUrl : '').replace(/'/g, "\\'");
        mirrorWindow.webContents.executeJavaScript(`
          (function(){
            try {
              var noStream = document.getElementById('no-stream');
              var img = document.getElementById('mirror-image');
              if (noStream) noStream.style.display = 'none';
              if (img) {
                if (img.src !== '${escaped}') {
                  img.src = '${escaped}';
                  img.style.display = 'block';
                }
              }
            } catch(e) {}
          })();
        `);
      } catch {}
    }
  });

  // Handle fullscreen toggle from mirror window (cover taskbar)
  ipcMain.on('toggle-fullscreen', () => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      const { screen } = require('electron');
      if (mirrorWindow.isKiosk() || mirrorWindow.isFullScreen()) {
        // Exit full coverage
        mirrorWindow.setKiosk(false);
        mirrorWindow.setFullScreen(false);
        try { mirrorWindow.setVisibleOnAllWorkspaces(false); } catch {}
        try { mirrorWindow.setAlwaysOnTop(true); } catch {}
        // Restore to canvas dimensions when exiting fullscreen
        // The renderer will send the actual canvas size via resize-mirror-window
        mirrorWindow.setBounds({
          x: undefined as unknown as number,
          y: undefined as unknown as number,
          width: 1920, // Will be updated by renderer
          height: 1080 // Will be updated by renderer
        });
        try { mirrorWindow.center(); } catch {}
        try { mirrorWindow.focus(); } catch {}
      } else {
        // Ensure we target the display where the mirror window currently is
        const bounds = mirrorWindow.getBounds();
        const display = screen.getDisplayMatching(bounds);
        // Move and size to full display bounds (not workArea) to cover taskbar, then enter kiosk+fullscreen
        mirrorWindow.setBounds({
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height
        });
        try { mirrorWindow.setMenuBarVisibility(false); } catch {}
        try { mirrorWindow.setFullScreenable(true); } catch {}
        try {
          if (process.platform === 'darwin') {
            (mirrorWindow as any).setAlwaysOnTop(true, 'screen-saver');
          } else {
            mirrorWindow.setAlwaysOnTop(true);
          }
        } catch {}
        try { mirrorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
        try { (mirrorWindow as any).moveTop?.(); } catch {}
        try { mirrorWindow.show(); } catch {}
        try { mirrorWindow.focus(); } catch {}
        mirrorWindow.setKiosk(true);
        mirrorWindow.setFullScreen(true);
        try { (mirrorWindow as any).moveTop?.(); } catch {}
        try { mirrorWindow.focus(); } catch {}
      }
    }
  });

  // Handle mirror window resize
  ipcMain.on('resize-mirror-window', (event, width: number, height: number) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      try {
        let targetW = Math.max(1, Number(width) || 1);
        let targetH = Math.max(1, Number(height) || 1);
        
        // Get screen dimensions to ensure window fits
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workArea;
        const maxW = Math.floor(workArea.width * 0.9); // 90% of work area width
        const maxH = Math.floor(workArea.height * 0.9); // 90% of work area height
        
        // Calculate aspect ratio
        const aspectRatio = targetW / targetH;
        
        // Scale down if window is too large while maintaining aspect ratio
        if (targetW > maxW || targetH > maxH) {
          const scaleW = maxW / targetW;
          const scaleH = maxH / targetH;
          const scale = Math.min(scaleW, scaleH);
          targetW = Math.floor(targetW * scale);
          targetH = Math.floor(targetH * scale);
        }
        
        // Ensure minimum size
        targetW = Math.max(480, targetW);
        targetH = Math.max(270, targetH);
        
        if (mirrorAspectRatio && isFinite(mirrorAspectRatio) && mirrorAspectRatio > 0) {
          // Enforce aspect on programmatic resizes (prefer width as source of truth)
          targetH = Math.max(1, Math.round(targetW / mirrorAspectRatio));
        }
        
        console.log('Resizing mirror window to:', targetW, 'x', targetH, '(aspect locked:', !!mirrorAspectRatio, ')');
        mirrorWindow.setSize(targetW, targetH);
      } catch {}
      mirrorWindow.center();
    }
  });

  // Allow renderer to enforce a fixed aspect ratio on the mirror window
  ipcMain.on('set-mirror-aspect', (event, width: number, height: number) => {
    try {
      const w = Math.max(1, Number(width) || 1);
      const h = Math.max(1, Number(height) || 1);
      const ratio = w / h;
      mirrorAspectRatio = ratio;
      outputAspectRatio = ratio;
      if (mirrorWindow && !mirrorWindow.isDestroyed()) {
        try { mirrorWindow.setAspectRatio(ratio); } catch {}
      }
      if (outputWindow && !outputWindow.isDestroyed()) {
        try { outputWindow.setAspectRatio(ratio); } catch {}
      }
    } catch {}
  });

  // Advanced mirror IPC
  ipcMain.on('advanced-mirror:open', (event, slices: Array<{ id: string; title?: string; width?: number; height?: number; x?: number; y?: number }>) => {
    try {
      console.log('[main] advanced-mirror:open', Array.isArray(slices) ? slices.map(s => s?.id) : slices);
      if (Array.isArray(slices)) {
        for (const s of slices) {
          console.log('[main] createAdvancedMirrorWindow', s?.id);
          createAdvancedMirrorWindow(String(s.id), s);
        }
      }
    } catch (e) {
      console.warn('advanced-mirror:open error', e);
    }
  });

  ipcMain.on('advanced-mirror:closeAll', () => {
    try {
      advancedMirrorWindows.forEach((win, id) => {
        try { if (!win.isDestroyed()) win.close(); } catch {}
        advancedMirrorWindows.delete(id);
      });
    } catch (e) {
      console.warn('advanced-mirror:closeAll error', e);
    }
  });

  ipcMain.on('advanced-mirror:sendSliceData', (event, id: string, dataUrl: string) => {
    // console.log('[main] advanced-mirror:sendSliceData', id, dataUrl?.length);
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      const escaped = (typeof dataUrl === 'string' ? dataUrl : '').replace(/'/g, "\\'");
      win.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${escaped}') {
              mirrorImage.src = '${escaped}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `);
    }
  });

  ipcMain.on('advanced-mirror:setBg', (event, id: string, color: string) => {
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      const safe = typeof color === 'string' ? color.replace(/'/g, "\\'") : '#000000';
      win.webContents.executeJavaScript(`document.body.style.background='${safe}'`);
    }
  });

  ipcMain.on('advanced-mirror:resize', (event, id: string, width: number, height: number) => {
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      try { win.setSize(width, height); win.center(); } catch {}
    }
  });

  ipcMain.on('advanced-mirror:toggleFullscreen', (event, id: string) => {
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      const { screen } = require('electron');
      if (win.isKiosk() || win.isFullScreen()) {
        try {
          win.setKiosk(false);
          win.setFullScreen(false);
          win.setBounds({ width: 960, height: 540 });
          win.center();
        } catch {}
      } else {
        try {
          const bounds = win.getBounds();
          const display = screen.getDisplayMatching(bounds);
          win.setBounds({ x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height });
          win.setMenuBarVisibility(false);
          win.setFullScreenable(true);
          win.setAlwaysOnTop(true);
          win.setKiosk(true);
          win.setFullScreen(true);
        } catch {}
      }
    }
  });
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
}); 