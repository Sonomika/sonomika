import React, { useState } from 'react';
import { useStore } from '../store/store';
import { LayerEditor } from './LayerEditor';

interface LayerListProps {
  onClose: () => void;
}

export const LayerList: React.FC<LayerListProps> = ({ onClose }) => {
  const { scenes, currentSceneId, updateScene } = useStore() as any;
  const [selectedLayer, setSelectedLayer] = useState<any>(null);
  const [showLayerEditor, setShowLayerEditor] = useState(false);

  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);

  const handleEditLayer = (layer: any) => {
    setSelectedLayer(layer);
    setShowLayerEditor(true);
  };

  const handleDeleteLayer = (layerId: string) => {
    if (!currentScene) return;

    const updatedColumns = currentScene.columns.map((column: any) => ({
      ...column,
      layers: column.layers.filter((layer: any) => layer.id !== layerId)
    }));

    updateScene(currentSceneId, { columns: updatedColumns });
  };

  const handleToggleLayer = (layerId: string) => {
    if (!currentScene) return;

    const updatedColumns = currentScene.columns.map((column: any) => ({
      ...column,
      layers: column.layers.map((layer: any) => 
        layer.id === layerId 
          ? { ...layer, enabled: !layer.enabled }
          : layer
      )
    }));

    updateScene(currentSceneId, { columns: updatedColumns });
  };

  const handleLayerUpdate = (layerId: string, updates: any) => {
    if (!currentScene) return;

    const updatedColumns = currentScene.columns.map((column: any) => ({
      ...column,
      layers: column.layers.map((layer: any) => 
        layer.id === layerId 
          ? { ...layer, ...updates }
          : layer
      )
    }));

    updateScene(currentSceneId, { columns: updatedColumns });
  };

  const getLayerIcon = (type: string) => {
    switch (type) {
      case 'image':
        return '🖼️';
      case 'video':
        return '🎥';
      case 'effect':
        return '✨';
      case 'shader':
        return '🔮';
      case 'p5js':
        return '🎨';
      case 'threejs':
        return '🌐';
      default:
        return '📄';
    }
  };

  const getLayerTypeName = (type: string) => {
    switch (type) {
      case 'image':
        return 'Image';
      case 'video':
        return 'Video';
      case 'effect':
        return 'Effect';
      case 'shader':
        return 'Shader';
      case 'p5js':
        return 'p5.js';
      case 'threejs':
        return 'Three.js';
      default:
        return type;
    }
  };

  if (!currentScene) {
    return (
      <div className="layer-list-modal">
        <div className="layer-list-content">
          <div className="layer-list-header">
            <h2>Layer List</h2>
            <button onClick={onClose} className="close-button">×</button>
          </div>
          <div className="layer-list-body">
            <p>No scene selected.</p>
          </div>
        </div>
      </div>
    );
  }

  const allLayers: any[] = [];
  currentScene.columns.forEach((column: any, columnIndex: number) => {
    column.layers.forEach((layer: any) => {
      allLayers.push({
        ...layer,
        columnIndex,
        columnName: column.name || `Column ${columnIndex + 1}`
      });
    });
  });

  return (
    <>
      <div className="layer-list-modal">
        <div className="layer-list-content">
          <div className="layer-list-header">
            <h2>Layer List - {currentScene.name}</h2>
            <button onClick={onClose} className="close-button">×</button>
          </div>

          <div className="layer-list-body">
            {allLayers.length === 0 ? (
              <div className="empty-layers">
                <div className="empty-icon">📄</div>
                <h3>No Layers</h3>
                <p>Add layers using the sidebar buttons.</p>
              </div>
            ) : (
              <div className="layers-container">
                {allLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`layer-item ${!layer.enabled ? 'disabled' : ''}`}
                  >
                    <div className="layer-info">
                      <div className="layer-icon">
                        {getLayerIcon(layer.type)}
                      </div>
                      <div className="layer-details">
                        <div className="layer-name">
                          {layer.name || 'Unnamed Layer'}
                        </div>
                        <div className="layer-meta">
                          {getLayerTypeName(layer.type)} • Column {layer.columnIndex + 1}
                          {layer.asset?.name && ` • ${layer.asset.name}`}
                        </div>
                      </div>
                    </div>

                    <div className="layer-controls">
                      <button
                        className="layer-toggle"
                        onClick={() => handleToggleLayer(layer.id)}
                        title={layer.enabled ? 'Disable Layer' : 'Enable Layer'}
                      >
                        {layer.enabled ? '👁️' : '👁️‍🗨️'}
                      </button>
                      
                      <button
                        className="layer-edit"
                        onClick={() => handleEditLayer(layer)}
                        title="Edit Layer"
                      >
                        ✎
                      </button>
                      
                      <button
                        className="layer-delete"
                        onClick={() => handleDeleteLayer(layer.id)}
                        title="Delete Layer"
                      >
                        🗑️
                      </button>
                    </div>

                    <div className="layer-properties">
                      <div className="property">
                        <span className="property-label">Opacity:</span>
                        <span className="property-value">
                          {Math.round((layer.opacity || 1) * 100)}%
                        </span>
                      </div>
                      <div className="property">
                        <span className="property-label">Scale:</span>
                        <span className="property-value">
                          {layer.scale || 1}
                        </span>
                      </div>
                      <div className="property">
                        <span className="property-label">Rotation:</span>
                        <span className="property-value">
                          {layer.rotation || 0}°
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="layer-list-footer">
            <div className="layer-stats">
              <span>Total Layers: {allLayers.length}</span>
              <span>Enabled: {allLayers.filter(l => l.enabled).length}</span>
            </div>
          </div>
        </div>
      </div>

      {showLayerEditor && selectedLayer && (
        <LayerEditor
          layer={selectedLayer}
          onClose={() => {
            setShowLayerEditor(false);
            setSelectedLayer(null);
          }}
        />
      )}
    </>
  );
}; 