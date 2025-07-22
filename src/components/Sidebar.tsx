import React, { useState } from 'react';
import { useStore } from '../store/store';
import { MIDIManager } from '../midi/MIDIManager';
import { BPMManager } from '../engine/BPMManager';
import { MIDIMapper } from './MIDIMapper';
import { MIDISceneMapper } from './MIDISceneMapper';
import { MediaLibrary } from './MediaLibrary';
import { TransitionSettings } from './TransitionSettings';
import { AppState } from '../store/types';

type StoreActions = {
  setCurrentScene: (sceneId: string) => void;
  addScene: () => void;
  removeScene: (sceneId: string) => void;
  updateScene: (sceneId: string, updates: Partial<AppState['scenes'][0]>) => void;
  addColumn: (sceneId: string) => void;
  setBpm: (bpm: number) => void;
  toggleSidebar: () => void;
};

type Store = AppState & StoreActions;

export const Sidebar: React.FC = () => {
  const {
    scenes,
    currentSceneId,
    sidebarVisible,
    addScene,
    removeScene,
    setCurrentScene,
    updateScene,
    setBpm,
    bpm,
  } = useStore() as Store;

  const [showMIDIMapper, setShowMIDIMapper] = useState(false);
  const [showMIDISceneMapper, setShowMIDISceneMapper] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showTransitionSettings, setShowTransitionSettings] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

  const handleAddScene = () => {
    addScene();
  };

  const handleEditScene = (sceneId: string) => {
    setEditingSceneId(sceneId);
  };

  const handleSaveSceneName = (sceneId: string, newName: string) => {
    updateScene(sceneId, { name: newName });
    setEditingSceneId(null);
  };

  const handleRemoveScene = (sceneId: string) => {
    if (scenes.length > 1) {
      removeScene(sceneId);
    }
  };

  const handleTapTempo = () => {
    BPMManager.getInstance().tap();
  };

  if (!sidebarVisible) return null;

  return (
    <div className="sidebar">
      <section className="sidebar-section">
        <h2>BPM</h2>
        <div className="bpm-controls">
          <input
            type="number"
            min={30}
            max={300}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          <button onClick={handleTapTempo}>Tap</button>
        </div>
      </section>

      <section className="sidebar-section">
        <h2>Scenes</h2>
        <div className="scene-list">
          {scenes.map(scene => (
            <div
              key={scene.id}
              className={`scene-tab ${scene.id === currentSceneId ? 'active' : ''}`}
            >
              {editingSceneId === scene.id ? (
                <input
                  type="text"
                  defaultValue={scene.name}
                  onBlur={(e) => handleSaveSceneName(scene.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveSceneName(scene.id, e.currentTarget.value);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <div
                  className="scene-name"
                  onClick={() => setCurrentScene(scene.id)}
                >
                  {scene.name}
                </div>
              )}
              
              <div className="scene-actions">
                <button
                  className="scene-edit"
                  onClick={() => handleEditScene(scene.id)}
                  title="Edit Scene"
                >
                  ✎
                </button>
                {scenes.length > 1 && (
                  <button
                    className="scene-remove"
                    onClick={() => handleRemoveScene(scene.id)}
                    title="Remove Scene"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={handleAddScene}>+ New Scene</button>
          <button
            className="scene-settings-button"
            onClick={() => setShowTransitionSettings(true)}
          >
            Transition Settings
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <h2>Media</h2>
        <div className="media-controls">
          <button
            className="media-library-button"
            onClick={() => setShowMediaLibrary(true)}
          >
            Media Library
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <h2>MIDI Devices</h2>
        <div className="midi-devices">
          {MIDIManager.getInstance().getInputs().map(input => (
            <div key={input.id} className="midi-device connected">
              {input.name}
            </div>
          ))}
          {MIDIManager.getInstance().getInputs().length === 0 && (
            <div className="midi-device">No MIDI devices connected</div>
          )}
        </div>
        <div className="midi-buttons">
          <button
            className="midi-map-button"
            onClick={() => setShowMIDIMapper(true)}
          >
            MIDI Mapping
          </button>
          <button
            className="midi-scene-map-button"
            onClick={() => setShowMIDISceneMapper(true)}
          >
            MIDI Scene Mapping
          </button>
        </div>
      </section>

      {showMIDIMapper && (
        <MIDIMapper onClose={() => setShowMIDIMapper(false)} />
      )}

      {showMIDISceneMapper && (
        <MIDISceneMapper onClose={() => setShowMIDISceneMapper(false)} />
      )}

      {showMediaLibrary && (
        <MediaLibrary onClose={() => setShowMediaLibrary(false)} />
      )}

      {showTransitionSettings && (
        <TransitionSettings onClose={() => setShowTransitionSettings(false)} />
      )}
    </div>
  );
}; 