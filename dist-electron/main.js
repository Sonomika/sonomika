"use strict";const r=require("electron"),h=require("fs"),m=require("path"),z=r.app.requestSingleInstanceLock();z?r.app.on("second-instance",()=>{const n=r.BrowserWindow.getAllWindows();n.length>0&&(n[0].isMinimized()&&n[0].restore(),n[0].focus())}):(console.log("Another instance is already running, quitting..."),r.app.quit());let i=null,a=null,f=null;const g=new Map;let c={};function S(){const n=r.app.getPath("userData");return m.join(n,"auth_store.json")}function k(){try{const n=S();if(h.existsSync(n)){const t=h.readFileSync(n,"utf8"),e=JSON.parse(t);c=Object.fromEntries(Object.entries(e).map(([o,s])=>[o,Buffer.from(s,"base64")]))}}catch(n){console.warn("Failed to load encrypted auth store, starting empty:",n),c={}}}function p(){try{const n=S(),t=m.dirname(n);h.existsSync(t)||h.mkdirSync(t,{recursive:!0});const e=Object.fromEntries(Object.entries(c).map(([o,s])=>[o,s.toString("base64")]));h.writeFileSync(n,JSON.stringify(e),"utf8")}catch(n){console.warn("Failed to persist encrypted auth store:",n)}}function v(){i=new r.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:m.join(__dirname,"preload.js")},show:!1});const n=m.join(__dirname,"preload.js");if(console.log("Preload script path:",n),console.log("Preload script exists:",require("fs").existsSync(n)),require("fs").existsSync(n)){const e=require("fs").readFileSync(n,"utf8");console.log("Preload script first 200 chars:",e.substring(0,200))}if(i.webContents.session.webRequest.onHeadersReceived((e,o)=>{console.log("Setting CSP headers for URL:",e.url);const s={...e.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),o({responseHeaders:s})}),i.once("ready-to-show",()=>{i.show(),i.webContents.setBackgroundThrottling(!1)}),i.on("maximize",()=>{try{i==null||i.webContents.send("window-state",{maximized:!0})}catch{}}),i.on("unmaximize",()=>{try{i==null||i.webContents.send("window-state",{maximized:!1})}catch{}}),process.env.NODE_ENV==="development"||!r.app.isPackaged){console.log("Running in development mode");const e=(o,s=0)=>{const d=`http://localhost:${o}`;console.log(`Trying to load: ${d} (attempt ${s+1})`),i.loadURL(d).then(()=>{console.log(`Successfully loaded: ${d}`),i.webContents.openDevTools()}).catch(l=>{if(console.log(`Failed to load ${d}:`,l.message),s<3){const u=Math.min(1e3*Math.pow(2,s),5e3);console.log(`Retrying in ${u}ms...`),setTimeout(()=>e(o,s+1),u)}else o<5180?setTimeout(()=>e(o+1),1e3):(console.log("All ports failed, loading fallback HTML"),i.loadFile(m.join(__dirname,"../index.html")).catch(u=>{console.error("Failed to load fallback HTML:",u),i.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>")}))})};setTimeout(()=>e(5173),500)}else console.log("Running in production mode"),i.loadFile(m.join(__dirname,"../dist/index.html"));i.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")}),i.webContents.on("did-fail-load",(e,o,s)=>{console.error("Failed to load:",o,s)}),i.on("closed",()=>{i=null})}function C(){if(a&&!a.isDestroyed()){a.focus();return}a=new r.BrowserWindow({width:1920,height:1080,title:"sonomika",webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:m.join(__dirname,"mirror-preload.js")},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!0,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),a.loadURL(`data:text/html,${encodeURIComponent(`
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
  `)}`),a.once("ready-to-show",()=>{a.show(),a.center();try{a.setAspectRatio(f||1920/1080)}catch{}}),a.webContents.on("before-input-event",(t,e)=>{e.key==="Escape"&&a.close()})}function F(){a&&!a.isDestroyed()&&(a.close(),a=null)}function D(n,t){const e=g.get(n);if(e&&!e.isDestroyed()){try{e.focus()}catch{}return e}const o=m.join(__dirname,"mirror-preload.js"),s=m.join(__dirname,"preload.js"),d=h.existsSync(o)?o:s,l=new r.BrowserWindow({width:(t==null?void 0:t.width)??960,height:(t==null?void 0:t.height)??540,x:t==null?void 0:t.x,y:t==null?void 0:t.y,title:(t==null?void 0:t.title)??`VJ Mirror Slice: ${n}`,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:d},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,thickFrame:!1,hasShadow:!1,backgroundColor:"#000000",fullscreenable:!0,autoHideMenuBar:!0,minWidth:320,minHeight:180});try{l.setMenuBarVisibility(!1)}catch{}try{l.removeMenu()}catch{}const u=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${(t==null?void 0:t.title)??`VJ Mirror Slice: ${n}`}</title>
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
          try { window.advancedMirror && window.advancedMirror.toggleSliceFullscreen && window.advancedMirror.toggleSliceFullscreen('${n}'); } catch {}
        }
      <\/script>
    </body>
    </html>
  `;l.loadURL(`data:text/html,${encodeURIComponent(u)}`);try{l.show(),l.center()}catch{}return l.once("ready-to-show",()=>{try{l.isVisible()||(l.show(),l.center())}catch{}}),l.on("closed",()=>{g.delete(n)}),l.webContents.on("before-input-event",(b,w)=>{w.key==="Escape"&&l.close()}),g.set(n,l),l}function A(){const n=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{r.app.quit()}}]},{label:"External",submenu:[{label:"Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{label:"Advanced Mirror",accelerator:"CmdOrCtrl+Shift+M",click:()=>{i&&i.webContents.send("toggle-advanced-mirror")}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{i&&i.reload()}},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{i&&i.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],t=r.Menu.buildFromTemplate(n);r.Menu.setApplicationMenu(t)}r.app.whenReady().then(()=>{console.log("Electron app is ready"),r.app.commandLine.appendSwitch("disable-background-timer-throttling"),r.app.commandLine.appendSwitch("disable-renderer-backgrounding"),A(),k(),r.protocol.registerFileProtocol("local-file",(n,t)=>{const e=n.url.replace("local-file://","");console.log("Loading local file:",e),console.log("Request URL:",n.url),console.log("File path resolved:",e),t(e)}),r.ipcMain.handle("show-open-dialog",async(n,t)=>await r.dialog.showOpenDialog(i,t)),r.ipcMain.handle("show-save-dialog",async(n,t)=>await r.dialog.showSaveDialog(i,t)),r.ipcMain.handle("save-file",async(n,t,e)=>{try{return await h.promises.writeFile(t,e,"utf8"),!0}catch(o){return console.error("Failed to save file:",o),!1}}),r.ipcMain.handle("read-file-text",async(n,t)=>{try{return await h.promises.readFile(t,"utf8")}catch(e){return console.error("Failed to read file:",e),null}}),r.ipcMain.handle("read-local-file-base64",async(n,t)=>{try{return(await h.promises.readFile(t)).toString("base64")}catch(e){throw console.error("Failed to read local file:",t,e),e}}),r.ipcMain.handle("authStorage:isEncryptionAvailable",()=>{try{return r.safeStorage.isEncryptionAvailable()}catch{return!1}}),r.ipcMain.on("authStorage:isEncryptionAvailableSync",n=>{try{n.returnValue=r.safeStorage.isEncryptionAvailable()}catch{n.returnValue=!1}}),r.ipcMain.handle("authStorage:save",async(n,t,e)=>{try{return t?e==null||e===""?(delete c[t],p(),!0):(r.safeStorage.isEncryptionAvailable()?c[t]=r.safeStorage.encryptString(e):c[t]=Buffer.from(e,"utf8"),p(),!0):!1}catch(o){return console.error("Failed to save auth blob:",o),!1}}),r.ipcMain.on("authStorage:saveSync",(n,t,e)=>{try{if(!t){n.returnValue=!1;return}if(e==null||e===""){delete c[t],p(),n.returnValue=!0;return}r.safeStorage.isEncryptionAvailable()?c[t]=r.safeStorage.encryptString(e):c[t]=Buffer.from(e,"utf8"),p(),n.returnValue=!0}catch(o){console.error("Failed to save auth blob (sync):",o),n.returnValue=!1}}),r.ipcMain.handle("authStorage:load",async(n,t)=>{try{if(!t)return null;const e=c[t];return e?r.safeStorage.isEncryptionAvailable()?r.safeStorage.decryptString(e):e.toString("utf8"):null}catch(e){return console.error("Failed to load auth blob:",e),null}}),r.ipcMain.on("authStorage:loadSync",(n,t)=>{try{if(!t){n.returnValue=null;return}const e=c[t];if(!e){n.returnValue=null;return}r.safeStorage.isEncryptionAvailable()?n.returnValue=r.safeStorage.decryptString(e):n.returnValue=e.toString("utf8")}catch(e){console.error("Failed to load auth blob (sync):",e),n.returnValue=null}}),r.ipcMain.handle("authStorage:remove",async(n,t)=>{try{return t?(delete c[t],p(),!0):!1}catch(e){return console.error("Failed to remove auth blob:",e),!1}}),r.ipcMain.on("authStorage:removeSync",(n,t)=>{try{if(!t){n.returnValue=!1;return}delete c[t],p(),n.returnValue=!0}catch(e){console.error("Failed to remove auth blob (sync):",e),n.returnValue=!1}}),r.ipcMain.handle("authStorage:loadAll",async()=>{try{const n={};for(const[t,e]of Object.entries(c))try{r.safeStorage.isEncryptionAvailable()?n[t]=r.safeStorage.decryptString(e):n[t]=e.toString("utf8")}catch{}return n}catch(n){return console.error("Failed to loadAll auth blobs:",n),{}}}),r.ipcMain.on("toggle-app-fullscreen",()=>{if(i&&!i.isDestroyed()){const{screen:n}=require("electron");if(i.isKiosk()||i.isFullScreen())i.setKiosk(!1),i.setFullScreen(!1),i.setBounds({width:1200,height:800}),i.center();else{const t=i.getBounds(),e=n.getDisplayMatching(t);i.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),i.setMenuBarVisibility(!1),i.setFullScreenable(!0),i.setAlwaysOnTop(!0),i.setKiosk(!0),i.setFullScreen(!0)}}}),r.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),i?(console.log("Main: calling mainWindow.minimize()"),i.minimize()):console.log("Main: mainWindow is null")}),r.ipcMain.on("window-maximize",()=>{if(console.log("Main: window-maximize IPC received"),i)if(i.isMaximized()){console.log("Main: calling mainWindow.unmaximize()"),i.unmaximize();try{i.webContents.send("window-state",{maximized:!1})}catch{}}else{console.log("Main: calling mainWindow.maximize()"),i.maximize();try{i.webContents.send("window-state",{maximized:!0})}catch{}}else console.log("Main: mainWindow is null")}),r.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),i?(console.log("Main: calling mainWindow.close()"),i.close()):console.log("Main: mainWindow is null")}),r.ipcMain.on("toggle-mirror",()=>{i&&i.webContents.send("toggle-mirror")}),r.ipcMain.on("open-mirror-window",()=>{C()}),r.ipcMain.on("close-mirror-window",()=>{F()}),r.ipcMain.on("set-mirror-bg",(n,t)=>{if(a&&!a.isDestroyed()){const e=typeof t=="string"?t.replace(/'/g,"\\'"):"#000000";a.webContents.executeJavaScript(`document.body.style.background='${e}'`)}}),r.ipcMain.on("canvas-data",(n,t)=>{if(a&&!a.isDestroyed()){const e=t.replace(/'/g,"\\'");a.webContents.executeJavaScript(`
        (function() {
          const noStreamDiv = document.getElementById('no-stream');
          const mirrorImage = document.getElementById('mirror-image');
          
          if (noStreamDiv && mirrorImage) {
            // Hide the waiting message
            noStreamDiv.style.display = 'none';
            
            // Only update if the image source is different to prevent flashing
            if (mirrorImage.src !== '${e}') {
              mirrorImage.src = '${e}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),r.ipcMain.on("sendCanvasData",(n,t)=>{if(a&&!a.isDestroyed()){const e=t.replace(/'/g,"\\'");a.webContents.executeJavaScript(`
        (function() {
          const noStreamDiv = document.getElementById('no-stream');
          const mirrorImage = document.getElementById('mirror-image');
          
          if (noStreamDiv && mirrorImage) {
            // Hide the waiting message
            noStreamDiv.style.display = 'none';
            
            // Only update if the image source is different to prevent flashing
            if (mirrorImage.src !== '${e}') {
              mirrorImage.src = '${e}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),r.ipcMain.on("toggle-fullscreen",()=>{if(a&&!a.isDestroyed()){const{screen:n}=require("electron");if(a.isKiosk()||a.isFullScreen())a.setKiosk(!1),a.setFullScreen(!1),a.setBounds({x:void 0,y:void 0,width:1920,height:1080}),a.center();else{const t=a.getBounds(),e=n.getDisplayMatching(t);a.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),a.setMenuBarVisibility(!1),a.setFullScreenable(!0),a.setAlwaysOnTop(!0),a.setKiosk(!0),a.setFullScreen(!0)}}}),r.ipcMain.on("resize-mirror-window",(n,t,e)=>{if(a&&!a.isDestroyed()){try{let o=Math.max(1,Number(t)||1),s=Math.max(1,Number(e)||1);const{screen:d}=require("electron"),u=d.getPrimaryDisplay().workArea,b=Math.floor(u.width*.9),w=Math.floor(u.height*.9),I=o/s;if(o>b||s>w){const M=b/o,x=w/s,y=Math.min(M,x);o=Math.floor(o*y),s=Math.floor(s*y)}o=Math.max(480,o),s=Math.max(270,s),f&&isFinite(f)&&f>0&&(s=Math.max(1,Math.round(o/f))),console.log("Resizing mirror window to:",o,"x",s,"(aspect locked:",!!f,")"),a.setSize(o,s)}catch{}a.center()}}),r.ipcMain.on("set-mirror-aspect",(n,t,e)=>{if(a&&!a.isDestroyed())try{const o=Math.max(1,Number(t)||1),s=Math.max(1,Number(e)||1);f=o/s,a.setAspectRatio(f)}catch{}}),r.ipcMain.on("advanced-mirror:open",(n,t)=>{try{if(console.log("[main] advanced-mirror:open",Array.isArray(t)?t.map(e=>e==null?void 0:e.id):t),Array.isArray(t))for(const e of t)console.log("[main] createAdvancedMirrorWindow",e==null?void 0:e.id),D(String(e.id),e)}catch(e){console.warn("advanced-mirror:open error",e)}}),r.ipcMain.on("advanced-mirror:closeAll",()=>{try{g.forEach((n,t)=>{try{n.isDestroyed()||n.close()}catch{}g.delete(t)})}catch(n){console.warn("advanced-mirror:closeAll error",n)}}),r.ipcMain.on("advanced-mirror:sendSliceData",(n,t,e)=>{const o=g.get(String(t));if(o&&!o.isDestroyed()){const s=(typeof e=="string"?e:"").replace(/'/g,"\\'");o.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${s}') {
              mirrorImage.src = '${s}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),r.ipcMain.on("advanced-mirror:setBg",(n,t,e)=>{const o=g.get(String(t));if(o&&!o.isDestroyed()){const s=typeof e=="string"?e.replace(/'/g,"\\'"):"#000000";o.webContents.executeJavaScript(`document.body.style.background='${s}'`)}}),r.ipcMain.on("advanced-mirror:resize",(n,t,e,o)=>{const s=g.get(String(t));if(s&&!s.isDestroyed())try{s.setSize(e,o),s.center()}catch{}}),r.ipcMain.on("advanced-mirror:toggleFullscreen",(n,t)=>{const e=g.get(String(t));if(e&&!e.isDestroyed()){const{screen:o}=require("electron");if(e.isKiosk()||e.isFullScreen())try{e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:960,height:540}),e.center()}catch{}else try{const s=e.getBounds(),d=o.getDisplayMatching(s);e.setBounds({x:d.bounds.x,y:d.bounds.y,width:d.bounds.width,height:d.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}catch{}}}),v(),r.app.on("activate",()=>{r.BrowserWindow.getAllWindows().length===0&&v()})});r.app.on("window-all-closed",()=>{process.platform!=="darwin"&&r.app.quit()});process.on("uncaughtException",n=>{console.error("Uncaught Exception:",n)});process.on("unhandledRejection",(n,t)=>{console.error("Unhandled Rejection at:",t,"reason:",n)});
