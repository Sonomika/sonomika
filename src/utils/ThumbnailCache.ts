type ThumbnailCacheRecord = {
  dataUrl: string;
  createdAt: number;
  lastAccessed: number;
  size: number; // Size of the data URL in bytes
};

interface ThumbnailRequest {
  src: string;
  options: { captureTimeSec?: number; width?: number; height?: number };
  priority: number;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

const videoThumbnailCache = new Map<string, ThumbnailCacheRecord>();
const thumbnailQueue: ThumbnailRequest[] = [];
let isProcessing = false;
let maxConcurrent = 1; // Reduce concurrency while testing performance
let activeGenerations = 0;
let playbackActive = false; // Pause work during playback

// Persistent storage keys
const STORAGE_KEY = 'vj-thumbnail-cache';
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB max cache size
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days max age

// Load cached thumbnails from localStorage on startup
function loadPersistentCache(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: Record<string, ThumbnailCacheRecord> = JSON.parse(stored);
      let totalSize = 0;
      
      // Filter out expired entries and calculate total size
      const now = Date.now();
      const validEntries = Object.entries(parsed).filter(([key, record]) => {
        if (now - record.createdAt > MAX_CACHE_AGE) {
          return false; // Expired
        }
        totalSize += record.size || 0;
        return true;
      });
      
      // If cache is too large, remove oldest entries
      if (totalSize > MAX_CACHE_SIZE) {
        validEntries.sort((a, b) => (b[1].lastAccessed || 0) - (a[1].lastAccessed || 0));
        const maxEntries = Math.floor(MAX_CACHE_SIZE / (totalSize / validEntries.length));
        validEntries.splice(maxEntries);
      }
      
      // Load valid entries into memory cache
      validEntries.forEach(([key, record]) => {
        videoThumbnailCache.set(key, record);
      });
      
      // console.log('📸 Loaded', validEntries.length, 'persistent thumbnails, total size:', formatBytes(totalSize));
    }
  } catch (error) {
    console.warn('📸 Failed to load persistent thumbnail cache:', error);
    // Clear corrupted cache
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Save thumbnails to localStorage
function savePersistentCache(): void {
  try {
    const cacheData: Record<string, ThumbnailCacheRecord> = {};
    let totalSize = 0;
    
    videoThumbnailCache.forEach((record, key) => {
      cacheData[key] = record;
      totalSize += record.size || 0;
    });
    
    // If cache is too large, remove oldest entries
    if (totalSize > MAX_CACHE_SIZE) {
      const entries = Object.entries(cacheData);
      entries.sort((a, b) => (b[1].lastAccessed || 0) - (a[1].lastAccessed || 0));
      
      let currentSize = 0;
      const validEntries: [string, ThumbnailCacheRecord][] = [];
      
      for (const [key, record] of entries) {
        if (currentSize + record.size <= MAX_CACHE_SIZE) {
          validEntries.push([key, record]);
          currentSize += record.size;
        } else {
          break;
        }
      }
      
      // Clear memory cache and reload with valid entries
      videoThumbnailCache.clear();
      validEntries.forEach(([key, record]) => {
        videoThumbnailCache.set(key, record);
      });
      
      // Update cacheData for storage
      Object.keys(cacheData).forEach(key => {
        if (!videoThumbnailCache.has(key)) {
          delete cacheData[key];
        }
      });
      
      // console.log('📸 Trimmed cache to', validEntries.length, 'entries, size:', formatBytes(currentSize));
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheData));
    // console.log('📸 Saved', Object.keys(cacheData).length, 'thumbnails to persistent storage');
  } catch (error) {
    console.warn('📸 Failed to save persistent thumbnail cache:', error);
    // If localStorage is full, clear it and try again
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      // console.log('📸 localStorage full, clearing old entries...');
      localStorage.removeItem(STORAGE_KEY);
      // Try to save again with just the most recent entries
      setTimeout(savePersistentCache, 100);
    }
  }
}

// Format bytes for human reading
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initialize persistent cache on module load
loadPersistentCache();

// Optional autosave disabled during performance testing
const AUTO_SAVE = false;
if (AUTO_SAVE) {
  setInterval(savePersistentCache, 30000);
  window.addEventListener('beforeunload', savePersistentCache);
}

// Listen for app playback events to pause thumbnail work
try {
  window.addEventListener('globalPlay', () => { playbackActive = true; });
  window.addEventListener('columnPlay', () => { playbackActive = true; });
  window.addEventListener('globalPause', () => { playbackActive = false; });
  window.addEventListener('globalStop', () => { playbackActive = false; });
  window.addEventListener('columnStop', () => { playbackActive = false; });
} catch {}

// Process queue with throttling
async function processQueue() {
  if (playbackActive || isProcessing || thumbnailQueue.length === 0 || activeGenerations >= maxConcurrent) {
    return;
  }

  isProcessing = true;
  
  while (thumbnailQueue.length > 0 && activeGenerations < maxConcurrent) {
    const request = thumbnailQueue.shift();
    if (request) {
      activeGenerations++;
      generateThumbnailForRequest(request).finally(() => {
        activeGenerations--;
        // Continue processing queue
        setTimeout(() => processQueue(), 100); // Small delay between generations
      });
    }
  }
  
  isProcessing = false;
}

// Generate thumbnail for a specific request
async function generateThumbnailForRequest(request: ThumbnailRequest) {
  try {
    const result = await generateVideoThumbnailInternal(request.src, request.options);
    request.resolve(result);
  } catch (error) {
    request.reject(error as Error);
  }
}

// Add request to queue with priority
function queueThumbnailRequest(
  src: string,
  options: { captureTimeSec?: number; width?: number; height?: number },
  priority: number = 0
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request: ThumbnailRequest = { src, options, priority, resolve, reject };
    
    // Insert based on priority (higher priority first)
    const insertIndex = thumbnailQueue.findIndex(req => req.priority < priority);
    if (insertIndex === -1) {
      thumbnailQueue.push(request);
    } else {
      thumbnailQueue.splice(insertIndex, 0, request);
    }
    
    // Start processing if not already running
    processQueue();
  });
}

export async function generateVideoThumbnail(
  src: string,
  options?: { captureTimeSec?: number; width?: number; height?: number },
  priority: number = 0
): Promise<string> {
  const cacheKey = `${src}|${options?.captureTimeSec ?? 0.1}|${options?.width ?? 160}x${options?.height ?? 90}`;
  const cached = videoThumbnailCache.get(cacheKey);
  if (cached) {
            // console.log('📸 Using cached thumbnail for:', src);
    // Update last accessed time for LRU behavior
    cached.lastAccessed = Date.now();
    videoThumbnailCache.set(cacheKey, cached);
    return cached.dataUrl;
  }

  // Queue the request instead of generating immediately
  const finalOptions = options || { captureTimeSec: 0.1, width: 160, height: 90 };
  return queueThumbnailRequest(src, finalOptions, priority);
}

// Helper function to convert local-file:// URLs to file:// URLs for Electron
function normalizeVideoSrc(src: string): string {
  if (src.startsWith('local-file://')) {
    const filePath = src.replace('local-file://', '');
    // Normalize backslashes to forward slashes for Windows paths
    const normalizedPath = filePath.replace(/\\/g, '/');
    // Ensure leading slash for drive letters (C:/...)
    const finalPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    return `file://${finalPath}`;
  }
  return src;
}

// Internal thumbnail generation function (moved from original)
async function generateVideoThumbnailInternal(
  src: string,
  options?: { captureTimeSec?: number; width?: number; height?: number }
): Promise<string> {
  const cacheKey = `${src}|${options?.captureTimeSec ?? 0.1}|${options?.width ?? 160}x${options?.height ?? 90}`;
  
          // console.log('📸 Generating new thumbnail for:', src);
  const captureTimeSec = options?.captureTimeSec ?? 0.1;
  const targetWidth = options?.width ?? 160;
  const targetHeight = options?.height ?? 90;

  const video = document.createElement('video');
  // Important for local-file scheme and data URLs
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'metadata'; // Changed from 'auto' to 'metadata' for better performance
  
  // Normalize the src URL for proper Electron file handling
  const normalizedSrc = normalizeVideoSrc(src);
  video.src = normalizedSrc;

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        // console.log('📸 Video loaded successfully for thumbnail:', src);
        resolve();
      };
      const onError = (error: Event) => {
        console.error('📸 Failed to load video for thumbnail:', src, 'normalized:', normalizedSrc, error);
        reject(new Error(`Failed to load video: ${error}`));
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.load();
    });

    // Some videos need metadata before seeking
    if (Number.isNaN(video.duration) || video.duration === Infinity) {
              // console.log('📸 Waiting for video metadata:', src);
      await new Promise<void>((resolve) => {
        video.addEventListener('loadedmetadata', () => {
                      // console.log('📸 Video metadata loaded:', src, 'duration:', video.duration);
          resolve();
        }, { once: true });
      });
    }

    // Clamp capture time within duration
    const seekTime = Math.min(Math.max(captureTimeSec, 0), (video.duration || 1) - 0.01);
            // console.log('📸 Seeking to time:', seekTime, 'for video:', src);

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
                    // console.log('📸 Video seeked successfully:', src);
        resolve();
      };
      const onError = (error: Event) => {
        console.error('📸 Failed to seek video:', src, 'normalized:', normalizedSrc, error);
        reject(new Error(`Failed to seek video: ${error}`));
      };
      video.currentTime = seekTime;
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    // Offload scaling/encoding to worker when possible
    const useWorker = typeof OffscreenCanvas !== 'undefined' && typeof (window as any).createImageBitmap === 'function';
    let dataUrl: string | null = null;
    if (useWorker) {
      try {
        const bitmap: ImageBitmap = await (window as any).createImageBitmap(video);
        const worker = new Worker(new URL('../workers/thumbnailGenerator.worker.ts', import.meta.url), { type: 'module' });
        let regId: string | null = null;
        try { const { workerRegistry } = await import('./WorkerRegistry'); regId = workerRegistry.register({ id: '', kind: 'thumbnail', label: 'thumbnail gen' }); } catch {}
        dataUrl = await new Promise<string>((resolve, reject) => {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const handleMessage = (ev: MessageEvent) => {
            const msg = ev.data || {};
            if (msg.type === 'result' && msg.id === id) {
              cleanup();
              resolve(msg.dataUrl as string);
            } else if (msg.type === 'error' && msg.id === id) {
              cleanup();
              reject(new Error(String(msg.error)));
            }
          };
          const cleanup = () => {
            try { worker.removeEventListener('message', handleMessage as any); } catch {}
            try { worker.terminate(); } catch {}
            try { (async () => { try { const { workerRegistry } = await import('./WorkerRegistry'); if (regId) workerRegistry.unregister(regId); } catch {} })(); } catch {}
          };
          worker.addEventListener('message', handleMessage as any);
          worker.postMessage({
            type: 'generate',
            id,
            bitmap,
            target: { width: targetWidth, height: targetHeight },
            background: '#000',
            quality: 0.7
          }, [bitmap as any]);
        });
      } catch (e) {
        console.warn('📸 Worker thumbnail generation failed, falling back:', e);
      }
    }

    if (!dataUrl) {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      const videoW = video.videoWidth || targetWidth;
      const videoH = video.videoHeight || targetHeight;
      const scale = Math.min(targetWidth / videoW, targetHeight / videoH);
      const drawW = Math.floor(videoW * scale);
      const drawH = Math.floor(videoH * scale);
      const offsetX = Math.floor((targetWidth - drawW) / 2);
      const offsetY = Math.floor((targetHeight - drawH) / 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(video, 0, 0, videoW, videoH, offsetX, offsetY, drawW, drawH);
      dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    }
    // console.log('📸 Generated data URL for thumbnail:', src, 'length:', dataUrl.length);
    
    // Validate the data URL
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) {
      throw new Error('Invalid data URL generated - not a JPEG image');
    }
    
    if (dataUrl.length < 100) {
      throw new Error('Data URL too short - likely corrupted');
    }

    videoThumbnailCache.set(cacheKey, { dataUrl, createdAt: Date.now(), lastAccessed: Date.now(), size: dataUrl.length });
    // console.log('📸 Thumbnail cached successfully for:', src);
    return dataUrl;
    
  } catch (error) {
    console.error('📸 Error generating video thumbnail:', src, error);
    
    // Create a fallback thumbnail with error indication
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VIDEO', targetWidth / 2, targetHeight / 2 - 5);
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText('ERROR', targetWidth / 2, targetHeight / 2 + 5);
      
      const fallbackDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      // console.log('📸 Generated fallback thumbnail for:', src);
      return fallbackDataUrl;
    }
    
    throw error;
  } finally {
    // Clean up video element
    video.remove();
  }
}

export function clearVideoThumbnailCache(): void {
  videoThumbnailCache.clear();
}

// Persistent cache management
export function clearPersistentThumbnailCache(): void {
  localStorage.removeItem(STORAGE_KEY);
  videoThumbnailCache.clear();
  // console.log('📸 Cleared all persistent thumbnails from localStorage and memory.');
}

// Performance tuning functions
export function setMaxConcurrentThumbnails(max: number): void {
  maxConcurrent = Math.max(1, Math.min(5, max)); // Limit between 1-5
  // console.log('📸 Set max concurrent thumbnails to:', maxConcurrent);
}

export function getQueueStatus(): { queueLength: number; activeGenerations: number; maxConcurrent: number } {
  return {
    queueLength: thumbnailQueue.length,
    activeGenerations,
    maxConcurrent
  };
}

export function getCacheStats(): { 
  memoryCacheSize: number; 
  memoryCacheCount: number; 
  persistentCacheSize: number; 
  persistentCacheCount: number;
  totalSizeFormatted: string;
} {
  let memorySize = 0;
  videoThumbnailCache.forEach(record => {
    memorySize += record.size || 0;
  });
  
  let persistentSize = 0;
  let persistentCount = 0;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: Record<string, ThumbnailCacheRecord> = JSON.parse(stored);
      persistentCount = Object.keys(parsed).length;
      Object.values(parsed).forEach(record => {
        persistentSize += record.size || 0;
      });
    }
  } catch (error) {
    console.warn('📸 Failed to read persistent cache stats:', error);
  }
  
  return {
    memoryCacheSize: memorySize,
    memoryCacheCount: videoThumbnailCache.size,
    persistentCacheSize: persistentSize,
    persistentCacheCount: persistentCount,
    totalSizeFormatted: formatBytes(memorySize + persistentSize)
  };
}

export function clearThumbnailQueue(): void {
  thumbnailQueue.length = 0;
      // console.log('📸 Cleared thumbnail queue');
}

// Remove specific thumbnail from cache
export function removeThumbnailFromCache(src: string, options?: { captureTimeSec?: number; width?: number; height?: number }): boolean {
  const cacheKey = `${src}|${options?.captureTimeSec ?? 0.1}|${options?.width ?? 160}x${options?.height ?? 90}`;
  const wasRemoved = videoThumbnailCache.delete(cacheKey);
  if (wasRemoved) {
    // console.log('📸 Removed thumbnail from cache:', src);
    // Trigger save to update persistent storage
    setTimeout(savePersistentCache, 100);
  }
  return wasRemoved;
}

// Clear all thumbnails from memory cache (keeps persistent storage)
export function clearMemoryThumbnailCache(): void {
  const count = videoThumbnailCache.size;
  videoThumbnailCache.clear();
      // console.log('📸 Cleared', count, 'thumbnails from memory cache (persistent storage preserved)');
}


