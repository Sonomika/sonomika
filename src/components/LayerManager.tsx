import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/store';
import { LayerOptions } from './LayerOptions';
import { CanvasRenderer } from './CanvasRenderer';
import { ColumnPreview } from './ColumnPreview';
// import { MediaBrowser } from './MediaBrowser';
import { MediaLibrary } from './MediaLibrary';
import { Timeline } from './Timeline';
import TimelineComposer from './TimelineComposer';
import { BPMManager } from '../engine/BPMManager';
import { v4 as uuidv4 } from 'uuid';
import { getAssetPath, createColumn, getDefaultEffectParams, handleDragOver, handleDragLeave, handleLayerClick, handleStop } from '../utils/LayerManagerUtils';
import { handleDrop, handleLayerReorderDragStart, handleLayerReorderDragOver, handleLayerReorderDrop } from '../utils/DragDropHandlers';
import { handleColumnPlay, handleUpdateLayer } from '../utils/LayerManagementHandlers';
import { createSceneContextMenu } from '../utils/SceneManagementHandlers';
import { EffectsBrowser } from './EffectsBrowser';
import { MIDIMapper } from './MIDIMapper';
import { LFOMapper } from './LFOMapper';
import { ButtonGroup } from './ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui';


interface LayerManagerProps {
  onClose: () => void;
  debugMode?: boolean;
}

// Memoized at module scope to preserve component identity across renders
const MemoMediaLibrary = React.memo(MediaLibrary);

export const LayerManager: React.FC<LayerManagerProps> = ({ onClose, debugMode = false }) => {
  console.log('LayerManager component rendering');
  
  const { scenes, currentSceneId, setCurrentScene, addScene, removeScene, updateScene, compositionSettings, bpm, setBpm, playingColumnId, isGlobalPlaying, playColumn, stopColumn, globalPlay, globalPause, globalStop, clearStorage } = useStore() as any;
  const [bpmInputValue, setBpmInputValue] = useState(bpm.toString());
  
  // Sync local BPM input with store BPM
  useEffect(() => {
    setBpmInputValue(bpm.toString());
  }, [bpm]);
  
  // Initialize BPMManager with store BPM
  useEffect(() => {
    const bpmManager = BPMManager.getInstance();
    bpmManager.setBPM(bpm);
  }, [bpm]);
  
  console.log('LayerManager store state:', { scenes: scenes?.length, currentSceneId, compositionSettings });
  
  const [selectedLayer, setSelectedLayer] = useState<any>(null);
  const [selectedGlobalEffectKey, setSelectedGlobalEffectKey] = useState<string | null>(null);
  // Selected column is currently not used in UI state; pass no-op where needed
  const [paneSizes, setPaneSizes] = useState({
    gridHeight: 50, // percentage of viewport height - start at 50/50
    mediaLibraryHeight: 50 // percentage of viewport height
  });
  const [isResizing, setIsResizing] = useState(false);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [, setRefreshTrigger] = useState(0);

  const [showTimeline, setShowTimeline] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState<string | false>(false);
  const [draggedLayer, setDraggedLayer] = useState<any>(null);
  const [dragOverLayer, setDragOverLayer] = useState<string | null>(null);
  const [contextHighlightedCell, setContextHighlightedCell] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    layerId: string | null;
    columnId: string | null;
  }>({ visible: false, x: 0, y: 0, layerId: null, columnId: null });

  // Clipboard state for copy/paste columns, cells, and clips
  const [clipboard, setClipboard] = useState<{
    type: 'column' | 'cell' | 'clip';
    data: any;
    sourceSceneId: string;
  } | null>(null);

  const handleMediaLibClose = useCallback(() => {}, []);

  // Close context menu
  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, layerId: null, columnId: null });
    setContextHighlightedCell(null);
  }, []);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        handleContextMenuClose();
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.visible, handleContextMenuClose]);

  // Memoized callback for timeline preview updates
  const handleTimelinePreviewUpdate = useCallback((previewContent: any) => {
    setPreviewContent(previewContent);
    
    // Update isPlaying state based on previewContent.isPlaying
    if (previewContent && typeof previewContent.isPlaying === 'boolean') {
      console.log('🎭 LayerManager updating isPlaying to:', previewContent.isPlaying);
      setIsPlaying(previewContent.isPlaying);
    }
  }, []);

  console.log('LayerManager state - scenes:', scenes, 'currentSceneId:', currentSceneId);
  console.log('🎭 Preview state - previewContent:', previewContent, 'isPlaying:', isPlaying);



  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
  console.log('Current scene:', currentScene);

  const handleLayerClickWrapper = (layer: any, columnId: string) => {
    handleLayerClick(layer, columnId, setSelectedLayer, () => {});
  };

  // const handleColumnClickWrapper = (columnId: string) => {
  //   handleColumnClick(columnId, setSelectedColumn);
  // };

  // Handle column play button
  const handleColumnPlayWrapper = (columnId: string) => {
    handleColumnPlay(columnId, currentScene, setPreviewContent, setIsPlaying, playColumn);
  };

  // const handleLayerPlayWrapper = (layerId: string) => {
  //   handleLayerPlay(layerId, currentScene, setPreviewContent, setIsPlaying);
  // };

  // Handle stop button
  const handleStopWrapper = () => {
    handleStop(setIsPlaying, setPreviewContent, stopColumn, clearStorage);
  };

  // const handleClearLayersWrapper = () => {
  //   handleClearLayers(currentScene, updateScene, setCurrentScene, setRefreshTrigger, setSelectedLayer, setSelectedColumn, setPreviewContent, setIsPlaying);
  // };

  // const handleForceClearWrapper = () => {
  //   handleForceClear(currentScene, updateScene, setSelectedLayer, setSelectedColumn, setPreviewContent, setIsPlaying, setRefreshTrigger);
  // };

  // const handleRemoveAssetWrapper = (columnId: string, layerId: string) => {
  //   handleRemoveAsset(columnId, layerId, currentScene, updateScene, setRefreshTrigger);
  // };

  const handleUpdateLayerWrapper = (layerId: string, updatedLayer: any) => {
    handleUpdateLayer(layerId, updatedLayer, currentScene, updateScene, setSelectedLayer, setRefreshTrigger);
  };

  // Unified updater: handles real layers and pseudo global-effect layers
  const handleUpdateSelectedLayer = (layerId: string, options: any) => {
    if (layerId.startsWith('global-effect-layer-')) {
      if (!currentScene) return;
      if (!selectedGlobalEffectKey) return;
      const [indexStr] = selectedGlobalEffectKey.split(':');
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx)) return;
      const currentGlobalEffects = currentScene.globalEffects || [];
      if (!currentGlobalEffects[idx]) return;
      const updatedEffects = [...currentGlobalEffects];
      const updatedSlot = { ...updatedEffects[idx] } as any;
      if (options.params) {
        updatedSlot.params = options.params;
      }
      // Future: support blend/opacity if needed for global context
      updatedEffects[idx] = updatedSlot;
      updateScene(currentSceneId, { globalEffects: updatedEffects });
      // Keep the pseudo layer in sync for instant UI feedback
      setSelectedLayer((prev: any) => (prev && prev.id === layerId ? { ...prev, ...options } : prev));
      return;
    }
    // Fallback to regular layer update
    handleUpdateLayerWrapper(layerId, options);
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
    if (!isResizing) return;

    // Add a class to body to indicate resizing is active
    document.body.classList.add('resizing');
    
    const handleMouseMove = (e: MouseEvent) => handleResizeMove(e);
    const handleMouseUp = () => handleResizeEnd();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('resizing');
    };
  }, [isResizing]);

  // Drag and Drop Handlers
  const handleDragOverWrapper = (e: React.DragEvent, cellId: string) => {
    handleDragOver(e, cellId, setDragOverCell);
  };

  const handleDragLeaveWrapper = (e: React.DragEvent) => {
    handleDragLeave(e, setDragOverCell);
  };

  const handleDropWrapper = (e: React.DragEvent, columnId: string, layerNum: number) => {
    const wasPlayingThisColumn = playingColumnId === columnId;
    console.log('🎵 Before drop - Column playing state:', { columnId, wasPlayingThisColumn, playingColumnId });
    
    handleDrop(e, columnId, layerNum, scenes, currentSceneId, updateScene, setDragOverCell);
    
    // Keep playback running if this column was already playing
    if (wasPlayingThisColumn) {
      console.log('🎵 Restoring playback for column:', columnId);
      // Use multiple attempts to ensure playback restoration
      const restorePlayback = (attempts = 0) => {
        const maxAttempts = 3;
        try {
          setIsPlaying(true);
          playColumn(columnId);
          console.log('🎵 Playback restored successfully for column:', columnId);
        } catch (err) {
          console.warn(`Failed to reassert play after drop (attempt ${attempts + 1}):`, err);
          if (attempts < maxAttempts - 1) {
            setTimeout(() => restorePlayback(attempts + 1), 200);
          }
        }
      };
      
      // Initial attempt with small delay
      setTimeout(() => restorePlayback(), 100);
    }
  };

  // const handleLayerDragStartWrapper = (e: React.DragEvent, layer: any, columnId: string) => {
  //   handleLayerDragStart(e, layer, columnId);
  // };



  // Handle drag end
  const handleDragEnd = () => {
    setDragOverCell(null);
    setDraggedLayer(null);
    setDragOverLayer(null);
  };

  // Handle right-click on column cells
  const handleCellRightClick = (e: React.MouseEvent, layer: any, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      layerId: layer?.id || 'unknown',
      columnId: columnId
    });
    setContextHighlightedCell(`${columnId}-${layer?.layerNum || (layer?.name?.split(' ')[1] || '')}`);
  };



  // Delete layer from column
  const handleDeleteLayer = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const updatedColumns = currentScene.columns.map((column: any) => {
          if (column.id === contextMenu.columnId) {
            return {
              ...column,
              layers: column.layers.filter((layer: any) => layer.id !== contextMenu.layerId)
            };
          }
          return column;
        });

        updateScene(currentSceneId, { columns: updatedColumns });
        console.log(`🗑️ Deleted layer ${contextMenu.layerId} from column ${contextMenu.columnId}`);
      }
    }
    handleContextMenuClose();
  };

  // Copy column
  const handleCopyColumn = () => {
    if (contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const columnToCopy = currentScene.columns.find((col: any) => col.id === contextMenu.columnId);
        if (columnToCopy) {
          setClipboard({
            type: 'column',
            data: { ...columnToCopy },
            sourceSceneId: currentSceneId
          });
          console.log(`📋 Copied column ${columnToCopy.name} to clipboard`);
        }
      }
    }
    handleContextMenuClose();
  };

  // Paste column
  const handlePasteColumn = () => {
    if (clipboard && clipboard.type === 'column' && clipboard.data) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const pastedColumn = {
          ...clipboard.data,
          id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: `${clipboard.data.name} (Copy)`,
          layers: clipboard.data.layers.map((layer: any) => ({
            ...layer,
            id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          }))
        };

        const updatedColumns = [...currentScene.columns, pastedColumn];
        updateScene(currentSceneId, { columns: updatedColumns });
        console.log(`📋 Pasted column ${pastedColumn.name} to scene ${currentSceneId}`);
      }
    }
    handleContextMenuClose();
  };

  // Copy cell
  const handleCopyCell = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const column = currentScene.columns.find((col: any) => col.id === contextMenu.columnId);
        if (column) {
          const cellToCopy = column.layers.find((layer: any) => layer.id === contextMenu.layerId);
          if (cellToCopy) {
            setClipboard({
              type: 'cell',
              data: { ...cellToCopy },
              sourceSceneId: currentSceneId
            });
            console.log(`📋 Copied cell ${cellToCopy.name} to clipboard`);
          }
        }
      }
    }
    handleContextMenuClose();
  };

  // Paste cell
  const handlePasteCell = () => {
    if (clipboard && clipboard.type === 'cell' && clipboard.data && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        // Determine target column and layer number from the highlighted cell
        let targetColumnId: string | null = contextMenu.columnId;
        let targetLayerNum: number | null = null;
        if (contextHighlightedCell) {
          const lastDash = contextHighlightedCell.lastIndexOf('-');
          if (lastDash !== -1) {
            targetColumnId = contextHighlightedCell.substring(0, lastDash);
            const numStr = contextHighlightedCell.substring(lastDash + 1);
            const parsed = parseInt(numStr, 10);
            if (!isNaN(parsed)) targetLayerNum = parsed;
          }
        }

        const targetColumn = currentScene.columns.find((col: any) => col.id === targetColumnId);
        if (targetColumn && targetLayerNum !== null) {
          const pastedCell = {
            ...clipboard.data,
            id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `${clipboard.data.name} (Copy)`,
            layerNum: targetLayerNum
          };

          const updatedColumns = currentScene.columns.map((col: any) => {
            if (col.id === targetColumnId) {
              const existingIdx = col.layers.findIndex((l: any) => l.layerNum === targetLayerNum);
              if (existingIdx >= 0) {
                const newLayers = [...col.layers];
                newLayers[existingIdx] = pastedCell;
                return { ...col, layers: newLayers };
              }
              return { ...col, layers: [...col.layers, pastedCell] };
            }
            return col;
          });

          updateScene(currentSceneId, { columns: updatedColumns });
          console.log(`📋 Pasted cell ${pastedCell.name} to column ${targetColumn.name} at row ${targetLayerNum}`);
        }
      }
    }
    handleContextMenuClose();
  };

  // Copy clip
  const handleCopyClip = () => {
    if (contextMenu.layerId && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        const column = currentScene.columns.find((col: any) => col.id === contextMenu.columnId);
        if (column) {
          const layerToCopy = column.layers.find((layer: any) => layer.id === contextMenu.layerId);
          if (layerToCopy && layerToCopy.asset) {
            setClipboard({
              type: 'clip',
              data: { ...layerToCopy },
              sourceSceneId: currentSceneId
            });
            console.log(`📋 Copied clip ${layerToCopy.asset.name} to clipboard`);
          }
        }
      }
    }
    handleContextMenuClose();
  };

  // Paste clip (replaces existing content)
  const handlePasteClip = () => {
    if (clipboard && clipboard.type === 'clip' && clipboard.data && contextMenu.columnId) {
      const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
      if (currentScene) {
        // Determine target column and layer number from the highlighted cell
        let targetColumnId: string | null = contextMenu.columnId;
        let targetLayerNum: number | null = null;
        if (contextHighlightedCell) {
          const lastDash = contextHighlightedCell.lastIndexOf('-');
          if (lastDash !== -1) {
            targetColumnId = contextHighlightedCell.substring(0, lastDash);
            const numStr = contextHighlightedCell.substring(lastDash + 1);
            const parsed = parseInt(numStr, 10);
            if (!isNaN(parsed)) targetLayerNum = parsed;
          }
        }

        const targetColumn = currentScene.columns.find((col: any) => col.id === targetColumnId);
        if (targetColumn && targetLayerNum !== null) {
          const pastedClip = {
            ...clipboard.data,
            id: `layer-${Date.now()}-${Math.random().toString(36).substr(36, 9)}`,
            name: `${clipboard.data.name} (Copy)`,
            layerNum: targetLayerNum
          };

          const updatedColumns = currentScene.columns.map((col: any) => {
            if (col.id === targetColumnId) {
              const existingIdx = col.layers.findIndex((l: any) => l.layerNum === targetLayerNum);
              if (existingIdx >= 0) {
                const newLayers = [...col.layers];
                newLayers[existingIdx] = pastedClip;
                return { ...col, layers: newLayers };
              }
              return { ...col, layers: [...col.layers, pastedClip] };
            }
            return col;
          });

        updateScene(currentSceneId, { columns: updatedColumns });
        console.log(`📋 Pasted clip ${pastedClip.name} to column ${targetColumn.name} at row ${targetLayerNum}`);
        }
      }
    }
    handleContextMenuClose();
  };



  // Drag start wrapper currently unused by UI bindings
  // const handleLayerReorderDragStartWrapper = (e: React.DragEvent, layer: any, columnId: string) => {
  //   handleLayerReorderDragStart(e, layer, columnId, setDraggedLayer);
  // };

  const handleLayerReorderDragOverWrapper = (e: React.DragEvent, targetColumnId: string, targetLayerNum: number) => {
    handleLayerReorderDragOver(e, targetColumnId, targetLayerNum, draggedLayer, setDragOverLayer);
  };

  const handleLayerReorderDropWrapper = (e: React.DragEvent, targetColumnId: string, targetLayerNum: number) => {
    handleLayerReorderDrop(e, targetColumnId, targetLayerNum, draggedLayer, currentScene, currentSceneId, updateScene);
  };

  // Render preview content
  const renderPreviewContent = () => {
    console.log('🎨 renderPreviewContent called');
    console.log('🎨 previewContent:', previewContent);
    console.log('🎨 isPlaying:', isPlaying);
    
    if (!previewContent) {
      console.log('🎨 No preview content, showing placeholder');
      return (
        <div className="preview-placeholder">
          <p>No preview available</p>
          <small>Select a layer to see preview</small>
        </div>
      );
    }

    // Render timeline preview using the exact same component as column preview
    if (previewContent.type === 'timeline') {
      console.log('🎬 Rendering timeline preview via ColumnPreview');
      const activeClips = previewContent.activeClips || [];
      // Convert active clips into a temporary column structure
      const tempLayers = activeClips.map((clip: any) => {
        const trackNumber = parseInt((clip.trackId || 'track-1').split('-')[1] || '1', 10);
        return {
          id: `timeline-layer-${clip.id}`,
          name: `Layer ${trackNumber}`,
          layerNum: trackNumber,
          type: clip.type === 'effect' ? 'effect' : 'video',
          asset: clip.asset,
          opacity: 1,
          blendMode: 'add',
          params: clip.params || {},
          effects: clip.type === 'effect' ? [clip.asset] : undefined,
        };
      });

      const tempColumn = {
        id: 'timeline-preview',
        name: 'Timeline Preview',
        layers: tempLayers,
      } as any;

      const aspectRatio = compositionSettings.width / compositionSettings.height;
      return (
        <div className="preview-column">
          <div
            className="preview-main-content"
            data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
            style={{ aspectRatio }}
          >
            <ColumnPreview
              column={tempColumn}
              width={compositionSettings.width}
              height={compositionSettings.height}
              isPlaying={Boolean(previewContent.isPlaying)}
              bpm={bpm}
              globalEffects={currentScene?.globalEffects || []}
            />
          </div>
        </div>
      );
    }

    if (previewContent.type === 'column') {
      console.log('🎨 Rendering column preview');
      // Always resolve the latest column from the store so updates are live
      const liveColumn = currentScene?.columns?.find((col: any) => col.id === previewContent.columnId) || previewContent.column;

      // Show the first layer with content as the main preview
      const layersWithContent = (liveColumn?.layers || []).filter((layer: any) => layer.asset);
      console.log('🎨 Layers with content (live):', layersWithContent);
      
      // Check if this is an empty column
      if (previewContent.isEmpty || layersWithContent.length === 0) {
        console.log('🎨 No layers with content, showing empty column message');
        return (
          <div className="preview-column">
            <div className="preview-header-info">
              <h4>Column Preview</h4>
              <span className="preview-status">Empty</span>
            </div>
            <div className="preview-placeholder">
              <div className="preview-icon">📁</div>
              <p>No media content</p>
              <small>Drag assets from the Media Library to layers to see preview</small>
              <div className="preview-help">
                <p><strong>How to add content:</strong></p>
                <ol>
                  <li>Open the Media Library (bottom right)</li>
                  <li>Import or drag media files</li>
                  <li>Drag assets from Media Library to layer cells</li>
                  <li>Click the play button to preview</li>
                </ol>
              </div>
            </div>
          </div>
        );
      }

        // Use the ColumnPreview component with the live column for combined layer rendering
      console.log('🎨 Rendering combined column preview with p5.js');
        console.log('🎨 Column data (live):', liveColumn);
      console.log('🎨 Composition settings:', compositionSettings);
      
              // Calculate aspect ratio dynamically
        const aspectRatio = compositionSettings.width / compositionSettings.height;
        
        const previewElement = (
          <div className="preview-column">
            <div 
              className="preview-main-content"
              data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
              style={{ aspectRatio: aspectRatio }}
            >
              <ColumnPreview
                column={liveColumn}
                width={compositionSettings.width}
                height={compositionSettings.height}
                isPlaying={isPlaying && playingColumnId === previewContent.columnId}
                bpm={bpm}
                globalEffects={currentScene?.globalEffects || []}
              />
            </div>
                     {debugMode && (
             <div className="preview-layers-info">
               <h5>Layers in Column:</h5>
               {layersWithContent.map((layer: any) => (
                 <div key={layer.id} className="preview-layer-item">
                   <div className="preview-layer-name">{layer.name}</div>
                   <div className="preview-layer-asset-type">{layer.asset.type}</div>
                 </div>
               ))}
             </div>
           )}
        </div>
      );
      
      console.log('🎨 Returning column preview element:', previewElement);
      return previewElement;
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
              <div className="preview-layer-name">{previewContent.layer.name}</div>
            </div>
            {previewContent.asset && (
              <div className="preview-asset-display">
                <CanvasRenderer
                  assets={[{
                    type: previewContent.asset.type === 'image' ? 'image' : 
                           previewContent.asset.type === 'video' ? 'video' : 'effect',
                    asset: previewContent.asset,
                    layer: previewContent.layer
                  }]}
                  width={compositionSettings.width}
                  height={compositionSettings.height}
                  bpm={bpm}
                  isPlaying={isPlaying}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (previewContent.type === 'timeline') {
      const activeClips = previewContent.activeClips || [];
      
      return (
        <div className="preview-timeline">
          <div className="preview-header-info">
            <h4>Timeline Preview</h4>
            <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
            <div className="preview-time-display">
              Time: {Math.floor(previewContent.currentTime)}s / {Math.floor(previewContent.duration)}s
            </div>
          </div>
          
          <div className="preview-timeline-content">
            {activeClips.length === 0 ? (
              <div className="timeline-preview-empty">
                <div className="timeline-preview-placeholder">
                  <div className="placeholder-text">No clips playing at current time</div>
                  <div className="placeholder-time">{Math.floor(previewContent.currentTime)}s</div>
                </div>
              </div>
            ) : (
              <div className="preview-column">
                <div 
                  className="preview-main-content"
                  data-aspect-ratio={`${compositionSettings.width}:${compositionSettings.height}`}
                  style={{ aspectRatio: compositionSettings.width / compositionSettings.height }}
                >
                  <TimelineComposer
                    activeClips={activeClips}
                    isPlaying={isPlaying}
                    currentTime={previewContent.currentTime}
                    width={compositionSettings.width}
                    height={compositionSettings.height}
                    bpm={bpm}
                    globalEffects={[]} // Add global effects support here if needed
                  />
                </div>
                
                <div className="preview-layers-info">
                  <h5>Active Timeline Clips:</h5>
            {activeClips.map((clip: any) => (
              <div key={`info-${clip.id}`} className="preview-layer-item">
                      <div className="preview-layer-name">Track {clip.trackId.split('-')[1]}</div>
                      <div className="preview-layer-asset-type">{clip.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="preview-placeholder">
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

  // Ensure we have at least 20 columns
  const columns = [...currentScene.columns];
  let columnsAdded = 0;
  while (columns.length < 20) {
    const newCol = createColumn();
    newCol.name = `Column ${columns.length + 1}`;
    columns.push(newCol);
    columnsAdded++;
  }
  // Persist newly-added columns once
  if (columnsAdded > 0) {
    console.log('➕ Added', columnsAdded, 'columns to scene', currentSceneId);
    updateScene(currentSceneId, { columns });
  }

  // Migrate global effects to new format if needed
  if (currentScene.globalEffects) {
    let effectsMigrated = false;
    const migratedEffects = currentScene.globalEffects.map((effect: any) => {
      if (typeof effect === 'string') {
        // Old format: just a string ID
        effectsMigrated = true;
        return {
          id: uuidv4(),
          effectId: effect,
          enabled: true,
          params: {}
        };
      } else if (!effect.id) {
        // New format but missing ID
        effectsMigrated = true;
        return {
          ...effect,
          id: uuidv4()
        };
      }
      return effect;
    });

    if (effectsMigrated) {
      console.log('🔄 Migrating global effects to new format');
      updateScene(currentSceneId, { globalEffects: migratedEffects });
    }
  }

  try {
    console.log('LayerManager about to render main content');
    
    return (
      <div className="layer-manager-main">
        <div className="layer-manager-content">
          <div className="layer-manager-header">
            <div className="header-left">
              <div className="scene-tabs">
                <ButtonGroup
                  options={scenes.map((scene: any) => ({
                    value: scene.id,
                    label: scene.name,
                    onContextMenu: (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // Remove any existing menus
                      const existingMenus = document.querySelectorAll('.scene-context-menu');
                      existingMenus.forEach(menu => menu.remove());
                      
                      createSceneContextMenu(scene, scenes, updateScene, removeScene);
                    },
                    title: "Right-click to rename or delete scene"
                  }))}
                  value={currentSceneId}
                  onChange={(sceneId) => setCurrentScene(sceneId as string)}
                  size="small"
                  columns={scenes.length}
                />
                <button onClick={addScene} className="add-scene-tab-btn" title="Add new scene">
                  +
                </button>
              </div>
            </div>
            <div className="header-right">
              <div className="bpm-control">
                <label htmlFor="bpm-input">BPM:</label>
                <input
                  id="bpm-input"
                  type="number"
                  min="30"
                  max="300"
                  value={bpmInputValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    console.log('BPM input changed:', value);
                    setBpmInputValue(value); // Always update local state
                    
                    if (value === '') {
                      return; // Allow empty input
                    }
                    
                    const newBpm = parseInt(value);
                    if (!isNaN(newBpm) && newBpm >= 30 && newBpm <= 300) {
                      console.log('Setting BPM to:', newBpm);
                      setBpm(newBpm);
                    }
                  }}
                  onBlur={(e) => {
                    // Ensure valid value when leaving the field
                    const value = e.target.value;
                    if (value === '' || isNaN(parseInt(value))) {
                      console.log('Invalid BPM value, defaulting to 120');
                      setBpm(120);
                      setBpmInputValue('120');
                    } else {
                      // Sync local state with store state
                      setBpmInputValue(bpm.toString());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur(); // Trigger onBlur
                    }
                  }}
                  className="bpm-input"
                  placeholder="120"
                />
                <button 
                  onClick={() => {
                    const bpmManager = BPMManager.getInstance();
                    bpmManager.tap();
                    
                    // Get the updated BPM from the manager and update the store
                    const newBpm = bpmManager.getBPM();
                    console.log('Tap BPM result:', newBpm);
                    setBpm(newBpm);
                  }}
                  className="tap-bpm-btn"
                  title="Tap to set BPM"
                >
                  🎵
                </button>
              </div>
              
              {/* Global Playback Controls */}
              <div className="global-playback-controls">
                <span className="global-controls-label">Global:</span>
                <button
                  onClick={globalPlay}
                  className={`global-play-btn ${isGlobalPlaying ? 'active' : ''}`}
                  title="Global Play - Resume all videos"
                >
                  ▶️
                </button>
                <button
                  onClick={globalPause}
                  className={`global-pause-btn ${!isGlobalPlaying ? 'active' : ''}`}
                  title="Global Pause - Pause all videos"
                >
                  ⏸️
                </button>
                <button
                  onClick={globalStop}
                  className="global-stop-btn"
                  title="Global Stop - Stop all videos"
                >
                  ⏹️
                </button>
              </div>
              
              <button 
                 onClick={() => setShowTimeline(!showTimeline)}
                 className={`timeline-toggle-btn ${showTimeline ? 'active' : ''}`}
                 title={showTimeline ? 'Switch to Grid View' : 'Switch to Timeline View'}
               >
                 {showTimeline ? '📊' : '📋'}
               </button>

            </div>
            

            

          </div>

          <div className="layer-manager-body" style={{ height: `${paneSizes.gridHeight}%` }}>
            {showTimeline ? (
              <Timeline 
                onClose={() => setShowTimeline(false)} 
                onPreviewUpdate={handleTimelinePreviewUpdate}
              />
            ) : (
              <>
                {/* Global Effects Row */}
                <div className="global-effects-row">
                  <div 
                    className="global-effects-content"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('drag-over');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('drag-over');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('drag-over');
                      
                      try {
                        const data = JSON.parse(e.dataTransfer.getData('application/json'));
                        if (data.isEffect) {
                          console.log('🌐 Adding global effect:', data);
                          
                                    const newEffectSlot = {
            id: uuidv4(),
            effectId: data.id || data.name,
            enabled: true,
            params: getDefaultEffectParams(data.id || data.name)
          };
                          
                          // Add the effect slot to the scene's global effects
                          // Disable all existing effects and enable only the new one
                          const currentGlobalEffects = currentScene?.globalEffects || [];
                          const updatedEffects = [
                            ...currentGlobalEffects.map((effect: any) => ({ ...effect, enabled: false })),
                            newEffectSlot
                          ];
                          updateScene(currentSceneId, { globalEffects: updatedEffects });
                          console.log('🌐 Global effects updated:', updatedEffects);
                        }
                      } catch (error) {
                        console.error('Error adding global effect:', error);
                      }
                    }}
                  >
                    <div className="global-effects-grid">
                      {Array.from({ length: 10 }, (_, index) => {
                        const effectSlot = currentScene?.globalEffects?.[index];
                        
                        if (effectSlot) {
                          // Render existing effect slot
                          return (
                            <div
                              key={effectSlot.id || `effect-${index}`}
                              className={`global-effect-slot ${effectSlot.enabled ? 'active' : ''}`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const updatedEffects = currentScene.globalEffects.filter((_: any, i: number) => i !== index);
                                updateScene(currentSceneId, { globalEffects: updatedEffects });
                              }}
                              title="Right-click to remove"
                            >
                              <div 
                                className="effect-slot-content"
                                onClick={() => {
                                  // Select this effect to edit in layer options panel
                                  const pseudoLayer = {
                                    id: `global-effect-layer-${effectSlot.id}-${index}`,
                                    name: effectSlot.effectId || 'Global Effect',
                                    type: 'effect',
                                    asset: { id: effectSlot.effectId, name: effectSlot.effectId, type: 'effect', isEffect: true },
                                    params: effectSlot.params || {},
                                    blendMode: 'add',
                                    opacity: 1.0,
                                  };
                                  setSelectedLayer(pseudoLayer);
                                  setSelectedGlobalEffectKey(`${index}:${effectSlot.id}`);
                                }}
                                style={{ cursor: 'pointer' }}
                                title="Click to edit effect parameters"
                              >
                                <button
                                  className={`play-btn ${effectSlot.enabled ? 'stop' : 'play'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updatedEffects = currentScene.globalEffects.map((slot: any, i: number) => ({
                                      ...slot,
                                      enabled: i === index ? !slot.enabled : false
                                    }));
                                    updateScene(currentSceneId, { globalEffects: updatedEffects });
                                  }}
                                  title={effectSlot.enabled ? 'Stop Global Effect' : 'Play Global Effect'}
                                >
                                  {effectSlot.enabled ? '⏹' : '▶'}
                                </button>
                                <span className="effect-name">
                                  {effectSlot.name || effectSlot.effectId || 'Unknown Effect'}
                                </span>
                                {effectSlot.enabled && <div className="effect-active-indicator">●</div>}
                              </div>
                            </div>
                          );
                      } else {
                        // Render empty slot
                        return (
                                                   <div key={`empty-slot-${index}`} className="global-effect-slot empty">
                           <div className="effect-slot-content">
                             <span className="effect-name"></span>
                           </div>
                         </div>
                        );
                      }
                                         })}
                   </div>
                 </div>
               </div>

            {/* Composition Row */}
            <div className="composition-row">
              {columns.map((column: any) => {
                const isColumnPlaying = playingColumnId === column.id;
                
                // Check if column has any clips/assets
                const hasClips = column.layers.some((layer: any) => {
                  const displayName = layer?.asset?.name || layer?.asset?.metadata?.name || layer?.asset?.effect?.name || '';
                  return !!(layer && layer.asset && displayName);
                });
                
                return (
                  <div key={column.id} className="column-cell">
                    <div 
                      className={`column-header ${isColumnPlaying ? 'playing' : ''} ${!hasClips ? 'no-clips' : ''}`}
                      onClick={() => {
                        // Only allow play functionality if column has clips
                        if (hasClips) {
                          console.log('🎵 Column header clicked for column:', column.id);
                          console.log('🎵 Starting/restarting column playback from header');
                          handleColumnPlayWrapper(column.id);
                        }
                      }}
                      title={hasClips ? "Click anywhere to play/restart column" : "Column has no clips"}
                      style={{ cursor: hasClips ? 'pointer' : 'default' }}
                    >
                      <h4>{columns.findIndex(c => c.id === column.id) + 1}</h4>
                      <div className="play-indicator">
                        {hasClips ? '▶' : '■'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Layer Rows */}
                         {[3, 2, 1].map((layerNum) => (
               <div key={layerNum} className="layer-row">
                {/* Column Cells for this Layer */}
                {columns.map((column: any) => {
                  // More robust layer finding - check both name and layerNum
                  const layer = column.layers.find((l: any) =>
                    l.layerNum === layerNum ||
                    l.name === `Layer ${layerNum}`
                  );
                  
                  // Derive a stable display name; treat unnamed assets as empty
                  const displayName = layer?.asset?.name || layer?.asset?.metadata?.name || layer?.asset?.effect?.name || '';
                  const hasAsset = !!(layer && layer.asset && displayName);
                  const cellId = `${column.id}-${layerNum}`;
                  const isDragOver = dragOverCell === cellId;
                  const isDragOverLayer = dragOverLayer === cellId;
                  
                  return (
                    <div
                      key={cellId}
                      className={`grid-cell ${hasAsset ? 'has-content' : 'empty'} ${selectedLayer?.id === layer?.id ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''} ${isDragOverLayer ? 'drag-over-layer' : ''} ${contextHighlightedCell === cellId ? 'context-highlight' : ''}`}
                      data-system-files={isDragOver && (() => {
                        // Check if drag contains system files
                        const dragData = (window as any).currentDragData;
                        return dragData && dragData.files && dragData.files.length > 0 ? 'true' : 'false';
                      })()}
                      onClick={() => hasAsset && handleLayerClickWrapper(layer, column.id)}
                      onContextMenu={(e) => {
                        if (hasAsset) {
                          handleCellRightClick(e, layer, column.id);
                        }
                      }}
                      onDragStart={(e) => {
                        if (hasAsset) {
                          // Always use layer reordering for existing layers
                          handleLayerReorderDragStart(e, layer, column.id, setDraggedLayer);
                        }
                      }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => {
                        // Store current drag data for styling
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          (window as any).currentDragData = { files: e.dataTransfer.files };
                        }
                        // Handle both asset dropping and layer reordering
                        handleDragOverWrapper(e, cellId);
                        if (draggedLayer && draggedLayer.sourceColumnId === column.id) {
                          handleLayerReorderDragOverWrapper(e, column.id, layerNum);
                        }
                      }}
                      onDragLeave={(e) => handleDragLeaveWrapper(e)}
                      onDrop={(e) => {
                        // Clear drag data
                        (window as any).currentDragData = null;
                        // Check if this is a layer reorder (from existing layer) or asset drop (from Media/Effects)
                        const dragData = e.dataTransfer.getData('application/json');
                        if (dragData) {
                          try {
                            const data = JSON.parse(dragData);
                            if (data.type === 'layer-reorder') {
                              handleLayerReorderDropWrapper(e, column.id, layerNum);
                            } else {
                              handleDropWrapper(e, column.id, layerNum);
                            }
                          } catch (error) {
                            // Fallback to asset drop
                            handleDropWrapper(e, column.id, layerNum);
                          }
                        } else {
                          // Fallback to asset drop
                          handleDropWrapper(e, column.id, layerNum);
                        }
                      }}
                      draggable={hasAsset}
                    >
                      {hasAsset ? (
                        <div 
                          className="layer-content"
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.add('drag-over');
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('drag-over');
                            try {
                              const raw = e.dataTransfer.getData('application/json');
                              const data = raw ? JSON.parse(raw) : null;
                              if (data && data.type === 'layer-reorder') {
                                handleLayerReorderDropWrapper(e, column.id, layerNum);
                              } else {
                                handleDropWrapper(e, column.id, layerNum);
                              }
                            } catch {
                              handleDropWrapper(e, column.id, layerNum);
                            }
                          }}
                        >
                          <div className="layer-preview">
                            {layer.asset.type === 'image' && (
                              <img
                                src={getAssetPath(layer.asset)}
                                alt={layer.asset.name}
                                className="layer-preview-image"
                                onLoad={() => {
                                  console.log('✅ Image loaded successfully:', layer.asset.name, 'Path:', getAssetPath(layer.asset));
                                }}
                                onError={(e) => {
                                  console.error('❌ Failed to load image:', layer.asset.name, 'Path:', getAssetPath(layer.asset));
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (fallback) {
                                    fallback.style.display = 'flex';
                                  }
                                }}
                              />
                            )}
                            {layer.asset.type === 'video' && (
                              <video
                                src={getAssetPath(layer.asset, true)} // Use file path for video playback
                                className="layer-preview-video"
                                muted
                                onLoadStart={() => console.log('Layer video loading:', layer.asset.name)}
                                onLoadedData={() => console.log('Layer video loaded:', layer.asset.name)}
                                onError={(e) => console.error('Layer video error:', layer.asset.name, e)}
                              />
                            )}
                            {(layer.asset.isEffect || layer.asset.type === 'p5js' || layer.asset.type === 'threejs') && (
                              <div className="layer-preview-effect">
                                <div className="effect-icon">
                                  {layer.asset.type === 'p5js' ? '🎨' : '🎭'}
                                </div>
                                <div className="effect-type-badge">
                                  {layer.asset.type.toUpperCase()}
                                </div>
                              </div>
                            )}
                          </div>
                                                     <div 
                             className="layer-name"
                             draggable={true}
                             onDragStart={(e) => {
                               e.stopPropagation();
                               handleLayerReorderDragStart(e, layer, column.id, setDraggedLayer);
                             }}
                             style={{ cursor: 'grab' }}
                           >
                            {displayName || 'Empty'}
                          </div>
                          {layer.blendMode && layer.blendMode !== 'add' && (
                            <div className="layer-blend-mode">
                              {layer.blendMode}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div 
                          className="layer-content empty-cell"
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.add('drag-over');
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('drag-over');
                            try {
                              const raw = e.dataTransfer.getData('application/json');
                              const data = raw ? JSON.parse(raw) : null;
                              if (data && data.type === 'layer-reorder') {
                                handleLayerReorderDropWrapper(e, column.id, layerNum);
                              } else {
                                handleDropWrapper(e, column.id, layerNum);
                              }
                            } catch {
                              handleDropWrapper(e, column.id, layerNum);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              visible: true,
                              x: e.clientX,
                              y: e.clientY,
                              layerId: `empty-${layerNum}`,
                              columnId: column.id
                            });
                            setContextHighlightedCell(`${column.id}-${layerNum}`);
                          }}
                        >
                          <div className="layer-preview-placeholder"></div>
                          <div className="layer-name"></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            </>
            )}
          </div>



          {/* Resize Handle */}
          <div 
            className={`resize-handle ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleResizeStart}
            style={{ cursor: 'ns-resize' }}
          >
            <div className="resize-indicator">⋮⋮</div>
          </div>

          {/* Bottom Section with Preview, Layer Options, and Media Library */}
          <div 
            className="bottom-section"
            style={{ height: `${paneSizes.mediaLibraryHeight}%` }}
          >
            {/* Preview Window - Bottom Left */}
            <div 
              className="preview-window"
              style={{
                aspectRatio: `${compositionSettings.width}/${compositionSettings.height}`,
                maxWidth: '30%',
                minWidth: '200px',
              }}
            >
              <div className="preview-header">
                <h3>Preview</h3>
              </div>
              <div 
                className="preview-content"
                style={{
                  aspectRatio: `${compositionSettings.width}/${compositionSettings.height}`,
                }}
              >
                {(() => {
                  console.log('🎭 Rendering preview content in preview window');
                  const content = renderPreviewContent();
                  console.log('🎭 Preview content rendered:', content);
                  return content;
                })()}
              </div>
            </div>

            {/* Layer Options - Bottom Center */}
            <div className="layer-options-panel">
              <LayerOptions 
                selectedLayer={selectedLayer}
                onUpdateLayer={handleUpdateSelectedLayer}
              />
            </div>

            {/* Media Library / MIDI Mapper - Bottom Right */}
            <div className="layer-manager-media-library">
              {/* Tab Navigation */}
              <div className="media-tabs tw-mb-2">
                <Tabs value={showMediaLibrary ? String(showMediaLibrary) : 'media'} onValueChange={(val) => setShowMediaLibrary(val === 'media' ? false : (val as any))}>
                  <TabsList>
                    <TabsTrigger value="media">Media</TabsTrigger>
                    <TabsTrigger value="effects">Effects</TabsTrigger>
                    <TabsTrigger value="midi">MIDI</TabsTrigger>
                    <TabsTrigger value="lfo">LFO</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              
              {/* Tab Content */}
              <div className="tab-content">
                <Tabs value={showMediaLibrary ? String(showMediaLibrary) : 'media'} onValueChange={(val) => setShowMediaLibrary(val === 'media' ? false : (val as any))}>
                  <TabsContent value="media">
                    <MemoMediaLibrary onClose={handleMediaLibClose} isEmbedded={true} />
                  </TabsContent>
                  <TabsContent value="effects">
                    <div className="tw-space-y-2">
                      <h3>Effects</h3>
                      <EffectsBrowser />
                    </div>
                  </TabsContent>
                  <TabsContent value="midi">
                    <div className="midi-tab">
                      <h3>MIDI</h3>
                      <MIDIMapper />
                    </div>
                  </TabsContent>
                  <TabsContent value="lfo">
                    <div className="lfo-tab">
                      <h3>LFO</h3>
                      <LFOMapper 
                        selectedLayer={selectedLayer}
                        onUpdateLayer={handleUpdateLayerWrapper}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>

        {/* Context Menu for Column Clips */}
        {contextMenu.visible && (
          <div
            className="context-menu"
            style={{ position: 'fixed', left: Math.min(contextMenu.x, window.innerWidth - 150), top: Math.min(contextMenu.y, window.innerHeight - 60), zIndex: 10000 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tw-min-w-[160px] tw-overflow-hidden tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-lg">
            {/* Cell-specific options - only show if we have a layer selected (not empty cells) */}
            {contextMenu.layerId && !contextMenu.layerId.startsWith('empty-') && (
              <>
                <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleCopyCell}>📋 Copy Cell</div>
                
                <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={clipboard && clipboard.type === 'cell' ? handlePasteCell : undefined} style={{ opacity: clipboard && clipboard.type === 'cell' ? 1 : 0.5 }}>📋 Paste Cell</div>

                {/* Clip options - for actual media/effects */}
                <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleCopyClip}>📋 Copy Clip</div>
                
                <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={clipboard && clipboard.type === 'clip' ? handlePasteClip : undefined} style={{ opacity: clipboard && clipboard.type === 'clip' ? 1 : 0.5 }}>📋 Paste Clip</div>
              </>
            )}
            
            {/* Cell paste option - show if we have a cell in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'cell' && (
              <div
                className="context-menu-item"
                style={{
                  padding: '12px 20px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  borderBottom: '1px solid #444'
                }}
                onClick={handlePasteCell}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 Paste Cell
              </div>
            )}

            {/* Clip paste option - show if we have a clip in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'clip' && (
              <div
                className="context-menu-item"
                style={{
                  padding: '12px 20px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  borderBottom: '1px solid #444'
                }}
                onClick={handlePasteClip}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 Paste Clip
              </div>
            )}
            
            {/* Column options - always show */}
            <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleCopyColumn}>📋 Copy Column</div>
            
            <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={clipboard && clipboard.type === 'column' ? handlePasteColumn : undefined} style={{ opacity: clipboard && clipboard.type === 'column' ? 1 : 0.5 }}>📋 Paste Column</div>
            
            {/* Delete option - show different text based on context */}
            <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleDeleteLayer}>{contextMenu.layerId && contextMenu.layerId !== 'unknown' ? '🗑️ Delete Layer' : '🗑️ Delete Column'}</div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('❌ Error rendering LayerManager:', error);
    return (
      <div className="layer-manager-main">
        <div className="layer-manager-content">
          <div className="layer-manager-header">
            <h2>Error Loading Layer Manager</h2>
            <p>Could not load the layer manager content.</p>
            <button onClick={onClose} className="close-btn">Close</button>
          </div>
        </div>

        {/* Context Menu for Column Clips */}
        {(() => {
          console.log('🖱️ Rendering context menu:', contextMenu);
          return null;
        })()}
        {contextMenu.visible && (
          <div
            className="context-menu"
            style={{
              position: 'fixed',
              left: Math.min(contextMenu.x, window.innerWidth - 150), // Ensure it doesn't go off-screen
              top: Math.min(contextMenu.y, window.innerHeight - 60),
              zIndex: 10000, // Very high z-index to ensure visibility
              backgroundColor: '#2a2a2a',
              border: '2px solid #666',
              borderRadius: '6px',
              padding: '8px 0',
              minWidth: '140px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cell-specific options - only show if we have a layer selected (not empty cells) */}
            {contextMenu.layerId && !contextMenu.layerId.startsWith('empty-') && (
              <>
                <div
                  className="context-menu-item"
                  style={{
                    padding: '12px 20px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s ease',
                    borderBottom: '1px solid #444',
                    userSelect: 'none'
                  }}
                  onClick={handleCopyCell}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  📋 Copy Cell
                </div>
                
                <div
                  className="context-menu-item"
                  style={{
                    padding: '12px 20px',
                    color: clipboard && clipboard.type === 'cell' ? '#fff' : '#666',
                    cursor: clipboard && clipboard.type === 'cell' ? 'pointer' : 'default',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s ease',
                    borderBottom: '1px solid #444',
                    opacity: clipboard && clipboard.type === 'cell' ? 1 : 0.5,
                    userSelect: 'none'
                  }}
                  onClick={clipboard && clipboard.type === 'cell' ? handlePasteCell : undefined}
                  onMouseEnter={(e) => {
                    if (clipboard && clipboard.type === 'cell') {
                      e.currentTarget.style.backgroundColor = '#444';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  📋 Paste Cell
                </div>

                {/* Clip options - for actual media/effects */}
                <div
                  className="context-menu-item"
                  style={{
                    padding: '12px 20px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s ease',
                    borderBottom: '1px solid #444',
                    userSelect: 'none'
                  }}
                  onClick={handleCopyClip}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  📋 Copy Clip
                </div>
                
                <div
                  className="context-menu-item"
                  style={{
                    padding: '12px 20px',
                    color: clipboard && clipboard.type === 'clip' ? '#fff' : '#666',
                    cursor: clipboard && clipboard.type === 'cell' ? 'pointer' : 'default',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s ease',
                    borderBottom: '1px solid #444',
                    opacity: clipboard && clipboard.type === 'clip' ? 1 : 0.5,
                    userSelect: 'none'
                  }}
                  onClick={clipboard && clipboard.type === 'clip' ? handlePasteClip : undefined}
                  onMouseEnter={(e) => {
                    if (clipboard && clipboard.type === 'clip') {
                      e.currentTarget.style.backgroundColor = '#444';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  📋 Paste Clip
                </div>
              </>
            )}
            
            {/* Cell paste option - show if we have a cell in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'cell' && (
              <div
                className="context-menu-item"
                style={{
                  padding: '12px 20px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  borderBottom: '1px solid #444',
                  userSelect: 'none'
                }}
                onClick={handlePasteCell}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 Paste Cell
              </div>
            )}

            {/* Clip paste option - show if we have a clip in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'clip' && (
              <div
                className="context-menu-item"
                style={{
                  padding: '12px 20px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  borderBottom: '1px solid #444',
                  userSelect: 'none'
                }}
                onClick={handlePasteClip}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 Paste Clip
              </div>
            )}
            
            {/* Column options - always show */}
            <div
              className="context-menu-item"
              style={{
                padding: '12px 20px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: 'transparent',
                transition: 'background-color 0.2s ease',
                borderBottom: '1px solid #444',
                userSelect: 'none'
              }}
              onClick={handleCopyColumn}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              📋 Copy Column
            </div>
            
            <div
              className="context-menu-item"
              style={{
                padding: '12px 20px',
                color: clipboard && clipboard.type === 'column' ? '#fff' : '#666',
                cursor: clipboard && clipboard.type === 'column' ? 'pointer' : 'default',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: 'transparent',
                transition: 'background-color 0.2s ease',
                borderBottom: '1px solid #444',
                opacity: clipboard && clipboard.type === 'column' ? 1 : 0.5,
                userSelect: 'none'
              }}
              onClick={clipboard && clipboard.type === 'column' ? handlePasteColumn : undefined}
              onMouseEnter={(e) => {
                if (clipboard && clipboard.type === 'column') {
                  e.currentTarget.style.backgroundColor = '#444';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              📋 Paste Column
            </div>
            
            {/* Delete option - show different text based on context */}
            <div
              className="context-menu-item"
              style={{
                padding: '12px 20px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: 'transparent',
                transition: 'background-color 0.2s ease',
                userSelect: 'none'
              }}
              onClick={handleDeleteLayer}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {contextMenu.layerId && contextMenu.layerId !== 'unknown' ? '🗑️ Delete Layer' : '🗑️ Delete Column'}
            </div>
          </div>
        )}
      </div>
    );
  }
};