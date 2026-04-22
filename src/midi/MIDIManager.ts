import { WebMidi, Input, Output, NoteMessageEvent, ControlChangeMessageEvent } from 'webmidi';
import { getClock } from '../engine/Clock';
import { trackFeatureOnce, trackFeatureThrottled } from '../utils/analytics';

type NoteCallback = (note: number, velocity: number, channel: number) => void;
type CCCallback = (cc: number, value: number, channel: number) => void;

export class MIDIManager {
  private static instance: MIDIManager;
  private inputs: Input[]; // Filtered inputs (only selected devices, or all if none selected)
  private allInputs: Input[]; // All available inputs (for UI display)
  private outputs: Output[]; // All available MIDI outputs
  private selectedOutputName: string | null;
  private noteCallbacks: Set<NoteCallback>;
  private ccCallbacks: Set<CCCallback>;
  private initialized: boolean;
  // Notify UI when device list changes
  private inputsChangedCallbacks: Set<() => void>;
  private outputsChangedCallbacks: Set<() => void>;
  // Selected device names (empty array means no devices - MIDI disabled)
  private selectedDeviceNames: Set<string>;
  // Clock scheduling (24 PPQN from globalThis.VJ_BPM)
  private clockRunning: boolean;
  private clockNextTime: number;
  private clockTimeout: number | null;

  private constructor() {
    this.inputs = [];
    this.allInputs = [];
    this.outputs = [];
    this.selectedOutputName = null;
    this.noteCallbacks = new Set();
    this.ccCallbacks = new Set();
    this.initialized = false;
    this.inputsChangedCallbacks = new Set();
    this.outputsChangedCallbacks = new Set();
    this.selectedDeviceNames = new Set();
    this.clockRunning = false;
    this.clockNextTime = 0;
    this.clockTimeout = null;
    this.initialize();
  }

  static getInstance(): MIDIManager {
    if (!MIDIManager.instance) {
      MIDIManager.instance = new MIDIManager();
    }
    return MIDIManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // sysex isn't required for note/cc/clock traffic, keep default (disabled)
      await WebMidi.enable();
      this.initialized = true;
      this.setupDevices();
      trackFeatureOnce('midi_enabled', { ok: true });

      WebMidi.addListener('connected', () => this.setupDevices());
      WebMidi.addListener('disconnected', () => this.setupDevices());
    } catch (error) {
      console.error('WebMidi could not be enabled:', error);
      trackFeatureOnce('midi_enabled', { ok: false });
    }
  }

  /**
   * Force a full re-enumeration of OS MIDI devices. On Windows/Chromium,
   * virtual MIDI ports (e.g. loopMIDI) created after app start are often not
   * detected via hot-plug; disabling + re-enabling WebMidi makes the browser
   * re-query the OS MIDI stack and picks them up without needing an app restart.
   * Selected input/output names are preserved and re-applied after the rescan.
   */
  async refreshDevices(): Promise<void> {
    const prevSelectedOutput = this.selectedOutputName;
    const prevSelectedInputs = Array.from(this.selectedDeviceNames);
    const wasClockRunning = this.clockRunning;

    // Clean up before tearing down
    try { this.stopClock(); } catch {}
    try { this.allNotesOff(); } catch {}
    this.inputs.forEach((input) => {
      try { input.removeListener('noteon'); } catch {}
      try { input.removeListener('controlchange'); } catch {}
      try { input.removeListener('clock'); } catch {}
      try { input.removeListener('start'); } catch {}
      try { input.removeListener('stop'); } catch {}
      try { input.removeListener('continue'); } catch {}
    });
    this.inputs = [];
    this.allInputs = [];
    this.outputs = [];

    try {
      try { await WebMidi.disable(); } catch {}
      await WebMidi.enable();
      this.initialized = true;

      // Re-attach connect/disconnect listeners (disable() drops them).
      try { WebMidi.removeListener(); } catch {}
      WebMidi.addListener('connected', () => this.setupDevices());
      WebMidi.addListener('disconnected', () => this.setupDevices());

      // Restore user's previous selections; setupDevices will re-apply them.
      this.selectedOutputName = prevSelectedOutput;
      this.selectedDeviceNames = new Set(prevSelectedInputs);

      this.setupDevices();

      // Restart clock if it was running before (and output still present).
      if (wasClockRunning && this.hasOutputSelected()) {
        this.startClock();
      }

      trackFeatureOnce('midi_refreshed', { ok: true });
    } catch (err) {
      console.warn('MIDI refresh failed:', err);
      trackFeatureOnce('midi_refreshed', { ok: false });
    }
  }

  private setupDevices(): void {
    this.setupInputs();
    this.setupOutputs();
  }

  private setupInputs(): void {
    this.inputs.forEach(input => {
      input.removeListener('noteon');
      input.removeListener('controlchange');
      input.removeListener('clock');
      input.removeListener('start');
      input.removeListener('stop');
      input.removeListener('continue');
    });

    // Store all available inputs for UI display
    this.allInputs = WebMidi.inputs;
    
    // Filter inputs based on selected devices for actual MIDI listening
    // If selectedDeviceNames is empty, use NO devices (disable MIDI)
    const shouldFilter = this.selectedDeviceNames.size > 0;
    this.inputs = shouldFilter 
      ? this.allInputs.filter(input => this.selectedDeviceNames.has(input.name))
      : [];

    // Throttle: device attach/detach can fire in bursts.
    trackFeatureThrottled('midi_devices', 5000, {
      available: (this.allInputs || []).length,
      selected: this.selectedDeviceNames.size,
      active: (this.inputs || []).length,
    });

    this.inputs.forEach(input => {
      input.addListener('noteon', (e: NoteMessageEvent) => {
        this.noteCallbacks.forEach(callback => {
          callback(e.note.number, e.note.attack, e.message.channel);
        });
      });

      input.addListener('controlchange', (e: ControlChangeMessageEvent) => {
        if (typeof e.rawValue === 'number') {
          this.ccCallbacks.forEach(callback => {
            callback(e.controller.number, e.rawValue!, e.message.channel);
          });
        }
      });

      // MIDI Clock: 24 PPQN timing pulses and transport
      try {
        const clock = getClock();
        input.addListener('clock', () => {
          clock.sendTimingPulse();
        });
        input.addListener('start', () => {
          clock.startOnNextTimingPulse();
        });
        input.addListener('continue', () => {
          clock.continueOnNextTimingPulse();
        });
        input.addListener('stop', () => {
          clock.stop();
        });
      } catch (err) {
        console.warn('Failed to attach MIDI clock listeners:', err);
      }
    });

    this.notifyInputsChanged();
  }

  private setupOutputs(): void {
    this.outputs = WebMidi.outputs;
    // If our selected output disappeared, drop it silently.
    if (this.selectedOutputName && !this.outputs.some(o => o.name === this.selectedOutputName)) {
      this.selectedOutputName = null;
      this.stopClock();
    }
    this.notifyOutputsChanged();
  }

  // --- Input API (unchanged) -------------------------------------------------
  setSelectedDevices(deviceNames: string[]): void {
    this.selectedDeviceNames = new Set(deviceNames);
    if (this.initialized) this.setupInputs();
  }

  addNoteCallback(callback: NoteCallback): void { this.noteCallbacks.add(callback); }
  removeNoteCallback(callback: NoteCallback): void { this.noteCallbacks.delete(callback); }
  addCCCallback(callback: CCCallback): void { this.ccCallbacks.add(callback); }
  removeCCCallback(callback: CCCallback): void { this.ccCallbacks.delete(callback); }
  getInputs(): Input[] { return this.inputs; }
  getInputSummaries(): { id: string; name: string; manufacturer?: string }[] {
    return (this.allInputs || []).map((i) => ({ id: i.id, name: i.name, manufacturer: (i as any).manufacturer }));
  }
  onInputsChanged(cb: () => void): void { this.inputsChangedCallbacks.add(cb); }
  removeInputsChanged(cb: () => void): void { this.inputsChangedCallbacks.delete(cb); }
  private notifyInputsChanged(): void {
    this.inputsChangedCallbacks.forEach((cb) => { try { cb(); } catch {} });
  }

  // --- Output API ------------------------------------------------------------
  getOutputSummaries(): { id: string; name: string; manufacturer?: string }[] {
    return (this.outputs || []).map((o) => ({ id: o.id, name: o.name, manufacturer: (o as any).manufacturer }));
  }

  setSelectedOutput(name: string | null): void {
    if (this.selectedOutputName === name) return;
    // Clean up on previous output: all-notes-off + stop clock, best-effort.
    this.allNotesOff();
    this.stopClock();
    this.selectedOutputName = name;
    this.notifyOutputsChanged();
  }

  getSelectedOutputName(): string | null { return this.selectedOutputName; }

  hasOutputSelected(): boolean {
    return !!this.selectedOutputName && !!this.getOutput();
  }

  onOutputsChanged(cb: () => void): void { this.outputsChangedCallbacks.add(cb); }
  removeOutputsChanged(cb: () => void): void { this.outputsChangedCallbacks.delete(cb); }
  private notifyOutputsChanged(): void {
    this.outputsChangedCallbacks.forEach((cb) => { try { cb(); } catch {} });
  }

  private getOutput(): Output | null {
    if (!this.selectedOutputName) return null;
    return this.outputs.find(o => o.name === this.selectedOutputName) || null;
  }

  /**
   * Fire a note with optional auto-release after durationMs.
   * note: 0-127. velocity: 0-1. channel: 1-16. durationMs: default 20ms (good for percussive hits).
   */
  sendNote(note: number, velocity = 0.9, channel = 1, durationMs = 20): void {
    const out = this.getOutput(); if (!out) return;
    const n = Math.max(0, Math.min(127, Math.round(note)));
    const v = Math.max(0, Math.min(1, velocity));
    const ch = Math.max(1, Math.min(16, Math.round(channel)));
    try {
      out.playNote(n, { channels: ch, attack: v, duration: Math.max(1, durationMs) });
    } catch {}
  }

  sendNoteOn(note: number, velocity = 0.9, channel = 1): void {
    const out = this.getOutput(); if (!out) return;
    try {
      out.sendNoteOn(Math.max(0, Math.min(127, Math.round(note))), {
        channels: Math.max(1, Math.min(16, channel)),
        attack: Math.max(0, Math.min(1, velocity)),
      });
    } catch {}
  }

  sendNoteOff(note: number, channel = 1): void {
    const out = this.getOutput(); if (!out) return;
    try {
      out.sendNoteOff(Math.max(0, Math.min(127, Math.round(note))), {
        channels: Math.max(1, Math.min(16, channel)),
      });
    } catch {}
  }

  sendCC(cc: number, value: number /* 0-127 */, channel = 1): void {
    const out = this.getOutput(); if (!out) return;
    try {
      out.sendControlChange(
        Math.max(0, Math.min(127, Math.round(cc))),
        Math.max(0, Math.min(127, Math.round(value))),
        { channels: Math.max(1, Math.min(16, channel)) }
      );
    } catch {}
  }

  allNotesOff(): void {
    const out = this.getOutput(); if (!out) return;
    try {
      for (let ch = 1; ch <= 16; ch++) {
        try { (out as any).sendAllNotesOff?.({ channels: ch }); } catch {}
        try { (out as any).sendAllSoundOff?.({ channels: ch }); } catch {}
      }
    } catch {}
  }

  sendStart(): void { try { this.getOutput()?.sendStart(); } catch {} }
  sendStop(): void { try { this.getOutput()?.sendStop(); } catch {} }
  sendContinue(): void { try { this.getOutput()?.sendContinue(); } catch {} }

  /**
   * Begin streaming 24 PPQN MIDI clock to the selected output, reading tempo
   * from globalThis.VJ_BPM every tick so tempo changes propagate live.
   */
  startClock(options?: { sendStart?: boolean }): void {
    this.stopClock();
    if (!this.hasOutputSelected()) return;
    if (options?.sendStart) this.sendStart();
    this.clockRunning = true;
    this.clockNextTime = performance.now();
    const loop = () => {
      if (!this.clockRunning) return;
      const out = this.getOutput();
      if (!out) { this.stopClock(); return; }
      const now = performance.now();
      // Fire any ticks that are due (catch up gracefully).
      let safety = 0;
      while (now >= this.clockNextTime && safety < 64) {
        try { out.sendClock(); } catch {}
        const bpm = Math.max(30, Math.min(300, Number((globalThis as any).VJ_BPM) || 120));
        this.clockNextTime += 60000 / bpm / 24;
        safety++;
      }
      // If we fell behind by more than 100ms, resync to now so we don't spam.
      const lag = performance.now() - this.clockNextTime;
      if (lag > 100) this.clockNextTime = performance.now();
      const delay = Math.max(1, this.clockNextTime - performance.now());
      this.clockTimeout = window.setTimeout(loop, delay);
    };
    loop();
  }

  stopClock(options?: { sendStop?: boolean }): void {
    this.clockRunning = false;
    if (this.clockTimeout != null) {
      clearTimeout(this.clockTimeout);
      this.clockTimeout = null;
    }
    if (options?.sendStop) this.sendStop();
  }

  isClockRunning(): boolean { return this.clockRunning; }

  isInitialized(): boolean { return this.initialized; }

  cleanup(): void {
    this.inputs.forEach(input => {
      input.removeListener('noteon');
      input.removeListener('controlchange');
    });
    this.noteCallbacks.clear();
    this.ccCallbacks.clear();
    this.stopClock();
    this.allNotesOff();
  }
}
