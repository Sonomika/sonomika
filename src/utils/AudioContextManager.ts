/**
 * Centralized Audio Context Manager for VJ App
 * Handles audio context creation, management, and app audio capture for recording
 */

export class AudioContextManager {
  private static instance: AudioContextManager;
  private audioContext: AudioContext | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private appAudioStream: MediaStream | null = null;
  private audioElements: Set<HTMLAudioElement> = new Set();
  private isInitialized = false;

  private constructor() {}

  static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  /**
   * Initialize the audio context and destination node
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      
      // Resume context if suspended (required for some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create destination node for capturing app audio
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      this.appAudioStream = this.destinationNode.stream;
      
      this.isInitialized = true;
      console.log('[AudioContextManager] Initialized successfully');
    } catch (error) {
      console.error('[AudioContextManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Get the app audio stream for recording
   */
  getAppAudioStream(): MediaStream | null {
    return this.appAudioStream;
  }

  /**
   * Register an audio element to be captured in app audio
   */
  registerAudioElement(audioElement: HTMLAudioElement): void {
    if (!this.isInitialized || !this.audioContext || !this.destinationNode) {
      console.warn('[AudioContextManager] Not initialized, cannot register audio element');
      return;
    }

    try {
      // Create media element source
      const source = this.audioContext.createMediaElementSource(audioElement);
      
      // Connect to destination node (app audio output)
      source.connect(this.destinationNode);
      
      // Also connect to audio context destination for normal playback
      source.connect(this.audioContext.destination);
      
      this.audioElements.add(audioElement);
      console.log('[AudioContextManager] Registered audio element:', audioElement.src);
    } catch (error) {
      console.error('[AudioContextManager] Failed to register audio element:', error);
    }
  }

  /**
   * Unregister an audio element
   */
  unregisterAudioElement(audioElement: HTMLAudioElement): void {
    this.audioElements.delete(audioElement);
    console.log('[AudioContextManager] Unregistered audio element:', audioElement.src);
  }

  /**
   * Get current audio context state
   */
  getContextState(): AudioContextState | null {
    return this.audioContext?.state || null;
  }

  /**
   * Resume audio context if suspended
   */
  async resumeContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Check if audio context is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.audioContext !== null && this.destinationNode !== null;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.destinationNode = null;
    this.appAudioStream = null;
    this.audioElements.clear();
    this.isInitialized = false;
    console.log('[AudioContextManager] Cleaned up');
  }
}

// Export singleton instance
export const audioContextManager = AudioContextManager.getInstance();
