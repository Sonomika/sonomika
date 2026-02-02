import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

type Props = {
  src: string;
  width: number;
  height: number;
  color?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  mediaOffset?: number; // Offset in seconds (for trimmed start)
  clipDuration?: number; // Duration of the clip in seconds
};

const AudioWaveform: React.FC<Props> = ({
  src,
  width,
  height,
  color = '#404040',
  secondaryColor = '#aaaaaa',
  backgroundColor = 'transparent',
  mediaOffset = 0,
  clipDuration,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  // Calculate the full waveform width and offset for trimmed display
  const fullDuration = audioDuration > 0 ? audioDuration : (clipDuration || 0) + mediaOffset;
  const visibleDuration = clipDuration || fullDuration - mediaOffset;
  const pixelsPerSecond = visibleDuration > 0 ? width / visibleDuration : 0;
  const fullWidth = fullDuration > 0 && pixelsPerSecond > 0 ? fullDuration * pixelsPerSecond : width;
  const offsetPx = mediaOffset * pixelsPerSecond;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.width = `${Math.max(1, width)}px`;
    el.style.height = `${Math.max(1, height)}px`;
    if (backgroundColor && backgroundColor !== 'transparent') el.style.background = backgroundColor;
  }, [width, height, backgroundColor]);

  useEffect(() => {
    const el = waveContainerRef.current;
    if (!el) return;
    if (wavesurferRef.current) { try { wavesurferRef.current.destroy(); } catch {} wavesurferRef.current = null; }
    let destroyed = false;
    
    // Safe Electron defaults: avoid WebAudio for proprietary codecs and base64 conversion
    const isElectron = !!(window as any).electron;
    const isFileUrl = typeof src === 'string' && src.startsWith('file://');
    const isProprietary = /\.(mp3|m4a|aac|mp4)$/i.test(src || '');
    const preferMediaElement = isElectron && (isFileUrl || isProprietary);
    
    const ws = WaveSurfer.create({
      container: el,
      height: Math.max(1, height),
      waveColor: color,
      progressColor: secondaryColor || color,
      cursorWidth: 0,
      interact: false,
      normalize: true,
      backend: preferMediaElement ? 'MediaElement' : 'WebAudio',
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
    });
    wavesurferRef.current = ws;
    
    // Get audio duration when ready
    ws.on('ready', () => {
      if (!destroyed) {
        const dur = ws.getDuration();
        if (dur > 0) setAudioDuration(dur);
      }
    });
    
    const loadUrl = (u: string) => { if (!destroyed) try { ws.load(u); } catch {} };
    try {
      if (src) {
        // Always load the URL directly; let Chromium stream from disk
        // This avoids base64 conversion and WebAudio decode crashes in Electron
        loadUrl(src);
      }
    } catch {}
    return () => { destroyed = true; try { ws.destroy(); } catch {}; if (wavesurferRef.current === ws) wavesurferRef.current = null; };
  }, [src, color, secondaryColor, backgroundColor, height]);

  // Use overflow hidden to clip the waveform at the container boundaries
  return (
    <div 
      ref={containerRef} 
      className="tw-bg-transparent tw-overflow-hidden tw-relative" 
      style={{ width, height }}
    >
      <div 
        ref={waveContainerRef}
        className="tw-absolute tw-top-0"
        style={{ 
          width: Math.max(width, fullWidth),
          height,
          left: -offsetPx,
        }} 
      />
    </div>
  );
};

export default AudioWaveform;


