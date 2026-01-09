import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { rcedit } from 'rcedit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;
  
  if (electronPlatformName !== 'win32') {
    return;
  }

  // Use __dirname to get project root (scripts/ -> project root)
  const projectDir = path.join(__dirname, '..');
  const iconPath = path.join(projectDir, 'build', 'icon.ico');
  const exePath = path.join(appOutDir, 'Sonomika.exe');
  const resourcesDir = path.join(appOutDir, 'resources');

  console.log('Embedding icon into executable after packaging...');
  console.log('Icon path:', iconPath);
  console.log('Executable path:', exePath);

  // Include Spout native addon in packaged app (Windows only)
  // We load this at runtime from `process.resourcesPath` (not from inside asar).
  try {
    const candidates = [
      { from: path.join(projectDir, 'electron-spout.node'), to: path.join(resourcesDir, 'electron-spout.node') },
      { from: path.join(projectDir, 'electron_spout.node'), to: path.join(resourcesDir, 'electron_spout.node') },
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c.from)) {
          if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true });
          fs.copyFileSync(c.from, c.to);
          console.log('[afterPack] Copied Spout addon:', path.basename(c.from), '->', c.to);
        }
      } catch (e) {
        console.warn('[afterPack] Failed to copy Spout addon:', c.from, e);
      }
    }
  } catch (e) {
    console.warn('[afterPack] Spout addon copy step failed:', e);
  }

  if (!fs.existsSync(iconPath)) {
    console.error('Icon file not found:', iconPath);
    return;
  }

  if (!fs.existsSync(exePath)) {
    console.error('Executable not found:', exePath);
    return;
  }

  try {
    await rcedit(exePath, {
      icon: iconPath,
    });
    console.log('Icon embedded successfully into packaged executable!');
  } catch (error) {
    console.error('Error embedding icon:', error);
  }
}

