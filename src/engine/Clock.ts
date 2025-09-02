type BeatListener = (beatInBar: number) => void;
type BpmListener = (bpm: number) => void;
type RunningListener = (isRunning: boolean) => void;

// A central musical clock driven by requestAnimationFrame.
// Tracks beat phase and supports external MIDI clock (24 PPQN) with start/continue on next pulse.
export class Clock {
  private static instance: Clock;

  private _beatDelta: number = 0; // monotonically increasing beats
  private _beatPulseComparisonDelta: number = 0; // parallel delta for pulse phase comparison
  private _isRunning: boolean = false;
  private _beatInBar: number = 0; // 0..3 for 4/4
  private _beatsPerMs: number = 0;
  private _bpm: number = 120;
  private _lastTimestamp: number | null = null;

  // External clock alignment
  private _lastPulseTimestamp: number | null = null;
  private _timingPulseCount: number = 0; // increments each pulse, resets on start/continue
  private _shouldStartOnNextTimingPulse: boolean = false;
  private _shouldContinueOnNextTimingPulse: boolean = false;
  private _beatPulseOffset: number = 0; // smooth correction

  // Smoothed values
  private _smoothedBpm: number = 120;
  private _smoothedBeatPulseOffset: number = 0;
  private _lastBeatTimestamp: number | null = null;

  // Listeners
  private onNewBeat?: BeatListener;
  private onBpmChange?: BpmListener;
  private onRunningChange?: RunningListener;

  private rafId: number | null = null;

  private constructor() {
    this.setBpm(120);
  }

  static getInstance(): Clock {
    if (!Clock.instance) Clock.instance = new Clock();
    return Clock.instance;
  }

  private tick = (timestamp: number) => {
    if (this._lastTimestamp == null) {
      this._lastTimestamp = timestamp;
    }
    if (!this._isRunning) return;

    const dtMs = timestamp - this._lastTimestamp;
    const deltaInc = this._beatsPerMs * dtMs * (1 + this._beatPulseOffset);
    this._beatDelta += deltaInc;
    this._beatPulseComparisonDelta += deltaInc;

    const newBeatInBar = Math.floor(this._beatDelta % 4);
    if (newBeatInBar !== this._beatInBar) {
      this._beatInBar = newBeatInBar;
      this.onNewBeat?.(newBeatInBar);
      this._lastBeatTimestamp = timestamp;
    }

    this._lastTimestamp = timestamp;
    this.rafId = requestAnimationFrame(this.tick);
  };

  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastTimestamp = performance.now();
    this.onRunningChange?.(true);
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this._isRunning) return;
    this._isRunning = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.onRunningChange?.(false);
  }

  continue() {
    this.start();
  }

  // BPM management
  setBpm(bpm: number) {
    const clamped = Math.max(30, Math.min(999, bpm));
    this._bpm = clamped;
    this._beatsPerMs = clamped / 60000; // beats per ms
    this._smoothedBpm = this.smooth(this._smoothedBpm, clamped, 0.2);
    this.onBpmChange?.(clamped);
  }

  get bpm() { return this._bpm; }
  get smoothedBpm() { return this._smoothedBpm; }
  get isRunning() { return this._isRunning; }
  get beatDelta() { return this._beatDelta; }
  get beatInBar() { return this._beatInBar; }
  get beatPulseOffset() { return this._smoothedBeatPulseOffset; }

  // External 24 PPQN MIDI clock handling
  // Send for each MIDI Timing Clock pulse
  sendTimingPulse = () => {
    const now = performance.now();
    if (this._lastPulseTimestamp != null) {
      const pulseIntervalMs = now - this._lastPulseTimestamp;
      // 24 pulses per quarter note
      const estimatedBpm = 60000 / (pulseIntervalMs * 24);
      // Smooth BPM and compute phase offset alignment
      this._smoothedBpm = this.smooth(this._smoothedBpm, estimatedBpm, 0.1);
      this._bpm = this._smoothedBpm;
      this._beatsPerMs = this._bpm / 60000;

      // Compute phase offset between pulses and our comparison delta
      const beatsPerPulse = 1 / 24;
      const expectedBeats = (this._timingPulseCount + 1) * beatsPerPulse;
      const actualBeats = this._beatPulseComparisonDelta;
      const error = expectedBeats - actualBeats;
      // Smooth correction factor; small to avoid jitter
      this._beatPulseOffset = this.smooth(this._beatPulseOffset, error * 0.02, 0.2);
      this._smoothedBeatPulseOffset = this.smooth(this._smoothedBeatPulseOffset, this._beatPulseOffset, 0.2);
    }
    this._lastPulseTimestamp = now;
    this._timingPulseCount++;

    if (this._shouldStartOnNextTimingPulse) {
      this._shouldStartOnNextTimingPulse = false;
      this._timingPulseCount = 0;
      this._beatPulseComparisonDelta = 0;
      this._beatDelta = 0;
      this.start();
    } else if (this._shouldContinueOnNextTimingPulse) {
      this._shouldContinueOnNextTimingPulse = false;
      this._timingPulseCount = 0;
      this._beatPulseComparisonDelta = 0;
      this.continue();
    }
  };

  startOnNextTimingPulse = () => {
    this._shouldStartOnNextTimingPulse = true;
  };

  continueOnNextTimingPulse = () => {
    this._shouldContinueOnNextTimingPulse = true;
  };

  onNewBeatListener(cb?: BeatListener) { this.onNewBeat = cb; }
  onBpmChangeListener(cb?: BpmListener) { this.onBpmChange = cb; }
  onRunningChangeListener(cb?: RunningListener) { this.onRunningChange = cb; }

  private smooth(prev: number, next: number, factor: number) {
    const f = Math.max(0, Math.min(1, factor));
    return prev * (1 - f) + next * f;
  }
}

export function getClock(): Clock {
  return Clock.getInstance();
}


