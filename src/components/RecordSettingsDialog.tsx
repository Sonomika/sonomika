import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Checkbox, Label, Switch } from './ui';
import { useStore } from '../store/store';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RecordSettingsDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { recordSettings, setRecordSettings } = useStore() as any;
  const [codec, setCodec] = useState<'vp8' | 'vp9'>(recordSettings?.codec ?? 'vp9');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>(recordSettings?.quality ?? 'medium');
  const [audioSource, setAudioSource] = useState<'none' | 'microphone' | 'system' | 'app'>(recordSettings?.audioSource ?? 'none');
  const [audioBitrate, setAudioBitrate] = useState<number>(recordSettings?.audioBitrate ?? 128000);
  const [fps, setFps] = useState<30 | 60>((recordSettings?.fps as 30 | 60) ?? 60);
  const [autoStartOnPlay, setAutoStartOnPlay] = useState<boolean>(recordSettings?.autoStartOnPlay ?? true);

  useEffect(() => {
    if (open) {
      setCodec(recordSettings?.codec ?? 'vp9');
      setQuality(recordSettings?.quality ?? 'medium');
      setAudioSource(recordSettings?.audioSource ?? 'none');
      setAudioBitrate(recordSettings?.audioBitrate ?? 128000);
      setFps((recordSettings?.fps as 30 | 60) ?? 60);
      setAutoStartOnPlay(Boolean(recordSettings?.autoStartOnPlay ?? true));
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
            <label className="tw-block tw-text-xs tw-text-neutral-300 tw-mb-1">Frame Rate</label>
            <select
              className="tw-w-full tw-bg-neutral-900 tw-text-neutral-100 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1"
              value={fps}
              onChange={(e) => setFps((Number(e.target.value) as 30 | 60) || 60)}
            >
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Start recording on first Play</div>
              <div className="tw-text-xs tw-text-neutral-400">Automatically begin recording when playback starts</div>
            </div>
            <Switch checked={autoStartOnPlay} onCheckedChange={(v: boolean) => setAutoStartOnPlay(Boolean(v))} />
          </div>
          {/* FPS fixed at 30 for export */}
          <div>
            <label className="tw-block tw-text-xs tw-text-neutral-300 tw-mb-1">Codec</label>
            <select
              className="tw-w-full tw-bg-neutral-900 tw-text-neutral-100 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1"
              value={codec}
              onChange={(e) => setCodec((e.target.value as 'vp8' | 'vp9') || 'vp9')}
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
          <div>
            <label className="tw-block tw-text-xs tw-text-neutral-300 tw-mb-1">Audio Source</label>
            <select
              className="tw-w-full tw-bg-neutral-900 tw-text-neutral-100 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1"
              value={audioSource}
              onChange={(e) => setAudioSource((e.target.value as 'none' | 'microphone' | 'system' | 'app') || 'none')}
            >
              <option value="none">No Audio</option>
              <option value="microphone">Microphone</option>
              <option value="system">System Audio (Electron native)</option>
              <option value="app">App Audio (VJ internal audio)</option>
            </select>
          </div>
          {audioSource !== 'none' && (
            <div>
              <label className="tw-block tw-text-xs tw-text-neutral-300 tw-mb-1">Audio Bitrate (bps)</label>
              <select
                className="tw-w-full tw-bg-neutral-900 tw-text-neutral-100 tw-border tw-border-neutral-700 tw-rounded tw-px-2 tw-py-1"
                value={audioBitrate}
                onChange={(e) => setAudioBitrate(Number(e.target.value))}
              >
                <option value={64000}>64 kbps (low quality)</option>
                <option value={128000}>128 kbps (medium quality)</option>
                <option value={256000}>256 kbps (high quality)</option>
                <option value={320000}>320 kbps (very high quality)</option>
              </select>
            </div>
          )}
          <div className="tw-flex tw-justify-end tw-gap-2 tw-pt-2">
            <button
              className="tw-inline-flex tw-items-center tw-justify-center tw-h-8 tw-rounded tw-text-neutral-200 tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-border tw-border-neutral-700 tw-px-3"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              className="tw-inline-flex tw-items-center tw-justify-center tw-h-8 tw-rounded tw-text-white tw-bg-neutral-700 hover:tw-bg-neutral-600 tw-border tw-border-neutral-600 tw-px-3"
              onClick={() => { setRecordSettings({ codec, quality, audioSource, audioBitrate, fps, autoStartOnPlay }); onOpenChange(false); }}
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
