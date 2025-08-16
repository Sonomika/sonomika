import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface AudioWaveformProps {
  src: string;
  width: number;
  height: number;
  color?: string;
  secondaryColor?: string;
  backgroundColor?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  src,
  width,
  height,
  color = '#4CAF50',
  secondaryColor = '#2e7d32',
  backgroundColor = 'transparent',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  // Resize container without recreating WaveSurfer to avoid heavy decodes on zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.width = `${Math.max(1, width)}px`;
    container.style.height = `${Math.max(1, height)}px`;
    if (backgroundColor && backgroundColor !== 'transparent') {
      container.style.background = backgroundColor;
    }
  }, [width, height, backgroundColor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Resize container to desired dimensions
    container.style.width = `${Math.max(1, width)}px`;
    container.style.height = `${Math.max(1, height)}px`;
    if (backgroundColor && backgroundColor !== 'transparent') {
      container.style.background = backgroundColor;
    }

    // Clean up any existing instance
    if (wavesurferRef.current) {
      try { wavesurferRef.current.destroy(); } catch {}
      wavesurferRef.current = null;
    }

    // Choose backend dynamically to avoid fetch() for file URLs when preload bridge is unavailable
    const preferMediaElement = src.startsWith('file://') && !(window as any).electron?.readLocalFileAsBase64;

    // Create new WaveSurfer instance
    const ws = WaveSurfer.create({
      container,
      height: Math.max(1, height),
      waveColor: color,
      progressColor: color,
      cursorWidth: 0,
      interact: false,
      normalize: true,
      backend: preferMediaElement ? 'MediaElement' : 'WebAudio',
      responsive: false,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      partialRender: true,
    });
    wavesurferRef.current = ws;

    try {
      if (src.startsWith('file://')) {
        const bridge = (window as any).electron?.readLocalFileAsBase64;
        if (bridge) {
          const filePath = src.replace('file://', '');
          bridge(filePath)
            .then((base64: string) => {
              let mime = 'audio/mpeg';
              const lower = filePath.toLowerCase();
              if (lower.endsWith('.wav')) mime = 'audio/wav';
              else if (lower.endsWith('.ogg')) mime = 'audio/ogg';
              else if (lower.endsWith('.flac')) mime = 'audio/flac';
              const dataUrl = `data:${mime};base64,${base64}`;
              try { ws.load(dataUrl); } catch {}
            })
            .catch(() => {
              try { ws.load(src); } catch {}
            });
        } else {
          // No bridge: rely on MediaElement backend with the original file URL
          ws.load(src);
        }
      } else {
        ws.load(src);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('WaveSurfer load failed for', src, e);
    }

    return () => {
      try { ws.destroy(); } catch {}
      if (wavesurferRef.current === ws) {
        wavesurferRef.current = null;
      }
    };
    // Recreate when src or color changes only (avoid heavy work on zoom)
  }, [src, color, backgroundColor]);

  return <div ref={containerRef} className="tw-bg-transparent" style={{ width, height }} />;
};

export default AudioWaveform;


