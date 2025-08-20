"use strict";const n=require("electron"),u=require("fs"),a=require("path"),p=n.app.requestSingleInstanceLock();p?n.app.on("second-instance",()=>{const t=n.BrowserWindow.getAllWindows();t.length>0&&(t[0].isMinimized()&&t[0].restore(),t[0].focus())}):(console.log("Another instance is already running, quitting..."),n.app.quit());let e=null,i=null;function g(){e=new n.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:a.join(__dirname,"preload.js")},show:!1});const t=a.join(__dirname,"preload.js");if(console.log("Preload script path:",t),console.log("Preload script exists:",require("fs").existsSync(t)),require("fs").existsSync(t)){const o=require("fs").readFileSync(t,"utf8");console.log("Preload script first 200 chars:",o.substring(0,200))}if(e.webContents.session.webRequest.onHeadersReceived((o,s)=>{console.log("Setting CSP headers for URL:",o.url);const r={...o.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),s({responseHeaders:r})}),e.once("ready-to-show",()=>{e.show(),e.webContents.setBackgroundThrottling(!1)}),process.env.NODE_ENV==="development"||!n.app.isPackaged){console.log("Running in development mode");const o=(s,r=0)=>{const d=`http://localhost:${s}`;console.log(`Trying to load: ${d} (attempt ${r+1})`),e.loadURL(d).then(()=>{console.log(`Successfully loaded: ${d}`),e.webContents.openDevTools()}).catch(m=>{if(console.log(`Failed to load ${d}:`,m.message),r<3){const c=Math.min(1e3*Math.pow(2,r),5e3);console.log(`Retrying in ${c}ms...`),setTimeout(()=>o(s,r+1),c)}else s<5180?setTimeout(()=>o(s+1),1e3):(console.log("All ports failed, loading fallback HTML"),e.loadFile(a.join(__dirname,"../index.html")).catch(c=>{console.error("Failed to load fallback HTML:",c),e.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>")}))})};setTimeout(()=>o(5173),500)}else console.log("Running in production mode"),e.loadFile(a.join(__dirname,"../dist/index.html"));e.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")}),e.webContents.on("did-fail-load",(o,s,r)=>{console.error("Failed to load:",s,r)}),e.on("closed",()=>{e=null})}function h(){if(i&&!i.isDestroyed()){i.focus();return}i=new n.BrowserWindow({width:960,height:540,title:"VJ Mirror Output",webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:a.join(__dirname,"mirror-preload.js")},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!0,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),i.loadURL(`data:text/html,${encodeURIComponent(`
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
      <\/script>
    </body>
    </html>
  `)}`),i.once("ready-to-show",()=>{i.show(),i.center()}),i.webContents.on("before-input-event",(l,o)=>{o.key==="Escape"&&i.close()})}function w(){i&&!i.isDestroyed()&&(i.close(),i=null)}function f(){const t=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{n.app.quit()}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{e&&e.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{e&&e.reload()}},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{e&&e.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],l=n.Menu.buildFromTemplate(t);n.Menu.setApplicationMenu(l)}n.app.whenReady().then(()=>{console.log("Electron app is ready"),n.app.commandLine.appendSwitch("disable-background-timer-throttling"),n.app.commandLine.appendSwitch("disable-renderer-backgrounding"),f(),n.protocol.registerFileProtocol("local-file",(t,l)=>{const o=t.url.replace("local-file://","");console.log("Loading local file:",o),console.log("Request URL:",t.url),console.log("File path resolved:",o),l(o)}),n.ipcMain.handle("read-local-file-base64",async(t,l)=>{try{return(await u.promises.readFile(l)).toString("base64")}catch(o){throw console.error("Failed to read local file:",l,o),o}}),n.ipcMain.on("toggle-app-fullscreen",()=>{if(e&&!e.isDestroyed()){const{screen:t}=require("electron");if(e.isKiosk()||e.isFullScreen())e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:1200,height:800}),e.center();else{const l=e.getBounds(),o=t.getDisplayMatching(l);e.setBounds({x:o.bounds.x,y:o.bounds.y,width:o.bounds.width,height:o.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}}}),n.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),e?(console.log("Main: calling mainWindow.minimize()"),e.minimize()):console.log("Main: mainWindow is null")}),n.ipcMain.on("window-maximize",()=>{console.log("Main: window-maximize IPC received"),e?e.isMaximized()?(console.log("Main: calling mainWindow.unmaximize()"),e.unmaximize()):(console.log("Main: calling mainWindow.maximize()"),e.maximize()):console.log("Main: mainWindow is null")}),n.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),e?(console.log("Main: calling mainWindow.close()"),e.close()):console.log("Main: mainWindow is null")}),n.ipcMain.on("toggle-mirror",()=>{e&&e.webContents.send("toggle-mirror")}),n.ipcMain.on("open-mirror-window",()=>{h()}),n.ipcMain.on("close-mirror-window",()=>{w()}),n.ipcMain.on("set-mirror-bg",(t,l)=>{if(i&&!i.isDestroyed()){const o=typeof l=="string"?l.replace(/'/g,"\\'"):"#000000";i.webContents.executeJavaScript(`document.body.style.background='${o}'`)}}),n.ipcMain.on("canvas-data",(t,l)=>{if(i&&!i.isDestroyed()){const o=l.replace(/'/g,"\\'");i.webContents.executeJavaScript(`
        (function() {
          const noStreamDiv = document.getElementById('no-stream');
          const mirrorImage = document.getElementById('mirror-image');
          
          if (noStreamDiv && mirrorImage) {
            // Hide the waiting message
            noStreamDiv.style.display = 'none';
            
            // Only update if the image source is different to prevent flashing
            if (mirrorImage.src !== '${o}') {
              mirrorImage.src = '${o}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),n.ipcMain.on("sendCanvasData",(t,l)=>{if(i&&!i.isDestroyed()){const o=l.replace(/'/g,"\\'");i.webContents.executeJavaScript(`
        (function() {
          const noStreamDiv = document.getElementById('no-stream');
          const mirrorImage = document.getElementById('mirror-image');
          
          if (noStreamDiv && mirrorImage) {
            // Hide the waiting message
            noStreamDiv.style.display = 'none';
            
            // Only update if the image source is different to prevent flashing
            if (mirrorImage.src !== '${o}') {
              mirrorImage.src = '${o}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),n.ipcMain.on("toggle-fullscreen",()=>{if(i&&!i.isDestroyed()){const{screen:t}=require("electron");if(i.isKiosk()||i.isFullScreen())i.setKiosk(!1),i.setFullScreen(!1),i.setBounds({x:void 0,y:void 0,width:960,height:540}),i.center();else{const l=i.getBounds(),o=t.getDisplayMatching(l);i.setBounds({x:o.bounds.x,y:o.bounds.y,width:o.bounds.width,height:o.bounds.height}),i.setMenuBarVisibility(!1),i.setFullScreenable(!0),i.setAlwaysOnTop(!0),i.setKiosk(!0),i.setFullScreen(!0)}}}),n.ipcMain.on("resize-mirror-window",(t,l,o)=>{i&&!i.isDestroyed()&&(console.log("Resizing mirror window to:",l,"x",o),i.setSize(l,o),i.center())}),g(),n.app.on("activate",()=>{n.BrowserWindow.getAllWindows().length===0&&g()})});n.app.on("window-all-closed",()=>{process.platform!=="darwin"&&n.app.quit()});process.on("uncaughtException",t=>{console.error("Uncaught Exception:",t)});process.on("unhandledRejection",(t,l)=>{console.error("Unhandled Rejection at:",l,"reason:",t)});
