import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

type Props = {
  src: string;
  width: number;
  height: number;
  color?: string;
  secondaryColor?: string;
  backgroundColor?: string;
};

const AudioWaveform: React.FC<Props> = ({
  src,
  width,
  height,
  color = '#404040',
  secondaryColor = '#aaaaaa',
  backgroundColor = 'transparent',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.width = `${Math.max(1, width)}px`;
    el.style.height = `${Math.max(1, height)}px`;
    if (backgroundColor && backgroundColor !== 'transparent') el.style.background = backgroundColor;
  }, [width, height, backgroundColor]);

  useEffect(() => {
    const el = containerRef.current;
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

  return <div ref={containerRef} className="tw-bg-transparent" style={{ width, height }} />;
};

export default AudioWaveform;


