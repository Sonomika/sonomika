"use strict";
const electron = require("electron");
const path = require("path");
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  const isDev = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
  if (isDev) {
    console.log("Running in development mode");
    const loadDevURL = (port) => {
      const url = `http://localhost:${port}`;
      console.log(`Trying to load: ${url}`);
      mainWindow.loadURL(url).catch((error) => {
        console.log(`Failed to load ${url}:`, error.message);
        if (port < 5180) {
          setTimeout(() => loadDevURL(port + 1), 1e3);
        } else {
          console.log("All ports failed, loading fallback HTML");
          mainWindow.loadFile(path.join(__dirname, "../index.html"));
        }
      });
    };
    setTimeout(() => loadDevURL(5173), 1e3);
    mainWindow.webContents.openDevTools();
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
}
electron.app.whenReady().then(() => {
  console.log("Electron app is ready");
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
