"use strict";
const electron = require("electron");
const fs = require("fs");
const path = require("path");
const _SpoutSender = class _SpoutSender {
  constructor() {
    this.sender = null;
    this.senderName = null;
    this.lastFrameAtMs = 0;
  }
  start(senderName) {
    if (process.platform !== "win32") {
      return { ok: false, error: "Spout output is only supported on Windows." };
    }
    const safeName = _SpoutSender.DEFAULT_SENDER_NAME;
    if (this.sender && this.senderName === safeName) return { ok: true };
    if (this.sender) this.stop();
    const addon = this.tryLoadAddon();
    if (!addon) {
      return {
        ok: false,
        error: "Spout addon not found. Build/copy `electron_spout.node` and ensure it is unpacked (not inside asar)."
      };
    }
    try {
      this.sender = new addon.SpoutOutput(safeName);
      this.senderName = safeName;
      this.lastFrameAtMs = 0;
      return { ok: true };
    } catch (e) {
      this.sender = null;
      this.senderName = null;
      return { ok: false, error: `Failed to create Spout sender: ${String(e)}` };
    }
  }
  stop() {
    try {
      const s = this.sender;
      if (s && typeof s.close === "function") s.close();
      if (s && typeof s.release === "function") s.release();
      if (s && typeof s.dispose === "function") s.dispose();
    } catch {
    }
    this.sender = null;
    this.senderName = null;
  }
  isRunning() {
    return !!this.sender;
  }
  pushDataUrlFrame(dataUrl, opts) {
    const sender = this.sender;
    if (!sender) return;
    const maxFps = _SpoutSender.DEFAULT_MAX_FPS;
    const now = Date.now();
    const interval = 1e3 / maxFps;
    if (now - this.lastFrameAtMs < interval) return;
    try {
      const img = electron.nativeImage.createFromDataURL(String(dataUrl || ""));
      if (img.isEmpty()) return;
      sender.updateFrame(Buffer.from(img.toBitmap()), img.getSize());
      this.lastFrameAtMs = now;
    } catch {
    }
  }
  tryLoadAddon() {
    const attempts = [
      // 1) If required from CWD / node_modules-style.
      () => require("electron_spout.node"),
      () => require("electron-spout.node"),
      // 2) Common dev locations (project root).
      () => require(path.join(process.cwd(), "electron_spout.node")),
      () => require(path.join(process.cwd(), "electron-spout.node")),
      () => require(path.join(process.cwd(), "native", "electron_spout.node")),
      () => require(path.join(process.cwd(), "native", "electron-spout.node")),
      // 3) Production: resources path unpacked (recommended for .node).
      () => require(path.join(process.resourcesPath || "", "electron_spout.node")),
      () => require(path.join(process.resourcesPath || "", "electron-spout.node")),
      () => require(path.join(process.resourcesPath || "", "app.asar.unpacked", "electron_spout.node")),
      () => require(path.join(process.resourcesPath || "", "app.asar.unpacked", "electron-spout.node")),
      () => require(path.join(process.resourcesPath || "", "app.asar.unpacked", "native", "electron_spout.node")),
      () => require(path.join(process.resourcesPath || "", "app.asar.unpacked", "native", "electron-spout.node"))
    ];
    for (const load of attempts) {
      try {
        const mod = load();
        if (mod && mod.SpoutOutput) return mod;
      } catch {
      }
    }
    return null;
  }
};
_SpoutSender.DEFAULT_SENDER_NAME = "Sonomika Output";
_SpoutSender.DEFAULT_MAX_FPS = 60;
let SpoutSender = _SpoutSender;
const shouldMuteConsole = process.env.VJ_DEBUG_LOGS !== "true";
const originalLog = console.log;
const originalWarn = console.warn;
if (shouldMuteConsole) {
  const noop = () => {
  };
  console.log = (...args) => {
    const message = args.join(" ");
    if (message.includes("ICON") || message.includes("APP PATHS") || message.includes("RESOLVED") || message.includes("NO ICON") || message.includes("process.cwd") || message.includes("__dirname") || message.includes("Checking icon") || message.includes("✓") || message.includes("✗") || message.includes("Creating window") || message.includes("Icon loaded") || message.includes("user model") || message.includes("taskbar")) {
      originalLog(...args);
    }
  };
  console.warn = (...args) => {
    const message = args.join(" ");
    if (message.includes("ICON") || message.includes("APP PATHS")) {
      originalWarn(...args);
    }
  };
  console.info = noop;
}
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
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
const spoutSender = new SpoutSender();
const SPOUT_SENDER_NAME = "Sonomika Output";
const SPOUT_MAX_FPS = 60;
function resolveAppIconPath() {
  console.log("=== ICON RESOLUTION DEBUG ===");
  console.log("process.cwd():", process.cwd());
  console.log("__dirname:", __dirname);
  console.log("process.resourcesPath:", process.resourcesPath);
  console.log("app.getAppPath():", electron.app.getAppPath());
  console.log("app.getPath(exe):", electron.app.getPath("exe"));
  const candidates = [
    // On Windows, prefer ICO files first (better for window/taskbar icons)
    ...process.platform === "win32" ? [
      path.join(process.resourcesPath || "", "icons", "icon.ico"),
      path.join(__dirname, "../icons/icon.ico"),
      path.join(__dirname, "../../public/icons/icon.ico"),
      path.join(__dirname, "../public/icons/icon.ico"),
      path.join(process.cwd(), "public", "icons", "icon.ico"),
      // Fallback to old name for backwards compatibility
      path.join(process.resourcesPath || "", "icons", "sonomika_icon_2.ico"),
      path.join(__dirname, "../icons/sonomika_icon_2.ico")
    ] : [],
    // Then check PNG files (fallback or for non-Windows)
    path.join(process.resourcesPath || "", "icons", "icon.png"),
    path.join(__dirname, "../icons/icon.png"),
    path.join(__dirname, "../../public/icons/icon.png"),
    path.join(__dirname, "../public/icons/icon.png"),
    path.join(process.cwd(), "public", "icons", "icon.png"),
    // Fallback to old name for backwards compatibility
    path.join(process.resourcesPath || "", "icons", "sonomika_icon_2.png"),
    path.join(__dirname, "../icons/sonomika_icon_2.png")
  ];
  console.log("Checking icon candidates:");
  for (const p of candidates) {
    const exists = fs.existsSync(p);
    console.log(`  ${exists ? "✓" : "✗"} ${p}`);
    if (exists) {
      try {
        const stats = fs.statSync(p);
        console.log(`    Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
      } catch (e) {
        console.log(`    (Could not stat file)`);
      }
      console.log("=== RESOLVED ICON PATH ===");
      return p;
    }
  }
  console.log("=== NO ICON FOUND ===");
  return void 0;
}
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
function initializeUserDocumentsFolders() {
  try {
    const documentsPath = electron.app.getPath("documents");
    const sonomikaDocsPath = path.join(documentsPath, "Sonomika");
    if (!fs.existsSync(sonomikaDocsPath)) {
      fs.mkdirSync(sonomikaDocsPath, { recursive: true });
      console.log("Created Sonomika folder in Documents:", sonomikaDocsPath);
    }
    const folders = ["bank", "music", "recordings", "video", "ai-templates"];
    for (const folderName of folders) {
      const folderPath = path.join(sonomikaDocsPath, folderName);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log("Created folder:", folderPath);
      }
    }
    const bankSourcePaths = [
      path.join(process.resourcesPath || "", "app.asar.unpacked", "bank"),
      path.join(__dirname, "../bank"),
      path.join(process.cwd(), "bank")
    ];
    const bankDestPath = path.join(sonomikaDocsPath, "bank");
    let bankCopied = false;
    for (const sourcePath of bankSourcePaths) {
      if (fs.existsSync(sourcePath) && !bankCopied) {
        try {
          copyDirectoryRecursive(sourcePath, bankDestPath);
          console.log("Copied bank folder from", sourcePath, "to", bankDestPath);
          bankCopied = true;
        } catch (e) {
          console.warn("Failed to copy bank folder from", sourcePath, ":", e);
        }
      }
    }
    const setsSourcePaths = [
      // Production: extraResources location (user-documents)
      path.join(process.resourcesPath || "", "user-documents", "sets"),
      // Production: asarUnpack location
      path.join(process.resourcesPath || "", "app.asar.unpacked", "user-documents", "sets"),
      // Development paths
      path.join(__dirname, "../user-documents", "sets"),
      path.join(process.cwd(), "user-documents", "sets"),
      path.join(process.resourcesPath || "", "app.asar.unpacked", "sets"),
      path.join(__dirname, "../sets"),
      path.join(process.cwd(), "sets")
    ];
    const setsDestPath = path.join(sonomikaDocsPath, "sets");
    let setsCopied = false;
    console.log("Looking for sets folder in source paths...");
    console.log("process.resourcesPath:", process.resourcesPath);
    for (const sourcePath of setsSourcePaths) {
      const exists = fs.existsSync(sourcePath);
      console.log("  Checking:", sourcePath, exists ? "✓ EXISTS" : "✗ NOT FOUND");
      if (exists) {
        try {
          const filesBefore = fs.existsSync(setsDestPath) ? fs.readdirSync(setsDestPath).length : 0;
          copyDirectoryRecursive(sourcePath, setsDestPath);
          const filesAfter = fs.existsSync(setsDestPath) ? fs.readdirSync(setsDestPath).length : 0;
          console.log(`Copied sets folder from ${sourcePath} to ${setsDestPath} (${filesAfter - filesBefore} files)`);
          setsCopied = true;
          break;
        } catch (e) {
          console.warn("Failed to copy sets folder from", sourcePath, ":", e);
        }
      }
    }
    if (!setsCopied) {
      console.warn("⚠️ Sets folder was not copied. Checked paths:", setsSourcePaths);
    }
    const userDocsSourcePaths = [
      // Production: extraResources location (most likely)
      path.join(process.resourcesPath || "", "user-documents"),
      // Production: asarUnpack location
      path.join(process.resourcesPath || "", "app.asar.unpacked", "user-documents"),
      // Development paths
      path.join(__dirname, "../user-documents"),
      path.join(process.cwd(), "user-documents")
    ];
    console.log("Looking for user-documents folder in source paths...");
    let userDocsCopied = false;
    for (const userDocsSource of userDocsSourcePaths) {
      const exists = fs.existsSync(userDocsSource);
      console.log("  Checking:", userDocsSource, exists ? "✓ EXISTS" : "✗ NOT FOUND");
      if (exists) {
        try {
          const subfolders = ["midi mapping", "music", "recordings", "video"];
          for (const subfolder of subfolders) {
            const srcSubfolder = path.join(userDocsSource, subfolder);
            const destSubfolder = path.join(sonomikaDocsPath, subfolder);
            if (fs.existsSync(srcSubfolder)) {
              const filesBefore = fs.existsSync(destSubfolder) ? fs.readdirSync(destSubfolder).length : 0;
              copyDirectoryRecursive(srcSubfolder, destSubfolder);
              const filesAfter = fs.existsSync(destSubfolder) ? fs.readdirSync(destSubfolder).length : 0;
              console.log(`Copied ${subfolder} folder from ${srcSubfolder} to ${destSubfolder} (${filesAfter - filesBefore} files)`);
            } else {
              console.log(`  Source ${subfolder} folder does not exist:`, srcSubfolder);
            }
          }
          userDocsCopied = true;
          break;
        } catch (e) {
          console.warn("Failed to copy user-documents folders from", userDocsSource, ":", e);
        }
      }
    }
    if (!userDocsCopied) {
      console.warn("⚠️ user-documents folders were not copied. Checked paths:", userDocsSourcePaths);
    }
    const aiTemplatesDestPath = path.join(sonomikaDocsPath, "ai-templates");
    if (!fs.existsSync(aiTemplatesDestPath)) {
      fs.mkdirSync(aiTemplatesDestPath, { recursive: true });
    }
    const appPath = electron.app.getAppPath();
    const aiTemplatesSourcePaths = [
      // Production: extraResources location (most likely)
      path.join(process.resourcesPath || "", "src", "ai-templates"),
      // Production: asarUnpack location
      path.join(process.resourcesPath || "", "app.asar.unpacked", "src", "ai-templates"),
      // Development: relative to compiled main.js
      path.join(__dirname, "../src/ai-templates"),
      path.join(__dirname, "../../src/ai-templates"),
      // Development: relative to app path
      path.join(appPath, "src/ai-templates"),
      // Development: current working directory
      path.join(process.cwd(), "src/ai-templates")
    ];
    let templatesCopied = 0;
    const destEntries = fs.existsSync(aiTemplatesDestPath) ? fs.readdirSync(aiTemplatesDestPath).filter((f) => f.endsWith(".js")) : [];
    const isDestEmpty = destEntries.length === 0;
    if (isDestEmpty) {
      console.log("AI templates folder is empty, will copy template files...");
    }
    for (const sourcePath of aiTemplatesSourcePaths) {
      if (fs.existsSync(sourcePath)) {
        try {
          console.log("Checking AI templates source path:", sourcePath);
          const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
          console.log(`Found ${entries.length} entries in ${sourcePath}`);
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".js")) {
              const srcFile = path.join(sourcePath, entry.name);
              const destFile = path.join(aiTemplatesDestPath, entry.name);
              if (!fs.existsSync(destFile) || isDestEmpty) {
                fs.copyFileSync(srcFile, destFile);
                console.log("Copied AI template file:", entry.name, "to", destFile);
                templatesCopied++;
              } else {
                console.log("Skipped AI template file (already exists):", entry.name);
              }
            }
          }
          if (templatesCopied > 0) {
            console.log(`Successfully copied ${templatesCopied} AI template file(s) from ${sourcePath}`);
            break;
          }
        } catch (e) {
          console.warn("Failed to copy AI templates from", sourcePath, ":", e);
        }
      } else {
        console.log("AI templates source path does not exist:", sourcePath);
      }
    }
    if (templatesCopied === 0) {
      console.warn("⚠️ No AI template files were copied. Checked paths:", aiTemplatesSourcePaths);
      console.warn("   This might indicate the template files are not included in the build.");
    }
    const foldersToCheck = ["midi mapping", "sets"];
    for (const folderName of foldersToCheck) {
      const folderPath = path.join(sonomikaDocsPath, folderName);
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        if (files.length === 0) {
          console.warn(`⚠️ ${folderName} folder exists but is empty. Files may not have been copied from installer.`);
        } else {
          console.log(`✓ ${folderName} folder has ${files.length} file(s)`);
        }
      } else {
        console.warn(`⚠️ ${folderName} folder was not created. Files may not have been found in installer.`);
      }
    }
  } catch (e) {
    console.error("Failed to initialize user Documents folders:", e);
  }
}
function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
function createWindow() {
  const appIconPath = resolveAppIconPath();
  console.log("Creating window with icon path:", appIconPath);
  let appIcon = void 0;
  if (appIconPath) {
    try {
      appIcon = electron.nativeImage.createFromPath(appIconPath);
      if (appIcon && !appIcon.isEmpty()) {
        console.log("Icon loaded successfully, size:", appIcon.getSize());
      } else {
        console.warn("Icon file found but failed to load or is empty");
      }
    } catch (e) {
      console.error("Error loading icon:", e);
    }
  }
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    // Remove default window frame
    titleBarStyle: "hidden",
    icon: appIcon,
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
    if (process.platform === "win32" && appIcon) {
      try {
        mainWindow.setIcon(appIcon);
        console.log("Forced icon update on window after show");
      } catch (e) {
        console.error("Error forcing icon update:", e);
      }
    }
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
        if (details?.frameName === "output-canvas") {
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
      mainWindow?.webContents.send("window-state", { maximized: true });
    } catch {
    }
  });
  mainWindow.on("unmaximize", () => {
    try {
      mainWindow?.webContents.send("window-state", { maximized: false });
    } catch {
    }
  });
  const isDev = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
  if (isDev) {
    console.log("Running in development mode");
    const preferredUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL;
    const port = Number(process.env.VITE_DEV_SERVER_PORT || 5173);
    const candidates = [];
    const appendCandidate = (url) => {
      if (!url) return;
      if (!candidates.includes(url)) {
        candidates.push(url);
      }
    };
    appendCandidate(preferredUrl);
    appendCandidate(`http://localhost:${port}`);
    appendCandidate(`http://127.0.0.1:${port}`);
    const loadSequentially = (remaining, attempt = 0) => {
      if (!mainWindow) return;
      if (remaining.length === 0) {
        console.warn("All dev server attempts failed; showing inline error page");
        const safeCandidates = candidates.filter(Boolean);
        const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: http: https:; script-src 'unsafe-inline' data: http: https:; style-src 'unsafe-inline' data: http: https:;" />
    <title>Dev Server Not Available</title>
    <style>
      body { font-family: sans-serif; background: #141414; color: #f5f5f5; padding: 32px; }
      pre { background:#1f1f1f; padding:16px; border-radius:8px; overflow:auto; }
      .muted { color: #aaaaaa; }
      button { background:#1f1f1f; color:#f5f5f5; border: 1px solid #262626; padding: 10px 12px; border-radius: 8px; cursor: pointer; }
      button:hover { background:#262626; }
      code { color: #f5f5f5; }
    </style>
  </head>
  <body>
    <h1>Dev Server Not Available</h1>
    <p>Could not connect to the Vite dev server on port ${port}.</p>
    <p class="muted">This window will keep retrying automatically.</p>
    <p>Make sure it is running with:</p>
    <pre>cd "${process.cwd()}"
npm run dev:electron</pre>
    <div style="margin-top: 16px;">
      <button id="retryBtn" type="button">Retry now</button>
      <span id="status" class="muted" style="margin-left: 12px;"></span>
    </div>
    <script>
      (function () {
        const candidates = ${JSON.stringify(safeCandidates)};
        const statusEl = document.getElementById('status');
        const setStatus = (t) => { try { statusEl.textContent = t; } catch {} };

        async function tryLoad() {
          for (const url of candidates) {
            try {
              setStatus('Trying ' + url + ' ...');
              // Use no-cors HEAD/GET fallback; we only care if it responds at all
              const res = await fetch(url, { method: 'GET', cache: 'no-store' });
              if (res && (res.ok || res.status === 304)) {
                setStatus('Connected. Loading...');
                window.location.href = url;
                return;
              }
            } catch (e) {
              // ignore and continue
            }
          }
          setStatus('Still waiting for dev server...');
        }

        document.getElementById('retryBtn')?.addEventListener('click', () => { tryLoad(); });
        // Initial + periodic retries
        tryLoad();
        setInterval(tryLoad, 1500);
      })();
    <\/script>
  </body>
</html>`;
        mainWindow.loadURL(`data:text/html,${encodeURIComponent(html)}`);
        return;
      }
      const url = remaining[0];
      const remainingNext = remaining.slice(1);
      const nextAttempt = attempt + 1;
      console.log(`Trying dev server URL: ${url} (attempt ${nextAttempt})`);
      mainWindow.loadURL(url).then(() => {
        console.log(`Electron loaded renderer from ${url}`);
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      }).catch((error) => {
        console.warn(`Failed to load ${url}: ${error?.message || error}`);
        const backoff = Math.min(5e3, 1e3 * Math.pow(2, attempt));
        console.log(`Retrying with next candidate in ${backoff}ms`);
        setTimeout(() => loadSequentially(remainingNext, nextAttempt), backoff);
      });
    };
    setTimeout(() => loadSequentially(candidates), 1200);
  } else {
    console.log("Running in production mode");
    const appPath = electron.app.getAppPath();
    const prodCandidates = [
      path.join(appPath, "dist/index.html"),
      path.join(__dirname, "../dist/index.html"),
      path.join(__dirname, "../web/index.html")
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
      console.error("App path:", appPath);
      console.error("__dirname:", __dirname);
      mainWindow.loadURL(`data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>`);
    }
  }
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window loaded successfully");
  });
  try {
    mainWindow.webContents.on("render-process-gone", (_e, details) => {
      console.error("[electron] render-process-gone", details);
    });
    mainWindow.webContents.on("unresponsive", () => {
      console.error("[electron] webContents became unresponsive");
    });
    mainWindow.webContents.on("media-started-playing", () => {
      console.log("[electron] media-started-playing");
    });
    mainWindow.webContents.on("media-paused", () => {
      console.log("[electron] media-paused");
    });
  } catch {
  }
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
  const appIconPath = resolveAppIconPath();
  console.log("Creating mirror window with icon path:", appIconPath);
  let appIcon = void 0;
  if (appIconPath) {
    try {
      appIcon = electron.nativeImage.createFromPath(appIconPath);
      if (appIcon && !appIcon.isEmpty()) {
        console.log("Mirror window icon loaded successfully, size:", appIcon.getSize());
      } else {
        console.warn("Mirror window icon file found but failed to load or is empty");
      }
    } catch (e) {
      console.error("Error loading mirror window icon:", e);
    }
  }
  mirrorWindow = new electron.BrowserWindow({
    width: 1920,
    // Start with standard HD size; will be resized to canvas dimensions
    height: 1080,
    // Start with standard HD size; will be resized to canvas dimensions
    title: "sonomika",
    icon: appIcon,
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
  const appIconPath = resolveAppIconPath();
  const appIcon = appIconPath ? electron.nativeImage.createFromPath(appIconPath) : void 0;
  const win = new electron.BrowserWindow({
    width: opts?.width ?? 960,
    height: opts?.height ?? 540,
    x: opts?.x,
    y: opts?.y,
    title: opts?.title ?? `VJ Mirror Slice: ${id}`,
    icon: appIcon,
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
      <title>${opts?.title ?? `VJ Mirror Slice: ${id}`}</title>
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
        },
        { type: "separator" },
        {
          label: "Spout Output",
          click: () => {
            try {
              mainWindow?.webContents.send("spout:toggle");
            } catch {
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
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        }
      ]
    },
    {
      label: "Developer",
      submenu: [
        {
          label: "Toggle Debug Overlay",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => {
            try {
              mainWindow?.webContents.send("debug:toggleOverlay");
            } catch {
            }
          }
        },
        {
          label: "Show Debug Panel",
          accelerator: "CmdOrCtrl+Alt+D",
          click: () => {
            try {
              mainWindow?.webContents.send("debug:openPanel");
            } catch {
            }
          }
        },
        { type: "separator" },
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
  console.log("=== APP PATHS DEBUG ===");
  console.log("app.getAppPath():", electron.app.getPath("appData"));
  console.log("app.getPath(exe):", electron.app.getPath("exe"));
  console.log("process.execPath:", process.execPath);
  console.log("process.resourcesPath:", process.resourcesPath);
  if (process.platform === "win32") {
    try {
      electron.app.setAppUserModelId("com.sonomika.app");
      console.log("Set app user model ID for Windows taskbar icon");
    } catch (e) {
      console.error("Error setting app user model ID:", e);
    }
  }
  try {
    electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  } catch {
  }
  try {
    const iconPath = resolveAppIconPath();
    console.log("Icon path resolved at app.whenReady():", iconPath);
    if (process.platform === "darwin" && iconPath && electron.app.dock && typeof electron.app.dock.setIcon === "function") {
      electron.app.dock.setIcon(electron.nativeImage.createFromPath(iconPath));
    }
  } catch (e) {
    console.error("Error setting dock icon:", e);
  }
  electron.app.commandLine.appendSwitch("disable-background-timer-throttling");
  electron.app.commandLine.appendSwitch("disable-renderer-backgrounding");
  electron.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  try {
    const existing = electron.app.commandLine.getSwitchValue("disable-features");
    const extra = "CalculateNativeWinOcclusion";
    if (existing && existing.length > 0) {
      if (!existing.split(",").includes(extra)) {
        electron.app.commandLine.appendSwitch("disable-features", `${existing},${extra}`);
      }
    } else {
      electron.app.commandLine.appendSwitch("disable-features", extra);
    }
  } catch {
  }
  createCustomMenu();
  loadEncryptedAuthStoreFromDisk();
  initializeUserDocumentsFolders();
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
  let offlineSession = null;
  let offlineAudioPath = null;
  electron.ipcMain.handle("offline-render:start", async (_e, opts) => {
    try {
      const base = path.join(electron.app.getPath("userData"), "offline-renders");
      const dir = path.join(base, `${Date.now()}_${(opts?.name || "movie").replace(/[^a-z0-9_-]/ig, "_")}`);
      await fs.promises.mkdir(dir, { recursive: true });
      offlineSession = { dir, name: String(opts?.name || "movie"), fps: Number(opts?.fps) || 0, index: 0, width: Number(opts?.width) || 1920, height: Number(opts?.height) || 1080, quality: opts?.quality || "medium" };
      offlineAudioPath = null;
      console.log("[offline] start", { dir, fps: offlineSession.fps || "preview", quality: offlineSession.quality, size: `${offlineSession.width}x${offlineSession.height}` });
      return { success: true, dir };
    } catch (e) {
      console.error("[offline] start error", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("offline-render:frame", async (_e, payload) => {
    if (!offlineSession) return { success: false, error: "No session" };
    try {
      const p = offlineSession;
      const file = path.join(p.dir, `frame_${String(p.index).padStart(6, "0")}.png`);
      const base64 = String(payload?.dataUrl || "").replace(/^data:image\/png;base64,/, "");
      await fs.promises.writeFile(file, Buffer.from(base64, "base64"));
      p.index += 1;
      if (p.index % 60 === 0) {
        console.log("[offline] saved frames:", p.index);
      }
      return { success: true, index: p.index };
    } catch (e) {
      console.error("[offline] frame error", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("offline-render:finish", async (_e, payload) => {
    if (!offlineSession) return { success: false, error: "No session" };
    offlineSession = null;
    try {
      return { success: false, error: "Offline rendering is disabled. Please use WebM recording via MediaRecorder instead." };
    } catch (e) {
      console.error("[offline] finish error", e);
      return { success: false, error: String(e) };
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
  electron.ipcMain.handle("get-documents-folder", async () => {
    try {
      const documentsPath = electron.app.getPath("documents");
      const sonomikaDocsPath = path.join(documentsPath, "Sonomika");
      return { success: true, path: sonomikaDocsPath };
    } catch (e) {
      console.error("Failed to get Documents folder:", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("get-app-path", async () => {
    return electron.app.getAppPath();
  });
  electron.ipcMain.handle("get-app-version", async () => {
    try {
      const tryReadPkgVersion = (pkgPath) => {
        try {
          if (!pkgPath || !fs.existsSync(pkgPath)) return "";
          const raw = fs.readFileSync(pkgPath, "utf8");
          const parsed = JSON.parse(raw);
          const v = parsed?.version;
          return typeof v === "string" ? v.trim() : "";
        } catch {
          return "";
        }
      };
      const candidates = [
        path.join(electron.app.getAppPath(), "package.json"),
        path.join(process.cwd(), "package.json"),
        // When running from `out/electron/main.js`
        path.resolve(__dirname, "..", "..", "package.json"),
        // When running from `dist-electron/main.js`
        path.resolve(__dirname, "..", "package.json")
      ];
      for (const pkgPath of candidates) {
        const v = tryReadPkgVersion(pkgPath);
        if (v) return v;
      }
      return electron.app.getVersion();
    } catch (e) {
      console.error("Failed to get app version:", e);
      return "unknown";
    }
  });
  electron.ipcMain.handle("get-resources-path", async () => {
    return process.resourcesPath || electron.app.getAppPath();
  });
  electron.ipcMain.handle("spout:start", async (_e, payload) => {
    try {
      const res = spoutSender.start(SPOUT_SENDER_NAME);
      if (!res.ok) {
        console.warn("[spout] start failed:", res.error);
        return { success: false, error: res.error };
      }
      console.log("[spout] started sender:", SPOUT_SENDER_NAME);
      return { success: true };
    } catch (e) {
      console.warn("[spout] start exception:", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.handle("spout:stop", async () => {
    try {
      spoutSender.stop();
      try {
        setTimeout(() => {
          try {
            spoutSender.stop();
          } catch {
          }
        }, 200);
      } catch {
      }
      console.log("[spout] stopped");
      return { success: true };
    } catch (e) {
      console.warn("[spout] stop exception:", e);
      return { success: false, error: String(e) };
    }
  });
  electron.ipcMain.on("spout:frame", (_e, payload) => {
    try {
      if (!spoutSender.isRunning()) return;
      spoutSender.pushDataUrlFrame(String(payload?.dataUrl || ""), { maxFps: SPOUT_MAX_FPS });
    } catch {
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
  electron.ipcMain.handle("read-audio-bytes", async (_e, urlOrPath) => {
    try {
      const { fileURLToPath } = require("url");
      const asPath = typeof urlOrPath === "string" && urlOrPath.startsWith("file:") ? fileURLToPath(urlOrPath) : urlOrPath;
      const buf = await fs.promises.readFile(asPath);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (err) {
      console.error("read-audio-bytes failed for", urlOrPath, err);
      return new ArrayBuffer(0);
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
  electron.ipcMain.handle("get-screen-sizes", async () => {
    try {
      const { screen } = require("electron");
      const displays = screen.getAllDisplays();
      console.log("Electron main: Detected displays:", displays.length);
      displays.forEach((display, index) => {
        console.log(`Display ${index + 1}:`, {
          width: display.bounds.width,
          height: display.bounds.height,
          x: display.bounds.x,
          y: display.bounds.y,
          scaleFactor: display.scaleFactor,
          rotation: display.rotation,
          label: display.label
        });
      });
      const result = displays.map((display) => ({
        width: display.bounds.width,
        height: display.bounds.height
      }));
      console.log("Electron main: Returning screen sizes:", result);
      return result;
    } catch (e) {
      console.error("Failed to get screen sizes:", e);
      return [];
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
        try {
          mirrorWindow.setVisibleOnAllWorkspaces(false);
        } catch {
        }
        try {
          mirrorWindow.setAlwaysOnTop(true);
        } catch {
        }
        mirrorWindow.setBounds({
          x: void 0,
          y: void 0,
          width: 1920,
          // Will be updated by renderer
          height: 1080
          // Will be updated by renderer
        });
        try {
          mirrorWindow.center();
        } catch {
        }
        try {
          mirrorWindow.focus();
        } catch {
        }
      } else {
        const bounds = mirrorWindow.getBounds();
        const display = screen.getDisplayMatching(bounds);
        mirrorWindow.setBounds({
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height
        });
        try {
          mirrorWindow.setMenuBarVisibility(false);
        } catch {
        }
        try {
          mirrorWindow.setFullScreenable(true);
        } catch {
        }
        try {
          if (process.platform === "darwin") {
            mirrorWindow.setAlwaysOnTop(true, "screen-saver");
          } else {
            mirrorWindow.setAlwaysOnTop(true);
          }
        } catch {
        }
        try {
          mirrorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        } catch {
        }
        try {
          mirrorWindow.moveTop?.();
        } catch {
        }
        try {
          mirrorWindow.show();
        } catch {
        }
        try {
          mirrorWindow.focus();
        } catch {
        }
        mirrorWindow.setKiosk(true);
        mirrorWindow.setFullScreen(true);
        try {
          mirrorWindow.moveTop?.();
        } catch {
        }
        try {
          mirrorWindow.focus();
        } catch {
        }
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
      console.log("[main] advanced-mirror:open", Array.isArray(slices) ? slices.map((s) => s?.id) : slices);
      if (Array.isArray(slices)) {
        for (const s of slices) {
          console.log("[main] createAdvancedMirrorWindow", s?.id);
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
try {
  electron.app.on("before-quit", () => {
    try {
      spoutSender.stop();
    } catch {
    }
  });
} catch {
}
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
