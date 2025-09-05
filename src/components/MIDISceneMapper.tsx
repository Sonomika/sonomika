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
  const { scenes, setCurrentScene } = useStore() as any;
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <div className="tw-space-y-3">
        <div className="tw-flex tw-items-center tw-justify-between">
          <h3 className="tw-text-base tw-font-semibold">MIDI Scene Mapping</h3>
        </div>
        <div>
          <h3 className="tw-text-sm tw-font-semibold">SCENES (MIDI Channel 1)</h3>
          <div className="tw-mt-2 tw-space-y-2">
            {sceneMappings.map((mapping) => (
              <div key={mapping.sceneId} className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2">
                <div className="tw-flex tw-items-center tw-justify-between">
                  <span className="tw-text-sm tw-font-medium">{mapping.sceneName}</span>
                  {mapping.midiNote !== null && (
                    <span className="tw-text-xs tw-text-neutral-300">
                      {getNoteName(mapping.midiNote)}
                    </span>
                  )}
                </div>
                
                <div className="tw-mt-2 tw-flex tw-items-center tw-gap-2 tw-justify-between">
                  <button
                    className={`tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${mapping.midiNote !== null ? 'tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'} ${listeningSceneId === mapping.sceneId ? 'tw-ring-2' : ''}`}
                    style={{ ...(listeningSceneId === mapping.sceneId ? ({ ['--tw-ring-color' as any]: 'var(--accent-color)' } as any) : {}) }}
                    onClick={() => handleStartListening(mapping.sceneId)}
                    disabled={isListening && listeningSceneId !== mapping.sceneId}
                  >
                    {mapping.midiNote !== null ? getNoteName(mapping.midiNote) : 'Click to map'}
                  </button>
                  
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <div className="tw-min-w-[120px]">
                      <Select
                        value={String(mapping.midiChannel)}
                        onChange={(v) => handleChannelChange(mapping.sceneId, Number(v))}
                        options={Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: `Ch ${i + 1}` }))}
                      />
                    </div>
                    
                    <button
                      className={`tw-border tw-border-neutral-700 tw-px-2 tw-py-1 tw-text-sm ${mapping.enabled ? 'tw-bg-green-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200'}`}
                      onClick={() => handleToggleEnabled(mapping.sceneId)}
                      title={mapping.enabled ? 'Disable' : 'Enable'}
                    >
                      {mapping.enabled ? 'On' : 'Off'}
                    </button>
                    
                    {mapping.midiNote !== null && (
                      <button
                        className="tw-border tw-border-neutral-700 tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-px-2 tw-py-1 tw-text-sm"
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
          <div className="tw-fixed tw-inset-0 tw-bg-black/60 tw-z-[5000]">
            <div className="tw-fixed tw-left-1/2 tw-top-1/2 tw--translate-x-1/2 tw--translate-y-1/2 tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-4 tw-text-neutral-100 tw-shadow-xl">
              <h3 className="tw-text-base tw-font-semibold">Waiting for MIDI Note...</h3>
              <p className="tw-text-sm tw-text-neutral-300 tw-mt-1">Press any key on your MIDI controller to assign it to the scene.</p>
              <button className="tw-mt-3 tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-px-3 tw-py-1.5" onClick={handleStopListening}>Cancel</button>
            </div>
          </div>
        )}

        <div className="tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-3">
          <h4 className="tw-text-sm tw-font-semibold">How to use:</h4>
          <ul className="tw-list-disc tw-list-inside tw-text-sm tw-text-neutral-300 tw-space-y-1 tw-mt-1">
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