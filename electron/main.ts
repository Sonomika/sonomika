import { app, BrowserWindow, protocol, Menu, ipcMain } from 'electron';
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
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js')
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
          if (window.electron) {
            window.electron.toggleFullscreen();
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
          if (window.electron) {
            if (isFullSize) {
              // Switch back to 50% size
              window.electron.resizeMirrorWindow(960, 540);
              isFullSize = false;
            } else {
              // Switch to full size
              window.electron.resizeMirrorWindow(1920, 1080);
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
  
  // Register protocol for local file access
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const filePath = request.url.replace('local-file://', '');
    console.log('Loading local file:', filePath);
    console.log('Request URL:', request.url);
    console.log('File path resolved:', filePath);
    callback(filePath);
  });
  
  // Set up IPC handlers
  ipcMain.handle('read-local-file-base64', async (event, filePath: string) => {
    try {
      const data = await fs.promises.readFile(filePath);
      return data.toString('base64');
    } catch (err: any) {
      console.error('Failed to read local file:', filePath, err);
      throw err;
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
      } else {
        console.log('Main: calling mainWindow.maximize()');
        mainWindow.maximize();
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

  // Handle fullscreen toggle from mirror window
  ipcMain.on('toggle-fullscreen', (event) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      if (mirrorWindow.isFullScreen()) {
        mirrorWindow.setFullScreen(false);
      } else {
        // Set the window to 16:9 aspect ratio before going fullscreen
        const display = require('electron').screen.getPrimaryDisplay();
        const { width, height } = display.size;
        
        // Calculate the largest 16:9 rectangle that fits in the screen
        const aspectRatio = 16 / 9;
        let targetWidth = width;
        let targetHeight = width / aspectRatio;
        
        if (targetHeight > height) {
          targetHeight = height;
          targetWidth = height * aspectRatio;
        }
        
        // Set the window size to maintain 16:9 aspect ratio
        mirrorWindow.setSize(Math.floor(targetWidth), Math.floor(targetHeight));
        mirrorWindow.center();
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