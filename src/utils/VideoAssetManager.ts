export type VideoReadyState = 0 | 1 | 2 | 3 | 4;

export interface ManagedVideo {
  assetId: string;
  element: HTMLVideoElement;
  ready: boolean;
  firstFrameProduced: boolean;
}

export class VideoAssetManager {
  private static instance: VideoAssetManager;
  private idToVideo: Map<string, ManagedVideo> = new Map();
  private inflight: Map<string, Promise<ManagedVideo>> = new Map();

  static getInstance(): VideoAssetManager {
    if (!VideoAssetManager.instance) {
      VideoAssetManager.instance = new VideoAssetManager();
    }
    return VideoAssetManager.instance;
  }

  async getOrCreate(asset: any, getPath: (asset: any) => string): Promise<ManagedVideo> {
    const id = String(asset?.id || '');
    if (!id) throw new Error('VideoAssetManager: asset id is required');
    const existing = this.idToVideo.get(id);
    if (existing) return existing;
    if (this.inflight.has(id)) return this.inflight.get(id)!;

    const promise = new Promise<ManagedVideo>(async (resolve, reject) => {
      try {
        const video = document.createElement('video');
        const src = getPath(asset);
        video.src = src;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        try { (video as any).dataset = { ...(video as any).dataset, assetId: id }; } catch {}
        try { (video as any).__firstFrameProduced = false; } catch {}
        video.preload = 'auto';
        video.style.imageRendering = 'optimizeSpeed';

        const onLoadedData = () => { /* noop, resolved by rVFC below */ };
        const onError = (e: Event) => reject(e);
        video.addEventListener('loadeddata', onLoadedData);
        video.addEventListener('error', onError, { once: true });
        try { video.load(); } catch {}

        // Ensure first decoded frame flag
        try {
          const anyV: any = video as any;
          if (typeof anyV.requestVideoFrameCallback === 'function') {
            anyV.requestVideoFrameCallback(() => { try { anyV.__firstFrameProduced = true; } catch {}; });
          } else {
            const onTU = () => { try { (video as any).__firstFrameProduced = true; } catch {}; video.removeEventListener('timeupdate', onTU); };
            video.addEventListener('timeupdate', onTU);
          }
        } catch {}

        // Attempt to play (muted) to advance decoder
        try { void video.play(); } catch {}

        const managed: ManagedVideo = {
          assetId: id,
          element: video,
          ready: (video.readyState as VideoReadyState) >= 2,
          firstFrameProduced: Boolean((video as any).__firstFrameProduced)
        };
        this.idToVideo.set(id, managed);
        video.removeEventListener('loadeddata', onLoadedData);
        resolve(managed);
      } catch (e) {
        reject(e);
      }
    });
    this.inflight.set(id, promise);
    const result = await promise.finally(() => this.inflight.delete(id));
    return result;
  }

  get(assetId: string): ManagedVideo | undefined {
    return this.idToVideo.get(String(assetId));
  }

  isFirstFrameReady(assetId: string): boolean {
    const mv = this.get(assetId);
    if (!mv) return false;
    const v: any = mv.element as any;
    return Boolean(v && (v.__firstFrameProduced || mv.element.readyState >= 2));
  }

  dispose(assetId: string) {
    const mv = this.idToVideo.get(String(assetId));
    if (!mv) return;
    try { mv.element.pause(); } catch {}
    try { mv.element.src = ''; } catch {}
    this.idToVideo.delete(String(assetId));
  }
}

export const videoAssetManager = VideoAssetManager.getInstance();


