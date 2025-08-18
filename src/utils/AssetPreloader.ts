import { getAssetPath } from './LayerManagerUtils';

// Simple global caches to persist across column switches
const imageCache: Map<string, HTMLImageElement> = new Map();
const videoCache: Map<string, HTMLVideoElement> = new Map();
const videoFrameCanvasCache: Map<string, HTMLCanvasElement> = new Map();
const inflightVideoPromises: Map<string, Promise<HTMLVideoElement>> = new Map();
const inflightImagePromises: Map<string, Promise<HTMLImageElement>> = new Map();

/**
 * Preload all assets for a given column. Resolves when all videos reach readyState >= 2
 * or a timeout elapses. Images are loaded to completion.
 */
export async function preloadColumnAssets(column: any, options?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 1500;
  const promises: Array<Promise<unknown>> = [];

  for (const layer of column?.layers || []) {
    const asset = layer?.asset;
    if (!asset) continue;

    if (asset.type === 'image') {
      promises.push(preloadImageAsset(asset));
    } else if (asset.type === 'video') {
      promises.push(preloadVideoAsset(asset, layer));
    }
  }

  // Race overall preload with a timeout so UI never blocks too long
  await Promise.race([
    Promise.allSettled(promises),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

export function getCachedVideo(assetId: string): HTMLVideoElement | undefined {
  return videoCache.get(assetId);
}

export function getCachedImage(assetId: string): HTMLImageElement | undefined {
  return imageCache.get(assetId);
}

export function getCachedVideoCanvas(assetId: string): HTMLCanvasElement | undefined {
  return videoFrameCanvasCache.get(assetId);
}

async function preloadImageAsset(asset: any): Promise<HTMLImageElement> {
  const id = asset.id;
  if (!id) return Promise.reject(new Error('Image asset missing id'));
  if (imageCache.has(id)) return imageCache.get(id)!;
  if (inflightImagePromises.has(id)) return inflightImagePromises.get(id)!;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const src = getAssetPath(asset);
      img.onload = () => {
        imageCache.set(id, img);
        inflightImagePromises.delete(id);
        resolve(img);
      };
      img.onerror = (e) => {
        inflightImagePromises.delete(id);
        reject(e);
      };
      img.src = src;
    } catch (e) {
      inflightImagePromises.delete(id);
      reject(e);
    }
  });
  inflightImagePromises.set(id, promise);
  return promise;
}

async function preloadVideoAsset(asset: any, layer?: any): Promise<HTMLVideoElement> {
  const id = asset.id;
  if (!id) return Promise.reject(new Error('Video asset missing id'));
  if (videoCache.has(id)) {
    const v = videoCache.get(id)!;
    // If already loaded, return immediately
    if (v.readyState >= 2) return v;
  }
  if (inflightVideoPromises.has(id)) return inflightVideoPromises.get(id)!;

  const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
    try {
      const existing = videoCache.get(id);
      const video = existing || document.createElement('video');
      if (!existing) {
        const src = getAssetPath(asset, true);
        video.src = src;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        if (layer?.id) {
          try { (video as any)['__layerKey'] = layer.id; } catch {}
          video.setAttribute('data-layer-id', layer.id);
        }
        // Hint the browser
        video.preload = 'auto';
        video.style.imageRendering = 'optimizeSpeed';
        video.load();
      }

      const onReady = () => {
        cleanup();
        videoCache.set(id, video);
        resolve(video);
      };
      const onError = (e: Event) => {
        cleanup();
        reject(e);
      };
      const tryPlay = () => { try { void video.play(); } catch {} };

      const cleanup = () => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
        video.removeEventListener('canplay', onReady);
      };

      if (video.readyState >= 2) {
        videoCache.set(id, video);
        trySeedFirstFrameCanvas(id, video);
        tryPlay();
        resolve(video);
      } else {
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('canplay', onReady, { once: true });
        video.addEventListener('error', onError, { once: true });
        tryPlay();
      }
    } catch (e) {
      reject(e);
    }
  });
  inflightVideoPromises.set(id, promise);
  return promise.finally(() => {
    inflightVideoPromises.delete(id);
  });
}

function trySeedFirstFrameCanvas(id: string, video: HTMLVideoElement) {
  try {
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = videoFrameCanvasCache.get(id) || document.createElement('canvas');
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const anyVideo: any = video as any;
    const draw = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        videoFrameCanvasCache.set(id, canvas);
      } catch {}
    };
    if (typeof anyVideo.requestVideoFrameCallback === 'function') {
      anyVideo.requestVideoFrameCallback(() => draw());
    } else {
      // Delay a tick to allow current frame to become available
      setTimeout(draw, 0);
    }
  } catch {}
}


