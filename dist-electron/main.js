"use strict";const n=require("electron"),u=require("fs"),i=require("path"),V=process.env.VJ_DEBUG_LOGS!=="true",L=console.log,U=console.warn;if(V){const c=()=>{};console.log=(...l)=>{const o=l.join(" ");(o.includes("ICON")||o.includes("APP PATHS")||o.includes("RESOLVED")||o.includes("NO ICON")||o.includes("process.cwd")||o.includes("__dirname")||o.includes("Checking icon")||o.includes("✓")||o.includes("✗")||o.includes("Creating window")||o.includes("Icon loaded")||o.includes("user model")||o.includes("taskbar"))&&L(...l)},console.warn=(...l)=>{const o=l.join(" ");(o.includes("ICON")||o.includes("APP PATHS"))&&U(...l)},console.info=c}process.env.ELECTRON_DISABLE_SECURITY_WARNINGS="true";const q=n.app.requestSingleInstanceLock();q?n.app.on("second-instance",()=>{const c=n.BrowserWindow.getAllWindows();c.length>0&&(c[0].isMinimized()&&c[0].restore(),c[0].focus())}):(console.log("Another instance is already running, quitting..."),n.app.quit());let s=null,a=null,D=null,j=null,_=null,P=null;const x=new Map;let b={};function O(){console.log("=== ICON RESOLUTION DEBUG ==="),console.log("process.cwd():",process.cwd()),console.log("__dirname:",__dirname),console.log("process.resourcesPath:",process.resourcesPath),console.log("app.getAppPath():",n.app.getAppPath()),console.log("app.getPath(exe):",n.app.getPath("exe"));const c=[...process.platform==="win32"?[i.join(process.resourcesPath||"","icons","icon.ico"),i.join(__dirname,"../icons/icon.ico"),i.join(__dirname,"../../public/icons/icon.ico"),i.join(__dirname,"../public/icons/icon.ico"),i.join(process.cwd(),"public","icons","icon.ico"),i.join(process.resourcesPath||"","icons","sonomika_icon_2.ico"),i.join(__dirname,"../icons/sonomika_icon_2.ico")]:[],i.join(process.resourcesPath||"","icons","icon.png"),i.join(__dirname,"../icons/icon.png"),i.join(__dirname,"../../public/icons/icon.png"),i.join(__dirname,"../public/icons/icon.png"),i.join(process.cwd(),"public","icons","icon.png"),i.join(process.resourcesPath||"","icons","sonomika_icon_2.png"),i.join(__dirname,"../icons/sonomika_icon_2.png")];console.log("Checking icon candidates:");for(const l of c){const o=u.existsSync(l);if(console.log(`  ${o?"✓":"✗"} ${l}`),o){try{const t=u.statSync(l);console.log(`    Size: ${t.size} bytes, Modified: ${t.mtime}`)}catch{console.log("    (Could not stat file)")}return console.log("=== RESOLVED ICON PATH ==="),l}}console.log("=== NO ICON FOUND ===")}function $(){const c=n.app.getPath("userData");return i.join(c,"auth_store.json")}function H(){try{const c=$();if(u.existsSync(c)){const l=u.readFileSync(c,"utf8"),o=JSON.parse(l);b=Object.fromEntries(Object.entries(o).map(([t,e])=>[t,Buffer.from(e,"base64")]))}}catch(c){console.warn("Failed to load encrypted auth store, starting empty:",c),b={}}}function F(){try{const c=$(),l=i.dirname(c);u.existsSync(l)||u.mkdirSync(l,{recursive:!0});const o=Object.fromEntries(Object.entries(b).map(([t,e])=>[t,e.toString("base64")]));u.writeFileSync(c,JSON.stringify(o),"utf8")}catch(c){console.warn("Failed to persist encrypted auth store:",c)}}function J(){try{const c=n.app.getPath("documents"),l=i.join(c,"Sonomika");u.existsSync(l)||(u.mkdirSync(l,{recursive:!0}),console.log("Created Sonomika folder in Documents:",l));const o=["bank","music","recordings","video","ai-templates"];for(const p of o){const g=i.join(l,p);u.existsSync(g)||(u.mkdirSync(g,{recursive:!0}),console.log("Created folder:",g))}const t=[i.join(process.resourcesPath||"","app.asar.unpacked","bank"),i.join(__dirname,"../bank"),i.join(process.cwd(),"bank")],e=i.join(l,"bank");let r=!1;for(const p of t)if(u.existsSync(p)&&!r)try{E(p,e),console.log("Copied bank folder from",p,"to",e),r=!0}catch(g){console.warn("Failed to copy bank folder from",p,":",g)}const d=[i.join(process.resourcesPath||"","user-documents","sets"),i.join(process.resourcesPath||"","app.asar.unpacked","user-documents","sets"),i.join(__dirname,"../user-documents","sets"),i.join(process.cwd(),"user-documents","sets"),i.join(process.resourcesPath||"","app.asar.unpacked","sets"),i.join(__dirname,"../sets"),i.join(process.cwd(),"sets")],f=i.join(l,"sets");let h=!1;console.log("Looking for sets folder in source paths..."),console.log("process.resourcesPath:",process.resourcesPath);for(const p of d){const g=u.existsSync(p);if(console.log("  Checking:",p,g?"✓ EXISTS":"✗ NOT FOUND"),g)try{const m=u.existsSync(f)?u.readdirSync(f).length:0;E(p,f);const k=u.existsSync(f)?u.readdirSync(f).length:0;console.log(`Copied sets folder from ${p} to ${f} (${k-m} files)`),h=!0;break}catch(m){console.warn("Failed to copy sets folder from",p,":",m)}}h||console.warn("⚠️ Sets folder was not copied. Checked paths:",d);const y=[i.join(process.resourcesPath||"","user-documents"),i.join(process.resourcesPath||"","app.asar.unpacked","user-documents"),i.join(__dirname,"../user-documents"),i.join(process.cwd(),"user-documents")];console.log("Looking for user-documents folder in source paths...");let v=!1;for(const p of y){const g=u.existsSync(p);if(console.log("  Checking:",p,g?"✓ EXISTS":"✗ NOT FOUND"),g)try{const m=["midi mapping","music","recordings","video"];for(const k of m){const C=i.join(p,k),A=i.join(l,k);if(u.existsSync(C)){const W=u.existsSync(A)?u.readdirSync(A).length:0;E(C,A);const N=u.existsSync(A)?u.readdirSync(A).length:0;console.log(`Copied ${k} folder from ${C} to ${A} (${N-W} files)`)}else console.log(`  Source ${k} folder does not exist:`,C)}v=!0;break}catch(m){console.warn("Failed to copy user-documents folders from",p,":",m)}}v||console.warn("⚠️ user-documents folders were not copied. Checked paths:",y);const w=i.join(l,"ai-templates");u.existsSync(w)||u.mkdirSync(w,{recursive:!0});const I=n.app.getAppPath(),M=[i.join(process.resourcesPath||"","src","ai-templates"),i.join(process.resourcesPath||"","app.asar.unpacked","src","ai-templates"),i.join(__dirname,"../src/ai-templates"),i.join(__dirname,"../../src/ai-templates"),i.join(I,"src/ai-templates"),i.join(process.cwd(),"src/ai-templates")];let S=0;const R=(u.existsSync(w)?u.readdirSync(w).filter(p=>p.endsWith(".js")):[]).length===0;R&&console.log("AI templates folder is empty, will copy template files...");for(const p of M)if(u.existsSync(p))try{console.log("Checking AI templates source path:",p);const g=u.readdirSync(p,{withFileTypes:!0});console.log(`Found ${g.length} entries in ${p}`);for(const m of g)if(m.isFile()&&m.name.endsWith(".js")){const k=i.join(p,m.name),C=i.join(w,m.name);!u.existsSync(C)||R?(u.copyFileSync(k,C),console.log("Copied AI template file:",m.name,"to",C),S++):console.log("Skipped AI template file (already exists):",m.name)}if(S>0){console.log(`Successfully copied ${S} AI template file(s) from ${p}`);break}}catch(g){console.warn("Failed to copy AI templates from",p,":",g)}else console.log("AI templates source path does not exist:",p);S===0&&(console.warn("⚠️ No AI template files were copied. Checked paths:",M),console.warn("   This might indicate the template files are not included in the build."));const T=["midi mapping","sets"];for(const p of T){const g=i.join(l,p);if(u.existsSync(g)){const m=u.readdirSync(g);m.length===0?console.warn(`⚠️ ${p} folder exists but is empty. Files may not have been copied from installer.`):console.log(`✓ ${p} folder has ${m.length} file(s)`)}else console.warn(`⚠️ ${p} folder was not created. Files may not have been found in installer.`)}}catch(c){console.error("Failed to initialize user Documents folders:",c)}}function E(c,l){u.existsSync(l)||u.mkdirSync(l,{recursive:!0});const o=u.readdirSync(c,{withFileTypes:!0});for(const t of o){const e=i.join(c,t.name),r=i.join(l,t.name);t.isDirectory()?E(e,r):u.existsSync(r)||u.copyFileSync(e,r)}}function B(){const c=O();console.log("Creating window with icon path:",c);let l;if(c)try{l=n.nativeImage.createFromPath(c),l&&!l.isEmpty()?console.log("Icon loaded successfully, size:",l.getSize()):console.warn("Icon file found but failed to load or is empty")}catch(e){console.error("Error loading icon:",e)}s=new n.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",icon:l,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:i.join(__dirname,"preload.js"),backgroundThrottling:!1},show:!1});const o=i.join(__dirname,"preload.js");if(console.log("Preload script path:",o),console.log("Preload script exists:",require("fs").existsSync(o)),require("fs").existsSync(o)){const e=require("fs").readFileSync(o,"utf8");console.log("Preload script first 200 chars:",e.substring(0,200))}s.webContents.session.webRequest.onHeadersReceived((e,r)=>{console.log("Setting CSP headers for URL:",e.url);const d={...e.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),r({responseHeaders:d})}),s.once("ready-to-show",()=>{if(s.show(),s.webContents.setBackgroundThrottling(!1),process.platform==="win32"&&l)try{s.setIcon(l),console.log("Forced icon update on window after show")}catch(e){console.error("Error forcing icon update:",e)}});try{s.webContents.setWindowOpenHandler(e=>e.frameName==="output-canvas"?{action:"allow",overrideBrowserWindowOptions:{title:"Output",frame:!1,titleBarStyle:"hidden",autoHideMenuBar:!0,backgroundColor:"#000000",fullscreenable:!0,resizable:!0,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,backgroundThrottling:!1}}}:{action:"allow"}),s.webContents.on("did-create-window",(e,r)=>{try{if(r?.frameName==="output-canvas"){j=e;try{e.removeMenu()}catch{}try{e.setMenuBarVisibility(!1)}catch{}try{e.webContents.setBackgroundThrottling(!1)}catch{}try{_&&isFinite(_)&&_>0&&e.setAspectRatio(_)}catch{}try{e.on("closed",()=>{j=null})}catch{}}}catch{}})}catch{}if(s.on("maximize",()=>{try{s?.webContents.send("window-state",{maximized:!0})}catch{}}),s.on("unmaximize",()=>{try{s?.webContents.send("window-state",{maximized:!1})}catch{}}),process.env.NODE_ENV==="development"||!n.app.isPackaged){console.log("Running in development mode");const e=process.env.VITE_DEV_SERVER_URL||process.env.ELECTRON_RENDERER_URL,r=Number(process.env.VITE_DEV_SERVER_PORT||5173),d=[],f=y=>{y&&(d.includes(y)||d.push(y))};f(e),f(`http://localhost:${r}`),f(`http://127.0.0.1:${r}`);const h=(y,v=0)=>{if(!s)return;if(y.length===0){console.warn("All dev server attempts failed; showing inline error page");const S=encodeURIComponent(`<!DOCTYPE html><html><body style="font-family: sans-serif; background: #141414; color: #f5f5f5; padding: 32px;">
          <h1>Dev Server Not Available</h1>
          <p>Could not connect to the Vite dev server on port ${r}.</p>
          <p>Make sure it is running with:</p>
          <pre style="background:#1f1f1f; padding:16px; border-radius:8px;">npm run dev
npm run dev:electron</pre>
        </body></html>`);s.loadURL(`data:text/html,${S}`);return}const w=y[0],I=y.slice(1),M=v+1;console.log(`Trying dev server URL: ${w} (attempt ${M})`),s.loadURL(w).then(()=>{console.log(`Electron loaded renderer from ${w}`),s?.webContents.openDevTools({mode:"detach"})}).catch(S=>{console.warn(`Failed to load ${w}: ${S?.message||S}`);const z=Math.min(5e3,1e3*Math.pow(2,v));console.log(`Retrying with next candidate in ${z}ms`),setTimeout(()=>h(I,M),z)})};setTimeout(()=>h(d),1200)}else{console.log("Running in production mode");const e=n.app.getAppPath(),r=[i.join(e,"dist/index.html"),i.join(__dirname,"../dist/index.html"),i.join(__dirname,"../web/index.html")],d=r.find(f=>{try{return u.existsSync(f)}catch{return!1}});d?(console.log("Loading production file:",d),s.loadFile(d)):(console.error("No production index.html found at",r),console.error("App path:",e),console.error("__dirname:",__dirname),s.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>"))}s.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")});try{s.webContents.on("render-process-gone",(e,r)=>{console.error("[electron] render-process-gone",r)}),s.webContents.on("unresponsive",()=>{console.error("[electron] webContents became unresponsive")}),s.webContents.on("media-started-playing",()=>{console.log("[electron] media-started-playing")}),s.webContents.on("media-paused",()=>{console.log("[electron] media-paused")})}catch{}s.webContents.on("did-fail-load",(e,r,d)=>{console.error("Failed to load:",r,d)}),s.on("closed",()=>{s=null})}function K(){if(a&&!a.isDestroyed()){a.focus();return}const c=O();console.log("Creating mirror window with icon path:",c);let l;if(c)try{l=n.nativeImage.createFromPath(c),l&&!l.isEmpty()?console.log("Mirror window icon loaded successfully, size:",l.getSize()):console.warn("Mirror window icon file found but failed to load or is empty")}catch(t){console.error("Error loading mirror window icon:",t)}a=new n.BrowserWindow({width:1920,height:1080,title:"sonomika",icon:l,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:i.join(__dirname,"mirror-preload.js"),backgroundThrottling:!1},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),a.loadURL(`data:text/html,${encodeURIComponent(`
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
  `)}`),a.once("ready-to-show",()=>{a.show(),a.center();try{a.setAspectRatio(P||1920/1080)}catch{}try{D==null&&(D=n.powerSaveBlocker.start("prevent-display-sleep")),a.webContents.setBackgroundThrottling(!1)}catch{}}),a.webContents.on("before-input-event",(t,e)=>{e.key==="Escape"&&a.close()}),a.on("closed",()=>{try{D!=null&&n.powerSaveBlocker.stop(D)}catch{}D=null,console.log("Mirror window closed, notifying main app"),s&&!s.isDestroyed()&&s.webContents.send("mirror-window-closed"),a=null})}function G(){a&&!a.isDestroyed()&&(a.close(),a=null)}function Y(c,l){const o=x.get(c);if(o&&!o.isDestroyed()){try{o.focus()}catch{}return o}const t=i.join(__dirname,"mirror-preload.js"),e=i.join(__dirname,"preload.js"),r=u.existsSync(t)?t:e,d=O(),f=d?n.nativeImage.createFromPath(d):void 0,h=new n.BrowserWindow({width:l?.width??960,height:l?.height??540,x:l?.x,y:l?.y,title:l?.title??`VJ Mirror Slice: ${c}`,icon:f,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:r},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,thickFrame:!1,hasShadow:!1,backgroundColor:"#000000",fullscreenable:!0,autoHideMenuBar:!0,minWidth:320,minHeight:180});try{h.setMenuBarVisibility(!1)}catch{}try{h.removeMenu()}catch{}const y=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${l?.title??`VJ Mirror Slice: ${c}`}</title>
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
          try { window.advancedMirror && window.advancedMirror.toggleSliceFullscreen && window.advancedMirror.toggleSliceFullscreen('${c}'); } catch {}
        }
      <\/script>
    </body>
    </html>
  `;h.loadURL(`data:text/html,${encodeURIComponent(y)}`);try{h.show(),h.center()}catch{}return h.once("ready-to-show",()=>{try{h.isVisible()||(h.show(),h.center())}catch{}}),h.on("closed",()=>{x.delete(c)}),h.webContents.on("before-input-event",(v,w)=>{w.key==="Escape"&&h.close()}),x.set(c,h),h}function Q(){const c=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{n.app.quit()}}]},{label:"External",submenu:[{label:"Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{s&&s.webContents.send("toggle-mirror")}},{label:"Advanced Mirror",accelerator:"CmdOrCtrl+Shift+M",click:()=>{s&&s.webContents.send("toggle-advanced-mirror")}}]},{label:"Record",submenu:[{label:"Record",accelerator:"CmdOrCtrl+Shift+R",click:()=>{s&&s.webContents.send("record:start")}},{label:"Record Settings",click:()=>{s&&s.webContents.send("record:settings")}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{s&&s.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{s&&s.reload()}}]},{label:"Developer",submenu:[{label:"Toggle Debug Overlay",accelerator:"CmdOrCtrl+Shift+D",click:()=>{try{s?.webContents.send("debug:toggleOverlay")}catch{}}},{label:"Show Debug Panel",accelerator:"CmdOrCtrl+Alt+D",click:()=>{try{s?.webContents.send("debug:openPanel")}catch{}}},{type:"separator"},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{s&&s.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],l=n.Menu.buildFromTemplate(c);n.Menu.setApplicationMenu(l)}n.app.whenReady().then(()=>{if(console.log("Electron app is ready"),console.log("=== APP PATHS DEBUG ==="),console.log("app.getAppPath():",n.app.getPath("appData")),console.log("app.getPath(exe):",n.app.getPath("exe")),console.log("process.execPath:",process.execPath),console.log("process.resourcesPath:",process.resourcesPath),process.platform==="win32")try{n.app.setAppUserModelId("com.sonomika.app"),console.log("Set app user model ID for Windows taskbar icon")}catch(o){console.error("Error setting app user model ID:",o)}try{n.app.commandLine.appendSwitch("autoplay-policy","no-user-gesture-required")}catch{}try{const o=O();console.log("Icon path resolved at app.whenReady():",o),process.platform==="darwin"&&o&&n.app.dock&&typeof n.app.dock.setIcon=="function"&&n.app.dock.setIcon(n.nativeImage.createFromPath(o))}catch(o){console.error("Error setting dock icon:",o)}n.app.commandLine.appendSwitch("disable-background-timer-throttling"),n.app.commandLine.appendSwitch("disable-renderer-backgrounding"),n.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");try{const o=n.app.commandLine.getSwitchValue("disable-features"),t="CalculateNativeWinOcclusion";o&&o.length>0?o.split(",").includes(t)||n.app.commandLine.appendSwitch("disable-features",`${o},${t}`):n.app.commandLine.appendSwitch("disable-features",t)}catch{}Q(),H(),J(),n.protocol.registerFileProtocol("local-file",(o,t)=>{const e=o.url.replace("local-file://","");console.log("Loading local file:",e),console.log("Request URL:",o.url),console.log("File path resolved:",e),t(e)}),n.ipcMain.handle("show-open-dialog",async(o,t)=>await n.dialog.showOpenDialog(s,t)),n.ipcMain.handle("show-save-dialog",async(o,t)=>{console.log("Show save dialog called with options:",t);const e=await n.dialog.showSaveDialog(s,t);return console.log("Save dialog result:",e),e}),n.ipcMain.handle("save-file",async(o,t,e)=>{try{return await u.promises.writeFile(t,e,"utf8"),!0}catch(r){return console.error("Failed to save file:",r),!1}}),n.ipcMain.handle("save-binary-file",async(o,t,e)=>{try{return console.log("Saving binary file to:",t,"Size:",e.length,"bytes"),await u.promises.writeFile(t,Buffer.from(e)),console.log("Binary file saved successfully"),!0}catch(r){return console.error("Failed to save binary file:",r),!1}});let c=null,l=null;n.ipcMain.handle("offline-render:start",async(o,t)=>{try{const e=i.join(n.app.getPath("userData"),"offline-renders"),r=i.join(e,`${Date.now()}_${(t?.name||"movie").replace(/[^a-z0-9_-]/ig,"_")}`);return await u.promises.mkdir(r,{recursive:!0}),c={dir:r,name:String(t?.name||"movie"),fps:Number(t?.fps)||0,index:0,width:Number(t?.width)||1920,height:Number(t?.height)||1080,quality:t?.quality||"medium"},l=null,console.log("[offline] start",{dir:r,fps:c.fps||"preview",quality:c.quality,size:`${c.width}x${c.height}`}),{success:!0,dir:r}}catch(e){return console.error("[offline] start error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:frame",async(o,t)=>{if(!c)return{success:!1,error:"No session"};try{const e=c,r=i.join(e.dir,`frame_${String(e.index).padStart(6,"0")}.png`),d=String(t?.dataUrl||"").replace(/^data:image\/png;base64,/,"");return await u.promises.writeFile(r,Buffer.from(d,"base64")),e.index+=1,e.index%60===0&&console.log("[offline] saved frames:",e.index),{success:!0,index:e.index}}catch(e){return console.error("[offline] frame error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:finish",async(o,t)=>{if(!c)return{success:!1,error:"No session"};c=null;try{return{success:!1,error:"Offline rendering is disabled. Please use WebM recording via MediaRecorder instead."}}catch(e){return console.error("[offline] finish error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("get-system-audio-stream",async()=>{try{const{desktopCapturer:o}=require("electron"),t=await o.getSources({types:["screen"],thumbnailSize:{width:1,height:1}});if(t.length===0)throw new Error("No screen sources available");return{success:!0,sourceId:(t.find(r=>r.name==="Entire Screen")||t[0]).id}}catch(o){return console.error("Failed to get system audio stream:",o),{success:!1,error:String(o)}}}),n.ipcMain.handle("get-documents-folder",async()=>{try{const o=n.app.getPath("documents");return{success:!0,path:i.join(o,"Sonomika")}}catch(o){return console.error("Failed to get Documents folder:",o),{success:!1,error:String(o)}}}),n.ipcMain.handle("get-app-path",async()=>n.app.getAppPath()),n.ipcMain.handle("get-resources-path",async()=>process.resourcesPath||n.app.getAppPath()),n.ipcMain.handle("read-file-text",async(o,t)=>{try{return await u.promises.readFile(t,"utf8")}catch(e){return console.error("Failed to read file:",e),null}}),n.ipcMain.handle("read-local-file-base64",async(o,t)=>{try{return(await u.promises.readFile(t)).toString("base64")}catch(e){throw console.error("Failed to read local file:",t,e),e}}),n.ipcMain.handle("read-audio-bytes",async(o,t)=>{try{const{fileURLToPath:e}=require("url"),r=typeof t=="string"&&t.startsWith("file:")?e(t):t,d=await u.promises.readFile(r);return d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength)}catch(e){return console.error("read-audio-bytes failed for",t,e),new ArrayBuffer(0)}}),n.ipcMain.handle("authStorage:isEncryptionAvailable",()=>{try{return n.safeStorage.isEncryptionAvailable()}catch{return!1}}),n.ipcMain.on("authStorage:isEncryptionAvailableSync",o=>{try{o.returnValue=n.safeStorage.isEncryptionAvailable()}catch{o.returnValue=!1}}),n.ipcMain.handle("authStorage:save",async(o,t,e)=>{try{return t?e==null||e===""?(delete b[t],F(),!0):(n.safeStorage.isEncryptionAvailable()?b[t]=n.safeStorage.encryptString(e):b[t]=Buffer.from(e,"utf8"),F(),!0):!1}catch(r){return console.error("Failed to save auth blob:",r),!1}}),n.ipcMain.on("authStorage:saveSync",(o,t,e)=>{try{if(!t){o.returnValue=!1;return}if(e==null||e===""){delete b[t],F(),o.returnValue=!0;return}n.safeStorage.isEncryptionAvailable()?b[t]=n.safeStorage.encryptString(e):b[t]=Buffer.from(e,"utf8"),F(),o.returnValue=!0}catch(r){console.error("Failed to save auth blob (sync):",r),o.returnValue=!1}}),n.ipcMain.handle("authStorage:load",async(o,t)=>{try{if(!t)return null;const e=b[t];return e?n.safeStorage.isEncryptionAvailable()?n.safeStorage.decryptString(e):e.toString("utf8"):null}catch(e){return console.error("Failed to load auth blob:",e),null}}),n.ipcMain.on("authStorage:loadSync",(o,t)=>{try{if(!t){o.returnValue=null;return}const e=b[t];if(!e){o.returnValue=null;return}n.safeStorage.isEncryptionAvailable()?o.returnValue=n.safeStorage.decryptString(e):o.returnValue=e.toString("utf8")}catch(e){console.error("Failed to load auth blob (sync):",e),o.returnValue=null}}),n.ipcMain.handle("authStorage:remove",async(o,t)=>{try{return t?(delete b[t],F(),!0):!1}catch(e){return console.error("Failed to remove auth blob:",e),!1}}),n.ipcMain.on("authStorage:removeSync",(o,t)=>{try{if(!t){o.returnValue=!1;return}delete b[t],F(),o.returnValue=!0}catch(e){console.error("Failed to remove auth blob (sync):",e),o.returnValue=!1}}),n.ipcMain.handle("authStorage:loadAll",async()=>{try{const o={};for(const[t,e]of Object.entries(b))try{n.safeStorage.isEncryptionAvailable()?o[t]=n.safeStorage.decryptString(e):o[t]=e.toString("utf8")}catch{}return o}catch(o){return console.error("Failed to loadAll auth blobs:",o),{}}}),n.ipcMain.handle("get-screen-sizes",async()=>{try{const{screen:o}=require("electron"),t=o.getAllDisplays();console.log("Electron main: Detected displays:",t.length),t.forEach((r,d)=>{console.log(`Display ${d+1}:`,{width:r.bounds.width,height:r.bounds.height,x:r.bounds.x,y:r.bounds.y,scaleFactor:r.scaleFactor,rotation:r.rotation,label:r.label})});const e=t.map(r=>({width:r.bounds.width,height:r.bounds.height}));return console.log("Electron main: Returning screen sizes:",e),e}catch(o){return console.error("Failed to get screen sizes:",o),[]}}),n.ipcMain.on("toggle-app-fullscreen",()=>{if(s&&!s.isDestroyed()){const{screen:o}=require("electron");if(s.isKiosk()||s.isFullScreen())s.setKiosk(!1),s.setFullScreen(!1),s.setBounds({width:1200,height:800}),s.center();else{const t=s.getBounds(),e=o.getDisplayMatching(t);s.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),s.setMenuBarVisibility(!1),s.setFullScreenable(!0),s.setAlwaysOnTop(!0),s.setKiosk(!0),s.setFullScreen(!0)}}}),n.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),s?(console.log("Main: calling mainWindow.minimize()"),s.minimize()):console.log("Main: mainWindow is null")}),n.ipcMain.on("window-maximize",()=>{if(console.log("Main: window-maximize IPC received"),s)if(s.isMaximized()){console.log("Main: calling mainWindow.unmaximize()"),s.unmaximize();try{s.webContents.send("window-state",{maximized:!1})}catch{}}else{console.log("Main: calling mainWindow.maximize()"),s.maximize();try{s.webContents.send("window-state",{maximized:!0})}catch{}}else console.log("Main: mainWindow is null")}),n.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),s?(console.log("Main: calling mainWindow.close()"),s.close()):console.log("Main: mainWindow is null")}),n.ipcMain.on("toggle-mirror",()=>{s&&s.webContents.send("toggle-mirror")}),n.ipcMain.on("open-mirror-window",()=>{K()}),n.ipcMain.on("close-mirror-window",()=>{G()}),n.ipcMain.on("set-mirror-bg",(o,t)=>{if(a&&!a.isDestroyed()){const e=typeof t=="string"?t.replace(/'/g,"\\'"):"#000000";a.webContents.executeJavaScript(`document.body.style.background='${e}'`)}}),n.ipcMain.on("canvas-data",(o,t)=>{a&&!a.isDestroyed()&&a.webContents.send("update-canvas",t)}),n.ipcMain.on("sendCanvasData",(o,t)=>{if(a&&!a.isDestroyed())try{const e=(typeof t=="string"?t:"").replace(/'/g,"\\'");a.webContents.executeJavaScript(`
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
        `)}catch{}}),n.ipcMain.on("toggle-fullscreen",()=>{if(a&&!a.isDestroyed()){const{screen:o}=require("electron");if(a.isKiosk()||a.isFullScreen()){a.setKiosk(!1),a.setFullScreen(!1);try{a.setVisibleOnAllWorkspaces(!1)}catch{}try{a.setAlwaysOnTop(!0)}catch{}a.setBounds({x:void 0,y:void 0,width:1920,height:1080});try{a.center()}catch{}try{a.focus()}catch{}}else{const t=a.getBounds(),e=o.getDisplayMatching(t);a.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height});try{a.setMenuBarVisibility(!1)}catch{}try{a.setFullScreenable(!0)}catch{}try{process.platform==="darwin"?a.setAlwaysOnTop(!0,"screen-saver"):a.setAlwaysOnTop(!0)}catch{}try{a.setVisibleOnAllWorkspaces(!0,{visibleOnFullScreen:!0})}catch{}try{a.moveTop?.()}catch{}try{a.show()}catch{}try{a.focus()}catch{}a.setKiosk(!0),a.setFullScreen(!0);try{a.moveTop?.()}catch{}try{a.focus()}catch{}}}}),n.ipcMain.on("resize-mirror-window",(o,t,e)=>{if(a&&!a.isDestroyed()){try{let r=Math.max(1,Number(t)||1),d=Math.max(1,Number(e)||1);const{screen:f}=require("electron"),y=f.getPrimaryDisplay().workArea,v=Math.floor(y.width*.9),w=Math.floor(y.height*.9),I=r/d;if(r>v||d>w){const M=v/r,S=w/d,z=Math.min(M,S);r=Math.floor(r*z),d=Math.floor(d*z)}r=Math.max(480,r),d=Math.max(270,d),P&&isFinite(P)&&P>0&&(d=Math.max(1,Math.round(r/P))),console.log("Resizing mirror window to:",r,"x",d,"(aspect locked:",!!P,")"),a.setSize(r,d)}catch{}a.center()}}),n.ipcMain.on("set-mirror-aspect",(o,t,e)=>{try{const r=Math.max(1,Number(t)||1),d=Math.max(1,Number(e)||1),f=r/d;if(P=f,_=f,a&&!a.isDestroyed())try{a.setAspectRatio(f)}catch{}if(j&&!j.isDestroyed())try{j.setAspectRatio(f)}catch{}}catch{}}),n.ipcMain.on("advanced-mirror:open",(o,t)=>{try{if(console.log("[main] advanced-mirror:open",Array.isArray(t)?t.map(e=>e?.id):t),Array.isArray(t))for(const e of t)console.log("[main] createAdvancedMirrorWindow",e?.id),Y(String(e.id),e)}catch(e){console.warn("advanced-mirror:open error",e)}}),n.ipcMain.on("advanced-mirror:closeAll",()=>{try{x.forEach((o,t)=>{try{o.isDestroyed()||o.close()}catch{}x.delete(t)})}catch(o){console.warn("advanced-mirror:closeAll error",o)}}),n.ipcMain.on("advanced-mirror:sendSliceData",(o,t,e)=>{const r=x.get(String(t));if(r&&!r.isDestroyed()){const d=(typeof e=="string"?e:"").replace(/'/g,"\\'");r.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${d}') {
              mirrorImage.src = '${d}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),n.ipcMain.on("advanced-mirror:setBg",(o,t,e)=>{const r=x.get(String(t));if(r&&!r.isDestroyed()){const d=typeof e=="string"?e.replace(/'/g,"\\'"):"#000000";r.webContents.executeJavaScript(`document.body.style.background='${d}'`)}}),n.ipcMain.on("advanced-mirror:resize",(o,t,e,r)=>{const d=x.get(String(t));if(d&&!d.isDestroyed())try{d.setSize(e,r),d.center()}catch{}}),n.ipcMain.on("advanced-mirror:toggleFullscreen",(o,t)=>{const e=x.get(String(t));if(e&&!e.isDestroyed()){const{screen:r}=require("electron");if(e.isKiosk()||e.isFullScreen())try{e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:960,height:540}),e.center()}catch{}else try{const d=e.getBounds(),f=r.getDisplayMatching(d);e.setBounds({x:f.bounds.x,y:f.bounds.y,width:f.bounds.width,height:f.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}catch{}}}),B(),n.app.on("activate",()=>{n.BrowserWindow.getAllWindows().length===0&&B()})});n.app.on("window-all-closed",()=>{process.platform!=="darwin"&&n.app.quit()});process.on("uncaughtException",c=>{console.error("Uncaught Exception:",c)});process.on("unhandledRejection",(c,l)=>{console.error("Unhandled Rejection at:",l,"reason:",c)});
