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
      <div className={`tw-fixed tw-top-0 tw-left-0 tw-h-screen tw-overflow-y-auto tw-z-[100] tw-transition-transform tw-bg-neutral-900 tw-border-r tw-border-neutral-800 tw-p-4 ${sidebarVisible ? 'tw-translate-x-0 tw-w-[280px]' : '-tw-translate-x-full tw-w-[280px]'}`}>
        <div className="tw-flex tw-items-center tw-justify-between tw-mb-4">
          <h2 className="tw-text-white tw-text-lg tw-font-semibold">VJ Control Panel</h2>
          <button onClick={toggleSidebar} className="tw-rounded tw-border tw-border-neutral-700 tw-text-neutral-300 tw-w-8 tw-h-8 hover:tw-bg-neutral-800">×</button>
        </div>

        <div className="tw-space-y-8">
          {/* Scene Management */}
          <section>
            <h2 className="tw-text-sm tw-font-semibold tw-text-neutral-300 tw-mb-2">Scene Management</h2>
            <div className="tw-flex tw-flex-col tw-gap-2">
              {scenes.map((scene: any) => (
                <div
                  key={scene.id}
                  className={`tw-flex tw-items-center tw-justify-between tw-rounded tw-border tw-px-2 tw-py-1 ${scene.id === currentSceneId ? 'tw-bg-neutral-800 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-900 tw-border-neutral-800 tw-text-neutral-300 hover:tw-bg-neutral-800'}`}
                >
                  <span onClick={() => setCurrentScene(scene.id)} className="tw-cursor-pointer">
                    {scene.name}
                  </span>
                  <div>
                    <button onClick={() => removeScene(scene.id)} className="tw-rounded tw-border tw-border-neutral-700 tw-text-neutral-300 tw-w-6 tw-h-6 hover:tw-bg-neutral-800">×</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addScene} className="tw-mt-2 tw-w-full tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700">
              Add Scene
            </button>
          </section>

          {/* Layer Management */}
          <section>
            <h2 className="tw-text-sm tw-font-semibold tw-text-neutral-300 tw-mb-2">Layer Management</h2>
            <div className="tw-flex tw-flex-col tw-gap-2">
              <button
                className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700"
                onClick={() => setShowLayerList(true)}
              >
                Layer List
              </button>
              <button
                className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700"
                onClick={() => setShowLayerManager(true)}
              >
                Full Layer Manager
              </button>
              <button
                className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700"
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
                Add Image Layer
              </button>
              <button
                className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700"
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
                Add Video Layer
              </button>
              <button
                className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700"
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
                Add Effect Layer
              </button>
            </div>
          </section>

          {/* Media Library */}
          <section>
            <h2 className="tw-text-sm tw-font-semibold tw-text-neutral-300 tw-mb-2">Media Library</h2>
            <button
              className="tw-rounded tw-border tw-border-neutral-700 tw-bg-purple-600 hover:tw-bg-purple-500 tw-text-white tw-px-3 tw-py-2"
              onClick={() => setShowMediaLibrary(true)}
            >
              Open Media Library
            </button>
          </section>

          {/* BPM Controls */}
          <section>
            <h2 className="tw-text-sm tw-font-semibold tw-text-neutral-300 tw-mb-2">BPM Control</h2>
            <div className="tw-flex tw-flex-col tw-gap-2">
              <div className="tw-inline-flex tw-items-center tw-gap-2 tw-text-sm tw-text-neutral-200">
                <span>BPM: {bpm}</span>
              </div>
              <div className="tw-px-2">
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
          <section>
            <h2 className="tw-text-sm tw-font-semibold tw-text-neutral-300 tw-mb-2">MIDI Devices</h2>
            <div className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-3 tw-text-neutral-400">No MIDI devices connected</div>
            <div className="tw-mt-2 tw-flex tw-gap-2">
              <button className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700">
                Map MIDI Controls
              </button>
              <button className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-2 hover:tw-bg-neutral-700">
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