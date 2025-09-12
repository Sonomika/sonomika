import React, { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import Moveable, { OnDrag, OnResize, OnDragStart, OnDragEnd, OnResizeStart, OnResizeEnd } from 'react-moveable';
import { throttle } from 'lodash';

interface TimelineClip {
  id: string;
  startTime: number;
  duration: number;
  asset: any;
  type: 'video' | 'effect' | 'audio';
  name: string;
  params?: any;
}

interface MoveableTimelineClipProps {
  clip: TimelineClip;
  trackId: string;
  trackIndex: number;
  totalTracks: number;
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
}

export const MoveableTimelineClip: React.FC<MoveableTimelineClipProps> = ({
  clip,
  trackId,
  trackIndex,
  totalTracks,
  pixelsPerSecond,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onMoveToTrack,
  onContextMenu,
  timelineRef,
  snapToGrid = true,
  snapThreshold = 10
}) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Throttled update function to prevent excessive re-renders
  const throttledUpdate = useMemo(
    () => throttle((updates: Partial<TimelineClip>) => {
      onUpdate(clip.id, updates);
    }, 16), // ~60fps
    [clip.id, onUpdate]
  );

  // Snap to grid helper
  const snapToGridValue = useCallback((value: number, gridSize: number = 1) => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  }, [snapToGrid]);

  // Snap to other clips helper
  const snapToClips = useCallback((left: number, width: number) => {
    if (!timelineRef.current) return { left, width };
    
    const timelineRect = timelineRef.current.getBoundingClientRect();
    const clipElements = timelineRef.current.querySelectorAll('[data-clip-id]');
    
    let snappedLeft = left;
    let snappedWidth = width;
    
    clipElements.forEach(element => {
      const clipElement = element as HTMLElement;
      const clipId = clipElement.dataset.clipId;
      if (clipId === clip.id) return; // Skip self
      
      const clipRect = clipElement.getBoundingClientRect();
      const clipLeft = clipRect.left - timelineRect.left;
      const clipRight = clipLeft + clipRect.width;
      
      // Snap left edge to other clips
      if (Math.abs(left - clipLeft) < snapThreshold) {
        snappedLeft = clipLeft;
      }
      if (Math.abs(left - clipRight) < snapThreshold) {
        snappedLeft = clipRight;
      }
      
      // Snap right edge to other clips
      const right = left + width;
      if (Math.abs(right - clipLeft) < snapThreshold) {
        snappedWidth = clipLeft - left;
      }
      if (Math.abs(right - clipRight) < snapThreshold) {
        snappedWidth = clipRight - left;
      }
    });
    
    return { left: snappedLeft, width: snappedWidth };
  }, [clip.id, snapThreshold, timelineRef]);

  // Handle drag start
  const handleDragStart = useCallback((e: OnDragStart) => {
    console.log('Drag start for clip:', clip.id);
    setIsDragging(true);
    onSelect(clip.id, false);
  }, [clip.id, onSelect]);

  // Handle drag
  const handleDrag = useCallback((e: OnDrag) => {
    console.log('Dragging clip:', clip.id, 'left:', e.left);
    const { left, top } = e;
    
    // For now, only handle horizontal movement (timing)
    // Vertical movement will be handled separately
    const newStartTime = Math.max(0, left / pixelsPerSecond);
    
    // Apply snapping
    const snapped = snapToClips(left, (clip.duration * pixelsPerSecond));
    const snappedStartTime = Math.max(0, snapped.left / pixelsPerSecond);
    
    throttledUpdate({
      startTime: snapToGridValue(snappedStartTime, 0.1) // Snap to 0.1 second intervals
    });
    
    // Update visual position immediately
    if (targetRef.current) {
      targetRef.current.style.transform = `translate3d(${snapped.left}px, 0, 0)`;
    }
  }, [clip.duration, pixelsPerSecond, snapToClips, snapToGridValue, throttledUpdate]);

  // Handle drag end
  const handleDragEnd = useCallback((e: OnDragEnd) => {
    setIsDragging(false);
    
    // Final update with snapped position
    if (targetRef.current) {
      const rect = targetRef.current.getBoundingClientRect();
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (timelineRect) {
        const left = rect.left - timelineRect.left;
        const newStartTime = Math.max(0, left / pixelsPerSecond);
        
        onUpdate(clip.id, {
          startTime: snapToGridValue(newStartTime, 0.1)
        });
      }
    }
  }, [clip.id, onUpdate, snapToGridValue, timelineRef]);

  // Handle resize start
  const handleResizeStart = useCallback((e: OnResizeStart) => {
    setIsResizing(true);
    onSelect(clip.id, false);
  }, [clip.id, onSelect]);

  // Handle resize
  const handleResize = useCallback((e: OnResize) => {
    const { width } = e;
    const newDuration = Math.max(0.1, width / pixelsPerSecond); // Minimum 0.1 second duration
    
    // Apply snapping
    const snapped = snapToClips(clip.startTime * pixelsPerSecond, width);
    const snappedDuration = Math.max(0.1, snapped.width / pixelsPerSecond);
    
    throttledUpdate({
      duration: snapToGridValue(snappedDuration, 0.1)
    });
    
    // Update visual width immediately
    if (targetRef.current) {
      targetRef.current.style.width = `${snapped.width}px`;
    }
  }, [clip.startTime, pixelsPerSecond, snapToClips, snapToGridValue, throttledUpdate]);

  // Handle resize end
  const handleResizeEnd = useCallback((e: OnResizeEnd) => {
    setIsResizing(false);
    
    // Final update with snapped dimensions
    if (targetRef.current) {
      const rect = targetRef.current.getBoundingClientRect();
      const newDuration = Math.max(0.1, rect.width / pixelsPerSecond);
      onUpdate(clip.id, {
        duration: snapToGridValue(newDuration, 0.1)
      });
    }
  }, [clip.id, onUpdate, pixelsPerSecond, snapToGridValue]);

  // Update moveable when clip properties change
  useEffect(() => {
    if (moveableRef.current && targetRef.current) {
      moveableRef.current.updateRect();
    }
  }, [clip.startTime, clip.duration, pixelsPerSecond]);

  // Debug: Log when target ref changes
  useEffect(() => {
    console.log('MoveableTimelineClip target ref:', targetRef.current);
  }, [targetRef.current]);

  // Handle click
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(clip.id, e.ctrlKey || e.metaKey);
  }, [clip.id, onSelect]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, clip.id, trackId);
  }, [clip.id, trackId, onContextMenu]);

  const translateX = clip.startTime * pixelsPerSecond;
  const widthPx = Math.max(1, clip.duration * pixelsPerSecond);
  const background = '#1e88e5';

  return (
    <>
      <div
        ref={targetRef}
        data-clip-id={clip.id}
        className={`group tw-absolute tw-top-1 tw-bottom-1 tw-rounded tw-text-white tw-overflow-hidden tw-z-20 tw-box-border tw-flex tw-items-center tw-px-2 tw-cursor-move ${
          isSelected
            ? 'tw-bg-orange-600 tw-ring-2 tw-ring-orange-400'
            : ''
        } ${isDragging ? 'tw-opacity-80' : ''} ${isResizing ? 'tw-opacity-80' : ''}`}
        style={{
          transform: `translate3d(${translateX}px, 0, 0)`,
          width: `${widthPx}px`,
          background: isSelected ? undefined : background,
          willChange: 'transform,width',
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Left resize handle */}
        <div
          className="tw-absolute tw-left-0 tw-top-0 tw-bottom-0 tw-w-[6px] tw-bg-white/80 tw-opacity-60 group-hover:tw-opacity-100 tw-cursor-ew-resize tw-rounded-l"
        />
        
        {/* Clip content */}
        <span className="tw-text-xs tw-whitespace-nowrap tw-overflow-hidden tw-text-ellipsis tw-pointer-events-none">
          {clip.name}
        </span>
        
        {/* Right resize handle */}
        <div
          className="tw-absolute tw-right-0 tw-top-0 tw-bottom-0 tw-w-[6px] tw-bg-white/80 tw-opacity-60 group-hover:tw-opacity-100 tw-cursor-ew-resize tw-rounded-r"
        />
      </div>

      {/* Moveable component */}
      <Moveable
        ref={moveableRef}
        target={targetRef.current}
        container={timelineRef.current}
        draggable={true}
        resizable={true}
        throttleDrag={0}
        throttleResize={0}
        renderDirections={isSelected ? ['w', 'e'] : []}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
        // Visual feedback
        dragArea={true}
        // Only allow horizontal dragging for now
        // Snap settings
        snapContainer={timelineRef.current}
        snapGap={true}
        snapThreshold={snapThreshold}
        // Styling
        className="timeline-moveable"
      />
    </>
  );
};

export default MoveableTimelineClip;
