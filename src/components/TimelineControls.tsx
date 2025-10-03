import React from 'react';
import { useStore } from '../store/store';
// Replaced slider with +/- buttons to avoid fixed-width layout

// Minimal timeline controls: Play/Stop + Zoom slider + Magnet toggle (uses timelineCommand bridge)
const TimelineControls: React.FC = () => {
  const { timelineZoom, setTimelineZoom, timelineSnapEnabled, setTimelineSnapEnabled } = useStore() as any;
  const [isPlaying, setIsPlaying] = React.useState(false);
  React.useEffect(() => {
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onStop = () => setIsPlaying(false);
    document.addEventListener('globalPlay', onPlay as any);
    document.addEventListener('globalPause', onPause as any);
    document.addEventListener('globalStop', onStop as any);
    return () => {
      document.removeEventListener('globalPlay', onPlay as any);
      document.removeEventListener('globalPause', onPause as any);
      document.removeEventListener('globalStop', onStop as any);
    };
  }, []);
  const dispatchCommand = (type: string) => {
    try { document.dispatchEvent(new CustomEvent('timelineCommand', { detail: { type } })); } catch {}
  };

  return (
    <div className="tw-flex tw-items-center tw-gap-3 tw-px-2 tw-py-1.5 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
      <button
        onClick={() => dispatchCommand('playPause')}
        className={`tw-flex tw-items-center tw-justify-center tw-w-10 tw-h-10 tw-border tw-rounded tw-text-black ${isPlaying ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))]' : 'tw-bg-neutral-800 tw-text-white tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
        title="Play"
        aria-label="Play"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button
        onClick={() => dispatchCommand('stop')}
        className={`tw-flex tw-items-center tw-justify-center tw-w-10 tw-h-10 tw-border tw-rounded ${!isPlaying ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 tw-border-neutral-700 tw-text-white hover:tw-bg-neutral-700'}`}
        title="Stop"
        aria-label="Stop"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>
      </button>

      <div className="tw-flex tw-items-center tw-gap-2 tw-ml-2">
        <button
          onClick={() => {
            const z = Number(timelineZoom) || 1;
            const next = Math.max(0.05, Math.min(5, z / 1.25));
            try { setTimelineZoom(next); } catch {}
          }}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded tw-bg-neutral-800 tw-border-neutral-700 tw-text-white hover:tw-bg-neutral-700"
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => {
            const z = Number(timelineZoom) || 1;
            const next = Math.max(0.05, Math.min(5, z * 1.25));
            try { setTimelineZoom(next); } catch {}
          }}
          className="tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded tw-bg-neutral-800 tw-border-neutral-700 tw-text-white hover:tw-bg-neutral-700"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2 tw-ml-4">
        <button
          onClick={() => setTimelineSnapEnabled(!timelineSnapEnabled)}
          className={`tw-flex tw-items-center tw-justify-center tw-w-12 tw-h-12 tw-border tw-rounded ${
            timelineSnapEnabled
              ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black'
              : 'tw-bg-neutral-800 tw-border-neutral-700 tw-text-white hover:tw-bg-neutral-700'
          }`}
          title={timelineSnapEnabled ? 'Magnet: ON' : 'Magnet: OFF'}
          aria-label={timelineSnapEnabled ? 'Disable magnet snapping' : 'Enable magnet snapping'}
        >
          {/* Link icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3.9 12a4.1 4.1 0 0 1 4.1-4.1h3a1 1 0 1 1 0 2h-3A2.1 2.1 0 0 0 5.9 12a2.1 2.1 0 0 0 2.1 2.1h3a1 1 0 1 1 0 2h-3A4.1 4.1 0 0 1 3.9 12zm7-1h2.2a1 1 0 1 1 0 2H10.9a1 1 0 1 1 0-2zM12 7h3a4.1 4.1 0 1 1 0 8h-3a1 1 0 1 1 0-2h3a2.1 2.1 0 1 0 0-4h-3a1 1 0 1 1 0-2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TimelineControls;


