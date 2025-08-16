import React, { useState } from 'react';
import { Slider } from './ui';
import { useStore } from '../store/store';
import { MediaLibrary } from './MediaLibrary';
import { LayerList } from './LayerList';
import { LayerManager } from './LayerManager';

export const Sidebar: React.FC = () => {
  const { 
    scenes, 
    currentSceneId, 
    setCurrentScene, 
    addScene, 
    removeScene, 
    updateScene,
    sidebarVisible,
    toggleSidebar,
    bpm,
    setBpm
  } = useStore() as any;

  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showLayerList, setShowLayerList] = useState(false);
  const [showLayerManager, setShowLayerManager] = useState(false);

  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);

  return (
    <>
      <div className={`sidebar ${sidebarVisible ? '' : 'hidden'}`}>
        <div className="sidebar-header">
          <h2>VJ Control Panel</h2>
          <button onClick={toggleSidebar} className="close-sidebar">×</button>
        </div>

        <div className="sidebar-content">
          {/* Scene Management */}
          <section className="sidebar-section">
            <h2>Scene Management</h2>
            <div className="scene-list">
              {scenes.map((scene: any) => (
                <div
                  key={scene.id}
                  className={`scene-tab ${scene.id === currentSceneId ? 'active' : ''}`}
                >
                  <span onClick={() => setCurrentScene(scene.id)}>
                    {scene.name}
                  </span>
                  <div className="scene-actions">
                    <button onClick={() => removeScene(scene.id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addScene} className="add-scene-btn">
              + Add Scene
            </button>
          </section>

          {/* Layer Management */}
          <section className="sidebar-section">
            <h2>Layer Management</h2>
            <div className="layer-controls">
              <button
                className="layer-list-button"
                onClick={() => setShowLayerList(true)}
              >
                📋 Layer List
              </button>
              <button
                className="layer-manager-button"
                onClick={() => setShowLayerManager(true)}
              >
                🎛️ Full Layer Manager
              </button>
              <button
                className="add-layer-button"
                onClick={() => {
                  const currentScene = scenes.find((s: any) => s.id === currentSceneId);
                  if (currentScene && currentScene.columns.length > 0) {
                    const firstColumn = currentScene.columns[0];
                    const newLayer = {
                      id: `layer-${Date.now()}`,
                      name: 'New Image Layer',
                      type: 'image' as const,
                      enabled: true,
                      opacity: 1,
                      scale: 1,
                      rotation: 0,
                      position: { x: 0.5, y: 0.5 },
                      fitMode: 'cover',
                      blendMode: 'normal' as const,
                      solo: false,
                      mute: false,
                      locked: false,
                      params: {}
                    };
                    firstColumn.layers.push(newLayer);
                    updateScene(currentSceneId, { columns: currentScene.columns });
                  }
                }}
              >
                + Image Layer
              </button>
              <button
                className="add-layer-button"
                onClick={() => {
                  const currentScene = scenes.find((s: any) => s.id === currentSceneId);
                  if (currentScene && currentScene.columns.length > 0) {
                    const firstColumn = currentScene.columns[0];
                    const newLayer = {
                      id: `layer-${Date.now()}`,
                      name: 'New Video Layer',
                      type: 'video' as const,
                      enabled: true,
                      opacity: 1,
                      scale: 1,
                      rotation: 0,
                      position: { x: 0.5, y: 0.5 },
                      fitMode: 'cover',
                      loop: false,
                      muted: true,
                      autoplay: false,
                      bpmSync: false,
                      blendMode: 'normal' as const,
                      solo: false,
                      mute: false,
                      locked: false,
                      params: {}
                    };
                    firstColumn.layers.push(newLayer);
                    updateScene(currentSceneId, { columns: currentScene.columns });
                  }
                }}
              >
                + Video Layer
              </button>
              <button
                className="add-layer-button"
                onClick={() => {
                  const currentScene = scenes.find((s: any) => s.id === currentSceneId);
                  if (currentScene && currentScene.columns.length > 0) {
                    const firstColumn = currentScene.columns[0];
                    const newLayer = {
                      id: `layer-${Date.now()}`,
                      name: 'New Effect Layer',
                      type: 'image' as const, // Using image type for now since effect isn't in LayerType
                      enabled: true,
                      opacity: 1,
                      scale: 1,
                      rotation: 0,
                      effect: null, // Will be set by effect system
                      blendMode: 'normal' as const,
                      solo: false,
                      mute: false,
                      locked: false,
                      params: {}
                    };
                    firstColumn.layers.push(newLayer);
                    updateScene(currentSceneId, { columns: currentScene.columns });
                  }
                }}
              >
                + Effect Layer
              </button>
            </div>
          </section>

          {/* Media Library */}
          <section className="sidebar-section">
            <h2>Media Library</h2>
            <button
              className="media-library-button"
              onClick={() => setShowMediaLibrary(true)}
            >
              📁 Open Media Library
            </button>
          </section>

          {/* BPM Controls */}
          <section className="sidebar-section">
            <h2>BPM Control</h2>
            <div className="bpm-controls">
              <div className="bpm-display">
                <span>BPM: {bpm}</span>
              </div>
              <div style={{ padding: '0 8px' }}>
                <Slider
                  min={60}
                  max={200}
                  step={1}
                  value={bpm}
                  onChange={(v) => setBpm(Math.round(Number(v)))}
                />
              </div>
            </div>
          </section>

          {/* MIDI Devices */}
          <section className="sidebar-section">
            <h2>MIDI Devices</h2>
            <div className="midi-devices">
              <div className="midi-device">
                <span>No MIDI devices connected</span>
              </div>
            </div>
            <div className="midi-buttons">
              <button className="midi-map-button">
                Map MIDI Controls
              </button>
              <button className="midi-scene-map-button">
                Map MIDI to Scenes
              </button>
            </div>
          </section>
        </div>
      </div>

      {showMediaLibrary && (
        <MediaLibrary onClose={() => setShowMediaLibrary(false)} />
      )}

      {showLayerList && (
        <LayerList onClose={() => setShowLayerList(false)} />
      )}

      {showLayerManager && (
        <LayerManager onClose={() => setShowLayerManager(false)} />
      )}
    </>
  );
}; 