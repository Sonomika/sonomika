import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Slider, Select } from './ui';
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
          <div style={{ maxWidth: 260 }}>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={layer.opacity || 1}
              onChange={(v) => handleLayerUpdate({ opacity: v })}
            />
          </div>
        </div>

        <div className="control-group">
          <label>Scale: {layer.scale || 1}</label>
          <div style={{ maxWidth: 260 }}>
            <Slider
              min={0.1}
              max={3}
              step={0.1}
              value={layer.scale || 1}
              onChange={(v) => handleLayerUpdate({ scale: v })}
            />
          </div>
        </div>

        <div className="control-group">
          <label>Rotation: {layer.rotation || 0}°</label>
          <div style={{ maxWidth: 260 }}>
            <Slider
              min={0}
              max={360}
              step={1}
              value={layer.rotation || 0}
              onChange={(v) => handleLayerUpdate({ rotation: Math.round(v) })}
            />
          </div>
        </div>

        <div className="control-group">
          <label>Blend Mode:</label>
          <div style={{ maxWidth: 260 }}>
            <Select
              value={(layer.blendMode || 'normal') as string}
              onChange={(v) => handleLayerUpdate({ blendMode: v as string })}
              options={[
                'normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion'
              ].map(m => ({ value: m }))}
            />
          </div>
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
          <div style={{ maxWidth: 260 }}>
            <Select
              value={layer.type as string}
              onChange={(v) => handleLayerUpdate({ type: v as string })}
              options={[ 'effect','image','video','shader','p5js','threejs' ].map(t => ({ value: t }))}
            />
          </div>
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
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'preview' | 'controls' | 'settings')}>
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="controls">Controls</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <div className="layer-editor-body">{renderLayerContent()}</div>
            </TabsContent>
            <TabsContent value="controls">
              <div className="layer-editor-body">{renderLayerControls()}</div>
            </TabsContent>
            <TabsContent value="settings">
              <div className="layer-editor-body">{renderLayerSettings()}</div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}; 