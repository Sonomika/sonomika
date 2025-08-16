import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { MIDIManager } from '../midi/MIDIManager';
import { AppState } from '../store/types';
import { Dialog, Select } from './ui';

interface SceneMIDIMapping {
  sceneId: string;
  sceneName: string;
  midiNote: number | null;
  midiChannel: number;
  enabled: boolean;
}

const noteNames = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

const getNoteName = (note: number): string => {
  const octave = Math.floor(note / 12) - 1;
  const noteName = noteNames[note % 12];
  return `${noteName}${octave}`;
};

export const MIDISceneMapper: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { scenes, setCurrentScene, updateScene } = useStore() as any;
  const [sceneMappings, setSceneMappings] = useState<SceneMIDIMapping[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [listeningSceneId, setListeningSceneId] = useState<string | null>(null);

  useEffect(() => {
    // Initialize scene mappings from localStorage or create defaults
    const savedMappings = localStorage.getItem('vj-scene-midi-mappings');
    if (savedMappings) {
      setSceneMappings(JSON.parse(savedMappings));
    } else {
      // Create default mappings for existing scenes
      const defaultMappings: SceneMIDIMapping[] = scenes.map((scene: any, index: number) => ({
        sceneId: scene.id,
        sceneName: scene.name,
        midiNote: index < 12 ? 60 + index : null, // C4 to B4 for first 12 scenes
        midiChannel: 1,
        enabled: true,
      }));
      setSceneMappings(defaultMappings);
    }
  }, [scenes]);

  useEffect(() => {
    // Save mappings to localStorage whenever they change
    localStorage.setItem('vj-scene-midi-mappings', JSON.stringify(sceneMappings));
  }, [sceneMappings]);

  useEffect(() => {
    // Set up MIDI note callbacks
    const handleNoteOn = (note: number, velocity: number, channel: number) => {
      if (velocity > 0) { // Note on
        const mapping = sceneMappings.find(m => 
          m.midiNote === note && 
          m.midiChannel === channel && 
          m.enabled
        );
        
        if (mapping) {
          setCurrentScene(mapping.sceneId);
          console.log(`Switched to scene: ${mapping.sceneName} via MIDI note ${getNoteName(note)}`);
        }
      }
    };

    MIDIManager.getInstance().addNoteCallback(handleNoteOn);

    return () => {
      // Cleanup would go here if MIDIManager had a remove callback method
    };
  }, [sceneMappings, setCurrentScene]);

  const handleStartListening = (sceneId: string) => {
    setIsListening(true);
    setListeningSceneId(sceneId);
  };

  const handleStopListening = () => {
    setIsListening(false);
    setListeningSceneId(null);
  };

  useEffect(() => {
    if (isListening) {
      const handleNoteOn = (note: number, velocity: number, channel: number) => {
        if (velocity > 0 && listeningSceneId) {
          setSceneMappings(prev => prev.map(mapping => 
            mapping.sceneId === listeningSceneId 
              ? { ...mapping, midiNote: note, midiChannel: channel }
              : mapping
          ));
          handleStopListening();
        }
      };

      MIDIManager.getInstance().addNoteCallback(handleNoteOn);
    }
  }, [isListening, listeningSceneId]);

  const handleClearMapping = (sceneId: string) => {
    setSceneMappings(prev => prev.map(mapping => 
      mapping.sceneId === sceneId 
        ? { ...mapping, midiNote: null }
        : mapping
    ));
  };

  const handleToggleEnabled = (sceneId: string) => {
    setSceneMappings(prev => prev.map(mapping => 
      mapping.sceneId === sceneId 
        ? { ...mapping, enabled: !mapping.enabled }
        : mapping
    ));
  };

  const handleChannelChange = (sceneId: string, channel: number) => {
    setSceneMappings(prev => prev.map(mapping => 
      mapping.sceneId === sceneId 
        ? { ...mapping, midiChannel: channel }
        : mapping
    ));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="MIDI Scene Mapping">
      <div className="scene-mapping-container tw-space-y-3">
        <div className="mapping-section">
          <h3>SCENES (MIDI Channel 1)</h3>
          <div className="scene-mapping-list">
            {sceneMappings.map((mapping) => (
              <div key={mapping.sceneId} className="scene-mapping-item">
                <div className="scene-info">
                  <span className="scene-name">{mapping.sceneName}</span>
                  {mapping.midiNote !== null && (
                    <span className="midi-note">
                      {getNoteName(mapping.midiNote)}
                    </span>
                  )}
                </div>
                
                <div className="scene-controls">
                  <button
                    className={`midi-button ${mapping.midiNote !== null ? 'mapped' : ''} ${listeningSceneId === mapping.sceneId ? 'listening' : ''}`}
                    onClick={() => handleStartListening(mapping.sceneId)}
                    disabled={isListening && listeningSceneId !== mapping.sceneId}
                  >
                    {mapping.midiNote !== null ? getNoteName(mapping.midiNote) : 'Click to map'}
                  </button>
                  
                  <div className="scene-actions">
                    <div style={{ minWidth: 120 }}>
                      <Select
                        value={mapping.midiChannel}
                        onChange={(v) => handleChannelChange(mapping.sceneId, Number(v))}
                        options={Array.from({ length: 16 }, (_, i) => ({ value: i + 1, label: `Ch ${i + 1}` }))}
                      />
                    </div>
                    
                    <button
                      className={`toggle-button ${mapping.enabled ? 'enabled' : 'disabled'}`}
                      onClick={() => handleToggleEnabled(mapping.sceneId)}
                      title={mapping.enabled ? 'Disable' : 'Enable'}
                    >
                      {mapping.enabled ? '●' : '○'}
                    </button>
                    
                    {mapping.midiNote !== null && (
                      <button
                        className="clear-button"
                        onClick={() => handleClearMapping(mapping.sceneId)}
                        title="Clear mapping"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {isListening && (
          <div className="listening-overlay">
            <div className="listening-message">
              <h3>Waiting for MIDI Note...</h3>
              <p>Press any key on your MIDI controller to assign it to the scene.</p>
              <button onClick={handleStopListening}>Cancel</button>
            </div>
          </div>
        )}

        <div className="mapping-help">
          <h4>How to use:</h4>
          <ul>
            <li>Click on a scene's MIDI button to assign a note</li>
            <li>Press any key on your MIDI controller to map it</li>
            <li>Use the channel selector to change MIDI channels</li>
            <li>Toggle the circle button to enable/disable mappings</li>
            <li>Click × to clear a mapping</li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
}; 