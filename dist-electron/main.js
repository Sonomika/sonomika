"use strict";const n=require("electron"),u=require("fs"),c=require("path"),L=process.env.VJ_DEBUG_LOGS!=="true";if(L){const l=()=>{};console.log=l,console.warn=l,console.info=l}process.env.ELECTRON_DISABLE_SECURITY_WARNINGS="true";const N=n.app.requestSingleInstanceLock();N?n.app.on("second-instance",()=>{const l=n.BrowserWindow.getAllWindows();l.length>0&&(l[0].isMinimized()&&l[0].restore(),l[0].focus())}):(console.log("Another instance is already running, quitting..."),n.app.quit());let i=null,a=null,A=null,I=null,D=null,z=null;const C=new Map;let w={};function O(){const l=[c.join(process.cwd(),"public","icons","sonomika_icon_2.png"),c.join(__dirname,"../public/icons/sonomika_icon_2.png"),c.join(__dirname,"../../public/icons/sonomika_icon_2.png"),c.join(__dirname,"../icons/sonomika_icon_2.png"),c.join(process.resourcesPath||"","icons","sonomika_icon_2.png"),...process.platform==="win32"?[c.join(process.cwd(),"public","icons","sonomika_icon_2.ico"),c.join(__dirname,"../public/icons/sonomika_icon_2.ico"),c.join(__dirname,"../../public/icons/sonomika_icon_2.ico"),c.join(__dirname,"../icons/sonomika_icon_2.ico"),c.join(process.resourcesPath||"","icons","sonomika_icon_2.ico")]:[]];for(const d of l)try{if(u.existsSync(d))return d}catch{}}function q(){const l=n.app.getPath("userData");return c.join(l,"auth_store.json")}function U(){try{const l=q();if(u.existsSync(l)){const d=u.readFileSync(l,"utf8"),m=JSON.parse(d);w=Object.fromEntries(Object.entries(m).map(([g,o])=>[g,Buffer.from(o,"base64")]))}}catch(l){console.warn("Failed to load encrypted auth store, starting empty:",l),w={}}}function j(){try{const l=q(),d=c.dirname(l);u.existsSync(d)||u.mkdirSync(d,{recursive:!0});const m=Object.fromEntries(Object.entries(w).map(([g,o])=>[g,o.toString("base64")]));u.writeFileSync(l,JSON.stringify(m),"utf8")}catch(l){console.warn("Failed to persist encrypted auth store:",l)}}function H(){try{const l=n.app.getPath("documents"),d=c.join(l,"Sonomika");u.existsSync(d)||(u.mkdirSync(d,{recursive:!0}),console.log("Created Sonomika folder in Documents:",d));const m=["bank","midi mapping","music","recordings","sets","video","ai-templates"];for(const p of m){const h=c.join(d,p);u.existsSync(h)||(u.mkdirSync(h,{recursive:!0}),console.log("Created folder:",h))}const g=[c.join(process.resourcesPath||"","app.asar.unpacked","bank"),c.join(__dirname,"../bank"),c.join(process.cwd(),"bank")],o=c.join(d,"bank");let t=!1;for(const p of g)if(u.existsSync(p)&&!t)try{B(p,o),console.log("Copied bank folder from",p,"to",o),t=!0}catch(h){console.warn("Failed to copy bank folder from",p,":",h)}const e=[c.join(process.resourcesPath||"","app.asar.unpacked","user-documents","sets"),c.join(__dirname,"../user-documents","sets"),c.join(process.cwd(),"user-documents","sets"),c.join(process.resourcesPath||"","app.asar.unpacked","sets"),c.join(__dirname,"../sets"),c.join(process.cwd(),"sets"),c.join(process.cwd(),"bundled","sets")],r=c.join(d,"sets");for(const p of e)if(u.existsSync(p))try{B(p,r),console.log("Copied sets folder from",p,"to",r);break}catch(h){console.warn("Failed to copy sets folder from",p,":",h)}const s=[c.join(process.resourcesPath||"","app.asar.unpacked","user-documents"),c.join(__dirname,"../user-documents"),c.join(process.cwd(),"user-documents")];for(const p of s)if(u.existsSync(p))try{const h=["midi mapping","music","recordings","video"];for(const y of h){const _=c.join(p,y),x=c.join(d,y);u.existsSync(_)&&(B(_,x),console.log("Copied",y,"folder from",_,"to",x))}break}catch(h){console.warn("Failed to copy user-documents folders from",p,":",h)}const f=c.join(d,"ai-templates");u.existsSync(f)||u.mkdirSync(f,{recursive:!0});const P=n.app.getAppPath(),b=[c.join(process.resourcesPath||"","src","ai-templates"),c.join(process.resourcesPath||"","app.asar.unpacked","src","ai-templates"),c.join(__dirname,"../src/ai-templates"),c.join(__dirname,"../../src/ai-templates"),c.join(P,"src/ai-templates"),c.join(process.cwd(),"src/ai-templates")];let v=0;const k=(u.existsSync(f)?u.readdirSync(f).filter(p=>p.endsWith(".js")):[]).length===0;k&&console.log("AI templates folder is empty, will copy template files...");for(const p of b)if(u.existsSync(p))try{console.log("Checking AI templates source path:",p);const h=u.readdirSync(p,{withFileTypes:!0});console.log(`Found ${h.length} entries in ${p}`);for(const y of h)if(y.isFile()&&y.name.endsWith(".js")){const _=c.join(p,y.name),x=c.join(f,y.name);!u.existsSync(x)||k?(u.copyFileSync(_,x),console.log("Copied AI template file:",y.name,"to",x),v++):console.log("Skipped AI template file (already exists):",y.name)}if(v>0){console.log(`Successfully copied ${v} AI template file(s) from ${p}`);break}}catch(h){console.warn("Failed to copy AI templates from",p,":",h)}else console.log("AI templates source path does not exist:",p);v===0&&(console.warn("⚠️ No AI template files were copied. Checked paths:",b),console.warn("   This might indicate the template files are not included in the build."))}catch(l){console.error("Failed to initialize user Documents folders:",l)}}function B(l,d){u.existsSync(d)||u.mkdirSync(d,{recursive:!0});const m=u.readdirSync(l,{withFileTypes:!0});for(const g of m){const o=c.join(l,g.name),t=c.join(d,g.name);g.isDirectory()?B(o,t):u.existsSync(t)||u.copyFileSync(o,t)}}function $(){const l=O(),d=l?n.nativeImage.createFromPath(l):void 0;i=new n.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",icon:d,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:c.join(__dirname,"preload.js"),backgroundThrottling:!1},show:!1});const m=c.join(__dirname,"preload.js");if(console.log("Preload script path:",m),console.log("Preload script exists:",require("fs").existsSync(m)),require("fs").existsSync(m)){const o=require("fs").readFileSync(m,"utf8");console.log("Preload script first 200 chars:",o.substring(0,200))}i.webContents.session.webRequest.onHeadersReceived((o,t)=>{console.log("Setting CSP headers for URL:",o.url);const e={...o.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),t({responseHeaders:e})}),i.once("ready-to-show",()=>{i.show(),i.webContents.setBackgroundThrottling(!1)});try{i.webContents.setWindowOpenHandler(o=>o.frameName==="output-canvas"?{action:"allow",overrideBrowserWindowOptions:{title:"Output",frame:!1,titleBarStyle:"hidden",autoHideMenuBar:!0,backgroundColor:"#000000",fullscreenable:!0,resizable:!0,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,backgroundThrottling:!1}}}:{action:"allow"}),i.webContents.on("did-create-window",(o,t)=>{try{if(t?.frameName==="output-canvas"){I=o;try{o.removeMenu()}catch{}try{o.setMenuBarVisibility(!1)}catch{}try{o.webContents.setBackgroundThrottling(!1)}catch{}try{D&&isFinite(D)&&D>0&&o.setAspectRatio(D)}catch{}try{o.on("closed",()=>{I=null})}catch{}}}catch{}})}catch{}if(i.on("maximize",()=>{try{i?.webContents.send("window-state",{maximized:!0})}catch{}}),i.on("unmaximize",()=>{try{i?.webContents.send("window-state",{maximized:!1})}catch{}}),process.env.NODE_ENV==="development"||!n.app.isPackaged){console.log("Running in development mode");const o=process.env.VITE_DEV_SERVER_URL||process.env.ELECTRON_RENDERER_URL,t=Number(process.env.VITE_DEV_SERVER_PORT||5173),e=[],r=f=>{f&&(e.includes(f)||e.push(f))};r(o),r(`http://localhost:${t}`),r(`http://127.0.0.1:${t}`);const s=(f,P=0)=>{if(!i)return;if(f.length===0){console.warn("All dev server attempts failed; showing inline error page");const k=encodeURIComponent(`<!DOCTYPE html><html><body style="font-family: sans-serif; background: #141414; color: #f5f5f5; padding: 32px;">
          <h1>Dev Server Not Available</h1>
          <p>Could not connect to the Vite dev server on port ${t}.</p>
          <p>Make sure it is running with:</p>
          <pre style="background:#1f1f1f; padding:16px; border-radius:8px;">npm run dev
npm run dev:electron</pre>
        </body></html>`);i.loadURL(`data:text/html,${k}`);return}const b=f[0],v=f.slice(1),S=P+1;console.log(`Trying dev server URL: ${b} (attempt ${S})`),i.loadURL(b).then(()=>{console.log(`Electron loaded renderer from ${b}`),i?.webContents.openDevTools({mode:"detach"})}).catch(k=>{console.warn(`Failed to load ${b}: ${k?.message||k}`);const p=Math.min(5e3,1e3*Math.pow(2,P));console.log(`Retrying with next candidate in ${p}ms`),setTimeout(()=>s(v,S),p)})};setTimeout(()=>s(e),1200)}else{console.log("Running in production mode");const o=n.app.getAppPath(),t=[c.join(o,"dist/index.html"),c.join(__dirname,"../dist/index.html"),c.join(__dirname,"../web/index.html")],e=t.find(r=>{try{return u.existsSync(r)}catch{return!1}});e?(console.log("Loading production file:",e),i.loadFile(e)):(console.error("No production index.html found at",t),console.error("App path:",o),console.error("__dirname:",__dirname),i.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>"))}i.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")});try{i.webContents.on("render-process-gone",(o,t)=>{console.error("[electron] render-process-gone",t)}),i.webContents.on("unresponsive",()=>{console.error("[electron] webContents became unresponsive")}),i.webContents.on("media-started-playing",()=>{console.log("[electron] media-started-playing")}),i.webContents.on("media-paused",()=>{console.log("[electron] media-paused")})}catch{}i.webContents.on("did-fail-load",(o,t,e)=>{console.error("Failed to load:",t,e)}),i.on("closed",()=>{i=null})}function J(){if(a&&!a.isDestroyed()){a.focus();return}const l=O(),d=l?n.nativeImage.createFromPath(l):void 0;a=new n.BrowserWindow({width:1920,height:1080,title:"sonomika",icon:d,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:c.join(__dirname,"mirror-preload.js"),backgroundThrottling:!1},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),a.loadURL(`data:text/html,${encodeURIComponent(`
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
  `)}`),a.once("ready-to-show",()=>{a.show(),a.center();try{a.setAspectRatio(z||1920/1080)}catch{}try{A==null&&(A=n.powerSaveBlocker.start("prevent-display-sleep")),a.webContents.setBackgroundThrottling(!1)}catch{}}),a.webContents.on("before-input-event",(g,o)=>{o.key==="Escape"&&a.close()}),a.on("closed",()=>{try{A!=null&&n.powerSaveBlocker.stop(A)}catch{}A=null,console.log("Mirror window closed, notifying main app"),i&&!i.isDestroyed()&&i.webContents.send("mirror-window-closed"),a=null})}function K(){a&&!a.isDestroyed()&&(a.close(),a=null)}function Y(l,d){const m=C.get(l);if(m&&!m.isDestroyed()){try{m.focus()}catch{}return m}const g=c.join(__dirname,"mirror-preload.js"),o=c.join(__dirname,"preload.js"),t=u.existsSync(g)?g:o,e=O(),r=e?n.nativeImage.createFromPath(e):void 0,s=new n.BrowserWindow({width:d?.width??960,height:d?.height??540,x:d?.x,y:d?.y,title:d?.title??`VJ Mirror Slice: ${l}`,icon:r,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:t},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,thickFrame:!1,hasShadow:!1,backgroundColor:"#000000",fullscreenable:!0,autoHideMenuBar:!0,minWidth:320,minHeight:180});try{s.setMenuBarVisibility(!1)}catch{}try{s.removeMenu()}catch{}const f=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${d?.title??`VJ Mirror Slice: ${l}`}</title>
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
          try { window.advancedMirror && window.advancedMirror.toggleSliceFullscreen && window.advancedMirror.toggleSliceFullscreen('${l}'); } catch {}
        }
      <\/script>
    </body>
    </html>
  `;s.loadURL(`data:text/html,${encodeURIComponent(f)}`);try{s.show(),s.center()}catch{}return s.once("ready-to-show",()=>{try{s.isVisible()||(s.show(),s.center())}catch{}}),s.on("closed",()=>{C.delete(l)}),s.webContents.on("before-input-event",(P,b)=>{b.key==="Escape"&&s.close()}),C.set(l,s),s}function G(){const l=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{n.app.quit()}}]},{label:"External",submenu:[{label:"Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{label:"Advanced Mirror",accelerator:"CmdOrCtrl+Shift+M",click:()=>{i&&i.webContents.send("toggle-advanced-mirror")}}]},{label:"Record",submenu:[{label:"Record",accelerator:"CmdOrCtrl+Shift+R",click:()=>{i&&i.webContents.send("record:start")}},{label:"Record Settings",click:()=>{i&&i.webContents.send("record:settings")}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{i&&i.reload()}}]},{label:"Developer",submenu:[{label:"Toggle Debug Overlay",accelerator:"CmdOrCtrl+Shift+D",click:()=>{try{i?.webContents.send("debug:toggleOverlay")}catch{}}},{label:"Show Debug Panel",accelerator:"CmdOrCtrl+Alt+D",click:()=>{try{i?.webContents.send("debug:openPanel")}catch{}}},{type:"separator"},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{i&&i.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],d=n.Menu.buildFromTemplate(l);n.Menu.setApplicationMenu(d)}n.app.whenReady().then(()=>{console.log("Electron app is ready");try{n.app.commandLine.appendSwitch("autoplay-policy","no-user-gesture-required")}catch{}try{const o=O();process.platform==="darwin"&&o&&n.app.dock&&typeof n.app.dock.setIcon=="function"&&n.app.dock.setIcon(n.nativeImage.createFromPath(o))}catch{}n.app.commandLine.appendSwitch("disable-background-timer-throttling"),n.app.commandLine.appendSwitch("disable-renderer-backgrounding"),n.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");try{const o=n.app.commandLine.getSwitchValue("disable-features"),t="CalculateNativeWinOcclusion";o&&o.length>0?o.split(",").includes(t)||n.app.commandLine.appendSwitch("disable-features",`${o},${t}`):n.app.commandLine.appendSwitch("disable-features",t)}catch{}G(),U(),H(),n.protocol.registerFileProtocol("local-file",(o,t)=>{const e=o.url.replace("local-file://","");console.log("Loading local file:",e),console.log("Request URL:",o.url),console.log("File path resolved:",e),t(e)}),n.ipcMain.handle("show-open-dialog",async(o,t)=>await n.dialog.showOpenDialog(i,t)),n.ipcMain.handle("show-save-dialog",async(o,t)=>{console.log("Show save dialog called with options:",t);const e=await n.dialog.showSaveDialog(i,t);return console.log("Save dialog result:",e),e}),n.ipcMain.handle("save-file",async(o,t,e)=>{try{return await u.promises.writeFile(t,e,"utf8"),!0}catch(r){return console.error("Failed to save file:",r),!1}}),n.ipcMain.handle("save-binary-file",async(o,t,e)=>{try{return console.log("Saving binary file to:",t,"Size:",e.length,"bytes"),await u.promises.writeFile(t,Buffer.from(e)),console.log("Binary file saved successfully"),!0}catch(r){return console.error("Failed to save binary file:",r),!1}}),require("os");const{spawn:l}=require("child_process"),d=(()=>{try{const o=require("ffmpeg-static");return console.log("[offline] ffmpeg-static path:",o),o}catch{return console.warn("[offline] ffmpeg-static not found"),null}})();let m=null,g=null;n.ipcMain.handle("offline-render:start",async(o,t)=>{try{const e=c.join(n.app.getPath("userData"),"offline-renders"),r=c.join(e,`${Date.now()}_${(t?.name||"movie").replace(/[^a-z0-9_-]/ig,"_")}`);return await u.promises.mkdir(r,{recursive:!0}),m={dir:r,name:String(t?.name||"movie"),fps:Number(t?.fps)||0,index:0,width:Number(t?.width)||1920,height:Number(t?.height)||1080,quality:t?.quality||"medium"},g=null,console.log("[offline] start",{dir:r,fps:m.fps||"preview",quality:m.quality,size:`${m.width}x${m.height}`}),{success:!0,dir:r}}catch(e){return console.error("[offline] start error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:frame",async(o,t)=>{if(!m)return{success:!1,error:"No session"};try{const e=m,r=c.join(e.dir,`frame_${String(e.index).padStart(6,"0")}.png`),s=String(t?.dataUrl||"").replace(/^data:image\/png;base64,/,"");return await u.promises.writeFile(r,Buffer.from(s,"base64")),e.index+=1,e.index%60===0&&console.log("[offline] saved frames:",e.index),{success:!0,index:e.index}}catch(e){return console.error("[offline] frame error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:finish",async(o,t)=>{if(!m)return{success:!1,error:"No session"};const e=m;m=null;try{if(!e||!isFinite(e.index)||e.index<=0)return{success:!1,error:"No frames captured"};if(!d)throw new Error("ffmpeg-static not found");const r=t?.destPath&&typeof t.destPath=="string"?String(t.destPath):"",s=r&&r.trim().length>0?r.toLowerCase().endsWith(".mp4")?r:`${r}.mp4`:c.join(e.dir,`${e.name}.mp4`),f=c.dirname(s);try{await u.promises.mkdir(f,{recursive:!0})}catch{}const P=c.join(f,"frame_%06d.png"),b=c.join(e.dir,"frame_%06d.png"),v=Number(t?.fps)||0,S=v>0?v:e.fps&&e.fps>0?e.fps:0,k=c.join(e.dir,"frame_*.png").replace(/\\/g,"/"),p=["-y",...S>0?["-framerate",String(S)]:[],"-safe","0","-pattern_type","glob","-i",k];let h;const y=async M=>{try{const F=await u.promises.stat(M);return F.isFile()&&F.size>0}catch{return!1}};if(h)try{for(let M=0;M<15&&!await y(h);M++)await new Promise(F=>setTimeout(F,100));await y(h)||(console.warn("[offline] audio not ready, skipping audio mux"),h=void 0)}catch{h=void 0}h&&p.push("-i",h,"-shortest");const _=e.quality==="high"?"16":e.quality==="low"?"24":"18";p.push("-pix_fmt","yuv420p","-c:v","libx264","-preset","medium","-crf",_,s);const x=M=>new Promise((F,E)=>{console.log("[offline] finish: spawning ffmpeg",d,M.join(" "));const W=l(d,M,{stdio:["ignore","pipe","pipe"],windowsVerbatimArguments:!0});let V="";W.stderr?.on("data",R=>{try{const T=R.toString();V+=T,console.log("[ffmpeg]",T.trim())}catch{}}),W.on("error",E),W.on("close",R=>R===0?F():E(new Error(`ffmpeg exited ${R}: ${V.split(`
`).slice(-6).join(`
`)}`)))});try{await x(p)}catch(M){if(h){console.warn("[offline] mux with audio failed, retrying without audio");const F=p.slice(0,0),E=["-y",...S>0?["-framerate",String(S)]:[],"-safe","0","-pattern_type","glob","-i",k,"-pix_fmt","yuv420p","-c:v","libx264","-preset","medium","-crf",_,s];await x(E)}else throw M}console.log("[offline] finished. Video at",s);try{g&&await u.promises.unlink(g)}catch{}return g=null,{success:!0,videoPath:s}}catch(r){return console.error("[offline] finish error",r),{success:!1,error:String(r)}}}),n.ipcMain.handle("get-system-audio-stream",async()=>{try{const{desktopCapturer:o}=require("electron"),t=await o.getSources({types:["screen"],thumbnailSize:{width:1,height:1}});if(t.length===0)throw new Error("No screen sources available");return{success:!0,sourceId:(t.find(r=>r.name==="Entire Screen")||t[0]).id}}catch(o){return console.error("Failed to get system audio stream:",o),{success:!1,error:String(o)}}}),n.ipcMain.handle("get-documents-folder",async()=>{try{const o=n.app.getPath("documents");return{success:!0,path:c.join(o,"Sonomika")}}catch(o){return console.error("Failed to get Documents folder:",o),{success:!1,error:String(o)}}}),n.ipcMain.handle("read-file-text",async(o,t)=>{try{return await u.promises.readFile(t,"utf8")}catch(e){return console.error("Failed to read file:",e),null}}),n.ipcMain.handle("read-local-file-base64",async(o,t)=>{try{return(await u.promises.readFile(t)).toString("base64")}catch(e){throw console.error("Failed to read local file:",t,e),e}}),n.ipcMain.handle("read-audio-bytes",async(o,t)=>{try{const{fileURLToPath:e}=require("url"),r=typeof t=="string"&&t.startsWith("file:")?e(t):t,s=await u.promises.readFile(r);return s.buffer.slice(s.byteOffset,s.byteOffset+s.byteLength)}catch(e){return console.error("read-audio-bytes failed for",t,e),new ArrayBuffer(0)}}),n.ipcMain.handle("authStorage:isEncryptionAvailable",()=>{try{return n.safeStorage.isEncryptionAvailable()}catch{return!1}}),n.ipcMain.on("authStorage:isEncryptionAvailableSync",o=>{try{o.returnValue=n.safeStorage.isEncryptionAvailable()}catch{o.returnValue=!1}}),n.ipcMain.handle("authStorage:save",async(o,t,e)=>{try{return t?e==null||e===""?(delete w[t],j(),!0):(n.safeStorage.isEncryptionAvailable()?w[t]=n.safeStorage.encryptString(e):w[t]=Buffer.from(e,"utf8"),j(),!0):!1}catch(r){return console.error("Failed to save auth blob:",r),!1}}),n.ipcMain.on("authStorage:saveSync",(o,t,e)=>{try{if(!t){o.returnValue=!1;return}if(e==null||e===""){delete w[t],j(),o.returnValue=!0;return}n.safeStorage.isEncryptionAvailable()?w[t]=n.safeStorage.encryptString(e):w[t]=Buffer.from(e,"utf8"),j(),o.returnValue=!0}catch(r){console.error("Failed to save auth blob (sync):",r),o.returnValue=!1}}),n.ipcMain.handle("authStorage:load",async(o,t)=>{try{if(!t)return null;const e=w[t];return e?n.safeStorage.isEncryptionAvailable()?n.safeStorage.decryptString(e):e.toString("utf8"):null}catch(e){return console.error("Failed to load auth blob:",e),null}}),n.ipcMain.on("authStorage:loadSync",(o,t)=>{try{if(!t){o.returnValue=null;return}const e=w[t];if(!e){o.returnValue=null;return}n.safeStorage.isEncryptionAvailable()?o.returnValue=n.safeStorage.decryptString(e):o.returnValue=e.toString("utf8")}catch(e){console.error("Failed to load auth blob (sync):",e),o.returnValue=null}}),n.ipcMain.handle("authStorage:remove",async(o,t)=>{try{return t?(delete w[t],j(),!0):!1}catch(e){return console.error("Failed to remove auth blob:",e),!1}}),n.ipcMain.on("authStorage:removeSync",(o,t)=>{try{if(!t){o.returnValue=!1;return}delete w[t],j(),o.returnValue=!0}catch(e){console.error("Failed to remove auth blob (sync):",e),o.returnValue=!1}}),n.ipcMain.handle("authStorage:loadAll",async()=>{try{const o={};for(const[t,e]of Object.entries(w))try{n.safeStorage.isEncryptionAvailable()?o[t]=n.safeStorage.decryptString(e):o[t]=e.toString("utf8")}catch{}return o}catch(o){return console.error("Failed to loadAll auth blobs:",o),{}}}),n.ipcMain.handle("get-screen-sizes",async()=>{try{const{screen:o}=require("electron"),t=o.getAllDisplays();console.log("Electron main: Detected displays:",t.length),t.forEach((r,s)=>{console.log(`Display ${s+1}:`,{width:r.bounds.width,height:r.bounds.height,x:r.bounds.x,y:r.bounds.y,scaleFactor:r.scaleFactor,rotation:r.rotation,label:r.label})});const e=t.map(r=>({width:r.bounds.width,height:r.bounds.height}));return console.log("Electron main: Returning screen sizes:",e),e}catch(o){return console.error("Failed to get screen sizes:",o),[]}}),n.ipcMain.on("toggle-app-fullscreen",()=>{if(i&&!i.isDestroyed()){const{screen:o}=require("electron");if(i.isKiosk()||i.isFullScreen())i.setKiosk(!1),i.setFullScreen(!1),i.setBounds({width:1200,height:800}),i.center();else{const t=i.getBounds(),e=o.getDisplayMatching(t);i.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),i.setMenuBarVisibility(!1),i.setFullScreenable(!0),i.setAlwaysOnTop(!0),i.setKiosk(!0),i.setFullScreen(!0)}}}),n.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),i?(console.log("Main: calling mainWindow.minimize()"),i.minimize()):console.log("Main: mainWindow is null")}),n.ipcMain.on("window-maximize",()=>{if(console.log("Main: window-maximize IPC received"),i)if(i.isMaximized()){console.log("Main: calling mainWindow.unmaximize()"),i.unmaximize();try{i.webContents.send("window-state",{maximized:!1})}catch{}}else{console.log("Main: calling mainWindow.maximize()"),i.maximize();try{i.webContents.send("window-state",{maximized:!0})}catch{}}else console.log("Main: mainWindow is null")}),n.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),i?(console.log("Main: calling mainWindow.close()"),i.close()):console.log("Main: mainWindow is null")}),n.ipcMain.on("toggle-mirror",()=>{i&&i.webContents.send("toggle-mirror")}),n.ipcMain.on("open-mirror-window",()=>{J()}),n.ipcMain.on("close-mirror-window",()=>{K()}),n.ipcMain.on("set-mirror-bg",(o,t)=>{if(a&&!a.isDestroyed()){const e=typeof t=="string"?t.replace(/'/g,"\\'"):"#000000";a.webContents.executeJavaScript(`document.body.style.background='${e}'`)}}),n.ipcMain.on("canvas-data",(o,t)=>{a&&!a.isDestroyed()&&a.webContents.send("update-canvas",t)}),n.ipcMain.on("sendCanvasData",(o,t)=>{if(a&&!a.isDestroyed())try{const e=(typeof t=="string"?t:"").replace(/'/g,"\\'");a.webContents.executeJavaScript(`
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
        `)}catch{}}),n.ipcMain.on("toggle-fullscreen",()=>{if(a&&!a.isDestroyed()){const{screen:o}=require("electron");if(a.isKiosk()||a.isFullScreen()){a.setKiosk(!1),a.setFullScreen(!1);try{a.setVisibleOnAllWorkspaces(!1)}catch{}try{a.setAlwaysOnTop(!0)}catch{}a.setBounds({x:void 0,y:void 0,width:1920,height:1080});try{a.center()}catch{}try{a.focus()}catch{}}else{const t=a.getBounds(),e=o.getDisplayMatching(t);a.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height});try{a.setMenuBarVisibility(!1)}catch{}try{a.setFullScreenable(!0)}catch{}try{process.platform==="darwin"?a.setAlwaysOnTop(!0,"screen-saver"):a.setAlwaysOnTop(!0)}catch{}try{a.setVisibleOnAllWorkspaces(!0,{visibleOnFullScreen:!0})}catch{}try{a.moveTop?.()}catch{}try{a.show()}catch{}try{a.focus()}catch{}a.setKiosk(!0),a.setFullScreen(!0);try{a.moveTop?.()}catch{}try{a.focus()}catch{}}}}),n.ipcMain.on("resize-mirror-window",(o,t,e)=>{if(a&&!a.isDestroyed()){try{let r=Math.max(1,Number(t)||1),s=Math.max(1,Number(e)||1);const{screen:f}=require("electron"),b=f.getPrimaryDisplay().workArea,v=Math.floor(b.width*.9),S=Math.floor(b.height*.9),k=r/s;if(r>v||s>S){const p=v/r,h=S/s,y=Math.min(p,h);r=Math.floor(r*y),s=Math.floor(s*y)}r=Math.max(480,r),s=Math.max(270,s),z&&isFinite(z)&&z>0&&(s=Math.max(1,Math.round(r/z))),console.log("Resizing mirror window to:",r,"x",s,"(aspect locked:",!!z,")"),a.setSize(r,s)}catch{}a.center()}}),n.ipcMain.on("set-mirror-aspect",(o,t,e)=>{try{const r=Math.max(1,Number(t)||1),s=Math.max(1,Number(e)||1),f=r/s;if(z=f,D=f,a&&!a.isDestroyed())try{a.setAspectRatio(f)}catch{}if(I&&!I.isDestroyed())try{I.setAspectRatio(f)}catch{}}catch{}}),n.ipcMain.on("advanced-mirror:open",(o,t)=>{try{if(console.log("[main] advanced-mirror:open",Array.isArray(t)?t.map(e=>e?.id):t),Array.isArray(t))for(const e of t)console.log("[main] createAdvancedMirrorWindow",e?.id),Y(String(e.id),e)}catch(e){console.warn("advanced-mirror:open error",e)}}),n.ipcMain.on("advanced-mirror:closeAll",()=>{try{C.forEach((o,t)=>{try{o.isDestroyed()||o.close()}catch{}C.delete(t)})}catch(o){console.warn("advanced-mirror:closeAll error",o)}}),n.ipcMain.on("advanced-mirror:sendSliceData",(o,t,e)=>{const r=C.get(String(t));if(r&&!r.isDestroyed()){const s=(typeof e=="string"?e:"").replace(/'/g,"\\'");r.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${s}') {
              mirrorImage.src = '${s}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),n.ipcMain.on("advanced-mirror:setBg",(o,t,e)=>{const r=C.get(String(t));if(r&&!r.isDestroyed()){const s=typeof e=="string"?e.replace(/'/g,"\\'"):"#000000";r.webContents.executeJavaScript(`document.body.style.background='${s}'`)}}),n.ipcMain.on("advanced-mirror:resize",(o,t,e,r)=>{const s=C.get(String(t));if(s&&!s.isDestroyed())try{s.setSize(e,r),s.center()}catch{}}),n.ipcMain.on("advanced-mirror:toggleFullscreen",(o,t)=>{const e=C.get(String(t));if(e&&!e.isDestroyed()){const{screen:r}=require("electron");if(e.isKiosk()||e.isFullScreen())try{e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:960,height:540}),e.center()}catch{}else try{const s=e.getBounds(),f=r.getDisplayMatching(s);e.setBounds({x:f.bounds.x,y:f.bounds.y,width:f.bounds.width,height:f.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}catch{}}}),$(),n.app.on("activate",()=>{n.BrowserWindow.getAllWindows().length===0&&$()})});n.app.on("window-all-closed",()=>{process.platform!=="darwin"&&n.app.quit()});process.on("uncaughtException",l=>{console.error("Uncaught Exception:",l)});process.on("unhandledRejection",(l,d)=>{console.error("Unhandled Rejection at:",d,"reason:",l)});
