type ThumbnailCacheRecord = {
  dataUrl: string;
  createdAt: number;
};

const videoThumbnailCache = new Map<string, ThumbnailCacheRecord>();

export async function generateVideoThumbnail(
  src: string,
  options?: { captureTimeSec?: number; width?: number; height?: number }
): Promise<string> {
  const cacheKey = `${src}|${options?.captureTimeSec ?? 0.1}|${options?.width ?? 160}x${options?.height ?? 90}`;
  const cached = videoThumbnailCache.get(cacheKey);
  if (cached) {
    return cached.dataUrl;
  }

  const captureTimeSec = options?.captureTimeSec ?? 0.1;
  const targetWidth = options?.width ?? 160;
  const targetHeight = options?.height ?? 90;

  const video = document.createElement('video');
  // Important for local-file scheme and data URLs
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.src = src;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => resolve();
    const onError = () => reject(new Error('Failed to load video'));
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });

  // Some videos need metadata before seeking
  if (Number.isNaN(video.duration) || video.duration === Infinity) {
    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
  }

  // Clamp capture time within duration
  const seekTime = Math.min(Math.max(captureTimeSec, 0), (video.duration || 1) - 0.01);

  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => resolve();
    const onError = () => reject(new Error('Failed to seek video'));
    video.currentTime = seekTime;
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
  });

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Compute fitted rect preserving aspect ratio
  const videoW = video.videoWidth || targetWidth;
  const videoH = video.videoHeight || targetHeight;
  const scale = Math.min(targetWidth / videoW, targetHeight / videoH);
  const drawW = Math.floor(videoW * scale);
  const drawH = Math.floor(videoH * scale);
  const offsetX = Math.floor((targetWidth - drawW) / 2);
  const offsetY = Math.floor((targetHeight - drawH) / 2);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(video, offsetX, offsetY, drawW, drawH);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  videoThumbnailCache.set(cacheKey, { dataUrl, createdAt: Date.now() });
  return dataUrl;
}

export function clearVideoThumbnailCache(): void {
  videoThumbnailCache.clear();
}


