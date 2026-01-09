import path from 'path';
import { nativeImage } from 'electron';

type SpoutAddon = {
  SpoutOutput: new (name: string) => {
    updateTexture?: (texture: any) => void;
    updateFrame: (bgra: Buffer, size: { width: number; height: number }) => void;
    close?: () => void;
    release?: () => void;
    dispose?: () => void;
  };
};

export type SpoutStartResult =
  | { ok: true }
  | { ok: false; error: string };

export class SpoutSender {
  private sender: null | InstanceType<SpoutAddon['SpoutOutput']> = null;
  private senderName: string | null = null;
  private lastFrameAtMs = 0;
  private static readonly DEFAULT_SENDER_NAME = 'Sonomika Output';
  private static readonly DEFAULT_MAX_FPS = 60;

  start(senderName: string): SpoutStartResult {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'Spout output is only supported on Windows.' };
    }

    // Spout output settings are fixed.
    // Keep the parameter for API compatibility but ignore it.
    const safeName = SpoutSender.DEFAULT_SENDER_NAME;

    // Restart if sender name changes.
    if (this.sender && this.senderName === safeName) return { ok: true };
    if (this.sender) this.stop();

    const addon = this.tryLoadAddon();
    if (!addon) {
      return {
        ok: false,
        error:
          'Spout addon not found. Build/copy `electron_spout.node` and ensure it is unpacked (not inside asar).',
      };
    }

    try {
      this.sender = new addon.SpoutOutput(safeName);
      this.senderName = safeName;
      this.lastFrameAtMs = 0;
      return { ok: true };
    } catch (e) {
      this.sender = null;
      this.senderName = null;
      return { ok: false, error: `Failed to create Spout sender: ${String(e)}` };
    }
  }

  stop(): void {
    try {
      const s: any = this.sender as any;
      if (s && typeof s.close === 'function') s.close();
      if (s && typeof s.release === 'function') s.release();
      if (s && typeof s.dispose === 'function') s.dispose();
    } catch {}
    this.sender = null;
    this.senderName = null;
  }

  isRunning(): boolean {
    return !!this.sender;
  }

  pushDataUrlFrame(dataUrl: string, opts?: { maxFps?: number }): void {
    const sender = this.sender;
    if (!sender) return;

    // Spout output settings are fixed.
    // Keep opts for API compatibility but ignore it.
    const maxFps = SpoutSender.DEFAULT_MAX_FPS;
    const now = Date.now();
    const interval = 1000 / maxFps;
    if (now - this.lastFrameAtMs < interval) return;

    try {
      const img = nativeImage.createFromDataURL(String(dataUrl || ''));
      if (img.isEmpty()) return;
      // `getBitmap()` is inconsistently typed across Electron versions; `toBitmap()` is stable.
      sender.updateFrame(Buffer.from(img.toBitmap()), img.getSize());
      this.lastFrameAtMs = now;
    } catch {}
  }

  private tryLoadAddon(): SpoutAddon | null {
    const attempts: Array<() => any> = [
      // 1) If required from CWD / node_modules-style.
      () => require('electron_spout.node'),
      () => require('electron-spout.node'),
      // 2) Common dev locations (project root).
      () => require(path.join(process.cwd(), 'electron_spout.node')),
      () => require(path.join(process.cwd(), 'electron-spout.node')),
      () => require(path.join(process.cwd(), 'native', 'electron_spout.node')),
      () => require(path.join(process.cwd(), 'native', 'electron-spout.node')),
      // 3) Production: resources path unpacked (recommended for .node).
      () => require(path.join(process.resourcesPath || '', 'electron_spout.node')),
      () => require(path.join(process.resourcesPath || '', 'electron-spout.node')),
      () => require(path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron_spout.node')),
      () => require(path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron-spout.node')),
      () => require(path.join(process.resourcesPath || '', 'app.asar.unpacked', 'native', 'electron_spout.node')),
      () => require(path.join(process.resourcesPath || '', 'app.asar.unpacked', 'native', 'electron-spout.node')),
    ];

    for (const load of attempts) {
      try {
        const mod = load();
        if (mod && mod.SpoutOutput) return mod as SpoutAddon;
      } catch {}
    }
    return null;
  }
}


