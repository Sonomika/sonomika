"use strict";
const electron = require("electron");
const fs = require("fs");
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
let mirrorPowerSaveBlockId = null;
let outputWindow = null;
let outputAspectRatio = null;
let mirrorAspectRatio = null;
const advancedMirrorWindows = /* @__PURE__ */ new Map();
let encryptedAuthStore = {};
function getAuthStoreFilePath() {
  const userData = electron.app.getPath("userData");
  return path.join(userData, "auth_store.json");
}
function loadEncryptedAuthStoreFromDisk() {
  try {
    const fp = getAuthStoreFilePath();
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, "utf8");
      const json = JSON.parse(raw);
      encryptedAuthStore = Object.fromEntries(
        Object.entries(json).map(([k, base64]) => [k, Buffer.from(base64, "base64")])
      );
    }
  } catch (e) {
    console.warn("Failed to load encrypted auth store, starting empty:", e);
    encryptedAuthStore = {};
  }
}
function persistEncryptedAuthStoreToDisk() {
  try {
    const fp = getAuthStoreFilePath();
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const json = Object.fromEntries(
      Object.entries(encryptedAuthStore).map(([k, buf]) => [k, buf.toString("base64")])
    );
    fs.writeFileSync(fp, JSON.stringify(json), "utf8");
  } catch (e) {
    console.warn("Failed to persist encrypted auth store:", e);
  }
}
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
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false
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
  try {
    mainWindow.webContents.setWindowOpenHandler((details) => {
      const isOutput = details.frameName === "output-canvas";
      if (isOutput) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            title: "Output",
            frame: false,
            titleBarStyle: "hidden",
            autoHideMenuBar: true,
            backgroundColor: "#000000",
            fullscreenable: true,
            resizable: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: false,
              backgroundThrottling: false
            }
          }
        };
      }
      return { action: "allow" };
    });
    mainWindow.webContents.on("did-create-window", (childWindow, details) => {
      try {
        if ((details == null ? void 0 : details.frameName) === "output-canvas") {
          outputWindow = childWindow;
          try {
            childWindow.removeMenu();
          } catch {
          }
          try {
            childWindow.setMenuBarVisibility(false);
          } catch {
          }
          try {
            childWindow.webContents.setBackgroundThrottling(false);
          } catch {
          }
          try {
            if (outputAspectRatio && isFinite(outputAspectRatio) && outputAspectRatio > 0) {
              childWindow.setAspectRatio(outputAspectRatio);
            }
          } catch {
          }
          try {
            childWindow.on("closed", () => {
              outputWindow = null;
            });
          } catch {
          }
        }
      } catch {
      }
    });
  } catch {
  }
  mainWindow.on("maximize", () => {
    try {
      mainWindow == null ? void 0 : mainWindow.webContents.send("window-state", { maximized: true });
    } catch {
    }
  });
  mainWindow.on("unmaximize", () => {
    try {
      mainWindow == null ? void 0 : mainWindow.webContents.send("window-state", { maximized: false });
    } catch {
    }
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
        } else {
          console.log("All ports failed, loading fallback HTML");
          const candidatePaths = [
            path.join(__dirname, "../web/index.html"),
            path.join(__dirname, "../dist/index.html"),
            path.join(__dirname, "../index.html"),
            path.join(__dirname, "../../index.html")
          ];
          const found = candidatePaths.find((p) => {
            try {
              return fs.existsSync(p);
            } catch {
              return false;
            }
          });
          if (found) {
            console.log("Loading fallback file:", found);
            mainWindow.loadFile(found).catch((error2) => {
              console.error("Failed to load fallback HTML:", error2);
              mainWindow.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>`);
            });
          } else {
            console.warn("No fallback index.html found. Loading data URL.");
            mainWindow.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>`);
          }
        }
      });
    };
    setTimeout(() => loadDevURL(5173), 500);
  } else {
    console.log("Running in production mode");
    const prodCandidates = [
      path.join(__dirname, "../web/index.html"),
      path.join(__dirname, "../dist/index.html")
    ];
    const found = prodCandidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
    if (found) {
      console.log("Loading production file:", found);
      mainWindow.loadFile(found);
    } else {
      console.error("No production index.html found at", prodCandidates);
      mainWindow.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>`);
    }
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
    width: 1920,
    // Start with standard HD size; will be resized to canvas dimensions
    height: 1080,
    // Start with standard HD size; will be resized to canvas dimensions
    title: "sonomika",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, "mirror-preload.js"),
      backgroundThrottling: false
    },
    show: false,
    resizable: true,
    // Allow resizing
    maximizable: true,
    // Allow maximizing
    fullscreen: false,
    kiosk: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    focusable: true,
    movable: true,
    frame: false,
    // Keep borderless but add custom controls
    titleBarStyle: "hidden",
    transparent: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    minWidth: 480,
    // Minimum size
    minHeight: 270
  });
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
      <\/script>
    </body>
    </html>
  `;
  mirrorWindow.loadURL(`data:text/html,${encodeURIComponent(htmlContent)}`);
  mirrorWindow.once("ready-to-show", () => {
    mirrorWindow.show();
    mirrorWindow.center();
    try {
      mirrorWindow.setAspectRatio(mirrorAspectRatio || 1920 / 1080);
    } catch {
    }
    try {
      if (mirrorPowerSaveBlockId == null) {
        mirrorPowerSaveBlockId = electron.powerSaveBlocker.start("prevent-display-sleep");
      }
      mirrorWindow.webContents.setBackgroundThrottling(false);
    } catch {
    }
  });
  mirrorWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Escape") {
      mirrorWindow.close();
    }
  });
  mirrorWindow.on("closed", () => {
    try {
      if (mirrorPowerSaveBlockId != null) {
        electron.powerSaveBlocker.stop(mirrorPowerSaveBlockId);
      }
    } catch {
    }
    mirrorPowerSaveBlockId = null;
    console.log("Mirror window closed, notifying main app");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mirror-window-closed");
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
function createAdvancedMirrorWindow(id, opts) {
  const existing = advancedMirrorWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    try {
      existing.focus();
    } catch {
    }
    return existing;
  }
  const mirrorPreload = path.join(__dirname, "mirror-preload.js");
  const fallbackPreload = path.join(__dirname, "preload.js");
  const preloadPath = fs.existsSync(mirrorPreload) ? mirrorPreload : fallbackPreload;
  const win = new electron.BrowserWindow({
    width: (opts == null ? void 0 : opts.width) ?? 960,
    height: (opts == null ? void 0 : opts.height) ?? 540,
    x: opts == null ? void 0 : opts.x,
    y: opts == null ? void 0 : opts.y,
    title: (opts == null ? void 0 : opts.title) ?? `VJ Mirror Slice: ${id}`,
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
    titleBarStyle: "hidden",
    transparent: false,
    thickFrame: false,
    hasShadow: false,
    backgroundColor: "#000000",
    fullscreenable: true,
    autoHideMenuBar: true,
    minWidth: 320,
    minHeight: 180
  });
  try {
    win.setMenuBarVisibility(false);
  } catch {
  }
  try {
    win.removeMenu();
  } catch {
  }
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${(opts == null ? void 0 : opts.title) ?? `VJ Mirror Slice: ${id}`}</title>
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
  try {
    win.show();
    win.center();
  } catch {
  }
  win.once("ready-to-show", () => {
    try {
      if (!win.isVisible()) {
        win.show();
        win.center();
      }
    } catch {
    }
  });
  win.on("closed", () => {
    advancedMirrorWindows.delete(id);
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Escape") {
      win.close();
    }
  });
  advancedMirrorWindows.set(id, win);
  return win;
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
      label: "External",
      submenu: [
        {
          label: "Mirror Window",
          accelerator: "CmdOrCtrl+M",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("toggle-mirror");
            }
          }
        },
        {
          label: "Advanced Mirror",
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("toggle-advanced-mirror");
            }
          }
        }
      ]
    },
    {
      label: "Record",
      submenu: [
        {
          label: "Record",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("record:start");
            }
          }
        },
        {
          label: "Record Settings",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("record:settings");
            }
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
          label: "Toggle Debug Overlay",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => {
            try {
              mainWindow == null ? void 0 : mainWindow.webContents.send("debug:toggleOverlay");
            } catch {
            }
          }
        },
        {
          label: "Show Debug Panel",
          accelerator: "CmdOrCtrl+Alt+D",
          click: () => {
            try {
              mainWindow == null ? void 0 : mainWindow.webContents.send("debug:openPanel");
            } catch {
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
  loadEncryptedAuthStoreFromDisk();
  electron.protocol.registerFileProtocol("local-file", (request, callback) => {
    const filePath = request.url.replace("local-file://", "");
    console.log("Loading local file:", filePath);
    console.log("Request URL:", request.url);
    console.log("File path resolved:", filePath);
    callback(filePath);
  });
  electron.ipcMain.handle("show-open-dialog", async (event, options) => {
    const result = await electron.dialog.showOpenDialog(mainWindow, options);
    return result;
  });
  electron.ipcMain.handle("show-save-dialog", async (event, options) => {
    console.log("Show save dialog called with options:", options);
    const result = await electron.dialog.showSaveDialog(mainWindow, options);
    console.log("Save dialog result:", result);
    return result;
  });
  electron.ipcMain.handle("save-file", async (event, filePath, content) => {
    try {
      await fs.promises.writeFile(filePath, content, "utf8");
      return true;
    } catch (e) {
      console.error("Failed to save file:", e);
      return false;
    }
  });
  electron.ipcMain.handle("save-binary-file", async (event, filePath, data) => {
    try {
      console.log("Saving binary file to:", filePath, "Size:", data.length, "bytes");
      await fs.promises.writeFile(filePath, Buffer.from(data));
      console.log("Binary file saved successfully");
      return true;
    } catch (e) {
      console.error("Failed to save binary file:", e);
      return false;
    }
  });
  electron.ipcMain.handle("get-system-audio-stream", async () => {
    try {
      const { desktopCapturer } = require("electron");
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 }
      });
      if (sources.length === 0) {
        throw new Error("No screen sources available");
      }
      const primarySource = sources.find((source) => source.name === "Entire Screen") || sources[0];
      return {
        success: true,
        sourceId: primarySource.id
      };
    } catch (e) {
      console.error("Failed to get system audio stream:", e);
      return {
        success: false,
        error: String(e)
      };
    }
  });
  electron.ipcMain.handle("read-file-text", async (event, filePath) => {
    try {
      const data = await fs.promises.readFile(filePath, "utf8");
      return data;
    } catch (e) {
      console.error("Failed to read file:", e);
      return null;
    }
  });
  electron.ipcMain.handle("read-local-file-base64", async (event, filePath) => {
    try {
      const data = await fs.promises.readFile(filePath);
      return data.toString("base64");
    } catch (err) {
      console.error("Failed to read local file:", filePath, err);
      throw err;
    }
  });
  electron.ipcMain.handle("authStorage:isEncryptionAvailable", () => {
    try {
      return electron.safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  });
  electron.ipcMain.on("authStorage:isEncryptionAvailableSync", (event) => {
    try {
      event.returnValue = electron.safeStorage.isEncryptionAvailable();
    } catch {
      event.returnValue = false;
    }
  });
  electron.ipcMain.handle("authStorage:save", async (event, key, plainText) => {
    try {
      if (!key) return false;
      if (plainText === void 0 || plainText === null || plainText === "") {
        delete encryptedAuthStore[key];
        persistEncryptedAuthStoreToDisk();
        return true;
      }
      if (electron.safeStorage.isEncryptionAvailable()) {
        encryptedAuthStore[key] = electron.safeStorage.encryptString(plainText);
      } else {
        encryptedAuthStore[key] = Buffer.from(plainText, "utf8");
      }
      persistEncryptedAuthStoreToDisk();
      return true;
    } catch (e) {
      console.error("Failed to save auth blob:", e);
      return false;
    }
  });
  electron.ipcMain.on("authStorage:saveSync", (event, key, plainText) => {
    try {
      if (!key) {
        event.returnValue = false;
        return;
      }
      if (plainText === void 0 || plainText === null || plainText === "") {
        delete encryptedAuthStore[key];
        persistEncryptedAuthStoreToDisk();
        event.returnValue = true;
        return;
      }
      if (electron.safeStorage.isEncryptionAvailable()) {
        encryptedAuthStore[key] = electron.safeStorage.encryptString(plainText);
      } else {
        encryptedAuthStore[key] = Buffer.from(plainText, "utf8");
      }
      persistEncryptedAuthStoreToDisk();
      event.returnValue = true;
    } catch (e) {
      console.error("Failed to save auth blob (sync):", e);
      event.returnValue = false;
    }
  });
  electron.ipcMain.handle("authStorage:load", async (event, key) => {
    try {
      if (!key) return null;
      const buf = encryptedAuthStore[key];
      if (!buf) return null;
      if (electron.safeStorage.isEncryptionAvailable()) {
        return electron.safeStorage.decryptString(buf);
      }
      return buf.toString("utf8");
    } catch (e) {
      console.error("Failed to load auth blob:", e);
      return null;
    }
  });
  electron.ipcMain.on("authStorage:loadSync", (event, key) => {
    try {
      if (!key) {
        event.returnValue = null;
        return;
      }
      const buf = encryptedAuthStore[key];
      if (!buf) {
        event.returnValue = null;
        return;
      }
      if (electron.safeStorage.isEncryptionAvailable()) {
        event.returnValue = electron.safeStorage.decryptString(buf);
      } else {
        event.returnValue = buf.toString("utf8");
      }
    } catch (e) {
      console.error("Failed to load auth blob (sync):", e);
      event.returnValue = null;
    }
  });
  electron.ipcMain.handle("authStorage:remove", async (event, key) => {
    try {
      if (!key) return false;
      delete encryptedAuthStore[key];
      persistEncryptedAuthStoreToDisk();
      return true;
    } catch (e) {
      console.error("Failed to remove auth blob:", e);
      return false;
    }
  });
  electron.ipcMain.on("authStorage:removeSync", (event, key) => {
    try {
      if (!key) {
        event.returnValue = false;
        return;
      }
      delete encryptedAuthStore[key];
      persistEncryptedAuthStoreToDisk();
      event.returnValue = true;
    } catch (e) {
      console.error("Failed to remove auth blob (sync):", e);
      event.returnValue = false;
    }
  });
  electron.ipcMain.handle("authStorage:loadAll", async () => {
    try {
      const result = {};
      for (const [k, v] of Object.entries(encryptedAuthStore)) {
        try {
          if (electron.safeStorage.isEncryptionAvailable()) {
            result[k] = electron.safeStorage.decryptString(v);
          } else {
            result[k] = v.toString("utf8");
          }
        } catch {
        }
      }
      return result;
    } catch (e) {
      console.error("Failed to loadAll auth blobs:", e);
      return {};
    }
  });
  electron.ipcMain.on("toggle-app-fullscreen", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { screen } = require("electron");
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
        try {
          mainWindow.webContents.send("window-state", { maximized: false });
        } catch {
        }
      } else {
        console.log("Main: calling mainWindow.maximize()");
        mainWindow.maximize();
        try {
          mainWindow.webContents.send("window-state", { maximized: true });
        } catch {
        }
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
  electron.ipcMain.on("set-mirror-bg", (event, color) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      const safe = typeof color === "string" ? color.replace(/'/g, "\\'") : "#000000";
      mirrorWindow.webContents.executeJavaScript(`document.body.style.background='${safe}'`);
    }
  });
  electron.ipcMain.on("canvas-data", (event, dataUrl) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      mirrorWindow.webContents.send("update-canvas", dataUrl);
    }
  });
  electron.ipcMain.on("sendCanvasData", (event, dataUrl) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      try {
        const escaped = (typeof dataUrl === "string" ? dataUrl : "").replace(/'/g, "\\'");
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
      } catch {
      }
    }
  });
  electron.ipcMain.on("toggle-fullscreen", () => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      const { screen } = require("electron");
      if (mirrorWindow.isKiosk() || mirrorWindow.isFullScreen()) {
        mirrorWindow.setKiosk(false);
        mirrorWindow.setFullScreen(false);
        mirrorWindow.setBounds({
          x: void 0,
          y: void 0,
          width: 1920,
          // Will be updated by renderer
          height: 1080
          // Will be updated by renderer
        });
        mirrorWindow.center();
      } else {
        const bounds = mirrorWindow.getBounds();
        const display = screen.getDisplayMatching(bounds);
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
  electron.ipcMain.on("resize-mirror-window", (event, width, height) => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      try {
        let targetW = Math.max(1, Number(width) || 1);
        let targetH = Math.max(1, Number(height) || 1);
        const { screen } = require("electron");
        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workArea;
        const maxW = Math.floor(workArea.width * 0.9);
        const maxH = Math.floor(workArea.height * 0.9);
        const aspectRatio = targetW / targetH;
        if (targetW > maxW || targetH > maxH) {
          const scaleW = maxW / targetW;
          const scaleH = maxH / targetH;
          const scale = Math.min(scaleW, scaleH);
          targetW = Math.floor(targetW * scale);
          targetH = Math.floor(targetH * scale);
        }
        targetW = Math.max(480, targetW);
        targetH = Math.max(270, targetH);
        if (mirrorAspectRatio && isFinite(mirrorAspectRatio) && mirrorAspectRatio > 0) {
          targetH = Math.max(1, Math.round(targetW / mirrorAspectRatio));
        }
        console.log("Resizing mirror window to:", targetW, "x", targetH, "(aspect locked:", !!mirrorAspectRatio, ")");
        mirrorWindow.setSize(targetW, targetH);
      } catch {
      }
      mirrorWindow.center();
    }
  });
  electron.ipcMain.on("set-mirror-aspect", (event, width, height) => {
    try {
      const w = Math.max(1, Number(width) || 1);
      const h = Math.max(1, Number(height) || 1);
      const ratio = w / h;
      mirrorAspectRatio = ratio;
      outputAspectRatio = ratio;
      if (mirrorWindow && !mirrorWindow.isDestroyed()) {
        try {
          mirrorWindow.setAspectRatio(ratio);
        } catch {
        }
      }
      if (outputWindow && !outputWindow.isDestroyed()) {
        try {
          outputWindow.setAspectRatio(ratio);
        } catch {
        }
      }
    } catch {
    }
  });
  electron.ipcMain.on("advanced-mirror:open", (event, slices) => {
    try {
      console.log("[main] advanced-mirror:open", Array.isArray(slices) ? slices.map((s) => s == null ? void 0 : s.id) : slices);
      if (Array.isArray(slices)) {
        for (const s of slices) {
          console.log("[main] createAdvancedMirrorWindow", s == null ? void 0 : s.id);
          createAdvancedMirrorWindow(String(s.id), s);
        }
      }
    } catch (e) {
      console.warn("advanced-mirror:open error", e);
    }
  });
  electron.ipcMain.on("advanced-mirror:closeAll", () => {
    try {
      advancedMirrorWindows.forEach((win, id) => {
        try {
          if (!win.isDestroyed()) win.close();
        } catch {
        }
        advancedMirrorWindows.delete(id);
      });
    } catch (e) {
      console.warn("advanced-mirror:closeAll error", e);
    }
  });
  electron.ipcMain.on("advanced-mirror:sendSliceData", (event, id, dataUrl) => {
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      const escaped = (typeof dataUrl === "string" ? dataUrl : "").replace(/'/g, "\\'");
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
  electron.ipcMain.on("advanced-mirror:setBg", (event, id, color) => {
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      const safe = typeof color === "string" ? color.replace(/'/g, "\\'") : "#000000";
      win.webContents.executeJavaScript(`document.body.style.background='${safe}'`);
    }
  });
  electron.ipcMain.on("advanced-mirror:resize", (event, id, width, height) => {
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      try {
        win.setSize(width, height);
        win.center();
      } catch {
      }
    }
  });
  electron.ipcMain.on("advanced-mirror:toggleFullscreen", (event, id) => {
    const win = advancedMirrorWindows.get(String(id));
    if (win && !win.isDestroyed()) {
      const { screen } = require("electron");
      if (win.isKiosk() || win.isFullScreen()) {
        try {
          win.setKiosk(false);
          win.setFullScreen(false);
          win.setBounds({ width: 960, height: 540 });
          win.center();
        } catch {
        }
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
        } catch {
        }
      }
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
