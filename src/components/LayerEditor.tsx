import React, { useState } from 'react';
import { ImageLayer } from './ImageLayer';
import { VideoLayer } from './VideoLayer';
import { useStore } from '../store/store';

interface LayerEditorProps {
  layer: any;
  onClose: () => void;
}

export const LayerEditor: React.FC<LayerEditorProps> = ({ layer, onClose }) => {
  const { updateLayer } = useStore() as any;
  const [activeTab, setActiveTab] = useState<'preview' | 'controls' | 'settings'>('preview');

  const handleLayerUpdate = (updates: any) => {
    updateLayer(layer.id, updates);
  };

  const renderLayerContent = () => {
    switch (layer.type) {
      case 'image':
        return (
          <ImageLayer
            layer={layer}
            width={400}
            height={300}
            onUpdate={handleLayerUpdate}
          />
        );
      
      case 'video':
        return (
          <VideoLayer
            layer={layer}
            width={400}
            height={300}
            onUpdate={handleLayerUpdate}
          />
        );
      
      case 'effect':
        return (
          <div className="effect-layer-preview">
            <h3>Effect Layer: {layer.name}</h3>
            <p>Effect layers are rendered in the composition screen.</p>
          </div>
        );
      
      case 'shader':
        return (
          <div className="shader-layer-preview">
            <h3>Shader Layer: {layer.name}</h3>
            <p>GLSL shader rendering will be implemented.</p>
          </div>
        );
      
      case 'p5js':
        return (
          <div className="p5js-layer-preview">
            <h3>p5.js Layer: {layer.name}</h3>
            <p>p5.js sketch rendering will be implemented.</p>
          </div>
        );
      
      case 'threejs':
        return (
          <div className="threejs-layer-preview">
            <h3>Three.js Layer: {layer.name}</h3>
            <p>Three.js 3D rendering will be implemented.</p>
          </div>
        );
      
      default:
        return (
          <div className="unknown-layer-preview">
            <h3>Unknown Layer Type: {layer.type}</h3>
            <p>This layer type is not yet supported.</p>
          </div>
        );
    }
  };

  const renderLayerControls = () => {
    return (
      <div className="layer-controls-panel">
        <h3>Layer Controls</h3>
        
        <div className="control-group">
          <label>Layer Name:</label>
          <input
            type="text"
            value={layer.name || 'Unnamed Layer'}
            onChange={(e) => handleLayerUpdate({ name: e.target.value })}
            className="layer-name-input"
          />
        </div>

        <div className="control-group">
          <label>Opacity: {Math.round((layer.opacity || 1) * 100)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={layer.opacity || 1}
            onChange={(e) => handleLayerUpdate({ opacity: parseFloat(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label>Scale: {layer.scale || 1}</label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={layer.scale || 1}
            onChange={(e) => handleLayerUpdate({ scale: parseFloat(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label>Rotation: {layer.rotation || 0}°</label>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            value={layer.rotation || 0}
            onChange={(e) => handleLayerUpdate({ rotation: parseInt(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label>Blend Mode:</label>
          <select
            value={layer.blendMode || 'normal'}
            onChange={(e) => handleLayerUpdate({ blendMode: e.target.value })}
          >
            <option value="normal">Normal</option>
            <option value="multiply">Multiply</option>
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="darken">Darken</option>
            <option value="lighten">Lighten</option>
            <option value="color-dodge">Color Dodge</option>
            <option value="color-burn">Color Burn</option>
            <option value="hard-light">Hard Light</option>
            <option value="soft-light">Soft Light</option>
            <option value="difference">Difference</option>
            <option value="exclusion">Exclusion</option>
          </select>
        </div>

        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={layer.enabled !== false}
              onChange={(e) => handleLayerUpdate({ enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>

        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={layer.locked || false}
              onChange={(e) => handleLayerUpdate({ locked: e.target.checked })}
            />
            Locked
          </label>
        </div>
      </div>
    );
  };

  const renderLayerSettings = () => {
    return (
      <div className="layer-settings-panel">
        <h3>Layer Settings</h3>
        
        <div className="control-group">
          <label>Layer Type:</label>
          <select
            value={layer.type || 'effect'}
            onChange={(e) => handleLayerUpdate({ type: e.target.value })}
            disabled
          >
            <option value="effect">Effect</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="shader">Shader</option>
            <option value="p5js">p5.js</option>
            <option value="threejs">Three.js</option>
          </select>
        </div>

        <div className="control-group">
          <label>Layer ID:</label>
          <input
            type="text"
            value={layer.id}
            readOnly
            className="layer-id-input"
          />
        </div>

        {layer.metadata && (
          <div className="layer-metadata">
            <h4>Metadata</h4>
            <div className="metadata-grid">
              {Object.entries(layer.metadata).map(([key, value]) => (
                <div key={key} className="metadata-item">
                  <span className="metadata-key">{key}:</span>
                  <span className="metadata-value">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="layer-editor-modal">
      <div className="layer-editor-content">
        <div className="layer-editor-header">
          <h2>Layer Editor: {layer.name}</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="layer-editor-tabs">
          <button
            className={`tab-button ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          <button
            className={`tab-button ${activeTab === 'controls' ? 'active' : ''}`}
            onClick={() => setActiveTab('controls')}
          >
            Controls
          </button>
          <button
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        <div className="layer-editor-body">
          {activeTab === 'preview' && renderLayerContent()}
          {activeTab === 'controls' && renderLayerControls()}
          {activeTab === 'settings' && renderLayerSettings()}
        </div>
      </div>
    </div>
  );
}; 