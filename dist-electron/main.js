"use strict";const r=require("electron"),g=require("fs"),u=require("path"),F=r.app.requestSingleInstanceLock();F?r.app.on("second-instance",()=>{const o=r.BrowserWindow.getAllWindows();o.length>0&&(o[0].isMinimized()&&o[0].restore(),o[0].focus())}):(console.log("Another instance is already running, quitting..."),r.app.quit());let n=null,a=null,y=null,S=null,v=null,w=null;const h=new Map;let d={};function k(){const o=r.app.getPath("userData");return u.join(o,"auth_store.json")}function A(){try{const o=k();if(g.existsSync(o)){const t=g.readFileSync(o,"utf8"),e=JSON.parse(t);d=Object.fromEntries(Object.entries(e).map(([i,s])=>[i,Buffer.from(s,"base64")]))}}catch(o){console.warn("Failed to load encrypted auth store, starting empty:",o),d={}}}function b(){try{const o=k(),t=u.dirname(o);g.existsSync(t)||g.mkdirSync(t,{recursive:!0});const e=Object.fromEntries(Object.entries(d).map(([i,s])=>[i,s.toString("base64")]));g.writeFileSync(o,JSON.stringify(e),"utf8")}catch(o){console.warn("Failed to persist encrypted auth store:",o)}}function x(){n=new r.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:u.join(__dirname,"preload.js"),backgroundThrottling:!1},show:!1});const o=u.join(__dirname,"preload.js");if(console.log("Preload script path:",o),console.log("Preload script exists:",require("fs").existsSync(o)),require("fs").existsSync(o)){const e=require("fs").readFileSync(o,"utf8");console.log("Preload script first 200 chars:",e.substring(0,200))}n.webContents.session.webRequest.onHeadersReceived((e,i)=>{console.log("Setting CSP headers for URL:",e.url);const s={...e.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),i({responseHeaders:s})}),n.once("ready-to-show",()=>{n.show(),n.webContents.setBackgroundThrottling(!1)});try{n.webContents.setWindowOpenHandler(e=>e.frameName==="output-canvas"?{action:"allow",overrideBrowserWindowOptions:{title:"Output",frame:!1,titleBarStyle:"hidden",autoHideMenuBar:!0,backgroundColor:"#000000",fullscreenable:!0,resizable:!0,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,backgroundThrottling:!1}}}:{action:"allow"}),n.webContents.on("did-create-window",(e,i)=>{try{if(i?.frameName==="output-canvas"){S=e;try{e.removeMenu()}catch{}try{e.setMenuBarVisibility(!1)}catch{}try{e.webContents.setBackgroundThrottling(!1)}catch{}try{v&&isFinite(v)&&v>0&&e.setAspectRatio(v)}catch{}try{e.on("closed",()=>{S=null})}catch{}}}catch{}})}catch{}if(n.on("maximize",()=>{try{n?.webContents.send("window-state",{maximized:!0})}catch{}}),n.on("unmaximize",()=>{try{n?.webContents.send("window-state",{maximized:!1})}catch{}}),process.env.NODE_ENV==="development"||!r.app.isPackaged){console.log("Running in development mode");const e=(i,s=0)=>{const l=`http://localhost:${i}`;console.log(`Trying to load: ${l} (attempt ${s+1})`),n.loadURL(l).then(()=>{console.log(`Successfully loaded: ${l}`),n.webContents.openDevTools()}).catch(c=>{if(console.log(`Failed to load ${l}:`,c.message),s<3){const p=Math.min(1e3*Math.pow(2,s),5e3);console.log(`Retrying in ${p}ms...`),setTimeout(()=>e(i,s+1),p)}else{console.log("All ports failed, loading fallback HTML");const m=[u.join(__dirname,"../web/index.html"),u.join(__dirname,"../dist/index.html"),u.join(__dirname,"../index.html"),u.join(__dirname,"../../index.html")].find(f=>{try{return g.existsSync(f)}catch{return!1}});m?(console.log("Loading fallback file:",m),n.loadFile(m).catch(f=>{console.error("Failed to load fallback HTML:",f),n.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>")})):(console.warn("No fallback index.html found. Loading data URL."),n.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Loading...</p></body></html>"))}})};setTimeout(()=>e(5173),500)}else{console.log("Running in production mode");const e=[u.join(__dirname,"../web/index.html"),u.join(__dirname,"../dist/index.html")],i=e.find(s=>{try{return g.existsSync(s)}catch{return!1}});i?(console.log("Loading production file:",i),n.loadFile(i)):(console.error("No production index.html found at",e),n.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>"))}n.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")});try{n.webContents.on("render-process-gone",(e,i)=>{console.error("[electron] render-process-gone",i)}),n.webContents.on("unresponsive",()=>{console.error("[electron] webContents became unresponsive")}),n.webContents.on("media-started-playing",()=>{console.log("[electron] media-started-playing")}),n.webContents.on("media-paused",()=>{console.log("[electron] media-paused")})}catch{}n.webContents.on("did-fail-load",(e,i,s)=>{console.error("Failed to load:",i,s)}),n.on("closed",()=>{n=null})}function D(){if(a&&!a.isDestroyed()){a.focus();return}a=new r.BrowserWindow({width:1920,height:1080,title:"sonomika",webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:u.join(__dirname,"mirror-preload.js"),backgroundThrottling:!1},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),a.loadURL(`data:text/html,${encodeURIComponent(`
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
  `)}`),a.once("ready-to-show",()=>{a.show(),a.center();try{a.setAspectRatio(w||1920/1080)}catch{}try{y==null&&(y=r.powerSaveBlocker.start("prevent-display-sleep")),a.webContents.setBackgroundThrottling(!1)}catch{}}),a.webContents.on("before-input-event",(t,e)=>{e.key==="Escape"&&a.close()}),a.on("closed",()=>{try{y!=null&&r.powerSaveBlocker.stop(y)}catch{}y=null,console.log("Mirror window closed, notifying main app"),n&&!n.isDestroyed()&&n.webContents.send("mirror-window-closed"),a=null})}function B(){a&&!a.isDestroyed()&&(a.close(),a=null)}function R(o,t){const e=h.get(o);if(e&&!e.isDestroyed()){try{e.focus()}catch{}return e}const i=u.join(__dirname,"mirror-preload.js"),s=u.join(__dirname,"preload.js"),l=g.existsSync(i)?i:s,c=new r.BrowserWindow({width:t?.width??960,height:t?.height??540,x:t?.x,y:t?.y,title:t?.title??`VJ Mirror Slice: ${o}`,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:l},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,thickFrame:!1,hasShadow:!1,backgroundColor:"#000000",fullscreenable:!0,autoHideMenuBar:!0,minWidth:320,minHeight:180});try{c.setMenuBarVisibility(!1)}catch{}try{c.removeMenu()}catch{}const p=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${t?.title??`VJ Mirror Slice: ${o}`}</title>
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
          try { window.advancedMirror && window.advancedMirror.toggleSliceFullscreen && window.advancedMirror.toggleSliceFullscreen('${o}'); } catch {}
        }
      <\/script>
    </body>
    </html>
  `;c.loadURL(`data:text/html,${encodeURIComponent(p)}`);try{c.show(),c.center()}catch{}return c.once("ready-to-show",()=>{try{c.isVisible()||(c.show(),c.center())}catch{}}),c.on("closed",()=>{h.delete(o)}),c.webContents.on("before-input-event",(m,f)=>{f.key==="Escape"&&c.close()}),h.set(o,c),c}function P(){const o=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{r.app.quit()}}]},{label:"External",submenu:[{label:"Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{n&&n.webContents.send("toggle-mirror")}},{label:"Advanced Mirror",accelerator:"CmdOrCtrl+Shift+M",click:()=>{n&&n.webContents.send("toggle-advanced-mirror")}}]},{label:"Record",submenu:[{label:"Record",accelerator:"CmdOrCtrl+Shift+R",click:()=>{n&&n.webContents.send("record:start")}},{label:"Record Settings",click:()=>{n&&n.webContents.send("record:settings")}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{n&&n.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Toggle Debug Overlay",accelerator:"CmdOrCtrl+Shift+D",click:()=>{try{n?.webContents.send("debug:toggleOverlay")}catch{}}},{label:"Show Debug Panel",accelerator:"CmdOrCtrl+Alt+D",click:()=>{try{n?.webContents.send("debug:openPanel")}catch{}}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{n&&n.reload()}},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{n&&n.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],t=r.Menu.buildFromTemplate(o);r.Menu.setApplicationMenu(t)}r.app.whenReady().then(()=>{console.log("Electron app is ready");try{r.app.commandLine.appendSwitch("autoplay-policy","no-user-gesture-required")}catch{}r.app.commandLine.appendSwitch("disable-background-timer-throttling"),r.app.commandLine.appendSwitch("disable-renderer-backgrounding"),P(),A(),r.protocol.registerFileProtocol("local-file",(o,t)=>{const e=o.url.replace("local-file://","");console.log("Loading local file:",e),console.log("Request URL:",o.url),console.log("File path resolved:",e),t(e)}),r.ipcMain.handle("show-open-dialog",async(o,t)=>await r.dialog.showOpenDialog(n,t)),r.ipcMain.handle("show-save-dialog",async(o,t)=>{console.log("Show save dialog called with options:",t);const e=await r.dialog.showSaveDialog(n,t);return console.log("Save dialog result:",e),e}),r.ipcMain.handle("save-file",async(o,t,e)=>{try{return await g.promises.writeFile(t,e,"utf8"),!0}catch(i){return console.error("Failed to save file:",i),!1}}),r.ipcMain.handle("save-binary-file",async(o,t,e)=>{try{return console.log("Saving binary file to:",t,"Size:",e.length,"bytes"),await g.promises.writeFile(t,Buffer.from(e)),console.log("Binary file saved successfully"),!0}catch(i){return console.error("Failed to save binary file:",i),!1}}),r.ipcMain.handle("get-system-audio-stream",async()=>{try{const{desktopCapturer:o}=require("electron"),t=await o.getSources({types:["screen"],thumbnailSize:{width:1,height:1}});if(t.length===0)throw new Error("No screen sources available");return{success:!0,sourceId:(t.find(i=>i.name==="Entire Screen")||t[0]).id}}catch(o){return console.error("Failed to get system audio stream:",o),{success:!1,error:String(o)}}}),r.ipcMain.handle("read-file-text",async(o,t)=>{try{return await g.promises.readFile(t,"utf8")}catch(e){return console.error("Failed to read file:",e),null}}),r.ipcMain.handle("read-local-file-base64",async(o,t)=>{try{return(await g.promises.readFile(t)).toString("base64")}catch(e){throw console.error("Failed to read local file:",t,e),e}}),r.ipcMain.handle("read-audio-bytes",async(o,t)=>{try{const{fileURLToPath:e}=require("url"),i=typeof t=="string"&&t.startsWith("file:")?e(t):t,s=await g.promises.readFile(i);return s.buffer.slice(s.byteOffset,s.byteOffset+s.byteLength)}catch(e){return console.error("read-audio-bytes failed for",t,e),new ArrayBuffer(0)}}),r.ipcMain.handle("authStorage:isEncryptionAvailable",()=>{try{return r.safeStorage.isEncryptionAvailable()}catch{return!1}}),r.ipcMain.on("authStorage:isEncryptionAvailableSync",o=>{try{o.returnValue=r.safeStorage.isEncryptionAvailable()}catch{o.returnValue=!1}}),r.ipcMain.handle("authStorage:save",async(o,t,e)=>{try{return t?e==null||e===""?(delete d[t],b(),!0):(r.safeStorage.isEncryptionAvailable()?d[t]=r.safeStorage.encryptString(e):d[t]=Buffer.from(e,"utf8"),b(),!0):!1}catch(i){return console.error("Failed to save auth blob:",i),!1}}),r.ipcMain.on("authStorage:saveSync",(o,t,e)=>{try{if(!t){o.returnValue=!1;return}if(e==null||e===""){delete d[t],b(),o.returnValue=!0;return}r.safeStorage.isEncryptionAvailable()?d[t]=r.safeStorage.encryptString(e):d[t]=Buffer.from(e,"utf8"),b(),o.returnValue=!0}catch(i){console.error("Failed to save auth blob (sync):",i),o.returnValue=!1}}),r.ipcMain.handle("authStorage:load",async(o,t)=>{try{if(!t)return null;const e=d[t];return e?r.safeStorage.isEncryptionAvailable()?r.safeStorage.decryptString(e):e.toString("utf8"):null}catch(e){return console.error("Failed to load auth blob:",e),null}}),r.ipcMain.on("authStorage:loadSync",(o,t)=>{try{if(!t){o.returnValue=null;return}const e=d[t];if(!e){o.returnValue=null;return}r.safeStorage.isEncryptionAvailable()?o.returnValue=r.safeStorage.decryptString(e):o.returnValue=e.toString("utf8")}catch(e){console.error("Failed to load auth blob (sync):",e),o.returnValue=null}}),r.ipcMain.handle("authStorage:remove",async(o,t)=>{try{return t?(delete d[t],b(),!0):!1}catch(e){return console.error("Failed to remove auth blob:",e),!1}}),r.ipcMain.on("authStorage:removeSync",(o,t)=>{try{if(!t){o.returnValue=!1;return}delete d[t],b(),o.returnValue=!0}catch(e){console.error("Failed to remove auth blob (sync):",e),o.returnValue=!1}}),r.ipcMain.handle("authStorage:loadAll",async()=>{try{const o={};for(const[t,e]of Object.entries(d))try{r.safeStorage.isEncryptionAvailable()?o[t]=r.safeStorage.decryptString(e):o[t]=e.toString("utf8")}catch{}return o}catch(o){return console.error("Failed to loadAll auth blobs:",o),{}}}),r.ipcMain.on("toggle-app-fullscreen",()=>{if(n&&!n.isDestroyed()){const{screen:o}=require("electron");if(n.isKiosk()||n.isFullScreen())n.setKiosk(!1),n.setFullScreen(!1),n.setBounds({width:1200,height:800}),n.center();else{const t=n.getBounds(),e=o.getDisplayMatching(t);n.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),n.setMenuBarVisibility(!1),n.setFullScreenable(!0),n.setAlwaysOnTop(!0),n.setKiosk(!0),n.setFullScreen(!0)}}}),r.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),n?(console.log("Main: calling mainWindow.minimize()"),n.minimize()):console.log("Main: mainWindow is null")}),r.ipcMain.on("window-maximize",()=>{if(console.log("Main: window-maximize IPC received"),n)if(n.isMaximized()){console.log("Main: calling mainWindow.unmaximize()"),n.unmaximize();try{n.webContents.send("window-state",{maximized:!1})}catch{}}else{console.log("Main: calling mainWindow.maximize()"),n.maximize();try{n.webContents.send("window-state",{maximized:!0})}catch{}}else console.log("Main: mainWindow is null")}),r.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),n?(console.log("Main: calling mainWindow.close()"),n.close()):console.log("Main: mainWindow is null")}),r.ipcMain.on("toggle-mirror",()=>{n&&n.webContents.send("toggle-mirror")}),r.ipcMain.on("open-mirror-window",()=>{D()}),r.ipcMain.on("close-mirror-window",()=>{B()}),r.ipcMain.on("set-mirror-bg",(o,t)=>{if(a&&!a.isDestroyed()){const e=typeof t=="string"?t.replace(/'/g,"\\'"):"#000000";a.webContents.executeJavaScript(`document.body.style.background='${e}'`)}}),r.ipcMain.on("canvas-data",(o,t)=>{a&&!a.isDestroyed()&&a.webContents.send("update-canvas",t)}),r.ipcMain.on("sendCanvasData",(o,t)=>{if(a&&!a.isDestroyed())try{const e=(typeof t=="string"?t:"").replace(/'/g,"\\'");a.webContents.executeJavaScript(`
          (function(){
            try {
              var noStream = document.getElementById('no-stream');
              var img = document.getElementById('mirror-image');
              if (noStream) noStream.style.display = 'none';
              if (img) {
                if (img.src !== '${e}') {
                  img.src = '${e}';
                  img.style.display = 'block';
                }
              }
            } catch(e) {}
          })();
        `)}catch{}}),r.ipcMain.on("toggle-fullscreen",()=>{if(a&&!a.isDestroyed()){const{screen:o}=require("electron");if(a.isKiosk()||a.isFullScreen())a.setKiosk(!1),a.setFullScreen(!1),a.setBounds({x:void 0,y:void 0,width:1920,height:1080}),a.center();else{const t=a.getBounds(),e=o.getDisplayMatching(t);a.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),a.setMenuBarVisibility(!1),a.setFullScreenable(!0),a.setAlwaysOnTop(!0),a.setKiosk(!0),a.setFullScreen(!0)}}}),r.ipcMain.on("resize-mirror-window",(o,t,e)=>{if(a&&!a.isDestroyed()){try{let i=Math.max(1,Number(t)||1),s=Math.max(1,Number(e)||1);const{screen:l}=require("electron"),p=l.getPrimaryDisplay().workArea,m=Math.floor(p.width*.9),f=Math.floor(p.height*.9),I=i/s;if(i>m||s>f){const C=m/i,z=f/s,M=Math.min(C,z);i=Math.floor(i*M),s=Math.floor(s*M)}i=Math.max(480,i),s=Math.max(270,s),w&&isFinite(w)&&w>0&&(s=Math.max(1,Math.round(i/w))),console.log("Resizing mirror window to:",i,"x",s,"(aspect locked:",!!w,")"),a.setSize(i,s)}catch{}a.center()}}),r.ipcMain.on("set-mirror-aspect",(o,t,e)=>{try{const i=Math.max(1,Number(t)||1),s=Math.max(1,Number(e)||1),l=i/s;if(w=l,v=l,a&&!a.isDestroyed())try{a.setAspectRatio(l)}catch{}if(S&&!S.isDestroyed())try{S.setAspectRatio(l)}catch{}}catch{}}),r.ipcMain.on("advanced-mirror:open",(o,t)=>{try{if(console.log("[main] advanced-mirror:open",Array.isArray(t)?t.map(e=>e?.id):t),Array.isArray(t))for(const e of t)console.log("[main] createAdvancedMirrorWindow",e?.id),R(String(e.id),e)}catch(e){console.warn("advanced-mirror:open error",e)}}),r.ipcMain.on("advanced-mirror:closeAll",()=>{try{h.forEach((o,t)=>{try{o.isDestroyed()||o.close()}catch{}h.delete(t)})}catch(o){console.warn("advanced-mirror:closeAll error",o)}}),r.ipcMain.on("advanced-mirror:sendSliceData",(o,t,e)=>{const i=h.get(String(t));if(i&&!i.isDestroyed()){const s=(typeof e=="string"?e:"").replace(/'/g,"\\'");i.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${s}') {
              mirrorImage.src = '${s}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),r.ipcMain.on("advanced-mirror:setBg",(o,t,e)=>{const i=h.get(String(t));if(i&&!i.isDestroyed()){const s=typeof e=="string"?e.replace(/'/g,"\\'"):"#000000";i.webContents.executeJavaScript(`document.body.style.background='${s}'`)}}),r.ipcMain.on("advanced-mirror:resize",(o,t,e,i)=>{const s=h.get(String(t));if(s&&!s.isDestroyed())try{s.setSize(e,i),s.center()}catch{}}),r.ipcMain.on("advanced-mirror:toggleFullscreen",(o,t)=>{const e=h.get(String(t));if(e&&!e.isDestroyed()){const{screen:i}=require("electron");if(e.isKiosk()||e.isFullScreen())try{e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:960,height:540}),e.center()}catch{}else try{const s=e.getBounds(),l=i.getDisplayMatching(s);e.setBounds({x:l.bounds.x,y:l.bounds.y,width:l.bounds.width,height:l.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}catch{}}}),x(),r.app.on("activate",()=>{r.BrowserWindow.getAllWindows().length===0&&x()})});r.app.on("window-all-closed",()=>{process.platform!=="darwin"&&r.app.quit()});process.on("uncaughtException",o=>{console.error("Uncaught Exception:",o)});process.on("unhandledRejection",(o,t)=>{console.error("Unhandled Rejection at:",t,"reason:",o)});
