import React from 'react';

// Minimal timeline controls: Play and Stop only (uses timelineCommand bridge)
const TimelineControls: React.FC = () => {
  const dispatchCommand = (type: string) => {
    try { document.dispatchEvent(new CustomEvent('timelineCommand', { detail: { type } })); } catch {}
  };

  return (
    <div className="tw-flex tw-items-center tw-gap-2 tw-px-2 tw-py-1.5 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
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
    </div>
  );
};

export default TimelineControls;


