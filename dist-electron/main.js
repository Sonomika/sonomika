"use strict";
const electron = require("electron");
const path = require("path");
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("Another instance is already running, quitting...");
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    const windows = electron.BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      if (windows[0].isMinimized()) windows[0].restore();
      windows[0].focus();
    }
  });
}
let mainWindow = null;
let mirrorWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    // Remove default window frame
    titleBarStyle: "hidden",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, "preload.js")
    },
    show: false
    // Don't show until ready
  });
  const preloadPath = path.join(__dirname, "preload.js");
  console.log("Preload script path:", preloadPath);
  console.log("Preload script exists:", require("fs").existsSync(preloadPath));
  if (require("fs").existsSync(preloadPath)) {
    const preloadContent = require("fs").readFileSync(preloadPath, "utf8");
    console.log("Preload script first 200 chars:", preloadContent.substring(0, 200));
  }
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    console.log("Setting CSP headers for URL:", details.url);
    const responseHeaders = {
      ...details.responseHeaders,
      "Content-Security-Policy": []
    };
    console.log("CSP headers disabled for development");
    callback({
      responseHeaders
    });
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.webContents.setBackgroundThrottling(false);
  });
  const isDev = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
  if (isDev) {
    console.log("Running in development mode");
    const loadDevURL = (port, retryCount = 0) => {
      const url = `http://localhost:${port}`;
      console.log(`Trying to load: ${url} (attempt ${retryCount + 1})`);
      mainWindow.loadURL(url).then(() => {
        console.log(`Successfully loaded: ${url}`);
        mainWindow.webContents.openDevTools();
      }).catch((error) => {
        console.log(`Failed to load ${url}:`, error.message);
        if (retryCount < 3) {
          const delay = Math.min(1e3 * Math.pow(2, retryCount), 5e3);
          console.log(`Retrying in ${delay}ms...`);
          setTimeout(() => loadDevURL(port, retryCount + 1), delay);
        } else if (port < 5180) {
          setTimeout(() => loadDevURL(port + 1), 1e3);
        } else {
          console.log("All ports failed, loading fallback HTML");
          mainWindow.loadFile(path.join(__dirname, "../index.html")).catch((error2) => {
            console.error("Failed to load fallback HTML:", error2);
            mainWindow.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>`);
          });
        }
      });
    };
    setTimeout(() => loadDevURL(5173), 500);
  } else {
    console.log("Running in production mode");
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window loaded successfully");
  });
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error("Failed to load:", errorCode, errorDescription);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function createMirrorWindow() {
  if (mirrorWindow && !mirrorWindow.isDestroyed()) {
    mirrorWindow.focus();
    return;
  }
  mirrorWindow = new electron.BrowserWindow({
    width: 960,
    // 50% of 1920
    height: 540,
    // 50% of 1080
    title: "VJ Mirror Output",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Reverted to true
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, "preload.js")
      // Ensure this is the main preload, not mirror-preload
    },
    show: false,
    resizable: false,
    // Prevent resizing to maintain aspect ratio
    maximizable: false,
    // Prevent maximizing to maintain resolution
    fullscreen: false,
    // Don't open in fullscreen mode
    kiosk: false,
    // Allow escape from fullscreen
    alwaysOnTop: true,
    // Keep mirror window on top
    skipTaskbar: true,
    // Don't show in taskbar
    focusable: true,
    // Allow focusing and moving the window
    movable: true
    // Allow moving the window
  });
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
        img {
          width: 960px;
          height: 540px;
          object-fit: cover;
        }
        .mirror-info {
          position: absolute;
          top: 10px;
          left: 10px;
          color: #fff;
          font-size: 12px;
          background: rgba(0,0,0,0.7);
          padding: 5px 10px;
          border-radius: 4px;
          z-index: 1000;
        }
        .no-stream {
          color: #fff;
          text-align: center;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <div class="mirror-info">VJ Mirror Output (960x540)</div>
      <div id="no-stream" class="no-stream">Waiting for stream...</div>
      <img id="mirror-image" style="display: none;">
    </body>
    </html>
  `;
  mirrorWindow.loadURL(`data:text/html,${encodeURIComponent(htmlContent)}`);
  mirrorWindow.once("ready-to-show", () => {
    mirrorWindow.show();
    mirrorWindow.center();
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(false);
    }
  });
  mirrorWindow.on("closed", () => {
    mirrorWindow = null;
  });
  mirrorWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Escape") {
      mirrorWindow.setFullScreen(false);
      mirrorWindow.close();
    }
  });
  console.log("Mirror window created");
}
function closeMirrorWindow() {
  if (mirrorWindow && !mirrorWindow.isDestroyed()) {
    mirrorWindow.close();
    mirrorWindow = null;
  }
}
function createCustomMenu() {
  const template = [
    {
      label: "VJ App",
      submenu: [
        {
          label: "About VJ App",
          role: "about"
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            electron.app.quit();
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Mirror Window",
          accelerator: "CmdOrCtrl+M",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("toggle-mirror");
            }
          }
        },
        { type: "separator" },
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        {
          label: "Toggle Developer Tools",
          accelerator: "F12",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          accelerator: "CmdOrCtrl+M",
          role: "minimize"
        },
        {
          label: "Close",
          accelerator: "CmdOrCtrl+W",
          role: "close"
        }
      ]
    }
  ];
  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}
electron.app.whenReady().then(() => {
  console.log("Electron app is ready");
  electron.app.commandLine.appendSwitch("disable-background-timer-throttling");
  electron.app.commandLine.appendSwitch("disable-renderer-backgrounding");
  createCustomMenu();
  electron.protocol.registerFileProtocol("local-file", (request, callback) => {
    const filePath = request.url.replace("local-file://", "");
    console.log("Loading local file:", filePath);
    console.log("Request URL:", request.url);
    console.log("File path resolved:", filePath);
    callback(filePath);
  });
  electron.ipcMain.on("window-minimize", () => {
    console.log("Main: window-minimize IPC received");
    if (mainWindow) {
      console.log("Main: calling mainWindow.minimize()");
      mainWindow.minimize();
    } else {
      console.log("Main: mainWindow is null");
    }
  });
  electron.ipcMain.on("window-maximize", () => {
    console.log("Main: window-maximize IPC received");
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        console.log("Main: calling mainWindow.unmaximize()");
        mainWindow.unmaximize();
      } else {
        console.log("Main: calling mainWindow.maximize()");
        mainWindow.maximize();
      }
    } else {
      console.log("Main: mainWindow is null");
    }
  });
  electron.ipcMain.on("window-close", () => {
    console.log("Main: window-close IPC received");
    if (mainWindow) {
      console.log("Main: calling mainWindow.close()");
      mainWindow.close();
    } else {
      console.log("Main: mainWindow is null");
    }
  });
  electron.ipcMain.on("toggle-mirror", () => {
    if (mainWindow) {
      mainWindow.webContents.send("toggle-mirror");
    }
  });
  electron.ipcMain.on("open-mirror-window", () => {
    createMirrorWindow();
  });
  electron.ipcMain.on("close-mirror-window", () => {
    closeMirrorWindow();
  });
  electron.ipcMain.on("canvas-data", (event, dataUrl) => {
    console.log("Main: canvas-data received, sending to mirror window");
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      const escapedDataUrl = dataUrl.replace(/'/g, "\\'");
      mirrorWindow.webContents.executeJavaScript(`
        (function() {
          const noStreamDiv = document.getElementById('no-stream');
          const mirrorImage = document.getElementById('mirror-image');
          
          if (noStreamDiv && mirrorImage) {
            noStreamDiv.style.display = 'none';
            mirrorImage.src = '${escapedDataUrl}';
            mirrorImage.style.display = 'block';
            console.log('Mirror window: image updated successfully');
          } else {
            console.log('Mirror window: elements not found');
          }
        })();
      `);
    }
  });
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
