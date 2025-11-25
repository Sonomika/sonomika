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

  console.log('Embedding icon into executable after packaging...');
  console.log('Icon path:', iconPath);
  console.log('Executable path:', exePath);

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

