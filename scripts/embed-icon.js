import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { rcedit } from 'rcedit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
const exePath = path.join(__dirname, '..', 'release', 'win-unpacked', 'Sonomika.exe');

console.log('Embedding icon into executable...');
console.log('Icon path:', iconPath);
console.log('Executable path:', exePath);

if (!fs.existsSync(iconPath)) {
  console.error('Icon file not found:', iconPath);
  process.exit(1);
}

if (!fs.existsSync(exePath)) {
  console.error('Executable not found:', exePath);
  process.exit(1);
}

try {
  await rcedit(exePath, {
    icon: iconPath,
  });
  console.log('Icon embedded successfully!');
} catch (error) {
  console.error('Error embedding icon:', error);
  process.exit(1);
}

