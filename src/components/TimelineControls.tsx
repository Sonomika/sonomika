import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { Slider } from './ui';

/**
 * TimelineControls renders transport/zoom/snap/duration/seek controls for the Timeline.
 * It communicates with the Timeline via CustomEvent("timelineCommand", { detail: {...} }).
 * It also listens to Timeline's "timelineTick", "timelinePlay", and "timelineStop" events
 * to keep local state in sync for display.
 */
const TimelineControls: React.FC = () => {
  const { timelineZoom, setTimelineZoom, timelineDuration, setTimelineDuration, timelineSnapEnabled, setTimelineSnapEnabled } = useStore() as any;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(() => {
    const d = Number(timelineDuration);
    return Number.isFinite(d) && d > 0 ? d : 60;
  });

  // Keep duration in sync from store changes
  useEffect(() => {
    const d = Number(timelineDuration);
    if (Number.isFinite(d) && d > 0) setDuration(d);
  }, [timelineDuration]);

  useEffect(() => {
    const onTick = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (detail) {
          if (typeof detail.time === 'number') setCurrentTime(detail.time);
          if (typeof detail.duration === 'number') setDuration(detail.duration);
        }
      } catch {}
    };
    const onPlay = () => setIsPlaying(true);
    const onStop = () => setIsPlaying(false);
    document.addEventListener('timelineTick', onTick as any);
    document.addEventListener('timelinePlay', onPlay as any);
    document.addEventListener('timelineStop', onStop as any);
    return () => {
      document.removeEventListener('timelineTick', onTick as any);
      document.removeEventListener('timelinePlay', onPlay as any);
      document.removeEventListener('timelineStop', onStop as any);
    };
  }, []);

  const formatTime = useMemo(() => {
    return (t: number) => {
      const total = Math.max(0, Math.floor(t || 0));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };
  }, []);

  const dispatchCommand = (type: string, value?: any) => {
    try {
      const evt = new CustomEvent('timelineCommand', { detail: { type, value } });
      document.dispatchEvent(evt);
    } catch {}
  };

  return (
    <div className="tw-flex tw-items-center tw-gap-3 tw-px-2 tw-py-1.5 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-whitespace-nowrap tw-overflow-x-auto">
      <div className="tw-flex tw-items-center tw-gap-1">
        <button
          onClick={() => dispatchCommand('goToStart')}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded tw-text-white hover:tw-bg-neutral-700"
          title="Go to Start"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/><path d="M6 5h2v14H6z"/></svg>
        </button>
        <button
          onClick={() => dispatchCommand('stepBackward', 1)}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded tw-text-white hover:tw-bg-neutral-700"
          title="Step Backward"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button
          onClick={() => dispatchCommand('playPause')}
          className={`tw-flex tw-items-center tw-justify-center tw-w-10 tw-h-10 tw-border tw-rounded tw-text-white ${isPlaying ? 'tw-bg-orange-600 hover:tw-bg-orange-500 tw-border-orange-500' : 'tw-bg-sky-600 hover:tw-bg-sky-500 tw-border-sky-500'}`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <button
          onClick={() => dispatchCommand('stepForward', 1)}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded tw-text-white hover:tw-bg-neutral-700"
          title="Step Forward"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm10 0V6h2v12h-2z"/></svg>
        </button>
        <button
          onClick={() => dispatchCommand('goToEnd')}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded tw-text-white hover:tw-bg-neutral-700"
          title="Go to End"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/><path d="M16 5h2v14h-2z"/></svg>
        </button>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2 tw-font-mono tw-text-xs tw-font-semibold tw-text-white tw-bg-black/40 tw-px-2.5 tw-py-1.5 tw-rounded tw-border tw-border-neutral-700">
        <span className="tw-text-emerald-400">{formatTime(currentTime)}</span>
        <span className="tw-text-neutral-400">/</span>
        <span className="tw-text-neutral-300">{formatTime(duration)}</span>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2 tw-bg-black/30 tw-px-2 tw-py-1.5 tw-rounded tw-border tw-border-neutral-700">
        <button
          onClick={() => setTimelineZoom(Math.max(0.1, timelineZoom - 0.1))}
          className="tw-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded-[3px] tw-text-white hover:tw-bg-neutral-700"
          title="Zoom Out"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
        </button>
        <span className="tw-text-white tw-text-xs tw-font-semibold tw-min-w-[30px] tw-text-center">{timelineZoom.toFixed(1)}x</span>
        <button
          onClick={() => setTimelineZoom(Math.min(5, timelineZoom + 0.1))}
          className="tw-flex tw-items-center tw-justify-center tw-w-7 tw-h-7 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded-[3px] tw-text-white hover:tw-bg-neutral-700"
          title="Zoom In"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2 tw-bg-black/30 tw-px-2 tw-py-1.5 tw-rounded tw-border tw-border-neutral-700">
        <label className="tw-text-neutral-300 tw-text-xs tw-font-semibold">Duration:</label>
        <input
          type="number"
          min={1}
          max={3600}
          step={1}
          value={timelineDuration}
          onChange={(e) => {
            const val = Math.max(1, Math.min(3600, parseInt(e.target.value) || 60));
            setTimelineDuration(val);
          }}
          className="tw-w-[50px] tw-h-7 tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-rounded tw-text-white tw-text-center tw-text-xs tw-font-semibold hover:tw-border-neutral-600 focus:tw-ring-1 focus:tw-ring-sky-600 focus:tw-border-sky-600"
          title="Timeline duration in seconds"
        />
        <span className="tw-text-neutral-300 tw-text-xs tw-font-semibold">s</span>
        <div className="tw-flex tw-gap-0.5">
          {[30, 60, 120, 300].map((preset) => (
            <button
              key={preset}
              onClick={() => setTimelineDuration(preset)}
              className="tw-flex tw-items-center tw-justify-center tw-w-6 tw-h-6 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded-[3px] tw-text-neutral-300 tw-text-xs tw-font-semibold hover:tw-bg-neutral-700 hover:tw-border-neutral-600 hover:tw-text-white"
              title={`${preset >= 60 ? preset/60 + 'm' : preset + 's'}`}
            >
              {preset >= 60 ? `${preset/60}m` : `${preset}s`}
            </button>
          ))}
        </div>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2 tw-bg-black/30 tw-px-2 tw-py-1.5 tw-rounded tw-border tw-border-neutral-700">
        <button
          className={`tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded tw-text-white hover:tw-bg-neutral-700 ${timelineSnapEnabled ? 'tw-bg-sky-600 tw-border-sky-500' : ''}`}
          title={timelineSnapEnabled ? 'Snap: ON' : 'Snap: OFF'}
          onClick={() => setTimelineSnapEnabled(!timelineSnapEnabled)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 12V6a3 3 0 013-3h3v4H6v5a6 6 0 0012 0V7h-3V3h3a3 3 0 013 3v6a9 9 0 01-18 0z"/></svg>
        </button>
      </div>

      <div className="tw-flex-1 tw-flex tw-items-center">
        <div className="tw-w-full tw-px-2">
          <Slider
            min={0}
            max={Math.max(1, duration)}
            step={0.01}
            value={[currentTime]}
            onValueChange={(values) => {
              if (!values || values.length === 0) return;
              const newTime = typeof values[0] === 'number' ? values[0] : Number(values[0]);
              dispatchCommand('seekToTime', newTime);
            }}
          />
        </div>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2">
        <button
          onClick={() => dispatchCommand('goToFirstClip')}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded tw-text-white hover:tw-bg-neutral-700"
          title="Go to First Clip"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button
          onClick={() => dispatchCommand('clearTimeline')}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-bg-red-700 tw-border tw-border-red-600 tw-rounded tw-text-white hover:tw-bg-red-600"
          title="Clear Timeline"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
  );
};

export default TimelineControls;


