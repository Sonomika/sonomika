import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'path';
import os from 'os';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

// Plugin to copy fonts to dist/fonts/ with original names for Electron
const copyFontsPlugin = () => {
  return {
    name: 'copy-fonts',
    closeBundle() {
      // Run after all bundles are written and the build is complete
      try {
        const fontsSource = resolve(__dirname, 'public/fonts');
        const fontsDest = resolve(__dirname, 'dist/fonts');
        if (existsSync(fontsSource)) {
          if (!existsSync(fontsDest)) {
            mkdirSync(fontsDest, { recursive: true });
          }
          const files = readdirSync(fontsSource);
          let copied = 0;
          files.forEach((file: string) => {
            if (file.endsWith('.ttf')) {
              copyFileSync(
                resolve(fontsSource, file),
                resolve(fontsDest, file)
              );
              copied++;
            }
          });
          if (copied > 0) {
            console.log(`✓ Copied ${copied} fonts to dist/fonts/`);
          }
        }
      } catch (error) {
        console.error('Failed to copy fonts:', error);
      }
    },
  };
};

export default defineConfig({
  plugins: [
    react(),
    electron({
      entry: 'electron/main.ts',
      onstart() {
        // Prevent vite-plugin-electron from auto-starting Electron.
        // We launch Electron explicitly from the npm script.
      },
    }),
    copyFontsPlugin(),
  ],
  cacheDir: resolve(os.tmpdir(), 'vite-sonomika-cache'),
  optimizeDeps: {
    // Force re-optimization on server start to avoid stale caches causing 504s
    force: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}); 