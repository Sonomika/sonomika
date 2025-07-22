export interface MIDIMapping {
  id: string;
  type: 'note' | 'cc';
  channel: number;
  number: number;
  parameter: string;
  minValue: number;
  maxValue: number;
  enabled: boolean;
}

export class MIDIMappingManager {
  private static instance: MIDIMappingManager;
  private mappings: Map<string, MIDIMapping> = new Map();
  private parameterCallbacks: Map<string, (value: number) => void> = new Map();

  private constructor() {
    this.loadMappings();
  }

  static getInstance(): MIDIMappingManager {
    if (!MIDIMappingManager.instance) {
      MIDIMappingManager.instance = new MIDIMappingManager();
    }
    return MIDIMappingManager.instance;
  }

  addMapping(mapping: MIDIMapping): void {
    this.mappings.set(mapping.id, mapping);
    this.saveMappings();
  }

  removeMapping(id: string): void {
    this.mappings.delete(id);
    this.saveMappings();
  }

  getMappings(): MIDIMapping[] {
    return Array.from(this.mappings.values());
  }

  registerParameterCallback(parameter: string, callback: (value: number) => void): void {
    this.parameterCallbacks.set(parameter, callback);
  }

  unregisterParameterCallback(parameter: string): void {
    this.parameterCallbacks.delete(parameter);
  }

  handleMIDIEvent(type: 'note' | 'cc', channel: number, number: number, value: number): void {
    this.mappings.forEach(mapping => {
      if (mapping.type === type && 
          mapping.channel === channel && 
          mapping.number === number && 
          mapping.enabled) {
        
        // Normalize value (0-127 for MIDI, convert to mapping range)
        const normalizedValue = value / 127;
        const mappedValue = mapping.minValue + (normalizedValue * (mapping.maxValue - mapping.minValue));
        
        const callback = this.parameterCallbacks.get(mapping.parameter);
        if (callback) {
          callback(mappedValue);
        }
      }
    });
  }

  private saveMappings(): void {
    try {
      const mappingsData = JSON.stringify(Array.from(this.mappings.values()));
      localStorage.setItem('vj-midi-mappings', mappingsData);
    } catch (error) {
      console.error('Failed to save MIDI mappings:', error);
    }
  }

  private loadMappings(): void {
    try {
      const mappingsData = localStorage.getItem('vj-midi-mappings');
      if (mappingsData) {
        const mappings = JSON.parse(mappingsData) as MIDIMapping[];
        mappings.forEach(mapping => {
          this.mappings.set(mapping.id, mapping);
        });
      }
    } catch (error) {
      console.error('Failed to load MIDI mappings:', error);
    }
  }

  createMappingId(type: 'note' | 'cc', channel: number, number: number): string {
    return `${type}_${channel}_${number}`;
  }

  getMappingByEvent(type: 'note' | 'cc', channel: number, number: number): MIDIMapping | undefined {
    const id = this.createMappingId(type, channel, number);
    return this.mappings.get(id);
  }

  updateMapping(id: string, updates: Partial<MIDIMapping>): void {
    const mapping = this.mappings.get(id);
    if (mapping) {
      Object.assign(mapping, updates);
      this.saveMappings();
    }
  }

  clearAllMappings(): void {
    this.mappings.clear();
    this.saveMappings();
  }
} 