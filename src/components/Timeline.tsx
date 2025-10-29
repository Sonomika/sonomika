import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { debounce } from '../utils/debounce';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import AudioWaveform from './AudioWaveform.tsx';
import { useStore } from '../store/store';
import { Slider } from './ui';
import MoveableTimelineClip from './MoveableTimelineClip';
import SimpleTimelineClip from './SimpleTimelineClip';
import { audioContextManager } from '../utils/AudioContextManager';
import { videoAssetManager } from '../utils/VideoAssetManager';
// EffectLoader import removed - using dynamic loading instead

const toFileURL = (absPath: string) => {
  try {
    let normalized = String(absPath || '');
    normalized = normalized.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`;
    }
    return `file://${normalized}`;
  } catch {
    return absPath;
  }
};

const resolveVideoAssetPlaybackPath = (asset: any): string => {
  if (!asset) return '';
  try {
    if (asset.filePath) {
      return toFileURL(asset.filePath);
    }
    const rawPath = asset.path;
    if (typeof rawPath === 'string') {
      if (rawPath.startsWith('file://')) return rawPath;
      if (rawPath.startsWith('local-file://')) {
        return toFileURL(rawPath.replace('local-file://', ''));
      }
    }
    return rawPath || '';
  } catch {
    return asset?.path || '';
  }
};

const getTimelineClipAssetKey = (clip: any): string => {
  try {
    if (clip?.asset?.id != null) return String(clip.asset.id);
    if (clip?.asset?.path) return String(clip.asset.path);
    if (clip?.asset?.filePath) return String(clip.asset.filePath);
    if (clip?.id != null) return String(clip.id);
  } catch {}
  return Math.random().toString(36).slice(2);
};

const waitForVideoFirstFrame = (video: HTMLVideoElement, assetKey: string, timeoutMs = 4000) => {
  return new Promise<void>((resolve) => {
    let settled = false;
    const anyVideo: any = video as any;
    let rVfcId: number | null = null;
    let timeoutId: number | null = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (rVfcId != null && typeof anyVideo.cancelVideoFrameCallback === 'function') {
        try { anyVideo.cancelVideoFrameCallback(rVfcId); } catch {}
      }
      if (timeoutId != null) {
        try { window.clearTimeout(timeoutId); } catch {}
      }
      try { video.removeEventListener('loadeddata', onLoadedData as any); } catch {}
      try { video.removeEventListener('canplaythrough', onLoadedData as any); } catch {}
      try { video.removeEventListener('playing', onPlaying as any); } catch {}
      try { video.removeEventListener('timeupdate', onTimeUpdate as any); } catch {}
    };

    const finish = () => {
      cleanup();
      try {
        videoAssetManager.markFirstFrameReady(assetKey);
        video.pause();
        if (!Number.isNaN(video.duration)) {
          video.currentTime = 0;
        }
      } catch {}
      resolve();
    };

    const onLoadedData = () => {
      if (video.readyState >= 2) {
        finish();
      }
    };

    const onPlaying = () => finish();

    const onTimeUpdate = () => finish();

    if (typeof anyVideo.requestVideoFrameCallback === 'function') {
      try {
        rVfcId = anyVideo.requestVideoFrameCallback(() => finish());
      } catch {
        rVfcId = null;
      }
    }

    try { video.addEventListener('loadeddata', onLoadedData as any, { once: true }); } catch { video.addEventListener('loadeddata', onLoadedData as any); }
    try { video.addEventListener('canplaythrough', onLoadedData as any, { once: true }); } catch {}
    try { video.addEventListener('playing', onPlaying as any, { once: true }); } catch { video.addEventListener('playing', onPlaying as any); }
    try { video.addEventListener('timeupdate', onTimeUpdate as any, { once: true }); } catch { video.addEventListener('timeupdate', onTimeUpdate as any); }

    timeoutId = window.setTimeout(() => finish(), timeoutMs);

    try { video.muted = true; } catch {}
    try { video.currentTime = Math.max(0, Math.min(video.currentTime || 0, video.duration || 0)); } catch {}
    try {
      const playPromise = video.play();
      if (playPromise && typeof (playPromise as any).catch === 'function') {
        (playPromise as any).catch(() => {
          try { video.muted = true; void video.play(); } catch {}
        });
      }
    } catch {}
  });
};

const dispatchTimelineVideoPrimed = (assetKey: string) => {
  if (!assetKey) return;
  try {
    const managed = videoAssetManager.get(assetKey);
    const element = managed?.element;
    document.dispatchEvent(new CustomEvent('timelineVideoPrimed', {
      detail: {
        assetKey,
        element,
      },
    }));
  } catch {}
};

// Context Menu Component
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSplit?: () => void;
  isPlayheadMenu?: boolean;
}

const ClipContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onDelete, onDuplicate, onSplit, isPlayheadMenu = false }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const handleDuplicate = () => {
    onDuplicate();
    onClose();
  };

  const handleSplit = () => {
    if (onSplit) {
      onSplit();
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      className="context-menu tw-fixed tw-z-[10000] tw-min-w-[160px] tw-overflow-hidden tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-lg"
      style={{ left: Math.min(x, window.innerWidth - 160), top: Math.min(y, window.innerHeight - 120) }}
    >
      {isPlayheadMenu ? (
        <div
          onClick={handleSplit}
          className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-py-3 tw-px-5"
        >
          Split Clips at Playhead
        </div>
      ) : (
        <>
          <div
            onClick={handleDuplicate}
            className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
          >
            Duplicate
          </div>
          <div
            onClick={handleDelete}
            className="context-menu-item tw-select-none tw-cursor-pointer tw-text-red-400 tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-py-3 tw-px-5"
          >
            Delete
          </div>
        </>
      )}
    </div>
  );
};

// Track Context Menu Component
interface TrackContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAddTrack: () => void;
  onAddAudioTrack: () => void;
  onRemoveTrack: (trackId: string) => void;
  trackId?: string;
  canRemoveTrack: boolean;
}

const TrackContextMenu: React.FC<TrackContextMenuProps> = ({ 
  x, 
  y, 
  onClose, 
  onAddTrack, 
  onAddAudioTrack,
  onRemoveTrack,
  trackId,
  canRemoveTrack
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleAddTrack = () => {
    onAddTrack();
    onClose();
  };

  const handleAddAudio = () => {
    onAddAudioTrack();
    onClose();
  };

  const handleRemoveTrack = () => {
    if (trackId) {
      onRemoveTrack(trackId);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu tw-fixed tw-z-[10000] tw-min-w-[160px] tw-overflow-hidden tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-lg"
      style={{ left: Math.min(x, window.innerWidth - 160), top: Math.min(y, window.innerHeight - 120) }}
    >
      <div
        onClick={handleAddTrack}
        className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
      >
        Add Track
      </div>
      <div
        onClick={handleAddAudio}
        className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
      >
        Add Audio Track
      </div>
      {canRemoveTrack && trackId && (
        <div
          onClick={handleRemoveTrack}
          className="context-menu-item tw-select-none tw-cursor-pointer tw-text-red-400 tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-py-3 tw-px-5"
        >
          Remove Track
        </div>
      )}
    </div>
  );
};

// (EffectPreview removed as unused)

interface TimelineProps {
  onClose: () => void;
  onPreviewUpdate?: (previewContent: any) => void;
}

interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'effect' | 'audio';
  clips: TimelineClip[];
}

interface TimelineClip {
  id: string;
  startTime: number;
  duration: number;
  asset: any;
  type: 'video' | 'effect' | 'audio';
  name: string;
  params?: any;
}

export const Timeline: React.FC<TimelineProps> = ({ onClose: _onClose, onPreviewUpdate }) => {
  const { currentTimelineSceneId, timelineSnapEnabled, setTimelineSnapEnabled, selectedTimelineClip, timelineScenes, playNextTimelineScene, playRandomTimelineScene, loopCurrentTimelineScene, showTimeline } = useStore() as any;
  
  // Load saved timeline data from localStorage for current scene
  const loadTimelineData = (): TimelineTrack[] => {
    try {
      const savedData = localStorage.getItem(`timeline-tracks-${currentTimelineSceneId}`);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        let tracksData: TimelineTrack[] = parsedData;
        // Ensure an audio track exists when loading old saves
        if (!tracksData.some((t: any) => t.type === 'audio')) {
          tracksData = [
            ...tracksData,
            { id: 'track-audio', name: 'Audio', type: 'audio', clips: [] },
          ];
          console.log('Appended missing audio track to saved timeline data');
        }
        console.log(`Loaded timeline data for scene ${currentTimelineSceneId} from localStorage:`, tracksData);
        return tracksData;
      }
    } catch (error) {
      console.error('Error loading timeline data:', error);
    }
    
    // Default tracks if no saved data
    return [
      { id: 'track-1', name: 'Track 1', type: 'video', clips: [] },
      { id: 'track-2', name: 'Track 2', type: 'video', clips: [] },
      { id: 'track-3', name: 'Track 3', type: 'effect', clips: [] },
      { id: 'track-4', name: 'Audio', type: 'audio', clips: [] }
    ];
  };

  const [tracks, setTracks] = useState<TimelineTrack[]>(loadTimelineData);
  const [currentTime, setCurrentTime] = useState(0);
  // Timeline duration adapts to longest clip end only
  const duration = useMemo(() => {
    let maxEnd = 0;
    try {
      tracks.forEach((track) => {
        track.clips.forEach((clip) => {
          const end = (clip.startTime || 0) + (clip.duration || 0);
          if (end > maxEnd) maxEnd = end;
        });
      });
    } catch {}
    // Snap timeline to the exact longest end (no rounding up)
    // Keep 3-decimal precision to avoid floating noise in layout
    const precise = maxEnd > 0 ? Number((maxEnd || 0).toFixed(3)) : 1;
    const computed = Math.max(precise, 1);
    try {
      // Keep store's timelineDuration in sync with computed duration
      setTimelineDuration(computed);
    } catch {}
    return computed;
  }, [tracks]);
  
  // Reload timeline data when scene changes
  useEffect(() => {
    console.log(`Scene changed to ${currentTimelineSceneId}, reloading timeline data`);
    const newTracks = loadTimelineData();
    setTracks(newTracks);
    setCurrentTime(0);
    setSelectedClips(new Set());
    // Clear any existing playback
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    setIsPlaying(false);
  }, [currentTimelineSceneId]);
  
  // Save timeline data to localStorage for current scene
  const saveTimelineData = (tracksData: TimelineTrack[]) => {
    try {
      localStorage.setItem(`timeline-tracks-${currentTimelineSceneId}`, JSON.stringify(tracksData));
      console.log(`Saved timeline data for scene ${currentTimelineSceneId} to localStorage:`, tracksData);
    } catch (error) {
      console.error('Error saving timeline data:', error);
    }
  };

  // Clear timeline data from localStorage for current scene
  const clearTimelineData = () => {
    try {
      localStorage.removeItem(`timeline-tracks-${currentTimelineSceneId}`);
      console.log(`Cleared timeline data for scene ${currentTimelineSceneId} from localStorage`);
    } catch (error) {
      console.error('Error clearing timeline data:', error);
    }
  };

  // Calculate the earliest clip start time to sync playhead
  const getEarliestClipTime = () => {
    let earliestTime = Number.POSITIVE_INFINITY;
    try {
      tracks.forEach(track => {
        track.clips.forEach(clip => {
          const start = Math.max(0, clip.startTime || 0);
          if (start < earliestTime) earliestTime = start;
        });
      });
    } catch {}
    return Number.isFinite(earliestTime) ? earliestTime : 0;
  };

  // Helper function to start playback with RAF loop
  const startPlayback = useCallback(() => {
    if (isPlayingRef.current) return;
    
    isPlayingRef.current = true;
    setIsPlaying(true);
    try {
      (window as any).__vj_timeline_is_playing__ = true;
      // Publish initial active layers immediately so engines can begin before first RAF update
      const activeClipsNow = getClipsAtTime(currentTime);
      const layersNow = activeClipsNow.map((clip: any) => ({
        id: `timeline-layer-${clip.id}`,
        type: clip.type,
        name: clip.name,
        opacity: (clip.params && clip.params.opacity && typeof clip.params.opacity.value === 'number') ? clip.params.opacity.value : undefined,
        params: clip.params || {},
        asset: clip.asset || {},
        clipId: clip.id,
      }));
      (window as any).__vj_timeline_active_layers__ = layersNow;
      // Fire an initial tick to kick the LFO engine
      try { document.dispatchEvent(new CustomEvent('timelineTick', { detail: { time: currentTime, duration } })); } catch {}
      // Also broadcast play event for any listeners
      try { document.dispatchEvent(new Event('timelinePlay')); } catch {}
    } catch {}
    
    const loop = (ts: number) => {
      if (!isPlayingRef.current) return;
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - (lastTsRef.current || ts)) / 1000;
      lastTsRef.current = ts;
      setCurrentTime(prevTime => {
        const newTime = prevTime + dt;
        if (newTime >= duration) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          try {
            (window as any).__vj_timeline_is_playing__ = false;
            (window as any).__vj_timeline_active_layers__ = [];
          } catch {}
          handleSceneEnd();
          const resetTime = getEarliestClipTime() > 0 ? getEarliestClipTime() : 0;
          setCurrentTime(resetTime);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          return resetTime;
        }
        try {
          const evt = new CustomEvent('timelineTick', { detail: { time: newTime, duration } });
          document.dispatchEvent(evt);
        } catch {}
        return newTime;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [duration, getEarliestClipTime, setCurrentTime]);

  // Handle scene end actions - always get fresh data from store
  const handleSceneEnd = useCallback(() => {
    // Get fresh data from the store instead of relying on closure
    const store = useStore.getState();
    const currentScene = store.timelineScenes.find((s: any) => s.id === store.currentTimelineSceneId);
    const endAction = currentScene?.endOfSceneAction || 'stop';
    
    console.log('🎬 Scene ended, executing action:', endAction, 'currentScene:', currentScene?.name, 'sceneId:', store.currentTimelineSceneId);
    console.log('🎬 Available timelineScenes:', store.timelineScenes.map(s => ({ id: s.id, name: s.name, endOfSceneAction: s.endOfSceneAction })));
    
    switch (endAction) {
      case 'loop':
        console.log('🔄 Looping current scene');
        setCurrentTime(0);
        try {
          // Ensure timeline videos are hard-reset to frame 0 before next loop playback
          document.dispatchEvent(new CustomEvent('videoStop', {
            detail: { type: 'videoStop', allColumns: true, source: 'timeline-loop' }
          }));
          document.dispatchEvent(new CustomEvent('globalStop', {
            detail: { source: 'timeline-loop' }
          }));
          document.dispatchEvent(new Event('timelineStop'));
        } catch {}
        setTimeout(() => {
          console.log('🔄 Starting loop playback');
          startPlayback();
        }, 100);
        break;
        
      case 'play_next':
        console.log('⏭️ Playing next scene - before:', store.currentTimelineSceneId);
        playNextTimelineScene();
        setTimeout(() => {
          console.log('⏭️ Starting next scene playback - after:', store.currentTimelineSceneId);
          startPlayback();
        }, 200);
        break;
        
      case 'random':
        console.log('🎲 Playing random scene');
        playRandomTimelineScene();
        setTimeout(() => {
          console.log('🎲 Starting random scene playback');
          startPlayback();
        }, 200);
        break;
        
      case 'stop':
      default:
        console.log('⏹️ Stopping playback');
        // Timeline will stop automatically
        break;
    }
  }, [playNextTimelineScene, playRandomTimelineScene, setCurrentTime, startPlayback]);

  // (removed unused clearAllTimelineData)

  // Custom setTracks function that also saves to localStorage
  const updateTracks = (newTracks: TimelineTrack[] | ((prev: TimelineTrack[]) => TimelineTrack[])) => {
    setTracks(prevTracks => {
      const updatedTracks = typeof newTracks === 'function' ? newTracks(prevTracks) : newTracks;
      saveTimelineData(updatedTracks);
      return updatedTracks;
    });
  };
  const { timelineZoom, setTimelineZoom, setTimelineDuration } = useStore();
  const zoom = timelineZoom;
  const setZoom = setTimelineZoom;
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef<boolean>(false);
  const [selectedClips, setSelectedClips] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('vj-timeline-selected-clips');
      if (!raw) return new Set<string>();
      const arr = JSON.parse(raw);
      return new Set<string>(Array.isArray(arr) ? arr : []);
    } catch { return new Set<string>(); }
  });
  const [draggedAsset, setDraggedAsset] = useState<any>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  // waveform state managed by wavesurfer
  const [playbackInterval, setPlaybackInterval] = useState<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; sourceTrackId: string } | null>(null);
  // Lasso selection state
  const [isLassoSelecting, setIsLassoSelecting] = useState(false);
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoEnd, setLassoEnd] = useState<{ x: number; y: number } | null>(null);
  // Keep a ref of the latest computed duration so RAF loops use fresh value after trims
  const durationRef = useRef<number>(0);

  const [preloadInfo, setPreloadInfo] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
  const [preloadingMedia, setPreloadingMedia] = useState(false);
  const [showPreloadIndicator, setShowPreloadIndicator] = useState(false);
  const hidePreloadTimeoutRef = useRef<number | null>(null);
  const preloadedVideoAssetsRef = useRef<Set<string>>(new Set());
  const preloadRunIdRef = useRef(0);
  const pendingPlaybackRef = useRef(false);
  const lastPreloadSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (hidePreloadTimeoutRef.current != null) {
        window.clearTimeout(hidePreloadTimeoutRef.current);
        hidePreloadTimeoutRef.current = null;
      }
    };
  }, []);

  const preloadPercent = preloadInfo.total > 0 ? Math.min(100, Math.max(0, Math.round((preloadInfo.loaded / preloadInfo.total) * 100))) : 0;
  const preloadBarWidth = Math.min(100, preloadingMedia && preloadPercent < 6 ? 6 : preloadPercent);

  useEffect(() => {
    preloadedVideoAssetsRef.current = new Set();
    preloadRunIdRef.current += 1;
    lastPreloadSignatureRef.current = null;
    if (hidePreloadTimeoutRef.current != null) {
      window.clearTimeout(hidePreloadTimeoutRef.current);
      hidePreloadTimeoutRef.current = null;
    }
    setPreloadInfo({ loaded: 0, total: 0 });
    setPreloadingMedia(false);
    setShowPreloadIndicator(false);
    pendingPlaybackRef.current = false;
  }, [currentTimelineSceneId]);

  useEffect(() => {
    if (!showTimeline) {
      if (hidePreloadTimeoutRef.current != null) {
        window.clearTimeout(hidePreloadTimeoutRef.current);
        hidePreloadTimeoutRef.current = null;
      }
      setPreloadingMedia((prev) => (prev ? false : prev));
      setShowPreloadIndicator(false);
      pendingPlaybackRef.current = false;
      lastPreloadSignatureRef.current = null;
      return;
    }

    const uniqueVideos = new Map<string, any>();
    try {
      tracks.forEach((track) => {
        (track?.clips || []).forEach((clip: any) => {
          if (clip?.asset?.type === 'video') {
            uniqueVideos.set(getTimelineClipAssetKey(clip), clip.asset);
          }
        });
      });
    } catch {}

    const sortedKeys = Array.from(uniqueVideos.keys()).sort();
    const signature = `${currentTimelineSceneId || 'scene'}|${sortedKeys.join('|')}`;
    const loadingInProgress = preloadInfo.total === uniqueVideos.size && preloadInfo.total > 0 && preloadInfo.loaded < preloadInfo.total;
    if (signature === lastPreloadSignatureRef.current && loadingInProgress) {
      return;
    }
    lastPreloadSignatureRef.current = signature;

    if (hidePreloadTimeoutRef.current != null) {
      window.clearTimeout(hidePreloadTimeoutRef.current);
      hidePreloadTimeoutRef.current = null;
    }

    const total = uniqueVideos.size;
    if (total === 0) {
      setPreloadInfo((prev) => (prev.loaded === 0 && prev.total === 0 ? prev : { loaded: 0, total: 0 }));
      setPreloadingMedia((prev) => (prev ? false : prev));
      setShowPreloadIndicator(false);
      if (pendingPlaybackRef.current && !isPlayingRef.current) {
        pendingPlaybackRef.current = false;
        startPlayback();
      }
      return;
    }

    let loadedCount = 0;
    sortedKeys.forEach((key) => {
      if (preloadedVideoAssetsRef.current.has(key)) {
        loadedCount += 1;
      }
    });

    setPreloadInfo((prev) => (prev.loaded === loadedCount && prev.total === total ? prev : { loaded: loadedCount, total }));

    const assetsToLoad: Array<[string, any]> = [];
    sortedKeys.forEach((key) => {
      if (!preloadedVideoAssetsRef.current.has(key)) {
        assetsToLoad.push([key, uniqueVideos.get(key)]);
      }
    });

    if (assetsToLoad.length === 0) {
      setPreloadingMedia((prev) => (prev ? false : prev));
      setPreloadInfo((prev) => (prev.loaded === total && prev.total === total ? prev : { loaded: total, total }));
      sortedKeys.forEach((key) => dispatchTimelineVideoPrimed(key));
      if (hidePreloadTimeoutRef.current != null) {
        window.clearTimeout(hidePreloadTimeoutRef.current);
      }
      setShowPreloadIndicator(true);
      hidePreloadTimeoutRef.current = window.setTimeout(() => {
        setShowPreloadIndicator(false);
      }, 800);
      if (pendingPlaybackRef.current && !isPlayingRef.current) {
        pendingPlaybackRef.current = false;
        startPlayback();
      }
      return;
    }

    setPreloadingMedia((prev) => (prev ? prev : true));
    setShowPreloadIndicator((prev) => (prev ? prev : true));

    const runId = ++preloadRunIdRef.current;

    const finalizeIfDone = () => {
      if (loadedCount >= total) {
        setPreloadingMedia((prev) => (prev ? false : prev));
        if (pendingPlaybackRef.current && !isPlayingRef.current) {
          pendingPlaybackRef.current = false;
          startPlayback();
        }
        hidePreloadTimeoutRef.current = window.setTimeout(() => {
          if (preloadRunIdRef.current === runId) {
            setShowPreloadIndicator(false);
          }
        }, 800);
      }
    };

    const markAssetLoaded = (assetKey: string) => {
      if (preloadRunIdRef.current !== runId) return;
      if (!preloadedVideoAssetsRef.current.has(assetKey)) {
        preloadedVideoAssetsRef.current.add(assetKey);
        loadedCount += 1;
        setPreloadInfo((prev) => {
          const next = { loaded: loadedCount, total };
          return prev.loaded === next.loaded && prev.total === next.total ? prev : next;
        });
      }
      dispatchTimelineVideoPrimed(assetKey);
      finalizeIfDone();
    };

    assetsToLoad.forEach(([assetKey, asset]) => {
      try {
        videoAssetManager
          .getOrCreate(asset, resolveVideoAssetPlaybackPath)
          .then(async (managed) => {
            if (preloadRunIdRef.current !== runId) return;
            const video: HTMLVideoElement | undefined = managed?.element;
            if (!video) {
              markAssetLoaded(assetKey);
              return;
            }

            if (video.readyState < 2 || !videoAssetManager.isFirstFrameReady(assetKey)) {
              try {
                await waitForVideoFirstFrame(video, assetKey);
              } catch {}
            }

            if (preloadRunIdRef.current !== runId) return;
            markAssetLoaded(assetKey);
          })
          .catch(() => {
            markAssetLoaded(assetKey);
          });
      } catch {
        markAssetLoaded(assetKey);
      }
    });
  }, [showTimeline, currentTimelineSceneId, tracks, preloadInfo, startPlayback]);

  useEffect(() => { durationRef.current = duration; }, [duration]);
  const PIXELS_PER_SECOND = 120;
  const pixelsPerSecond = useMemo(() => PIXELS_PER_SECOND * Math.max(0.05, zoom), [zoom]);
  const [viewportWidth, setViewportWidth] = useState(0);
  // Ensure the timeline canvas is always at least as wide as the viewport (and a sensible minimum)
  const timelinePixelWidth = useMemo(() => {
    const base = Math.max(1, duration * pixelsPerSecond);
    const minW = Math.max(800, viewportWidth || 0);
    return Math.max(base, minW);
  }, [duration, pixelsPerSecond, viewportWidth]);
  const TRACK_MIN_HEIGHT = 28; // slightly taller for readability
  const SHOW_AUDIO_WAVEFORM = false; // Temporarily disable WaveSurfer-based waveform for stability
  const timelineVisualHeight = useMemo(() => {
    const baseRuler = 28; // top ruler height
    const headerHeight = 24; // per-track header
    const gap = 8; // gap between tracks
    const perTrack = TRACK_MIN_HEIGHT + headerHeight + gap;
    // Ensure a sensible minimum height even with few tracks
    return Math.max(280, tracks.length * perTrack + baseRuler);
  }, [tracks.length]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    clipId: string | null;
    trackId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    clipId: null,
    trackId: null,
  });

  // Track context menu state
  const [trackContextMenu, setTrackContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    trackId?: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
  });
  
  const timelineRef = useRef<HTMLDivElement>(null);

  // Display order: reverse non-audio tracks to match column view (top is highest layer), keep audio at bottom
  const displayTracks = useMemo(() => {
    try {
      const nonAudio = (tracks || []).filter((t) => t.type !== 'audio');
      const audio = (tracks || []).filter((t) => t.type === 'audio');
      return [...nonAudio].reverse().concat(audio);
    } catch {
      return tracks || [];
    }
  }, [tracks]);

  // Helper: build file:// URL for absolute paths (Windows-safe)
  const toFileURL = (absPath: string) => {
    try {
      let p = String(absPath || '');
      // Normalize backslashes for Windows paths
      p = p.replace(/\\/g, '/');
      // Ensure leading slash before drive letter
      if (!p.startsWith('/')) p = '/' + p;
      // Encode spaces and special chars to a valid URL
      const url = 'file://' + p;
      return encodeURI(url);
    } catch {
      try { return encodeURI('file://' + absPath); } catch { return 'file://' + absPath; }
    }
  };

  // Resolve audio source path across blob/file/local-file sources
  const getAudioSrc = (asset: any): string => {
    if (!asset) return '';
    try {
      if (asset.filePath) {
        const src = toFileURL(asset.filePath);
        try { console.log('[Timeline][audio] filePath ->', asset.filePath, '=>', src); } catch {}
        return src;
      }
      const p: string = asset.path || '';
      if (p.startsWith('file://')) {
        try { console.log('[Timeline][audio] path(file://) ->', p); } catch {}
        return p;
      }
      if (p.startsWith('local-file://')) {
        const fp = p.replace('local-file://', '');
        const src = toFileURL(fp);
        try { console.log('[Timeline][audio] path(local-file://) ->', p, '=>', src); } catch {}
        return src;
      }
      try { console.log('[Timeline][audio] path(raw) ->', p); } catch {}
      return p;
    } catch {
      return String(asset?.path || '');
    }
  };
  const playheadRef = useRef<HTMLDivElement>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastActiveAudioIdsRef = useRef<Set<string>>(new Set());
  const ensuredAudioTrackRef = useRef<boolean>(false);
  const lassoRef = useRef<HTMLDivElement>(null);
  // Virtualization & scroll state
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollRafRef = useRef<number | null>(null);

  const updateViewportMetrics = () => {
    const el = timelineRef.current;
    if (!el) return;
    setViewportWidth(el.clientWidth);
  };

  const handleScrollThrottled = () => {
    const el = timelineRef.current;
    if (!el) return;
    // rAF throttle to ~60fps
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollLeft(el.scrollLeft);
      setViewportWidth(el.clientWidth);
    });
  };

  useEffect(() => {
    updateViewportMetrics();
    const onResize = () => updateViewportMetrics();
    window.addEventListener('resize', onResize);
    const el = timelineRef.current;
    if (el) {
      // Initialize metrics and subscribe to scroll
      setScrollLeft(el.scrollLeft);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track overflow so scrollbar thumbs appear only when needed
  const [hasOverflowX, setHasOverflowX] = useState(false);
  const [hasOverflowY, setHasOverflowY] = useState(false);
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    try {
      setHasOverflowX((el.scrollWidth - el.clientWidth) > 1);
      setHasOverflowY((el.scrollHeight - el.clientHeight) > 1);
    } catch {}
    // Observe size changes of the viewport
    let ro: ResizeObserver | null = null;
    try {
      const handle = debounce(() => {
        try {
          setViewportWidth(el.clientWidth);
          setHasOverflowX((el.scrollWidth - el.clientWidth) > 1);
          setHasOverflowY((el.scrollHeight - el.clientHeight) > 1);
        } catch {}
      }, 150);
      ro = new ResizeObserver(() => handle());
      ro.observe(el);
    } catch {}
    return () => {
      try { ro && ro.disconnect(); } catch {}
    };
  }, [timelinePixelWidth, tracks.length, duration, zoom]);

  // Listen for external modulation events (from LFO engine) to update clip params while timeline plays
  useEffect(() => {
    const onModulate = (ev: Event) => {
      const e = ev as CustomEvent<any>;
      const detail = e.detail || {};
      const { clipId, paramName, value, isOpacity } = detail;
      if (!clipId || (paramName == null && !isOpacity)) return;
      updateTracks(prev => prev.map(tr => ({
        ...tr,
        clips: tr.clips.map(c => {
          if (c.id !== clipId) return c;
          if (isOpacity) {
            const existing = c.params || {};
            const nextParams = { ...existing, opacity: { ...(existing.opacity || {}), value: typeof value === 'number' ? value : (existing.opacity?.value ?? 1) } } as any;
            return { ...c, params: nextParams } as any;
          }
          const existing = c.params || {};
          const nextParams = { ...existing, [paramName]: { ...(existing[paramName] || {}), value } } as any;
          return { ...c, params: nextParams } as any;
        })
      })));
    };
    const onBatch = (ev: Event) => {
      const e = ev as CustomEvent<any>;
      const { clipId, params } = e.detail || {};
      if (!clipId || !params) return;
      updateTracks(prev => prev.map(tr => ({
        ...tr,
        clips: tr.clips.map(c => {
          if (c.id !== clipId) return c;
          const existing = c.params || {};
          const next = { ...existing } as any;
          Object.entries(params).forEach(([k, v]) => {
            next[k] = { ...(existing[k] || {}), value: (v as any).value != null ? (v as any).value : v };
          });
          return { ...c, params: next } as any;
        })
      })));
    };
    document.addEventListener('timelineModulate', onModulate as any);
    document.addEventListener('timelineModulateBatch', onBatch as any);
    return () => {
      document.removeEventListener('timelineModulate', onModulate as any);
      document.removeEventListener('timelineModulateBatch', onBatch as any);
    };
  }, [updateTracks]);

  // Visible window in seconds with small buffer
  const visibleStartSec = Math.max(0, scrollLeft / Math.max(1, pixelsPerSecond));
  const visibleEndSec = (scrollLeft + Math.max(1, viewportWidth)) / Math.max(1, pixelsPerSecond);
  const VISIBLE_BUFFER_SEC = 2; // render a little outside viewport for smoothness
  

  // Audio waveform functionality removed

  // No waveform setup

  // No waveform helpers

  // Audio waveform functionality fully removed

  // Lasso selection helpers
  const getClipsInLasso = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const selectedClipIds = new Set<string>();
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return selectedClipIds;

    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);

    tracks.forEach(track => {
      track.clips.forEach(clip => {
        const clipElement = document.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;
        if (clipElement) {
          const clipRect = clipElement.getBoundingClientRect();
          // Check if clip intersects with lasso rectangle
          if (clipRect.left < right && clipRect.right > left && 
              clipRect.top < bottom && clipRect.bottom > top) {
            selectedClipIds.add(clip.id);
          }
        }
      });
    });

    return selectedClipIds;
  };

  // Handle drag and drop from media library
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Move if dragging a timeline clip, otherwise copy for assets
    e.dataTransfer.dropEffect = draggingClip ? 'move' : 'copy';
    
    // Add visual feedback
    const target = e.currentTarget as HTMLElement;
    target.classList.add('drag-over');
    
    console.log('Drag over timeline track');
    console.log('DataTransfer types:', e.dataTransfer.types);
    console.log('DataTransfer items:', e.dataTransfer.items);
    console.log('Dragging clip:', draggingClip);
  };

  // Ensure required baseline lanes exist in current state (one-time on mount)
  useEffect(() => {
    if (ensuredAudioTrackRef.current) return;
    ensuredAudioTrackRef.current = true;
    try {
      const next: TimelineTrack[] = [...tracks];
      const hasAudio = next.some((t) => t.type === 'audio');
      if (!hasAudio) {
        next.push({ id: 'track-audio', name: 'Audio', type: 'audio', clips: [] });
      }
      // Ensure at least two video lanes and one effect lane so users can drag into lanes immediately
      const videoCount = next.filter((t) => t.type === 'video').length;
      const effectCount = next.filter((t) => t.type === 'effect').length;
      if (videoCount < 2) {
        const toAdd = 2 - videoCount;
        for (let i = 0; i < toAdd; i++) {
          const idx = videoCount + i + 1;
          next.unshift({ id: `track-video-${idx}`, name: `Track ${idx}`, type: 'video', clips: [] });
        }
      }
      if (effectCount < 1) {
        next.push({ id: 'track-effect-1', name: 'Track 3', type: 'effect', clips: [] });
      }
      if (next.length !== tracks.length) {
        updateTracks(next);
        console.log('Ensured baseline timeline lanes (video/effect/audio)');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragLeave = (e: React.DragEvent) => {
    // Remove visual feedback
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  };

  // Lasso selection mouse handlers
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    // Only start lasso if clicking on empty space (not on a clip or track)
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('track-content')) {
      setIsLassoSelecting(true);
      setLassoStart({ x: e.clientX, y: e.clientY });
      setLassoEnd({ x: e.clientX, y: e.clientY });
    }
  };

  const handleTimelineMouseMove = (e: React.MouseEvent) => {
    if (isLassoSelecting && lassoStart) {
      setLassoEnd({ x: e.clientX, y: e.clientY });
    }
  };

  const handleTimelineMouseUp = (e: React.MouseEvent) => {
    if (isLassoSelecting && lassoStart && lassoEnd) {
      const selectedClipIds = getClipsInLasso(lassoStart, lassoEnd);
      if (selectedClipIds.size > 0) {
        if (e.ctrlKey || e.metaKey) {
          // Add to existing selection
          setSelectedClips(prev => new Set([...prev, ...selectedClipIds]));
        } else {
          // Replace selection
          setSelectedClips(selectedClipIds);
        }
      }
      setIsLassoSelecting(false);
      setLassoStart(null);
      setLassoEnd(null);
    }
  };

  // Unused handler removed

  const isAssetAllowedOnTrack = (trackType: TimelineTrack['type'], assetType: string) => {
    if (trackType === 'audio') return assetType === 'audio';
    // video/effect tracks accept only video or effect
    return assetType === 'video' || assetType === 'effect';
  };

  // Ensure no overlap within a track when positioning a clip
  const clampStartToNeighbors = (
    clips: TimelineClip[],
    candidateStart: number,
    clipDuration: number,
    excludeClipId?: string
  ): number => {
    const sorted = [...clips]
      .filter((c) => (excludeClipId ? c.id !== excludeClipId : true))
      .sort((a, b) => a.startTime - b.startTime);

    // If no clips exist, place at candidate start
    if (sorted.length === 0) {
      return Math.max(0, candidateStart);
    }

    // Check if we can place at the very beginning (before first clip)
    const firstClipStart = sorted[0].startTime;
    if (candidateStart + clipDuration <= firstClipStart) {
      return Math.max(0, candidateStart);
    }

    // Find the first available gap
    for (let i = 0; i < sorted.length; i++) {
      const currentClip = sorted[i];
      const currentClipEnd = currentClip.startTime + currentClip.duration;
      
      // Check if we can place after this clip
      const nextClip = sorted[i + 1];
      if (nextClip) {
        // There's a gap between current clip and next clip
        const gapStart = currentClipEnd;
        const gapEnd = nextClip.startTime;
        
        // Check if our clip fits in this gap and candidate start is within this gap
        if (candidateStart >= gapStart && candidateStart + clipDuration <= gapEnd) {
          return candidateStart;
        }
      } else {
        // This is the last clip, check if we can place after it
        if (candidateStart >= currentClipEnd) {
          return candidateStart;
        }
      }
    }

    // If no valid position found, place at the end of the last clip
    const lastClip = sorted[sorted.length - 1];
    const lastClipEnd = lastClip.startTime + lastClip.duration;
    return Math.max(lastClipEnd, candidateStart);
  };

  // Find the first available non-overlapping start time at or after desiredStart
  const findFirstAvailableStart = (
    clips: TimelineClip[],
    desiredStart: number,
    clipDuration: number
  ): number => {
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    
    // If no clips exist, place at desired start or 0
    if (sorted.length === 0) {
      return Math.max(0, desiredStart);
    }
    
    // Check if we can place at the very beginning (before first clip)
    const firstClipStart = sorted[0].startTime;
    if (desiredStart + clipDuration <= firstClipStart) {
      return Math.max(0, desiredStart);
    }
    
    // Find the first available gap
    for (let i = 0; i < sorted.length; i++) {
      const currentClip = sorted[i];
      const currentClipEnd = currentClip.startTime + currentClip.duration;
      
      // Check if we can place after this clip
      const nextClip = sorted[i + 1];
      if (nextClip) {
        // There's a gap between current clip and next clip
        const gapStart = currentClipEnd;
        const gapEnd = nextClip.startTime;
        
        // Check if our clip fits in this gap
        if (gapStart + clipDuration <= gapEnd) {
          // Place at the later of: gap start or desired start
          const placementStart = Math.max(gapStart, desiredStart);
          if (placementStart + clipDuration <= gapEnd) {
            return placementStart;
          }
        }
      } else {
        // This is the last clip, check if we can place after it
        const placementStart = Math.max(currentClipEnd, desiredStart);
        return placementStart;
      }
    }
    
    // If no gap found, place at the end of the last clip
    const lastClip = sorted[sorted.length - 1];
    const lastClipEnd = lastClip.startTime + lastClip.duration;
    return Math.max(lastClipEnd, desiredStart);
  };

  // Build snap candidates: existing clip boundaries and second-grid ticks
  const buildSnapCandidates = (
    clips: TimelineClip[],
    includeSecondGrid: boolean,
    excludeClipId?: string
  ): number[] => {
    const candidates: number[] = [];
    // Clip boundaries
    clips.forEach((c) => {
      if (excludeClipId && c.id === excludeClipId) return;
      candidates.push(c.startTime);
      candidates.push(c.startTime + c.duration);
    });
    // Second grid
    if (includeSecondGrid) {
      const maxSec = Math.ceil(duration);
      for (let s = 0; s <= maxSec; s++) candidates.push(s);
    }
    return candidates;
  };

  const snapToNearest = (time: number, candidates: number[]): number => {
    if (candidates.length === 0) return time;
    let nearest = candidates[0];
    let bestDist = Math.abs(time - nearest);
    for (let i = 1; i < candidates.length; i++) {
      const d = Math.abs(time - candidates[i]);
      if (d < bestDist) {
        bestDist = d;
        nearest = candidates[i];
      }
    }
    return nearest;
  };

  // Snap only if within a proximity threshold (in seconds)
  const snapWithThreshold = (time: number, candidates: number[], thresholdSec: number): number => {
    if (candidates.length === 0) return time;
    let nearest = time;
    let bestDist = thresholdSec + 1; // start above threshold
    for (let i = 0; i < candidates.length; i++) {
      const d = Math.abs(time - candidates[i]);
      if (d < bestDist) {
        bestDist = d;
        nearest = candidates[i];
      }
    }
    return bestDist <= thresholdSec ? nearest : time;
  };

  const handleDrop = (e: React.DragEvent, trackId: string, _time: number) => {
    e.preventDefault();
    
    console.log('Drop event triggered on track:', trackId);
    
    // Remove visual feedback
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
    
    const assetData = e.dataTransfer.getData('application/json');
    console.log('Asset data from drop:', assetData);
    
    if (assetData) {
      try {
        const data = JSON.parse(assetData);

        // Reorder / move existing timeline clip
        if ((data.type === 'timeline-clip' || data.type === 'timeline-clip-multiple' || data.type === 'timeline-clip-trim-left' || data.type === 'timeline-clip-trim-right') && (data.clipId || data.clipIds)) {
          console.log('Processing timeline clip drop:', data);
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const dropX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const dropTime = (dropX / rect.width) * duration;
          
          // Find if we're hovering over another clip
          const destTrack = tracks.find((t) => t.id === trackId);
          const hoveredClip = destTrack?.clips.find((c) => 
            c.id !== data.clipId && 
            dropTime >= c.startTime && 
            dropTime < c.startTime + c.duration
          );
          
          let newStart = Math.max(0, Math.min(duration - 0.1, dropTime));
          
          // CapCut-like snapping: magnet toggle OR Shift enables snap
          if (e.shiftKey || timelineSnapEnabled) {
            try {
              if (hoveredClip) {
                // If hovering over a clip and holding Shift, snap to its boundaries
                const clipStart = hoveredClip.startTime;
                const clipEnd = hoveredClip.startTime + hoveredClip.duration;
                const distanceToStart = Math.abs(dropTime - clipStart);
                const distanceToEnd = Math.abs(dropTime - clipEnd);
                
                // Snap to whichever boundary is closer
                if (distanceToStart < distanceToEnd) {
                  newStart = clipStart;
                } else {
                  newStart = clipEnd;
                }
              } else {
                // Snap to nearest clip boundary, seconds grid, or playhead
                if (destTrack) {
                  const candidates = buildSnapCandidates(destTrack.clips, true, data.clipId);
                  // include playhead as candidate
                  candidates.push(currentTime);
                  
                  // When magnet is enabled, prioritize snapping to the end of the previous clip
                  if (timelineSnapEnabled && !e.shiftKey) {
                    const sortedClips = destTrack.clips
                      .filter(c => c.id !== data.clipId)
                      .sort((a, b) => a.startTime - b.startTime);
                    
                    // Find the clip that ends just before the drop position
                    let previousClipEnd = 0;
                    for (const clip of sortedClips) {
                      const clipEnd = clip.startTime + clip.duration;
                      if (clipEnd <= dropTime && clipEnd > previousClipEnd) {
                        previousClipEnd = clipEnd;
                      }
                    }
                    
                    // If we found a previous clip end, prioritize snapping to it
                    if (previousClipEnd > 0) {
                      const distanceToPreviousEnd = Math.abs(dropTime - previousClipEnd);
                      const thresholdSec = 8 / Math.max(1, pixelsPerSecond);
                      if (distanceToPreviousEnd <= thresholdSec) {
                        newStart = previousClipEnd;
                      } else {
                        // Fall back to regular snap logic
                        const thresholdSec = 8 / Math.max(1, pixelsPerSecond);
                        newStart = snapWithThreshold(newStart, candidates, thresholdSec);
                      }
                    } else {
                      // No previous clip found, use regular snap logic
                      const thresholdSec = 8 / Math.max(1, pixelsPerSecond);
                      newStart = snapWithThreshold(newStart, candidates, thresholdSec);
                    }
                  } else {
                    // Regular snap logic for Shift key or when magnet is disabled
                    const thresholdSec = 8 / Math.max(1, pixelsPerSecond);
                    newStart = snapWithThreshold(newStart, candidates, thresholdSec);
                  }
                }
              }
            } catch {}
          }

          updateTracks((prev) => {
            let moving: any | null = null;
            // Remove from source track first
            let removed = prev.map((t) => {
              if (t.id !== data.sourceTrackId) return t;
              const idx = t.clips.findIndex((c) => c.id === data.clipId);
              if (idx === -1) return t;
              moving = t.clips[idx];
              const newClips = t.clips.filter((c) => c.id !== data.clipId);
              return { ...t, clips: newClips };
            });

            if (!moving) return prev; // nothing to move

            if (data.type === 'timeline-clip') {
              // Move single clip: try swap if dropped onto another clip in same track
              const destTrackClips = (removed.find((t) => t.id === trackId)?.clips ?? []) as TimelineClip[];

              const isSameTrackMove = data.sourceTrackId === trackId;
              let didSwap = false;

              if (isSameTrackMove) {
                const target = destTrackClips.find((c) => dropTime >= c.startTime && dropTime < c.startTime + c.duration);
                if (target) {
                  // Can we swap positions without overlaps?
                  const movingSafeAtTarget = clampStartToNeighbors(destTrackClips, target.startTime, moving.duration, moving.id);
                  const withoutTarget = destTrackClips.filter((c) => c.id !== target.id);
                  const targetSafeAtMoving = clampStartToNeighbors(withoutTarget, moving.startTime, target.duration, target.id);
                  if (movingSafeAtTarget === target.startTime && targetSafeAtMoving === moving.startTime) {
                    // Perform swap
                    const swappedClips = destTrackClips.map((c) => {
                      if (c.id === target.id) return { ...c, startTime: targetSafeAtMoving };
                      return c;
                    });
                    const movedClip = { ...moving, startTime: movingSafeAtTarget };
                    removed = removed.map((t) =>
                      t.id === trackId
                        ? { ...t, clips: [...swappedClips, movedClip].sort((a, b) => a.startTime - b.startTime) }
                        : t
                    );
                    didSwap = true;
                  }
                }
              }

              if (!didSwap) {
                // For cross-track moves, always place at the end of the destination track
                const isCrossTrackMove = data.sourceTrackId !== trackId;
                let safeStart;
                
                if (isCrossTrackMove) {
                  // Find the end of the last clip on the destination track
                  const sortedDestClips = destTrackClips.sort((a, b) => a.startTime - b.startTime);
                  if (sortedDestClips.length > 0) {
                    const lastClip = sortedDestClips[sortedDestClips.length - 1];
                    safeStart = lastClip.startTime + lastClip.duration;
                  } else {
                    // No clips on destination track, place at 0
                    safeStart = 0;
                  }
                } else {
                  // Same track move - use the existing gap-finding logic
                  safeStart = findFirstAvailableStart(destTrackClips, newStart, moving.duration);
                }
                
                const movedClip = { ...moving, startTime: safeStart };
                removed = removed.map((t) =>
                  t.id === trackId
                    ? { ...t, clips: [...t.clips, movedClip].sort((a, b) => a.startTime - b.startTime) }
                    : t
                );
              }
            } else if (data.type === 'timeline-clip-multiple') {
              console.log('Processing multiple clip move');
              // Move multiple clips as a block
              const destTrackClips = (removed.find((t) => t.id === trackId)?.clips ?? []) as TimelineClip[];
              const clipIds = data.clipIds;
              const anchorClipId = data.anchorClipId;
              
              // Find the anchor clip and calculate offset
              const anchorClip = removed.find(t => t.id === data.sourceTrackId)?.clips.find(c => c.id === anchorClipId);
              if (!anchorClip) {
                console.log('Anchor clip not found');
                return removed;
              }
              
              const timeOffset = newStart - anchorClip.startTime;
              console.log('Time offset:', timeOffset);
              
              // Move all selected clips by the same offset
              const movedClips = clipIds.map((clipId: string) => {
                const clip = removed.find(t => t.id === data.sourceTrackId)?.clips.find(c => c.id === clipId);
                if (!clip) return null;
                return { ...clip, startTime: Math.max(0, clip.startTime + timeOffset) };
              }).filter(Boolean) as TimelineClip[];
              
              console.log('Moved clips:', movedClips);
              
              // Remove clips from source track
              removed = removed.map((t) =>
                t.id === data.sourceTrackId
                  ? { ...t, clips: t.clips.filter(c => !clipIds.includes(c.id)) }
                  : t
              );
              
              // Add clips to destination track
              removed = removed.map((t) =>
                t.id === trackId
                  ? { ...t, clips: [...t.clips, ...movedClips].sort((a, b) => a.startTime - b.startTime) }
                  : t
              );
            } else if (data.type === 'timeline-clip-trim-left') {
              // Trim from left: adjust start and duration, ensure not negative, keep within neighbors
              const destTrackClips = (removed.find((t) => t.id === trackId)?.clips ?? []) as TimelineClip[];
              // newStart is the desired new beginning
              // CapCut-like snapping for trim-left (magnet OR Shift)
              let snappedStart = newStart;
              if (e.shiftKey || timelineSnapEnabled) {
                const candidates = buildSnapCandidates(destTrackClips, true, moving.id);
                candidates.push(currentTime);
                const thresholdSec = 8 / Math.max(1, pixelsPerSecond);
                snappedStart = snapWithThreshold(newStart, candidates, thresholdSec);
              }
              const safeStart = clampStartToNeighbors(destTrackClips, snappedStart, moving.duration, moving.id);
              const newDuration = Math.max(0.1, moving.duration - (safeStart - moving.startTime));
              // For effects, allow arbitrary duration; for videos, respect original asset duration if available
              let clampedDuration = newDuration;
              if ((moving as any).type !== 'effect') {
                const maxDuration = (moving as any).asset?.duration || newDuration;
                clampedDuration = Math.min(newDuration, maxDuration);
              }
              const trimmed = { ...moving, startTime: safeStart, duration: clampedDuration };
              removed = removed.map((t) =>
                t.id === trackId
                  ? { ...t, clips: [...t.clips, trimmed].sort((a, b) => a.startTime - b.startTime) }
                  : t
              );
            } else if (data.type === 'timeline-clip-trim-right') {
              // Trim from right: change only duration based on drop position
              const desiredEndRaw = Math.min(duration, Math.max(newStart, moving.startTime + 0.1));
              const destTrackClips = (removed.find((t) => t.id === trackId)?.clips ?? []) as TimelineClip[];
              let desiredEnd = desiredEndRaw;
              if (e.shiftKey || timelineSnapEnabled) {
                const snapCandidates = buildSnapCandidates(destTrackClips, true, moving.id);
                snapCandidates.push(currentTime);
                const thresholdSec = 8 / Math.max(1, pixelsPerSecond);
                desiredEnd = snapWithThreshold(desiredEndRaw, snapCandidates, thresholdSec);
              }
              const newDuration = Math.max(0.1, desiredEnd - moving.startTime);
              // Ensure not overlapping next neighbor
              const nextClip = destTrackClips
                .filter((c) => c.id !== moving.id && c.startTime >= moving.startTime)
                .sort((a, b) => a.startTime - b.startTime)[0];
              const maxEnd = nextClip ? nextClip.startTime : duration;
              const safeDuration = Math.min(newDuration, maxEnd - moving.startTime);
              // For effects, allow arbitrary duration; for videos, respect original asset duration if available
              let clampedDuration = safeDuration;
              if ((moving as any).type !== 'effect') {
                const maxDuration = (moving as any).asset?.duration || safeDuration;
                clampedDuration = Math.min(safeDuration, maxDuration);
              }
              const trimmed = { ...moving, duration: Math.max(0.1, clampedDuration) };
              removed = removed.map((t) =>
                t.id === trackId
                  ? { ...t, clips: [...t.clips, trimmed].sort((a, b) => a.startTime - b.startTime) }
                  : t
              );
            }
            return removed;
          });

          setDraggingClip(null);
          return;
        }

        const asset = data;
        console.log('Parsed asset:', asset);
        const track = tracks.find(t => t.id === trackId);
        
        if (track) {
          // Handle effects from EffectsBrowser (they have isEffect: true)
          if (asset.isEffect) {
            asset.type = 'effect';
          }
          
          // Enforce per-track type acceptance
          if (!isAssetAllowedOnTrack(track.type, asset.type)) {
            console.warn(`This track (${track.type}) does not accept asset type: ${asset.type}`);
            return; // Reject the drop
          }
          
          // Determine clip type based on asset type
          let clipType: 'video' | 'effect' | 'audio' = 'video';
          if (asset.type === 'effect') {
            clipType = 'effect';
          } else if (asset.type === 'video') {
            clipType = 'video';
          } else if (asset.type === 'audio') {
            clipType = 'audio';
          }
          
          // Calculate placement based on drop position
          const rect2 = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const dropX2 = Math.max(0, Math.min(rect2.width, e.clientX - rect2.left));
          const desiredStart = (dropX2 / rect2.width) * duration;
          
          // Check if we're dropping over an existing clip
          const existingClip = track.clips.find(clip => {
            const clipStart = clip.startTime;
            const clipEnd = clip.startTime + clip.duration;
            return desiredStart >= clipStart && desiredStart < clipEnd;
          });
          
          // Store only minimal asset metadata in timeline to avoid large localStorage writes
          const assetRef = {
            id: asset.id,
            name: asset.name,
            type: asset.type,
            path: asset.path,
            filePath: asset.filePath,
            duration: asset.duration,
          };

          // For effects, allow arbitrary timeline length; for videos, use asset duration if known
          const desiredDuration = asset.type === 'effect' ? (asset.duration || 5) : (asset.duration || 5);
          
          // Never replace existing clips on drop; always place without overlap
          // Determine a safe, non-overlapping start position
          let safeStartForNew;
          if (timelineSnapEnabled && !e.shiftKey) {
            // Magnet on: place directly after the last clip on this track
            const sortedClips = track.clips.sort((a, b) => a.startTime - b.startTime);
            if (sortedClips.length > 0) {
              const lastClip = sortedClips[sortedClips.length - 1];
              const lastClipEnd = lastClip.startTime + lastClip.duration;
              safeStartForNew = lastClipEnd;
            } else {
              safeStartForNew = 0;
            }
          } else {
            // Find first available gap at or after desiredStart
            safeStartForNew = findFirstAvailableStart(track.clips, Math.max(0, desiredStart), desiredDuration);
          }

          const newClip: TimelineClip = {
            id: `clip-${Date.now()}`,
            startTime: safeStartForNew,
            duration: desiredDuration,
            asset: assetRef,
            type: clipType,
            name: asset.name || 'Untitled Clip'
          };

          const updatedTracks = tracks.map(t => 
            t.id === trackId 
              ? { ...t, clips: [...t.clips, newClip] }
              : t
          );

          updateTracks(updatedTracks);
          console.log('Successfully added clip to timeline:', newClip);

          // If audio, fetch actual duration and update the clip (for both replacement and new clips)
          if (clipType === 'audio') {
            try {
              const tempAudio = new Audio(getAudioSrc(assetRef));
              tempAudio.addEventListener('loadedmetadata', () => {
                const realDuration = isFinite(tempAudio.duration) && tempAudio.duration > 0 ? tempAudio.duration : desiredDuration;
                updateTracks(prev => prev.map(tr => {
                  if (tr.id !== trackId) return tr;
                  return {
                    ...tr,
                    clips: tr.clips.map(c => {
                      // Update the most recently added clip of this type
                      if (c.type === 'audio' && c.asset.id === assetRef.id) {
                        return { ...c, duration: realDuration };
                      }
                      return c;
                    })
                  };
                }));
              });
              // Trigger load
              tempAudio.load();
            } catch {}
          }
        }
      } catch (error) {
        console.error('Error adding clip to timeline:', error);
      }
    } else {
      console.warn('No asset data found in drop event');
    }
  };

  // Clip drag start/end for reordering/moving
  const handleClipDragStart = (e: React.DragEvent, clip: TimelineClip, sourceTrackId: string) => {
    e.stopPropagation();
    
    // If this clip is part of a selection, drag the entire selection
    if (selectedClips.has(clip.id) && selectedClips.size > 1) {
      const selectedClipIds = Array.from(selectedClips);
      setDraggingClip({ clipId: 'multiple', sourceTrackId });
      e.dataTransfer.setData('application/json', JSON.stringify({ 
        type: 'timeline-clip-multiple', 
        clipIds: selectedClipIds, 
        sourceTrackId,
        anchorClipId: clip.id // Use this clip as the anchor point
      }));
      e.dataTransfer.effectAllowed = 'move';
    } else {
      // Single clip drag
      setDraggingClip({ clipId: clip.id, sourceTrackId });
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'timeline-clip', clipId: clip.id, sourceTrackId }));
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleClipDragEnd = () => {
    setDraggingClip(null);
  };

  // Handle clip selection for MoveableTimelineClip
  const handleClipSelect = useCallback((clipId: string, multiSelect?: boolean) => {
    if (multiSelect) {
      setSelectedClips(prev => {
        const newSet = new Set(prev);
        if (newSet.has(clipId)) {
          newSet.delete(clipId);
        } else {
          newSet.add(clipId);
        }
        return newSet;
      });
    } else {
      setSelectedClips(new Set([clipId]));
      try {
        const state = (useStore as any).getState();
        const { timelineScenes, currentTimelineSceneId, setSelectedTimelineClip } = state;
        const scene = timelineScenes?.find((s: any) => s.id === currentTimelineSceneId);
        const columns: any[] = scene?.columns || [];
        const allLayers: any[] = columns.flatMap((c: any) => c.layers || []);
        const track = tracks.find(t => t.clips.some(c => c.id === clipId));
        const clip = track?.clips.find(c => c.id === clipId);
        if (track && clip && typeof setSelectedTimelineClip === 'function') {
          const trackNum = parseInt((track.id || 'track-1').split('-')[1] || '1', 10);
          // Decoupled: never resolve or set layerId here.
          setSelectedTimelineClip({ id: clip.id, trackId: track.id, startTime: clip.startTime, duration: clip.duration, data: clip, layerId: null, trackNum });
        }
      } catch {}
    }
  }, [tracks]);

  // Handle clip update for MoveableTimelineClip
  const handleClipUpdate = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
    updateTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => 
        clip.id === clipId ? { ...clip, ...updates } : clip
      )
    })));
  }, [updateTracks]);

  // Handle clip delete for MoveableTimelineClip
  const handleClipDelete = useCallback((clipId: string) => {
    updateTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.filter(clip => clip.id !== clipId)
    })));
    setSelectedClips(prev => {
      const newSet = new Set(prev);
      newSet.delete(clipId);
      return newSet;
    });
  }, [updateTracks]);

  // Handle moving clip to different track
  const handleClipMoveToTrack = useCallback((clipId: string, fromTrackId: string, toTrackId: string) => {
    console.log('Moving clip:', clipId, 'from track:', fromTrackId, 'to track:', toTrackId);
    
    updateTracks(prev => {
      let movingClip: TimelineClip | null = null;
      
      // Remove clip from source track
      const updatedTracks = prev.map(track => {
        if (track.id === fromTrackId) {
          const clipIndex = track.clips.findIndex(clip => clip.id === clipId);
          if (clipIndex !== -1) {
            movingClip = track.clips[clipIndex];
            return {
              ...track,
              clips: track.clips.filter(clip => clip.id !== clipId)
            };
          }
        }
        return track;
      });
      
      // Add clip to destination track
      if (movingClip) {
        return updatedTracks.map(track => {
          if (track.id === toTrackId) {
            return {
              ...track,
              clips: [...track.clips, movingClip!].sort((a, b) => a.startTime - b.startTime)
            };
          }
          return track;
        });
      }
      
      return updatedTracks;
    });
  }, [updateTracks]);

  // Sync clip params when Layer Options updates selectedTimelineClip in the store (timeline-only clips)
  useEffect(() => {
    try {
      const sel = selectedTimelineClip;
      if (!sel || !sel.id || !sel.data || !sel.data.params) return;
      const clipId = sel.id as string;
      const newParams = sel.data.params;
      updateTracks((prev) => prev.map(tr => ({
        ...tr,
        clips: tr.clips.map(c => (c.id === clipId ? { ...c, params: { ...(c.params || {}), ...newParams } } : c))
      })));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTimelineClip?.id, selectedTimelineClip?.data?.params]);

  // Handle click on track to place clip at specific time
  const handleTrackClick = (e: React.MouseEvent, trackId: string) => {
    if (draggedAsset) {
      const track = tracks.find(t => t.id === trackId);
      if (track) {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        let clickTime = (clickX / rect.width) * duration;
        // Snap to boundaries/seconds/playhead when magnet is enabled or Shift is held
        if ((e as any).shiftKey || timelineSnapEnabled) {
          const candidates = buildSnapCandidates(track.clips, true);
          candidates.push(currentTime);
          const thresholdSec = 8 / Math.max(1, pixelsPerSecond);
          
          // When magnet is enabled, prioritize snapping to the end of the previous clip
          if (timelineSnapEnabled && !(e as any).shiftKey) {
            const sortedClips = track.clips.sort((a, b) => a.startTime - b.startTime);
            
            // Find the clip that ends just before the click position
            let previousClipEnd = 0;
            for (const clip of sortedClips) {
              const clipEnd = clip.startTime + clip.duration;
              if (clipEnd <= clickTime && clipEnd > previousClipEnd) {
                previousClipEnd = clipEnd;
              }
            }
            
            // If we found a previous clip end, prioritize snapping to it
            if (previousClipEnd > 0) {
              const distanceToPreviousEnd = Math.abs(clickTime - previousClipEnd);
              if (distanceToPreviousEnd <= thresholdSec) {
                clickTime = previousClipEnd;
              } else {
                // Fall back to regular snap logic
                clickTime = snapWithThreshold(clickTime, candidates, thresholdSec);
              }
            } else {
              // No previous clip found, use regular snap logic
              clickTime = snapWithThreshold(clickTime, candidates, thresholdSec);
            }
          } else {
            // Regular snap logic for Shift key or when magnet is disabled
            clickTime = snapWithThreshold(clickTime, candidates, thresholdSec);
          }
        }
        const desiredDuration = draggedAsset.duration || 5;
        const newStartTime = findFirstAvailableStart(track.clips, Math.max(0, clickTime), desiredDuration);
        
        // Handle effects from EffectsBrowser (they have isEffect: true)
        if (draggedAsset.isEffect) {
          draggedAsset.type = 'effect';
        }
        
        // Enforce per-track type acceptance
        if (!isAssetAllowedOnTrack(track.type, draggedAsset.type)) {
          console.warn(`This track (${track.type}) does not accept asset type: ${draggedAsset.type}`);
          return;
        }

        // Determine clip type based on asset type
        let clipType: 'video' | 'effect' | 'audio' = 'video';
        if (draggedAsset.type === 'effect') {
          clipType = 'effect';
        } else if (draggedAsset.type === 'video') {
          clipType = 'video';
        } else if (draggedAsset.type === 'audio') {
          clipType = 'audio';
        }
        
        const assetRef = {
          id: draggedAsset.id,
          name: draggedAsset.name,
          type: draggedAsset.type,
          path: draggedAsset.path,
          filePath: draggedAsset.filePath,
          duration: draggedAsset.duration,
        };

        // Place clip at computed start time for all types
        const finalStartTime = newStartTime;
        
        const newClip: TimelineClip = {
          id: `clip-${Date.now()}`,
          startTime: finalStartTime,
          duration: draggedAsset.duration || 5,
          asset: assetRef,
          type: clipType,
          name: draggedAsset.name || 'Untitled Clip'
        };

        const updatedTracks = tracks.map(t => 
          t.id === trackId 
            ? { ...t, clips: [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime) }
            : t
        );
        
        updateTracks(updatedTracks);
        setDraggedAsset(null);

        // If audio, fetch actual duration and update the clip
        if (clipType === 'audio') {
          try {
            const src = getAudioSrc(assetRef);
            try { console.log('[Timeline][audio] probe duration src=', src); } catch {}
            const tempAudio = new Audio(src);
            tempAudio.addEventListener('loadedmetadata', () => {
              const realDuration = isFinite(tempAudio.duration) && tempAudio.duration > 0 ? tempAudio.duration : newClip.duration;
              try { console.log('[Timeline][audio] duration loaded =', realDuration); } catch {}
              updateTracks(prev => prev.map(tr => {
                if (tr.id !== trackId) return tr;
                return {
                  ...tr,
                  clips: tr.clips.map(c => c.id === newClip.id ? { ...c, duration: realDuration } : c)
                };
              }));
            });
            tempAudio.load();
          } catch {}
        }
      }
    }
  };







  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Previous per-type colors no longer used for clips (now solid grey)

  // Get clips that should be playing at the current time
  const getClipsAtTime = (time: number) => {
    const activeClips: any[] = [];
    
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        const clipEndTime = clip.startTime + clip.duration;
        if (time >= clip.startTime && time < clipEndTime) {
          activeClips.push({
            ...clip,
            trackType: track.type,
            trackId: track.id,
            relativeTime: time - clip.startTime
          });
        }
      });
    });
    
    return activeClips;
  };

  // (preview component removed)

  // Start timeline playback (requestAnimationFrame-driven)
  const startTimelinePlayback = () => {
    // Pause all audio elements before starting (do not reset time to preserve resume position)
    try {
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
      });
      lastActiveAudioIdsRef.current.clear();
    } catch {}
    console.log('Starting timeline playback, current time:', currentTime, 'duration:', duration);
    console.log('🎵 Timeline tracks:', tracks);
    console.log('🎵 Earliest clip time:', getEarliestClipTime());
    
    // Clear any existing interval/RAF first
    if (playbackInterval) {
      console.log('Clearing existing interval');
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    // Resume from current playhead time without forcing a reset
    
    // Mark timeline as playing before starting the loop so first frame proceeds
    setIsPlaying(true);
    isPlayingRef.current = true;
    try { (window as any).__vj_timeline_is_playing__ = true; } catch {}
    // Notify transport UI (TimelineControls) that playback started
    try { document.dispatchEvent(new Event('globalPlay')); } catch {}

    // RAF accumulator
    lastTsRef.current = null;
    const loop = (ts: number) => {
      if (!isPlayingRef.current) return; // safety guard
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - (lastTsRef.current || ts)) / 1000; // seconds
      lastTsRef.current = ts;
      setCurrentTime(prevTime => {
        const newTime = prevTime + dt;
        const effectiveDuration = durationRef.current || duration;
        if (newTime >= effectiveDuration) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          try {
            (window as any).__vj_timeline_is_playing__ = false;
            (window as any).__vj_timeline_active_layers__ = [];
          } catch {}
          
          // Execute scene end action
          handleSceneEnd();
          
          const resetTime = getEarliestClipTime() > 0 ? getEarliestClipTime() : 0;
          setCurrentTime(resetTime);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          return resetTime;
        }
        try {
          const evt = new CustomEvent('timelineTick', { detail: { time: newTime, duration } });
          document.dispatchEvent(evt);
        } catch {}
        return newTime;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    try { document.dispatchEvent(new Event('timelinePlay')); } catch {}
    try {
      // Immediately request an audio tick so active clips begin playing without waiting for next effect
      const activeAudioClips = getClipsAtTime(0).filter((c: any) => c.type === 'audio');
      activeAudioClips.forEach((clip: any) => {
        const audio = audioElementsRef.current.get(clip.id);
        if (audio) {
          try { audio.currentTime = Math.max(0, clip.relativeTime || 0); } catch {}
          audio.play().catch(() => {});
        }
      });
    } catch {}
    console.log('Timeline playback started, isPlaying set to true');
  };

  // Stop timeline playback
  const stopTimelinePlayback = () => {
    console.log('Stopping timeline playback');
    pendingPlaybackRef.current = false;
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    isPlayingRef.current = false;
    try {
      (window as any).__vj_timeline_is_playing__ = false;
      (window as any).__vj_timeline_active_layers__ = [];
    } catch {}
    // Notify transport UI (TimelineControls) that playback stopped/paused
    try { document.dispatchEvent(new Event('globalPause')); } catch {}
    // Pause all audio elements when stopping
    try {
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
      });
      lastActiveAudioIdsRef.current.clear();
    } catch {}
    setIsPlaying(false);
    try { document.dispatchEvent(new Event('timelineStop')); } catch {}
    // Ensure all playing media stops when timeline stops
    try {
      document.dispatchEvent(new CustomEvent('globalStop', { detail: { type: 'globalStop', source: 'timeline' } }));
    } catch {}
    try {
      document.dispatchEvent(new CustomEvent('videoStop', { detail: { type: 'videoStop', allColumns: true, source: 'timeline' } }));
    } catch {}
    console.log('Timeline playback stopped, isPlaying set to false');
  };

  // Handle play button click
  const handlePlayButtonClick = async () => {
    console.log('Play button clicked, current isPlaying:', isPlaying);
    
    // Force a small delay to ensure state is properly updated
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const preloadIncomplete = preloadingMedia || (preloadInfo.total > 0 && preloadInfo.loaded < preloadInfo.total);

    if (!isPlaying && preloadIncomplete) {
      pendingPlaybackRef.current = true;
      setShowPreloadIndicator(true);
      return;
    }

    if (isPlaying) {
      console.log('Stopping timeline playback');
      stopTimelinePlayback();
      
      // Don't automatically pause WaveSurfer - let our timeline control it
      console.log('Timeline playback stopped - WaveSurfer will be synced to timeline');
    } else {
      console.log('Starting timeline playback');
      startTimelinePlayback();
      
      // Don't automatically start WaveSurfer playback - let our timeline control it
      // WaveSurfer will be synced to our timeline position instead
      console.log('Timeline playback started - WaveSurfer will be synced to timeline');
    }
  };

  // Context menu functions
  const handleClipRightClick = (e: React.MouseEvent, clipId: string, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If this clip isn't in the current selection, select only this one
    if (!selectedClips.has(clipId)) {
      setSelectedClips(new Set([clipId]));
    }
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      clipId,
      trackId,
    });
  };

  const handleContextMenuClose = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      clipId: null,
      trackId: null,
    });
  };

  // Track context menu handlers
  const handleTrackRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setTrackContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleIndividualTrackRightClick = (e: React.MouseEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const visualTracks = tracks.filter(t => t.type !== 'audio');
    const audioTracks = tracks.filter(t => t.type === 'audio');
    const track = tracks.find(t => t.id === trackId);
    
    // Check if track can be removed
    let canRemove = false;
    if (track) {
      if (track.type === 'audio' && audioTracks.length > 1) {
        canRemove = true;
      } else if (track.type !== 'audio' && visualTracks.length > 3) {
        canRemove = true;
      }
    }
    
    setTrackContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      trackId: canRemove ? trackId : undefined,
    });
  };

  const handleTrackContextMenuClose = () => {
    setTrackContextMenu({
      visible: false,
      x: 0,
      y: 0,
    });
  };

  const handleAddTrack = () => {
    const newTrackId = `track-${Date.now()}`;
    const newTrack: TimelineTrack = {
      id: newTrackId,
      name: `Track ${tracks.filter(t => t.type !== 'audio').length + 1}`,
      type: 'video', // Default to video type for visual tracks
      clips: []
    };
    
    updateTracks(prevTracks => [...prevTracks, newTrack]);
    console.log('Added new track:', newTrackId);
  };

  const handleAddAudioTrack = () => {
    const newTrackId = `track-${Date.now()}`;
    const newTrack: TimelineTrack = {
      id: newTrackId,
      name: `Audio Track ${tracks.filter(t => t.type === 'audio').length + 1}`,
      type: 'audio',
      clips: []
    };
    
    updateTracks(prevTracks => [...prevTracks, newTrack]);
    console.log('Added new audio track:', newTrackId);
  };

  const handleRemoveTrack = (trackId: string) => {
    const trackToRemove = tracks.find(t => t.id === trackId);
    if (!trackToRemove) return;

    // Check minimum track requirements
    const visualTracks = tracks.filter(t => t.type !== 'audio');
    const audioTracks = tracks.filter(t => t.type === 'audio');

    if (trackToRemove.type === 'audio' && audioTracks.length <= 1) {
      console.log('Cannot remove last audio track');
      return;
    }

    if (trackToRemove.type !== 'audio' && visualTracks.length <= 3) {
      console.log('Cannot remove track - minimum 3 visual tracks required');
      return;
    }

    updateTracks(prevTracks => prevTracks.filter(t => t.id !== trackId));
    console.log('Removed track:', trackId);
  };

  const handleDeleteClip = () => {
    if (contextMenu.trackId) {
      updateTracks(prevTracks => 
        prevTracks.map(track => {
          if (track.id === contextMenu.trackId) {
            // Delete all selected clips on this track
            const clipsToDelete = selectedClips.size > 0 ? selectedClips : new Set([contextMenu.clipId]);
            return {
              ...track,
              clips: track.clips.filter(clip => !clipsToDelete.has(clip.id))
            };
          }
          return track;
        })
      );
      
      // Clear selection after deleting
      setSelectedClips(new Set());
      
      const deletedCount = selectedClips.size > 0 ? selectedClips.size : 1;
      console.log(`Deleted ${deletedCount} clip(s) from track ${contextMenu.trackId}`);
    }
  };

  const handleDuplicateClip = () => {
    if (contextMenu.trackId && contextMenu.clipId) {
      updateTracks(prevTracks => 
        prevTracks.map(track => {
          if (track.id === contextMenu.trackId) {
            // Find the original clip
            const originalClip = track.clips.find(clip => clip.id === contextMenu.clipId);
            if (originalClip) {
              // Create a duplicate with new ID and snapped position immediately after original
              const duplicatedClip: TimelineClip = {
                ...originalClip,
                id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                startTime: Math.max(0, (originalClip.startTime || 0) + (originalClip.duration || 0)),
              };
              
              // Snap to end of original or next available gap if overlapping
              const snappedStart = clampStartToNeighbors(track.clips, duplicatedClip.startTime, duplicatedClip.duration, duplicatedClip.id);
              duplicatedClip.startTime = snappedStart;

              // Insert the duplicate after the original clip
              const originalIndex = track.clips.findIndex(clip => clip.id === contextMenu.clipId);
              const newClips = [...track.clips];
              newClips.splice(originalIndex + 1, 0, duplicatedClip);
              
              return {
                ...track,
                clips: newClips
              };
            }
          }
          return track;
        })
      );
      
      console.log(`Duplicated clip ${contextMenu.clipId} on track ${contextMenu.trackId}`);
    }
  };

  // Play-state observer: avoid forcing false while RAF-driven playback is active
  useEffect(() => {
    if (isPlaying && rafRef.current == null) {
      try { console.log('isPlaying=true but no RAF handle; leaving state as-is'); } catch {}
    }
  }, [isPlaying]);

  // Debug currentTime changes
  useEffect(() => {
    console.log('🕒 currentTime changed to:', currentTime);
  }, [currentTime]);

  // Listen for force audio registration event (for recording)
  useEffect(() => {
    const handleForceRegistration = () => {
      try {
        console.log('[Timeline] Force audio registration requested');
        // Ensure audio context manager is initialized
        audioContextManager.initialize().then(() => {
          // Register any existing audio elements that might not be registered yet
          audioElementsRef.current.forEach((audio) => {
            audioContextManager.registerAudioElement(audio);
          });
        }).catch(console.warn);
      } catch (err) {
        console.warn('[Timeline] Force registration error:', err);
      }
    };
    
    document.addEventListener('forceTimelineAudioRegistration', handleForceRegistration);
    return () => {
      document.removeEventListener('forceTimelineAudioRegistration', handleForceRegistration);
    };
  }, []);

  // Update preview content for timeline
  useEffect(() => {
    if (onPreviewUpdate) {
      const activeClips = getClipsAtTime(currentTime);
      console.log('Timeline preview update - Time:', currentTime, 'Playing:', isPlaying, 'Active clips:', activeClips.length);
      // Expose timeline playing state and active layers for LFO engine
      try {
        (window as any).__vj_timeline_is_playing__ = isPlaying === true;
        if (isPlaying) {
          const layers = activeClips.map((clip: any) => ({
            id: `timeline-layer-${clip.id}`,
            type: clip.type,
            name: clip.name,
            opacity: (clip.params && clip.params.opacity && typeof clip.params.opacity.value === 'number') ? clip.params.opacity.value : undefined,
            params: clip.params || {},
            asset: clip.asset || {},
            clipId: clip.id,
          }));
          ;(window as any).__vj_timeline_active_layers__ = layers;
        } else {
          ;(window as any).__vj_timeline_active_layers__ = [];
        }
      } catch {}
      
      // AUDIO SYNC: ensure audio clips play/pause in sync with timeline
      try {
        const activeAudioClips = activeClips.filter((c: any) => c.type === 'audio');
        const nextActiveIds = new Set<string>(activeAudioClips.map((c: any) => c.id));

        // Pause any audio that is no longer active
        lastActiveAudioIdsRef.current.forEach((clipId) => {
          if (!nextActiveIds.has(clipId)) {
            const audio = audioElementsRef.current.get(clipId);
            if (audio) {
              audio.pause();
              // Unregister from app audio capture system
              audioContextManager.unregisterAudioElement(audio);
            }
          }
        });

        // For each active audio clip, play and seek to relative time
        activeAudioClips.forEach((clip: any) => {
          let audio = audioElementsRef.current.get(clip.id);
          if (!audio) {
            const src = getAudioSrc(clip.asset);
            try { console.log('[Timeline][audio] create element for clip', clip.id, 'src=', src); } catch {}
            audio = new Audio(src);
            audio.preload = 'auto';
            // Keep volume as-is; could later be controllable via clip params
            audioElementsRef.current.set(clip.id, audio);
            
            // Register with app audio capture system
            audioContextManager.initialize().then(() => {
              if (audio) audioContextManager.registerAudioElement(audio);
            }).catch(console.warn);
          }
          if (isPlaying) {
            const desiredTime = Math.max(0, clip.relativeTime);
            try { console.log('[Timeline][audio] play check clip', clip.id, 'desiredTime=', desiredTime, 'current=', audio.currentTime, 'paused=', audio.paused); } catch {}
            // Seek if drift is noticeable (>100ms)
            if (Math.abs((audio.currentTime || 0) - desiredTime) > 0.1) {
              try { audio.currentTime = desiredTime; } catch {}
            }
            if (audio.paused) {
              // Best-effort play; Electron should allow without gesture issues
              audio.play().then(() => { try { console.log('[Timeline][audio] playing', clip.id); } catch {} }).catch((e) => { try { console.warn('[Timeline][audio] play failed', e); } catch {} });
            }
          } else {
            try { console.log('[Timeline][audio] pause clip', clip.id); } catch {}
            audio.pause();
          }
        });

        // Update last active set
        lastActiveAudioIdsRef.current = nextActiveIds;
      } catch (err) {
        console.warn('Audio sync error:', err);
      }

       // Only send timeline preview when in timeline mode
       // Check if we're in timeline mode by looking at the store
       const store = useStore.getState() as any;
       if (store.showTimeline) {
         const timelinePreviewContent = {
           type: 'timeline',
           tracks: tracks,
           currentTime: currentTime,
           duration: duration,
           // Use ref to avoid lag between RAF loop starting and state update
           isPlaying: Boolean(isPlayingRef.current),
           activeClips: activeClips
         };
         console.log('Sending timeline preview content:', timelinePreviewContent);
         onPreviewUpdate(timelinePreviewContent);
       }
    }
  }, [currentTime, isPlaying, tracks, duration, onPreviewUpdate]);

  // Listen to timeline mode changes and clear preview when switching away
  useEffect(() => {
    if (onPreviewUpdate && !showTimeline) {
      // Clear timeline preview content when switching away from timeline mode
      onPreviewUpdate(null);
    }
  }, [showTimeline, onPreviewUpdate]);

  // Debug currentTime changes
  useEffect(() => {
    console.log('currentTime changed to:', currentTime);
  }, [currentTime]);

  // Debug isPlaying changes
  useEffect(() => {
    console.log('isPlaying changed to:', isPlaying);
  }, [isPlaying]);

  // Cleanup interval/RAF on unmount
  useEffect(() => {
    return () => {
      if (playbackInterval) {
        clearInterval(playbackInterval);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playbackInterval]);

  // Cleanup audio elements on unmount
  useEffect(() => {
    return () => {
      try {
        audioElementsRef.current.forEach((audio) => {
          audio.pause();
          // Unregister from app audio capture system
          audioContextManager.unregisterAudioElement(audio);
        });
        audioElementsRef.current.clear();
        lastActiveAudioIdsRef.current.clear();
      } catch {}
    };
  }, []);

  // Playhead drag handlers
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    // Pause playback when starting to drag playhead
    if (isPlaying) {
      stopTimelinePlayback();
    }
  };

  // Playhead right-click handler for split context menu
  const handlePlayheadRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Find which track row was clicked
    let targetTrackId: string | null = null;
    const rect = timelineRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseY = e.clientY - rect.top;
      const trackElements = timelineRef.current?.querySelectorAll('[data-track-id]');
      
      for (const trackElement of trackElements || []) {
        const trackRect = trackElement.getBoundingClientRect();
        const trackTop = trackRect.top - rect.top;
        const trackBottom = trackRect.bottom - rect.top;
        
        if (mouseY >= trackTop && mouseY <= trackBottom) {
          targetTrackId = (trackElement as HTMLElement).dataset.trackId || null;
          break;
        }
      }
    }
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      clipId: null, // Special marker for playhead context menu
      trackId: targetTrackId, // Store the target track ID
    });
  };

  // Split clips at current playhead position in specific track
  const splitClipsAtPlayhead = useCallback(() => {
    const splitTime = currentTime;
    const targetTrackId = contextMenu.trackId;
    
    if (!targetTrackId) {
      console.log('No target track identified for splitting');
      return;
    }

    let hasSplit = false;

    const updatedTracks = tracks.map(track => {
      // Only process the target track
      if (track.id !== targetTrackId) {
        return track;
      }

      const clipsToSplit = track.clips.filter(clip => {
        const clipStart = clip.startTime || 0;
        const clipEnd = clipStart + (clip.duration || 0);
        return splitTime > clipStart && splitTime < clipEnd;
      });

      if (clipsToSplit.length === 0) {
        return track;
      }

      hasSplit = true;
      const newClips = [];

      for (const clip of track.clips) {
        const clipStart = clip.startTime || 0;
        const clipEnd = clipStart + (clip.duration || 0);

        if (splitTime > clipStart && splitTime < clipEnd) {
          // Split this clip
          const firstPart = {
            ...clip,
            id: `${clip.id}-part1`,
            duration: splitTime - clipStart,
          };
          
          const secondPart = {
            ...clip,
            id: `${clip.id}-part2`,
            startTime: splitTime,
            duration: clipEnd - splitTime,
          };

          newClips.push(firstPart, secondPart);
        } else {
          newClips.push(clip);
        }
      }

      return {
        ...track,
        clips: newClips.sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
      };
    });

    if (hasSplit) {
      updateTracks(updatedTracks);
      console.log(`Split clips in track ${targetTrackId} at time ${splitTime.toFixed(2)}s`);
    } else {
      console.log(`No clips found to split in track ${targetTrackId} at current playhead position`);
    }
  }, [currentTime, tracks, updateTracks, contextMenu.trackId]);

  const handlePlayheadMouseMove = (e: React.MouseEvent) => {
    if (isDraggingPlayhead) {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (rect) {
        const clickX = e.clientX - rect.left;
        const newTime = Math.max(0, Math.min(duration, (clickX + scrollLeft) / pixelsPerSecond));
        setCurrentTime(newTime);
      }
    }
  };

  const handlePlayheadMouseUp = () => {
    setIsDraggingPlayhead(false);
  };

  // Click-to-seek on the top time ruler
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    const viewport = timelineRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const clickX = e.clientX - viewport.left;
    const newTime = Math.max(0, Math.min(duration, (clickX + scrollLeft) / Math.max(1, pixelsPerSecond)));
    setCurrentTime(newTime);
  };

  // Global mouse event listeners for playhead dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingPlayhead) {
        const rect = timelineRef.current?.getBoundingClientRect();
        if (rect) {
          const clickX = e.clientX - rect.left;
          const newTime = Math.max(0, Math.min(duration, (clickX + scrollLeft) / pixelsPerSecond));
          setCurrentTime(newTime);
        }
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    if (isDraggingPlayhead) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingPlayhead, duration, scrollLeft, pixelsPerSecond]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle spacebar if not typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scroll
        handlePlayButtonClick();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying]); // Re-add listener when isPlaying changes

  // External command bridge from header-docked TimelineControls
  useEffect(() => {
    const onCommand = (e: Event) => {
      try {
        const { type, value } = (e as CustomEvent).detail || {};
        switch (type) {
          case 'goToStart':
            setCurrentTime(0);
            break;
          case 'goToEnd':
            setCurrentTime(duration);
            break;
          case 'stepBackward':
            setCurrentTime((t) => Math.max(0, t - (typeof value === 'number' ? value : 1)));
            break;
          case 'stepForward':
            setCurrentTime((t) => Math.min(duration, t + (typeof value === 'number' ? value : 1)));
            break;
          case 'playPause':
            handlePlayButtonClick();
            break;
          case 'stop': {
            if (isPlayingRef.current) {
              // First stop: stop playback, keep current position
              stopTimelinePlayback();
            } else {
              // Second stop while already stopped: return to start (or earliest clip)
              const resetTime = getEarliestClipTime() > 0 ? getEarliestClipTime() : 0;
              setCurrentTime(resetTime);
              try {
                document.dispatchEvent(new CustomEvent('timelineTick', { detail: { time: resetTime, duration } }));
              } catch {}
              try {
                document.dispatchEvent(new CustomEvent('videoStop', {
                  detail: { type: 'videoStop', allColumns: true, source: 'timeline-reset' }
                }));
              } catch {}
            }
            break;
          }
          case 'seekToTime':
            if (typeof value === 'number') {
              if (isPlaying) {
                stopTimelinePlayback();
              }
              setCurrentTime(Math.max(0, Math.min(duration, value)));
            }
            break;
          case 'goToFirstClip': {
            const earliest = getEarliestClipTime();
            if (earliest > 0) setCurrentTime(earliest);
            break;
          }
          case 'clearTimeline': {
            if (window.confirm('Clear all timeline clips for the current scene?')) {
              clearTimelineData();
              updateTracks([
                { id: 'track-1', name: 'Track 1', type: 'video', clips: [] },
                { id: 'track-2', name: 'Track 2', type: 'video', clips: [] },
                { id: 'track-3', name: 'Track 3', type: 'effect', clips: [] },
                { id: 'track-4', name: 'Audio', type: 'audio', clips: [] }
              ]);
              setCurrentTime(0);
              setSelectedClips(new Set());
            }
            break;
          }
          default:
            break;
        }
      } catch {}
    };
    document.addEventListener('timelineCommand', onCommand as any);
    return () => document.removeEventListener('timelineCommand', onCommand as any);
  }, [duration, isPlaying]);

  // Support double-click Stop from global toolbar: first click stops, second click (within window) jumps to start
  useEffect(() => {
    const lastStopAtRef = { current: 0 } as { current: number };
    const onGlobalStop = (event: Event) => {
      try {
        const detail = ((event as CustomEvent).detail || {}) as Record<string, any>;
        if (detail?.source === 'timeline') {
          return;
        }
        const now = performance.now();
        // If currently playing, treat as first click (stop only)
        if (isPlayingRef.current) {
          stopTimelinePlayback();
          lastStopAtRef.current = now;
          return;
        }
        // Already stopped: if within 500ms, jump to start/earliest clip
        if (now - (lastStopAtRef.current || 0) <= 500) {
          const resetTime = getEarliestClipTime() > 0 ? getEarliestClipTime() : 0;
          setCurrentTime(resetTime);
          try { document.dispatchEvent(new CustomEvent('timelineTick', { detail: { time: resetTime, duration } })); } catch {}
          try {
            document.dispatchEvent(new CustomEvent('videoStop', {
              detail: { type: 'videoStop', allColumns: true, source: 'timeline-reset' }
            }));
          } catch {}
        }
        lastStopAtRef.current = now;
      } catch {}
    };
    try { document.addEventListener('globalStop', onGlobalStop as any); } catch {}
    return () => { try { document.removeEventListener('globalStop', onGlobalStop as any); } catch {} };
  }, [duration]);

  return (
    <div className="tw-relative tw-overflow-hidden tw-h-full tw-flex tw-flex-col">
      {showPreloadIndicator && preloadInfo.total > 0 && (
        <div className="tw-pointer-events-none tw-absolute tw-top-4 tw-left-1/2 tw-z-50 tw-w-[260px] tw--translate-x-1/2 tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-shadow-lg tw-px-3 tw-py-2">
          <div className="tw-mb-1 tw-text-xs tw-text-neutral-300">
            {preloadingMedia
              ? `Caching timeline media… ${preloadPercent}% (${preloadInfo.loaded}/${preloadInfo.total})`
              : 'Timeline media cached'}
          </div>
          <div className="tw-h-1.5 tw-rounded tw-bg-neutral-800">
            <div
              className="tw-h-full tw-rounded tw-bg-sky-500"
              style={{ width: `${preloadBarWidth}%` }}
            />
          </div>
        </div>
      )}
      <style>
        {`
          /* .timeline-container migrated to Tailwind */
          /* .timeline-content migrated to Tailwind */
           
           .context-menu {
             position: fixed;
             background-color: #2a2a2a;
             border: 1px solid #444;
             border-radius: 4px;
             box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
             z-index: 1000;
             min-width: 120px;
             padding: 4px 0;
             font-family: inherit;
           }
           
           .context-menu button {
             width: 100%;
             padding: 8px 12px;
             background-color: transparent;
             border: none;
             color: #ff6b6b;
             cursor: pointer;
             text-align: left;
             font-size: 12px;
             display: flex;
             align-items: center;
             gap: 8px;
             transition: background-color 0.2s ease;
           }
           
           .context-menu button:hover {
             background-color: #444;
           }
           
                     .timeline-clip {
             user-select: none;
           }
           
           /* Professional Video Editor Controls */
           .timeline-header {
             display: flex;
             flex-direction: column;
             gap: 12px;
             padding: 16px;
             background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
             border-bottom: 1px solid #444;
             border-radius: 8px 8px 0 0;
           }
           
           .timeline-title h2 {
             margin: 0;
             color: #fff;
             font-size: 14px;
             font-weight: 600;
           }
           
           
           
           .transport-buttons {
             display: flex;
             align-items: center;
             gap: 4px;
           }
           
           .transport-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 36px;
             height: 36px;
             background: #333;
             border: 1px solid #555;
             border-radius: 4px;
             color: #fff;
             cursor: pointer;
             transition: all 0.2s ease;
             font-size: 12px;
           }
           
           .transport-btn:hover {
             background: #444;
             border-color: #666;
             transform: translateY(-1px);
           }
           
           .transport-btn:active {
             transform: translateY(0);
           }
           
           .play-btn {
             background: #007acc;
             border-color: #0099ff;
             width: 44px;
             height: 44px;
           }
           
           .play-btn:hover {
             background: #0099ff;
             border-color: #00aaff;
           }
           
           .play-btn.playing {
             background: #ff6b35;
             border-color: #ff8c42;
           }
           
           .play-btn.playing:hover {
             background: #ff8c42;
             border-color: #ffa052;
           }
           
           .time-display {
             display: flex;
             align-items: center;
             gap: 8px;
             font-family: 'Courier New', monospace;
             font-size: 14px;
             font-weight: 600;
             color: #fff;
             background: rgba(0, 0, 0, 0.5);
             padding: 8px 12px;
             border-radius: 4px;
             border: 1px solid #555;
             min-width: 120px;
             justify-content: center;
           }
           
           .current-time {
             color: #00ff88;
           }
           
           .time-separator {
             color: #888;
           }
           
           .total-time {
             color: #ccc;
           }
           
                                  .timeline-controls-single-line {
             display: flex;
             align-items: center;
             gap: 16px;
             padding: 12px;
             background: rgba(0, 0, 0, 0.3);
             border-radius: 6px;
             border: 1px solid #444;
             flex-wrap: nowrap;
             overflow-x: auto;
           }
           
           .timeline-title h2 {
             margin: 0;
             color: #fff;
             font-size: 14px;
             font-weight: 600;
             white-space: nowrap;
           }
            
            .timeline-controls {
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 12px;
              background: rgba(0, 0, 0, 0.2);
              border-radius: 6px;
              border: 1px solid #444;
            }
           
           .zoom-controls {
             display: flex;
             align-items: center;
             gap: 8px;
             background: rgba(0, 0, 0, 0.3);
             padding: 6px 10px;
             border-radius: 4px;
             border: 1px solid #555;
           }
           
           .zoom-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 28px;
             height: 28px;
             background: #333;
             border: 1px solid #555;
             border-radius: 3px;
             color: #fff;
             cursor: pointer;
             transition: all 0.2s ease;
           }
           
           .zoom-btn:hover {
             background: #444;
             border-color: #666;
           }
           
           .zoom-level {
             color: #fff;
             font-size: 12px;
             font-weight: 600;
             min-width: 30px;
             text-align: center;
           }
           
           .timeline-scrubber {
             flex: 1;
             display: flex;
             align-items: center;
           }
           
           .scrubber-slider {
             width: 100%;
             height: 6px;
             background: #444;
             border-radius: 3px;
             outline: none;
             cursor: pointer;
             -webkit-appearance: none;
             appearance: none;
           }
           
           .scrubber-slider::-webkit-slider-thumb {
             -webkit-appearance: none;
             appearance: none;
             width: 16px;
             height: 16px;
             background: #007acc;
             border: 2px solid #fff;
             border-radius: 50%;
             cursor: pointer;
             box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
           }
           
           .scrubber-slider::-moz-range-thumb {
             width: 16px;
             height: 16px;
             background: #007acc;
             border: 2px solid #fff;
             border-radius: 50%;
             cursor: pointer;
             box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
           }
           
           .action-buttons {
             display: flex;
             align-items: center;
             gap: 8px;
           }

           /* Magnet/Snap Button */
           .magnet-controls {
             display: flex;
             align-items: center;
             gap: 8px;
             background: rgba(0, 0, 0, 0.3);
             padding: 6px 10px;
             border-radius: 4px;
             border: 1px solid #555;
           }
           .magnet-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 32px;
             height: 32px;
             background: #333;
             border: 1px solid #555;
             border-radius: 4px;
             color: #fff;
             cursor: pointer;
             transition: all 0.2s ease;
           }
           .magnet-btn:hover { background: #444; border-color: #666; }
           .magnet-btn.active { background: #007acc; border-color: #0099ff; color: #fff; }
           
           .action-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 32px;
             height: 32px;
             background: #333;
             border: 1px solid #555;
             border-radius: 4px;
             color: #fff;
             cursor: pointer;
             transition: all 0.2s ease;
           }
           
           .action-btn:hover {
             background: #444;
             border-color: #666;
           }
           
           .clear-btn {
             background: #d32f2f;
             border-color: #f44336;
           }
           
           .clear-btn:hover {
             background: #f44336;
             border-color: #ff5722;
          }

           /* Track layout */
           .timeline-scroll {
             overflow-x: auto;
             overflow-y: scroll;
             height: 350px;
             min-height: 350px;
             max-height: none;
             padding-bottom: 2px; /* very minimal space below audio track */
             scrollbar-gutter: stable; /* keep space for scrollbar */
           }
           
           /* Hide duplicate scrollbars */
           .timeline-container {
             overflow: hidden;
           }
           
           .timeline-content {
             overflow: hidden;
           }
           
           /* Ensure only timeline-scroll has scrollbars */
           .timeline-inner {
             overflow: visible;
             min-height: 100%;
           }
           
           .timeline-tracks {
             overflow: visible;
             min-height: 100%;
           }
           .timeline-inner { 
             position: relative; 
             padding-bottom: 8px; 
             will-change: transform; 
             overflow: visible;
             min-height: 400px;
           }
           .timeline-tracks { 
             display: flex; 
             flex-direction: column; 
             gap: 8px; 
             overflow: visible;
             min-height: 0;
           }

           .timeline-track {
             display: flex;
             flex-direction: column;
             gap: 4px;
           }

           .track-header {
             display: flex;
             align-items: center;
             gap: 8px;
             color: #ccc;
             font-size: 12px;
             padding: 2px 6px;
           }

           .track-badge {
             display: inline-flex;
             align-items: center;
             justify-content: center;
             padding: 2px 6px;
             border-radius: 4px;
             font-weight: 600;
             font-size: 10px;
             background: #333;
             border: 1px solid #555;
             color: #fff;
           }

           .track-content {
             position: relative;
             min-height: ${TRACK_MIN_HEIGHT}px;
             border-radius: 6px;
             background: #1b1b1b;
             box-shadow: inset 0 0 0 1px #333; /* subtle frame, avoids overlap look */
             margin-bottom: 4px; /* ensure space between tracks */
           }

           /* Ruler */
           .timeline-ruler { position: sticky; top: 0; height: 24px; pointer-events: none; z-index: 3; }
           .timeline-mark { position: absolute; top: 0; height: 24px; border-left: 1px solid #555; }
           .timeline-mark .timeline-label { position: absolute; top: 6px; left: 4px; font-size: 12px; color: #aaa; pointer-events: none; }

           /* Playhead */
           /* .timeline-playhead migrated to Tailwind */

           /* Clips - migrated to Tailwind */
           .timeline-clip {
             position: absolute;
             top: 4px;
             bottom: 4px;
             border-radius: 4px;
             box-shadow: none;
             border: none !important; /* force remove any borders */
             display: flex;
             align-items: center;
             padding: 0 10px;
             will-change: transform, width;
             color: #fff;
             overflow: hidden;
             z-index: 2;
             box-sizing: border-box;
             background: #404040 !important; /* neutral-600 lighter grey */
           }
           .timeline-clip .clip-name { font-size: 12px; text-shadow: 0 1px 2px rgba(0,0,0,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
           .timeline-clip .clip-handle { position: absolute; top: 0; bottom: 0; width: 6px; background: rgba(255,255,255,0.8); opacity: 0.6; transition: opacity 0.15s ease; cursor: ew-resize; }
           .timeline-clip .clip-handle.left { left: 0; border-radius: 4px 0 0 4px; }
           .timeline-clip .clip-handle.right { right: 0; border-radius: 0 4px 4px 0; }
           .timeline-clip:hover .clip-handle { opacity: 1; }
           .timeline-clip.playing { outline: none; box-shadow: none; border: none !important; }
           .timeline-clip.selected {
            border: none !important;
             background: #262626 !important; /* neutral-700 for selected */
            box-shadow: 0 0 0 2px rgba(170,170,170,0.15) !important; /* subtle highlight */
          }
           
           /* Lasso selection */
           .lasso-selection {
             position: absolute;
             border: 2px dashed #007acc;
             background: rgba(0, 122, 204, 0.2);
             pointer-events: none;
             z-index: 1000;
             position: fixed;
           }

           /* Duration Controls */
           .duration-controls {
             display: flex;
             align-items: center;
             gap: 8px;
             background: rgba(0, 0, 0, 0.3);
             padding: 6px 10px;
             border-radius: 4px;
             border: 1px solid #555;
           }
           
           .duration-label {
             color: #ccc;
             font-size: 12px;
             font-weight: 600;
             white-space: nowrap;
           }
           
           .duration-input {
             width: 50px;
             height: 28px;
             background: #333;
             border: 1px solid #555;
             border-radius: 3px;
             color: #fff;
             text-align: center;
             font-size: 12px;
             font-weight: 600;
             outline: none;
             transition: all 0.2s ease;
           }
           
           .duration-input:focus {
             border-color: #007acc;
             box-shadow: 0 0 0 1px rgba(0, 122, 204, 0.3);
           }
           
           .duration-input:hover {
             border-color: #666;
           }
           
                       .duration-unit {
              color: #ccc;
              font-size: 12px;
              font-weight: 600;
            }
           
           .duration-presets {
             display: flex;
             gap: 2px;
           }
           
           .duration-preset-btn {
             display: flex;
             align-items: center;
             justify-content: center;
             width: 24px;
             height: 24px;
             background: #333;
             border: 1px solid #555;
             border-radius: 3px;
             color: #ccc;
             cursor: pointer;
             font-size: 12px;
             font-weight: 600;
             transition: all 0.2s ease;
           }
           
           .duration-preset-btn:hover {
             background: #444;
             border-color: #666;
             color: #fff;
           }
           
           .duration-preset-btn:active {
             background: #555;
             transform: translateY(1px);
           }
        `}
      </style>
      {/* No header; controls are docked in LayerManager */}

      <div className="tw-overflow-hidden tw-flex-1 tw-min-h-0">
        {/* Timeline Tracks - custom scroll (horizontal + vertical) */}
        <ScrollArea.Root className="vj-scroll-root tw-h-[350px] tw-min-h-[350px]">
          <ScrollArea.Viewport
            className="vj-scroll-viewport tw-h-[350px] tw-min-h-[350px] tw-pb-3"
            ref={timelineRef}
            onScroll={handleScrollThrottled}
            onMouseDown={handleTimelineMouseDown}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
          >
        <div className="tw-relative tw-pb-2 tw-overflow-visible tw-min-h-[400px] tw-[will-change:transform]" style={{ width: `${timelinePixelWidth}px`, minWidth: '100%' }}>
          <div className="tw-sticky tw-top-0 tw-h-6 tw-z-30 tw-cursor-pointer" onMouseDown={handleRulerMouseDown}>
            {(() => {
              const start = Math.max(0, Math.floor(visibleStartSec) - 1);
              const end = Math.min(Math.ceil(duration), Math.ceil(visibleEndSec) + 1);
              const marks: number[] = [];
              for (let i = start; i <= end; i++) marks.push(i);
              // Adapt label density based on zoom so labels don't overlap when zoomed out
              const pps = pixelsPerSecond;
              const labelEvery = ((): number => {
                if (pps >= 100) return 1;   // every second
                if (pps >= 60) return 2;    // every 2s
                if (pps >= 30) return 5;    // every 5s
                if (pps >= 15) return 10;   // every 10s
                if (pps >= 8) return 20;    // every 20s
                return 30;                  // every 30s at extreme zoom-out
              })();
              return marks.map((sec) => (
                <div key={`major-${sec}`} className="tw-absolute tw-top-0 tw-h-6 tw-border-l tw-border-neutral-600 tw-w-px" style={{ left: `${sec * pixelsPerSecond}px` }}>
                  {sec % labelEvery === 0 && (
                    <span className="tw-absolute tw-top-1.5 tw-left-1 tw-text-xs tw-text-neutral-400 tw-pointer-events-none">{sec}s</span>
                  )}
                </div>
              ));
            })()}
          </div>

          <div 
            className="tw-flex tw-flex-col tw-gap-2 tw-overflow-visible tw-min-h-0"
            onContextMenu={handleTrackRightClick}
          >
            {displayTracks.map((track, trackIndex) => (
              <div 
                key={track.id} 
                className="tw-flex tw-flex-col tw-gap-1"
                data-track-id={track.id}
                onContextMenu={(e) => handleIndividualTrackRightClick(e, track.id)}
              >
                {track.type === 'audio' && (
                  <div className="tw-flex tw-items-center tw-gap-2 tw-text-neutral-400 tw-text-xs tw-px-1.5 tw-py-0.5">
                    <span>AUDIO</span>
                </div>
                )}
                <div 
                  className="tw-relative tw-rounded-md tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-mb-1"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, track.id, currentTime)}
                  onClick={(e) => handleTrackClick(e, track.id)}
                  style={{ minHeight: TRACK_MIN_HEIGHT }}
                >
                  {/* Track number label (hide for audio tracks) */}
                  {track.type !== 'audio' && (
                    <span className="tw-absolute tw-left-1.5 tw-top-1 tw-text-xs tw-text-neutral-400 tw-select-none tw-pointer-events-none tw-z-10">{trackIndex + 1}</span>
                  )}
                  {(() => {
                    const startWindow = Math.max(0, visibleStartSec - VISIBLE_BUFFER_SEC);
                    const endWindow = Math.min(duration, visibleEndSec + VISIBLE_BUFFER_SEC);
                    const visibleClips = track.clips.filter((clip) => {
                      const clipStart = clip.startTime;
                      const clipEnd = clip.startTime + clip.duration;
                      return clipEnd >= startWindow && clipStart <= endWindow;
                    });
                    let waveformBudget = 8;
                    return visibleClips.map((clip) => {
                      let audioSrc: string | undefined = undefined;
                      try {
                        if (track.type === 'audio' && clip.type === 'audio') {
                          audioSrc = getAudioSrc(clip.asset);
                        }
                      } catch {}
                      return (
                        <SimpleTimelineClip
                          key={clip.id}
                          clip={clip}
                          trackId={track.id}
                          pixelsPerSecond={pixelsPerSecond}
                          isSelected={selectedClips.has(clip.id)}
                          onSelect={handleClipSelect}
                          onUpdate={handleClipUpdate}
                          onDelete={handleClipDelete}
                          onMoveToTrack={handleClipMoveToTrack}
                          onContextMenu={handleClipRightClick}
                          timelineRef={timelineRef as React.RefObject<HTMLDivElement>}
                          snapToGrid={timelineSnapEnabled}
                          snapThreshold={20}
                          allClips={tracks.flatMap(t => t.clips)}
                          trackDuration={duration}
                          allTracks={tracks.map(t => ({ id: t.id, type: t.type, name: t.name }))}
                          audioSrc={audioSrc}
                        />
                      );
                    });
                  })()}
                  {/* Active timeline highlight: lighten active region; leave beyond-duration dark */}
                  <div
                    className="tw-absolute tw-top-0 tw-bottom-0 tw-bg-neutral-800 tw-pointer-events-none tw-z-0"
                    style={{ left: 0, width: `${Math.max(0, duration * pixelsPerSecond)}px` }}
                  />
                  {draggedAsset && (
                    <div className="drag-preview">
                      <span>Drop to place: {draggedAsset.name}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Playhead inside scrollable area */}
          <div 
            ref={playheadRef}
            className="tw-absolute tw-top-0 tw-bottom-0 tw-w-[2px] tw-bg-red-500 tw-[will-change:transform] tw-pointer-events-auto tw-z-50 tw-cursor-ew-resize"
            style={{ 
              transform: `translate3d(${currentTime * pixelsPerSecond}px, 0, 0)`,
              transition: isPlaying ? 'none' : 'transform 0.1s ease'
            }}
            title={`Time: ${formatTime(currentTime)}`}
            data-current-time={currentTime}
            data-duration={duration}
            data-position={`${(currentTime / duration) * 100}%`}
            onMouseDown={handlePlayheadMouseDown}
            onMouseMove={handlePlayheadMouseMove}
            onMouseUp={handlePlayheadMouseUp}
            onContextMenu={handlePlayheadRightClick}
          />
          
          {/* Invisible full-height hit area for playhead right-click */}
          <div 
            className="tw-absolute tw-top-0 tw-bottom-0 tw-w-[40px] tw-bg-transparent tw-pointer-events-auto tw-z-50 tw-cursor-ew-resize"
            style={{ 
              transform: `translate3d(${currentTime * pixelsPerSecond - 19}px, 0, 0)`,
              transition: isPlaying ? 'none' : 'transform 0.1s ease',
              height: '100%' // Ensure it covers the full timeline height
            }}
            onMouseDown={handlePlayheadMouseDown}
            onMouseMove={handlePlayheadMouseMove}
            onMouseUp={handlePlayheadMouseUp}
            onContextMenu={handlePlayheadRightClick}
          />
        </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            forceMount
            orientation="horizontal"
            className="tw-z-10 tw-flex tw-h-2.5 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out tw-mt-1"
          >
            <ScrollArea.Thumb className="tw-bg-neutral-600 tw-rounded-[10px] tw-relative tw-cursor-pointer hover:tw-bg-neutral-500 tw-min-w-[28px]" />
          </ScrollArea.Scrollbar>
          <ScrollArea.Scrollbar
            forceMount
            orientation="vertical"
            className="tw-z-10 tw-flex tw-w-2.5 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out"
          >
            <ScrollArea.Thumb className="tw-bg-neutral-600 tw-rounded-[10px] tw-relative tw-cursor-pointer hover:tw-bg-neutral-500 tw-min-h-[28px]" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </div>
      
      {/* Lasso selection overlay */}
      {isLassoSelecting && lassoStart && lassoEnd && (
        <div
          ref={lassoRef}
          className="lasso-selection"
          style={{
            left: Math.min(lassoStart.x, lassoEnd.x),
            top: Math.min(lassoStart.y, lassoEnd.y),
            width: Math.max(1, Math.abs(lassoEnd.x - lassoStart.x)),
            height: Math.max(1, Math.abs(lassoEnd.y - lassoStart.y)),
          }}
        />
      )}
      
    {/* Context Menu */}
    {contextMenu.visible && (
      <ClipContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={handleContextMenuClose}
        onDelete={handleDeleteClip}
        onDuplicate={handleDuplicateClip}
        onSplit={splitClipsAtPlayhead}
        isPlayheadMenu={contextMenu.clipId === null}
      />
    )}

    {/* Track Context Menu */}
    {trackContextMenu.visible && (
      <TrackContextMenu
        x={trackContextMenu.x}
        y={trackContextMenu.y}
        onClose={handleTrackContextMenuClose}
        onAddTrack={handleAddTrack}
        onAddAudioTrack={handleAddAudioTrack}
        onRemoveTrack={handleRemoveTrack}
        trackId={trackContextMenu.trackId}
        canRemoveTrack={!!trackContextMenu.trackId}
      />
    )}

  </div>
); 
};