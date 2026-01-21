"use strict";const n=require("electron"),u=require("fs"),i=require("path"),D=class D{constructor(){this.sender=null,this.senderName=null,this.lastFrameAtMs=0}start(a){if(process.platform!=="win32")return{ok:!1,error:"Spout output is only supported on Windows."};const t=D.DEFAULT_SENDER_NAME;if(this.sender&&this.senderName===t)return{ok:!0};this.sender&&this.stop();const o=this.tryLoadAddon();if(!o)return{ok:!1,error:"Spout addon not found. Build/copy `electron_spout.node` and ensure it is unpacked (not inside asar)."};try{return this.sender=new o.SpoutOutput(t),this.senderName=t,this.lastFrameAtMs=0,{ok:!0}}catch(e){return this.sender=null,this.senderName=null,{ok:!1,error:`Failed to create Spout sender: ${String(e)}`}}}stop(){try{const a=this.sender;a&&typeof a.close=="function"&&a.close(),a&&typeof a.release=="function"&&a.release(),a&&typeof a.dispose=="function"&&a.dispose()}catch{}this.sender=null,this.senderName=null}isRunning(){return!!this.sender}pushDataUrlFrame(a,t){const o=this.sender;if(!o)return;const e=D.DEFAULT_MAX_FPS,r=Date.now(),d=1e3/e;if(!(r-this.lastFrameAtMs<d))try{const p=n.nativeImage.createFromDataURL(String(a||""));if(p.isEmpty())return;o.updateFrame(Buffer.from(p.toBitmap()),p.getSize()),this.lastFrameAtMs=r}catch{}}tryLoadAddon(){const a=[()=>require("electron_spout.node"),()=>require("electron-spout.node"),()=>require(i.join(process.cwd(),"electron_spout.node")),()=>require(i.join(process.cwd(),"electron-spout.node")),()=>require(i.join(process.cwd(),"native","electron_spout.node")),()=>require(i.join(process.cwd(),"native","electron-spout.node")),()=>require(i.join(process.resourcesPath||"","electron_spout.node")),()=>require(i.join(process.resourcesPath||"","electron-spout.node")),()=>require(i.join(process.resourcesPath||"","app.asar.unpacked","electron_spout.node")),()=>require(i.join(process.resourcesPath||"","app.asar.unpacked","electron-spout.node")),()=>require(i.join(process.resourcesPath||"","app.asar.unpacked","native","electron_spout.node")),()=>require(i.join(process.resourcesPath||"","app.asar.unpacked","native","electron-spout.node"))];for(const t of a)try{const o=t();if(o&&o.SpoutOutput)return o}catch{}return null}};D.DEFAULT_SENDER_NAME="Sonomika Output",D.DEFAULT_MAX_FPS=60;let B=D;const H=process.env.VJ_DEBUG_LOGS!=="true",J=console.log,K=console.warn;if(H){const l=()=>{};console.log=(...a)=>{const t=a.join(" ");(t.includes("ICON")||t.includes("APP PATHS")||t.includes("RESOLVED")||t.includes("NO ICON")||t.includes("process.cwd")||t.includes("__dirname")||t.includes("Checking icon")||t.includes("✓")||t.includes("✗")||t.includes("Creating window")||t.includes("Icon loaded")||t.includes("user model")||t.includes("taskbar"))&&J(...a)},console.warn=(...a)=>{const t=a.join(" ");(t.includes("ICON")||t.includes("APP PATHS"))&&K(...a)},console.info=l}process.env.ELECTRON_DISABLE_SECURITY_WARNINGS="true";const G=n.app.requestSingleInstanceLock();G?n.app.on("second-instance",()=>{const l=n.BrowserWindow.getAllWindows();l.length>0&&(l[0].isMinimized()&&l[0].restore(),l[0].focus())}):(console.log("Another instance is already running, quitting..."),n.app.quit());let s=null,c=null,z=null,I=null,E=null,F=null;const k=new Map;let b={};const j=new B,$="Sonomika Output",X=60;function N(){console.log("=== ICON RESOLUTION DEBUG ==="),console.log("process.cwd():",process.cwd()),console.log("__dirname:",__dirname),console.log("process.resourcesPath:",process.resourcesPath),console.log("app.getAppPath():",n.app.getAppPath()),console.log("app.getPath(exe):",n.app.getPath("exe"));const l=[...process.platform==="win32"?[i.join(process.resourcesPath||"","icons","icon.ico"),i.join(__dirname,"../icons/icon.ico"),i.join(__dirname,"../../public/icons/icon.ico"),i.join(__dirname,"../public/icons/icon.ico"),i.join(process.cwd(),"public","icons","icon.ico"),i.join(process.resourcesPath||"","icons","sonomika_icon_2.ico"),i.join(__dirname,"../icons/sonomika_icon_2.ico")]:[],i.join(process.resourcesPath||"","icons","icon.png"),i.join(__dirname,"../icons/icon.png"),i.join(__dirname,"../../public/icons/icon.png"),i.join(__dirname,"../public/icons/icon.png"),i.join(process.cwd(),"public","icons","icon.png"),i.join(process.resourcesPath||"","icons","sonomika_icon_2.png"),i.join(__dirname,"../icons/sonomika_icon_2.png")];console.log("Checking icon candidates:");for(const a of l){const t=u.existsSync(a);if(console.log(`  ${t?"✓":"✗"} ${a}`),t){try{const o=u.statSync(a);console.log(`    Size: ${o.size} bytes, Modified: ${o.mtime}`)}catch{console.log("    (Could not stat file)")}return console.log("=== RESOLVED ICON PATH ==="),a}}console.log("=== NO ICON FOUND ===")}function W(){const l=n.app.getPath("userData");return i.join(l,"auth_store.json")}function Y(){try{const l=W();if(u.existsSync(l)){const a=u.readFileSync(l,"utf8"),t=JSON.parse(a);b=Object.fromEntries(Object.entries(t).map(([o,e])=>[o,Buffer.from(e,"base64")]))}}catch(l){console.warn("Failed to load encrypted auth store, starting empty:",l),b={}}}function _(){try{const l=W(),a=i.dirname(l);u.existsSync(a)||u.mkdirSync(a,{recursive:!0});const t=Object.fromEntries(Object.entries(b).map(([o,e])=>[o,e.toString("base64")]));u.writeFileSync(l,JSON.stringify(t),"utf8")}catch(l){console.warn("Failed to persist encrypted auth store:",l)}}function Q(){try{const l=n.app.getPath("documents"),a=i.join(l,"Sonomika");u.existsSync(a)||(u.mkdirSync(a,{recursive:!0}),console.log("Created Sonomika folder in Documents:",a));const t=["bank","music","recordings","video","ai-templates"];for(const f of t){const g=i.join(a,f);u.existsSync(g)||(u.mkdirSync(g,{recursive:!0}),console.log("Created folder:",g))}const o=[i.join(process.resourcesPath||"","app.asar.unpacked","bank"),i.join(__dirname,"../bank"),i.join(process.cwd(),"bank")],e=i.join(a,"bank");let r=!1;for(const f of o)if(u.existsSync(f)&&!r)try{R(f,e),console.log("Copied bank folder from",f,"to",e),r=!0}catch(g){console.warn("Failed to copy bank folder from",f,":",g)}const d=[i.join(process.resourcesPath||"","user-documents","sets"),i.join(process.resourcesPath||"","app.asar.unpacked","user-documents","sets"),i.join(__dirname,"../user-documents","sets"),i.join(process.cwd(),"user-documents","sets"),i.join(process.resourcesPath||"","app.asar.unpacked","sets"),i.join(__dirname,"../sets"),i.join(process.cwd(),"sets")],p=i.join(a,"sets");let h=!1;console.log("Looking for sets folder in source paths..."),console.log("process.resourcesPath:",process.resourcesPath);for(const f of d){const g=u.existsSync(f);if(console.log("  Checking:",f,g?"✓ EXISTS":"✗ NOT FOUND"),g)try{const m=u.existsSync(p)?u.readdirSync(p).length:0;R(f,p);const M=u.existsSync(p)?u.readdirSync(p).length:0;console.log(`Copied sets folder from ${f} to ${p} (${M-m} files)`),h=!0;break}catch(m){console.warn("Failed to copy sets folder from",f,":",m)}}h||console.warn("⚠️ Sets folder was not copied. Checked paths:",d);const y=[i.join(process.resourcesPath||"","user-documents"),i.join(process.resourcesPath||"","app.asar.unpacked","user-documents"),i.join(__dirname,"../user-documents"),i.join(process.cwd(),"user-documents")];console.log("Looking for user-documents folder in source paths...");let v=!1;for(const f of y){const g=u.existsSync(f);if(console.log("  Checking:",f,g?"✓ EXISTS":"✗ NOT FOUND"),g)try{const m=["midi mapping","music","recordings","video"];for(const M of m){const P=i.join(f,M),A=i.join(a,M);if(u.existsSync(P)){const q=u.existsSync(A)?u.readdirSync(A).length:0;R(P,A);const U=u.existsSync(A)?u.readdirSync(A).length:0;console.log(`Copied ${M} folder from ${P} to ${A} (${U-q} files)`)}else console.log(`  Source ${M} folder does not exist:`,P)}v=!0;break}catch(m){console.warn("Failed to copy user-documents folders from",f,":",m)}}v||console.warn("⚠️ user-documents folders were not copied. Checked paths:",y);const w=i.join(a,"ai-templates");u.existsSync(w)||u.mkdirSync(w,{recursive:!0});const O=n.app.getAppPath(),C=[i.join(process.resourcesPath||"","src","ai-templates"),i.join(process.resourcesPath||"","app.asar.unpacked","src","ai-templates"),i.join(__dirname,"../src/ai-templates"),i.join(__dirname,"../../src/ai-templates"),i.join(O,"src/ai-templates"),i.join(process.cwd(),"src/ai-templates")];let S=0;const T=(u.existsSync(w)?u.readdirSync(w).filter(f=>f.endsWith(".js")):[]).length===0;T&&console.log("AI templates folder is empty, will copy template files...");for(const f of C)if(u.existsSync(f))try{console.log("Checking AI templates source path:",f);const g=u.readdirSync(f,{withFileTypes:!0});console.log(`Found ${g.length} entries in ${f}`);for(const m of g)if(m.isFile()&&m.name.endsWith(".js")){const M=i.join(f,m.name),P=i.join(w,m.name);!u.existsSync(P)||T?(u.copyFileSync(M,P),console.log("Copied AI template file:",m.name,"to",P),S++):console.log("Skipped AI template file (already exists):",m.name)}if(S>0){console.log(`Successfully copied ${S} AI template file(s) from ${f}`);break}}catch(g){console.warn("Failed to copy AI templates from",f,":",g)}else console.log("AI templates source path does not exist:",f);S===0&&(console.warn("⚠️ No AI template files were copied. Checked paths:",C),console.warn("   This might indicate the template files are not included in the build."));const V=["midi mapping","sets"];for(const f of V){const g=i.join(a,f);if(u.existsSync(g)){const m=u.readdirSync(g);m.length===0?console.warn(`⚠️ ${f} folder exists but is empty. Files may not have been copied from installer.`):console.log(`✓ ${f} folder has ${m.length} file(s)`)}else console.warn(`⚠️ ${f} folder was not created. Files may not have been found in installer.`)}}catch(l){console.error("Failed to initialize user Documents folders:",l)}}function R(l,a){u.existsSync(a)||u.mkdirSync(a,{recursive:!0});const t=u.readdirSync(l,{withFileTypes:!0});for(const o of t){const e=i.join(l,o.name),r=i.join(a,o.name);o.isDirectory()?R(e,r):u.existsSync(r)||u.copyFileSync(e,r)}}function L(){const l=N();console.log("Creating window with icon path:",l);let a;if(l)try{a=n.nativeImage.createFromPath(l),a&&!a.isEmpty()?console.log("Icon loaded successfully, size:",a.getSize()):console.warn("Icon file found but failed to load or is empty")}catch(e){console.error("Error loading icon:",e)}s=new n.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",icon:a,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:i.join(__dirname,"preload.js"),backgroundThrottling:!1},show:!1});const t=i.join(__dirname,"preload.js");if(console.log("Preload script path:",t),console.log("Preload script exists:",require("fs").existsSync(t)),require("fs").existsSync(t)){const e=require("fs").readFileSync(t,"utf8");console.log("Preload script first 200 chars:",e.substring(0,200))}s.webContents.session.webRequest.onHeadersReceived((e,r)=>{console.log("Setting CSP headers for URL:",e.url);const d={...e.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),r({responseHeaders:d})}),s.once("ready-to-show",()=>{if(s.show(),s.webContents.setBackgroundThrottling(!1),process.platform==="win32"&&a)try{s.setIcon(a),console.log("Forced icon update on window after show")}catch(e){console.error("Error forcing icon update:",e)}});try{s.webContents.setWindowOpenHandler(e=>e.frameName==="output-canvas"?{action:"allow",overrideBrowserWindowOptions:{title:"Output",frame:!1,titleBarStyle:"hidden",autoHideMenuBar:!0,backgroundColor:"#000000",fullscreenable:!0,resizable:!0,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,backgroundThrottling:!1}}}:{action:"allow"}),s.webContents.on("did-create-window",(e,r)=>{try{if(r?.frameName==="output-canvas"){I=e;try{e.removeMenu()}catch{}try{e.setMenuBarVisibility(!1)}catch{}try{e.webContents.setBackgroundThrottling(!1)}catch{}try{E&&isFinite(E)&&E>0&&e.setAspectRatio(E)}catch{}try{e.on("closed",()=>{I=null})}catch{}}}catch{}})}catch{}if(s.on("maximize",()=>{try{s?.webContents.send("window-state",{maximized:!0})}catch{}}),s.on("unmaximize",()=>{try{s?.webContents.send("window-state",{maximized:!1})}catch{}}),process.env.NODE_ENV==="development"||!n.app.isPackaged){console.log("Running in development mode");const e=process.env.VITE_DEV_SERVER_URL||process.env.ELECTRON_RENDERER_URL,r=Number(process.env.VITE_DEV_SERVER_PORT||5173),d=[],p=y=>{y&&(d.includes(y)||d.push(y))};p(e),p(`http://localhost:${r}`),p(`http://127.0.0.1:${r}`);const h=(y,v=0)=>{if(!s)return;if(y.length===0){console.warn("All dev server attempts failed; showing inline error page");const S=d.filter(Boolean),x=`<!DOCTYPE html>
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
    <p>Could not connect to the Vite dev server on port ${r}.</p>
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
        const candidates = ${JSON.stringify(S)};
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
</html>`;s.loadURL(`data:text/html,${encodeURIComponent(x)}`);return}const w=y[0],O=y.slice(1),C=v+1;console.log(`Trying dev server URL: ${w} (attempt ${C})`),s.loadURL(w).then(()=>{console.log(`Electron loaded renderer from ${w}`),s?.webContents.openDevTools({mode:"detach"})}).catch(S=>{console.warn(`Failed to load ${w}: ${S?.message||S}`);const x=Math.min(5e3,1e3*Math.pow(2,v));console.log(`Retrying with next candidate in ${x}ms`),setTimeout(()=>h(O,C),x)})};setTimeout(()=>h(d),1200)}else{console.log("Running in production mode");const e=n.app.getAppPath(),r=[i.join(e,"dist/index.html"),i.join(__dirname,"../dist/index.html"),i.join(__dirname,"../web/index.html")],d=r.find(p=>{try{return u.existsSync(p)}catch{return!1}});d?(console.log("Loading production file:",d),s.loadFile(d)):(console.error("No production index.html found at",r),console.error("App path:",e),console.error("__dirname:",__dirname),s.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>"))}s.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")});try{s.webContents.on("render-process-gone",(e,r)=>{console.error("[electron] render-process-gone",r)}),s.webContents.on("unresponsive",()=>{console.error("[electron] webContents became unresponsive")}),s.webContents.on("media-started-playing",()=>{console.log("[electron] media-started-playing")}),s.webContents.on("media-paused",()=>{console.log("[electron] media-paused")})}catch{}s.webContents.on("did-fail-load",(e,r,d)=>{console.error("Failed to load:",r,d)}),s.on("closed",()=>{s=null})}function Z(){if(c&&!c.isDestroyed()){c.focus();return}const l=N();console.log("Creating mirror window with icon path:",l);let a;if(l)try{a=n.nativeImage.createFromPath(l),a&&!a.isEmpty()?console.log("Mirror window icon loaded successfully, size:",a.getSize()):console.warn("Mirror window icon file found but failed to load or is empty")}catch(o){console.error("Error loading mirror window icon:",o)}c=new n.BrowserWindow({width:1920,height:1080,title:"sonomika",icon:a,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:i.join(__dirname,"mirror-preload.js"),backgroundThrottling:!1},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),c.loadURL(`data:text/html,${encodeURIComponent(`
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
  `)}`),c.once("ready-to-show",()=>{c.show(),c.center();try{c.setAspectRatio(F||1920/1080)}catch{}try{z==null&&(z=n.powerSaveBlocker.start("prevent-display-sleep")),c.webContents.setBackgroundThrottling(!1)}catch{}}),c.webContents.on("before-input-event",(o,e)=>{e.key==="Escape"&&c.close()}),c.on("closed",()=>{try{z!=null&&n.powerSaveBlocker.stop(z)}catch{}z=null,console.log("Mirror window closed, notifying main app"),s&&!s.isDestroyed()&&s.webContents.send("mirror-window-closed"),c=null})}function ee(){c&&!c.isDestroyed()&&(c.close(),c=null)}function te(l,a){const t=k.get(l);if(t&&!t.isDestroyed()){try{t.focus()}catch{}return t}const o=i.join(__dirname,"mirror-preload.js"),e=i.join(__dirname,"preload.js"),r=u.existsSync(o)?o:e,d=N(),p=d?n.nativeImage.createFromPath(d):void 0,h=new n.BrowserWindow({width:a?.width??960,height:a?.height??540,x:a?.x,y:a?.y,title:a?.title??`VJ Mirror Slice: ${l}`,icon:p,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:r},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,thickFrame:!1,hasShadow:!1,backgroundColor:"#000000",fullscreenable:!0,autoHideMenuBar:!0,minWidth:320,minHeight:180});try{h.setMenuBarVisibility(!1)}catch{}try{h.removeMenu()}catch{}const y=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${a?.title??`VJ Mirror Slice: ${l}`}</title>
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
  `;h.loadURL(`data:text/html,${encodeURIComponent(y)}`);try{h.show(),h.center()}catch{}return h.once("ready-to-show",()=>{try{h.isVisible()||(h.show(),h.center())}catch{}}),h.on("closed",()=>{k.delete(l)}),h.webContents.on("before-input-event",(v,w)=>{w.key==="Escape"&&h.close()}),k.set(l,h),h}function oe(){const l=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{n.app.quit()}}]},{label:"External",submenu:[{label:"Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{s&&s.webContents.send("toggle-mirror")}},{label:"Advanced Mirror",accelerator:"CmdOrCtrl+Shift+M",click:()=>{s&&s.webContents.send("toggle-advanced-mirror")}},{type:"separator"},{label:"Spout Output",click:()=>{try{s?.webContents.send("spout:toggle")}catch{}}}]},{label:"Record",submenu:[{label:"Record",accelerator:"CmdOrCtrl+Shift+R",click:()=>{s&&s.webContents.send("record:start")}},{label:"Record Settings",click:()=>{s&&s.webContents.send("record:settings")}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{s&&s.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{s&&s.reload()}}]},{label:"Developer",submenu:[{label:"Toggle Debug Overlay",accelerator:"CmdOrCtrl+Shift+D",click:()=>{try{s?.webContents.send("debug:toggleOverlay")}catch{}}},{label:"Show Debug Panel",accelerator:"CmdOrCtrl+Alt+D",click:()=>{try{s?.webContents.send("debug:openPanel")}catch{}}},{type:"separator"},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{s&&s.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],a=n.Menu.buildFromTemplate(l);n.Menu.setApplicationMenu(a)}n.app.whenReady().then(()=>{if(console.log("Electron app is ready"),console.log("=== APP PATHS DEBUG ==="),console.log("app.getAppPath():",n.app.getPath("appData")),console.log("app.getPath(exe):",n.app.getPath("exe")),console.log("process.execPath:",process.execPath),console.log("process.resourcesPath:",process.resourcesPath),process.platform==="win32")try{n.app.setAppUserModelId("com.sonomika.app"),console.log("Set app user model ID for Windows taskbar icon")}catch(t){console.error("Error setting app user model ID:",t)}try{n.app.commandLine.appendSwitch("autoplay-policy","no-user-gesture-required")}catch{}try{const t=N();console.log("Icon path resolved at app.whenReady():",t),process.platform==="darwin"&&t&&n.app.dock&&typeof n.app.dock.setIcon=="function"&&n.app.dock.setIcon(n.nativeImage.createFromPath(t))}catch(t){console.error("Error setting dock icon:",t)}n.app.commandLine.appendSwitch("disable-background-timer-throttling"),n.app.commandLine.appendSwitch("disable-renderer-backgrounding"),n.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");try{const t=n.app.commandLine.getSwitchValue("disable-features"),o="CalculateNativeWinOcclusion";t&&t.length>0?t.split(",").includes(o)||n.app.commandLine.appendSwitch("disable-features",`${t},${o}`):n.app.commandLine.appendSwitch("disable-features",o)}catch{}oe(),Y(),Q(),n.protocol.registerFileProtocol("local-file",(t,o)=>{const e=t.url.replace("local-file://","");console.log("Loading local file:",e),console.log("Request URL:",t.url),console.log("File path resolved:",e),o(e)}),n.ipcMain.handle("show-open-dialog",async(t,o)=>await n.dialog.showOpenDialog(s,o)),n.ipcMain.handle("show-save-dialog",async(t,o)=>{console.log("Show save dialog called with options:",o);const e=await n.dialog.showSaveDialog(s,o);return console.log("Save dialog result:",e),e}),n.ipcMain.handle("save-file",async(t,o,e)=>{try{return await u.promises.writeFile(o,e,"utf8"),!0}catch(r){return console.error("Failed to save file:",r),!1}}),n.ipcMain.handle("save-binary-file",async(t,o,e)=>{try{return console.log("Saving binary file to:",o,"Size:",e.length,"bytes"),await u.promises.writeFile(o,Buffer.from(e)),console.log("Binary file saved successfully"),!0}catch(r){return console.error("Failed to save binary file:",r),!1}});let l=null,a=null;n.ipcMain.handle("offline-render:start",async(t,o)=>{try{const e=i.join(n.app.getPath("userData"),"offline-renders"),r=i.join(e,`${Date.now()}_${(o?.name||"movie").replace(/[^a-z0-9_-]/ig,"_")}`);return await u.promises.mkdir(r,{recursive:!0}),l={dir:r,name:String(o?.name||"movie"),fps:Number(o?.fps)||0,index:0,width:Number(o?.width)||1920,height:Number(o?.height)||1080,quality:o?.quality||"medium"},a=null,console.log("[offline] start",{dir:r,fps:l.fps||"preview",quality:l.quality,size:`${l.width}x${l.height}`}),{success:!0,dir:r}}catch(e){return console.error("[offline] start error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:frame",async(t,o)=>{if(!l)return{success:!1,error:"No session"};try{const e=l,r=i.join(e.dir,`frame_${String(e.index).padStart(6,"0")}.png`),d=String(o?.dataUrl||"").replace(/^data:image\/png;base64,/,"");return await u.promises.writeFile(r,Buffer.from(d,"base64")),e.index+=1,e.index%60===0&&console.log("[offline] saved frames:",e.index),{success:!0,index:e.index}}catch(e){return console.error("[offline] frame error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("offline-render:finish",async(t,o)=>{if(!l)return{success:!1,error:"No session"};l=null;try{return{success:!1,error:"Offline rendering is disabled. Please use WebM recording via MediaRecorder instead."}}catch(e){return console.error("[offline] finish error",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("get-system-audio-stream",async()=>{try{const{desktopCapturer:t}=require("electron"),o=await t.getSources({types:["screen"],thumbnailSize:{width:1,height:1}});if(o.length===0)throw new Error("No screen sources available");return{success:!0,sourceId:(o.find(r=>r.name==="Entire Screen")||o[0]).id}}catch(t){return console.error("Failed to get system audio stream:",t),{success:!1,error:String(t)}}}),n.ipcMain.handle("get-documents-folder",async()=>{try{const t=n.app.getPath("documents");return{success:!0,path:i.join(t,"Sonomika")}}catch(t){return console.error("Failed to get Documents folder:",t),{success:!1,error:String(t)}}}),n.ipcMain.handle("get-app-path",async()=>n.app.getAppPath()),n.ipcMain.handle("get-app-version",async()=>{try{const t=e=>{try{if(!e||!u.existsSync(e))return"";const r=u.readFileSync(e,"utf8"),p=JSON.parse(r)?.version;return typeof p=="string"?p.trim():""}catch{return""}},o=[i.join(n.app.getAppPath(),"package.json"),i.join(process.cwd(),"package.json"),i.resolve(__dirname,"..","..","package.json"),i.resolve(__dirname,"..","package.json")];for(const e of o){const r=t(e);if(r)return r}return n.app.getVersion()}catch(t){return console.error("Failed to get app version:",t),"unknown"}}),n.ipcMain.handle("get-resources-path",async()=>process.resourcesPath||n.app.getAppPath()),n.ipcMain.handle("spout:start",async(t,o)=>{try{const e=j.start($);return e.ok?(console.log("[spout] started sender:",$),{success:!0}):(console.warn("[spout] start failed:",e.error),{success:!1,error:e.error})}catch(e){return console.warn("[spout] start exception:",e),{success:!1,error:String(e)}}}),n.ipcMain.handle("spout:stop",async()=>{try{j.stop();try{setTimeout(()=>{try{j.stop()}catch{}},200)}catch{}return console.log("[spout] stopped"),{success:!0}}catch(t){return console.warn("[spout] stop exception:",t),{success:!1,error:String(t)}}}),n.ipcMain.on("spout:frame",(t,o)=>{try{if(!j.isRunning())return;j.pushDataUrlFrame(String(o?.dataUrl||""),{maxFps:X})}catch{}}),n.ipcMain.handle("read-file-text",async(t,o)=>{try{return await u.promises.readFile(o,"utf8")}catch(e){return console.error("Failed to read file:",e),null}}),n.ipcMain.handle("read-local-file-base64",async(t,o)=>{try{return(await u.promises.readFile(o)).toString("base64")}catch(e){throw console.error("Failed to read local file:",o,e),e}}),n.ipcMain.handle("read-audio-bytes",async(t,o)=>{try{const{fileURLToPath:e}=require("url"),r=typeof o=="string"&&o.startsWith("file:")?e(o):o,d=await u.promises.readFile(r);return d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength)}catch(e){return console.error("read-audio-bytes failed for",o,e),new ArrayBuffer(0)}}),n.ipcMain.handle("authStorage:isEncryptionAvailable",()=>{try{return n.safeStorage.isEncryptionAvailable()}catch{return!1}}),n.ipcMain.on("authStorage:isEncryptionAvailableSync",t=>{try{t.returnValue=n.safeStorage.isEncryptionAvailable()}catch{t.returnValue=!1}}),n.ipcMain.handle("authStorage:save",async(t,o,e)=>{try{return o?e==null||e===""?(delete b[o],_(),!0):(n.safeStorage.isEncryptionAvailable()?b[o]=n.safeStorage.encryptString(e):b[o]=Buffer.from(e,"utf8"),_(),!0):!1}catch(r){return console.error("Failed to save auth blob:",r),!1}}),n.ipcMain.on("authStorage:saveSync",(t,o,e)=>{try{if(!o){t.returnValue=!1;return}if(e==null||e===""){delete b[o],_(),t.returnValue=!0;return}n.safeStorage.isEncryptionAvailable()?b[o]=n.safeStorage.encryptString(e):b[o]=Buffer.from(e,"utf8"),_(),t.returnValue=!0}catch(r){console.error("Failed to save auth blob (sync):",r),t.returnValue=!1}}),n.ipcMain.handle("authStorage:load",async(t,o)=>{try{if(!o)return null;const e=b[o];return e?n.safeStorage.isEncryptionAvailable()?n.safeStorage.decryptString(e):e.toString("utf8"):null}catch(e){return console.error("Failed to load auth blob:",e),null}}),n.ipcMain.on("authStorage:loadSync",(t,o)=>{try{if(!o){t.returnValue=null;return}const e=b[o];if(!e){t.returnValue=null;return}n.safeStorage.isEncryptionAvailable()?t.returnValue=n.safeStorage.decryptString(e):t.returnValue=e.toString("utf8")}catch(e){console.error("Failed to load auth blob (sync):",e),t.returnValue=null}}),n.ipcMain.handle("authStorage:remove",async(t,o)=>{try{return o?(delete b[o],_(),!0):!1}catch(e){return console.error("Failed to remove auth blob:",e),!1}}),n.ipcMain.on("authStorage:removeSync",(t,o)=>{try{if(!o){t.returnValue=!1;return}delete b[o],_(),t.returnValue=!0}catch(e){console.error("Failed to remove auth blob (sync):",e),t.returnValue=!1}}),n.ipcMain.handle("authStorage:loadAll",async()=>{try{const t={};for(const[o,e]of Object.entries(b))try{n.safeStorage.isEncryptionAvailable()?t[o]=n.safeStorage.decryptString(e):t[o]=e.toString("utf8")}catch{}return t}catch(t){return console.error("Failed to loadAll auth blobs:",t),{}}}),n.ipcMain.handle("get-screen-sizes",async()=>{try{const{screen:t}=require("electron"),o=t.getAllDisplays();console.log("Electron main: Detected displays:",o.length),o.forEach((r,d)=>{console.log(`Display ${d+1}:`,{width:r.bounds.width,height:r.bounds.height,x:r.bounds.x,y:r.bounds.y,scaleFactor:r.scaleFactor,rotation:r.rotation,label:r.label})});const e=o.map(r=>({width:r.bounds.width,height:r.bounds.height}));return console.log("Electron main: Returning screen sizes:",e),e}catch(t){return console.error("Failed to get screen sizes:",t),[]}}),n.ipcMain.on("toggle-app-fullscreen",()=>{if(s&&!s.isDestroyed()){const{screen:t}=require("electron");if(s.isKiosk()||s.isFullScreen())s.setKiosk(!1),s.setFullScreen(!1),s.setBounds({width:1200,height:800}),s.center();else{const o=s.getBounds(),e=t.getDisplayMatching(o);s.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),s.setMenuBarVisibility(!1),s.setFullScreenable(!0),s.setAlwaysOnTop(!0),s.setKiosk(!0),s.setFullScreen(!0)}}}),n.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),s?(console.log("Main: calling mainWindow.minimize()"),s.minimize()):console.log("Main: mainWindow is null")}),n.ipcMain.on("window-maximize",()=>{if(console.log("Main: window-maximize IPC received"),s)if(s.isMaximized()){console.log("Main: calling mainWindow.unmaximize()"),s.unmaximize();try{s.webContents.send("window-state",{maximized:!1})}catch{}}else{console.log("Main: calling mainWindow.maximize()"),s.maximize();try{s.webContents.send("window-state",{maximized:!0})}catch{}}else console.log("Main: mainWindow is null")}),n.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),s?(console.log("Main: calling mainWindow.close()"),s.close()):console.log("Main: mainWindow is null")}),n.ipcMain.on("toggle-mirror",()=>{s&&s.webContents.send("toggle-mirror")}),n.ipcMain.on("open-mirror-window",()=>{Z()}),n.ipcMain.on("close-mirror-window",()=>{ee()}),n.ipcMain.on("set-mirror-bg",(t,o)=>{if(c&&!c.isDestroyed()){const e=typeof o=="string"?o.replace(/'/g,"\\'"):"#000000";c.webContents.executeJavaScript(`document.body.style.background='${e}'`)}}),n.ipcMain.on("canvas-data",(t,o)=>{c&&!c.isDestroyed()&&c.webContents.send("update-canvas",o)}),n.ipcMain.on("sendCanvasData",(t,o)=>{if(c&&!c.isDestroyed())try{const e=(typeof o=="string"?o:"").replace(/'/g,"\\'");c.webContents.executeJavaScript(`
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
        `)}catch{}}),n.ipcMain.on("toggle-fullscreen",()=>{if(c&&!c.isDestroyed()){const{screen:t}=require("electron");if(c.isKiosk()||c.isFullScreen()){c.setKiosk(!1),c.setFullScreen(!1);try{c.setVisibleOnAllWorkspaces(!1)}catch{}try{c.setAlwaysOnTop(!0)}catch{}c.setBounds({x:void 0,y:void 0,width:1920,height:1080});try{c.center()}catch{}try{c.focus()}catch{}}else{const o=c.getBounds(),e=t.getDisplayMatching(o);c.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height});try{c.setMenuBarVisibility(!1)}catch{}try{c.setFullScreenable(!0)}catch{}try{process.platform==="darwin"?c.setAlwaysOnTop(!0,"screen-saver"):c.setAlwaysOnTop(!0)}catch{}try{c.setVisibleOnAllWorkspaces(!0,{visibleOnFullScreen:!0})}catch{}try{c.moveTop?.()}catch{}try{c.show()}catch{}try{c.focus()}catch{}c.setKiosk(!0),c.setFullScreen(!0);try{c.moveTop?.()}catch{}try{c.focus()}catch{}}}}),n.ipcMain.on("resize-mirror-window",(t,o,e)=>{if(c&&!c.isDestroyed()){try{let r=Math.max(1,Number(o)||1),d=Math.max(1,Number(e)||1);const{screen:p}=require("electron"),y=p.getPrimaryDisplay().workArea,v=Math.floor(y.width*.9),w=Math.floor(y.height*.9),O=r/d;if(r>v||d>w){const C=v/r,S=w/d,x=Math.min(C,S);r=Math.floor(r*x),d=Math.floor(d*x)}r=Math.max(480,r),d=Math.max(270,d),F&&isFinite(F)&&F>0&&(d=Math.max(1,Math.round(r/F))),console.log("Resizing mirror window to:",r,"x",d,"(aspect locked:",!!F,")"),c.setSize(r,d)}catch{}c.center()}}),n.ipcMain.on("set-mirror-aspect",(t,o,e)=>{try{const r=Math.max(1,Number(o)||1),d=Math.max(1,Number(e)||1),p=r/d;if(F=p,E=p,c&&!c.isDestroyed())try{c.setAspectRatio(p)}catch{}if(I&&!I.isDestroyed())try{I.setAspectRatio(p)}catch{}}catch{}}),n.ipcMain.on("advanced-mirror:open",(t,o)=>{try{if(console.log("[main] advanced-mirror:open",Array.isArray(o)?o.map(e=>e?.id):o),Array.isArray(o))for(const e of o)console.log("[main] createAdvancedMirrorWindow",e?.id),te(String(e.id),e)}catch(e){console.warn("advanced-mirror:open error",e)}}),n.ipcMain.on("advanced-mirror:closeAll",()=>{try{k.forEach((t,o)=>{try{t.isDestroyed()||t.close()}catch{}k.delete(o)})}catch(t){console.warn("advanced-mirror:closeAll error",t)}}),n.ipcMain.on("advanced-mirror:sendSliceData",(t,o,e)=>{const r=k.get(String(o));if(r&&!r.isDestroyed()){const d=(typeof e=="string"?e:"").replace(/'/g,"\\'");r.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${d}') {
              mirrorImage.src = '${d}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),n.ipcMain.on("advanced-mirror:setBg",(t,o,e)=>{const r=k.get(String(o));if(r&&!r.isDestroyed()){const d=typeof e=="string"?e.replace(/'/g,"\\'"):"#000000";r.webContents.executeJavaScript(`document.body.style.background='${d}'`)}}),n.ipcMain.on("advanced-mirror:resize",(t,o,e,r)=>{const d=k.get(String(o));if(d&&!d.isDestroyed())try{d.setSize(e,r),d.center()}catch{}}),n.ipcMain.on("advanced-mirror:toggleFullscreen",(t,o)=>{const e=k.get(String(o));if(e&&!e.isDestroyed()){const{screen:r}=require("electron");if(e.isKiosk()||e.isFullScreen())try{e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:960,height:540}),e.center()}catch{}else try{const d=e.getBounds(),p=r.getDisplayMatching(d);e.setBounds({x:p.bounds.x,y:p.bounds.y,width:p.bounds.width,height:p.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}catch{}}}),L(),n.app.on("activate",()=>{n.BrowserWindow.getAllWindows().length===0&&L()})});try{n.app.on("before-quit",()=>{try{j.stop()}catch{}})}catch{}n.app.on("window-all-closed",()=>{process.platform!=="darwin"&&n.app.quit()});process.on("uncaughtException",l=>{console.error("Uncaught Exception:",l)});process.on("unhandledRejection",(l,a)=>{console.error("Unhandled Rejection at:",a,"reason:",l)});
