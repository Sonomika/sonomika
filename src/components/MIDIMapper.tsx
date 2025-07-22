import React, { useState } from 'react';
import { useStore } from '../store/store';
import { MIDIManager } from '../midi/MIDIManager';
import { MIDIMapping } from '../store/types';
import { AppState } from '../store/types';

type StoreActions = {
  addMIDIMapping: (mapping: MIDIMapping) => void;
  removeMIDIMapping: (index: number) => void;
  setMIDIMappings: (mappings: MIDIMapping[]) => void;
};

type Store = AppState & StoreActions;

interface Props {
  onClose: () => void;
}

export const MIDIMapper: React.FC<Props> = ({ onClose }) => {
  const { midiMappings, removeMIDIMapping } = useStore() as Store;
  const [isListening, setIsListening] = useState(false);
  const [currentMapping, setCurrentMapping] = useState<MIDIMapping | null>(null);

  const handleStartMapping = (target: MIDIMapping['target']) => {
    setCurrentMapping({ type: 'note', channel: 0, number: 0, target });
    setIsListening(true);

    const handleNote = (note: number, channel: number) => {
      if (isListening && currentMapping) {
        const newMapping: MIDIMapping = {
          ...currentMapping,
          type: 'note',
          channel,
          number: note,
        };
        setCurrentMapping(newMapping);
        setIsListening(false);
      }
    };

    const handleCC = (cc: number, channel: number) => {
      if (isListening && currentMapping) {
        const newMapping: MIDIMapping = {
          ...currentMapping,
          type: 'cc',
          channel,
          number: cc,
        };
        setCurrentMapping(newMapping);
        setIsListening(false);
      }
    };

    MIDIManager.getInstance().addNoteCallback(handleNote);
    MIDIManager.getInstance().addCCCallback(handleCC);
  };

  const handleRemoveMapping = (index: number) => {
    removeMIDIMapping(index);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>MIDI Mapping</h2>

        <div className="mapping-section">
          <h3>Current Mappings</h3>
          {midiMappings.map((mapping, index) => (
            <div key={index} className="mapping-item">
              <div>
                {mapping.type === 'note' ? 'Note' : 'CC'} {mapping.number} (Ch {mapping.channel}) →{' '}
                {mapping.target.type} {mapping.target.id}
                {mapping.target.param && ` (${mapping.target.param})`}
              </div>
              <button onClick={() => handleRemoveMapping(index)}>Remove</button>
            </div>
          ))}
        </div>

        <div className="mapping-section">
          <h3>Add New Mapping</h3>
          <div className="mapping-controls">
            <button
              className={isListening ? 'listening' : ''}
              onClick={() => handleStartMapping({
                type: 'global',
                id: 'bpm',
                param: 'bpm',
              })}
              disabled={isListening}
            >
              Map BPM Control
            </button>
          </div>
        </div>

        {isListening && (
          <div className="listening-message">
            Waiting for MIDI input...
            <button onClick={() => setIsListening(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}; 