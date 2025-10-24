// Lightweight dev runner to launch Electron after Vite is ready on any port
// Detects the actual URL from Vite stdout or defaults to http://localhost:5173
// Ensures Electron is killed when this process exits.

const { spawn } = require('child_process');
const electronBinary = require('electron');

let electronProc = null;
let resolvedUrl = '';

function launchElectron(url) {
  if (electronProc) return;
  resolvedUrl = url;
  const env = { ...process.env, ELECTRON_RENDERER_URL: url, VITE_DEV_SERVER_URL: url };
  electronProc = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env,
  });
  electronProc.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function cleanup() {
  try { if (electronProc) electronProc.kill('SIGKILL'); } catch {}
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// Connect to Vite logs to detect URL via stdout of the parallel process is not trivial here,
// so we optimistically poll the default and common fallback ports.
const candidates = [5173, 5174, 5175, 5176, 5177].map(p => `http://localhost:${p}`);

async function waitForAnyUrl(urls, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const u of urls) {
      try {
        const ok = await fetch(u, { method: 'HEAD' });
        if (ok.ok) return u;
      } catch {}
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return '';
}

(async () => {
  const url = await waitForAnyUrl(candidates);
  launchElectron(url || candidates[0]);
})();


