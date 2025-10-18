import { WebMidi, Input, NoteMessageEvent, ControlChangeMessageEvent } from 'webmidi';
import { getClock } from '../engine/Clock';

type NoteCallback = (note: number, velocity: number, channel: number) => void;
type CCCallback = (cc: number, value: number, channel: number) => void;

export class MIDIManager {
  private static instance: MIDIManager;
  private inputs: Input[];
  private noteCallbacks: Set<NoteCallback>;
  private ccCallbacks: Set<CCCallback>;
  private initialized: boolean;
  // Notify UI when device list changes
  private inputsChangedCallbacks: Set<() => void>;

  private constructor() {
    this.inputs = [];
    this.noteCallbacks = new Set();
    this.ccCallbacks = new Set();
    this.initialized = false;
    this.inputsChangedCallbacks = new Set();
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

    this.inputs = WebMidi.inputs;
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
  getInputSummaries(): { id: string; name: string; manufacturer?: string }[] {
    return (this.inputs || []).map((i) => ({ id: i.id, name: i.name, manufacturer: (i as any).manufacturer }));
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