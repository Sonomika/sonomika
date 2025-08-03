import { VIDEO_CONFIG, LOOP_MODES } from '../constants/video';
import type { VideoLayer } from '../types/layer';

interface LoopState {
  isReversing: boolean;
  loopCount: number;
  frameInterval: NodeJS.Timeout | null;
}

export class VideoLoopManager {
  private static loopStates = new Map<string, LoopState>();

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
    if (currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD) {
      console.log('🎬 LOOP MODE: Restarting video:', layer.name);
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
    currentTime: number,
    duration: number
  ): void {
    if (currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD) {
      console.log('🎬 REVERSE MODE: Starting reverse playback:', layer.name);
      state.isReversing = true;
      this.startReversePlayback(video, layer, state);
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
    if (!state.isReversing && currentTime >= duration - VIDEO_CONFIG.LOOP_THRESHOLD) {
      console.log('🎬 PING-PONG MODE: Starting reverse phase:', layer.name);
      state.isReversing = true;
      this.startReversePlayback(video, layer, state);
    }
  }

  /**
   * Start reverse playback using frame stepping
   */
  private static startReversePlayback(
    video: HTMLVideoElement,
    layer: VideoLayer,
    state: LoopState
  ): void {
    this.cleanupInterval(state);
    
    state.frameInterval = setInterval(() => {
      if (video.currentTime <= VIDEO_CONFIG.LOOP_THRESHOLD) {
        console.log('🎬 REVERSE MODE: Reverse playback complete, switching to forward:', layer.name);
        state.isReversing = false;
        this.cleanupInterval(state);
        video.currentTime = 0;
        video.play().catch((error: any) => {
          console.error('🎬 Failed to restart video:', layer.name, error);
        });
        return;
      }
      
      // Step backwards in time
      const stepBack = 1 / VIDEO_CONFIG.DEFAULT_FRAME_RATE;
      video.currentTime = Math.max(0, video.currentTime - stepBack);
    }, VIDEO_CONFIG.STEP_BACK_INTERVAL);
  }

  /**
   * Get or create loop state for a layer
   */
  private static getOrCreateLoopState(layerId: string): LoopState {
    if (!this.loopStates.has(layerId)) {
      this.loopStates.set(layerId, {
        isReversing: false,
        loopCount: 0,
        frameInterval: null
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
      console.log('🎬 NUCLEAR PURE COMPOSITION DEBUG: Video near end/start:', 
        layer.name, 'Time:', currentTime, 'Duration:', duration, 
        'Mode:', layer.loopMode, 'Reversing:', state.isReversing);
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