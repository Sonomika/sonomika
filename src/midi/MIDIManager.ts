import { WebMidi, Input, NoteMessageEvent, ControlChangeMessageEvent } from 'webmidi';
import { getClock } from '../engine/Clock';

type NoteCallback = (note: number, velocity: number, channel: number) => void;
type CCCallback = (cc: number, value: number, channel: number) => void;

export class MIDIManager {
  private static instance: MIDIManager;
  private inputs: Input[]; // Filtered inputs (only selected devices, or all if none selected)
  private allInputs: Input[]; // All available inputs (for UI display)
  private noteCallbacks: Set<NoteCallback>;
  private ccCallbacks: Set<CCCallback>;
  private initialized: boolean;
  // Notify UI when device list changes
  private inputsChangedCallbacks: Set<() => void>;
  // Selected device names (empty array means no devices - MIDI disabled)
  private selectedDeviceNames: Set<string>;

  private constructor() {
    this.inputs = [];
    this.allInputs = [];
    this.noteCallbacks = new Set();
    this.ccCallbacks = new Set();
    this.initialized = false;
    this.inputsChangedCallbacks = new Set();
    this.selectedDeviceNames = new Set();
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
      await WebMidi.enable();
      this.initialized = true;
      this.setupInputs();

      // Listen for device connections/disconnections
      WebMidi.addListener('connected', () => this.setupInputs());
      WebMidi.addListener('disconnected', () => this.setupInputs());
    } catch (error) {
      console.error('WebMidi could not be enabled:', error);
    }
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

    // Notify listeners that the input device list changed
    this.notifyInputsChanged();
  }

  // Set selected device names (empty array means no devices - MIDI disabled)
  setSelectedDevices(deviceNames: string[]): void {
    this.selectedDeviceNames = new Set(deviceNames);
    // Re-setup inputs to apply the filter
    if (this.initialized) {
      this.setupInputs();
    }
  }

  addNoteCallback(callback: NoteCallback): void {
    this.noteCallbacks.add(callback);
  }

  removeNoteCallback(callback: NoteCallback): void {
    this.noteCallbacks.delete(callback);
  }

  addCCCallback(callback: CCCallback): void {
    this.ccCallbacks.add(callback);
  }

  removeCCCallback(callback: CCCallback): void {
    this.ccCallbacks.delete(callback);
  }

  getInputs(): Input[] {
    return this.inputs;
  }

  // Convenience summaries for UI consumption
  // Always returns all available devices (not filtered) so UI can show all checkboxes
  getInputSummaries(): { id: string; name: string; manufacturer?: string }[] {
    return (this.allInputs || []).map((i) => ({ id: i.id, name: i.name, manufacturer: (i as any).manufacturer }));
  }

  onInputsChanged(cb: () => void): void {
    this.inputsChangedCallbacks.add(cb);
  }

  removeInputsChanged(cb: () => void): void {
    this.inputsChangedCallbacks.delete(cb);
  }

  private notifyInputsChanged(): void {
    this.inputsChangedCallbacks.forEach((cb) => {
      try { cb(); } catch {}
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  cleanup(): void {
    this.inputs.forEach(input => {
      input.removeListener('noteon');
      input.removeListener('controlchange');
    });
    this.noteCallbacks.clear();
    this.ccCallbacks.clear();
  }
} 