var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { app, BrowserWindow, protocol } from 'electron';
import path from 'path';
// Prevent multiple instances
var gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('Another instance is already running, quitting...');
    app.quit();
}
else {
    app.on('second-instance', function () {
        // Someone tried to run a second instance, focus our window instead
        var windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            if (windows[0].isMinimized())
                windows[0].restore();
            windows[0].focus();
        }
    });
}
var mainWindow = null;
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
    // Set CSP headers to allow local-file protocol
    mainWindow.webContents.session.webRequest.onHeadersReceived(function (details, callback) {
        console.log('Setting CSP headers for URL:', details.url);
        // Temporarily disable CSP for development
        var responseHeaders = __assign(__assign({}, details.responseHeaders), { 
            // Remove CSP headers entirely for development
            'Content-Security-Policy': [] });
        console.log('CSP headers disabled for development');
        callback({
            responseHeaders: responseHeaders
        });
    });
    // Show window when ready
    mainWindow.once('ready-to-show', function () {
        mainWindow.show();
    });
    // Check if we're in development mode
    var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
        console.log('Running in development mode');
        // Try to load from dev server with better error handling
        var loadDevURL_1 = function (port, retryCount) {
            if (retryCount === void 0) { retryCount = 0; }
            var url = "http://localhost:".concat(port);
            console.log("Trying to load: ".concat(url, " (attempt ").concat(retryCount + 1, ")"));
            mainWindow.loadURL(url).then(function () {
                console.log("Successfully loaded: ".concat(url));
                mainWindow.webContents.openDevTools();
            }).catch(function (error) {
                console.log("Failed to load ".concat(url, ":"), error.message);
                // Retry logic with exponential backoff
                if (retryCount < 3) {
                    var delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                    console.log("Retrying in ".concat(delay, "ms..."));
                    setTimeout(function () { return loadDevURL_1(port, retryCount + 1); }, delay);
                }
                else if (port < 5180) {
                    // Try next port
                    setTimeout(function () { return loadDevURL_1(port + 1); }, 1000);
                }
                else {
                    console.log('All ports failed, loading fallback HTML');
                    mainWindow.loadFile(path.join(__dirname, '../index.html')).catch(function (error) {
                        console.error('Failed to load fallback HTML:', error);
                        // Show error page
                        mainWindow.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>");
                    });
                }
            });
        };
        // Start with port 5173 after a short delay
        setTimeout(function () { return loadDevURL_1(5173); }, 500);
    }
    else {
        console.log('Running in production mode');
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    // Log when the window is ready
    mainWindow.webContents.on('did-finish-load', function () {
        console.log('Window loaded successfully');
    });
    // Handle window errors
    mainWindow.webContents.on('did-fail-load', function (event, errorCode, errorDescription) {
        console.error('Failed to load:', errorCode, errorDescription);
    });
    // Handle window close
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}
app.whenReady().then(function () {
    console.log('Electron app is ready');
    // Register protocol for local file access
    protocol.registerFileProtocol('local-file', function (request, callback) {
        var filePath = request.url.replace('local-file://', '');
        console.log('Loading local file:', filePath);
        console.log('Request URL:', request.url);
        console.log('File path resolved:', filePath);
        callback(filePath);
    });
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
// Handle uncaught exceptions
process.on('uncaughtException', function (error) {
    console.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', function (reason, promise) {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
