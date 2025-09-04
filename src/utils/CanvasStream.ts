import { useStore } from '../store/store';

export class CanvasStreamManager {
  private canvas: HTMLCanvasElement | null = null;
  private isWindowOpen: boolean = false;
  private animationId: number | null = null;
  private browserWindow: Window | null = null;
  private mirrorCanvas: HTMLCanvasElement | null = null;
  private mirrorCtx: CanvasRenderingContext2D | null = null;
  private blobUrl: string | null = null;
  private directWindow: Window | null = null;
  private originalParent: Node | null = null;
  private placeholderEl: HTMLDivElement | null = null;
  private mode: 'direct-output' | 'electron-stream' | 'browser-bitmap' | null = null;
  private freezeMirror: boolean = false;
  private unfreezeHoldFrames: number = 0;
  private originalCanvasStyle: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  // Method to update canvas reference when real canvas becomes available
  updateCanvas(newCanvas: HTMLCanvasElement): void {
    console.log('CanvasStreamManager: Updating canvas reference');
    this.canvas = newCanvas;
    
    // If we're already streaming, the next frame will use the new canvas
    if (this.isWindowOpen) {
      console.log('CanvasStreamManager: Will use new canvas for next frame');
    }
  }

  async openMirrorWindow(): Promise<void> {
    try {
      // Avoid opening multiple windows
      if (this.isWindowOpen) {
        try { this.directWindow?.focus(); } catch {}
        try { this.browserWindow?.focus(); } catch {}
        return;
      }

      // Prefer direct-output mode (move the live canvas into a child window), like the example
      const triedDirect = this.openDirectOutputWindow();
      if (triedDirect) {
        return;
      }

      if (window.electron && window.electron.openMirrorWindow) {
        window.electron.openMirrorWindow();
        this.isWindowOpen = true;
        
        // Immediately set the mirror window aspect ratio and size to match the composition
        try {
          const comp = (useStore.getState() as any).compositionSettings || {};
          const w = Math.max(1, Number(comp.width) || 1920);
          const h = Math.max(1, Number(comp.height) || 1080);
          // Lock aspect ratio
          (window as any).electron?.setMirrorAspectRatio?.(w, h);
          // Resize window to exact comp size
          (window as any).electron?.resizeMirrorWindow?.(w, h);
        } catch {}

        // Install freeze listener before starting capture, then start streaming shortly after
        try { this.installFreezeListener(); } catch {}
        setTimeout(() => { this.startCanvasCapture(); }, 100);
        
      } else {
        // Fallback to browser window if not in Electron
        this.openBrowserWindow();
      }
    } catch (error) {
      console.error('Failed to open mirror window:', error);
      throw error;
    }
  }

  private installFreezeListener() {
    try {
      const handler = (e: Event) => {
        try {
          const ev = e as CustomEvent;
          const freeze = !!(ev?.detail?.freeze);
          if (freeze) {
            this.freezeMirror = true;
            this.unfreezeHoldFrames = 0;
          } else {
            // Hold a couple frames before resuming to avoid early black frames
            this.freezeMirror = true;
            this.unfreezeHoldFrames = 2;
          }
        } catch {}
      };
      window.addEventListener('mirrorFreeze', handler as any);
      // Freeze immediately on column switches for earlier coverage
      const freezeNow = () => { try { this.freezeMirror = true; this.unfreezeHoldFrames = 0; } catch {} };
      window.addEventListener('columnPlay', freezeNow as any);
    } catch {}
  }

  // Open a same-process child window and move the actual canvas into it
  private openDirectOutputWindow(): boolean {
    try {
      // If settings request keeping preview, skip direct-output and stream instead
      try {
        const keep = (useStore.getState() as any).mirrorKeepPreview;
        if (keep !== false) return false; // default to keeping preview when undefined
      } catch {}
      if (!this.canvas) return false;
      // Open or focus a named window; same-process so we can move DOM nodes
      const win = window.open('', 'output-canvas');
      if (!win) return false;
      this.directWindow = win;

      // Minimal container layout
      win.document.open();
      win.document.write(`<!DOCTYPE html><html><head><title>Output</title><style>
        html, body { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden; }
        /* Allow window dragging on any empty space */
        body { -webkit-app-region: drag; }
        #container { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; }
        /* Canvas sized by script to preserve aspect */
        canvas { display:block; -webkit-app-region: drag; }
        /* Freeze overlay sits above canvas to hold last frame */
        #freeze-overlay { position:fixed; inset:0; background:#000; display:none; align-items:center; justify-content:center; }
        #freeze-overlay img { max-width:100%; max-height:100%; object-fit:contain; image-rendering:auto; }
      </style></head>
      <body>
        <div id="container"></div>
        <div id="freeze-overlay"><img id="freeze-image" /></div>
        <script>
          (function(){
            var targetRatio = null;
            function adjust(){
              try {
                var c = document.querySelector('#container canvas');
                if (!c) return;
                var W = document.documentElement.clientWidth;
                var H = document.documentElement.clientHeight;
                var r = targetRatio || (c.width > 0 && c.height > 0 ? (c.width / c.height) : 16/9);
                // contain fit
                var w = W, h = Math.floor(W / r);
                if (h > H) { h = H; w = Math.floor(H * r); }
                c.style.width = w + 'px';
                c.style.height = h + 'px';
              } catch(e){}
            }
            window.__setAspectRatio = function(r){ targetRatio = r && r > 0 ? r : null; adjust(); };
            window.addEventListener('resize', adjust);
            ['fullscreenchange','webkitfullscreenchange','msfullscreenchange'].forEach(function(evt){
              try { document.addEventListener(evt, function(){ setTimeout(adjust, 0); }); } catch(e){}
            });
            function isFullscreen(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
            function enterFs(){
              const el = document.documentElement;
              (el.requestFullscreen || el.webkitRequestFullscreen || function(){})?.call(el);
            }
            function exitFs(){
              (document.exitFullscreen || document.webkitExitFullscreen || function(){})?.call(document);
            }
            function toggleFs(){ isFullscreen() ? exitFs() : enterFs(); }
            document.addEventListener('dblclick', toggleFs);
            document.addEventListener('keydown', function(e){
              if (e.key === 'Escape') {
                try {
                  if (isFullscreen()) {
                    exitFs();
                  } else {
                    window.close();
                  }
                } catch(e){}
              }
            }, { passive: true });
            // Freeze controls
            var overlay = document.getElementById('freeze-overlay');
            var overlayImg = document.getElementById('freeze-image');
            window.__showFreeze = function(src){ try { if (overlay && overlayImg) { overlayImg.src = src; overlay.style.display = 'flex'; } } catch(e){} };
            window.__hideFreeze = function(){ try { if (overlay && overlayImg) { overlay.style.display = 'none'; overlayImg.src = ''; } } catch(e){} };
          })();
        </script>
      </body></html>`);
      win.document.close();

      const container = win.document.getElementById('container');
      if (!container) return false;

      // Create a placeholder to preserve layout in original parent
      const parent = this.canvas.parentNode;
      this.originalParent = parent;
      // Save original inline style so we can restore after closing mirror
      try {
        this.originalCanvasStyle = (this.canvas as HTMLCanvasElement).getAttribute('style');
      } catch {}
      const placeholder = document.createElement('div');
      placeholder.style.width = (this.canvas as any).style?.width || '100%';
      placeholder.style.height = (this.canvas as any).style?.height || '100%';
      placeholder.style.minHeight = '1px';
      this.placeholderEl = placeholder;
      if (parent) {
        try { parent.insertBefore(placeholder, this.canvas); } catch {}
      }

      // Move the canvas into the external window container
      try { container.appendChild(this.canvas); } catch {}

      // Match background
      try {
        const bg = (useStore.getState() as any).compositionSettings?.backgroundColor || '#000000';
        (container as HTMLElement).style.background = bg;
        win.document.body.style.background = bg;
      } catch {}

      // Size the window to match the canvas/composition, clamped to the current screen
      try {
        const comp = (useStore.getState() as any).compositionSettings || {};
        const compW = Math.max(1, Number(comp.width) || this.canvas.width || 1920);
        const compH = Math.max(1, Number(comp.height) || this.canvas.height || 1080);
        const parentScreen = window.screen || { availWidth: window.innerWidth, availHeight: window.innerHeight } as any;
        const maxW = Math.floor((parentScreen.availWidth || window.innerWidth) * 0.95);
        const maxH = Math.floor((parentScreen.availHeight || window.innerHeight) * 0.95);
        let winW = compW;
        let winH = compH;
        if (winW > maxW || winH > maxH) {
          const scale = Math.min(maxW / winW, maxH / winH);
          winW = Math.max(320, Math.floor(winW * scale));
          winH = Math.max(180, Math.floor(winH * scale));
        }
        try { win.resizeTo(winW, winH); } catch {}
        try {
          const left = Math.max(0, Math.floor(((parentScreen.availWidth || window.innerWidth) - winW) / 2));
          const top = Math.max(0, Math.floor(((parentScreen.availHeight || window.innerHeight) - winH) / 2));
          win.moveTo(left, top);
        } catch {}
        // Provide aspect ratio to child for correct contain sizing
        try { (win as any).__setAspectRatio?.(compW / compH); } catch {}
        // Also lock aspect on Electron child window via IPC (main will map it to the child)
        try { (window as any).electron?.setMirrorAspectRatio?.(compW, compH); } catch {}
      } catch {}

      // Resize handling to trigger R3F size updates in the parent without recursion
      const resize = () => {
        try { window.dispatchEvent(new Event('resize')); } catch {}
      };
      try { win.addEventListener('resize', resize); } catch {}

      // Cleanup on close: restore canvas to original parent
      win.addEventListener('beforeunload', () => {
        try {
          if (this.originalParent && this.canvas) {
            // Put canvas back and remove placeholder
            try { this.originalParent.insertBefore(this.canvas, this.placeholderEl || null); } catch {}
            // Restore original inline style (clears mirror window scaling)
            try {
              if (this.originalCanvasStyle == null) {
                (this.canvas as HTMLCanvasElement).removeAttribute('style');
              } else {
                (this.canvas as HTMLCanvasElement).setAttribute('style', this.originalCanvasStyle);
              }
            } catch {}
            if (this.placeholderEl && this.placeholderEl.parentNode) {
              try { this.placeholderEl.parentNode.removeChild(this.placeholderEl); } catch {}
            }
            // Notify layout to recalc sizes after restoration
            try { window.dispatchEvent(new Event('resize')); } catch {}
          }
        } finally {
          this.placeholderEl = null;
          this.originalParent = null;
          this.originalCanvasStyle = null;
          this.directWindow = null;
          this.isWindowOpen = false;
        }
      }, { once: true });

      this.isWindowOpen = true;
      this.mode = 'direct-output';
      ;(window as any).__CANVAS_STREAM_MODE__ = this.mode;
      try { console.log('[CanvasStream] Mode:', this.mode); } catch {}
      try { win.document.title = 'Output [direct]'; } catch {}
      // Start listening for freeze events
      this.installFreezeListener();
      return true;
    } catch (e) {
      console.warn('Direct output window failed, falling back to stream:', e);
      return false;
    }
  }

  private async openBrowserWindow(): Promise<void> {
    // Fallback for browser environment
    const comp = (useStore.getState() as any).compositionSettings || {};
    const compW = Math.max(1, Number(comp.width) || 1920);
    const compH = Math.max(1, Number(comp.height) || 1080);
    const aspect = compW / compH;
    
    // Start with canvas dimensions, then scale down if needed to fit screen
    let winW = compW;
    let winH = compH;
    
    // Get screen dimensions and scale down if window is too large
    const maxW = Math.floor((window.screen?.availWidth || window.innerWidth) * 0.9);
    const maxH = Math.floor((window.screen?.availHeight || window.innerHeight) * 0.9);
    
    if (winW > maxW || winH > maxH) {
      const scaleW = maxW / winW;
      const scaleH = maxH / winH;
      const scale = Math.min(scaleW, scaleH);
      winW = Math.floor(winW * scale);
      winH = Math.floor(winH * scale);
    }
    
    // Ensure minimum size
    winW = Math.max(480, winW);
    winH = Math.max(270, winH);
    
    const features = `width=${winW},height=${winH},resizable=yes,scrollbars=no,status=no,location=no`;
    
    // Create HTML content for the mirror window
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>sonomika - Mirror [bitmap] </title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
            background: #000;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
          }
          canvas {
            width: 100%;
            height: 100%;
            object-fit: contain;
            image-rendering: auto;
          }
          /* Hide any UI in mirror window */
          .mirror-info { display: none; }
          .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-size: 16px;
            opacity: 0.7;
          }
        </style>
      </head>
      <body>
        <div class="loading">Loading mirror...</div>
        <canvas id="mirror-canvas"></canvas>
        <script>
          // Ensure the page is properly loaded
          document.addEventListener('DOMContentLoaded', function() {
            console.log('Mirror window loaded successfully');
            document.title = 'sonomika - Mirror [bitmap]';
            
            // Hide loading message once canvas is ready
            const canvas = document.getElementById('mirror-canvas');
            if (canvas) {
              const loading = document.querySelector('.loading');
              if (loading) loading.style.display = 'none';
            }
          });

          // Handle ImageBitmap frames via postMessage for efficient transfer
          (function() {
            const canvas = document.getElementById('mirror-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const resize = () => {
              const w = Math.floor(window.innerWidth * dpr);
              const h = Math.floor(window.innerHeight * dpr);
              if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w; canvas.height = h;
              }
            };
            resize();
            window.addEventListener('resize', resize);

            window.addEventListener('message', async (event) => {
              try {
                const data = event.data || {};
                if (data && data.type === 'mirror-frame' && data.bitmap) {
                  const bitmap = data.bitmap; // ImageBitmap
                  // Contain scaling
                  const srcW = bitmap.width, srcH = bitmap.height;
                  const destW = canvas.width, destH = canvas.height;
                  const scale = Math.min(destW / srcW, destH / srcH);
                  const drawW = Math.floor(srcW * scale);
                  const drawH = Math.floor(srcH * scale);
                  const dx = Math.floor((destW - drawW) / 2);
                  const dy = Math.floor((destH - drawH) / 2);
                  ctx.save();
                  ctx.fillStyle = data.background || '#000000';
                  ctx.fillRect(0, 0, destW, destH);
                  ctx.imageSmoothingEnabled = true;
                  try { ctx.imageSmoothingQuality = data.quality || 'high'; } catch {}
                  ctx.drawImage(bitmap, dx, dy, drawW, drawH);
                  ctx.restore();
                  try { bitmap.close && bitmap.close(); } catch {}
                }
              } catch (e) {
                console.warn('Mirror window draw error:', e);
              }
            }, false);
          })();
        </script>
      </body>
      </html>
    `;

    // Create blob URL instead of data URL to avoid browser security restrictions
    const blob = new Blob([htmlContent], { type: 'text/html' });
    this.blobUrl = URL.createObjectURL(blob);
    const streamWindow = window.open(this.blobUrl, 'mirror_window', features);

    if (!streamWindow) {
      throw new Error('Failed to open mirror window');
    }

    // Wait for the window to load and DOM to be ready
    await new Promise(resolve => {
      if (streamWindow.document.readyState === 'complete') {
        resolve(true);
      } else {
        streamWindow.addEventListener('load', resolve, { once: true });
      }
    });

    // Wait a bit more for DOM elements to be fully available
    await new Promise(resolve => setTimeout(resolve, 100));

    // Cache refs for drawing in web environment
    this.browserWindow = streamWindow;
    this.mirrorCanvas = streamWindow.document.getElementById('mirror-canvas') as HTMLCanvasElement | null;
    this.mirrorCtx = this.mirrorCanvas ? this.mirrorCanvas.getContext('2d') : null;

    // Log for debugging
    console.log('Mirror window canvas found:', !!this.mirrorCanvas);
    console.log('Mirror window context found:', !!this.mirrorCtx);

    // Sync backing store size with viewport for crisp rendering
    const resizeMirrorCanvas = () => {
      if (!this.browserWindow || !this.mirrorCanvas) return;
      const dpr = this.browserWindow.devicePixelRatio || 1;
      const width = Math.floor(this.browserWindow.innerWidth * dpr);
      const height = Math.floor(this.browserWindow.innerHeight * dpr);
      if (this.mirrorCanvas.width !== width || this.mirrorCanvas.height !== height) {
        this.mirrorCanvas.width = width;
        this.mirrorCanvas.height = height;
        console.log('Mirror canvas resized to:', width, 'x', height);
      }
    };

    resizeMirrorCanvas();
    this.browserWindow.addEventListener('resize', resizeMirrorCanvas);
    // Resize on fullscreen transitions as well
    ['fullscreenchange','webkitfullscreenchange','msfullscreenchange'].forEach(evt => {
      try { this.browserWindow!.document.addEventListener(evt as any, () => setTimeout(resizeMirrorCanvas, 0)); } catch {}
    });
    this.browserWindow.addEventListener('beforeunload', () => {
      this.closeMirrorWindow();
    });

    // Toggle fullscreen on double-click (enter only; exit via Esc/F11/Chrome UI)
    try {
      const docAny: any = this.browserWindow.document;
      const target: any = this.mirrorCanvas || this.browserWindow.document.documentElement;
      const requestFs = (target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen)?.bind(target);
      (this.mirrorCanvas || this.browserWindow.document.body).addEventListener('dblclick', () => {
        try {
          const isFs = docAny.fullscreenElement || docAny.webkitFullscreenElement || docAny.msFullscreenElement;
          if (!isFs && requestFs) requestFs();
        } catch {}
      });
    } catch {}

    this.isWindowOpen = true;
    // Start streaming frames to the browser window
    this.installFreezeListener();
    this.startCanvasCapture();
  }

  private startCanvasCapture(): void {
    if (!this.canvas) {
      return;
    }

    // Set mirror background to match composition
    try {
      const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
      const electronAny: any = (window as any).electron;
      if (electronAny && typeof electronAny.setMirrorBackground === 'function') {
        electronAny.setMirrorBackground(bg);
      }
    } catch {}

    let lastFrameTime = 0;
    const mq = (useStore.getState() as any).mirrorQuality || 'medium';
    const targetFPS = mq === 'low' ? 30 : 60;
    const frameInterval = 1000 / targetFPS;
    let lastDataUrl = '';

    // Use global rAF for stability across window state changes
    const raf = requestAnimationFrame;
    const caf = cancelAnimationFrame;

    const captureFrame = () => {
      const now = performance.now();
      
      if ((now - lastFrameTime) >= frameInterval) {
        // Ensure we have a valid, non-zero canvas reference
        try {
          const needsReplacement = !this.canvas || !this.canvas.isConnected || this.canvas.width === 0 || this.canvas.height === 0;
          if (needsReplacement) {
            const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
            console.log('Available canvases:', canvases.map(c => ({ id: c.id, width: c.width, height: c.height, connected: c.isConnected })));
            const replacement = canvases.find(c => c.id !== 'dummy-mirror-canvas' && c.width > 0 && c.height > 0);
            if (replacement) {
              console.log('Replacing canvas with:', replacement.id, replacement.width, 'x', replacement.height);
              this.canvas = replacement;
            } else {
              console.log('No replacement canvas found, using current canvas:', this.canvas?.id, this.canvas?.width, 'x', this.canvas?.height);
            }
          }
        } catch (e) {
          console.warn('Canvas replacement error:', e);
        }

        // Check if canvas has content
        if (this.canvas && this.canvas.width > 0 && this.canvas.height > 0) {
          // Debug: log canvas state occasionally
          if (Math.random() < 0.01) {
            console.log('Canvas streaming state:', {
              canvasId: this.canvas.id,
              canvasSize: `${this.canvas.width}x${this.canvas.height}`,
              hasElectron: !!(window.electron && window.electron.sendCanvasData),
              hasBrowserWindow: !!(this.browserWindow && !this.browserWindow.closed),
              hasMirrorCtx: !!this.mirrorCtx,
              hasMirrorCanvas: !!this.mirrorCanvas
            });
          }
          try {
            if (window.electron && window.electron.sendCanvasData) {
              if (this.mode !== 'electron-stream') {
                this.mode = 'electron-stream';
                ;(window as any).__CANVAS_STREAM_MODE__ = this.mode;
                try { console.log('[CanvasStream] Mode:', this.mode); } catch {}
              }
              // If frozen, keep showing last frame and avoid capturing new content to prevent flashes
              if (this.freezeMirror) {
                if (lastDataUrl) {
                  try { window.electron.sendCanvasData(lastDataUrl); } catch {}
                }
                // Count down grace frames after unfreeze request
                if (this.unfreezeHoldFrames > 0) {
                  this.unfreezeHoldFrames -= 1;
                  if (this.unfreezeHoldFrames <= 0) {
                    this.freezeMirror = false;
                  }
                }
                // Skip generating new frame while frozen
              } else {
                // Electron path: composite to (at least) a supersampled size and send as JPEG data URL
              const comp = (useStore.getState() as any).compositionSettings || {};
              const compW = Math.max(1, Number(comp.width) || 1920);
              const compH = Math.max(1, Number(comp.height) || 1080);
              // Determine render target by mirror quality
              const minLongestEdge = mq === 'low' ? 540 : (mq === 'medium' ? 720 : 1080);
              const longest = Math.max(compW, compH);
              const upscale = longest < minLongestEdge ? (minLongestEdge / longest) : 1;
              const targetWidth = Math.max(1, Math.round(compW * upscale));
              const targetHeight = Math.max(1, Math.round(compH * upscale));
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = targetWidth;
              tempCanvas.height = targetHeight;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                const bg = useStore.getState().compositionSettings?.backgroundColor || '#000000';
                // Fill background
                tempCtx.fillStyle = bg;
                tempCtx.fillRect(0, 0, targetWidth, targetHeight);
                // Draw original canvas preserving aspect ratio (contain)
                const srcW = this.canvas!.width;
                const srcH = this.canvas!.height;
                const scale = Math.min(targetWidth / srcW, targetHeight / srcH);
                const drawW = Math.floor(srcW * scale);
                const drawH = Math.floor(srcH * scale);
                const dx = Math.floor((targetWidth - drawW) / 2);
                const dy = Math.floor((targetHeight - drawH) / 2);
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = (mq === 'low' ? 'low' : (mq === 'medium' ? 'medium' : 'high')) as any;
                tempCtx.drawImage(this.canvas!, dx, dy, drawW, drawH);
                // Use a slightly higher quality for fewer artifacts at scale
                const jpegQ = mq === 'low' ? 0.6 : (mq === 'medium' ? 0.85 : 0.95);
                const dataUrl = tempCanvas.toDataURL('image/jpeg', jpegQ);
                if (dataUrl !== lastDataUrl && dataUrl.length > 100) {
                  window.electron.sendCanvasData(dataUrl);
                  lastDataUrl = dataUrl;
                }
              }
              }
            } else if (this.browserWindow && !this.browserWindow.closed) {
              if (this.mode !== 'browser-bitmap') {
                this.mode = 'browser-bitmap';
                ;(window as any).__CANVAS_STREAM_MODE__ = this.mode;
                try { console.log('[CanvasStream] Mode:', this.mode); } catch {}
              }
              // Web path: if frozen, skip sending new frames to keep last frame shown
              if (!this.freezeMirror) {
                const comp = (useStore.getState() as any).compositionSettings || {};
                const bg = comp.backgroundColor || '#000000';
                const quality = (mq === 'low' ? 'low' : (mq === 'medium' ? 'medium' : 'high')) as any;
                const sourceCanvas = this.canvas as HTMLCanvasElement;
                // Create ImageBitmap without blocking the main thread (async)
                createImageBitmap(sourceCanvas).then((bitmap) => {
                  try {
                    this.browserWindow!.postMessage({ type: 'mirror-frame', bitmap, background: bg, quality, freeze: this.freezeMirror }, '*', [bitmap as any]);
                  } catch (e) {
                    try { (bitmap as any).close && (bitmap as any).close(); } catch {}
                  }
                }).catch(() => {});
              } else {
                // Count down grace frames after unfreeze request
                if (this.unfreezeHoldFrames > 0) {
                  this.unfreezeHoldFrames -= 1;
                  if (this.unfreezeHoldFrames <= 0) {
                    this.freezeMirror = false;
                  }
                }
              }
            } else if (this.directWindow && !this.directWindow.closed) {
              // Direct-output: if frozen, capture a frame and show overlay; else hide overlay
              try {
                const comp = (useStore.getState() as any).compositionSettings || {};
                const compW = Math.max(1, Number(comp.width) || 1920);
                const compH = Math.max(1, Number(comp.height) || 1080);
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = compW;
                tempCanvas.height = compH;
                const tctx = tempCanvas.getContext('2d');
                if (tctx) {
                  const bg = comp.backgroundColor || '#000000';
                  tctx.fillStyle = bg;
                  tctx.fillRect(0, 0, compW, compH);
                  const srcW = this.canvas!.width;
                  const srcH = this.canvas!.height;
                  const scale = Math.min(compW / srcW, compH / srcH);
                  const drawW = Math.floor(srcW * scale);
                  const drawH = Math.floor(srcH * scale);
                  const dx = Math.floor((compW - drawW) / 2);
                  const dy = Math.floor((compH - drawH) / 2);
                  tctx.imageSmoothingEnabled = true;
                  tctx.imageSmoothingQuality = (mq === 'low' ? 'low' : (mq === 'medium' ? 'medium' : 'high')) as any;
                  tctx.drawImage(this.canvas!, dx, dy, drawW, drawH);
                  if (this.freezeMirror) {
                    const jpegQ = mq === 'low' ? 0.6 : (mq === 'medium' ? 0.85 : 0.95);
                    const url = tempCanvas.toDataURL('image/jpeg', jpegQ);
                    try { (this.directWindow as any).__showFreeze?.(url); } catch {}
                  } else {
                    try { (this.directWindow as any).__hideFreeze?.(); } catch {}
                  }
                }
              } catch {}
            } else {
              // Browser mirror closed: stop streaming
              if (this.browserWindow && this.browserWindow.closed) {
                this.closeMirrorWindow();
              }
            }
          } catch (error) {
            // Silently handle canvas capture errors
            console.warn('Canvas capture error:', error);
          }
        }
        
        lastFrameTime = now;
      }
      
      this.animationId = raf(captureFrame);
    };

    captureFrame();
  }

  closeMirrorWindow(): void {
    // If using direct window, restore canvas and close the window
    if (this.directWindow && !this.directWindow.closed) {
      try {
        if (this.originalParent && this.canvas) {
          try { this.originalParent.insertBefore(this.canvas, this.placeholderEl || null); } catch {}
        }
        if (this.placeholderEl && this.placeholderEl.parentNode) {
          try { this.placeholderEl.parentNode.removeChild(this.placeholderEl); } catch {}
        }
      } finally {
        try { this.directWindow.close(); } catch {}
        this.directWindow = null;
        this.originalParent = null;
        this.placeholderEl = null;
        this.isWindowOpen = false;
      }
      return;
    }

    if (this.animationId) {
      // Try to cancel on the appropriate window context
      try {
        if (this.browserWindow) {
          this.browserWindow.cancelAnimationFrame(this.animationId);
        } else {
          cancelAnimationFrame(this.animationId);
        }
      } catch {
        try { cancelAnimationFrame(this.animationId); } catch {}
      }
      this.animationId = null;
    }
    
    if (window.electron && window.electron.closeMirrorWindow) {
      window.electron.closeMirrorWindow();
    }

    if (this.browserWindow && !this.browserWindow.closed) {
      try { this.browserWindow.close(); } catch {}
    }
    
    // Clean up blob URL
    if (this.blobUrl) {
      try { URL.revokeObjectURL(this.blobUrl); } catch {}
      this.blobUrl = null;
    }
    
    this.browserWindow = null;
    this.mirrorCanvas = null;
    this.mirrorCtx = null;
    this.isWindowOpen = false;
  }

  isMirrorWindowOpen(): boolean {
    return this.isWindowOpen;
  }
}