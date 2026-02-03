import { VIDEO_CONFIG, LOOP_MODES } from '../constants/video';
import type { VideoLayer } from '../types/layer';

interface LoopState {
  isReversing: boolean;
  loopCount: number;
  frameInterval: NodeJS.Timeout | null;
  lastBoundary: 'start' | 'end' | null;
  lastMode: string | null;
  // Random mode timing:
  // - lastRandomJumpAtMs tracks the last COMPLETED random seek (seeked fired)
  // - pendingRandomJump indicates a seek is in flight that we initiated
  lastRandomJumpAtMs: number;
  lastDebugAtMs: number;
  lastSeekBlockedSinceMs: number;
  pendingRandomJump: boolean;
  pendingRandomJumpStartedAtMs: number;
  dynamicMinRandomIntervalMs: number;
  lastRandomSeekMs: number;
  lastUserIntervalMs: number;
}

export class VideoLoopManager {
  private static loopStates = new Map<string, LoopState>();
  private static readonly RANDOM_JUMP_INTERVAL_MS = 500;
  private static readonly MAX_LOOP_STATES = 100; // Prevent unbounded growth

  private static randomSpeedToIntervalMs(speed: any): number | null {
    const s = String(speed || '').toLowerCase();
    switch (s) {
      case 'slow': return 2000;
      case 'medium': return 1000;
      case 'fast': return 500;
      case 'insane': return 250;
      default: return null;
    }
  }

  private static isPreviewDebugEnabled(): boolean {
    try {
      const g: any = globalThis as any;
      if (g && g.__VJ_PREVIEW_DEBUG === true) return true;
      const ls = g?.localStorage;
      if (!ls) return false;
      const v = String(ls.getItem('VJ_PREVIEW_DEBUG') || '').trim();
      return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'on';
    } catch {
      return false;
    }
  }

  private static emitPreviewDebug(msg: string) {
    try {
      if (!this.isPreviewDebugEnabled()) return;
      (globalThis as any).dispatchEvent?.(new CustomEvent('vjDebug', { detail: { msg } }));
    } catch {}
  }

  private static getRandomJumpIntervalMs(layer: VideoLayer): number {
    try {
      const fromSpeed = this.randomSpeedToIntervalMs((layer as any)?.randomSpeed);
      if (fromSpeed && Number.isFinite(fromSpeed) && fromSpeed > 0) {
        return Math.max(50, Math.floor(fromSpeed));
      }
      const raw = Number((layer as any)?.randomBpm);
      const bpm = Number.isFinite(raw) && raw > 0 ? raw : NaN;
      if (Number.isFinite(bpm)) {
        const clamped = Math.max(1, Math.min(500, bpm));
        return Math.max(50, Math.floor(60000 / clamped));
      }
    } catch {}
    return VideoLoopManager.RANDOM_JUMP_INTERVAL_MS;
  }

  private static pickRandomTime(duration: number): number {
    const d = Number(duration || 0);
    if (!(d > 0)) return 0;
    // Keep away from absolute edges to avoid decode stalls
    const pad = Math.min(Math.max(0.05, VIDEO_CONFIG.LOOP_THRESHOLD), Math.max(0, d / 20));
    const min = Math.min(d, pad);
    const max = Math.max(min, d - pad);
    return min + Math.random() * Math.max(0, max - min);
  }

  /**
   * Handle video loop mode logic
   */
  static handleLoopMode(
    video: HTMLVideoElement, 
    layer: VideoLayer, 
    layerId: string
  ): void {
    const currentTime = video.currentTime;
    const duration = video.duration;
    
    if (!duration) return;

    const state = this.getOrCreateLoopState(layerId);

    // Reset state when mode changes (prevents stale reverse intervals)
    const mode = String(layer.loopMode || LOOP_MODES.NONE);
    if (state.lastMode !== mode) {
      state.lastMode = mode;
      state.isReversing = false;
      state.lastBoundary = null;
      this.cleanupInterval(state);
      // Make Random immediately obvious on mode switch
      if (mode === LOOP_MODES.RANDOM) {
        state.lastRandomJumpAtMs = Date.now();
        state.lastSeekBlockedSinceMs = 0;
        try {
          const raw = Number((layer as any)?.randomBpm);
          const bpm = Number.isFinite(raw) && raw > 0 ? raw : NaN;
          const intervalMs = this.getRandomJumpIntervalMs(layer);
          const speed = String((layer as any)?.randomSpeed || '').trim();
          const speedLabel = speed ? speed : 'custom';
          this.emitPreviewDebug(`🎛️ [Random] enabled layer=${String(layerId)} speed=${speedLabel} bpm=${Number.isFinite(bpm) ? bpm : 'default'} interval=${intervalMs}ms`);
        } catch {}
        try {
          video.currentTime = this.pickRandomTime(duration);
        } catch {}
        try {
          const p = video.play();
          if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {});
        } catch {}
      }
    }

    // Clear boundary latch once we've moved away from edges
    if (
      state.lastBoundary &&
      currentTime > VIDEO_CONFIG.LOOP_THRESHOLD * 2 &&
      currentTime < duration - VIDEO_CONFIG.LOOP_THRESHOLD * 2
    ) {
      state.lastBoundary = null;
    }
    
    // Handle different loop modes
    switch (layer.loopMode) {
      case LOOP_MODES.NONE:
        this.handleNoneMode(video, layer, state);
        break;
        
      case LOOP_MODES.LOOP:
        this.handleLoopModeInternal(video, layer, state, currentTime, duration);
        break;
        
      case LOOP_MODES.REVERSE:
        this.handleReverseMode(video, layer, state, currentTime, duration);
        break;
        
      case LOOP_MODES.PING_PONG:
        this.handlePingPongMode(video, layer, state, currentTime, duration);
        break;

      case LOOP_MODES.RANDOM:
        this.handleRandomMode(video, layer, state, currentTime, duration);
        break;
    }

    // Debug logging
    this.logDebugInfo(layer, currentTime, duration, state);
  }

    /**
   * Handle 'none' loop mode - no looping
   */
  private static handleNoneMode(
    _video: HTMLVideoElement,
    _layer: VideoLayer,
    state: LoopState
  ): void {
    // No action needed - video will stop naturally
    this.cleanupInterval(state);
  }

  /**
   * Handle 'loop' mode - restart from beginning
   */
  private static handleLoopModeInternal(
    video: HTMLVideoElement,
    layer: VideoLayer,
    state: LoopState,
    currentTime: number,
    duration: number
  ): void {
    if (state.isReversing) {
      // If we were reversing previously, stop it and resume forward playback
      state.isReversing = false;
      this.cleanupInterval(state);
      try { void video.play(); } catch {}
      return;
    }
    if (currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD && state.lastBoundary !== 'end') {
      state.lastBoundary = 'end';
      // console.log('🎬 LOOP MODE: Restarting video:', layer.name);
      this.cleanupInterval(state);
      video.currentTime = 0;
      video.play().catch((error: any) => {
        console.error('🎬 Failed to restart video:', layer.name, error);
      });
    }
  }

  /**
   * Handle 'reverse' mode - play backwards
   */
  private static handleReverseMode(
    video: HTMLVideoElement,
    layer: VideoLayer,
    state: LoopState,
    _currentTime: number,
    duration: number
  ): void {
    // Continuous reverse looping (Resolume-style): wrap to end when reaching start
    if (!state.isReversing) {
      state.isReversing = true;
      // If we're at/near start, begin from end for a predictable start
      if (video.currentTime <= VIDEO_CONFIG.LOOP_THRESHOLD) {
        try { video.currentTime = Math.max(0, duration - VIDEO_CONFIG.LOOP_THRESHOLD); } catch {}
      }
      this.startReversePlayback(video, layer, state, { duration, afterComplete: 'reverse' });
    }
  }

  /**
   * Handle 'ping-pong' mode - forward then backward
   */
  private static handlePingPongMode(
    video: HTMLVideoElement,
    layer: VideoLayer,
    state: LoopState,
    currentTime: number,
    duration: number
  ): void {
    if (state.isReversing) return;
    if (currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD && state.lastBoundary !== 'end') {
      state.lastBoundary = 'end';
      // console.log('🎬 PING-PONG MODE: Starting reverse phase:', layer.name);
      state.isReversing = true;
      this.startReversePlayback(video, layer, state, { duration, afterComplete: 'forward' });
    }
  }

  /**
   * Handle 'random' mode - jump to random time periodically (BPM-driven)
   * Note: This does NOT call play() - the caller controls whether the video plays or stays paused.
   * Timeline mode keeps video paused and samples frames via seeks.
   * Column mode can call play() separately if needed.
   */
  private static handleRandomMode(
    video: HTMLVideoElement,
    layer: VideoLayer,
    state: LoopState,
    currentTime: number,
    duration: number
  ): void {
    if (state.isReversing) {
      state.isReversing = false;
      this.cleanupInterval(state);
    }

    // If the user adjusts Random BPM, apply immediately by resetting adaptive backoff.
    // Otherwise, a single slow seek can raise `dynamicMinRandomIntervalMs` and make the slider
    // feel "stuck" until refresh.
    const userIntervalMsNow = this.getRandomJumpIntervalMs(layer);
    try {
      const prev = Number(state.lastUserIntervalMs || 0) || 0;
      const changed =
        prev <= 0 ||
        Math.abs(userIntervalMsNow - prev) >= 25 ||
        (prev > 0 && Math.abs(userIntervalMsNow - prev) / prev >= 0.05);
      if (changed && !state.pendingRandomJump) {
        state.dynamicMinRandomIntervalMs = 0;
        state.lastRandomSeekMs = 0;
        state.lastSeekBlockedSinceMs = 0;
        // Allow the new interval to take effect without waiting a full old interval.
        state.lastRandomJumpAtMs = 0;
        this.emitPreviewDebug(
          `🎚️ [Random] user interval change layer=${String((layer as any)?.id || '')} ${prev || '?'}ms -> ${userIntervalMsNow}ms (reset backoff)`
        );
      }
      state.lastUserIntervalMs = userIntervalMsNow;
    } catch {}

    // Optional: double-buffered Random (pre-seek an alternate <video>, then swap).
    // This avoids stalling the currently displayed video texture during seeks.
    try {
      const anyLayer: any = layer as any;
      const altVideo: HTMLVideoElement | null = anyLayer?.__vjRandomAltVideo || null;
      const swapFn: any = anyLayer?.__vjRandomSwap;
      const usePrefetchSwap = Boolean(anyLayer?.__vjRandomPrefetch) && !!altVideo && typeof swapFn === 'function';
      if (usePrefetchSwap) {
        // Avoid overlapping prefetch seeks
        try {
          if (state.pendingRandomJump) return;
          if ((altVideo as any).seeking) return;
        } catch {}

        const now = Date.now();
        const userIntervalMs = userIntervalMsNow;
        const effectiveIntervalMs = Math.max(userIntervalMsNow, Number(state.dynamicMinRandomIntervalMs || 0) || 0);
        const intervalElapsed = now - (state.lastRandomJumpAtMs || 0) >= effectiveIntervalMs;
        const atEnd = currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD && state.lastBoundary !== 'end';
        if (atEnd) state.lastBoundary = 'end';
        if (!(atEnd || intervalElapsed)) return;

        const target = this.pickRandomTime(duration);
        const dbg = this.isPreviewDebugEnabled();
        const t0 = dbg && typeof (globalThis as any).performance?.now === 'function'
          ? Number((globalThis as any).performance.now())
          : 0;

        state.pendingRandomJump = true;
        state.pendingRandomJumpStartedAtMs = now;

        // Prime decoder on alt
        try {
          (altVideo as any).muted = true;
          (altVideo as any).playsInline = true;
          (altVideo as any).preload = 'auto';
          const p = altVideo.play();
          if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {});
        } catch {}

        const onSeeked = () => {
          // After seek, wait (briefly) for an actual decoded frame before swapping.
          // In some builds/codecs, `seeked` can fire while `readyState` is still low,
          // which makes the swap look like it "didn't happen" or shows stale/black frames.
          const completedAt = Date.now();
          const t1 = typeof (globalThis as any).performance?.now === 'function'
            ? Number((globalThis as any).performance.now())
            : 0;
          const dt = (t0 && t1) ? Math.max(0, Math.round(t1 - t0)) : Math.max(0, completedAt - now);
          state.lastRandomSeekMs = dt;

          // Backoff like the single-buffer path
          const suggested = Math.min(5000, Math.max(250, Math.round(dt * 1.25)));
          const prevMin = Number(state.dynamicMinRandomIntervalMs || 0) || 0;
          if (suggested > prevMin + 40) {
            state.dynamicMinRandomIntervalMs = suggested;
            this.emitPreviewDebug(
              `🛑 [Random] backoff layer=${String((layer as any)?.id || '')} seek=${dt}ms minInterval=${suggested}ms (user=${userIntervalMs}ms)`
            );
          }

          const doSwap = (waitedMs: number) => {
            state.lastRandomJumpAtMs = Date.now();
            state.pendingRandomJump = false;
            state.pendingRandomJumpStartedAtMs = 0;
            try {
              const res = swapFn(altVideo);
              const next: any = (res && (res.active || res.video)) || null;
              if (next && typeof next.play === 'function') {
                try {
                  const p2 = next.play();
                  if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
                } catch {}
              }
            } catch {}
            if (dbg) {
              this.emitPreviewDebug(
                `🎲 [Random] swap-jump layer=${String((layer as any)?.id || '')} -> ${Number(target).toFixed(3)}s (seek ${dt}ms, wait ${waitedMs}ms)`
              );
            }
          };

          // Prefer RVFC if available; otherwise fall back to a short poll/timeout.
          const anyAlt: any = altVideo as any;
          const startWait = Date.now();
          const maxWaitMs = 220;
          try {
            if (typeof anyAlt.requestVideoFrameCallback === 'function') {
              let done = false;
              const timeout = setTimeout(() => {
                if (done) return;
                done = true;
                doSwap(Math.max(0, Date.now() - startWait));
              }, maxWaitMs) as any;
              anyAlt.requestVideoFrameCallback(() => {
                if (done) return;
                done = true;
                try { clearTimeout(timeout); } catch {}
                doSwap(Math.max(0, Date.now() - startWait));
              });
              return;
            }
          } catch {}

          // No RVFC: swap once readyState looks usable or after timeout.
          const tick = () => {
            const waited = Math.max(0, Date.now() - startWait);
            let ok = false;
            try { ok = (altVideo.readyState >= 2) && (altVideo.videoWidth > 0) && (altVideo.videoHeight > 0); } catch {}
            if (ok || waited >= maxWaitMs) {
              doSwap(waited);
              return;
            }
            try { requestAnimationFrame(tick); } catch { doSwap(waited); }
          };
          try { requestAnimationFrame(tick); } catch { doSwap(0); }
        };

        try { altVideo.addEventListener('seeked', onSeeked, { once: true } as any); } catch {}
        try {
          const anyAlt: any = altVideo as any;
          if (typeof anyAlt.fastSeek === 'function') anyAlt.fastSeek(target);
          else altVideo.currentTime = target;
        } catch {
          try { altVideo.removeEventListener('seeked', onSeeked as any); } catch {}
          state.pendingRandomJump = false;
          state.pendingRandomJumpStartedAtMs = 0;
        }
        return;
      }
    } catch {}

    // Avoid stacking seeks. Packaged builds can decode/seek slower (disk IO + codec),
    // and overlapping `currentTime` updates cause visible stutter/lag.
    try {
      if ((video as any).seeking) {
        // Throttle debug spam
        const nowMs = Date.now();
        if (!state.lastSeekBlockedSinceMs) state.lastSeekBlockedSinceMs = nowMs;
        if (nowMs - (state.lastDebugAtMs || 0) > 350) {
          state.lastDebugAtMs = nowMs;
          const blockedFor = Math.max(0, nowMs - (state.lastSeekBlockedSinceMs || nowMs));
          this.emitPreviewDebug(
            `⏳ [Random] skip (seeking) layer=${String((layer as any)?.id || '')} blocked=${blockedFor}ms cur=${Number(currentTime || 0).toFixed(3)} dur=${Number(duration || 0).toFixed(3)}`
          );
        }
        return;
      }
    } catch {}
    const now = Date.now();
    const userIntervalMs = userIntervalMsNow;
    const effectiveIntervalMs = Math.max(userIntervalMsNow, Number(state.dynamicMinRandomIntervalMs || 0) || 0);
    const intervalElapsed = now - (state.lastRandomJumpAtMs || 0) >= effectiveIntervalMs;
    const atEnd = currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD && state.lastBoundary !== 'end';
    if (atEnd) state.lastBoundary = 'end';

    // Jump periodically (and also at the end boundary)
    if (atEnd || intervalElapsed) {
      // If we already have a pending jump (we initiated a seek but seeked hasn't fired),
      // don't start another. This can happen on some platforms where `video.seeking`
      // toggles late or briefly false between seeks.
      if (state.pendingRandomJump) return;

      state.lastBoundary = 'end';
      this.cleanupInterval(state);
      const target = this.pickRandomTime(duration);
      const dbg = this.isPreviewDebugEnabled();
      const t0 = dbg && typeof (globalThis as any).performance?.now === 'function'
        ? Number((globalThis as any).performance.now())
        : 0;

      state.pendingRandomJump = true;
      state.pendingRandomJumpStartedAtMs = now;
      try {
        const anyV: any = video as any;
        // Prefer fastSeek when available (can be significantly more efficient).
        if (typeof anyV.fastSeek === 'function') anyV.fastSeek(target);
        else video.currentTime = target;
      } catch {}
      state.lastSeekBlockedSinceMs = 0;
      if (dbg) {
        // Measure seek latency via seeked (best-effort; some codecs may not fire reliably)
        try {
          const onSeeked = () => {
            const t1 = typeof (globalThis as any).performance?.now === 'function'
              ? Number((globalThis as any).performance.now())
              : 0;
            const dt = (t0 && t1) ? Math.max(0, Math.round(t1 - t0)) : -1;
            // Mark completion time for scheduling. This is important: we base the next
            // random jump off the COMPLETION, not the initiation, so slow seeks back off naturally.
            const completedAt = Date.now();
            state.lastRandomJumpAtMs = completedAt;
            state.pendingRandomJump = false;
            state.pendingRandomJumpStartedAtMs = 0;
            state.lastRandomSeekMs = dt >= 0 ? dt : state.lastRandomSeekMs;

            // Adaptive backoff: if seek latency is high, enforce a larger minimum interval.
            // This prevents "seek every 500ms" when seeks take 700–900ms in packaged builds.
            if (dt > 0) {
              const suggested = Math.min(5000, Math.max(250, Math.round(dt * 1.25)));
              const prevMin = Number(state.dynamicMinRandomIntervalMs || 0) || 0;
              // Only increase aggressively; decay slowly elsewhere (below).
              if (suggested > prevMin + 40) {
                state.dynamicMinRandomIntervalMs = suggested;
                this.emitPreviewDebug(
                  `🛑 [Random] backoff layer=${String((layer as any)?.id || '')} seek=${dt}ms minInterval=${suggested}ms (user=${userIntervalMs}ms)`
                );
              }
            }
            this.emitPreviewDebug(
              `🎲 [Random] jump layer=${String((layer as any)?.id || '')} -> ${Number(target).toFixed(3)}s (seek ${dt}ms) rs=${Number(video.readyState)} paused=${String((video as any).paused)}`
            );
          };
          video.addEventListener('seeked', onSeeked, { once: true } as any);
        } catch {}
      } else {
        // Even without debug enabled, we still want correct scheduling/backoff.
        // We attach a lightweight seeked handler to update completion time.
        try {
          const startedAt = now;
          const onSeeked = () => {
            state.lastRandomJumpAtMs = Date.now();
            state.pendingRandomJump = false;
            state.pendingRandomJumpStartedAtMs = 0;
            const dt = Math.max(0, Date.now() - startedAt);
            // Backoff (same logic, no debug emit)
            const suggested = Math.min(5000, Math.max(250, Math.round(dt * 1.25)));
            const prevMin = Number(state.dynamicMinRandomIntervalMs || 0) || 0;
            if (suggested > prevMin + 40) state.dynamicMinRandomIntervalMs = suggested;
          };
          video.addEventListener('seeked', onSeeked, { once: true } as any);
        } catch {}
      }

      // Slow decay of backoff when seeks are healthy, so we recover over time.
      try {
        if (state.dynamicMinRandomIntervalMs > 0 && state.lastRandomSeekMs > 0) {
          if (state.lastRandomSeekMs < Math.max(120, userIntervalMs * 0.35)) {
            state.dynamicMinRandomIntervalMs = Math.max(0, Math.round(state.dynamicMinRandomIntervalMs * 0.95));
          }
        }
      } catch {}
      // Don't call play() here - let the component/mode decide whether to play or pause
    }
  }

  /**
   * Start reverse playback using frame stepping
   */
  private static startReversePlayback(
    video: HTMLVideoElement,
    layer: VideoLayer,
    state: LoopState,
    opts: { duration: number; afterComplete: 'forward' | 'reverse' }
  ): void {
    this.cleanupInterval(state);
    try { video.pause(); } catch {}

    // Seeking-based reverse is inherently heavier than forward playback; instead of
    // "blind" interval stepping (which drops/cancels seeks and looks stuttery),
    // step ONLY after the previous seek has completed.
    const reverseFps = Math.min(30, Math.max(8, Math.floor(VIDEO_CONFIG.DEFAULT_FRAME_RATE) || 24));
    const stepBack = 1 / reverseFps;
    const tick = () => {
      // Stop if mode switched away
      if (!state.isReversing) {
        this.cleanupInterval(state);
        return;
      }

      // Wait for outstanding seek
      try { if ((video as any).seeking) { scheduleNext(); return; } } catch {}

      const cur = Number(video.currentTime || 0);

      // Reached start boundary
      if (cur <= VIDEO_CONFIG.LOOP_THRESHOLD) {
        if (opts.afterComplete === 'reverse') {
          // Reverse looping: wrap to end and keep reversing
          try {
            const t = Math.max(0, opts.duration - VIDEO_CONFIG.LOOP_THRESHOLD);
            const anyV: any = video as any;
            if (typeof anyV.fastSeek === 'function') anyV.fastSeek(t);
            else video.currentTime = t;
          } catch {}
          scheduleNext();
          return;
        }

        // Ping-pong: switch back to forward playback from start
        state.isReversing = false;
        this.cleanupInterval(state);
        try { video.currentTime = 0; } catch {}
        video.play().catch((error: any) => {
          console.error('🎬 Failed to restart video:', layer.name, error);
        });
        return;
      }

      const next = Math.max(0, cur - stepBack);
      if (Math.abs(next - cur) < 0.0005) {
        scheduleNext();
        return;
      }

      const onSeeked = () => {
        try { video.removeEventListener('seeked', onSeeked); } catch {}
        try { video.removeEventListener('error', onSeekErr as any); } catch {}
        scheduleNext();
      };
      const onSeekErr = () => {
        try { video.removeEventListener('seeked', onSeeked); } catch {}
        try { video.removeEventListener('error', onSeekErr as any); } catch {}
        scheduleNext();
      };

      try { video.addEventListener('seeked', onSeeked, { once: true } as any); } catch {}
      try { video.addEventListener('error', onSeekErr as any, { once: true } as any); } catch {}

      // Prefer fastSeek (more efficient when supported)
      try {
        const anyV: any = video as any;
        if (typeof anyV.fastSeek === 'function') anyV.fastSeek(next);
        else video.currentTime = next;
      } catch {
        scheduleNext();
      }
    };

    const scheduleNext = () => {
      this.cleanupInterval(state);
      // Schedule at the target reverse FPS, but only after seek completes.
      state.frameInterval = setTimeout(tick, Math.floor(1000 / reverseFps)) as any;
    };

    // Kick off
    scheduleNext();
  }

  /**
   * Get or create loop state for a layer
   */
  private static getOrCreateLoopState(layerId: string): LoopState {
    if (!this.loopStates.has(layerId)) {
      // Prevent unbounded growth of loop states
      if (this.loopStates.size >= this.MAX_LOOP_STATES) {
        // Remove oldest inactive states (those without running intervals)
        const toRemove: string[] = [];
        for (const [key, state] of this.loopStates.entries()) {
          if (!state.frameInterval) {
            toRemove.push(key);
            if (toRemove.length >= 10) break; // Remove up to 10 at a time
          }
        }
        toRemove.forEach(key => this.loopStates.delete(key));
      }
      
      this.loopStates.set(layerId, {
        isReversing: false,
        loopCount: 0,
        frameInterval: null,
        lastBoundary: null,
        lastMode: null,
        lastRandomJumpAtMs: 0,
        lastDebugAtMs: 0,
        lastSeekBlockedSinceMs: 0,
        pendingRandomJump: false,
        pendingRandomJumpStartedAtMs: 0,
        dynamicMinRandomIntervalMs: 0,
        lastRandomSeekMs: 0,
        lastUserIntervalMs: 0,
      });
    }
    return this.loopStates.get(layerId)!;
  }

  /**
   * Clean up interval for a layer
   */
  private static cleanupInterval(state: LoopState): void {
    if (state.frameInterval) {
      clearInterval(state.frameInterval);
      state.frameInterval = null;
    }
  }

  /**
   * Log debug information
   */
  private static logDebugInfo(
    layer: VideoLayer,
    currentTime: number,
    duration: number,
    state: LoopState
  ): void {
    if (currentTime >= duration - VIDEO_CONFIG.DEBUG_THRESHOLD || currentTime <= VIDEO_CONFIG.DEBUG_THRESHOLD) {
      // console.log('🎬 NUCLEAR PURE COMPOSITION DEBUG: Video near end/start:', 
      //   layer.name, 'Time:', currentTime, 'Duration:', duration, 
      //   'Mode:', layer.loopMode, 'Reversing:', state.isReversing);
    }
  }

  /**
   * Clean up all intervals for a layer
   */
  static cleanup(layerId: string): void {
    const state = this.loopStates.get(layerId);
    if (state) {
      this.cleanupInterval(state);
      this.loopStates.delete(layerId);
    }
  }

  /**
   * Clean up all intervals
   */
  static cleanupAll(): void {
    this.loopStates.forEach((state) => {
      this.cleanupInterval(state);
    });
    this.loopStates.clear();
  }
} 