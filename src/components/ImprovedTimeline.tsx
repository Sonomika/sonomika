import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { debounce } from '../utils/debounce';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import AudioWaveform from './AudioWaveform.tsx';
import { useStore } from '../store/store';
import { Slider } from './ui';
import MoveableTimelineClip from './MoveableTimelineClip';

// Context Menu Component
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
}

const ClipContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onDelete }) => {
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

  return (
    <div
      ref={menuRef}
      className="context-menu tw-min-w-[140px] tw-overflow-hidden tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100"
      style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
    >
      <button
        onClick={handleDelete}
        className="tw-w-full tw-px-3 tw-py-1.5 tw-text-left tw-text-sm tw-text-red-400 hover:tw-bg-neutral-800"
      >
        Delete
      </button>
    </div>
  );
};

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

export const ImprovedTimeline: React.FC<TimelineProps> = ({ onClose: _onClose, onPreviewUpdate }) => {
  const { currentSceneId, timelineSnapEnabled, setTimelineSnapEnabled, selectedTimelineClip } = useStore() as any;
  
  // Load saved timeline data from localStorage for current scene
  const loadTimelineData = (): TimelineTrack[] => {
    try {
      const savedData = localStorage.getItem(`timeline-tracks-${currentSceneId}`);
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
        console.log(`Loaded timeline data for scene ${currentSceneId} from localStorage:`, tracksData);
        return tracksData;
      }
    } catch (error) {
      console.error('Error loading timeline data:', error);
    }
    
    // Default tracks if no saved data
    return [
      { id: 'track-1', name: 'Video 1', type: 'video', clips: [] },
      { id: 'track-2', name: 'Video 2', type: 'video', clips: [] },
      { id: 'track-3', name: 'Effect 1', type: 'effect', clips: [] },
      { id: 'track-4', name: 'Effect 2', type: 'effect', clips: [] },
      { id: 'track-audio', name: 'Audio', type: 'audio', clips: [] },
    ];
  };

  const [tracks, setTracks] = useState<TimelineTrack[]>(loadTimelineData);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [playbackInterval, setPlaybackInterval] = useState<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; sourceTrackId: string } | null>(null);

  // Calculate duration based on longest clip end
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
    // Use only the longest clip end, with a minimum of 1 second if no clips
    return Math.max(maxEnd > 0 ? Math.ceil(maxEnd) : 1, 1);
  }, [tracks]);
  
  // Lasso selection state
  const [isLassoSelecting, setIsLassoSelecting] = useState(false);
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoEnd, setLassoEnd] = useState<{ x: number; y: number } | null>(null);
  
  const PIXELS_PER_SECOND = 120;
  const pixelsPerSecond = useMemo(() => PIXELS_PER_SECOND * Math.max(0.05, zoom), [zoom]);
  const timelinePixelWidth = useMemo(() => Math.max(1, duration * pixelsPerSecond), [duration, pixelsPerSecond]);
  const TRACK_MIN_HEIGHT = 28;
  const SHOW_AUDIO_WAVEFORM = false;
  
  const timelineVisualHeight = useMemo(() => {
    const baseRuler = 28;
    const headerHeight = 24;
    const gap = 8;
    const perTrack = TRACK_MIN_HEIGHT + headerHeight + gap;
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
  
  const timelineRef = useRef<HTMLDivElement>(null);
  // Auto-scroll timeline viewport while dragging near edges (both axes).
  const dragAutoScrollRafRef = useRef<number | null>(null);
  const dragAutoScrollVxRef = useRef<number>(0);
  const dragAutoScrollVyRef = useRef<number>(0);

  const stopTimelineDragAutoScroll = () => {
    dragAutoScrollVxRef.current = 0;
    dragAutoScrollVyRef.current = 0;
    if (dragAutoScrollRafRef.current != null) {
      cancelAnimationFrame(dragAutoScrollRafRef.current);
      dragAutoScrollRafRef.current = null;
    }
  };

  const tickTimelineDragAutoScroll = () => {
    const el = timelineRef.current;
    const vx = dragAutoScrollVxRef.current;
    const vy = dragAutoScrollVyRef.current;
    if (!el || (vx === 0 && vy === 0)) {
      stopTimelineDragAutoScroll();
      return;
    }
    try {
      if (vx) el.scrollLeft += vx;
      if (vy) el.scrollTop += vy;
    } catch {}
    dragAutoScrollRafRef.current = requestAnimationFrame(tickTimelineDragAutoScroll);
  };

  const updateTimelineDragAutoScrollFromPointer = (clientX: number, clientY: number) => {
    const el = timelineRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 56;
    const maxSpeed = 18; // px per frame at ~60fps

    let vx = 0;
    let vy = 0;

    if (clientX < rect.left + edge) {
      const t = Math.max(0, Math.min(1, (rect.left + edge - clientX) / edge));
      vx = -maxSpeed * t;
    } else if (clientX > rect.right - edge) {
      const t = Math.max(0, Math.min(1, (clientX - (rect.right - edge)) / edge));
      vx = maxSpeed * t;
    }

    if (clientY < rect.top + edge) {
      const t = Math.max(0, Math.min(1, (rect.top + edge - clientY) / edge));
      vy = -maxSpeed * t;
    } else if (clientY > rect.bottom - edge) {
      const t = Math.max(0, Math.min(1, (clientY - (rect.bottom - edge)) / edge));
      vy = maxSpeed * t;
    }

    dragAutoScrollVxRef.current = vx;
    dragAutoScrollVyRef.current = vy;
    if ((vx !== 0 || vy !== 0) && dragAutoScrollRafRef.current == null) {
      dragAutoScrollRafRef.current = requestAnimationFrame(tickTimelineDragAutoScroll);
    }
    if (vx === 0 && vy === 0 && dragAutoScrollRafRef.current != null) {
      stopTimelineDragAutoScroll();
    }
  };

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
      p = p.replace(/\\/g, '/');
      if (!p.startsWith('/')) p = '/' + p;
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
        return src;
      }
      const p: string = asset.path || '';
      if (p.startsWith('file://')) {
        return p;
      }
      if (p.startsWith('local-file://')) {
        const fp = p.replace('local-file://', '');
        const src = toFileURL(fp);
        return src;
      }
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
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRafRef = useRef<number | null>(null);

  const updateViewportMetrics = () => {
    const el = timelineRef.current;
    if (!el) return;
    setViewportWidth(el.clientWidth);
  };

  const handleScrollThrottled = () => {
    const el = timelineRef.current;
    if (!el) return;
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
      setScrollLeft(el.scrollLeft);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
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

  // Visible window in seconds with small buffer
  const visibleStartSec = Math.max(0, scrollLeft / Math.max(1, pixelsPerSecond));
  const visibleEndSec = (scrollLeft + Math.max(1, viewportWidth)) / Math.max(1, pixelsPerSecond);
  const VISIBLE_BUFFER_SEC = 2;

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
    e.dataTransfer.dropEffect = draggingClip ? 'move' : 'copy';
    const target = e.currentTarget as HTMLElement;
    target.classList.add('drag-over');
    updateTimelineDragAutoScrollFromPointer(e.clientX, e.clientY);
  };

  // Ensure an audio lane exists in current state (one-time on mount)
  useEffect(() => {
    if (ensuredAudioTrackRef.current) return;
    ensuredAudioTrackRef.current = true;
    try {
      if (!tracks.some((t) => t.type === 'audio')) {
        setTracks([
          ...tracks,
          { id: 'track-audio', name: 'Audio', type: 'audio', clips: [] },
        ]);
        console.log('Ensured audio track exists by appending to current tracks');
      }
    } catch {}
  }, []);

  const handleDragLeave = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
    stopTimelineDragAutoScroll();
  };

  // Lasso selection mouse handlers
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
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
          setSelectedClips(prev => new Set([...prev, ...selectedClipIds]));
        } else {
          setSelectedClips(selectedClipIds);
        }
      }
      setIsLassoSelecting(false);
      setLassoStart(null);
      setLassoEnd(null);
    }
  };

  const isAssetAllowedOnTrack = (trackType: TimelineTrack['type'], assetType: string) => {
    if (trackType === 'audio') return assetType === 'audio';
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

    if (sorted.length === 0) {
      return Math.max(0, candidateStart);
    }

    const firstClipStart = sorted[0].startTime;
    if (candidateStart + clipDuration <= firstClipStart) {
      return Math.max(0, candidateStart);
    }

    for (let i = 0; i < sorted.length; i++) {
      const currentClip = sorted[i];
      const currentClipEnd = currentClip.startTime + currentClip.duration;
      
      const nextClip = sorted[i + 1];
      if (nextClip) {
        const gapStart = currentClipEnd;
        const gapEnd = nextClip.startTime;
        
        if (candidateStart >= gapStart && candidateStart + clipDuration <= gapEnd) {
          return candidateStart;
        }
      } else {
        if (candidateStart >= currentClipEnd) {
          return candidateStart;
        }
      }
    }

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
    
    if (sorted.length === 0) {
      return Math.max(0, desiredStart);
    }
    
    const firstClipStart = sorted[0].startTime;
    if (desiredStart + clipDuration <= firstClipStart) {
      return Math.max(0, desiredStart);
    }
    
    for (let i = 0; i < sorted.length; i++) {
      const currentClip = sorted[i];
      const currentClipEnd = currentClip.startTime + currentClip.duration;
      
      const nextClip = sorted[i + 1];
      if (nextClip) {
        const gapStart = currentClipEnd;
        const gapEnd = nextClip.startTime;
        
        if (desiredStart >= gapStart && desiredStart + clipDuration <= gapEnd) {
          return desiredStart;
        }
      } else {
        if (desiredStart >= currentClipEnd) {
          return desiredStart;
        }
      }
    }

    const lastClip = sorted[sorted.length - 1];
    const lastClipEnd = lastClip.startTime + lastClip.duration;
    return Math.max(lastClipEnd, desiredStart);
  };

  // Handle drop from media library
  const handleDrop = (e: React.DragEvent, trackId: string, _time: number) => {
    e.preventDefault();
    stopTimelineDragAutoScroll();
    
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
    
    const assetData = e.dataTransfer.getData('application/json');
    console.log('Asset data from drop:', assetData);
    
    if (!assetData) return;
    
    try {
      const asset = JSON.parse(assetData);
      console.log('Parsed asset:', asset);
      
      const track = tracks.find(t => t.id === trackId);
      if (!track) {
        console.error('Track not found:', trackId);
        return;
      }
      
      if (!isAssetAllowedOnTrack(track.type, asset.type)) {
        console.error('Asset type not allowed on track type:', asset.type, track.type);
        return;
      }
      
      const rect = target.getBoundingClientRect();
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (!timelineRect) return;
      
      const relativeX = e.clientX - timelineRect.left;
      const dropTime = Math.max(0, relativeX / pixelsPerSecond);
      
      const clipDuration = asset.duration || 5; // Default 5 seconds if no duration
      const clampedStart = timelineSnapEnabled 
        ? clampStartToNeighbors(track.clips, dropTime, clipDuration)
        : findFirstAvailableStart(track.clips, dropTime, clipDuration);
      
      const newClip: TimelineClip = {
        id: crypto.randomUUID(),
        startTime: clampedStart,
        duration: clipDuration,
        asset: asset,
        type: asset.type,
        name: asset.name || asset.fileName || 'Untitled',
        params: asset.params || {}
      };
      
      setTracks(prev => prev.map(t => 
        t.id === trackId 
          ? { ...t, clips: [...t.clips, newClip] }
          : t
      ));
      
      console.log('Added clip to track:', trackId, newClip);
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  // Handle track click
  const handleTrackClick = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    setSelectedClips(new Set());
  };

  // Handle clip selection
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
        const { setSelectedTimelineClip } = state;
        const track = tracks.find(t => t.clips.some(c => c.id === clipId));
        const clip = track?.clips.find(c => c.id === clipId);
        if (track && clip) {
          const trackNum = parseInt((track.id || 'track-1').split('-')[1] || '1', 10);
          // Timeline mode should be completely independent - never link to column mode layers
          // Set layerId to null to ensure complete separation
          if (typeof setSelectedTimelineClip === 'function') {
            setSelectedTimelineClip({ id: clip.id, trackId: track.id, startTime: clip.startTime, duration: clip.duration, data: clip, layerId: null, trackNum });
          }
        }
      } catch {}
    }
  }, [tracks]);

  // Handle clip update
  const handleClipUpdate = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => 
        clip.id === clipId ? { ...clip, ...updates } : clip
      )
    })));
  }, []);

  // Handle clip delete
  const handleClipDelete = useCallback((clipId: string) => {
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.filter(clip => clip.id !== clipId)
    })));
    setSelectedClips(prev => {
      const newSet = new Set(prev);
      newSet.delete(clipId);
      return newSet;
    });
  }, []);

  // Handle clip context menu
  const handleClipRightClick = (e: React.MouseEvent, clipId: string, trackId: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      clipId,
      trackId,
    });
  };

  // Handle context menu close
  const handleContextMenuClose = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  // Handle context menu delete
  const handleContextMenuDelete = () => {
    if (contextMenu.clipId) {
      handleClipDelete(contextMenu.clipId);
    }
    handleContextMenuClose();
  };

  // Playhead drag handlers
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    if (isPlaying) {
      // Pause playback when starting to drag playhead
      if (playbackInterval) {
        clearInterval(playbackInterval);
        setPlaybackInterval(null);
      }
      setIsPlaying(false);
    }
  };

  const handlePlayheadMouseMove = (e: React.MouseEvent) => {
    if (isDraggingPlayhead) {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const relativeX = e.clientX - rect.left;
      const newTime = Math.max(0, Math.min(duration, relativeX / pixelsPerSecond));
      setCurrentTime(newTime);
    }
  };

  const handlePlayheadMouseUp = () => {
    setIsDraggingPlayhead(false);
  };

  // Timeline playback controls
  const startTimelinePlayback = () => {
    if (playbackInterval) return;
    
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const newTime = prev + 0.1; // 10fps update
        if (newTime >= duration) {
          setIsPlaying(false);
          clearInterval(interval);
          setPlaybackInterval(null);
          return duration;
        }
        return newTime;
      });
    }, 100);
    
    setPlaybackInterval(interval);
    setIsPlaying(true);
  };

  const stopTimelinePlayback = () => {
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopTimelinePlayback();
    } else {
      startTimelinePlayback();
    }
  };

  // Save timeline data to localStorage when tracks change
  useEffect(() => {
    try {
      localStorage.setItem(`timeline-tracks-${currentSceneId}`, JSON.stringify(tracks));
    } catch (error) {
      console.error('Error saving timeline data:', error);
    }
  }, [tracks, currentSceneId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playbackInterval) {
        clearInterval(playbackInterval);
      }
    };
  }, [playbackInterval]);

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-bg-neutral-900 tw-text-white">
      {/* Timeline Controls */}
      <div className="tw-flex tw-items-center tw-justify-between tw-p-4 tw-border-b tw-border-neutral-700">
        <div className="tw-flex tw-items-center tw-gap-4">
          <button
            onClick={togglePlayback}
            className="tw-px-4 tw-py-2 tw-bg-blue-600 hover:tw-bg-blue-700 tw-rounded tw-text-sm tw-font-medium"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-sm tw-text-neutral-300">Time:</span>
            <span className="tw-text-sm tw-font-mono">
              {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(1).padStart(4, '0')}
            </span>
          </div>
          
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-sm tw-text-neutral-300">Duration:</span>
            <span className="tw-text-sm tw-font-mono">
              {Math.floor(duration / 60)}:{(duration % 60).toFixed(1).padStart(4, '0')}
            </span>
          </div>
        </div>
        
        <div className="tw-flex tw-items-center tw-gap-4">
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-sm tw-text-neutral-300">Zoom:</span>
            <Slider
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={0.1}
              max={5}
              step={0.1}
              className="tw-w-24"
            />
          </div>
          
          <div className="tw-flex tw-items-center tw-gap-2">
            <input
              type="checkbox"
              id="snap-enabled"
              checked={timelineSnapEnabled}
              onChange={(e) => setTimelineSnapEnabled(e.target.checked)}
              className="tw-rounded"
            />
            <label htmlFor="snap-enabled" className="tw-text-sm tw-text-neutral-300">
              Snap to Grid
            </label>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="tw-flex-1 tw-overflow-hidden">
        <ScrollArea.Root className="tw-h-full">
          <ScrollArea.Viewport
            className="vj-scroll-viewport tw-h-full tw-pb-3"
            ref={timelineRef}
            onScroll={handleScrollThrottled}
            onMouseDown={handleTimelineMouseDown}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
          >
            <div className="tw-relative tw-pb-2 tw-overflow-visible tw-min-h-[400px] tw-[will-change:transform]" style={{ width: `${timelinePixelWidth}px` }}>
              {/* Timeline ruler */}
              <div className="tw-sticky tw-top-0 tw-h-6 tw-pointer-events-none tw-z-30">
                <div className="tw-relative tw-h-full tw-bg-neutral-800 tw-border-b tw-border-neutral-600">
                  {/* Time markers */}
                  {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
                    <div
                      key={i}
                      className="tw-absolute tw-top-0 tw-h-full tw-w-px tw-bg-neutral-500"
                      style={{ left: `${i * pixelsPerSecond}px` }}
                    />
                  ))}
                  {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
                    <div
                      key={`label-${i}`}
                      className="tw-absolute tw-top-1 tw-text-xs tw-text-neutral-400 tw-font-mono"
                      style={{ left: `${i * pixelsPerSecond + 2}px` }}
                    >
                      {i}s
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline tracks */}
              {displayTracks.map((track, trackIndex) => (
                <div key={track.id} className="tw-mb-2">
                  {/* Track header */}
                  <div className="tw-h-6 tw-bg-neutral-800 tw-border-b tw-border-neutral-600 tw-flex tw-items-center tw-px-2">
                    <span className="tw-text-xs tw-font-medium tw-text-neutral-300">
                      {track.name}
                    </span>
                  </div>
                  
                  {/* Track content */}
                  <div 
                    className="tw-relative tw-rounded-md tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-mb-1 tw-min-h-[28px]"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, track.id, currentTime)}
                    onClick={(e) => handleTrackClick(e, track.id)}
                    style={{ minHeight: TRACK_MIN_HEIGHT }}
                  >
                    {/* Visible clips with moveable functionality */}
                    {track.clips
                      .filter((clip) => {
                        const clipStart = clip.startTime;
                        const clipEnd = clip.startTime + clip.duration;
                        return clipEnd >= visibleStartSec - VISIBLE_BUFFER_SEC && clipStart <= visibleEndSec + VISIBLE_BUFFER_SEC;
                      })
                      .map((clip) => (
                        <MoveableTimelineClip
                          key={clip.id}
                          clip={clip}
                          trackId={track.id}
                          trackIndex={tracks.findIndex(t => t.id === track.id)}
                          totalTracks={tracks.length}
                          pixelsPerSecond={pixelsPerSecond}
                          isSelected={selectedClips.has(clip.id)}
                          onSelect={handleClipSelect}
                          onUpdate={handleClipUpdate}
                          onDelete={handleClipDelete}
                          onContextMenu={handleClipRightClick}
                          onMoveToTrack={(clipId, fromTrack, toTrack) => console.log('Move clip', clipId, 'from', fromTrack, 'to', toTrack)}
                          timelineRef={timelineRef as React.RefObject<HTMLDivElement>}
                          snapToGrid={timelineSnapEnabled}
                          snapThreshold={10}
                        />
                      ))}
                  </div>
                </div>
              ))}

              {/* Playhead */}
              <div
                ref={playheadRef}
                className="tw-absolute tw-top-0 tw-bottom-0 tw-w-0.5 tw-bg-red-500 tw-pointer-events-auto tw-cursor-ew-resize tw-z-40"
                style={{
                  left: `${currentTime * pixelsPerSecond}px`,
                }}
                data-current-time={currentTime}
                data-duration={duration}
                data-position={`${(currentTime / duration) * 100}%`}
                onMouseDown={handlePlayheadMouseDown}
                onMouseMove={handlePlayheadMouseMove}
                onMouseUp={handlePlayheadMouseUp}
              />
            </div>
          </ScrollArea.Viewport>
          
          <ScrollArea.Scrollbar
            forceMount
            orientation="horizontal"
            className="tw-z-10 tw-flex tw-h-2.5 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out tw-mt-1"
          >
            <ScrollArea.Thumb className="tw-flex-1 tw-bg-neutral-600 tw-rounded-full tw-relative" />
          </ScrollArea.Scrollbar>
          
          <ScrollArea.Scrollbar
            forceMount
            orientation="vertical"
            className="tw-z-10 tw-flex tw-w-2.5 tw-touch-none tw-select-none tw-transition-colors tw-duration-150 ease-out tw-ml-1"
          >
            <ScrollArea.Thumb className="tw-flex-1 tw-bg-neutral-600 tw-rounded-full tw-relative" />
          </ScrollArea.Scrollbar>
          
          <ScrollArea.Corner className="tw-bg-neutral-800" />
        </ScrollArea.Root>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <ClipContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleContextMenuClose}
          onDelete={handleContextMenuDelete}
        />
      )}
    </div>
  );
};

export default ImprovedTimeline;
