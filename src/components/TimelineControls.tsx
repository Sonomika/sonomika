import React from 'react';
import { PlayIcon, StopIcon, Link2Icon } from '@radix-ui/react-icons';
import { useStore } from '../store/store';
// Replaced slider with +/- buttons to avoid fixed-width layout

// Minimal timeline controls: Play/Stop + Zoom slider + Magnet toggle (uses timelineCommand bridge)
const TimelineControls: React.FC = () => {
  const { timelineZoom, setTimelineZoom, timelineSnapEnabled, setTimelineSnapEnabled } = useStore() as any;
  const [isPlaying, setIsPlaying] = React.useState(false);
  React.useEffect(() => {
    const onPlay = () => setIsPlaying(true);
    const onStop = () => setIsPlaying(false);
    document.addEventListener('timelinePlay', onPlay as any);
    document.addEventListener('timelineStop', onStop as any);
    return () => {
      document.removeEventListener('timelinePlay', onPlay as any);
      document.removeEventListener('timelineStop', onStop as any);
    };
  }, []);
  const dispatchCommand = (type: string) => {
    try { document.dispatchEvent(new CustomEvent('timelineCommand', { detail: { type } })); } catch {}
  };

  return (
    <div className="tw-flex tw-items-center tw-gap-3 tw-px-2 tw-h-14 tw-py-0 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
      <button
        onClick={() => dispatchCommand('playPause')}
        className={`tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded tw-text-black ${isPlaying ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))]' : 'tw-bg-neutral-800 tw-text-white tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
        title="Play"
        aria-label="Play"
      >
        <PlayIcon className="tw-w-4 tw-h-4" />
      </button>
      <button
        onClick={() => dispatchCommand('stop')}
        className={`tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded ${!isPlaying ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black' : 'tw-bg-neutral-800 tw-border-neutral-700 tw-text-white hover:tw-bg-neutral-700'}`}
        title="Stop"
        aria-label="Stop"
      >
        <StopIcon className="tw-w-4 tw-h-4" />
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
          className={`tw-flex tw-items-center tw-justify-center tw-w-8 tw-h-8 tw-border tw-rounded ${
            timelineSnapEnabled
              ? 'tw-bg-[hsl(var(--accent))] tw-border-[hsl(var(--accent))] tw-text-black'
              : 'tw-bg-neutral-800 tw-border-neutral-700 tw-text-white hover:tw-bg-neutral-700'
          }`}
          title={timelineSnapEnabled ? 'Magnet: ON' : 'Magnet: OFF'}
          aria-label={timelineSnapEnabled ? 'Disable magnet snapping' : 'Enable magnet snapping'}
        >
          <Link2Icon className="tw-w-4 tw-h-4" />
        </button>
      </div>
    </div>
  );
};

export default TimelineControls;


