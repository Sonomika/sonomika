import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Checkbox, Label } from './ui';
import { useStore } from '../store/store';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RecordSettingsDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { recordSettings, setRecordSettings } = useStore() as any;
  const [duration, setDuration] = useState<number>(recordSettings?.durationSec ?? 5);
  // Fixed export FPS (30) – remove user control
  const [codec, setCodec] = useState<'vp8' | 'vp9'>(recordSettings?.codec ?? 'vp8');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>(recordSettings?.quality ?? 'medium');
  const [untilStop, setUntilStop] = useState<boolean>(!!recordSettings?.untilStop);

  useEffect(() => {
    if (open) {
      setDuration(recordSettings?.durationSec ?? 5);
      // no-op: fixed FPS
      setCodec(recordSettings?.codec ?? 'vp8');
      setQuality(recordSettings?.quality ?? 'medium');
      setUntilStop(!!recordSettings?.untilStop);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Settings</DialogTitle>
        </DialogHeader>
        <div className="tw-space-y-3">
          <div>
            <label className="tw-block tw-text-xs tw-text-neutral-300 tw-mb-1">Duration (seconds)</label>
            <input
              className="tw-w-full tw-bg-neutral-900 tw-text-neutral-100 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1"
              type="number"
              min={1}
              max={600}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <Checkbox
              id="untilStop"
              checked={!!untilStop}
              onCheckedChange={(v: boolean | "indeterminate") => setUntilStop(v === true)}
              aria-checked={!!untilStop}
              className="tw-border-neutral-600 data-[state=checked]:tw-bg-neutral-200 data-[state=checked]:tw-text-black"
            />
            <Label htmlFor="untilStop" className="tw-text-xs tw-text-neutral-300">Record until Stop</Label>
          </div>
          {/* FPS fixed at 30 for export */}
          <div>
            <label className="tw-block tw-text-xs tw-text-neutral-300 tw-mb-1">Codec</label>
            <select
              className="tw-w-full tw-bg-neutral-900 tw-text-neutral-100 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1"
              value={codec}
              onChange={(e) => setCodec((e.target.value as 'vp8' | 'vp9') || 'vp8')}
            >
              <option value="vp8">VP8 (WebM)</option>
              <option value="vp9">VP9 (WebM)</option>
            </select>
          </div>
          <div>
            <label className="tw-block tw-text-xs tw-text-neutral-300 tw-mb-1">Quality</label>
            <select
              className="tw-w-full tw-bg-neutral-900 tw-text-neutral-100 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1"
              value={quality}
              onChange={(e) => setQuality((e.target.value as 'low' | 'medium' | 'high') || 'medium')}
            >
              <option value="low">Low (smaller file)</option>
              <option value="medium">Medium</option>
              <option value="high">High (larger file)</option>
            </select>
          </div>
          <div className="tw-flex tw-justify-end tw-gap-2 tw-pt-2">
            <button
              className="tw-inline-flex tw-items-center tw-justify-center tw-h-8 tw-rounded tw-text-neutral-200 tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border tw-border-neutral-700 tw-px-3"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              className="tw-inline-flex tw-items-center tw-justify-center tw-h-8 tw-rounded tw-text-white tw-bg-neutral-700 hover:tw-bg-neutral-600 tw-border tw-border-neutral-600 tw-px-3"
              onClick={() => { setRecordSettings({ durationSec: duration, codec, quality, untilStop }); onOpenChange(false); }}
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
