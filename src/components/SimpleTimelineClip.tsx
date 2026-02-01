import React, { useRef, useCallback, useState, useEffect } from 'react';
import AudioWaveform from './AudioWaveform.tsx';

interface TimelineClip {
  id: string;
  startTime: number;
  duration: number;
  asset: any;
  type: 'video' | 'effect' | 'audio';
  name: string;
  params?: any;
}

interface SimpleTimelineClipProps {
  clip: TimelineClip;
  trackId: string;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: (clipId: string, multiSelect?: boolean) => void;
  onUpdate: (clipId: string, updates: Partial<TimelineClip>) => void;
  onDelete: (clipId: string) => void;
  onMoveToTrack: (clipId: string, fromTrackId: string, toTrackId: string) => void;
  onContextMenu: (e: React.MouseEvent, clipId: string, trackId: string) => void;
  timelineRef: React.RefObject<HTMLDivElement>;
  snapToGrid?: boolean;
  snapThreshold?: number;
  allClips?: TimelineClip[];
  trackDuration?: number;
  allTracks?: Array<{ id: string; type: string; name: string }>;
  audioSrc?: string;
}

export const SimpleTimelineClip: React.FC<SimpleTimelineClipProps> = ({
  clip,
  trackId,
  pixelsPerSecond,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onMoveToTrack,
  onContextMenu,
  timelineRef,
  snapToGrid = true,
  snapThreshold = 10,
  allClips = [],
  trackDuration = 0,
  allTracks = [],
  audioSrc,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; startTime: number } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; duration: number; side: 'left' | 'right' } | null>(null);
  const [isSnapped, setIsSnapped] = useState(false);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [isVerticalDragging, setIsVerticalDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(20);

  // Track detection helper
  const getTrackAtPosition = useCallback((x: number, y: number) => {
    if (!timelineRef.current) return null;
    
    const timelineRect = timelineRef.current.getBoundingClientRect();
    const relativeY = y - timelineRect.top;
    
    // Find track elements
    const trackElements = timelineRef.current.querySelectorAll('[data-track-id]');
    
    for (const trackElement of trackElements) {
      const trackRect = trackElement.getBoundingClientRect();
      const trackTop = trackRect.top - timelineRect.top;
      const trackBottom = trackRect.bottom - timelineRect.top;
      
      if (relativeY >= trackTop && relativeY <= trackBottom) {
        const trackId = (trackElement as HTMLElement).dataset.trackId;
        return trackId || null;
      }
    }
    
    return null;
  }, [timelineRef]);

  // Check if clip can be moved to target track
  const canMoveToTrack = useCallback((targetTrackId: string) => {
    if (!targetTrackId || targetTrackId === trackId) return false;

    const targetTrack = allTracks.find(t => t.id === targetTrackId);
    if (!targetTrack) return false;

    // Align with drop rules: audio tracks accept only audio;
    // non-audio tracks (video/effect) accept both video and effect clips
    if (targetTrack.type === 'audio') {
      return clip.type === 'audio';
    }
    return clip.type === 'video' || clip.type === 'effect';
  }, [trackId, allTracks, clip.type]);

  // Snapping helper functions
  const snapToGridValue = useCallback((value: number, gridSize: number = 0.1) => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  }, [snapToGrid]);

  const snapToClips = useCallback((position: number, width: number) => {
    if (!snapToGrid || allClips.length === 0) return { left: position, snapped: false };
    
    const threshold = snapThreshold; // Use pixel threshold directly
    const currentClipId = clip.id;
    
    // Get all clips except the current one
    const otherClips = allClips.filter(c => c.id !== currentClipId);
    
    let snappedPosition = position;
    let snapped = false;
    let closestDistance = Infinity;
    
    // Snap to clip edges
    for (const otherClip of otherClips) {
      const otherStart = otherClip.startTime * pixelsPerSecond;
      const otherEnd = (otherClip.startTime + otherClip.duration) * pixelsPerSecond;
      
      // Snap to start of other clip
      const distanceToStart = Math.abs(position - otherStart);
      if (distanceToStart < threshold && distanceToStart < closestDistance) {
        snappedPosition = otherStart;
        snapped = true;
        closestDistance = distanceToStart;
      }
      
      // Snap to end of other clip
      const distanceToEnd = Math.abs(position - otherEnd);
      if (distanceToEnd < threshold && distanceToEnd < closestDistance) {
        snappedPosition = otherEnd;
        snapped = true;
        closestDistance = distanceToEnd;
      }
      
      // Snap to start of current clip (left edge)
      const distanceToStartWithWidth = Math.abs(position + width - otherStart);
      if (distanceToStartWithWidth < threshold && distanceToStartWithWidth < closestDistance) {
        snappedPosition = otherStart - width;
        snapped = true;
        closestDistance = distanceToStartWithWidth;
      }
      
      // Snap to end of current clip (right edge)
      const distanceToEndWithWidth = Math.abs(position + width - otherEnd);
      if (distanceToEndWithWidth < threshold && distanceToEndWithWidth < closestDistance) {
        snappedPosition = otherEnd - width;
        snapped = true;
        closestDistance = distanceToEndWithWidth;
      }
    }
    
    // Snap to track edges
    if (trackDuration > 0) {
      const trackEnd = trackDuration * pixelsPerSecond;
      
      // Snap to track start
      const distanceToTrackStart = Math.abs(position);
      if (distanceToTrackStart < threshold && distanceToTrackStart < closestDistance) {
        snappedPosition = 0;
        snapped = true;
        closestDistance = distanceToTrackStart;
      }
      
      // Snap to track end
      const distanceToTrackEnd = Math.abs(position + width - trackEnd);
      if (distanceToTrackEnd < threshold && distanceToTrackEnd < closestDistance) {
        snappedPosition = trackEnd - width;
        snapped = true;
        closestDistance = distanceToTrackEnd;
      }
    }
    
    // Debug logging
    if (snapped) {
      console.log('🧲 Snapped clip:', {
        clipId: clip.id,
        originalPosition: position,
        snappedPosition,
        distance: closestDistance,
        threshold,
        otherClipsCount: otherClips.length
      });
    }
    
    return { left: snappedPosition, snapped };
  }, [snapToGrid, snapThreshold, pixelsPerSecond, allClips, clip.id, trackDuration]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Mouse down on clip:', clip.id, 'snapToGrid:', snapToGrid, 'allClips:', allClips.length);
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      startTime: clip.startTime
    });
    
    onSelect(clip.id, e.ctrlKey || e.metaKey);
  }, [clip.id, clip.startTime, onSelect, snapToGrid, allClips.length]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Resize mouse down on clip:', clip.id, 'side:', side);
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      duration: clip.duration,
      side
    });
    
    onSelect(clip.id, false);
  }, [clip.id, clip.duration, onSelect]);

  // Global mouse move handler
  React.useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const element = document.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;
      if (!element) return;

      if (isDragging && dragStart) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        const deltaTime = deltaX / pixelsPerSecond;
        const newStartTime = Math.max(0, dragStart.startTime + deltaTime);
        
        // Check if we're dragging vertically (more vertical than horizontal movement)
        const isVerticalDrag = Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10;
        
        if (isVerticalDrag && !isVerticalDragging) {
          setIsVerticalDragging(true);
          console.log('🎯 Started vertical drag for clip:', clip.id);
        }
        
        if (isVerticalDragging) {
          // Handle vertical dragging - detect track changes
          const targetTrackId = getTrackAtPosition(e.clientX, e.clientY);
          if (targetTrackId && targetTrackId !== trackId) {
            setHoveredTrackId(targetTrackId);
            console.log('🎯 Hovering over track:', targetTrackId, 'can move:', canMoveToTrack(targetTrackId));
          } else {
            setHoveredTrackId(null);
          }
        } else {
          // Handle horizontal dragging - normal timeline behavior
          // Apply snapping
          const newPosition = newStartTime * pixelsPerSecond;
          const clipWidth = clip.duration * pixelsPerSecond;
          const snapped = snapToClips(newPosition, clipWidth);
          const finalStartTime = snapped.left / pixelsPerSecond;
          
          // Debug logging
          console.log('🎯 Drag update:', {
            clipId: clip.id,
            newStartTime,
            newPosition,
            clipWidth,
            snapped: snapped.snapped,
            snappedPosition: snapped.left,
            snapToGrid,
            allClipsCount: allClips.length
          });
          
          // Update snapped state for visual feedback
          setIsSnapped(snapped.snapped);
          
          // Update visual position
          element.style.transform = `translate3d(${snapped.left}px, 0, 0)`;
        }
      } else if (isResizing && resizeStart) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaTime = deltaX / pixelsPerSecond;
        
        if (resizeStart.side === 'right') {
          // Resize from right edge - change duration
          const newDuration = Math.max(0.1, resizeStart.duration + deltaTime);
          const snappedDuration = snapToGridValue(newDuration, 0.1);
          const newWidth = snappedDuration * pixelsPerSecond;
          element.style.width = `${newWidth}px`;
        } else if (resizeStart.side === 'left') {
          // Resize from left edge - change start time and duration
          const newStartTime = Math.max(0, clip.startTime + deltaTime);
          const newDuration = Math.max(0.1, clip.duration - deltaTime);
          
          // Apply snapping to start time
          const newPosition = newStartTime * pixelsPerSecond;
          const clipWidth = newDuration * pixelsPerSecond;
          const snapped = snapToClips(newPosition, clipWidth);
          const finalStartTime = snapped.left / pixelsPerSecond;
          const finalDuration = clipWidth / pixelsPerSecond;
          
          // Update snapped state for visual feedback
          setIsSnapped(snapped.snapped);
          
          element.style.transform = `translate3d(${snapped.left}px, 0, 0)`;
          element.style.width = `${clipWidth}px`;
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isDragging && dragStart) {
        if (isVerticalDragging) {
          // Handle vertical drag end - move to target track if valid
          const targetTrackId = getTrackAtPosition(e.clientX, e.clientY);
          if (targetTrackId && targetTrackId !== trackId && canMoveToTrack(targetTrackId)) {
            console.log('🎯 Moving clip to track:', targetTrackId);
            onMoveToTrack(clip.id, trackId, targetTrackId);
          }
          
          setIsVerticalDragging(false);
          setHoveredTrackId(null);
        } else {
          // Handle horizontal drag end - normal timeline behavior
          const deltaX = e.clientX - dragStart.x;
          const deltaTime = deltaX / pixelsPerSecond;
          const newStartTime = Math.max(0, dragStart.startTime + deltaTime);
          
          // Apply final snapping
          const newPosition = newStartTime * pixelsPerSecond;
          const clipWidth = clip.duration * pixelsPerSecond;
          const snapped = snapToClips(newPosition, clipWidth);
          const finalStartTime = snapped.left / pixelsPerSecond;
          
          onUpdate(clip.id, {
            startTime: snapToGridValue(finalStartTime, 0.1)
          });
        }
        
        setIsDragging(false);
        setDragStart(null);
        setIsSnapped(false);
      } else if (isResizing && resizeStart) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaTime = deltaX / pixelsPerSecond;
        
        if (resizeStart.side === 'right') {
          // Resize from right edge - change duration
          const newDuration = Math.max(0.1, resizeStart.duration + deltaTime);
          onUpdate(clip.id, {
            duration: snapToGridValue(newDuration, 0.1)
          });
        } else if (resizeStart.side === 'left') {
          // Resize from left edge - change start time and duration
          const newStartTime = Math.max(0, clip.startTime + deltaTime);
          const newDuration = Math.max(0.1, clip.duration - deltaTime);
          
          // Apply final snapping
          const newPosition = newStartTime * pixelsPerSecond;
          const clipWidth = newDuration * pixelsPerSecond;
          const snapped = snapToClips(newPosition, clipWidth);
          const finalStartTime = snapped.left / pixelsPerSecond;
          const finalDuration = clipWidth / pixelsPerSecond;
          
          onUpdate(clip.id, {
            startTime: snapToGridValue(finalStartTime, 0.1),
            duration: snapToGridValue(finalDuration, 0.1)
          });
        }
        
        setIsResizing(false);
        setResizeStart(null);
        setIsSnapped(false);
      }
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStart, isResizing, resizeStart, pixelsPerSecond, onUpdate, clip.id, clip.startTime, clip.duration, isVerticalDragging, getTrackAtPosition, canMoveToTrack, onMoveToTrack, trackId, snapToClips, snapToGridValue]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(clip.id, e.ctrlKey || e.metaKey);
  }, [clip.id, onSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, clip.id, trackId);
  }, [clip.id, trackId, onContextMenu]);

  const translateX = clip.startTime * pixelsPerSecond;
  const widthPx = Math.max(1, clip.duration * pixelsPerSecond);
  const showWaveform = clip.type === 'audio' && Boolean(audioSrc);

  // Fade indicator (timeline): show a curved line when fade in/out is active
  const getParamVal = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
  const fadeOverlay = (() => {
    try {
      const p: any = clip.params || {};
      const legacyEnabled = Boolean(getParamVal(p.fadeEnabled));
      const legacyMsRaw = getParamVal(p.fadeDurationMs ?? p.fadeDuration);
      const legacyMs = Number(legacyMsRaw);
      const legacySec = Number.isFinite(legacyMs) && legacyMs > 0 ? legacyMs / 1000 : 0;

      const inEnabledRaw = getParamVal(p.fadeInEnabled);
      const outEnabledRaw = getParamVal(p.fadeOutEnabled);
      const fadeInEnabled = (inEnabledRaw === undefined && outEnabledRaw === undefined) ? legacyEnabled : Boolean(inEnabledRaw);
      const fadeOutEnabled = (inEnabledRaw === undefined && outEnabledRaw === undefined) ? legacyEnabled : Boolean(outEnabledRaw);
      if (!fadeInEnabled && !fadeOutEnabled) return null;

      const inMsRaw = getParamVal(p.fadeInDurationMs ?? p.fadeInDuration);
      const outMsRaw = getParamVal(p.fadeOutDurationMs ?? p.fadeOutDuration);
      const inMs = Number(inMsRaw);
      const outMs = Number(outMsRaw);
      const inSec = (Number.isFinite(inMs) && inMs > 0) ? (inMs / 1000) : legacySec;
      const outSec = (Number.isFinite(outMs) && outMs > 0) ? (outMs / 1000) : legacySec;

      const dur = Math.max(0.0001, Number(clip.duration || 0.0001));

      // Draw fade curves at the START/END of the clip (anchored),
      // using the accent colour for visibility.
      const vbW = 100;
      const vbH = 16;
      const yTop = 2;
      const yBottom = vbH - 2;
      const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

      // Fade length is proportional to duration, but clamped so it remains visible
      const minLen = 6;   // %
      const maxLen = 45;  // % (avoid overlapping middle too much)
      const inLen = fadeInEnabled && inSec > 0 ? clamp((inSec / dur) * 100, minLen, maxLen) : 0;
      const outLen = fadeOutEnabled && outSec > 0 ? clamp((outSec / dur) * 100, minLen, maxLen) : 0;
      if (inLen <= 0 && outLen <= 0) return null;

      const stroke = 'hsl(var(--accent))';

      // Avoid drawing when the clip is extremely small (visual noise)
      if (widthPx < 18) return null;

      const mkCurve = (kind: 'in' | 'out', pct: number) => {
        const wPct = Math.max(0, Math.min(100, pct));
        // Convert percent-of-clip into pixels for the visual segment width.
        // Keep it visible even on short clips, but never invade too far.
        const px = Math.max(14, Math.min(Math.floor(widthPx * 0.5), Math.floor((wPct / 100) * widthPx)));
        // Straight line indicators (requested): fade-in slopes up, fade-out slopes down.
        const d = kind === 'in'
          ? `M 0 ${yBottom} L ${vbW} ${yTop}`
          : `M 0 ${yTop} L ${vbW} ${yBottom}`;
        return { px, d };
      };

      const left = inLen > 0 ? mkCurve('in', inLen) : null;
      const right = outLen > 0 ? mkCurve('out', outLen) : null;

      return (
        <>
          {left && (
            <svg
              className="tw-absolute tw-left-[6px] tw-bottom-1 tw-h-4 tw-pointer-events-none tw-z-10"
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ width: `${left.px}px` }}
            >
              <path
                d={left.d}
                stroke={stroke}
                strokeOpacity={0.9}
                strokeWidth={1.25}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {right && (
            <svg
              className="tw-absolute tw-right-[6px] tw-bottom-1 tw-h-4 tw-pointer-events-none tw-z-10"
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ width: `${right.px}px` }}
            >
              <path
                d={right.d}
                stroke={stroke}
                strokeOpacity={0.9}
                strokeWidth={1.25}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </>
      );
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      try { setContainerHeight(Math.max(12, el.clientHeight - 4)); } catch {}
    };
    measure();
    let ro: ResizeObserver | null = null;
    try {
      const RObs = (window as any).ResizeObserver as typeof ResizeObserver | undefined;
      if (RObs) {
        ro = new RObs(() => measure());
        if (ro && el) ro.observe(el);
      }
    } catch {}
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      try { if (ro && el) ro.unobserve(el); } catch {}
      try { ro && ro.disconnect && ro.disconnect(); } catch {}
    };
  }, [widthPx]);

  // Determine visual state
  const isHoveringValidTrack = hoveredTrackId && canMoveToTrack(hoveredTrackId);
  const isHoveringInvalidTrack = hoveredTrackId && !canMoveToTrack(hoveredTrackId);

  return (
    <div
      data-clip-id={clip.id}
      className={`group tw-absolute tw-top-1 tw-bottom-1 tw-rounded tw-text-white tw-overflow-hidden tw-z-20 tw-box-border tw-flex tw-items-center tw-px-2 tw-cursor-move ${
        isSelected
          ? 'tw-ring-2 tw-ring-neutral-600 tw-bg-neutral-600'
          : ''
      } ${!isSelected ? 'tw-bg-neutral-700' : ''} ${isDragging ? 'tw-opacity-80' : ''} ${isResizing ? 'tw-opacity-80' : ''} ${isSnapped ? 'tw-ring-2 tw-ring-green-400' : ''} ${
        isVerticalDragging ? 'tw-cursor-ns-resize' : ''
      } ${isHoveringValidTrack ? 'tw-ring-2 tw-ring-blue-400' : ''} ${isHoveringInvalidTrack ? 'tw-ring-2 tw-ring-red-400' : ''}`}
      style={{
        transform: `translate3d(${translateX}px, 0, 0)`,
        width: `${widthPx}px`,
        willChange: 'transform,width',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      ref={containerRef}
    >
      {/* Left resize handle */}
      <div
        className="tw-absolute tw-left-0 tw-top-0 tw-bottom-0 tw-w-[6px] tw-bg-white/80 tw-opacity-60 group-hover:tw-opacity-100 tw-cursor-ew-resize tw-rounded-l"
        onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
      />
      
      {/* Clip content */}
      {showWaveform ? (
        <div className="tw-absolute tw-inset-0 tw-pointer-events-none">
          <AudioWaveform
            src={audioSrc as string}
            width={widthPx}
            height={containerHeight}
            color="#aaaaaa"
            secondaryColor="#aaaaaa"
            backgroundColor="transparent"
          />
        </div>
      ) : (
        <span className="tw-text-xs tw-whitespace-nowrap tw-overflow-hidden tw-text-ellipsis tw-pointer-events-none">
          {clip.name}
        </span>
      )}

      {/* Fade indicator overlay (if enabled) */}
      {fadeOverlay}
      
      {/* Right resize handle */}
      <div
        className="tw-absolute tw-right-0 tw-top-0 tw-bottom-0 tw-w-[6px] tw-bg-white/80 tw-opacity-60 group-hover:tw-opacity-100 tw-cursor-ew-resize tw-rounded-r"
        onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
      />
    </div>
  );
};

export default SimpleTimelineClip;
