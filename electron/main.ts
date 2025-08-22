import { app, BrowserWindow, protocol, Menu, ipcMain, safeStorage, dialog } from 'electron';
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
      preload: path.join(__dirname, 'preload.js')
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
        } else if (port < 5180) {
          // Try next port
          setTimeout(() => loadDevURL(port + 1), 1000);
        } else {
          console.log('All ports failed, loading fallback HTML');
          mainWindow!.loadFile(path.join(__dirname, '../index.html')).catch((error) => {
            console.error('Failed to load fallback HTML:', error);
            // Show error page
            mainWindow!.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>`);
          });
        }
      });
    };
    
    // Start with port 5173 after a short delay
    setTimeout(() => loadDevURL(5173), 500);
  } else {
    console.log('Running in production mode');
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded successfully');
  });

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

  mirrorWindow = new BrowserWindow({
    width: 960, // 50% of 1920
    height: 540, // 50% of 1080
    title: 'VJ Mirror Output',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'mirror-preload.js')
    },
    show: false,
    resizable: true, // Allow resizing
    maximizable: true, // Allow maximizing
    fullscreen: false,
    kiosk: false,
    alwaysOnTop: true,
    skipTaskbar: true,
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
      <title>VJ Mirror Output</title>
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
          object-fit: cover;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
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
          font-size: 16px;
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
          
          // Toggle between 50% and full size
          if (window.mirrorAPI && window.mirrorAPI.resizeMirrorWindow) {
            if (isFullSize) {
              // Switch back to 50% size
              window.mirrorAPI.resizeMirrorWindow(960, 540);
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
  });

  // Handle keyboard events for the mirror window
  mirrorWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      mirrorWindow!.close();
    }
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
        },
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
    const result = await dialog.showSaveDialog(mainWindow!, options);
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
      // Use a more efficient update mechanism to prevent glitching
      const escapedDataUrl = dataUrl.replace(/'/g, "\\'");
      mirrorWindow.webContents.executeJavaScript(`
        (function() {
          const noStreamDiv = document.getElementById('no-stream');
          const mirrorImage = document.getElementById('mirror-image');
          
          if (noStreamDiv && mirrorImage) {
            // Hide the waiting message
            noStreamDiv.style.display = 'none';
            
            // Only update if the image source is different to prevent flashing
            if (mirrorImage.src !== '${escapedDataUrl}') {
              mirrorImage.src = '${escapedDataUrl}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `);
    }
  });

  // Handle sendCanvasData from CanvasStream
  ipcMain.on('sendCanvasData', (event, dataUrl) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      // Use a more efficient update mechanism to prevent glitching
      const escapedDataUrl = dataUrl.replace(/'/g, "\\'");
      mirrorWindow.webContents.executeJavaScript(`
        (function() {
          const noStreamDiv = document.getElementById('no-stream');
          const mirrorImage = document.getElementById('mirror-image');
          
          if (noStreamDiv && mirrorImage) {
            // Hide the waiting message
            noStreamDiv.style.display = 'none';
            
            // Only update if the image source is different to prevent flashing
            if (mirrorImage.src !== '${escapedDataUrl}') {
              mirrorImage.src = '${escapedDataUrl}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `);
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
        // Restore reasonable size when exiting
        mirrorWindow.setBounds({
          x: undefined as unknown as number,
          y: undefined as unknown as number,
          width: 960,
          height: 540
        });
        mirrorWindow.center();
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
        mirrorWindow.setMenuBarVisibility(false);
        mirrorWindow.setFullScreenable(true);
        mirrorWindow.setAlwaysOnTop(true);
        mirrorWindow.setKiosk(true);
        mirrorWindow.setFullScreen(true);
      }
    }
  });

  // Handle mirror window resize
  ipcMain.on('resize-mirror-window', (event, width: number, height: number) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      console.log('Resizing mirror window to:', width, 'x', height);
      mirrorWindow.setSize(width, height);
      mirrorWindow.center();
    }
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