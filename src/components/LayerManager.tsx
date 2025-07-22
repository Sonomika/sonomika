import React, { useState } from 'react';
import { useStore } from '../store/store';
import { MediaLibrary } from './MediaLibrary';

interface LayerManagerProps {
  onClose: () => void;
}

export const LayerManager: React.FC<LayerManagerProps> = ({ onClose }) => {
  console.log('LayerManager component rendering');
  
  const { scenes, currentSceneId, setCurrentScene, addScene, removeScene, updateScene } = useStore() as any;
  const [selectedLayer, setSelectedLayer] = useState<any>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [paneSizes, setPaneSizes] = useState({
    gridHeight: 50, // percentage of viewport height - start at 50/50
    mediaLibraryHeight: 50 // percentage of viewport height
  });
  const [isResizing, setIsResizing] = useState(false);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  console.log('LayerManager state - scenes:', scenes, 'currentSceneId:', currentSceneId);

  // Helper function to get proper file path for Electron
  const getAssetPath = (asset: any) => {
    if (!asset) return '';
    console.log('getAssetPath called with asset:', asset);
    if (asset.path && asset.path.startsWith('blob:')) {
      console.log('Using blob URL:', asset.path);
      return asset.path;
    }
    if (asset.filePath) {
      const filePath = `file://${asset.filePath}`;
      console.log('Using file protocol:', filePath);
      return filePath;
    }
    if (asset.path && asset.path.startsWith('file://')) {
      console.log('Using existing file URL:', asset.path);
      return asset.path;
    }
    if (asset.path && asset.path.startsWith('local-file://')) {
      const filePath = asset.path.replace('local-file://', '');
      const standardPath = `file://${filePath}`;
      console.log('Converting local-file to file:', standardPath);
      return standardPath;
    }
    if (asset.path && asset.path.startsWith('data:')) {
      console.log('Using data URL:', asset.path);
      return asset.path;
    }
    console.log('Using fallback path:', asset.path);
    return asset.path || '';
  };

  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
  console.log('Current scene:', currentScene);

  const handleLayerClick = (layer: any, columnId: string) => {
    setSelectedLayer(layer);
    setSelectedColumn(columnId);
  };

  const handleColumnClick = (columnId: string) => {
    setSelectedColumn(columnId);
  };

  // Handle column play button
  const handleColumnPlay = (columnId: string) => {
    const column = currentScene?.columns.find((col: any) => col.id === columnId);
    if (column) {
      const layersWithContent = column.layers.filter((layer: any) => layer.asset);
      console.log('Column layers with content:', layersWithContent);
      
      if (layersWithContent.length === 0) {
        console.log('No layers with content in column:', columnId);
        return;
      }
      
      setPreviewContent({
        type: 'column',
        columnId: columnId,
        column: column,
        layers: column.layers || []
      });
      setIsPlaying(true);
      console.log('Playing column:', columnId, column);
    }
  };

  const handleLayerPlay = (layerId: string) => {
    const layer = currentScene?.columns
      .flatMap((col: any) => col.layers)
      .find((layer: any) => layer.id === layerId);
    
    if (layer && layer.asset) {
      console.log('Playing layer:', layerId, layer.asset);
      setPreviewContent({
        type: 'layer',
        layerId: layerId,
        layer: layer,
        asset: layer.asset
      });
      setIsPlaying(true);
    }
  };

  // Handle stop button
  const handleStop = () => {
    setIsPlaying(false);
    setPreviewContent(null);
  };

  const handleClearLayers = () => {
    if (currentScene) {
      const confirmed = window.confirm('Are you sure you want to clear all layers? This will remove all assets from all layers.');
      if (confirmed) {
        console.log('Starting clear layers process for scene:', currentScene.id);
        console.log('Current scene columns:', currentScene.columns.length);
        
        // Create a deep copy of the current scene
        const updatedScene = JSON.parse(JSON.stringify(currentScene));
        
        // Clear all assets from all layers and remove empty layers
        let clearedCount = 0;
        updatedScene.columns.forEach((column: any, columnIndex: number) => {
          console.log(`Processing column ${columnIndex + 1}:`, column.id);
          if (column.layers) {
            // Filter out layers that have no assets
            column.layers = column.layers.filter((layer: any) => {
              if (layer.asset) {
                console.log(`Clearing asset from layer:`, layer.asset.name);
                clearedCount++;
                return false; // Remove layers with assets
              }
              return false; // Remove all layers
            });
          }
        });
        
        console.log(`Cleared ${clearedCount} assets total`);
        
        // Update the scene with the new data
        updateScene(currentScene.id, updatedScene);
        console.log('Updated scene with cleared layers');
        
        // Force multiple refresh mechanisms
        setCurrentScene(currentScene.id);
        setRefreshTrigger(prev => prev + 1);
        
        // Force a complete re-render by updating selected states
        setSelectedLayer(null);
        setSelectedColumn(null);
        setPreviewContent(null);
        setIsPlaying(false);
        
        console.log('Forced complete component refresh');
        
        // Additional force refresh after a short delay
        setTimeout(() => {
          setRefreshTrigger(prev => prev + 1);
          console.log('Additional refresh triggered');
        }, 100);
      }
    }
  };

  const handleForceClear = () => {
    if (currentScene) {
      const confirmed = window.confirm('FORCE CLEAR: This will completely reset all layers. Are you sure?');
      if (confirmed) {
        console.log('FORCE CLEAR: Resetting scene completely');
        
        // Create a completely fresh scene with no layers at all
        const freshScene = {
          ...currentScene,
          columns: currentScene.columns.map((column: any) => ({
            ...column,
            layers: [] // Remove all layers completely
          }))
        };
        
        // Update the scene
        updateScene(currentScene.id, freshScene);
        
        // Force all state resets
        setSelectedLayer(null);
        setSelectedColumn(null);
        setPreviewContent(null);
        setIsPlaying(false);
        setRefreshTrigger(prev => prev + 1);
        
        console.log('FORCE CLEAR: Scene completely reset - all layers removed');
      }
    }
  };

  const handleRemoveAsset = (columnId: string, layerId: string) => {
    if (currentScene) {
      // Create a deep copy of the current scene
      const updatedScene = JSON.parse(JSON.stringify(currentScene));
      
      const column = updatedScene.columns.find((col: any) => col.id === columnId);
      if (column) {
        const layer = column.layers.find((layer: any) => layer.id === layerId);
        if (layer) {
          layer.asset = null;
          // Update the entire scene
          updateScene(currentScene.id, updatedScene);
          console.log('Removed asset from layer:', layerId, 'in column:', columnId);
          
          // Force component refresh
          setRefreshTrigger(prev => prev + 1);
        }
      }
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;
    
    const container = document.querySelector('.layer-manager-main');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const containerHeight = rect.height;
    const percentage = (mouseY / containerHeight) * 100;
    
    // Clamp between 20% and 80%
    const clampedPercentage = Math.max(20, Math.min(80, percentage));
    
    setPaneSizes({
      gridHeight: clampedPercentage,
      mediaLibraryHeight: 100 - clampedPercentage
    });
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing]);

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent, cellId: string) => {
    e.preventDefault();
    console.log('🔵 Drag over cell:', cellId);
    console.log('🔵 DataTransfer types:', e.dataTransfer.types);
    console.log('🔵 DataTransfer items:', e.dataTransfer.items);
    setDragOverCell(cellId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    console.log('🔴 Drag leave');
    setDragOverCell(null);
  };

  const handleDrop = (e: React.DragEvent, columnId: string, layerNum: number) => {
    e.preventDefault();
    setDragOverCell(null);
    console.log('🟢 Drop event triggered for column:', columnId, 'layer:', layerNum);
    console.log('🟢 DataTransfer types:', e.dataTransfer.types);
    console.log('🟢 DataTransfer items:', e.dataTransfer.items);
    
    const assetData = e.dataTransfer.getData('application/json');
    console.log('🟢 Asset data from drop:', assetData);
    
    if (assetData) {
      try {
        const asset = JSON.parse(assetData);
        console.log('🟢 Dropped asset:', asset, 'onto column:', columnId, 'layer:', layerNum);
        
        // Find the current scene and column
        const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
        if (!currentScene) {
          console.error('❌ No current scene found');
          return;
        }
        
        const column = currentScene.columns.find((col: any) => col.id === columnId);
        if (!column) {
          console.error('❌ Column not found:', columnId);
          return;
        }
        
        console.log('🟢 Found column:', column);
        console.log('🟢 Column layers before:', column.layers);
        
        // Find or create the layer
        let layer = column.layers.find((l: any) => 
          l.name.includes(`Layer ${layerNum}`) || 
          l.layerNum === layerNum ||
          l.name === `Layer ${layerNum}`
        );
        
        if (!layer) {
          // Create a new layer
          layer = {
            id: `layer-${columnId}-${layerNum}-${Date.now()}`,
            name: `Layer ${layerNum}`,
            type: 'media',
            columnId: columnId,
            layerNum: layerNum
          };
          
          if (!column.layers) {
            column.layers = [];
          }
          column.layers.push(layer);
          console.log('🟢 Created new layer:', layer);
        } else {
          console.log('🟢 Found existing layer:', layer);
        }
        
        // Check if this is a video asset
        const isVideo = asset.type === 'video';
        
        // If this is a video and the layer already has a video, replace it
        if (isVideo && layer.asset && layer.asset.type === 'video') {
          console.log('🟢 Replacing existing video in layer:', layer.id);
          layer.asset = asset;
        } else if (isVideo && layer.asset) {
          // If layer has a non-video asset, replace it
          console.log('🟢 Replacing non-video asset with video in layer:', layer.id);
          layer.asset = asset;
        } else if (!isVideo && layer.asset && layer.asset.type === 'video') {
          // If dropping non-video on video layer, replace video
          console.log('🟢 Replacing video with non-video asset in layer:', layer.id);
          layer.asset = asset;
        } else {
          // Normal case - just set the asset
          layer.asset = asset;
        }
        
        console.log('🟢 Layer after asset assignment:', layer);
        console.log('🟢 Column layers after:', column.layers);
        
        // Update the scene
        updateScene(currentScene.id, { columns: currentScene.columns });
        console.log('✅ Updated scene with new asset');
        
      } catch (error) {
        console.error('❌ Error processing dropped asset:', error);
      }
    } else {
      console.log('❌ No asset data found in drop event');
      console.log('❌ Available data types:', e.dataTransfer.types);
      console.log('❌ DataTransfer items:', e.dataTransfer.items);
    }
  };

  const getLayerIcon = (type: string) => {
    switch (type) {
      case 'image':
        return '🖼️';
      case 'video':
        return '🎥';
      case 'effect':
        return '✨';
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
      default:
        return 'Unknown';
    }
  };

  // Render preview content
  const renderPreviewContent = () => {
    if (!previewContent) {
      return (
        <div className="preview-placeholder">
          <div className="preview-icon">🎬</div>
          <p>No preview available</p>
          <small>Select a layer to see preview</small>
        </div>
      );
    }

    if (previewContent.type === 'column') {
      // Show the first layer with content as the main preview
      const layersWithContent = previewContent.layers.filter((layer: any) => layer.asset);
      
      if (layersWithContent.length === 0) {
        return (
          <div className="preview-column">
            <div className="preview-header-info">
              <h4>Column Preview</h4>
              <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
            </div>
            <div className="preview-placeholder">
              <div className="preview-icon">📁</div>
              <p>No media content</p>
              <small>Add media to layers to see preview</small>
            </div>
          </div>
        );
      }

      // Show the top layer as the main preview
      const topLayer = layersWithContent[0];
      return (
        <div className="preview-column">
          <div className="preview-header-info">
            <h4>Column Preview</h4>
            <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="preview-main-content">
            <div className="preview-layer-info">
              <div className="preview-layer-icon">{getLayerIcon(topLayer.type)}</div>
              <div className="preview-layer-name">{topLayer.name}</div>
            </div>
            {topLayer.asset && (
              <div className="preview-asset-display">
                {topLayer.asset.type === 'image' && (
                  <img src={getAssetPath(topLayer.asset)} alt={topLayer.asset.name} className="preview-full-image" />
                )}
                {topLayer.asset.type === 'video' && (
                  <div className="preview-video-display">
                    <video 
                      src={getAssetPath(topLayer.asset)} 
                      controls 
                      autoPlay={isPlaying}
                      className="preview-video"
                      onLoadStart={() => console.log('Video loading started:', getAssetPath(topLayer.asset))}
                      onLoadedData={() => console.log('Video data loaded:', getAssetPath(topLayer.asset))}
                      onError={(e) => {
                        console.error('Video error:', e, getAssetPath(topLayer.asset));
                        // Show error message in preview with retry option
                        const videoElement = e.target as HTMLVideoElement;
                        const container = videoElement.parentElement;
                        if (container) {
                          const assetPath = getAssetPath(topLayer.asset);
                          container.innerHTML = `
                            <div class="video-error">
                              <div class="error-icon">⚠️</div>
                              <p>Video failed to load</p>
                              <small>${topLayer.asset.name}</small>
                              <p style="font-size: 0.8rem; margin-top: 0.5rem; color: #ccc;">
                                Path: ${assetPath}
                              </p>
                              <p style="font-size: 0.8rem; margin-top: 0.5rem; color: #ccc;">
                                This might be due to CSP restrictions or invalid file path.
                              </p>
                              <button onclick="window.location.reload()" style="margin-top: 10px; padding: 5px 10px; background: #00bcd4; border: none; border-radius: 4px; color: white; cursor: pointer;">Retry</button>
                              <button onclick="this.parentElement.parentElement.innerHTML='<div style=\\'text-align: center; padding: 2rem; color: #ccc;\\'>Video unavailable</div>'" style="margin-top: 5px; padding: 5px 10px; background: #666; border: none; border-radius: 4px; color: white; cursor: pointer;">Dismiss</button>
                            </div>
                          `;
                        }
                      }}
                      onCanPlay={() => console.log('Video can play:', getAssetPath(topLayer.asset))}
                      onLoadedMetadata={() => console.log('Video metadata loaded:', getAssetPath(topLayer.asset))}
                      onCanPlayThrough={() => console.log('Video can play through:', getAssetPath(topLayer.asset))}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          {layersWithContent.length > 1 && (
            <div className="preview-layers-list">
              <h5>Other Layers ({layersWithContent.length - 1})</h5>
              {layersWithContent.slice(1).map((layer: any, index: number) => (
                <div key={layer.id} className="preview-layer-item">
                  <div className="preview-layer-icon">{getLayerIcon(layer.type)}</div>
                  <div className="preview-layer-name">{layer.name}</div>
                  {layer.asset && (
                    <div className="preview-layer-asset">
                      {layer.asset.type === 'image' && (
                        <img src={getAssetPath(layer.asset)} alt={layer.asset.name} className="preview-thumbnail" />
                      )}
                      {layer.asset.type === 'video' && (
                        <div className="preview-video-thumbnail">
                          <span>🎥</span>
                          <span>{layer.asset.name}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (previewContent.type === 'layer') {
      return (
        <div className="preview-layer">
          <div className="preview-header-info">
            <h4>Layer Preview</h4>
            <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="preview-layer-content">
            <div className="preview-layer-info">
              <div className="preview-layer-icon">{getLayerIcon(previewContent.layer.type)}</div>
              <div className="preview-layer-name">{previewContent.layer.name}</div>
            </div>
            {previewContent.asset && (
              <div className="preview-asset-display">
                {previewContent.asset.type === 'image' && (
                  <img src={getAssetPath(previewContent.asset)} alt={previewContent.asset.name} className="preview-full-image" />
                )}
                {previewContent.asset.type === 'video' && (
                  <div className="preview-video-display">
                    <video 
                      src={getAssetPath(previewContent.asset)} 
                      controls 
                      autoPlay={isPlaying}
                      className="preview-video"
                      onLoadStart={() => console.log('Video loading started:', getAssetPath(previewContent.asset))}
                      onLoadedData={() => console.log('Video data loaded:', getAssetPath(previewContent.asset))}
                      onError={(e) => {
                        console.error('Video error:', e, getAssetPath(previewContent.asset));
                        // Show error message in preview
                        const videoElement = e.target as HTMLVideoElement;
                        const container = videoElement.parentElement;
                        if (container) {
                          const assetPath = getAssetPath(previewContent.asset);
                          container.innerHTML = `
                            <div class="video-error">
                              <div class="error-icon">⚠️</div>
                              <p>Video failed to load</p>
                              <small>${previewContent.asset.name}</small>
                              <p style="font-size: 0.8rem; margin-top: 0.5rem; color: #ccc;">
                                Path: ${assetPath}
                              </p>
                              <p style="font-size: 0.8rem; margin-top: 0.5rem; color: #ccc;">
                                This might be due to CSP restrictions or invalid file path.
                              </p>
                              <button onclick="window.location.reload()" style="margin-top: 10px; padding: 5px 10px; background: #00bcd4; border: none; border-radius: 4px; color: white; cursor: pointer;">Retry</button>
                              <button onclick="this.parentElement.parentElement.innerHTML='<div style=\\'text-align: center; padding: 2rem; color: #ccc;\\'>Video unavailable</div>'" style="margin-top: 5px; padding: 5px 10px; background: #666; border: none; border-radius: 4px; color: white; cursor: pointer;">Dismiss</button>
                            </div>
                          `;
                        }
                      }}
                      onCanPlay={() => console.log('Video can play:', getAssetPath(previewContent.asset))}
                      onLoadedMetadata={() => console.log('Video metadata loaded:', getAssetPath(previewContent.asset))}
                      onCanPlayThrough={() => console.log('Video can play through:', getAssetPath(previewContent.asset))}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="preview-placeholder">
        <div className="preview-icon">🎬</div>
        <p>Preview not available</p>
      </div>
    );
  };

  if (!currentScene) {
    return (
      <div className="layer-manager-main">
        <div className="layer-manager-content">
          <div className="layer-manager-header">
            <h2>No Scene Selected</h2>
            <div className="scene-controls">
              <button onClick={addScene} className="add-scene-btn">
                + Create Scene
              </button>
            </div>
          </div>
          <div className="layer-manager-body">
            <div className="no-scene-message">
              <h3>Welcome to VJ</h3>
              <p>Create your first scene to get started</p>
              <button onClick={addScene} className="create-scene-btn">
                Create New Scene
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ensure we have at least 10 columns
  const columns = currentScene.columns.slice(0, 10);
  while (columns.length < 10) {
    columns.push({
      id: `column-${columns.length + 1}`,
      name: `Column ${columns.length + 1}`,
      layers: []
    });
  }

  try {
    console.log('LayerManager about to render main content');
    
    return (
      <div className="layer-manager-main">
        <div className="layer-manager-content">
          <div className="layer-manager-header">
            <div className="header-left">
              <h2>VJ - {currentScene.name}</h2>
              <div className="scene-selector">
                <select 
                  value={currentSceneId} 
                  onChange={(e) => setCurrentScene(e.target.value)}
                  className="scene-dropdown"
                >
                  {scenes.map((scene: any) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
                </select>
                <button onClick={addScene} className="add-scene-btn">
                  +
                </button>
              </div>
            </div>
            
            <div className="header-right">
              <div className="global-controls">
                <button className="control-btn" title="Play">▶</button>
                <button className="control-btn" title="Stop">⏹</button>
                <button className="control-btn" title="Record">⏺</button>
              </div>
              <div className="app-controls">
                <button className="control-btn" title="Settings">⚙️</button>
                <button className="control-btn" title="Help">?</button>
              </div>
            </div>
            
            {/* Standalone Clear Button for better visibility */}
            <button className="clear-layers-standalone" onClick={handleClearLayers}>
              🗑️ Clear All Layers
            </button>
            <button className="force-clear-btn" onClick={handleForceClear}>
              🧹 Force Clear All Layers
            </button>
          </div>

          <div className="layer-manager-body" style={{ height: `${paneSizes.gridHeight}%` }}>
            {/* Composition Row */}
            <div className="composition-row">
              <div className="row-header">
                <h3>Composition</h3>
              </div>
              <div className="composition-controls">
                <button className="control-btn">X</button>
                <button className="control-btn">B</button>
                <button className="control-btn">M</button>
                <button className="control-btn">S</button>
                <div className="playback-controls">
                  <button className="control-btn">⏮</button>
                  <button className="control-btn">▶</button>
                  <button className="control-btn">⏭</button>
                  <button className="control-btn">🔁</button>
                </div>
              </div>
              <div className="composition-nested">
                <div className="nested-controls">
                  <button className="control-btn">X</button>
                  <button className="control-btn">B</button>
                  <button className="control-btn">S</button>
                  <button className="control-btn">M</button>
                  <button className="control-btn">A</button>
                  <button className="control-btn">V</button>
                  <select className="add-dropdown">
                    <option>Add</option>
                  </select>
                </div>
              </div>
              {columns.map((column: any, index: number) => (
                <div key={column.id} className="column-cell">
                  <div className="column-header">
                    <h4>Column {index + 1}</h4>
                    <button className="play-btn" onClick={() => handleColumnPlay(column.id)}>▶</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Layer Rows */}
            {[3, 2, 1].map((layerNum) => (
              <div key={layerNum} className={`layer-row ${layerNum === 1 ? 'active' : ''}`}>
                <div className="row-header">
                  <h3>Layer {layerNum}</h3>
                </div>

                <div className="layer-controls">
                  <div className="layer-indicators">
                    <span className="layer-indicator">A</span>
                    <span className="layer-indicator">B</span>
                  </div>
                  <div className="layer-controls-group">
                    <button className="control-btn">X</button>
                    <button className="control-btn">B</button>
                    <button className="control-btn">S</button>
                    <button className="control-btn">M</button>
                    <button className="control-btn">A</button>
                    <button className="control-btn">V</button>
                    <select className="add-dropdown">
                      <option>Add</option>
                    </select>
                  </div>
                  <div className="playback-controls">
                    <button className="control-btn">⏮</button>
                    <button className="control-btn">▶</button>
                    <button className="control-btn">⏭</button>
                    <button className="control-btn">🔁</button>
                  </div>
                  <div className="layer-special-controls">
                    <button className="control-btn">T</button>
                    <button className="control-btn">Alph</button>
                  </div>
                </div>

                {/* Column Cells for this Layer */}
                {columns.map((column: any, colIndex: number) => {
                  // More robust layer finding - check both name and layerNum
                  const layer = column.layers.find((l: any) => 
                    l.name.includes(`Layer ${layerNum}`) || 
                    l.layerNum === layerNum ||
                    l.name === `Layer ${layerNum}`
                  );
                  
                  // Only show layer if it has an asset
                  const hasAsset = layer && layer.asset;
                  const cellId = `${column.id}-${layerNum}`;
                  const isDragOver = dragOverCell === cellId;
                  
                  // Debug logging for column 1, layer 3 specifically
                  if (colIndex === 0 && layerNum === 3) {
                    console.log('🔍 Rendering Column 1, Layer 3 cell:');
                    console.log('🔍 Cell ID:', cellId);
                    console.log('🔍 Column ID:', column.id);
                    console.log('🔍 Layer Num:', layerNum);
                    console.log('🔍 Has Asset:', hasAsset);
                    console.log('🔍 Layer:', layer);
                    console.log('🔍 Is Drag Over:', isDragOver);
                  }
                  
                  return (
                    <div
                      key={cellId}
                      className={`grid-cell ${hasAsset ? 'has-content' : 'empty'} ${selectedLayer?.id === layer?.id ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
                      onClick={() => hasAsset && handleLayerClick(layer, column.id)}
                      onDragOver={(e) => {
                        if (colIndex === 0 && layerNum === 3) {
                          console.log('🔵 Column 1, Layer 3 - Drag Over Event');
                        }
                        handleDragOver(e, cellId);
                      }}
                      onDragLeave={(e) => {
                        if (colIndex === 0 && layerNum === 3) {
                          console.log('🔴 Column 1, Layer 3 - Drag Leave Event');
                        }
                        handleDragLeave(e);
                      }}
                      onDrop={(e) => {
                        if (colIndex === 0 && layerNum === 3) {
                          console.log('🟢 Column 1, Layer 3 - Drop Event');
                        }
                        handleDrop(e, column.id, layerNum);
                      }}
                    >
                      {hasAsset ? (
                        <div className="layer-content">
                          <div className="layer-header">
                            <div className="layer-icon">{getLayerIcon(layer.type)}</div>
                            <button 
                              className="layer-play-btn" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLayerPlay(layer.id);
                              }}
                              title="Play Layer"
                            >
                              ▶
                            </button>
                          </div>
                          <div className="layer-name">
                            {layer.name}
                            <button 
                              className="asset-delete-btn" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveAsset(column.id, layer.id);
                              }}
                              title={`Remove ${layer.asset.name}`}
                            >
                              🗑️
                            </button>
                          </div>
                          <div className="layer-asset">
                            {layer.asset.type === 'image' && (
                                <img
                                  src={getAssetPath(layer.asset)}
                                  alt={layer.asset.name}
                                  className="asset-thumbnail"
                                />
                            )}
                            {layer.asset.type === 'video' && (
                              <div className="video-thumbnail">
                                <span>🎥</span>
                                <span>{layer.asset.name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="empty-cell">
                          <span>empty</span>
                          {isDragOver && (
                            <div className="drop-indicator">
                              <span>Drop here</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Resize Handle */}
          <div 
            className={`resize-handle ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleResizeStart}
            style={{ cursor: 'ns-resize' }}
          >
            <div className="resize-indicator">⋮⋮</div>
          </div>

          {/* Bottom Section with Preview and Media Library */}
          <div 
            className="bottom-section"
            style={{ height: `${paneSizes.mediaLibraryHeight}%` }}
          >
            {/* Preview Window - Bottom Left */}
            <div className="preview-window">
              <div className="preview-header">
                <h3>Preview</h3>
                <div className="preview-controls">
                  <button 
                    className="control-btn" 
                    onClick={handleStop}
                    title="Stop Preview"
                    disabled={!isPlaying}
                  >
                    ⏹
                  </button>
                  <button className="control-btn" title="Fullscreen">⛶</button>
                  <button className="control-btn" title="Settings">⚙️</button>
                </div>
              </div>
              <div className="preview-content">
                {renderPreviewContent()}
              </div>
            </div>

            {/* Media Library - Bottom Right */}
            <div className="layer-manager-media-library">
              <MediaLibrary onClose={() => {}} isEmbedded={true} />
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering LayerManager:', error);
    return (
      <div className="layer-manager-main">
        <div className="layer-manager-content">
          <h2>Error Loading Layer Manager</h2>
          <p>There was an error loading the Layer Manager. Please try refreshing the page.</p>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      </div>
    );
  }
};