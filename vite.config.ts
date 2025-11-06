import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'path';
import os from 'os';

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
  ],
  cacheDir: resolve(os.tmpdir(), 'vite-sonomika-cache'),
  optimizeDeps: {
    // Force re-optimization on server start to avoid stale caches causing 504s
    force: true,
  },
  server: {
    host: 'localhost',
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