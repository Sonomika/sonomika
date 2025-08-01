import { app, BrowserWindow, protocol } from 'electron';
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

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    show: false, // Don't show until ready
  });

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

app.whenReady().then(() => {
  console.log('Electron app is ready');
  
  // Register protocol for local file access
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const filePath = request.url.replace('local-file://', '');
    console.log('Loading local file:', filePath);
    console.log('Request URL:', request.url);
    console.log('File path resolved:', filePath);
    callback(filePath);
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