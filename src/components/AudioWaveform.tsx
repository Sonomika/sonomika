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
  color = '#4CAF50',
  secondaryColor = '#2e7d32',
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
    const preferMediaElement = src?.startsWith('file://') && !(window as any).electron?.readLocalFileAsBase64;
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
      if (src?.startsWith('file://')) {
        const bridge = (window as any).electron?.readLocalFileAsBase64;
        if (bridge) {
          const fp = src.replace('file://', '');
          bridge(fp).then((b64: string) => {
            let mime = 'audio/mpeg';
            const L = fp.toLowerCase();
            if (L.endsWith('.wav')) mime = 'audio/wav'; else if (L.endsWith('.ogg')) mime = 'audio/ogg'; else if (L.endsWith('.flac')) mime = 'audio/flac';
            loadUrl(`data:${mime};base64,${b64}`);
          }).catch(() => loadUrl(src));
        } else {
          loadUrl(src);
        }
      } else if (src) {
        loadUrl(src);
      }
    } catch {}
    return () => { destroyed = true; try { ws.destroy(); } catch {}; if (wavesurferRef.current === ws) wavesurferRef.current = null; };
  }, [src, color, secondaryColor, backgroundColor, height]);

  return <div ref={containerRef} className="tw-bg-transparent" style={{ width, height }} />;
};

export default AudioWaveform;


