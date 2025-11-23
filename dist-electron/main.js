"use strict";const r=require("electron"),u=require("fs"),c=require("path"),N=process.env.VJ_DEBUG_LOGS!=="true";if(N){const l=()=>{};console.log=l,console.warn=l,console.info=l}process.env.ELECTRON_DISABLE_SECURITY_WARNINGS="true";const L=r.app.requestSingleInstanceLock();L?r.app.on("second-instance",()=>{const l=r.BrowserWindow.getAllWindows();l.length>0&&(l[0].isMinimized()&&l[0].restore(),l[0].focus())}):(console.log("Another instance is already running, quitting..."),r.app.quit());let i=null,s=null,F=null,A=null,_=null,P=null;const x=new Map;let y={};function I(){const l=[c.join(process.cwd(),"public","icons","sonomika_icon_2.png"),c.join(__dirname,"../public/icons/sonomika_icon_2.png"),c.join(__dirname,"../../public/icons/sonomika_icon_2.png"),c.join(__dirname,"../icons/sonomika_icon_2.png"),c.join(process.resourcesPath||"","icons","sonomika_icon_2.png"),...process.platform==="win32"?[c.join(process.cwd(),"public","icons","sonomika_icon_2.ico"),c.join(__dirname,"../public/icons/sonomika_icon_2.ico"),c.join(__dirname,"../../public/icons/sonomika_icon_2.ico"),c.join(__dirname,"../icons/sonomika_icon_2.ico"),c.join(process.resourcesPath||"","icons","sonomika_icon_2.ico")]:[]];for(const d of l)try{if(u.existsSync(d))return d}catch{}}function $(){const l=r.app.getPath("userData");return c.join(l,"auth_store.json")}function G(){try{const l=$();if(u.existsSync(l)){const d=u.readFileSync(l,"utf8"),p=JSON.parse(d);y=Object.fromEntries(Object.entries(p).map(([h,o])=>[h,Buffer.from(o,"base64")]))}}catch(l){console.warn("Failed to load encrypted auth store, starting empty:",l),y={}}}function z(){try{const l=$(),d=c.dirname(l);u.existsSync(d)||u.mkdirSync(d,{recursive:!0});const p=Object.fromEntries(Object.entries(y).map(([h,o])=>[h,o.toString("base64")]));u.writeFileSync(l,JSON.stringify(p),"utf8")}catch(l){console.warn("Failed to persist encrypted auth store:",l)}}function U(){try{const l=r.app.getPath("documents"),d=c.join(l,"Sonomika");u.existsSync(d)||(u.mkdirSync(d,{recursive:!0}),console.log("Created Sonomika folder in Documents:",d));const p=["bank","midi mapping","music","recordings","sets","video","ai-templates"];for(const f of p){const g=c.join(d,f);u.existsSync(g)||(u.mkdirSync(g,{recursive:!0}),console.log("Created folder:",g))}const h=[c.join(process.resourcesPath||"","app.asar.unpacked","bank"),c.join(__dirname,"../bank"),c.join(process.cwd(),"bank")],o=c.join(d,"bank");let t=!1;for(const f of h)if(u.existsSync(f)&&!t)try{E(f,o),console.log("Copied bank folder from",f,"to",o),t=!0}catch(g){console.warn("Failed to copy bank folder from",f,":",g)}const e=[c.join(process.resourcesPath||"","app.asar.unpacked","sets"),c.join(__dirname,"../sets"),c.join(process.cwd(),"sets"),c.join(process.cwd(),"bundled","sets")],n=c.join(d,"sets");for(const f of e)if(u.existsSync(f))try{E(f,n),console.log("Copied sets folder from",f,"to",n);break}catch(g){console.warn("Failed to copy sets folder from",f,":",g)}const a=c.join(d,"ai-templates");u.existsSync(a)||u.mkdirSync(a,{recursive:!0});const m=[{filename:"openai.js",content:`
const openaiTemplate = {
  id: 'openai',
  name: 'OpenAI (GPT)',
  description: 'OpenAI GPT models including GPT-4, GPT-3.5, and GPT-5',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  defaultModel: 'gpt-5-mini',
  models: [
    { value: 'gpt-5', label: 'gpt-5' },
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'o4-mini', label: 'o4-mini' },
  ],
  apiKeyStorageKey: 'vj-ai-openai-api-key',
  modelStorageKey: 'vj-ai-openai-model',
  apiKeyPlaceholder: 'sk-...',
  // Models matching this pattern use the provider default temperature only
  noTemperaturePattern: /^gpt-5/i,
  defaultTemperature: 0.7,

  buildRequestBody: (params) => {
    const body = {
      model: params.model,
      messages: params.messages,
    };

    if (!openaiTemplate.noTemperaturePattern || !openaiTemplate.noTemperaturePattern.test(params.model)) {
      body.temperature = params.temperature != null ? params.temperature : openaiTemplate.defaultTemperature;
    }

    return body;
  },

  buildRequestHeaders: (apiKey) => ({
    Authorization: 'Bearer ' + String(apiKey || '').trim(),
    'Content-Type': 'application/json',
  }),

  extractResponseText: (responseData) => {
    try {
      return (
        (responseData &&
          responseData.choices &&
          responseData.choices[0] &&
          responseData.choices[0].message &&
          responseData.choices[0].message.content) ||
        ''
      );
    } catch {
      return '';
    }
  },

  extractErrorMessage: (errorResponse, statusCode) => {
    try {
      if (typeof errorResponse === 'string') {
        try {
          const parsed = JSON.parse(errorResponse);
          return (
            (parsed && parsed.error && parsed.error.message) ||
            parsed.message ||
            'OpenAI error ' + String(statusCode)
          );
        } catch {
          return 'OpenAI error ' + String(statusCode) + ': ' + errorResponse;
        }
      }
      return (
        (errorResponse && errorResponse.error && errorResponse.error.message) ||
        errorResponse.message ||
        'OpenAI error ' + String(statusCode)
      );
    } catch {
      return 'OpenAI error ' + String(statusCode);
    }
  },
};

module.exports = openaiTemplate;
module.exports.default = openaiTemplate;
`.trimStart()},{filename:"gemini.js",content:`
const geminiTemplate = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Google Gemini models (Gemini Pro, Gemini Ultra, etc.)',
  apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
  defaultModel: 'gemini-pro',
  models: [
    { value: 'gemini-pro', label: 'Gemini Pro' },
    { value: 'gemini-ultra', label: 'Gemini Ultra' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  apiKeyStorageKey: 'vj-ai-gemini-api-key',
  modelStorageKey: 'vj-ai-gemini-model',
  apiKeyPlaceholder: 'AIza...',
  defaultTemperature: 0.7,

  buildRequestBody: (params) => {
    const contentParts = (params.messages || [])
      .filter((msg) => msg && msg.role === 'user')
      .map((msg) => ({ text: msg.content }));

    return {
      contents: [
        {
          parts: contentParts,
        },
      ],
      generationConfig: {
        temperature: params.temperature != null ? params.temperature : geminiTemplate.defaultTemperature,
      },
    };
  },

  buildRequestHeaders: () => ({
    'Content-Type': 'application/json',
  }),

  extractResponseText: (responseData) => {
    try {
      return (
        (responseData &&
          responseData.candidates &&
          responseData.candidates[0] &&
          responseData.candidates[0].content &&
          responseData.candidates[0].content.parts &&
          responseData.candidates[0].content.parts[0] &&
          responseData.candidates[0].content.parts[0].text) ||
        ''
      );
    } catch {
      return '';
    }
  },

  extractErrorMessage: (errorResponse, statusCode) => {
    try {
      if (typeof errorResponse === 'string') {
        try {
          const parsed = JSON.parse(errorResponse);
          return (
            (parsed && parsed.error && parsed.error.message) ||
            parsed.message ||
            'Gemini error ' + String(statusCode)
          );
        } catch {
          return 'Gemini error ' + String(statusCode) + ': ' + errorResponse;
        }
      }
      return (
        (errorResponse && errorResponse.error && errorResponse.error.message) ||
        errorResponse.message ||
        'Gemini error ' + String(statusCode)
      );
    } catch {
      return 'Gemini error ' + String(statusCode);
    }
  },
};

module.exports = geminiTemplate;
module.exports.default = geminiTemplate;
`.trimStart()}];for(const f of m)try{const g=c.join(a,f.filename);u.existsSync(g)||(u.writeFileSync(g,f.content,"utf8"),console.log("Seeded AI template file:",g))}catch(g){console.warn("Failed to seed AI template file",f.filename,g)}}catch(l){console.error("Failed to initialize user Documents folders:",l)}}function E(l,d){u.existsSync(d)||u.mkdirSync(d,{recursive:!0});const p=u.readdirSync(l,{withFileTypes:!0});for(const h of p){const o=c.join(l,h.name),t=c.join(d,h.name);h.isDirectory()?E(o,t):u.existsSync(t)||u.copyFileSync(o,t)}}function q(){const l=I(),d=l?r.nativeImage.createFromPath(l):void 0;i=new r.BrowserWindow({width:1200,height:800,frame:!1,titleBarStyle:"hidden",icon:d,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:c.join(__dirname,"preload.js"),backgroundThrottling:!1},show:!1});const p=c.join(__dirname,"preload.js");if(console.log("Preload script path:",p),console.log("Preload script exists:",require("fs").existsSync(p)),require("fs").existsSync(p)){const o=require("fs").readFileSync(p,"utf8");console.log("Preload script first 200 chars:",o.substring(0,200))}i.webContents.session.webRequest.onHeadersReceived((o,t)=>{console.log("Setting CSP headers for URL:",o.url);const e={...o.responseHeaders,"Content-Security-Policy":[]};console.log("CSP headers disabled for development"),t({responseHeaders:e})}),i.once("ready-to-show",()=>{i.show(),i.webContents.setBackgroundThrottling(!1)});try{i.webContents.setWindowOpenHandler(o=>o.frameName==="output-canvas"?{action:"allow",overrideBrowserWindowOptions:{title:"Output",frame:!1,titleBarStyle:"hidden",autoHideMenuBar:!0,backgroundColor:"#000000",fullscreenable:!0,resizable:!0,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,backgroundThrottling:!1}}}:{action:"allow"}),i.webContents.on("did-create-window",(o,t)=>{try{if(t?.frameName==="output-canvas"){A=o;try{o.removeMenu()}catch{}try{o.setMenuBarVisibility(!1)}catch{}try{o.webContents.setBackgroundThrottling(!1)}catch{}try{_&&isFinite(_)&&_>0&&o.setAspectRatio(_)}catch{}try{o.on("closed",()=>{A=null})}catch{}}}catch{}})}catch{}if(i.on("maximize",()=>{try{i?.webContents.send("window-state",{maximized:!0})}catch{}}),i.on("unmaximize",()=>{try{i?.webContents.send("window-state",{maximized:!1})}catch{}}),process.env.NODE_ENV==="development"||!r.app.isPackaged){console.log("Running in development mode");const o=process.env.VITE_DEV_SERVER_URL||process.env.ELECTRON_RENDERER_URL,t=Number(process.env.VITE_DEV_SERVER_PORT||5173),e=[],n=m=>{m&&(e.includes(m)||e.push(m))};n(o),n(`http://localhost:${t}`),n(`http://127.0.0.1:${t}`);const a=(m,f=0)=>{if(!i)return;if(m.length===0){console.warn("All dev server attempts failed; showing inline error page");const k=encodeURIComponent(`<!DOCTYPE html><html><body style="font-family: sans-serif; background: #141414; color: #f5f5f5; padding: 32px;">
          <h1>Dev Server Not Available</h1>
          <p>Could not connect to the Vite dev server on port ${t}.</p>
          <p>Make sure it is running with:</p>
          <pre style="background:#1f1f1f; padding:16px; border-radius:8px;">npm run dev
npm run dev:electron</pre>
        </body></html>`);i.loadURL(`data:text/html,${k}`);return}const g=m[0],M=m.slice(1),b=f+1;console.log(`Trying dev server URL: ${g} (attempt ${b})`),i.loadURL(g).then(()=>{console.log(`Electron loaded renderer from ${g}`),i?.webContents.openDevTools({mode:"detach"})}).catch(k=>{console.warn(`Failed to load ${g}: ${k?.message||k}`);const v=Math.min(5e3,1e3*Math.pow(2,f));console.log(`Retrying with next candidate in ${v}ms`),setTimeout(()=>a(M,b),v)})};setTimeout(()=>a(e),1200)}else{console.log("Running in production mode");const o=r.app.getAppPath(),t=[c.join(o,"dist/index.html"),c.join(__dirname,"../dist/index.html"),c.join(__dirname,"../web/index.html")],e=t.find(n=>{try{return u.existsSync(n)}catch{return!1}});e?(console.log("Loading production file:",e),i.loadFile(e)):(console.error("No production index.html found at",t),console.error("App path:",o),console.error("__dirname:",__dirname),i.loadURL("data:text/html,<html><body><h1>VJ App</h1><p>Missing build.</p></body></html>"))}i.webContents.on("did-finish-load",()=>{console.log("Window loaded successfully")});try{i.webContents.on("render-process-gone",(o,t)=>{console.error("[electron] render-process-gone",t)}),i.webContents.on("unresponsive",()=>{console.error("[electron] webContents became unresponsive")}),i.webContents.on("media-started-playing",()=>{console.log("[electron] media-started-playing")}),i.webContents.on("media-paused",()=>{console.log("[electron] media-paused")})}catch{}i.webContents.on("did-fail-load",(o,t,e)=>{console.error("Failed to load:",t,e)}),i.on("closed",()=>{i=null})}function K(){if(s&&!s.isDestroyed()){s.focus();return}const l=I(),d=l?r.nativeImage.createFromPath(l):void 0;s=new r.BrowserWindow({width:1920,height:1080,title:"sonomika",icon:d,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:c.join(__dirname,"mirror-preload.js"),backgroundThrottling:!1},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,fullscreenable:!0,autoHideMenuBar:!0,minWidth:480,minHeight:270}),s.loadURL(`data:text/html,${encodeURIComponent(`
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
  `)}`),s.once("ready-to-show",()=>{s.show(),s.center();try{s.setAspectRatio(P||1920/1080)}catch{}try{F==null&&(F=r.powerSaveBlocker.start("prevent-display-sleep")),s.webContents.setBackgroundThrottling(!1)}catch{}}),s.webContents.on("before-input-event",(h,o)=>{o.key==="Escape"&&s.close()}),s.on("closed",()=>{try{F!=null&&r.powerSaveBlocker.stop(F)}catch{}F=null,console.log("Mirror window closed, notifying main app"),i&&!i.isDestroyed()&&i.webContents.send("mirror-window-closed"),s=null})}function H(){s&&!s.isDestroyed()&&(s.close(),s=null)}function J(l,d){const p=x.get(l);if(p&&!p.isDestroyed()){try{p.focus()}catch{}return p}const h=c.join(__dirname,"mirror-preload.js"),o=c.join(__dirname,"preload.js"),t=u.existsSync(h)?h:o,e=I(),n=e?r.nativeImage.createFromPath(e):void 0,a=new r.BrowserWindow({width:d?.width??960,height:d?.height??540,x:d?.x,y:d?.y,title:d?.title??`VJ Mirror Slice: ${l}`,icon:n,webPreferences:{nodeIntegration:!1,contextIsolation:!0,sandbox:!1,webSecurity:!1,allowRunningInsecureContent:!0,preload:t},show:!1,resizable:!0,maximizable:!0,fullscreen:!1,kiosk:!1,alwaysOnTop:!0,skipTaskbar:!1,focusable:!0,movable:!0,frame:!1,titleBarStyle:"hidden",transparent:!1,thickFrame:!1,hasShadow:!1,backgroundColor:"#000000",fullscreenable:!0,autoHideMenuBar:!0,minWidth:320,minHeight:180});try{a.setMenuBarVisibility(!1)}catch{}try{a.removeMenu()}catch{}const m=`
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
  `;a.loadURL(`data:text/html,${encodeURIComponent(m)}`);try{a.show(),a.center()}catch{}return a.once("ready-to-show",()=>{try{a.isVisible()||(a.show(),a.center())}catch{}}),a.on("closed",()=>{x.delete(l)}),a.webContents.on("before-input-event",(f,g)=>{g.key==="Escape"&&a.close()}),x.set(l,a),a}function Y(){const l=[{label:"VJ App",submenu:[{label:"About VJ App",role:"about"},{type:"separator"},{label:"Quit",accelerator:"CmdOrCtrl+Q",click:()=>{r.app.quit()}}]},{label:"External",submenu:[{label:"Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{label:"Advanced Mirror",accelerator:"CmdOrCtrl+Shift+M",click:()=>{i&&i.webContents.send("toggle-advanced-mirror")}}]},{label:"Record",submenu:[{label:"Record",accelerator:"CmdOrCtrl+Shift+R",click:()=>{i&&i.webContents.send("record:start")}},{label:"Record Settings",click:()=>{i&&i.webContents.send("record:settings")}}]},{label:"View",submenu:[{label:"Toggle Mirror Window",accelerator:"CmdOrCtrl+M",click:()=>{i&&i.webContents.send("toggle-mirror")}},{type:"separator"},{label:"Reload",accelerator:"CmdOrCtrl+R",click:()=>{i&&i.reload()}}]},{label:"Developer",submenu:[{label:"Toggle Debug Overlay",accelerator:"CmdOrCtrl+Shift+D",click:()=>{try{i?.webContents.send("debug:toggleOverlay")}catch{}}},{label:"Show Debug Panel",accelerator:"CmdOrCtrl+Alt+D",click:()=>{try{i?.webContents.send("debug:openPanel")}catch{}}},{type:"separator"},{label:"Toggle Developer Tools",accelerator:"F12",click:()=>{i&&i.webContents.toggleDevTools()}}]},{label:"Window",submenu:[{label:"Minimize",accelerator:"CmdOrCtrl+M",role:"minimize"},{label:"Close",accelerator:"CmdOrCtrl+W",role:"close"}]}],d=r.Menu.buildFromTemplate(l);r.Menu.setApplicationMenu(d)}r.app.whenReady().then(()=>{console.log("Electron app is ready");try{r.app.commandLine.appendSwitch("autoplay-policy","no-user-gesture-required")}catch{}try{const o=I();process.platform==="darwin"&&o&&r.app.dock&&typeof r.app.dock.setIcon=="function"&&r.app.dock.setIcon(r.nativeImage.createFromPath(o))}catch{}r.app.commandLine.appendSwitch("disable-background-timer-throttling"),r.app.commandLine.appendSwitch("disable-renderer-backgrounding"),r.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");try{const o=r.app.commandLine.getSwitchValue("disable-features"),t="CalculateNativeWinOcclusion";o&&o.length>0?o.split(",").includes(t)||r.app.commandLine.appendSwitch("disable-features",`${o},${t}`):r.app.commandLine.appendSwitch("disable-features",t)}catch{}Y(),G(),U(),r.protocol.registerFileProtocol("local-file",(o,t)=>{const e=o.url.replace("local-file://","");console.log("Loading local file:",e),console.log("Request URL:",o.url),console.log("File path resolved:",e),t(e)}),r.ipcMain.handle("show-open-dialog",async(o,t)=>await r.dialog.showOpenDialog(i,t)),r.ipcMain.handle("show-save-dialog",async(o,t)=>{console.log("Show save dialog called with options:",t);const e=await r.dialog.showSaveDialog(i,t);return console.log("Save dialog result:",e),e}),r.ipcMain.handle("save-file",async(o,t,e)=>{try{return await u.promises.writeFile(t,e,"utf8"),!0}catch(n){return console.error("Failed to save file:",n),!1}}),r.ipcMain.handle("save-binary-file",async(o,t,e)=>{try{return console.log("Saving binary file to:",t,"Size:",e.length,"bytes"),await u.promises.writeFile(t,Buffer.from(e)),console.log("Binary file saved successfully"),!0}catch(n){return console.error("Failed to save binary file:",n),!1}}),require("os");const{spawn:l}=require("child_process"),d=(()=>{try{const o=require("ffmpeg-static");return console.log("[offline] ffmpeg-static path:",o),o}catch{return console.warn("[offline] ffmpeg-static not found"),null}})();let p=null,h=null;r.ipcMain.handle("offline-render:start",async(o,t)=>{try{const e=c.join(r.app.getPath("userData"),"offline-renders"),n=c.join(e,`${Date.now()}_${(t?.name||"movie").replace(/[^a-z0-9_-]/ig,"_")}`);return await u.promises.mkdir(n,{recursive:!0}),p={dir:n,name:String(t?.name||"movie"),fps:Number(t?.fps)||0,index:0,width:Number(t?.width)||1920,height:Number(t?.height)||1080,quality:t?.quality||"medium"},h=null,console.log("[offline] start",{dir:n,fps:p.fps||"preview",quality:p.quality,size:`${p.width}x${p.height}`}),{success:!0,dir:n}}catch(e){return console.error("[offline] start error",e),{success:!1,error:String(e)}}}),r.ipcMain.handle("offline-render:frame",async(o,t)=>{if(!p)return{success:!1,error:"No session"};try{const e=p,n=c.join(e.dir,`frame_${String(e.index).padStart(6,"0")}.png`),a=String(t?.dataUrl||"").replace(/^data:image\/png;base64,/,"");return await u.promises.writeFile(n,Buffer.from(a,"base64")),e.index+=1,e.index%60===0&&console.log("[offline] saved frames:",e.index),{success:!0,index:e.index}}catch(e){return console.error("[offline] frame error",e),{success:!1,error:String(e)}}}),r.ipcMain.handle("offline-render:finish",async(o,t)=>{if(!p)return{success:!1,error:"No session"};const e=p;p=null;try{if(!e||!isFinite(e.index)||e.index<=0)return{success:!1,error:"No frames captured"};if(!d)throw new Error("ffmpeg-static not found");const n=t?.destPath&&typeof t.destPath=="string"?String(t.destPath):"",a=n&&n.trim().length>0?n.toLowerCase().endsWith(".mp4")?n:`${n}.mp4`:c.join(e.dir,`${e.name}.mp4`),m=c.dirname(a);try{await u.promises.mkdir(m,{recursive:!0})}catch{}const f=c.join(m,"frame_%06d.png"),g=c.join(e.dir,"frame_%06d.png"),M=Number(t?.fps)||0,b=M>0?M:e.fps&&e.fps>0?e.fps:0,k=c.join(e.dir,"frame_*.png").replace(/\\/g,"/"),v=["-y",...b>0?["-framerate",String(b)]:[],"-safe","0","-pattern_type","glob","-i",k];let w;const D=async S=>{try{const C=await u.promises.stat(S);return C.isFile()&&C.size>0}catch{return!1}};if(w)try{for(let S=0;S<15&&!await D(w);S++)await new Promise(C=>setTimeout(C,100));await D(w)||(console.warn("[offline] audio not ready, skipping audio mux"),w=void 0)}catch{w=void 0}w&&v.push("-i",w,"-shortest");const O=e.quality==="high"?"16":e.quality==="low"?"24":"18";v.push("-pix_fmt","yuv420p","-c:v","libx264","-preset","medium","-crf",O,a);const B=S=>new Promise((C,R)=>{console.log("[offline] finish: spawning ffmpeg",d,S.join(" "));const T=l(d,S,{stdio:["ignore","pipe","pipe"],windowsVerbatimArguments:!0});let W="";T.stderr?.on("data",j=>{try{const V=j.toString();W+=V,console.log("[ffmpeg]",V.trim())}catch{}}),T.on("error",R),T.on("close",j=>j===0?C():R(new Error(`ffmpeg exited ${j}: ${W.split(`
`).slice(-6).join(`
`)}`)))});try{await B(v)}catch(S){if(w){console.warn("[offline] mux with audio failed, retrying without audio");const C=v.slice(0,0),R=["-y",...b>0?["-framerate",String(b)]:[],"-safe","0","-pattern_type","glob","-i",k,"-pix_fmt","yuv420p","-c:v","libx264","-preset","medium","-crf",O,a];await B(R)}else throw S}console.log("[offline] finished. Video at",a);try{h&&await u.promises.unlink(h)}catch{}return h=null,{success:!0,videoPath:a}}catch(n){return console.error("[offline] finish error",n),{success:!1,error:String(n)}}}),r.ipcMain.handle("get-system-audio-stream",async()=>{try{const{desktopCapturer:o}=require("electron"),t=await o.getSources({types:["screen"],thumbnailSize:{width:1,height:1}});if(t.length===0)throw new Error("No screen sources available");return{success:!0,sourceId:(t.find(n=>n.name==="Entire Screen")||t[0]).id}}catch(o){return console.error("Failed to get system audio stream:",o),{success:!1,error:String(o)}}}),r.ipcMain.handle("get-documents-folder",async()=>{try{const o=r.app.getPath("documents");return{success:!0,path:c.join(o,"Sonomika")}}catch(o){return console.error("Failed to get Documents folder:",o),{success:!1,error:String(o)}}}),r.ipcMain.handle("read-file-text",async(o,t)=>{try{return await u.promises.readFile(t,"utf8")}catch(e){return console.error("Failed to read file:",e),null}}),r.ipcMain.handle("read-local-file-base64",async(o,t)=>{try{return(await u.promises.readFile(t)).toString("base64")}catch(e){throw console.error("Failed to read local file:",t,e),e}}),r.ipcMain.handle("read-audio-bytes",async(o,t)=>{try{const{fileURLToPath:e}=require("url"),n=typeof t=="string"&&t.startsWith("file:")?e(t):t,a=await u.promises.readFile(n);return a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength)}catch(e){return console.error("read-audio-bytes failed for",t,e),new ArrayBuffer(0)}}),r.ipcMain.handle("authStorage:isEncryptionAvailable",()=>{try{return r.safeStorage.isEncryptionAvailable()}catch{return!1}}),r.ipcMain.on("authStorage:isEncryptionAvailableSync",o=>{try{o.returnValue=r.safeStorage.isEncryptionAvailable()}catch{o.returnValue=!1}}),r.ipcMain.handle("authStorage:save",async(o,t,e)=>{try{return t?e==null||e===""?(delete y[t],z(),!0):(r.safeStorage.isEncryptionAvailable()?y[t]=r.safeStorage.encryptString(e):y[t]=Buffer.from(e,"utf8"),z(),!0):!1}catch(n){return console.error("Failed to save auth blob:",n),!1}}),r.ipcMain.on("authStorage:saveSync",(o,t,e)=>{try{if(!t){o.returnValue=!1;return}if(e==null||e===""){delete y[t],z(),o.returnValue=!0;return}r.safeStorage.isEncryptionAvailable()?y[t]=r.safeStorage.encryptString(e):y[t]=Buffer.from(e,"utf8"),z(),o.returnValue=!0}catch(n){console.error("Failed to save auth blob (sync):",n),o.returnValue=!1}}),r.ipcMain.handle("authStorage:load",async(o,t)=>{try{if(!t)return null;const e=y[t];return e?r.safeStorage.isEncryptionAvailable()?r.safeStorage.decryptString(e):e.toString("utf8"):null}catch(e){return console.error("Failed to load auth blob:",e),null}}),r.ipcMain.on("authStorage:loadSync",(o,t)=>{try{if(!t){o.returnValue=null;return}const e=y[t];if(!e){o.returnValue=null;return}r.safeStorage.isEncryptionAvailable()?o.returnValue=r.safeStorage.decryptString(e):o.returnValue=e.toString("utf8")}catch(e){console.error("Failed to load auth blob (sync):",e),o.returnValue=null}}),r.ipcMain.handle("authStorage:remove",async(o,t)=>{try{return t?(delete y[t],z(),!0):!1}catch(e){return console.error("Failed to remove auth blob:",e),!1}}),r.ipcMain.on("authStorage:removeSync",(o,t)=>{try{if(!t){o.returnValue=!1;return}delete y[t],z(),o.returnValue=!0}catch(e){console.error("Failed to remove auth blob (sync):",e),o.returnValue=!1}}),r.ipcMain.handle("authStorage:loadAll",async()=>{try{const o={};for(const[t,e]of Object.entries(y))try{r.safeStorage.isEncryptionAvailable()?o[t]=r.safeStorage.decryptString(e):o[t]=e.toString("utf8")}catch{}return o}catch(o){return console.error("Failed to loadAll auth blobs:",o),{}}}),r.ipcMain.handle("get-screen-sizes",async()=>{try{const{screen:o}=require("electron"),t=o.getAllDisplays();console.log("Electron main: Detected displays:",t.length),t.forEach((n,a)=>{console.log(`Display ${a+1}:`,{width:n.bounds.width,height:n.bounds.height,x:n.bounds.x,y:n.bounds.y,scaleFactor:n.scaleFactor,rotation:n.rotation,label:n.label})});const e=t.map(n=>({width:n.bounds.width,height:n.bounds.height}));return console.log("Electron main: Returning screen sizes:",e),e}catch(o){return console.error("Failed to get screen sizes:",o),[]}}),r.ipcMain.on("toggle-app-fullscreen",()=>{if(i&&!i.isDestroyed()){const{screen:o}=require("electron");if(i.isKiosk()||i.isFullScreen())i.setKiosk(!1),i.setFullScreen(!1),i.setBounds({width:1200,height:800}),i.center();else{const t=i.getBounds(),e=o.getDisplayMatching(t);i.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height}),i.setMenuBarVisibility(!1),i.setFullScreenable(!0),i.setAlwaysOnTop(!0),i.setKiosk(!0),i.setFullScreen(!0)}}}),r.ipcMain.on("window-minimize",()=>{console.log("Main: window-minimize IPC received"),i?(console.log("Main: calling mainWindow.minimize()"),i.minimize()):console.log("Main: mainWindow is null")}),r.ipcMain.on("window-maximize",()=>{if(console.log("Main: window-maximize IPC received"),i)if(i.isMaximized()){console.log("Main: calling mainWindow.unmaximize()"),i.unmaximize();try{i.webContents.send("window-state",{maximized:!1})}catch{}}else{console.log("Main: calling mainWindow.maximize()"),i.maximize();try{i.webContents.send("window-state",{maximized:!0})}catch{}}else console.log("Main: mainWindow is null")}),r.ipcMain.on("window-close",()=>{console.log("Main: window-close IPC received"),i?(console.log("Main: calling mainWindow.close()"),i.close()):console.log("Main: mainWindow is null")}),r.ipcMain.on("toggle-mirror",()=>{i&&i.webContents.send("toggle-mirror")}),r.ipcMain.on("open-mirror-window",()=>{K()}),r.ipcMain.on("close-mirror-window",()=>{H()}),r.ipcMain.on("set-mirror-bg",(o,t)=>{if(s&&!s.isDestroyed()){const e=typeof t=="string"?t.replace(/'/g,"\\'"):"#000000";s.webContents.executeJavaScript(`document.body.style.background='${e}'`)}}),r.ipcMain.on("canvas-data",(o,t)=>{s&&!s.isDestroyed()&&s.webContents.send("update-canvas",t)}),r.ipcMain.on("sendCanvasData",(o,t)=>{if(s&&!s.isDestroyed())try{const e=(typeof t=="string"?t:"").replace(/'/g,"\\'");s.webContents.executeJavaScript(`
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
        `)}catch{}}),r.ipcMain.on("toggle-fullscreen",()=>{if(s&&!s.isDestroyed()){const{screen:o}=require("electron");if(s.isKiosk()||s.isFullScreen()){s.setKiosk(!1),s.setFullScreen(!1);try{s.setVisibleOnAllWorkspaces(!1)}catch{}try{s.setAlwaysOnTop(!0)}catch{}s.setBounds({x:void 0,y:void 0,width:1920,height:1080});try{s.center()}catch{}try{s.focus()}catch{}}else{const t=s.getBounds(),e=o.getDisplayMatching(t);s.setBounds({x:e.bounds.x,y:e.bounds.y,width:e.bounds.width,height:e.bounds.height});try{s.setMenuBarVisibility(!1)}catch{}try{s.setFullScreenable(!0)}catch{}try{process.platform==="darwin"?s.setAlwaysOnTop(!0,"screen-saver"):s.setAlwaysOnTop(!0)}catch{}try{s.setVisibleOnAllWorkspaces(!0,{visibleOnFullScreen:!0})}catch{}try{s.moveTop?.()}catch{}try{s.show()}catch{}try{s.focus()}catch{}s.setKiosk(!0),s.setFullScreen(!0);try{s.moveTop?.()}catch{}try{s.focus()}catch{}}}}),r.ipcMain.on("resize-mirror-window",(o,t,e)=>{if(s&&!s.isDestroyed()){try{let n=Math.max(1,Number(t)||1),a=Math.max(1,Number(e)||1);const{screen:m}=require("electron"),g=m.getPrimaryDisplay().workArea,M=Math.floor(g.width*.9),b=Math.floor(g.height*.9),k=n/a;if(n>M||a>b){const v=M/n,w=b/a,D=Math.min(v,w);n=Math.floor(n*D),a=Math.floor(a*D)}n=Math.max(480,n),a=Math.max(270,a),P&&isFinite(P)&&P>0&&(a=Math.max(1,Math.round(n/P))),console.log("Resizing mirror window to:",n,"x",a,"(aspect locked:",!!P,")"),s.setSize(n,a)}catch{}s.center()}}),r.ipcMain.on("set-mirror-aspect",(o,t,e)=>{try{const n=Math.max(1,Number(t)||1),a=Math.max(1,Number(e)||1),m=n/a;if(P=m,_=m,s&&!s.isDestroyed())try{s.setAspectRatio(m)}catch{}if(A&&!A.isDestroyed())try{A.setAspectRatio(m)}catch{}}catch{}}),r.ipcMain.on("advanced-mirror:open",(o,t)=>{try{if(console.log("[main] advanced-mirror:open",Array.isArray(t)?t.map(e=>e?.id):t),Array.isArray(t))for(const e of t)console.log("[main] createAdvancedMirrorWindow",e?.id),J(String(e.id),e)}catch(e){console.warn("advanced-mirror:open error",e)}}),r.ipcMain.on("advanced-mirror:closeAll",()=>{try{x.forEach((o,t)=>{try{o.isDestroyed()||o.close()}catch{}x.delete(t)})}catch(o){console.warn("advanced-mirror:closeAll error",o)}}),r.ipcMain.on("advanced-mirror:sendSliceData",(o,t,e)=>{const n=x.get(String(t));if(n&&!n.isDestroyed()){const a=(typeof e=="string"?e:"").replace(/'/g,"\\'");n.webContents.executeJavaScript(`
        (function() {
          const mirrorImage = document.getElementById('mirror-image');
          if (mirrorImage) {
            if (mirrorImage.src !== '${a}') {
              mirrorImage.src = '${a}';
              mirrorImage.style.display = 'block';
            }
          }
        })();
      `)}}),r.ipcMain.on("advanced-mirror:setBg",(o,t,e)=>{const n=x.get(String(t));if(n&&!n.isDestroyed()){const a=typeof e=="string"?e.replace(/'/g,"\\'"):"#000000";n.webContents.executeJavaScript(`document.body.style.background='${a}'`)}}),r.ipcMain.on("advanced-mirror:resize",(o,t,e,n)=>{const a=x.get(String(t));if(a&&!a.isDestroyed())try{a.setSize(e,n),a.center()}catch{}}),r.ipcMain.on("advanced-mirror:toggleFullscreen",(o,t)=>{const e=x.get(String(t));if(e&&!e.isDestroyed()){const{screen:n}=require("electron");if(e.isKiosk()||e.isFullScreen())try{e.setKiosk(!1),e.setFullScreen(!1),e.setBounds({width:960,height:540}),e.center()}catch{}else try{const a=e.getBounds(),m=n.getDisplayMatching(a);e.setBounds({x:m.bounds.x,y:m.bounds.y,width:m.bounds.width,height:m.bounds.height}),e.setMenuBarVisibility(!1),e.setFullScreenable(!0),e.setAlwaysOnTop(!0),e.setKiosk(!0),e.setFullScreen(!0)}catch{}}}),q(),r.app.on("activate",()=>{r.BrowserWindow.getAllWindows().length===0&&q()})});r.app.on("window-all-closed",()=>{process.platform!=="darwin"&&r.app.quit()});process.on("uncaughtException",l=>{console.error("Uncaught Exception:",l)});process.on("unhandledRejection",(l,d)=>{console.error("Unhandled Rejection at:",d,"reason:",l)});
