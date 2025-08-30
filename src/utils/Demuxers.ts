// Minimal demux glue. For production, prefer a robust demuxer library.

export type ChunkPusher = (chunk: { data: ArrayBuffer; timestamp: number; type: 'key'|'delta'; duration?: number }) => void;

// Experimental demuxer using WebCodecs + MediaSource to extract by segments.
// This is a pragmatic approach: append SourceBuffer segments and read back buffered ranges
// to estimate timestamps. We cannot pull raw AnnexB/OBU chunks via MSE, so this function
// acts as a no-op feeder when MSE is used. Replace with a proper demuxer (e.g., mp4box.js)
// to actually push EncodedVideoChunks.

export async function demuxWithMediaSource(url: string, push: ChunkPusher): Promise<void> {
  try {
    // Fallback: Without a true demuxer library, do nothing; pipeline will use fallbackCapture.
    // Keep the signature and control flow ready so we can swap in a real demuxer later.
    void url;
    void push;
    return;
  } catch {
    return;
  }
}

export async function demuxWithMp4box(url: string, push: ChunkPusher): Promise<void> {
  let mp4boxMod: any = null;
  try {
    mp4boxMod = await import('mp4box');
  } catch {
    // Module not available; bail out silently
    return;
  }

  try {
    const MP4Box = mp4boxMod.default || mp4boxMod;
    const file = MP4Box.createFile();
    let videoTrackId: number | null = null;
    let timescale: number = 1;
    let offset = 0;
    file.onReady = (info: any) => {
      try {
        const videoTrack = (info.tracks || []).find((t: any) => t.video);
        if (!videoTrack) return;
        videoTrackId = videoTrack.id;
        timescale = videoTrack.timescale || 1;
        try { file.setExtractionOptions(videoTrackId, null, { nbSamples: 0x7fffffff }); } catch {}
        try { file.start(); } catch {}
      } catch {}
    };
    file.onError = () => {};
    file.onSamples = (id: number, _user: any, samples: any[]) => {
      if (!videoTrackId || id !== videoTrackId) return;
      try {
        for (const s of samples) {
          const view: Uint8Array = s.data as Uint8Array;
          const data = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
          const ts = Math.round(((s.cts ?? s.dts ?? 0) / (timescale || 1)) * 1_000_000);
          const dur = s.duration !== undefined ? Math.round((s.duration / (timescale || 1)) * 1_000_000) : undefined;
          const type = s.is_sync ? 'key' as const : 'delta' as const;
          push({ data, timestamp: ts, type, duration: dur });
        }
      } catch {}
    };

    const res = await fetch(url);
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.buffer) {
        const buf = value.buffer;
        (buf as any).fileStart = offset;
        offset += value.byteLength;
        try { file.appendBuffer(buf); } catch {}
      }
    }
    try { file.flush(); } catch {}
  } catch {
    // swallow errors; pipeline will fall back
  }
}



