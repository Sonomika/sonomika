import React, { useEffect, useMemo, useRef, useState } from 'react';

interface AudioClipWaveformProps {
  src: string;
  width: number;
  height: number;
}

// Lightweight, read-only waveform renderer for timeline audio clips.
// Decodes audio using WebAudio when safe; for proprietary codecs in Electron,
// it falls back to a minimal center line to avoid crashes.
const AudioClipWaveform: React.FC<AudioClipWaveformProps> = ({ src, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<number[]>([]);

  // Colors per UI design tokens: neutral 700 border for center line, 400 for waveform
  const waveColor = '#aaaaaa'; // neutral 200–500 range used for muted text; acceptable for waveform
  const centerLineColor = '#262626'; // neutral 600/700 for borders/controls

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const sized = useMemo(() => ({ cssWidth: Math.max(1, Math.floor(width)), cssHeight: Math.max(1, Math.floor(height)) }), [width, height]);

  const draw = (values: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = sized.cssWidth;
    const cssH = sized.cssHeight;
    const displayW = Math.floor(cssW * dpr);
    const displayH = Math.floor(cssH * dpr);
    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Background is transparent; the clip container provides bg
    const centerY = cssH / 2;
    // Draw waveform bars
    if (values.length > 0) {
      const totalBars = values.length;
      const barWidth = Math.max(1, cssW / totalBars);
      ctx.fillStyle = waveColor;
      for (let i = 0; i < totalBars; i++) {
        const h = (values[i] || 0) * cssH * 0.8;
        const x = i * barWidth;
        const y = centerY - h / 2;
        ctx.fillRect(x, y, Math.max(1, barWidth - 1), Math.max(1, h));
      }
    }

    // Center baseline
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(cssW, centerY);
    ctx.stroke();
  };

  // Decode audio into a compact set of bars (2000 max) when possible
  useEffect(() => {
    let cancelled = false;
    const doWork = async () => {
      if (!src) { setBars([]); draw([]); return; }
      try {
        const L = (src || '').toLowerCase();
        const res = await fetch(src);
        if (!res.ok) throw new Error('fetch failed');
        const arr = await res.arrayBuffer();
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        const OC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
        if (!AC && !OC) { if (!cancelled) { setBars([]); draw([]); } return; }

        const decodeWith = async (CtxCtor: any, opts: any, offlineFlag: boolean) => {
          let ctx: any;
          try {
            ctx = new CtxCtor(opts);
            const p: Promise<AudioBuffer> = new Promise((resolve, reject) => {
              try {
                const req = ctx.decodeAudioData(arr, (buf: AudioBuffer) => resolve(buf), (err: any) => reject(err));
                if ((req as any)?.then) (req as any).then(resolve).catch(reject);
              } catch {
                (ctx as any).decodeAudioData(arr).then(resolve).catch(reject);
              }
            });
            const timeoutMs = offlineFlag ? 6000 : 5000;
            const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
            const result = await Promise.race([p, timeout]);
            return result as AudioBuffer | null;
          } catch {
            return null;
          } finally {
            try { await ctx?.close?.(); } catch {}
          }
        };

        // Try live decode first, then offline; supports proprietary codecs in Electron 38+
        let audioBuffer: AudioBuffer | null = null;
        if (AC) audioBuffer = await decodeWith(AC, { sampleRate: 44100 }, false);
        if (!audioBuffer && OC) audioBuffer = await decodeWith(OC, { numberOfChannels: 1, length: 1, sampleRate: 44100 }, true);
        if (!audioBuffer || cancelled) { if (!cancelled) { setBars([]); draw([]); } return; }

        // Compute bars
        const length = audioBuffer.length;
        const numChannels = audioBuffer.numberOfChannels;
        const targetBars = 1500;
        const samplesPerBar = Math.max(1, Math.floor(length / targetBars));
        const outLen = Math.min(targetBars, Math.max(1, Math.ceil(length / samplesPerBar)));
        const channels: Float32Array[] = [];
        for (let c = 0; c < numChannels; c++) channels.push(audioBuffer.getChannelData(c));
        const vals = new Array(outLen).fill(0);
        for (let i = 0; i < outLen; i++) {
          const start = i * samplesPerBar;
          const end = Math.min(length, start + samplesPerBar);
          let peak = 0;
          for (let s = start; s < end; s++) {
            let sampleAbs = 0;
            for (let c = 0; c < numChannels; c++) {
              const v = Math.abs(channels[c][s] || 0);
              if (v > sampleAbs) sampleAbs = v;
            }
            if (sampleAbs > peak) peak = sampleAbs;
          }
          vals[i] = peak;
        }
        let maxVal = 0;
        for (let i = 0; i < vals.length; i++) if (vals[i] > maxVal) maxVal = vals[i];
        const norm = maxVal > 1e-6 ? maxVal : 1;
        for (let i = 0; i < vals.length; i++) vals[i] = Math.max(0.02, Math.min(1, vals[i] / norm));

        if (!cancelled) {
          setBars(vals);
          draw(vals);
        }
      } catch {
        if (!cancelled) { setBars([]); draw([]); }
      }
    };
    doWork();
    return () => { cancelled = true; };
  }, [src]);

  // Redraw on size changes
  useEffect(() => { draw(bars); }, [bars, sized.cssWidth, sized.cssHeight]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: Math.max(1, width), height: Math.max(1, height), display: 'block' }}
      width={Math.max(1, Math.floor(width * dpr))}
      height={Math.max(1, Math.floor(height * dpr))}
    />
  );
};

export default AudioClipWaveform;


