import { VIDEO_CONFIG, LOOP_MODES } from '../constants/video';
import type { VideoLayer } from '../types/layer';

interface LoopState {
  isReversing: boolean;
  loopCount: number;
  frameInterval: NodeJS.Timeout | null;
  lastBoundary: 'start' | 'end' | null;
  lastMode: string | null;
  lastRandomJumpAtMs: number;
}

export class VideoLoopManager {
  private static loopStates = new Map<string, LoopState>();
  private static readonly RANDOM_JUMP_INTERVAL_MS = 500;

  private static getRandomJumpIntervalMs(layer: VideoLayer): number {
    try {
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
    const now = Date.now();
    const intervalMs = this.getRandomJumpIntervalMs(layer);
    const intervalElapsed = now - (state.lastRandomJumpAtMs || 0) >= intervalMs;
    const atEnd = currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD && state.lastBoundary !== 'end';
    if (atEnd) state.lastBoundary = 'end';

    // Jump periodically (and also at the end boundary)
    if (atEnd || intervalElapsed) {
      state.lastRandomJumpAtMs = now;
      state.lastBoundary = 'end';
      this.cleanupInterval(state);
      try { video.currentTime = this.pickRandomTime(duration); } catch {}
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
      this.loopStates.set(layerId, {
        isReversing: false,
        loopCount: 0,
        frameInterval: null,
        lastBoundary: null,
        lastMode: null,
        lastRandomJumpAtMs: 0,
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