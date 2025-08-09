import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AudioWaveform } from './AudioWaveform';
import { useStore } from '../store/store';
// EffectLoader import removed - using dynamic loading instead

// Context Menu Component
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onDelete }) => {
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
      className="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        backgroundColor: '#2a2a2a',
        border: '1px solid #444',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        minWidth: '120px',
        padding: '4px 0',
      }}
    >
      <button
        onClick={handleDelete}
        style={{
          width: '100%',
          padding: '8px 12px',
          backgroundColor: 'transparent',
          border: 'none',
          color: '#ff6b6b',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#444';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        🗑️ Delete
      </button>
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
}

export const Timeline: React.FC<TimelineProps> = ({ onClose: _onClose, onPreviewUpdate }) => {
  const { currentSceneId, timelineSnapEnabled, setTimelineSnapEnabled, timelineDuration, setTimelineDuration } = useStore() as any;
  
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
      { id: 'track-1', name: 'Track 1', type: 'video', clips: [] },
      { id: 'track-2', name: 'Track 2', type: 'video', clips: [] },
      { id: 'track-3', name: 'Track 3', type: 'effect', clips: [] },
      { id: 'track-4', name: 'Audio', type: 'audio', clips: [] }
    ];
  };

  const [tracks, setTracks] = useState<TimelineTrack[]>(loadTimelineData);
  const [currentTime, setCurrentTime] = useState(0);
  // Timeline duration adapts to longest clip end; fallback to store duration if no clips
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
    // Use the maximum of: longest clip end, or configured timeline duration
    return Math.max(maxEnd > 0 ? Math.ceil(maxEnd) : 0, timelineDuration);
  }, [tracks, timelineDuration]);
  
  // Reload timeline data when scene changes
  useEffect(() => {
    console.log(`Scene changed to ${currentSceneId}, reloading timeline data`);
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
  }, [currentSceneId]);
  
  // Save timeline data to localStorage for current scene
  const saveTimelineData = (tracksData: TimelineTrack[]) => {
    try {
      localStorage.setItem(`timeline-tracks-${currentSceneId}`, JSON.stringify(tracksData));
      console.log(`Saved timeline data for scene ${currentSceneId} to localStorage:`, tracksData);
    } catch (error) {
      console.error('Error saving timeline data:', error);
    }
  };

  // Clear timeline data from localStorage for current scene
  const clearTimelineData = () => {
    try {
      localStorage.removeItem(`timeline-tracks-${currentSceneId}`);
      console.log(`Cleared timeline data for scene ${currentSceneId} from localStorage`);
    } catch (error) {
      console.error('Error clearing timeline data:', error);
    }
  };

  // (removed unused clearAllTimelineData)

  // Custom setTracks function that also saves to localStorage
  const updateTracks = (newTracks: TimelineTrack[] | ((prev: TimelineTrack[]) => TimelineTrack[])) => {
    setTracks(prevTracks => {
      const updatedTracks = typeof newTracks === 'function' ? newTracks(prevTracks) : newTracks;
      saveTimelineData(updatedTracks);
      return updatedTracks;
    });
  };
  
  // Calculate the earliest clip start time to sync playhead
  const getEarliestClipTime = () => {
    let earliestTime = 0;
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (clip.startTime < earliestTime || earliestTime === 0) {
          earliestTime = clip.startTime;
        }
      });
    });
    return earliestTime;
  };
  const { timelineZoom, setTimelineZoom } = useStore();
  const zoom = timelineZoom;
  const setZoom = setTimelineZoom;
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [draggedAsset, setDraggedAsset] = useState<any>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  // waveform state managed by wavesurfer
  const [playbackInterval, setPlaybackInterval] = useState<NodeJS.Timeout | null>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; sourceTrackId: string } | null>(null);
  // Lasso selection state
  const [isLassoSelecting, setIsLassoSelecting] = useState(false);
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoEnd, setLassoEnd] = useState<{ x: number; y: number } | null>(null);
  const PIXELS_PER_SECOND = 120;
  const pixelsPerSecond = useMemo(() => PIXELS_PER_SECOND * Math.max(0.1, zoom), [zoom]);
  const timelinePixelWidth = useMemo(() => Math.max(1, duration * pixelsPerSecond), [duration, pixelsPerSecond]);
  const TRACK_MIN_HEIGHT = 72;
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
  
  const timelineRef = useRef<HTMLDivElement>(null);
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

  // Ensure an audio lane exists in current state (one-time on mount)
  useEffect(() => {
    if (ensuredAudioTrackRef.current) return;
    ensuredAudioTrackRef.current = true;
    try {
      if (!tracks.some((t) => t.type === 'audio')) {
        updateTracks([
          ...tracks,
          { id: 'track-audio', name: 'Audio', type: 'audio', clips: [] },
        ]);
        console.log('Ensured audio track exists by appending to current tracks');
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
              // Respect original video duration
              const maxDuration = moving.asset?.duration || moving.duration;
              const clampedDuration = Math.min(newDuration, maxDuration);
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
              // Respect original video duration
              const maxDuration = moving.asset?.duration || moving.duration;
              const clampedDuration = Math.min(safeDuration, maxDuration);
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

          const desiredDuration = asset.duration || 5;
          
          if (existingClip) {
            // Replace the existing clip
            console.log('Replacing existing clip:', existingClip.name, 'with:', asset.name);
            const updatedTracks = tracks.map(t => 
              t.id === trackId 
                ? { 
                    ...t, 
                    clips: t.clips.map(c => 
                      c.id === existingClip.id 
                        ? {
                            id: `clip-${Date.now()}`,
                            startTime: existingClip.startTime,
                            duration: desiredDuration,
                            asset: assetRef,
                            type: clipType,
                            name: asset.name || 'Untitled Clip'
                          }
                        : c
                    )
                  }
                : t
            );
            updateTracks(updatedTracks);
          } else {
            // Place in gap as normal
            // When magnet is enabled, place behind the last clip; otherwise use drop position
            let safeStartForNew;
            if (timelineSnapEnabled && !e.shiftKey) {
              // Find the last clip on the track to place behind it
              const sortedClips = track.clips.sort((a, b) => a.startTime - b.startTime);
              if (sortedClips.length > 0) {
                // Place behind the last clip (not just the first)
                const lastClip = sortedClips[sortedClips.length - 1];
                const lastClipEnd = lastClip.startTime + lastClip.duration;
                safeStartForNew = lastClipEnd;
              } else {
                // No clips on track, place at 0
                safeStartForNew = 0;
              }
            } else {
              // Use original logic: video/audio at 0, effects at drop position
              safeStartForNew = clipType === 'video' || clipType === 'audio' ? 0 : findFirstAvailableStart(track.clips, Math.max(0, desiredStart), desiredDuration);
            }

            const newClip: TimelineClip = {
              id: `clip-${Date.now()}`,
              startTime: safeStartForNew,
              duration: desiredDuration, // Default 5 seconds
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
          }

          // If audio, fetch actual duration and update the clip (for both replacement and new clips)
          if (clipType === 'audio') {
            try {
              const tempAudio = new Audio(assetRef.path);
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

        // Always place video and audio clips at 0 seconds
        const finalStartTime = clipType === 'video' || clipType === 'audio' ? 0 : newStartTime;
        
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
            const tempAudio = new Audio(assetRef.path);
            tempAudio.addEventListener('loadedmetadata', () => {
              const realDuration = isFinite(tempAudio.duration) && tempAudio.duration > 0 ? tempAudio.duration : newClip.duration;
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

  // Start timeline playback
  const startTimelinePlayback = () => {
    // Reset and pause all audio elements before starting
    try {
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      lastActiveAudioIdsRef.current.clear();
    } catch {}
    console.log('Starting timeline playback, current time:', currentTime, 'duration:', duration);
    console.log('🎵 Timeline tracks:', tracks);
    console.log('🎵 Earliest clip time:', getEarliestClipTime());
    
    // Clear any existing interval first
    if (playbackInterval) {
      console.log('Clearing existing interval');
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    
    // Always start from current time when play button is clicked (don't override user's position)
    const startAt = currentTime;
    console.log('Starting playback from current time:', startAt);
    setCurrentTime(startAt);
    
    // Get earliest clip time for end-of-timeline reset
    // (reuse earliestClipTime defined above)
    
    console.log('Creating new interval');
    const interval = setInterval(() => {
      console.log('🔄 Interval callback executed at:', Date.now());
      setCurrentTime(prevTime => {
        const newTime = prevTime + 0.05; // 20fps update rate for smoother movement
        console.log('🕒 Timeline time update:', prevTime, '->', newTime, 'duration:', duration);
        if (newTime >= duration) {
          // End of timeline reached
          console.log('⏹️ Timeline reached end, stopping playback');
          setIsPlaying(false);
          // Reset to earliest clip or 0
          const resetTime = getEarliestClipTime() > 0 ? getEarliestClipTime() : 0;
          setCurrentTime(resetTime);
          clearInterval(interval);
          setPlaybackInterval(null);
          return resetTime;
        }
        console.log('✅ Returning new time:', newTime);
        return newTime;
      });
    }, 50); // 50ms = 20fps for smoother movement
    
    console.log('Setting playback interval:', interval);
    setPlaybackInterval(interval);
    setIsPlaying(true); // Ensure playing state is set
    console.log('Timeline playback started, isPlaying set to true');
  };

  // Stop timeline playback
  const stopTimelinePlayback = () => {
    console.log('Stopping timeline playback');
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    // Pause all audio elements when stopping
    try {
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
      });
      lastActiveAudioIdsRef.current.clear();
    } catch {}
    setIsPlaying(false);
    console.log('Timeline playback stopped, isPlaying set to false');
  };

  // Handle play button click
  const handlePlayButtonClick = async () => {
    console.log('Play button clicked, current isPlaying:', isPlaying);
    
    // Force a small delay to ensure state is properly updated
    await new Promise(resolve => setTimeout(resolve, 10));
    
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

  // Force refresh play state when component mounts or when needed
  useEffect(() => {
    // Ensure play state is consistent with interval state
    if (!playbackInterval && isPlaying) {
      console.log('Fixing inconsistent play state - clearing isPlaying');
      setIsPlaying(false);
    }
  }, [playbackInterval, isPlaying]);

  // Debug currentTime changes
  useEffect(() => {
    console.log('🕒 currentTime changed to:', currentTime);
  }, [currentTime]);

  // Update preview content when timeline is playing
  useEffect(() => {
    if (onPreviewUpdate) {
      const activeClips = getClipsAtTime(currentTime);
      console.log('Timeline preview update - Time:', currentTime, 'Playing:', isPlaying, 'Active clips:', activeClips.length);
      
      // AUDIO SYNC: ensure audio clips play/pause in sync with timeline
      try {
        const activeAudioClips = activeClips.filter((c: any) => c.type === 'audio');
        const nextActiveIds = new Set<string>(activeAudioClips.map((c: any) => c.id));

        // Pause any audio that is no longer active
        lastActiveAudioIdsRef.current.forEach((clipId) => {
          if (!nextActiveIds.has(clipId)) {
            const audio = audioElementsRef.current.get(clipId);
            if (audio) audio.pause();
          }
        });

        // For each active audio clip, play and seek to relative time
        activeAudioClips.forEach((clip: any) => {
          let audio = audioElementsRef.current.get(clip.id);
          if (!audio) {
            audio = new Audio(clip.asset.path);
            audio.preload = 'auto';
            // Keep volume as-is; could later be controllable via clip params
            audioElementsRef.current.set(clip.id, audio);
          }
          if (isPlaying) {
            const desiredTime = Math.max(0, clip.relativeTime);
            // Seek if drift is noticeable (>100ms)
            if (Math.abs((audio.currentTime || 0) - desiredTime) > 0.1) {
              try { audio.currentTime = desiredTime; } catch {}
            }
            if (audio.paused) {
              // Best-effort play; Electron should allow without gesture issues
              audio.play().catch(() => {});
            }
          } else {
            audio.pause();
          }
        });

        // Update last active set
        lastActiveAudioIdsRef.current = nextActiveIds;
      } catch (err) {
        console.warn('Audio sync error:', err);
      }

      if (isPlaying && activeClips.length > 0) {
        // Send timeline preview content to parent
        const timelinePreviewContent = {
          type: 'timeline',
          tracks: tracks,
          currentTime: currentTime,
          duration: duration,
          isPlaying: true,
          activeClips: activeClips
        };
        
        console.log('Sending timeline preview content:', timelinePreviewContent);
        onPreviewUpdate(timelinePreviewContent);
      } else {
        // Clear preview when not playing or no active clips
        console.log('Clearing timeline preview');
        onPreviewUpdate(null);
      }
    }
  }, [currentTime, isPlaying, tracks, duration, onPreviewUpdate]);

  // Debug currentTime changes
  useEffect(() => {
    console.log('currentTime changed to:', currentTime);
  }, [currentTime]);

  // Debug isPlaying changes
  useEffect(() => {
    console.log('isPlaying changed to:', isPlaying);
  }, [isPlaying]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (playbackInterval) {
        clearInterval(playbackInterval);
      }
    };
  }, [playbackInterval]);

  // Cleanup audio elements on unmount
  useEffect(() => {
    return () => {
      try {
        audioElementsRef.current.forEach((audio) => audio.pause());
        audioElementsRef.current.clear();
        lastActiveAudioIdsRef.current.clear();
      } catch {}
    };
  }, []);

  // Playhead drag handlers
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    // Pause playback when starting to drag playhead
    if (isPlaying) {
      stopTimelinePlayback();
    }
  };

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

  return (
    <div className="timeline-container">
      <style>
        {`
          .timeline-container { 
            overflow-x: hidden; 
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .timeline-content { 
            overflow-x: hidden; 
            flex: 1;
            min-height: 0;
          }
          
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
             font-size: 18px;
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
             font-size: 18px;
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
           .timeline-mark .timeline-label { position: absolute; top: 6px; left: 4px; font-size: 10px; color: #aaa; pointer-events: none; }

           /* Playhead */
           .timeline-playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #ff5252; box-shadow: 0 0 0 1px rgba(255,82,82,0.25); will-change: transform; pointer-events: auto; z-index: 4; cursor: ew-resize; }

                       /* Clips */
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
              background: #1e88e5 !important; /* force blue background */
            }
            .timeline-clip .clip-name { font-size: 12px; text-shadow: 0 1px 2px rgba(0,0,0,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .timeline-clip .clip-handle { position: absolute; top: 0; bottom: 0; width: 6px; background: rgba(255,255,255,0.8); opacity: 0.6; transition: opacity 0.15s ease; cursor: ew-resize; }
            .timeline-clip .clip-handle.left { left: 0; border-radius: 4px 0 0 4px; }
            .timeline-clip .clip-handle.right { right: 0; border-radius: 0 4px 4px 0; }
            .timeline-clip:hover .clip-handle { opacity: 1; }
            .timeline-clip.playing { outline: none; box-shadow: none; border: none !important; }
            .timeline-clip.selected { 
              border: none !important; 
              background: #ff6b35 !important; /* Orange color for selected clips */
              box-shadow: 0 0 0 2px #ff8c42 !important; /* Orange glow */
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
             font-size: 10px;
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
            <div className="timeline-header">
        {/* All Controls on One Line */}
        <div className="timeline-controls-single-line">
          {/* Timeline Title */}
          <div className="timeline-title">
            <h2>Timeline</h2>
          </div>
           {/* Transport Controls */}
           <div className="transport-buttons">
             <button 
               onClick={() => setCurrentTime(0)}
               className="transport-btn"
               title="Go to Start"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M8 5v14l11-7z"/>
                 <path d="M6 5h2v14H6z"/>
               </svg>
             </button>
             
             <button 
               onClick={() => {
                 const newTime = Math.max(0, currentTime - 1);
                 setCurrentTime(newTime);
               }}
               className="transport-btn"
               title="Step Backward"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
               </svg>
             </button>
             
                     <button 
                           onClick={handlePlayButtonClick}
               className={`transport-btn play-btn ${isPlaying ? 'playing' : ''}`}
               title={isPlaying ? 'Pause' : 'Play'}
             >
               {isPlaying ? (
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                 </svg>
               ) : (
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M8 5v14l11-7z"/>
                 </svg>
               )}
           </button>
             
          <button 
            onClick={() => {
                 const newTime = Math.min(duration, currentTime + 1);
                 setCurrentTime(newTime);
               }}
               className="transport-btn"
               title="Step Forward"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M4 18l8.5-6L4 6v12zm10 0V6h2v12h-2z"/>
               </svg>
          </button>
             
             <button 
               onClick={() => setCurrentTime(duration)}
               className="transport-btn"
               title="Go to End"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M8 5v14l11-7z"/>
                 <path d="M16 5h2v14h-2z"/>
               </svg>
             </button>
           </div>
           
           {/* Time Display */}
           <div className="time-display">
             <span className="current-time">{formatTime(currentTime)}</span>
             <span className="time-separator">/</span>
             <span className="total-time">{formatTime(duration)}</span>
           </div>
           
           {/* Zoom Controls */}
           <div className="zoom-controls">
             <button 
               onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
               className="zoom-btn"
               title="Zoom Out"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M19 13H5v-2h14v2z"/>
               </svg>
             </button>
             
             <span className="zoom-level">{zoom.toFixed(1)}x</span>
             
             <button 
               onClick={() => setZoom(Math.min(5, zoom + 0.1))}
               className="zoom-btn"
               title="Zoom In"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
               </svg>
             </button>
           </div>
           
           {/* Timeline Duration Control */}
           <div className="duration-controls">
             <label className="duration-label">Duration:</label>
             <input
               type="number"
               min="1"
               max="3600"
               step="1"
               value={timelineDuration}
               onChange={(e) => {
                 const newDuration = Math.max(1, Math.min(3600, parseInt(e.target.value) || 60));
                 setTimelineDuration(newDuration);
               }}
               className="duration-input"
               title="Timeline duration in seconds"
             />
             <span className="duration-unit">s</span>
             <div className="duration-presets">
               <button
                 onClick={() => setTimelineDuration(30)}
                 className="duration-preset-btn"
                 title="30 seconds"
               >
                 30s
               </button>
               <button
                 onClick={() => setTimelineDuration(60)}
                 className="duration-preset-btn"
                 title="1 minute"
               >
                 1m
               </button>
               <button
                 onClick={() => setTimelineDuration(120)}
                 className="duration-preset-btn"
                 title="2 minutes"
               >
                 2m
               </button>
               <button
                 onClick={() => setTimelineDuration(300)}
                 className="duration-preset-btn"
                 title="5 minutes"
               >
                 5m
               </button>
             </div>
           </div>
           
            {/* Magnet toggle */}
            <div className="magnet-controls">
              <button
                className={`magnet-btn ${timelineSnapEnabled ? 'active' : ''}`}
                title={timelineSnapEnabled ? 'Snap: ON' : 'Snap: OFF'}
                onClick={() => setTimelineSnapEnabled(!timelineSnapEnabled)}
              >
                {/* magnet icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 12V6a3 3 0 013-3h3v4H6v5a6 6 0 0012 0V7h-3V3h3a3 3 0 013 3v6a9 9 0 01-18 0z"/>
                </svg>
              </button>
            </div>

            {/* Timeline Scrubber */}
           <div className="timeline-scrubber">
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={(e) => {
              const newTime = parseFloat(e.target.value);
              setCurrentTime(newTime);
            }}
            onMouseDown={(e) => {
              // Pause playback when starting to scrub
              if (isPlaying) {
                stopTimelinePlayback();
              }
            }}
            onMouseMove={(e) => {
              // Update time while dragging (for immediate feedback)
              if (e.buttons === 1) { // Left mouse button is pressed
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                const newTime = percentage * duration;
                setCurrentTime(newTime);
              }
            }}
            onMouseUp={(e) => {
              // Final update when drag ends
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const percentage = Math.max(0, Math.min(1, clickX / rect.width));
              const newTime = percentage * duration;
              setCurrentTime(newTime);
            }}
            className="scrubber-slider"
            style={{ 
              background: `linear-gradient(to right, #007acc 0%, #007acc ${(currentTime / duration) * 100}%, #444 ${(currentTime / duration) * 100}%, #444 100%)`
            }}
          />
           </div>
           
           {/* Action Buttons */}
           <div className="action-buttons">
             <button 
               onClick={() => {
                 const earliestTime = getEarliestClipTime();
                 if (earliestTime > 0) {
                   setCurrentTime(earliestTime);
                 }
               }}
               className="action-btn"
               title="Go to First Clip"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
               </svg>
             </button>
             
             <button 
               onClick={() => {
                 if (window.confirm(`Clear all timeline clips for the current scene?`)) {
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
               }}
               className="action-btn clear-btn"
               title="Clear Timeline"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
               </svg>
             </button>
           </div>
        </div>
      </div>

              <div className="timeline-content">
          {/* Timeline Tracks */}
          <div 
            className="timeline-scroll" 
            ref={timelineRef} 
            onScroll={handleScrollThrottled} 
            onMouseDown={handleTimelineMouseDown}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
          >
          <div className="timeline-inner" style={{ width: `${timelinePixelWidth}px` }}>
            <div className="timeline-ruler">
              {(() => {
                const start = Math.max(0, Math.floor(visibleStartSec) - 1);
                const end = Math.min(Math.ceil(duration), Math.ceil(visibleEndSec) + 1);
                const marks: number[] = [];
                for (let i = start; i <= end; i++) marks.push(i);
                return marks.map((sec) => (
                  <div key={`major-${sec}`} className="timeline-mark major-mark" style={{ left: `${sec * pixelsPerSecond}px`, width: '1px' }}>
                    <span className="timeline-label">{sec}s</span>
                  </div>
                ));
              })()}
            </div>

            <div className="timeline-tracks">
              {tracks.map((track) => (
                <div key={track.id} className="timeline-track">
                  <div className="track-header">
                    <span className="track-badge">{track.type.toUpperCase()}</span>
                    <span>{track.name}</span>
                  </div>
                  <div 
                    className="track-content"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, track.id, currentTime)}
                    onClick={(e) => handleTrackClick(e, track.id)}
                  >
                    {(() => {
                      const startWindow = Math.max(0, visibleStartSec - VISIBLE_BUFFER_SEC);
                      const endWindow = Math.min(duration, visibleEndSec + VISIBLE_BUFFER_SEC);
                      const visibleClips = track.clips.filter((clip) => {
                        const clipStart = clip.startTime;
                        const clipEnd = clip.startTime + clip.duration;
                        return clipEnd >= startWindow && clipStart <= endWindow;
                      });
                      return visibleClips.map((clip) => {
                        const isPlaying = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
                        const translateX = clip.startTime * pixelsPerSecond;
                        const widthPx = Math.max(1, clip.duration * pixelsPerSecond);
                        const background = '#1e88e5'; // filled blue, no border
                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            className={`timeline-clip ${selectedClips.has(clip.id) ? 'selected' : ''} ${isPlaying ? 'playing' : ''}`}
                            style={{
                              transform: `translate3d(${translateX}px, 0, 0)`,
                              width: `${widthPx}px`,
                              background: background,
                            }}
                            draggable
                            onDragStart={(e) => handleClipDragStart(e, clip, track.id)}
                            onDragEnd={handleClipDragEnd}
                                                      onClick={(e) => {
                            e.stopPropagation();
                            if (e.ctrlKey || e.metaKey) {
                              // Multi-select: toggle this clip
                              setSelectedClips(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(clip.id)) {
                                  newSet.delete(clip.id);
                                } else {
                                  newSet.add(clip.id);
                                }
                                return newSet;
                              });
                            } else {
                              // Single select: clear others and select this one
                              setSelectedClips(new Set([clip.id]));
                            }
                          }}
                            onContextMenu={(e) => handleClipRightClick(e, clip.id, track.id)}
                          >
                            <div
                              className="clip-handle left"
                              draggable
                              onDragStart={(ev) => {
                                ev.stopPropagation();
                                // Mark dragging this clip (reuse payload)
                                setDraggingClip({ clipId: clip.id, sourceTrackId: track.id });
                                ev.dataTransfer.setData('application/json', JSON.stringify({ type: 'timeline-clip-trim-left', clipId: clip.id, sourceTrackId: track.id }));
                                ev.dataTransfer.effectAllowed = 'move';
                              }}
                            />
                            <span className="clip-name">{clip.name}</span>
                            <div
                              className="clip-handle right"
                              draggable
                              onDragStart={(ev) => {
                                ev.stopPropagation();
                                setDraggingClip({ clipId: clip.id, sourceTrackId: track.id });
                                ev.dataTransfer.setData('application/json', JSON.stringify({ type: 'timeline-clip-trim-right', clipId: clip.id, sourceTrackId: track.id }));
                                ev.dataTransfer.effectAllowed = 'move';
                              }}
                            />
                            {clip.type === 'audio' && SHOW_AUDIO_WAVEFORM && (
                              <div style={{ position: 'absolute', left: 0, right: 0, top: 18, bottom: 6, padding: '0 2px' }}>
                                <AudioWaveform
                                  src={clip.asset?.path}
                                  width={Math.max(1, Math.floor(clip.duration * pixelsPerSecond) - 4)}
                                  height={Math.max(20, TRACK_MIN_HEIGHT - 28)}
                                  color="#4CAF50"
                                  secondaryColor="#1b5e20"
                                />
                              </div>
                            )}
                            {isPlaying && <div className="playing-indicator">▶</div>}
                          </div>
                        );
                      });
                    })()}
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
              className="timeline-playhead"
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
            />
          </div>
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
        

          </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleContextMenuClose}
          onDelete={handleDeleteClip}
        />
      )}

    </div>
  );
}; 