type BPMCallback = (bpm: number) => void;

export class BPMManager {
  private static instance: BPMManager;
  private bpm: number;
  private tapHistory: number[];
  private callbacks: Set<BPMCallback>;
  private beatInterval: number | null;

  private constructor() {
    this.bpm = 120;
    this.tapHistory = [];
    this.callbacks = new Set();
    this.beatInterval = null;
  }

  static getInstance(): BPMManager {
    if (!BPMManager.instance) {
      BPMManager.instance = new BPMManager();
    }
    return BPMManager.instance;
  }

  setBPM(bpm: number): void {
    this.bpm = Math.max(30, Math.min(300, bpm));
    this.updateBeatInterval();
    this.notifyCallbacks();
  }

  tap(): void {
    const now = performance.now();
    
    // Remove taps older than 2 seconds
    this.tapHistory = this.tapHistory.filter(time => now - time < 2000);
    
    // Add new tap
    this.tapHistory.push(now);

    // Need at least 2 taps to calculate BPM
    if (this.tapHistory.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.tapHistory.length; i++) {
        intervals.push(this.tapHistory[i] - this.tapHistory[i - 1]);
      }

      // Calculate average interval
      const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      
      // Convert to BPM
      const newBPM = Math.round(60000 / averageInterval);
      
      // Update BPM if it's within reasonable range
      if (newBPM >= 30 && newBPM <= 300) {
        this.setBPM(newBPM);
      }
    }
  }

  getBPM(): number {
    return this.bpm;
  }

  addCallback(callback: BPMCallback): void {
    this.callbacks.add(callback);
    callback(this.bpm); // Initial call with current BPM
  }

  removeCallback(callback: BPMCallback): void {
    this.callbacks.delete(callback);
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback(this.bpm);
      } catch (error) {
        console.error('Error in BPM callback:', error);
      }
    });
  }

  private updateBeatInterval(): void {
    if (this.beatInterval !== null) {
      clearInterval(this.beatInterval);
    }

    // Calculate interval in milliseconds for quarter notes
    const interval = (60 / this.bpm) * 1000;

    this.beatInterval = window.setInterval(() => {
      this.notifyCallbacks();
    }, interval);
  }

  cleanup(): void {
    if (this.beatInterval !== null) {
      clearInterval(this.beatInterval);
      this.beatInterval = null;
    }
    this.callbacks.clear();
  }
} 