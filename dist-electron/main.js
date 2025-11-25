"use strict";const n=require("electron"),u=require("fs"),c=require("path"),B=process.env.VJ_DEBUG_LOGS!=="true";if(B){const a=()=>{};console.log=a,console.warn=a,console.info=a}process.env.ELECTRON_DISABLE_SECURITY_WARNINGS="true";const O=n.app.requestSingleInstanceLock();O?n.app.on("second-instance",()=>{const a=n.BrowserWindow.getAllWindows();a.length>0&&(a[0].isMinimized()&&a[0].restore(),a[0].focus())}):(console.log("Another instance is already running, quitting..."),n.app.quit());let i=null,s=null,P=null,A=null,j=null,M=null;const S=new Map;let y={};function I(){const a=[c.join(process.cwd(),"public","icons","sonomika_icon_2.png"),c.join(__dirname,"../public/icons/sonomika_icon_2.png"),c.join(__dirname,"../../public/icons/sonomika_icon_2.png"),c.join(__dirname,"../icons/sonomika_icon_2.png"),c.join(process.resourcesPath||"","icons","sonomika_icon_2.png"),...process.platform==="win32"?[c.join(process.cwd(),"public","icons","sonomika_icon_2.ico"),c.join(__dirname,"../public/icons/sonomika_icon_2.ico"),c.join(__dirname,"../../public/icons/sonomika_icon_2.ico"),c.join(__dirname,"../icons/sonomika_icon_2.ico"),c.join(process.resourcesPath||"","icons","sonomika_icon_2.ico")]:[]];for(const d of a)try{if(u.existsSync(d))return d}catch{}}function E(){const a=n.app.getPath("userData");return c.join(a,"auth_store.json")}function W(){try{const a=E();if(u.existsSync(a)){const d=u.readFileSync(a,"utf8"),o=JSON.parse(d);y=Object.fromEntries(Object.entries(o).map(([t,e])=>[t,Buffer.from(e,"base64")]))}}catch(a){console.warn("Failed to load encrypted auth store, starting empty:",a),y={}}}function z(){try{const a=E(),d=c.dirname(a);u.existsSync(d)||u.mkdirSync(d,{recursive:!0});const o=Object.fromEntries(Object.entries(y).map(([t,e])=>[t,e.toString("base64")]));u.writeFileSync(a,JSON.stringify(o),"utf8")}catch(a){console.warn("Failed to persist encrypted auth store:",a)}}function V(){try{const a=n.app.getPath("documents"),d=c.join(a,"Sonomika");u.existsSync(d)||(u.mkdirSync(d,{recursive:!0}),console.log("Created Sonomika folder in Documents:",d));const o=["bank","midi mapping","music","recordings","sets","video","ai-templates"];for(const p of o){const g=c.join(d,p);u.existsSync(g)||(u.mkdirSync(g,{recursive:!0}),console.log("Created folder:",g))}const t=[c.join(process.resourcesPath||"","app.asar.unpacked","bank"),c.join(__dirname,"../bank"),c.join(process.cwd(),"bank")],e=c.join(d,"bank");let r=!1;for(const p of t)if(u.existsSync(p)&&!r)try{D(p,e),console.log("Copied bank folder from",p,"to",e),r=!0}catch(g){console.warn("Failed to copy bank folder from",p,":",g)}const l=[c.join(process.resourcesPath||"","app.asar.unpacked","user-documents","sets"),c.join(__dirname,"../user-documents","sets"),c.join(process.cwd(),"user-documents","sets"),c.join(process.resourcesPath||"","app.asar.unpacked","sets"),c.join(__dirname,"../sets"),c.join(process.cwd(),"sets"),c.join(process.cwd(),"bundled","sets")],f=c.join(d,"sets");for(const p of l)if(u.existsSync(p))try{D(p,f),console.log("Copied sets folder from",p,"to",f);break}catch(g){console.warn("Failed to copy sets folder from",p,":",g)}const m=[c.join(process.resourcesPath||"","app.asar.unpacked","user-documents"),c.join(__dirname,"../user-documents"),c.join(process.cwd(),"user-documents")];for(const p of m)if(u.existsSync(p))try{const g=["midi mapping","music","recordings","video"];for(const w of g){const F=c.join(p,w),C=c.join(d,w);u.existsSync(F)&&(D(F,C),console.log("Copied",w,"folder from",F,"to",C))}break}catch(g){console.warn("Failed to copy user-documents folders from",p,":",g)}const h=c.join(d,"ai-templates");u.existsSync(h)||u.mkdirSync(h,{recursive:!0});const k=n.app.getAppPath(),b=[c.join(process.resourcesPath||"","src","ai-templates"),c.join(process.resourcesPath||"","app.asar.unpacked","src","ai-templates"),c.join(__dirname,"../src/ai-templates"),c.join(__dirname,"../../src/ai-templates"),c.join(k,"src/ai-templates"),c.join(process.cwd(),"src/ai-templates")];let x=0;const v=(u.existsSync(h)?u.readdirSync(h).filter(p=>p.endsWith(".js")):[]).length===0;v&&console.log("AI templates folder is empty, will copy template files...");for(const p of b)if(u.existsSync(p))try{console.log("Checking AI templates source path:",p);const g=u.readdirSync(p,{withFileTypes:!0});console.log(`Found ${g.length} entries in ${p}`);for(const w of g)if(w.isFile()&&w.name.endsWith(".js")){const F=c.join(p,w.name),C=c.join(h,w.name);!u.existsSync(C)||v?(u.copyFileSync(F,C),console.log("Copied AI template file:",w.name,"to",C),x++):console.log("Skipped AI template file (already exists):",w.name)}if(x>0){console.log(`Successfully copied ${x} AI template file(s) from ${p}`);break}}catch(g){console.warn("Failed to copy AI templates from",p,":",g)}else console.log("AI templates source path does not exist:",p);x===0&&(console.warn("⚠️ No AI template files were copied. Checked paths:",b),console.warn("   This might indicate the template files are not included in the build."))}catch(a){console.error("Failed to initialize user Documents folders:",a)}}function D(a,d){u.existsSync(d)||u.mkdirSync(d,{recursive:!0});const o=u.readdirSync(a,{withFileTypes:!0});for(const t of o){const e=c.join(a,t.name),r=c.join(d,t.name);t.isDirectory()?D(e,r):u.existsSync(r)||u.copyFileSync(e,r)}}function R(){const a=I(),d=a?n.nativeImage.createFromPath(a):void 0;i=new n.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",icon:d,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:c.join(__dirname,"preload.js"),backgroundThrottling:!1},show:!1});const o=c.join(__dirname,"preload.js");if(console.log("Preload script path:",o),console.log("Preload script exists:",require("fs").existsSync(o)),require("fs").existsSync(o)){const e=require("fs").readFileSync(o,"utf8");console.log("Preload script first 200 chars:",e.substring(0,200))}i.webContents.session.webRequest.onHeadersReceived((e,r)=>{console.log("Setting CSP headers for URL:",e.url);const l={...e.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),r({responseHeaders:l})}),i.once("ready-to-show",()=>{i.show(),i.webContents.setBackgroundThrottling(!1)});try{i.webContents.setWindowOpenHandler(e=>e.frameName==="output-canvas"?{action:"allow",overrideBrowserWindowOptions:{title:"Output",frame:!1,titleBarStyle:"hidden",autoHideMenuBar:!0,backgroundColor:"#000000",fullscreenable:!0,resizable:!0,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,backgroundThrottling:!1}}}:{action:"allow"}),i.webContents.on("did-create-window",(e,r)=>{try{if(r?.frameName==="output-canvas"){A=e;try{e.removeMenu()}catch{}try{e.setMenuBarVisibility(!1)}catch{}try{e.webContents.setBackgroundThrottling(!1)}catch{}try{j&&isFinite(j)&&j>0&&e.setAspectRatio(j)}catch{}try{e.on("closed",()=>{A=null})}catch{}}}catch{}})}catch{}if(i.on("maximize",()=>{try{i?.webContents.send("window-state",{maximized:!0})}catch{}}),i.on("unmaximize",()=>{try{i?.webContents.send("window-state",{maximized:!1})}catch{}}),process.env.NODE_ENV==="development"||!n.app.isPackaged){console.log("Running in development mode");const e=process.env.VITE_DEV_SERVER_URL||process.env.ELECTRON_RENDERER_URL,r=Number(process.env.VITE_DEV_SERVER_PORT||5173),l=[],f=h=>{h&&(l.includes(h)||l.push(h))};f(e),f(`http://localhost:${r}`),f(`http://127.0.0.1:${r}`);const m=(h,k=0)=>{if(!i)return;if(h.length===0){console.warn("All dev server attempts failed; showing inline error page");const v=encodeURIComponent(`<!DOCTYPE html><html><body style="font-family: sans-serif; background: #141414; color: #f5f5f5; padding: 32px;">
          <h1>Dev Server Not Available</h1>
          <p>Could not connect to the Vite dev server on port ${r}.</p>
          <p>Make sure it is running with:</p>
          <pre style="background:#1f1f1f; padding:16px; border-radius:8px;">npm run dev
npm run dev:electron</pre>
        </body></html>`);i.loadURL(`data:text/html,${v}`);return}const b=h[0],x=h.slice(1),_=k+1;console.log(`Trying dev server URL: ${b} (attempt ${_})`),i.loadURL(b).then(()=>{console.log(`Electron loaded renderer from ${b}`),i?.webContents.openDevTools({mode:"detach"})}).catch(v=>{console.warn(`Failed to load ${b}: ${v?.message||v}`);const p=Math.min(5e3,1e3*Math.pow(2,k));console.log(`Retrying with next candidate in ${p}ms`),setTimeout(()=>m(x,_),p)})};setTimeout(()=>m(l),1200)}else{console.log("Running in production mode");const e=n.app.getAppPath(),r=[c.join(e,"dist/index.html"),c.join(__dirname,"../dist/index.html"),c.join(__dirname,"../web/index.html")],l=r.find(f=>{try{return u.existsSync(f)}catch{return!1}});l?(console.log("Loading production file:",l),i.loadFile(l)):(console.error("No production index.html found at",r),console.error("App path:",e),console.error("__dirname:",__dirname),i.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>"))}i.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")});try{i.webContents.on("render-process-gone",(e,r)=>{console.error("[electron] render-process-gone",r)}),i.webContents.on("unresponsive",()=>{console.error("[electron] webContents became unresponsive")}),i.webContents.on("media-started-playing",()=>{console.log("[electron] media-started-playing")}),i.webContents.on("media-paused",()=>{console.log("[electron] media-paused")})}catch{}i.webContents.on("did-fail-load",(e,r,l)=>{console.error("Failed to load:",r,l)}),i.on("closed",()=>{i=null})}function T(){if(s&&!s.isDestroyed()){s.focus();return}const a=I(),d=a?n.nativeImage.createFromPath(a):void 0;s=new n.BrowserWindow({width:1920,height:1080,title:"sonomika",icon:d,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:c.join(__dirname,"mirror-preload.js"),backgroundThrottling:!1},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),s.loadURL(`data:text/html,${encodeURIComponent(`
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
  `)}`),s.once("ready-to-show",()=>{s.show(),s.center();try{s.setAspectRatio(M||1920/1080)}catch{}try{P==null&&(P=n.powerSaveBlocker.start("prevent-display-sleep")),s.webContents.setBackgroundThrottling(!1)}catch{}}),s.webContents.on("before-input-event",(t,e)=>{e.key==="Escape"&&s.close()}),s.on("closed",()=>{try{P!=null&&n.powerSaveBlocker.stop(P)}catch{}P=null,console.log("Mirror window closed, notifying main app"),i&&!i.isDestroyed()&&i.webContents.send("mirror-window-closed"),s=null})}function $(){s&&!s.isDestroyed()&&(s.close(),s=null)}function L(a,d){const o=S.get(a);if(o&&!o.isDestroyed()){try{o.focus()}catch{}return o}const t=c.join(__dirname,"mirror-preload.js"),e=c.join(__dirname,"preload.js"),r=u.existsSync(t)?t:e,l=I(),f=l?n.nativeImage.createFromPath(l):void 0,m=new n.BrowserWindow({width:d?.width??960,height:d?.height??540,x:d?.x,y:d?.y,title:d?.title??`VJ Mirror Slice: ${a}`,icon:f,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:r},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,thickFrame:!1,hasShadow:!1,backgroundColor:"#000000",fullscreenable:!0,autoHideMenuBar:!0,minWidth:320,minHeight:180});try{m.setMenuBarVisibility(!1)}catch{}try{m.removeMenu()}catch{}const h=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${d?.title??`VJ Mirror Slice: ${a}`}</title>
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
          try { window.advancedMirror && window.advancedMirror.toggleSliceFullscreen && window.advancedMirror.toggleSliceFullscreen('${a}'); } catch {}
        }
      <\/script>
    </body>
    </html>
  `;m.loadURL(`data:text/html,${encodeURIComponent(h)}`);try{m.show(),m.center()}catch{}return m.once("ready-to-show",()=>{try{m.isVisible()||(m.show(),m.center())}catch{}}),m.on("closed",()=>{S.delete(a)}),m.webContents.on("before-input-event",(k,b)=>{b.key==="Escape"&&m.close()}),S.set(a,m),m}function N(){const a=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{n.app.quit()}}]},{label:"External",submenu:[{label:"Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{label:"Advanced Mirror",accelerator:"CmdOrCtrl+Shift+M",click:()=>{i&&i.webContents.send("toggle-advanced-mirror")}}]},{label:"Record",submenu:[{label:"Record",accelerator:"CmdOrCtrl+Shift+R",click:()=>{i&&i.webContents.send("record:start")}},{label:"Record Settings",click:()=>{i&&i.webContents.send("record:settings")}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{i&&i.reload()}}]},{label:"Developer",submenu:[{label:"Toggle Debug Overlay",accelerator:"CmdOrCtrl+Shift+D",click:()=>{try{i?.webContents.send("debug:toggleOverlay")}catch{}}},{label:"Show Debug Panel",accelerator:"CmdOrCtrl+Alt+D",click:()=>{try{i?.webContents.send("debug:openPanel")}catch{}}},{type:"separator"},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{i&&i.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],d=n.Menu.buildFromTemplate(a);n.Menu.setApplicationMenu(d)}n.app.whenReady().then(()=>{console.log("Electron app is ready");try{n.app.commandLine.appendSwitch("autoplay-policy","no-user-gesture-required")}catch{}try{const o=I();process.platform==="darwin"&&o&&n.app.dock&&typeof n.app.dock.setIcon=="function"&&n.app.dock.setIcon(n.nativeImage.createFromPath(o))}catch{}n.app.commandLine.appendSwitch("disable-background-timer-throttling"),n.app.commandLine.appendSwitch("disable-renderer-backgrounding"),n.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");try{const o=n.app.commandLine.getSwitchValue("disable-features"),t="CalculateNativeWinOcclusion";o&&o.length>0?o.split(",").includes(t)||n.app.commandLine.appendSwitch("disable-features",`${o},${t}`):n.app.commandLine.appendSwitch("disable-features",t)}catch{}N(),W(),V(),n.protocol.registerFileProtocol("local-file",(o,t)=>{const e=o.url.replace("local-file://","");console.log("Loading local file:",e),console.log("Request URL:",o.url),console.log("File path resolved:",e),t(e)}),n.ipcMain.handle("show-open-dialog",async(o,t)=>await n.dialog.showOpenDialog(i,t)),n.ipcMain.handle("show-save-dialog",async(o,t)=>{console.log("Show save dialog called with options:",t);const e=await n.dialog.showSaveDialog(i,t);return console.log("Save dialog result:",e),e}),n.ipcMain.handle("save-file",async(o,t,e)=>{try{return await u.promises.writeFile(t,e,"utf8"),!0}catch(r){return console.error("Failed to save file:",r),!1}}),n.ipcMain.handle("save-binary-file",async(o,t,e)=>{try{return console.log("Saving binary file to:",t,"Size:",e.length,"bytes"),await u.promises.writeFile(t,Buffer.from(e)),console.log("Binary file saved successfully"),!0}catch(r){return console.error("Failed to save binary file:",r),!1}});let a=null,d=null;n.ipcMain.handle("offline-render:start",async(o,t)=>{try{const e=c.join(n.app.getPath("userData"),"offline-renders"),r=c.join(e,`${Date.now()}_${(t?.name||"movie").replace(/[^a-z0-9_-]/ig,"_")}`);return await u.promises.mkdir(r,{recursive:!0}),a={dir:r,name:String(t?.name||"movie"),fps:Number(t?.fps)||0,index:0,width:Number(t?.width)||1920,height:Number(t?.height)||1080,quality:t?.quality||"medium"},d=null,console.log("[offline] start",{dir:r,fps:a.fps||"preview",quality:a.quality,size:`${a.width}x${a.height}`}),{success:!0,dir:r}}catch(e){return console.error("[offline] start error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:frame",async(o,t)=>{if(!a)return{success:!1,error:"No session"};try{const e=a,r=c.join(e.dir,`frame_${String(e.index).padStart(6,"0")}.png`),l=String(t?.dataUrl||"").replace(/^data:image\/png;base64,/,"");return await u.promises.writeFile(r,Buffer.from(l,"base64")),e.index+=1,e.index%60===0&&console.log("[offline] saved frames:",e.index),{success:!0,index:e.index}}catch(e){return console.error("[offline] frame error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:finish",async(o,t)=>{if(!a)return{success:!1,error:"No session"};a=null;try{return{success:!1,error:"Offline rendering is disabled. Please use WebM recording via MediaRecorder instead."}}catch(e){return console.error("[offline] finish error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("get-system-audio-stream",async()=>{try{const{desktopCapturer:o}=require("electron"),t=await o.getSources({types:["screen"],thumbnailSize:{width:1,height:1}});if(t.length===0)throw new Error("No screen sources available");return{success:!0,sourceId:(t.find(r=>r.name==="Entire Screen")||t[0]).id}}catch(o){return console.error("Failed to get system audio stream:",o),{success:!1,error:String(o)}}}),n.ipcMain.handle("get-documents-folder",async()=>{try{const o=n.app.getPath("documents");return{success:!0,path:c.join(o,"Sonomika")}}catch(o){return console.error("Failed to get Documents folder:",o),{success:!1,error:String(o)}}}),n.ipcMain.handle("read-file-text",async(o,t)=>{try{return await u.promises.readFile(t,"utf8")}catch(e){return console.error("Failed to read file:",e),null}}),n.ipcMain.handle("read-local-file-base64",async(o,t)=>{try{return(await u.promises.readFile(t)).toString("base64")}catch(e){throw console.error("Failed to read local file:",t,e),e}}),n.ipcMain.handle("read-audio-bytes",async(o,t)=>{try{const{fileURLToPath:e}=require("url"),r=typeof t=="string"&&t.startsWith("file:")?e(t):t,l=await u.promises.readFile(r);return l.buffer.slice(l.byteOffset,l.byteOffset+l.byteLength)}catch(e){return console.error("read-audio-bytes failed for",t,e),new ArrayBuffer(0)}}),n.ipcMain.handle("authStorage:isEncryptionAvailable",()=>{try{return n.safeStorage.isEncryptionAvailable()}catch{return!1}}),n.ipcMain.on("authStorage:isEncryptionAvailableSync",o=>{try{o.returnValue=n.safeStorage.isEncryptionAvailable()}catch{o.returnValue=!1}}),n.ipcMain.handle("authStorage:save",async(o,t,e)=>{try{return t?e==null||e===""?(delete y[t],z(),!0):(n.safeStorage.isEncryptionAvailable()?y[t]=n.safeStorage.encryptString(e):y[t]=Buffer.from(e,"utf8"),z(),!0):!1}catch(r){return console.error("Failed to save auth blob:",r),!1}}),n.ipcMain.on("authStorage:saveSync",(o,t,e)=>{try{if(!t){o.returnValue=!1;return}if(e==null||e===""){delete y[t],z(),o.returnValue=!0;return}n.safeStorage.isEncryptionAvailable()?y[t]=n.safeStorage.encryptString(e):y[t]=Buffer.from(e,"utf8"),z(),o.returnValue=!0}catch(r){console.error("Failed to save auth blob (sync):",r),o.returnValue=!1}}),n.ipcMain.handle("authStorage:load",async(o,t)=>{try{if(!t)return null;const e=y[t];return e?n.safeStorage.isEncryptionAvailable()?n.safeStorage.decryptString(e):e.toString("utf8"):null}catch(e){return console.error("Failed to load auth blob:",e),null}}),n.ipcMain.on("authStorage:loadSync",(o,t)=>{try{if(!t){o.returnValue=null;return}const e=y[t];if(!e){o.returnValue=null;return}n.safeStorage.isEncryptionAvailable()?o.returnValue=n.safeStorage.decryptString(e):o.returnValue=e.toString("utf8")}catch(e){console.error("Failed to load auth blob (sync):",e),o.returnValue=null}}),n.ipcMain.handle("authStorage:remove",async(o,t)=>{try{return t?(delete y[t],z(),!0):!1}catch(e){return console.error("Failed to remove auth blob:",e),!1}}),n.ipcMain.on("authStorage:removeSync",(o,t)=>{try{if(!t){o.returnValue=!1;return}delete y[t],z(),o.returnValue=!0}catch(e){console.error("Failed to remove auth blob (sync):",e),o.returnValue=!1}}),n.ipcMain.handle("authStorage:loadAll",async()=>{try{const o={};for(const[t,e]of Object.entries(y))try{n.safeStorage.isEncryptionAvailable()?o[t]=n.safeStorage.decryptString(e):o[t]=e.toString("utf8")}catch{}return o}catch(o){return console.error("Failed to loadAll auth blobs:",o),{}}}),n.ipcMain.handle("get-screen-sizes",async()=>{try{const{screen:o}=require("electron"),t=o.getAllDisplays();console.log("Electron main: Detected displays:",t.length),t.forEach((r,l)=>{console.log(`Display ${l+1}:`,{width:r.bounds.width,height:r.bounds.height,x:r.bounds.x,y:r.bounds.y,scaleFactor:r.scaleFactor,rotation:r.rotation,label:r.label})});const e=t.map(r=>({width:r.bounds.width,height:r.bounds.height}));return console.log("Electron main: Returning screen sizes:",e),e}catch(o){return console.error("Failed to get screen sizes:",o),[]}}),n.ipcMain.on("toggle-app-fullscreen",()=>{if(i&&!i.isDestroyed()){const{screen:o}=require("electron");if(i.isKiosk()||i.isFullScreen())i.setKiosk(!1),i.setFullScreen(!1),i.setBounds({width:1200,height:800}),i.center();else{const t=i.getBounds(),e=o.getDisplayMatching(t);i.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),i.setMenuBarVisibility(!1),i.setFullScreenable(!0),i.setAlwaysOnTop(!0),i.setKiosk(!0),i.setFullScreen(!0)}}}),n.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),i?(console.log("Main: calling mainWindow.minimize()"),i.minimize()):console.log("Main: mainWindow is null")}),n.ipcMain.on("window-maximize",()=>{if(console.log("Main: window-maximize IPC received"),i)if(i.isMaximized()){console.log("Main: calling mainWindow.unmaximize()"),i.unmaximize();try{i.webContents.send("window-state",{maximized:!1})}catch{}}else{console.log("Main: calling mainWindow.maximize()"),i.maximize();try{i.webContents.send("window-state",{maximized:!0})}catch{}}else console.log("Main: mainWindow is null")}),n.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),i?(console.log("Main: calling mainWindow.close()"),i.close()):console.log("Main: mainWindow is null")}),n.ipcMain.on("toggle-mirror",()=>{i&&i.webContents.send("toggle-mirror")}),n.ipcMain.on("open-mirror-window",()=>{T()}),n.ipcMain.on("close-mirror-window",()=>{$()}),n.ipcMain.on("set-mirror-bg",(o,t)=>{if(s&&!s.isDestroyed()){const e=typeof t=="string"?t.replace(/'/g,"\\'"):"#000000";s.webContents.executeJavaScript(`document.body.style.background='${e}'`)}}),n.ipcMain.on("canvas-data",(o,t)=>{s&&!s.isDestroyed()&&s.webContents.send("update-canvas",t)}),n.ipcMain.on("sendCanvasData",(o,t)=>{if(s&&!s.isDestroyed())try{const e=(typeof t=="string"?t:"").replace(/'/g,"\\'");s.webContents.executeJavaScript(`
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
        `)}catch{}}),n.ipcMain.on("toggle-fullscreen",()=>{if(s&&!s.isDestroyed()){const{screen:o}=require("electron");if(s.isKiosk()||s.isFullScreen()){s.setKiosk(!1),s.setFullScreen(!1);try{s.setVisibleOnAllWorkspaces(!1)}catch{}try{s.setAlwaysOnTop(!0)}catch{}s.setBounds({x:void 0,y:void 0,width:1920,height:1080});try{s.center()}catch{}try{s.focus()}catch{}}else{const t=s.getBounds(),e=o.getDisplayMatching(t);s.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height});try{s.setMenuBarVisibility(!1)}catch{}try{s.setFullScreenable(!0)}catch{}try{process.platform==="darwin"?s.setAlwaysOnTop(!0,"screen-saver"):s.setAlwaysOnTop(!0)}catch{}try{s.setVisibleOnAllWorkspaces(!0,{visibleOnFullScreen:!0})}catch{}try{s.moveTop?.()}catch{}try{s.show()}catch{}try{s.focus()}catch{}s.setKiosk(!0),s.setFullScreen(!0);try{s.moveTop?.()}catch{}try{s.focus()}catch{}}}}),n.ipcMain.on("resize-mirror-window",(o,t,e)=>{if(s&&!s.isDestroyed()){try{let r=Math.max(1,Number(t)||1),l=Math.max(1,Number(e)||1);const{screen:f}=require("electron"),h=f.getPrimaryDisplay().workArea,k=Math.floor(h.width*.9),b=Math.floor(h.height*.9),x=r/l;if(r>k||l>b){const _=k/r,v=b/l,p=Math.min(_,v);r=Math.floor(r*p),l=Math.floor(l*p)}r=Math.max(480,r),l=Math.max(270,l),M&&isFinite(M)&&M>0&&(l=Math.max(1,Math.round(r/M))),console.log("Resizing mirror window to:",r,"x",l,"(aspect locked:",!!M,")"),s.setSize(r,l)}catch{}s.center()}}),n.ipcMain.on("set-mirror-aspect",(o,t,e)=>{try{const r=Math.max(1,Number(t)||1),l=Math.max(1,Number(e)||1),f=r/l;if(M=f,j=f,s&&!s.isDestroyed())try{s.setAspectRatio(f)}catch{}if(A&&!A.isDestroyed())try{A.setAspectRatio(f)}catch{}}catch{}}),n.ipcMain.on("advanced-mirror:open",(o,t)=>{try{if(console.log("[main] advanced-mirror:open",Array.isArray(t)?t.map(e=>e?.id):t),Array.isArray(t))for(const e of t)console.log("[main] createAdvancedMirrorWindow",e?.id),L(String(e.id),e)}catch(e){console.warn("advanced-mirror:open error",e)}}),n.ipcMain.on("advanced-mirror:closeAll",()=>{try{S.forEach((o,t)=>{try{o.isDestroyed()||o.close()}catch{}S.delete(t)})}catch(o){console.warn("advanced-mirror:closeAll error",o)}}),n.ipcMain.on("advanced-mirror:sendSliceData",(o,t,e)=>{const r=S.get(String(t));if(r&&!r.isDestroyed()){const l=(typeof e=="string"?e:"").replace(/'/g,"\\'");r.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${l}') {
              mirrorImage.src = '${l}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),n.ipcMain.on("advanced-mirror:setBg",(o,t,e)=>{const r=S.get(String(t));if(r&&!r.isDestroyed()){const l=typeof e=="string"?e.replace(/'/g,"\\'"):"#000000";r.webContents.executeJavaScript(`document.body.style.background='${l}'`)}}),n.ipcMain.on("advanced-mirror:resize",(o,t,e,r)=>{const l=S.get(String(t));if(l&&!l.isDestroyed())try{l.setSize(e,r),l.center()}catch{}}),n.ipcMain.on("advanced-mirror:toggleFullscreen",(o,t)=>{const e=S.get(String(t));if(e&&!e.isDestroyed()){const{screen:r}=require("electron");if(e.isKiosk()||e.isFullScreen())try{e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:960,height:540}),e.center()}catch{}else try{const l=e.getBounds(),f=r.getDisplayMatching(l);e.setBounds({x:f.bounds.x,y:f.bounds.y,width:f.bounds.width,height:f.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}catch{}}}),R(),n.app.on("activate",()=>{n.BrowserWindow.getAllWindows().length===0&&R()})});n.app.on("window-all-closed",()=>{process.platform!=="darwin"&&n.app.quit()});process.on("uncaughtException",a=>{console.error("Uncaught Exception:",a)});process.on("unhandledRejection",(a,d)=>{console.error("Unhandled Rejection at:",d,"reason:",a)});
