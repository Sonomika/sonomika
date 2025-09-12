import React, { useState } from 'react';
import MoveableTimelineClip from './MoveableTimelineClip';

// Simple test component to verify MoveableTimelineClip functionality
export const TimelineTest: React.FC = () => {
  const [clips, setClips] = useState([
    {
      id: 'test-clip-1',
      startTime: 0,
      duration: 5,
      asset: { name: 'Test Video 1', type: 'video' },
      type: 'video' as const,
      name: 'Test Video 1',
      params: {}
    },
    {
      id: 'test-clip-2',
      startTime: 6,
      duration: 3,
      asset: { name: 'Test Audio 1', type: 'audio' },
      type: 'audio' as const,
      name: 'Test Audio 1',
      params: {}
    }
  ]);

  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const timelineRef = React.useRef<HTMLDivElement>(null);

  const handleClipSelect = (clipId: string, multiSelect?: boolean) => {
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
    }
  };

  const handleClipUpdate = (clipId: string, updates: any) => {
    setClips(prev => prev.map(clip => 
      clip.id === clipId ? { ...clip, ...updates } : clip
    ));
  };

  const handleClipDelete = (clipId: string) => {
    setClips(prev => prev.filter(clip => clip.id !== clipId));
    setSelectedClips(prev => {
      const newSet = new Set(prev);
      newSet.delete(clipId);
      return newSet;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, clipId: string, trackId: string) => {
    e.preventDefault();
    console.log('Context menu for clip:', clipId, 'track:', trackId);
  };

  return (
    <div className="tw-p-8 tw-bg-neutral-900 tw-text-white tw-min-h-screen">
      <h1 className="tw-text-2xl tw-font-bold tw-mb-6">Timeline Test</h1>
      
      <div className="tw-mb-4">
        <h2 className="tw-text-lg tw-font-semibold tw-mb-2">Test MoveableTimelineClip</h2>
        <p className="tw-text-sm tw-text-neutral-400 tw-mb-4">
          Try dragging and resizing the clips below. The clips should snap to grid and provide smooth visual feedback.
        </p>
      </div>

      <div 
        ref={timelineRef}
        className="tw-relative tw-bg-neutral-800 tw-border tw-border-neutral-600 tw-rounded tw-p-4 tw-min-h-[200px]"
        style={{ width: '800px' }}
      >
        {/* Timeline ruler */}
        <div className="tw-absolute tw-top-0 tw-left-0 tw-right-0 tw-h-6 tw-bg-neutral-700 tw-border-b tw-border-neutral-600">
          {Array.from({ length: 21 }, (_, i) => (
            <div
              key={i}
              className="tw-absolute tw-top-0 tw-h-full tw-w-px tw-bg-neutral-500"
              style={{ left: `${i * 40}px` }}
            />
          ))}
          {Array.from({ length: 21 }, (_, i) => (
            <div
              key={`label-${i}`}
              className="tw-absolute tw-top-1 tw-text-xs tw-text-neutral-400 tw-font-mono"
              style={{ left: `${i * 40 + 2}px` }}
            >
              {i}s
            </div>
          ))}
        </div>

        {/* Test clips */}
        <div className="tw-relative tw-mt-8">
          {clips.map((clip) => (
            <MoveableTimelineClip
              key={clip.id}
              clip={clip}
              trackId="test-track"
              trackIndex={0}
              totalTracks={1}
              pixelsPerSecond={40}
              isSelected={selectedClips.has(clip.id)}
              onSelect={handleClipSelect}
              onUpdate={handleClipUpdate}
              onDelete={handleClipDelete}
              onMoveToTrack={(clipId, fromTrack, toTrack) => console.log('Move clip', clipId, 'from', fromTrack, 'to', toTrack)}
              onContextMenu={handleContextMenu}
              timelineRef={timelineRef as React.RefObject<HTMLDivElement>}
              snapToGrid={true}
              snapThreshold={10}
            />
          ))}
        </div>
      </div>

      <div className="tw-mt-6">
        <h3 className="tw-text-md tw-font-semibold tw-mb-2">Clip Data:</h3>
        <pre className="tw-bg-neutral-800 tw-p-4 tw-rounded tw-text-xs tw-overflow-auto">
          {JSON.stringify(clips, null, 2)}
        </pre>
      </div>

      <div className="tw-mt-4">
        <h3 className="tw-text-md tw-font-semibold tw-mb-2">Selected Clips:</h3>
        <div className="tw-text-sm">
          {selectedClips.size > 0 ? Array.from(selectedClips).join(', ') : 'None'}
        </div>
      </div>
    </div>
  );
};

export default TimelineTest;
