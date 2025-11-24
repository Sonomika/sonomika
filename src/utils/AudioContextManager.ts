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
  private audioSourceNodes: Map<HTMLAudioElement, MediaElementAudioSourceNode> = new Map();
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
   * Creates a fresh destination node if needed (required after MediaRecorder stops)
   */
  getAppAudioStream(): MediaStream | null {
    if (!this.isInitialized || !this.audioContext || !this.destinationNode) {
      return null;
    }

    // Check if the current stream is still active
    if (this.appAudioStream && this.appAudioStream.active) {
      return this.appAudioStream;
    }

    // If stream is inactive, recreate the destination node
    console.log('[AudioContextManager] Recreating destination node - previous stream was inactive');
    try {
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      this.appAudioStream = this.destinationNode.stream;
      
      // Reconnect existing source nodes to the new destination
      this.audioSourceNodes.forEach((sourceNode) => {
        try {
          sourceNode.connect(this.destinationNode!);
          sourceNode.connect(this.audioContext!.destination);
        } catch (error) {
          console.warn('[AudioContextManager] Failed to reconnect source node:', error);
        }
      });
      
      console.log('[AudioContextManager] Destination node recreated successfully');
      return this.appAudioStream;
    } catch (error) {
      console.error('[AudioContextManager] Failed to recreate destination node:', error);
      return null;
    }
  }

  /**
   * Register an audio element to be captured in app audio
   */
  registerAudioElement(audioElement: HTMLAudioElement): void {
    if (!this.isInitialized || !this.audioContext || !this.destinationNode) {
      console.warn('[AudioContextManager] Not initialized, cannot register audio element');
      return;
    }

    // Skip if already registered
    if (this.audioElements.has(audioElement)) {
      console.log('[AudioContextManager] Audio element already registered:', audioElement.src);
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
      this.audioSourceNodes.set(audioElement, source);
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
    this.audioSourceNodes.delete(audioElement);
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
   * Get count of registered audio elements
   */
  getRegisteredAudioElementCount(): number {
    return this.audioElements.size;
  }

  /**
   * Get debug info about the audio context state
   */
  getDebugInfo(): any {
    return {
      isInitialized: this.isInitialized,
      audioContextState: this.audioContext?.state || 'null',
      hasDestinationNode: !!this.destinationNode,
      hasAppAudioStream: !!this.appAudioStream,
      appAudioStreamActive: this.appAudioStream?.active || false,
      registeredAudioElementCount: this.audioElements.size,
      audioSourceNodeCount: this.audioSourceNodes.size,
      audioElementSources: Array.from(this.audioElements).map(el => el.src)
    };
  }

  /**
   * Create a silent oscillator to ensure audio stream produces data
   * This is needed when no audio elements are registered but we want to record audio
   */
  createSilentOscillator(): OscillatorNode | null {
    if (!this.isInitialized || !this.audioContext || !this.destinationNode) {
      return null;
    }

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0; // Silent
      oscillator.connect(gainNode);
      gainNode.connect(this.destinationNode);
      oscillator.start();
      console.log('[AudioContextManager] Created silent oscillator');
      return oscillator;
    } catch (error) {
      console.error('[AudioContextManager] Failed to create silent oscillator:', error);
      return null;
    }
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
    this.audioSourceNodes.clear();
    this.isInitialized = false;
    console.log('[AudioContextManager] Cleaned up');
  }
}

// Export singleton instance
export const audioContextManager = AudioContextManager.getInstance();
