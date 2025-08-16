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
import { getAssetPath, createColumn, getDefaultEffectParams, handleDragOver, handleDragLeave, handleLayerClick } from '../utils/LayerManagerUtils';
import { handleDrop, handleLayerReorderDragStart, handleLayerReorderDragOver, handleLayerReorderDrop } from '../utils/DragDropHandlers';
import { handleColumnPlay, handleUpdateLayer } from '../utils/LayerManagementHandlers';
import { createSceneContextMenu } from '../utils/SceneManagementHandlers';
import { EffectsBrowser } from './EffectsBrowser';
import { MIDIMapper } from './MIDIMapper';
import { LFOMapper } from './LFOMapper';
import { ButtonGroup } from './ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui';
import { PlayIcon, PauseIcon, StopIcon, GridIcon, RowsIcon, TrashIcon, CopyIcon } from '@radix-ui/react-icons';
import { MixerHorizontalIcon } from '@radix-ui/react-icons';


interface LayerManagerProps {
  onClose: () => void;
  debugMode?: boolean;
}

// Memoized at module scope to preserve component identity across renders
const MemoMediaLibrary = React.memo(MediaLibrary);

export const LayerManager: React.FC<LayerManagerProps> = ({ onClose, debugMode = false }) => {
  console.log('LayerManager component rendering');
  
  const { scenes, currentSceneId, setCurrentScene, addScene, removeScene, updateScene, compositionSettings, bpm, setBpm, playingColumnId, isGlobalPlaying, playColumn, globalPlay, globalPause, globalStop } = useStore() as any;
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

  // Stop wrapper unused after global controls migration

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
        console.log(`Deleted layer ${contextMenu.layerId} from column ${contextMenu.columnId}`);
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
          console.log(`Copied column ${columnToCopy.name} to clipboard`);
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
        console.log(`Pasted column ${pastedColumn.name} to scene ${currentSceneId}`);
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
            console.log(`Copied cell ${cellToCopy.name} to clipboard`);
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
          console.log(`Pasted cell ${pastedCell.name} to column ${targetColumn.name} at row ${targetLayerNum}`);
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
            console.log(`Copied clip ${layerToCopy.asset.name} to clipboard`);
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
        console.log(`Pasted clip ${pastedClip.name} to column ${targetColumn.name} at row ${targetLayerNum}`);
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
        <div className="tw-w-full tw-h-full tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-text-sm tw-py-4">
          <div className="tw-text-center">
            <div>No preview available</div>
            <div className="tw-text-xs tw-text-neutral-500">Select a layer to see preview</div>
          </div>
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
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
          <div
            className="tw-relative tw-w-full"
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
          <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden">
            <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
              <h4 className="tw-text-sm tw-text-white">Column Preview</h4>
              <span className="tw-text-xs tw-text-neutral-400">Empty</span>
            </div>
            <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-1 tw-p-4">
              <p className="tw-text-neutral-300">No media content</p>
              <small className="tw-text-neutral-500">Drag assets from the Media Library to layers to see preview</small>
              <div className="tw-mt-2 tw-text-neutral-400 tw-text-xs tw-space-y-1">
                <p className="tw-font-semibold">How to add content:</p>
                <ol className="tw-list-decimal tw-list-inside tw-space-y-0.5">
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
          <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
            <div 
              className="tw-relative tw-w-full"
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
             <div className="tw-px-3 tw-py-2">
               <h5 className="tw-text-sm tw-font-semibold tw-text-white">Layers in Column:</h5>
               {layersWithContent.map((layer: any) => (
                 <div key={layer.id} className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-neutral-300 tw-border-b tw-border-neutral-800 tw-py-1">
                   <div className="tw-font-medium">{layer.name}</div>
                   <div className="tw-text-neutral-400">{layer.asset.type}</div>
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
        <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-w-full">
          <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
            <h4 className="tw-text-sm tw-text-white">Layer Preview</h4>
            <span className="tw-text-xs tw-text-neutral-400">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="tw-p-2">
            <div className="tw-text-sm tw-text-neutral-200 tw-mb-2">{previewContent.layer.name}</div>
            {previewContent.asset && (
              <div className="tw-rounded tw-border tw-border-neutral-800 tw-bg-black">
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
        <div className="tw-h-full tw-flex tw-flex-col">
          <div className="preview-header-info">
            <h4>Timeline Preview</h4>
            <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
            <div className="preview-time-display">
              Time: {Math.floor(previewContent.currentTime)}s / {Math.floor(previewContent.duration)}s
            </div>
          </div>
          
          <div className="tw-flex tw-flex-col tw-gap-2 tw-flex-1 tw-p-2 tw-rounded-md tw-bg-neutral-900 tw-border tw-border-neutral-800">
            {activeClips.length === 0 ? (
              <div className="tw-flex tw-items-center tw-justify-center tw-h-48 tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-rounded">
                <div className="tw-text-center tw-text-neutral-300">
                  <div className="tw-text-sm">No clips playing at current time</div>
                  <div className="tw-mt-1 tw-text-xs tw-text-neutral-400">{Math.floor(previewContent.currentTime)}s</div>
                </div>
              </div>
            ) : (
              <div className="tw-flex tw-flex-col tw-gap-2">
                <div 
                  className="tw-relative tw-rounded tw-border tw-border-neutral-800 tw-bg-black"
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
                
                <div className="tw-mt-2">
                  <h5 className="tw-text-sm tw-font-semibold tw-text-white">Active Timeline Clips:</h5>
                  {activeClips.map((clip: any) => (
                    <div key={`info-${clip.id}`} className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-neutral-300 tw-border-b tw-border-neutral-800 tw-py-1">
                      <div className="tw-font-medium">Track {clip.trackId.split('-')[1]}</div>
                      <div className="tw-text-neutral-400">{clip.name}</div>
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
      <div className="tw-w-full tw-h-full tw-flex tw-items-center tw-justify-center tw-text-neutral-300 tw-text-sm tw-py-4">
        <div>Preview not available</div>
      </div>
    );
  };

  if (!currentScene) {
    return (
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col tw-overflow-hidden tw-pt-4">
        <div className="tw-flex tw-flex-col tw-h-full tw-overflow-hidden">
          <div className="tw-flex tw-items-center tw-justify-between tw-min-h-8 tw-px-4 tw-py-1 tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
            <h2>No Scene Selected</h2>
            <div className="scene-controls">
              <button onClick={addScene} className="add-scene-btn">
                + Create Scene
              </button>
            </div>
          </div>
          <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center">
            <div className="tw-text-center tw-space-y-2">
              <h3 className="tw-text-lg">Welcome to VJ</h3>
              <p className="tw-text-sm tw-text-neutral-300">Create your first scene to get started</p>
              <button onClick={addScene} className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-bg-sky-600 hover:tw-bg-sky-500 tw-text-white tw-px-3 tw-py-1.5">Create New Scene</button>
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
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col tw-overflow-hidden tw-pt-4">
        <div className="tw-flex tw-flex-col tw-h-full tw-overflow-hidden">
          <div className="tw-flex tw-items-center tw-justify-between tw-min-h-8 tw-px-4 tw-py-1 tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
            <div className="header-left">
              <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap">
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
                <button onClick={addScene} className="tw-ml-2 tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-w-7 tw-h-7 hover:tw-bg-neutral-800" title="Add new scene">
                  +
                </button>
              </div>
            </div>
            <div className="tw-flex tw-items-center tw-gap-4">
              <div className="tw-flex tw-items-center tw-gap-2">
                <label htmlFor="bpm-input" className="tw-text-sm tw-text-neutral-300">BPM:</label>
                <input
                  id="bpm-input"
                  type="number"
                  min="30"
                  max="300"
                  value={bpmInputValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBpmInputValue(value);
                    if (value === '') return;
                    const newBpm = parseInt(value);
                    if (!isNaN(newBpm) && newBpm >= 30 && newBpm <= 300) {
                      setBpm(newBpm);
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value === '' || isNaN(parseInt(value))) {
                      setBpm(120);
                      setBpmInputValue('120');
                    } else {
                      setBpmInputValue(bpm.toString());
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="tw-w-20 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
                  placeholder="120"
                />
                <button 
                  onClick={() => {
                    const bpmManager = BPMManager.getInstance();
                    bpmManager.tap();
                    const newBpm = bpmManager.getBPM();
                    setBpm(newBpm);
                  }}
                  className="tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-w-8 tw-h-8 hover:tw-bg-neutral-800"
                  title="Tap to set BPM"
                >
                  <MixerHorizontalIcon className="tw-w-4 tw-h-4" />
                </button>
              </div>
              
              {/* Global Playback Controls */}
              <div className="tw-flex tw-items-center tw-gap-2 tw-mx-4 tw-p-2 tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-shadow">
                <span className="tw-text-xs tw-font-semibold tw-text-neutral-400 tw-uppercase tw-tracking-wide">Global:</span>
                <button
                  onClick={globalPlay}
                  className={`tw-inline-flex tw-items-center tw-justify-center tw-min-w-9 tw-h-8 tw-rounded tw-border tw-text-sm ${isGlobalPlaying ? 'tw-bg-blue-600 tw-text-white tw-border-blue-600' : 'tw-bg-neutral-800 tw-text-neutral-300 tw-border-neutral-700'} hover:tw-bg-blue-600 hover:tw-text-white`}
                  title="Global Play - Resume all videos"
                >
                  <PlayIcon className="tw-w-4 tw-h-4" />
                </button>
                <button
                  onClick={globalPause}
                  className={`tw-inline-flex tw-items-center tw-justify-center tw-min-w-9 tw-h-8 tw-rounded tw-border tw-text-sm ${!isGlobalPlaying ? 'tw-bg-purple-600 tw-text-white tw-border-purple-600' : 'tw-bg-neutral-800 tw-text-neutral-300 tw-border-neutral-700'} hover:tw-bg-purple-600 hover:tw-text-white`}
                  title="Global Pause - Pause all videos"
                >
                  <PauseIcon className="tw-w-4 tw-h-4" />
                </button>
                <button
                  onClick={globalStop}
                  className="tw-inline-flex tw-items-center tw-justify-center tw-min-w-9 tw-h-8 tw-rounded tw-border tw-text-sm tw-bg-neutral-800 tw-text-neutral-300 tw-border-neutral-700 hover:tw-bg-red-600 hover:tw-text-white hover:tw-border-red-600"
                  title="Global Stop - Stop all videos"
                >
                  <StopIcon className="tw-w-4 tw-h-4" />
                </button>
              </div>
              
              <button 
                 onClick={() => setShowTimeline(!showTimeline)}
                 className={`tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-text-sm tw-p-2 tw-transition-colors ${
                   showTimeline
                     ? 'tw-bg-sky-600 tw-text-white tw-border-sky-600'
                     : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'
                 }`}
                 title={showTimeline ? 'Switch to Grid View' : 'Switch to Timeline View'}
               >
                 {showTimeline ? (
                   <GridIcon className="tw-w-4 tw-h-4" />
                 ) : (
                   <RowsIcon className="tw-w-4 tw-h-4" />
                 )}
               </button>

            </div>
            

            

          </div>

          <div className="tw-flex-1" style={{ height: `${paneSizes.gridHeight}%` }}>
            {showTimeline ? (
              <Timeline 
                onClose={() => setShowTimeline(false)} 
                onPreviewUpdate={handleTimelinePreviewUpdate}
              />
            ) : (
              <>
                {/* Global Effects Row */}
                <div className="tw-px-3 tw-py-2">
                  <div 
                    className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2"
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
                    <div className="tw-grid tw-grid-cols-5 tw-gap-2">
                      {Array.from({ length: 10 }, (_, index) => {
                        const effectSlot = currentScene?.globalEffects?.[index];
                        
                        if (effectSlot) {
                          // Render existing effect slot
                          return (
                            <div
                              key={effectSlot.id || `effect-${index}`}
                              className={`tw-rounded tw-border tw-p-2 tw-bg-neutral-900 tw-border-neutral-800 ${effectSlot.enabled ? 'tw-ring-2 tw-ring-sky-600' : ''}`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const updatedEffects = currentScene.globalEffects.filter((_: any, i: number) => i !== index);
                                updateScene(currentSceneId, { globalEffects: updatedEffects });
                              }}
                              title="Right-click to remove"
                            >
                              <div 
                                className="tw-flex tw-items-center tw-gap-2 tw-cursor-pointer"
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
                                title="Click to edit effect parameters"
                              >
                                <button
                                  className={`tw-inline-flex tw-items-center tw-justify-center tw-w-6 tw-h-6 tw-rounded tw-border ${effectSlot.enabled ? 'tw-bg-red-600 tw-border-red-600' : 'tw-bg-neutral-800 tw-border-neutral-700'} tw-text-white`}
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
                                  {effectSlot.enabled ? (
                                    <StopIcon width={12} height={12} />
                                  ) : (
                                    <PlayIcon width={12} height={12} />
                                  )}
                                </button>
                                <span className="tw-text-sm tw-text-neutral-200">
                                  {effectSlot.name || effectSlot.effectId || 'Unknown Effect'}
                                </span>
                                {effectSlot.enabled && <div className="tw-text-red-500">•</div>}
                              </div>
                            </div>
                          );
                      } else {
                        // Render empty slot
                        return (
                          <div key={`empty-slot-${index}`} className="tw-rounded tw-border tw-border-dashed tw-border-neutral-800 tw-bg-neutral-900 tw-p-2">
                           <div className="tw-h-6" />
                          </div>
                        );
                      }
                       })}
                    </div>
                  </div>
                </div>

            {/* Composition Row */}
            <div className="tw-grid tw-gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {columns.map((column: any) => {
                const isColumnPlaying = playingColumnId === column.id;
                // Consider column playable if any layer has an asset
                const hasClips = column.layers.some((layer: any) => Boolean(layer?.asset));
                
                return (
                  <div key={column.id} className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-overflow-hidden">
                    <div 
                      className={`tw-flex tw-items-center tw-justify-between tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800 ${isColumnPlaying ? 'tw-bg-blue-900/30' : 'tw-bg-neutral-800'} ${hasClips ? 'tw-cursor-pointer' : 'tw-cursor-default'} ${!hasClips ? 'tw-opacity-60' : ''}`}
                      onClick={() => {
                        // Only allow play functionality if column has clips
                        if (hasClips) {
                          console.log('Column header clicked for column:', column.id);
                          console.log('Starting/restarting column playback from header');
                          handleColumnPlayWrapper(column.id);
                        }
                      }}
                      title={hasClips ? "Click anywhere to play/restart column" : "Column has no clips"}
                    >
                      <h4 className="tw-text-sm tw-text-white">{columns.findIndex(c => c.id === column.id) + 1}</h4>
                      <div className="tw-text-neutral-300">
                        {hasClips ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Layer Rows */}
             {[3, 2, 1].map((layerNum) => (
               <div key={layerNum} className="tw-grid tw-gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                 {columns.map((column: any) => {
                   // Find layer by layer number or name fallback
                   const layer = column.layers.find((l: any) => l.layerNum === layerNum || l.name === `Layer ${layerNum}`);
                   const displayName = layer?.asset?.name || layer?.asset?.metadata?.name || layer?.asset?.effect?.name || '';
                   const hasAsset = Boolean(layer?.asset);
                   const cellId = `${column.id}-${layerNum}`;
                   const isDragOver = dragOverCell === cellId;
                   const isDragOverLayer = dragOverLayer === cellId;
 
                   return (
                     <div
                       key={cellId}
                       className={`tw-rounded-md tw-overflow-hidden ${hasAsset ? 'tw-border tw-border-neutral-800 tw-bg-neutral-900' : 'tw-border tw-border-dashed tw-border-neutral-800 tw-bg-neutral-900/50'} ${selectedLayer?.id === layer?.id ? 'tw-ring-2 tw-ring-purple-600' : ''} ${(isDragOver || isDragOverLayer) ? 'tw-ring-2 tw-ring-sky-600' : ''} ${contextHighlightedCell === cellId ? 'tw-bg-neutral-800/60' : ''}`}
                       data-system-files={isDragOver && (() => {
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
                           handleLayerReorderDragStart(e, layer, column.id, setDraggedLayer);
                         }
                       }}
                       onDragEnd={handleDragEnd}
                       onDragOver={(e) => {
                         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                           (window as any).currentDragData = { files: e.dataTransfer.files };
                         }
                         handleDragOverWrapper(e, cellId);
                         if (draggedLayer && draggedLayer.sourceColumnId === column.id) {
                           handleLayerReorderDragOverWrapper(e, column.id, layerNum);
                         }
                       }}
                       onDragLeave={(e) => handleDragLeaveWrapper(e)}
                       onDrop={(e) => {
                         (window as any).currentDragData = null;
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
                             handleDropWrapper(e, column.id, layerNum);
                           }
                         } else {
                           handleDropWrapper(e, column.id, layerNum);
                         }
                       }}
                       draggable={hasAsset}
                     >
                       {hasAsset ? (
                         <div 
                           className="tw-p-2 tw-space-y-1"
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
                           <div className="tw-mb-1">
                             {layer.asset.type === 'image' && (
                               <img
                                 src={getAssetPath(layer.asset)}
                                 alt={layer.asset.name}
                                 className="tw-w-full tw-max-h-24 tw-object-cover tw-rounded"
                                 onLoad={() => {
                                   console.log('Image loaded successfully:', layer.asset.name, 'Path:', getAssetPath(layer.asset));
                                 }}
                                 onError={(e) => {
                                   console.error('Failed to load image:', layer.asset.name, 'Path:', getAssetPath(layer.asset));
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
                                 src={getAssetPath(layer.asset, true)}
                                 className="tw-w-full tw-max-h-24 tw-rounded"
                                 muted
                                 onLoadStart={() => console.log('Layer video loading:', layer.asset.name)}
                                 onLoadedData={() => console.log('Layer video loaded:', layer.asset.name)}
                                 onError={(e) => console.error('Layer video error:', layer.asset.name, e)}
                               />
                             )}
                             {(layer.asset.isEffect || layer.asset.type === 'p5js' || layer.asset.type === 'threejs') && (
                               <div className="tw-flex tw-items-center tw-justify-between">
                                 <div className="tw-text-xs tw-text-neutral-300">Effect</div>
                                 <div className="tw-text-[10px] tw-px-1.5 tw-py-0.5 tw-rounded tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-text-neutral-300">
                                   {layer.asset.type.toUpperCase()}
                                 </div>
                               </div>
                             )}
                           </div>
                           <div 
                              className="tw-text-xs tw-text-neutral-200 tw-cursor-grab"
                              draggable={true}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                handleLayerReorderDragStart(e, layer, column.id, setDraggedLayer);
                              }}
                            >
                             {displayName || 'Empty'}
                           </div>
                           {layer.blendMode && layer.blendMode !== 'add' && (
                             <div className="tw-text-[10px] tw-text-neutral-400">
                               {layer.blendMode}
                             </div>
                           )}
                         </div>
                       ) : (
                         <div 
                           className="tw-p-2 tw-min-h-[48px] tw-flex tw-flex-col tw-justify-center tw-items-center"
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
                           <div className="tw-h-6 tw-w-full tw-rounded tw-border tw-border-dashed tw-border-neutral-700"></div>
                           <div className="tw-text-[10px] tw-text-neutral-500"></div>
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
            className={`${isResizing ? 'tw-bg-cyan-500 tw-border-cyan-500' : 'tw-bg-neutral-800 hover:tw-bg-neutral-700'} tw-h-1.5 tw-border-y tw-border-neutral-700 tw-cursor-ns-resize`}
            onMouseDown={handleResizeStart}
          >
            <div className="tw-text-neutral-400 tw-text-xs tw-text-center">⋮⋮</div>
          </div>

          {/* Bottom Section with Preview, Layer Options, and Media Library */}
          <div 
            className="tw-flex tw-gap-3 tw-p-3 tw-border-t tw-border-neutral-800"
            style={{ height: `${paneSizes.mediaLibraryHeight}%` }}
          >
            {/* Preview Window - Bottom Left */}
            <div 
              className="tw-flex tw-flex-col tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md tw-overflow-hidden tw-basis-[30%] tw-flex-none tw-min-w-[200px]"
            >
              <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
                <h3>Preview</h3>
              </div>
              <div 
                className="tw-flex tw-items-center tw-justify-center tw-bg-black tw-w-full"
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
            <div className="tw-flex-1 tw-min-w-[260px] tw-overflow-auto tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
              <LayerOptions 
                selectedLayer={selectedLayer}
                onUpdateLayer={handleUpdateSelectedLayer}
              />
            </div>

            {/* Media Library / MIDI Mapper - Bottom Right */}
            <div className="tw-w-1/3 tw-min-w-[320px] tw-overflow-hidden tw-bg-neutral-900 tw-border tw-border-neutral-800 tw-rounded-md">
              {/* Tab Navigation */}
              <div className="tw-border-b tw-border-neutral-800 tw-px-3 tw-py-2">
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
              <div className="tw-p-3 tw-overflow-auto tw-h-full">
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
            className="context-menu tw-fixed tw-z-[10000]"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 150), top: Math.min(contextMenu.y, window.innerHeight - 60) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tw-min-w-[160px] tw-overflow-hidden tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-lg">
            {/* Cell-specific options - only show if we have a layer selected (not empty cells) */}
            {contextMenu.layerId && !contextMenu.layerId.startsWith('empty-') && (
              <>
                <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleCopyCell}><CopyIcon width={12} height={12} /> Copy Cell</div>
                
                <div className={"tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800 " + ((clipboard && clipboard.type === 'cell') ? '' : 'tw-opacity-50')} onClick={clipboard && clipboard.type === 'cell' ? handlePasteCell : undefined}><CopyIcon width={12} height={12} /> Paste Cell</div>

                {/* Clip options - for actual media/effects */}
                <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleCopyClip}><CopyIcon width={12} height={12} /> Copy Clip</div>
                
                <div className={"tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800 " + ((clipboard && clipboard.type === 'clip') ? '' : 'tw-opacity-50')} onClick={clipboard && clipboard.type === 'clip' ? handlePasteClip : undefined}><CopyIcon width={12} height={12} /> Paste Clip</div>
              </>
            )}
            
            {/* Cell paste option - show if we have a cell in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'cell' && (
              <div
                className="context-menu-item tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                onClick={handlePasteCell}
              >
                  Paste Cell
              </div>
            )}

            {/* Clip paste option - show if we have a clip in clipboard (for empty cells) */}
            {clipboard && clipboard.type === 'clip' && (
              <div
                className="context-menu-item tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                onClick={handlePasteClip}
              >
                  Paste Clip
              </div>
            )}
            
            {/* Column options - always show */}
            <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleCopyColumn}><CopyIcon width={12} height={12} /> Copy Column</div>
            
            <div className={"tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800 " + ((clipboard && clipboard.type === 'column') ? '' : 'tw-opacity-50')} onClick={clipboard && clipboard.type === 'column' ? handlePasteColumn : undefined}><CopyIcon width={12} height={12} /> Paste Column</div>
            
            {/* Delete option - show different text based on context */}
            <div className="tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800" onClick={handleDeleteLayer}><TrashIcon width={12} height={12} /> {contextMenu.layerId && contextMenu.layerId !== 'unknown' ? 'Delete Layer' : 'Delete Column'}</div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('❌ Error rendering LayerManager:', error);
    return (
      <div className="layer-manager-main tw-relative tw-w-full tw-h-full tw-bg-black tw-text-white tw-flex tw-flex-col tw-overflow-hidden tw-pt-4">
        <div className="tw-flex tw-flex-col tw-h-full tw-overflow-hidden">
          <div className="tw-flex tw-items-center tw-justify-between tw-min-h-8 tw-px-4 tw-py-1 tw-bg-neutral-900 tw-border-b tw-border-neutral-800">
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
            className="context-menu tw-fixed tw-z-[10000] tw-bg-neutral-800 tw-border-2 tw-border-neutral-600 tw-rounded tw-py-2 tw-min-w-[140px] tw-shadow-2xl"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 150), // Ensure it doesn't go off-screen
              top: Math.min(contextMenu.y, window.innerHeight - 60)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cell-specific options - only show if we have a layer selected (not empty cells) */}
            {contextMenu.layerId && !contextMenu.layerId.startsWith('empty-') && (
              <>
                <div
                  className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                  onClick={handleCopyCell}
                >
                  📋 Copy Cell
                </div>
                
                <div
                  className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + ((clipboard && clipboard.type === 'cell') ? 'tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700' : 'tw-cursor-default tw-text-neutral-500 tw-opacity-50')}
                  onClick={clipboard && clipboard.type === 'cell' ? handlePasteCell : undefined}
                >
                  📋 Paste Cell
                </div>

                {/* Clip options - for actual media/effects */}
                <div
                  className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
                  onClick={handleCopyClip}
                >
                  📋 Copy Clip
                </div>
                
                <div
                  className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + ((clipboard && clipboard.type === 'clip') ? 'tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700' : 'tw-cursor-default tw-text-neutral-500 tw-opacity-50')}
                  onClick={clipboard && clipboard.type === 'clip' ? handlePasteClip : undefined}
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
              className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5"
              onClick={handleCopyColumn}
            >
              📋 Copy Column
            </div>
            
            <div
              className={"context-menu-item tw-select-none tw-text-sm tw-font-medium tw-bg-transparent tw-border-b tw-border-neutral-700 tw-py-3 tw-px-5 " + ((clipboard && clipboard.type === 'column') ? 'tw-cursor-pointer tw-text-white hover:tw-bg-neutral-700' : 'tw-cursor-default tw-text-neutral-500 tw-opacity-50')}
              onClick={clipboard && clipboard.type === 'column' ? handlePasteColumn : undefined}
            >
              📋 Paste Column
            </div>
            
            {/* Delete option - show different text based on context */}
            <div
              className="context-menu-item tw-select-none tw-cursor-pointer tw-text-white tw-text-sm tw-font-medium tw-bg-transparent hover:tw-bg-neutral-700 tw-transition-colors tw-py-3 tw-px-5"
              onClick={handleDeleteLayer}
            >
              {contextMenu.layerId && contextMenu.layerId !== 'unknown' ? 'Delete Layer' : 'Delete Column'}
            </div>
          </div>
        )}
      </div>
    );
  }
};