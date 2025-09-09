import React, { useRef, useCallback, useState } from 'react';

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
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; startTime: number } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; duration: number; side: 'left' | 'right' } | null>(null);
  const [isSnapped, setIsSnapped] = useState(false);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [isVerticalDragging, setIsVerticalDragging] = useState(false);

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
    
    // Check if asset type is compatible with track type
    if (targetTrack.type === 'audio') {
      return clip.type === 'audio';
    } else if (targetTrack.type === 'video') {
      return clip.type === 'video';
    } else if (targetTrack.type === 'effect') {
      return clip.type === 'effect';
    }
    
    return false;
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
  const background = '#1e88e5';

  // Determine visual state
  const isHoveringValidTrack = hoveredTrackId && canMoveToTrack(hoveredTrackId);
  const isHoveringInvalidTrack = hoveredTrackId && !canMoveToTrack(hoveredTrackId);

  return (
    <div
      data-clip-id={clip.id}
      className={`group tw-absolute tw-top-1 tw-bottom-1 tw-rounded tw-text-white tw-overflow-hidden tw-z-20 tw-box-border tw-flex tw-items-center tw-px-2 tw-cursor-move ${
        isSelected
          ? 'tw-bg-orange-600 tw-ring-2 tw-ring-orange-400'
          : ''
      } ${isDragging ? 'tw-opacity-80' : ''} ${isResizing ? 'tw-opacity-80' : ''} ${isSnapped ? 'tw-ring-2 tw-ring-green-400' : ''} ${
        isVerticalDragging ? 'tw-cursor-ns-resize' : ''
      } ${isHoveringValidTrack ? 'tw-ring-2 tw-ring-blue-400' : ''} ${isHoveringInvalidTrack ? 'tw-ring-2 tw-ring-red-400' : ''}`}
      style={{
        transform: `translate3d(${translateX}px, 0, 0)`,
        width: `${widthPx}px`,
        background: isSelected ? undefined : background,
        willChange: 'transform,width',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Left resize handle */}
      <div
        className="tw-absolute tw-left-0 tw-top-0 tw-bottom-0 tw-w-[6px] tw-bg-white/80 tw-opacity-60 group-hover:tw-opacity-100 tw-cursor-ew-resize tw-rounded-l"
        onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
      />
      
      {/* Clip content */}
      <span className="tw-text-xs tw-whitespace-nowrap tw-overflow-hidden tw-text-ellipsis tw-pointer-events-none">
        {clip.name}
      </span>
      
      {/* Right resize handle */}
      <div
        className="tw-absolute tw-right-0 tw-top-0 tw-bottom-0 tw-w-[6px] tw-bg-white/80 tw-opacity-60 group-hover:tw-opacity-100 tw-cursor-ew-resize tw-rounded-r"
        onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
      />
    </div>
  );
};

export default SimpleTimelineClip;
