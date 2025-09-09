import React from 'react';
import { useStore } from '../store/store';
import { Slider } from './ui';

// Minimal timeline controls: Play/Stop + Zoom slider + Magnet toggle (uses timelineCommand bridge)
const TimelineControls: React.FC = () => {
  const { timelineZoom, setTimelineZoom, timelineSnapEnabled, setTimelineSnapEnabled } = useStore() as any;
  const dispatchCommand = (type: string) => {
    try { document.dispatchEvent(new CustomEvent('timelineCommand', { detail: { type } })); } catch {}
  };

  return (
    <div className="tw-flex tw-items-center tw-gap-3 tw-px-2 tw-py-1.5 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
      <button
        onClick={() => dispatchCommand('playPause')}
        className="tw-flex tw-items-center tw-justify-center tw-w-10 tw-h-10 tw-bg-sky-600 hover:tw-bg-sky-500 tw-border tw-border-sky-500 tw-rounded tw-text-white"
        title="Play"
        aria-label="Play"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button
        onClick={() => dispatchCommand('stop')}
        className="tw-flex tw-items-center tw-justify-center tw-w-10 tw-h-10 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded tw-text-white hover:tw-bg-neutral-700"
        title="Stop"
        aria-label="Stop"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>
      </button>

      <div className="tw-flex tw-items-center tw-gap-2 tw-ml-2">
        <span className="tw-text-xs tw-text-neutral-300">Zoom</span>
        <div className="tw-w-40">
          <Slider
            min={0.05}
            max={5}
            step={0.05}
            value={[Math.max(0.05, Math.min(5, Number(timelineZoom) || 1))]}
            onValueChange={(v) => {
              const next = Array.isArray(v) ? Number(v[0]) : Number(v);
              if (isFinite(next)) try { setTimelineZoom(next); } catch {}
            }}
          />
        </div>
        <span className="tw-text-xs tw-text-neutral-400">{Number(timelineZoom || 1).toFixed(2)}x</span>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2 tw-ml-4">
        <button
          onClick={() => setTimelineSnapEnabled(!timelineSnapEnabled)}
          className={`tw-flex tw-items-center tw-justify-center tw-w-10 tw-h-10 tw-border tw-rounded tw-text-white ${
            timelineSnapEnabled
              ? 'tw-bg-green-600 tw-border-green-500 hover:tw-bg-green-500'
              : 'tw-bg-neutral-800 tw-border-neutral-700 hover:tw-bg-neutral-700'
          }`}
          title={timelineSnapEnabled ? 'Magnet: ON' : 'Magnet: OFF'}
          aria-label={timelineSnapEnabled ? 'Disable magnet snapping' : 'Enable magnet snapping'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
        <span className="tw-text-xs tw-text-neutral-300">Magnet</span>
      </div>
    </div>
  );
};

export default TimelineControls;


