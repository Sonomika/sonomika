import { app, BrowserWindow } from 'electron';
import path from 'path';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Check if we're in development mode
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    console.log('Running in development mode');
    // Try to load from dev server
    const loadDevURL = (port: number) => {
      const url = `http://localhost:${port}`;
      console.log(`Trying to load: ${url}`);
      
      mainWindow.loadURL(url).catch((error) => {
        console.log(`Failed to load ${url}:`, error.message);
        // Try next port
        if (port < 5180) {
          setTimeout(() => loadDevURL(port + 1), 1000);
        } else {
          console.log('All ports failed, loading fallback HTML');
          mainWindow.loadFile(path.join(__dirname, '../index.html'));
        }
      });
    };
    
    // Start with port 5173
    setTimeout(() => loadDevURL(5173), 1000);
    mainWindow.webContents.openDevTools();
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
}

app.whenReady().then(() => {
  console.log('Electron app is ready');
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