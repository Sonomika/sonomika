import { WebMidi, Input, NoteMessageEvent, ControlChangeMessageEvent } from 'webmidi';

type NoteCallback = (note: number, velocity: number, channel: number) => void;
type CCCallback = (cc: number, value: number, channel: number) => void;

export class MIDIManager {
  private static instance: MIDIManager;
  private inputs: Input[];
  private noteCallbacks: Set<NoteCallback>;
  private ccCallbacks: Set<CCCallback>;
  private initialized: boolean;

  private constructor() {
    this.inputs = [];
    this.noteCallbacks = new Set();
    this.ccCallbacks = new Set();
    this.initialized = false;
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
    });
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