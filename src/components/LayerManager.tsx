import React, { useState, startTransition, useEffect } from 'react';
import { useStore } from '../store/store';
import { MediaLibrary } from './MediaLibrary';
import { LayerOptions } from './LayerOptions';
import { MIDIMapper } from './MIDIMapper';
import { CanvasRenderer } from './CanvasRenderer';
import { ColumnPreview } from './ColumnPreview';
import { EffectsBrowser } from './EffectsBrowser';
import { Timeline } from './Timeline';
import { BPMManager } from '../engine/BPMManager';
import { v4 as uuidv4 } from 'uuid';

interface LayerManagerProps {
  onClose: () => void;
}

export const LayerManager: React.FC<LayerManagerProps> = ({ onClose }) => {
  console.log('LayerManager component rendering');
  
  const { scenes, currentSceneId, setCurrentScene, addScene, removeScene, updateScene, compositionSettings, bpm, setBpm, playingColumnId, playColumn, stopColumn, clearStorage } = useStore() as any;
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
  const [activeTab, setActiveTab] = useState<'media' | 'effects' | 'midi'>('media');
  const [showTimeline, setShowTimeline] = useState(false);
  const [draggedLayer, setDraggedLayer] = useState<any>(null);
  const [dragOverLayer, setDragOverLayer] = useState<string | null>(null);

  console.log('LayerManager state - scenes:', scenes, 'currentSceneId:', currentSceneId);
  console.log('🎭 Preview state - previewContent:', previewContent, 'isPlaying:', isPlaying);

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
    console.log('🎵 handleColumnPlay called with columnId:', columnId);
    const column = currentScene?.columns.find((col: any) => col.id === columnId);
    console.log('🎵 Found column:', column);
    
    if (column) {
      const layersWithContent = column.layers.filter((layer: any) => layer.asset);
      console.log('🎵 Column layers with content:', layersWithContent);
      console.log('🎵 Total layers in column:', column.layers.length);
      
      if (layersWithContent.length === 0) {
        console.log('❌ No layers with content in column:', columnId);
        // Show a helpful message in the preview
        setPreviewContent({
          type: 'column',
          columnId: columnId,
          column: column,
          layers: column.layers || [],
          isEmpty: true
        });
        setIsPlaying(false); // Don't start playing if no content
        return;
      }
      
      // Switch to the new column immediately
      console.log('▶️ Switching to column:', columnId);
      try {
        playColumn(columnId);
      } catch (error) {
        console.warn('Failed to play column, clearing storage:', error);
        clearStorage();
      }
      
      // Update preview content immediately without causing flash
      const newPreviewContent = {
        type: 'column',
        columnId: columnId,
        column: column,
        layers: column.layers || []
      };
      
      console.log('🎵 Setting preview content for column:', columnId);
      console.log('🎵 Preview content will be:', newPreviewContent);
      
      // Batch state updates to prevent flash
      React.startTransition(() => {
        setPreviewContent(newPreviewContent);
        setIsPlaying(true);
      });
      console.log('✅ Playing column:', columnId, column);
    } else {
      console.error('❌ Column not found:', columnId);
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
    console.log('🛑 handleStop called');
    setIsPlaying(false);
    setPreviewContent(null);
    try {
      stopColumn(); // Stop the currently playing column
    } catch (error) {
      console.warn('Failed to stop column, clearing storage:', error);
      clearStorage();
    }
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

  const handleUpdateLayer = (layerId: string, updatedLayer: any) => {
    if (currentScene) {
      // Create a deep copy of the current scene
      const updatedScene = JSON.parse(JSON.stringify(currentScene));
      
      // Find the layer in any column
      let layerFound = false;
      for (const column of updatedScene.columns) {
        const layer = column.layers.find((layer: any) => layer.id === layerId);
        if (layer) {
          // Update the layer with new options
          Object.assign(layer, updatedLayer);
          layerFound = true;
          console.log('Updated layer options:', layerId, updatedLayer);
          break;
        }
      }
      
      if (layerFound) {
        // Update the entire scene
        updateScene(currentScene.id, updatedScene);
        
        // Update selected layer if it's the same one
        if (selectedLayer && selectedLayer.id === layerId) {
          setSelectedLayer(updatedLayer);
        }
        
        // Force component refresh
        setRefreshTrigger(prev => prev + 1);
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
          // Handle placeholder columns like "column-3" by auto-creating a real column
          const placeholderMatch = /^column-(\d+)$/.exec(columnId);
          if (placeholderMatch) {
            const colIndex = parseInt(placeholderMatch[1], 10) - 1;
            const newColumn = {
              id: uuidv4(),
              name: `Column ${colIndex + 1}`,
              layers: [],
            };
            const updatedColumns = [...currentScene.columns];
            // Ensure array is large enough
            while (updatedColumns.length <= colIndex) {
              updatedColumns.push({ id: uuidv4(), name: `Column ${updatedColumns.length + 1}`, layers: [] });
            }
            updatedColumns[colIndex] = newColumn;
            updateScene(currentSceneId, { columns: updatedColumns });
            console.log('🆕 Auto-created column for drop:', newColumn);
            // continue with the newly created column
            currentScene.columns = updatedColumns;
          } else {
            console.error('❌ Column not found and not a placeholder:', columnId);
            return;
          }
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
          layerNum: layerNum,
          loopMode: 'none', // Default loop mode
          loopCount: 1,
          reverseEnabled: false,
          pingPongEnabled: false,
          blendMode: 'add', // Default blend mode for stacking
          opacity: 1.0 // Default opacity
        };
          
          if (!column.layers) {
            column.layers = [];
          }
          column.layers.push(layer);
          console.log('🟢 Created new layer:', layer);
        } else {
          console.log('🟢 Found existing layer:', layer);
        }
        
        // Check asset type
        const isVideo = asset.type === 'video';
        const isEffect = asset.isEffect || asset.type === 'p5js' || asset.type === 'threejs';
        
        console.log('🟢 Asset type check - isVideo:', isVideo, 'isEffect:', isEffect, 'asset type:', asset.type, 'asset isEffect:', asset.isEffect);
        
        // Handle effects
        if (isEffect) {
          console.log('🟢 Dropping effect asset:', asset.name, 'type:', asset.type, 'id:', asset.id);
          layer.asset = asset;
          layer.type = 'effect'; // Set layer type to effect
          layer.effectType = asset.type; // Store the effect type (p5js or threejs)
          layer.effectFile = asset.filePath; // Store the effect file path
          
          // Set default parameters for effects
          const getLayerEffectParams = (effectId: string) => {
            console.log('🟢 Getting layer effect params for:', effectId);
            switch (effectId) {
              case 'strobe-effect':
              case 'global-strobe-r3f':
                console.log('🟢 Setting strobe effect params');
                return {
                  intensity: { value: 0.8, min: 0, max: 1, step: 0.01 },
                  color: { value: '#ffffff' },
                  speed: { value: 1, min: 0.1, max: 5, step: 0.1 },
                  frequency: { value: 24, min: 1, max: 60, step: 1 }
                };
              case 'bpm-particle-effect':
                return {
                  count: { value: 1000, min: 100, max: 5000, step: 100 },
                  speed: { value: 0.5, min: 0.1, max: 2, step: 0.1 },
                  size: { value: 0.02, min: 0.001, max: 0.1, step: 0.001 },
                  color: { value: '#ffffff' },
                  spread: { value: 10, min: 1, max: 50, step: 1 },
                  pulseIntensity: { value: 0.5, min: 0, max: 1, step: 0.01 }
                };
              case 'film-noise-r3f':
                return {
                  intensity: { value: 0.5, min: 0, max: 1, step: 0.01 },
                  color: { value: '#ffffff' },
                  opacity: { value: 0.4, min: 0, max: 1, step: 0.01 }
                };
              case 'film-flicker-r3f':
                return {
                  intensity: { value: 0.2, min: 0, max: 1, step: 0.01 },
                  speed: { value: 1, min: 0.1, max: 5, step: 0.1 },
                  color: { value: '#ffffff' }
                };
              case 'light-leak-r3f':
                return {
                  intensity: { value: 0.3, min: 0, max: 1, step: 0.01 },
                  color: { value: '#ff6b35' },
                  position: { value: 'right', options: ['left', 'right', 'top', 'bottom'] },
                  speed: { value: 0.5, min: 0.1, max: 2, step: 0.1 }
                };
              case 'global-datamosh':
                return {
                  intensity: { value: 0.5, min: 0, max: 1, step: 0.01 },
                  speed: { value: 1, min: 0.1, max: 5, step: 0.1 }
                };
              case 'video-wave-slice':
                return {
                  amplitude: { value: 0.5, min: 0, max: 2, step: 0.1 },
                  frequency: { value: 2, min: 0.1, max: 10, step: 0.1 },
                  speed: { value: 1, min: 0.1, max: 5, step: 0.1 }
                };
              case 'circle-pulse-effect':
                return {
                  size: { value: 0.8, min: 0.1, max: 2, step: 0.1 },
                  speed: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
                  color: { value: 'blue' }
                };
              case 'square-pulse-effect':
                return {
                  size: { value: 0.8, min: 0.1, max: 2, step: 0.1 },
                  speed: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
                  color: { value: 'red' }
                };
              case 'wave-effect':
                return {
                  amplitude: { value: 0.5, min: 0, max: 2, step: 0.1 },
                  frequency: { value: 2.0, min: 0.1, max: 10, step: 0.1 },
                  speed: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
                  color: { value: 'cyan' }
                };
              case 'geometric-pattern-effect':
                return {
                  pattern: { value: 'spiral', options: ['spiral', 'grid', 'hexagon'] },
                  speed: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
                  color: { value: 'magenta' },
                  complexity: { value: 5, min: 1, max: 10, step: 1 }
                };
              case 'audio-reactive-effect':
                return {
                  sensitivity: { value: 0.5, min: 0, max: 1, step: 0.01 },
                  frequency: { value: 440, min: 20, max: 20000, step: 1 },
                  color: { value: 'orange' },
                  mode: { value: 'bars', options: ['bars', 'circles', 'waves'] }
                };
              case 'color-pulse-effect':
                return {
                  intensity: { value: 0.5, min: 0, max: 1, step: 0.01 },
                  colorSpeed: { value: 0.1, min: 0, max: 1, step: 0.01 },
                  autoColor: { value: true },
                  mode: { value: 'gradient', options: ['gradient', 'solid', 'rainbow'] }
                };
              case 'particle-effect':
              case 'r3f-particle-system':
                return {
                  count: { value: 1500, min: 100, max: 5000, step: 100 },
                  speed: { value: 0.8, min: 0.1, max: 2, step: 0.1 },
                  size: { value: 0.03, min: 0.001, max: 0.1, step: 0.001 },
                  spread: { value: 10, min: 1, max: 50, step: 1 }
                };
              default:
                console.log('🟢 No specific params for effect:', effectId);
                return {};
            }
          };
          
          layer.params = getLayerEffectParams(asset.id);
          console.log('🟢 Set layer as effect with params:', layer);
        }
        // Handle videos
        else if (isVideo && layer.asset && layer.asset.type === 'video') {
          console.log('🟢 Replacing existing video in layer:', layer.id);
          layer.asset = asset;
          layer.type = 'video';
          // Auto-set video to loop mode
          layer.loopMode = 'loop';
          console.log('🟢 Auto-set video to loop mode');
        } else if (isVideo && layer.asset) {
          // If layer has a non-video asset, replace it
          console.log('🟢 Replacing non-video asset with video in layer:', layer.id);
          layer.asset = asset;
          layer.type = 'video';
          // Auto-set video to loop mode
          layer.loopMode = 'loop';
          console.log('🟢 Auto-set video to loop mode');
        } else if (!isVideo && layer.asset && layer.asset.type === 'video') {
          // If dropping non-video on video layer, replace video
          console.log('🟢 Replacing video with non-video asset in layer:', layer.id);
          layer.asset = asset;
          layer.type = 'image';
          // Reset loop mode for non-video
          layer.loopMode = 'none';
        } else {
          // Normal case - just set the asset
          layer.asset = asset;
          layer.type = asset.type === 'image' ? 'image' : 'video';
          // Auto-set video to loop mode if it's a video
          if (isVideo) {
            layer.loopMode = 'loop';
            console.log('🟢 Auto-set video to loop mode');
          }
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

  // Handle drag start from layer cells to enable drag-to-remove
  const handleLayerDragStart = (e: React.DragEvent, layer: any, columnId: string) => {
    if (!layer.asset) return;
    
    console.log('🎯 Starting drag from layer:', layer.name, 'asset:', layer.asset.name);
    
    // Set drag data for potential reordering (though we'll use it for removal)
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'layer-asset',
      layer: layer,
      columnId: columnId,
      asset: layer.asset
    }));
    
    e.dataTransfer.effectAllowed = 'move';
    
    // Show removal zone
    document.body.classList.add('dragging');
  };

  // Handle drag over for removal zone
  const handleRemoveZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop in removal zone
  const handleRemoveZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    const dragData = e.dataTransfer.getData('application/json');
    if (!dragData) return;
    
    try {
      const data = JSON.parse(dragData);
      
      if (data.type === 'layer-asset') {
        console.log('🗑️ Removing asset from layer:', data.layer.name, 'asset:', data.asset.name);
        
        // Find the current scene and column
        const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
        if (!currentScene) return;
        
        const column = currentScene.columns.find((col: any) => col.id === data.columnId);
        if (!column) return;
        
        // Find the layer and remove the asset
        const layer = column.layers.find((l: any) => l.id === data.layer.id);
        if (layer) {
          layer.asset = null;
          layer.type = 'media';
          
          console.log('🗑️ Asset removed from layer:', layer.name);
          
          // Update the scene
          updateScene(currentSceneId, { columns: currentScene.columns });
          
          // Trigger a refresh
          setRefreshTrigger(prev => prev + 1);
        }
      }
    } catch (error) {
      console.error('❌ Error processing removal drop:', error);
    }
    
    // Hide removal zone
    document.body.classList.remove('dragging');
  };

  // Handle drag end to hide removal zone
  const handleDragEnd = () => {
    setDragOverCell(null);
    setDraggedLayer(null);
    setDragOverLayer(null);
    document.body.classList.remove('dragging');
  };

  const getLayerTypeName = (type: string) => {
    switch (type) {
      case 'image':
        return 'Image';
      case 'video':
        return 'Video';
      case 'effect':
        return 'Effect';
      case 'p5js':
        return 'p5.js Effect';
      case 'threejs':
        return 'Three.js Effect';
      default:
        return 'Unknown';
    }
  };

  const getTrackColor = (type: string) => {
    switch (type) {
      case 'audio': return '#4CAF50';
      case 'video': return '#2196F3';
      case 'effect': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  // Layer reordering handlers
  const handleLayerReorderDragStart = (e: React.DragEvent, layer: any, columnId: string) => {
    console.log('🔄 Starting layer reorder drag:', layer, 'from column:', columnId);
    setDraggedLayer({ ...layer, sourceColumnId: columnId });
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'layer-reorder',
      layer: layer,
      sourceColumnId: columnId
    }));
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('dragging');
  };

  const handleLayerReorderDragOver = (e: React.DragEvent, targetColumnId: string, targetLayerNum: number) => {
    e.preventDefault();
    if (draggedLayer) {
      const targetCellId = `${targetColumnId}-${targetLayerNum}`;
      setDragOverLayer(targetCellId);
    }
  };

  const handleLayerReorderDrop = (e: React.DragEvent, targetColumnId: string, targetLayerNum: number) => {
    e.preventDefault();
    
    if (!draggedLayer) return;
    
    console.log('🔄 Dropping layer reorder:', {
      draggedLayer,
      targetColumnId,
      targetLayerNum
    });

    try {
      const dragData = e.dataTransfer.getData('application/json');
      if (!dragData) return;
      
      const data = JSON.parse(dragData);
      if (data.type !== 'layer-reorder') return;

      const { layer: draggedLayerData, sourceColumnId } = data;
      
      // Allow moving layers between columns
      console.log('🔄 Moving layer between columns:', sourceColumnId, '->', targetColumnId);

      // Find the source column and target column
      const sourceColumn = currentScene.columns.find((col: any) => col.id === sourceColumnId);
      const targetColumn = currentScene.columns.find((col: any) => col.id === targetColumnId);
      
      if (!sourceColumn || !targetColumn) return;

      // Find the source layer in the source column
      const sourceLayerIndex = sourceColumn.layers.findIndex((l: any) => l.id === draggedLayerData.id);
      if (sourceLayerIndex === -1) return;

      const sourceLayer = sourceColumn.layers[sourceLayerIndex];

      // Don't allow dropping on the same layer position if moving within the same column
      if (sourceColumnId === targetColumnId) {
        const sourceLayerNum = sourceLayer.layerNum || parseInt(sourceLayer.name.replace('Layer ', ''));
        if (sourceLayerNum === targetLayerNum) {
          console.log('❌ Cannot drop on same layer position');
          return;
        }
      }

      // Create new layers array for target column
      const newTargetLayers = [...targetColumn.layers];
      
      // Find the target layer to determine insertion position
      const targetLayerIndex = newTargetLayers.findIndex((l: any) => {
        const layerNum = l.layerNum || parseInt(l.name.replace('Layer ', ''));
        return layerNum === targetLayerNum;
      });

      // Update the dragged layer's layer number and column
      const updatedLayer = {
        ...sourceLayer,
        layerNum: targetLayerNum,
        name: `Layer ${targetLayerNum}`
      };

      // Insert at the target position in target column
      if (targetLayerIndex === -1) {
        // Target layer doesn't exist, add at the end
        newTargetLayers.push(updatedLayer);
      } else {
        // Insert before the target layer
        newTargetLayers.splice(targetLayerIndex, 0, updatedLayer);
      }

      // Remove from source column (if different from target)
      let newSourceLayers = [...sourceColumn.layers];
      if (sourceColumnId !== targetColumnId) {
        newSourceLayers.splice(sourceLayerIndex, 1);
      } else {
        // Same column reordering - remove from current position
        newSourceLayers.splice(sourceLayerIndex, 1);
      }

      // Update the scene with the new layers
      const updatedColumns = currentScene.columns.map((col: any) => {
        if (col.id === targetColumnId) {
          return { ...col, layers: newTargetLayers };
        } else if (col.id === sourceColumnId) {
          return { ...col, layers: newSourceLayers };
        }
        return col;
      });

      updateScene(currentSceneId, { columns: updatedColumns });
      console.log('✅ Layer moved successfully');
      
    } catch (error) {
      console.error('❌ Error reordering layer:', error);
    }
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

    if (previewContent.type === 'column') {
      console.log('🎨 Rendering column preview');
      // Show the first layer with content as the main preview
      const layersWithContent = previewContent.layers.filter((layer: any) => layer.asset);
      console.log('🎨 Layers with content:', layersWithContent);
      
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

      // Use the new ColumnPreview component for combined layer rendering
      console.log('🎨 Rendering combined column preview with p5.js');
      console.log('🎨 Column data:', previewContent.column);
      console.log('🎨 Composition settings:', compositionSettings);
      
      const previewElement = (
        <div className="preview-column">
          <div className="preview-main-content">
            <ColumnPreview
              column={previewContent.column}
              width={compositionSettings.width}
              height={compositionSettings.height}
              isPlaying={isPlaying && playingColumnId === previewContent.columnId}
              bpm={bpm}
              globalEffects={currentScene?.globalEffects || []}
            />
          </div>
          <div className="preview-layers-info">
            <h5>Layers in Column:</h5>
            {layersWithContent.map((layer: any, index: number) => (
              <div key={layer.id} className="preview-layer-item">
                <div className="preview-layer-name">{layer.name}</div>
                <div className="preview-layer-asset-type">{layer.asset.type}</div>
              </div>
            ))}
          </div>
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
      return (
        <div className="preview-timeline">
          <div className="preview-header-info">
            <h4>Timeline Preview</h4>
            <span className="preview-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
          </div>
          <div className="preview-timeline-content">
            <div className="preview-timeline-info">
              <div className="preview-time-display">
                Time: {Math.floor(previewContent.currentTime)}s / {Math.floor(previewContent.duration)}s
              </div>
              <div className="preview-tracks-info">
                <h5>Active Tracks:</h5>
                {previewContent.tracks.map((track: any) => (
                  <div key={track.id} className="preview-track-item">
                    <span className="track-name">{track.name}</span>
                    <span className="track-clips-count">{track.clips.length} clips</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="preview-timeline-visualization">
              {/* Timeline visualization placeholder */}
              <div className="timeline-preview-placeholder">
                <div className="timeline-preview-header">
                  <h5>Timeline Preview</h5>
                  <div className="timeline-preview-controls">
                    <span className="current-time">{Math.floor(previewContent.currentTime)}s</span>
                    <div className="timeline-progress-bar">
                      <div 
                        className="timeline-progress-fill"
                        style={{ width: `${(previewContent.currentTime / previewContent.duration) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="timeline-tracks-preview">
                  {previewContent.tracks.map((track: any) => (
                    <div key={track.id} className="timeline-track-preview">
                      <div className="track-header-preview" style={{ backgroundColor: getTrackColor(track.type) }}>
                        {track.name}
                      </div>
                      <div className="track-content-preview">
                        {track.clips.map((clip: any) => (
                          <div
                            key={clip.id}
                            className={`timeline-clip-preview ${
                              previewContent.currentTime >= clip.startTime && 
                              previewContent.currentTime < clip.startTime + clip.duration ? 'active' : ''
                            }`}
                            style={{
                              left: `${(clip.startTime / previewContent.duration) * 100}%`,
                              width: `${(clip.duration / previewContent.duration) * 100}%`,
                              backgroundColor: getTrackColor(clip.type)
                            }}
                          >
                            {clip.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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

  // Ensure we have at least 10 columns
  const columns = [...currentScene.columns];
  let columnsAdded = 0;
  while (columns.length < 10) {
    columns.push({ id: uuidv4(), name: `Column ${columns.length + 1}`, layers: [] });
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
                {scenes.map((scene: any) => (
                  <div
                    key={scene.id}
                    className={`scene-tab ${scene.id === currentSceneId ? 'active' : ''}`}
                    onClick={() => setCurrentScene(scene.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      
                      // Create context menu
                      const menu = document.createElement('div');
                      menu.className = 'context-menu';
                      menu.style.cssText = `
                        position: fixed;
                        top: ${e.clientY}px;
                        left: ${e.clientX}px;
                        background: var(--surface);
                        border: 1px solid var(--border-color);
                        border-radius: 4px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        z-index: 1000;
                        min-width: 120px;
                        padding: 0.25rem 0;
                      `;
                      
                      // Rename option
                      const renameOption = document.createElement('div');
                      renameOption.textContent = 'Rename';
                      renameOption.style.cssText = `
                        padding: 0.5rem 0.75rem;
                        cursor: pointer;
                        color: var(--on-surface);
                        font-size: 0.875rem;
                        transition: background-color 0.2s ease;
                      `;
                      renameOption.onmouseenter = () => {
                        renameOption.style.backgroundColor = 'var(--surface-variant)';
                      };
                      renameOption.onmouseleave = () => {
                        renameOption.style.backgroundColor = 'transparent';
                      };
                      renameOption.onclick = () => {
                        console.log('Rename clicked for scene:', scene.name, 'ID:', scene.id);
                        
                        // Create custom input dialog
                        const dialog = document.createElement('div');
                        dialog.style.cssText = `
                          position: fixed;
                          top: 0;
                          left: 0;
                          width: 100%;
                          height: 100%;
                          background: rgba(0, 0, 0, 0.5);
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          z-index: 10000;
                        `;
                        
                        const dialogContent = document.createElement('div');
                        dialogContent.style.cssText = `
                          background: var(--surface);
                          border: 1px solid var(--border-color);
                          border-radius: 8px;
                          padding: 1.5rem;
                          min-width: 300px;
                          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        `;
                        
                        const title = document.createElement('h3');
                        title.textContent = 'Rename Scene';
                        title.style.cssText = `
                          margin: 0 0 1rem 0;
                          color: var(--on-surface);
                          font-size: 1.125rem;
                          font-weight: 500;
                        `;
                        
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = scene.name;
                        input.style.cssText = `
                          width: 100%;
                          padding: 0.75rem;
                          border: 1px solid var(--border-color);
                          border-radius: 4px;
                          background: var(--surface-variant);
                          color: var(--on-surface);
                          font-size: 0.875rem;
                          margin-bottom: 1rem;
                          box-sizing: border-box;
                        `;
                        
                        const buttonContainer = document.createElement('div');
                        buttonContainer.style.cssText = `
                          display: flex;
                          gap: 0.5rem;
                          justify-content: flex-end;
                        `;
                        
                        const cancelBtn = document.createElement('button');
                        cancelBtn.textContent = 'Cancel';
                        cancelBtn.style.cssText = `
                          padding: 0.5rem 1rem;
                          border: 1px solid var(--border-color);
                          border-radius: 4px;
                          background: transparent;
                          color: var(--on-surface);
                          cursor: pointer;
                          font-size: 0.875rem;
                        `;
                        
                        const confirmBtn = document.createElement('button');
                        confirmBtn.textContent = 'Rename';
                        confirmBtn.style.cssText = `
                          padding: 0.5rem 1rem;
                          border: none;
                          border-radius: 4px;
                          background: var(--primary);
                          color: var(--on-primary);
                          cursor: pointer;
                          font-size: 0.875rem;
                        `;
                        
                        const handleConfirm = () => {
                          const newName = input.value.trim();
                          if (newName && newName !== scene.name) {
                            console.log('Updating scene name from:', scene.name, 'to:', newName);
                            try {
                              updateScene(scene.id, { name: newName });
                              console.log('Scene updated successfully');
                            } catch (error) {
                              console.error('Error updating scene:', error);
                            }
                          } else {
                            console.log('No valid name change or cancelled');
                          }
                          document.body.removeChild(dialog);
                          document.body.removeChild(menu);
                        };
                        
                        const handleCancel = () => {
                          document.body.removeChild(dialog);
                          document.body.removeChild(menu);
                        };
                        
                        const handleKeyDown = (e: KeyboardEvent) => {
                          if (e.key === 'Enter') {
                            handleConfirm();
                          } else if (e.key === 'Escape') {
                            handleCancel();
                          }
                        };
                        
                        input.addEventListener('keydown', handleKeyDown);
                        confirmBtn.addEventListener('click', handleConfirm);
                        cancelBtn.addEventListener('click', handleCancel);
                        
                        buttonContainer.appendChild(cancelBtn);
                        buttonContainer.appendChild(confirmBtn);
                        
                        dialogContent.appendChild(title);
                        dialogContent.appendChild(input);
                        dialogContent.appendChild(buttonContainer);
                        dialog.appendChild(dialogContent);
                        
                        document.body.appendChild(dialog);
                        
                        // Focus the input
                        setTimeout(() => input.focus(), 100);
                      };
                      
                      // Delete option (only if more than one scene)
                      if (scenes.length > 1) {
                        const deleteOption = document.createElement('div');
                        deleteOption.textContent = 'Delete';
                        deleteOption.style.cssText = `
                          padding: 0.5rem 0.75rem;
                          cursor: pointer;
                          color: var(--error);
                          font-size: 0.875rem;
                          transition: background-color 0.2s ease;
                        `;
                        deleteOption.onmouseenter = () => {
                          deleteOption.style.backgroundColor = 'var(--surface-variant)';
                        };
                        deleteOption.onmouseleave = () => {
                          deleteOption.style.backgroundColor = 'transparent';
                        };
                        deleteOption.onclick = () => {
                          const confirmed = window.confirm(`Are you sure you want to delete scene "${scene.name}"?`);
                          if (confirmed) {
                            removeScene(scene.id);
                          }
                          document.body.removeChild(menu);
                        };
                        menu.appendChild(deleteOption);
                      }
                      
                      menu.appendChild(renameOption);
                      document.body.appendChild(menu);
                      
                      // Close menu when clicking outside
                      const closeMenu = (e: MouseEvent) => {
                        if (!menu.contains(e.target as Node)) {
                          document.body.removeChild(menu);
                          document.removeEventListener('click', closeMenu);
                        }
                      };
                      document.addEventListener('click', closeMenu);
                    }}
                    title="Right-click to rename or delete scene"
                  >
                    {scene.name}
                  </div>
                ))}
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
              <Timeline onClose={() => setShowTimeline(false)} />
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
                          
                          // Create a new effect slot with default parameters for film effects
                          const getDefaultParams = (effectId: string) => {
                            switch (effectId) {
                              case 'film-noise':
                                return {
                                  intensity: { value: 0.3, min: 0, max: 1, step: 0.01 },
                                  color: { value: '#ffffff' }
                                };
                              case 'film-flicker':
                                return {
                                  intensity: { value: 0.2, min: 0, max: 1, step: 0.01 },
                                  speed: { value: 1, min: 0.1, max: 5, step: 0.1 },
                                  color: { value: '#ffffff' }
                                };
                              case 'light-leak':
                                return {
                                  intensity: { value: 0.3, min: 0, max: 1, step: 0.01 },
                                  color: { value: '#ff6b35' },
                                  position: { value: 'right', options: ['left', 'right', 'top', 'bottom'] },
                                  speed: { value: 0.5, min: 0.1, max: 2, step: 0.1 }
                                };
                              case 'film-noise-r3f':
                                return {
                                  intensity: { value: 0.3, min: 0, max: 1, step: 0.01 },
                                  color: { value: '#ffffff' }
                                };
                              case 'film-flicker-r3f':
                                return {
                                  intensity: { value: 0.2, min: 0, max: 1, step: 0.01 },
                                  speed: { value: 1, min: 0.1, max: 5, step: 0.1 },
                                  color: { value: '#ffffff' }
                                };
                              case 'light-leak-r3f':
                                return {
                                  intensity: { value: 0.3, min: 0, max: 1, step: 0.01 },
                                  color: { value: '#ff6b35' },
                                  position: { value: 'right', options: ['left', 'right', 'top', 'bottom'] },
                                  speed: { value: 0.5, min: 0.1, max: 2, step: 0.1 }
                                };
                              case 'global-strobe-r3f':
                                return {
                                  intensity: { value: 0.8, min: 0, max: 1, step: 0.01 },
                                  color: { value: '#ffffff' },
                                  speed: { value: 1, min: 0.1, max: 5, step: 0.1 },
                                  frequency: { value: 24, min: 1, max: 60, step: 1 }
                                };
                              default:
                                return {};
                            }
                          };

                          const newEffectSlot = {
                            id: uuidv4(),
                            effectId: data.id || data.name,
                            enabled: true,
                            params: getDefaultParams(data.id || data.name)
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
                            <div key={effectSlot.id || `effect-${index}`} className={`global-effect-slot ${effectSlot.enabled ? 'active' : ''}`}>
                              <div 
                                className="effect-slot-content"
                                onClick={() => {
                                  // Toggle this effect on/off, disable all others
                                  const updatedEffects = currentScene.globalEffects.map((slot: any, i: number) => ({
                                    ...slot,
                                    enabled: i === index ? !slot.enabled : false
                                  }));
                                  updateScene(currentSceneId, { globalEffects: updatedEffects });
                                }}
                                style={{ cursor: 'pointer' }}
                                title="Click to toggle effect on/off"
                              >
                               <span className="effect-name">
                                 {effectSlot.effectId === 'film-noise-r3f' ? 'Film Noise (R3F)' :
                                  effectSlot.effectId === 'film-flicker-r3f' ? 'Film Flicker (R3F)' :
                                  effectSlot.effectId === 'light-leak-r3f' ? 'Light Leak (R3F)' :
                                  effectSlot.effectId === 'global-strobe-r3f' ? 'Global Strobe (R3F)' :
                                  effectSlot.effectId}
                               </span>
                               {effectSlot.enabled && <div className="effect-active-indicator">●</div>}
                             </div>
                            <button 
                              className="remove-effect-btn"
                              onClick={() => {
                                const updatedEffects = currentScene.globalEffects.filter((_: any, i: number) => i !== index);
                                updateScene(currentSceneId, { globalEffects: updatedEffects });
                              }}
                              title="Remove effect"
                            >
                              ×
                            </button>
                          </div>
                        );
                      } else {
                        // Render empty slot
                        return (
                          <div key={`empty-slot-${index}`} className="global-effect-slot empty">
                            <div className="effect-slot-content">
                              <span className="effect-name">Empty</span>
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
              {columns.map((column: any, index: number) => {
                const isColumnPlaying = playingColumnId === column.id;
                return (
                  <div key={column.id} className="column-cell">
                    <div 
                      className={`column-header ${isColumnPlaying ? 'playing' : ''}`}
                      onClick={() => {
                        console.log('🎵 Column header clicked for column:', column.id);
                        console.log('🎵 Is column playing:', isColumnPlaying);
                        if (isColumnPlaying) {
                          console.log('🎵 Stopping column playback from header');
                          handleStop();
                        } else {
                          console.log('🎵 Starting column playback from header');
                          handleColumnPlay(column.id);
                        }
                      }}
                    >
                      <h4>{index + 1}</h4>
                      <button 
                        className={`play-btn ${isColumnPlaying ? 'stop' : 'play'}`}
                        onClick={(e) => {
                          console.log('🎵 Column play button clicked for column:', column.id);
                          console.log('🎵 Event:', e);
                          console.log('🎵 Is column playing:', isColumnPlaying);
                          e.stopPropagation();
                          if (isColumnPlaying) {
                            console.log('🎵 Stopping column playback');
                            handleStop();
                          } else {
                            console.log('🎵 Starting column playback');
                            handleColumnPlay(column.id);
                          }
                        }}
                      >
                        {isColumnPlaying ? '⏹' : '▶'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Layer Rows */}
            {[3, 2, 1].map((layerNum) => (
              <div key={layerNum} className={`layer-row ${layerNum === 1 ? 'active' : ''}`}>
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
                  const isDragOverLayer = dragOverLayer === cellId;
                  
                  return (
                    <div
                      key={cellId}
                      className={`grid-cell ${hasAsset ? 'has-content' : 'empty'} ${selectedLayer?.id === layer?.id ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''} ${isDragOverLayer ? 'drag-over-layer' : ''}`}
                      onClick={() => hasAsset && handleLayerClick(layer, column.id)}
                      onDragStart={(e) => {
                        if (hasAsset) {
                          // Always use layer reordering for existing layers
                          handleLayerReorderDragStart(e, layer, column.id);
                        }
                      }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => {
                        // Handle both asset dropping and layer reordering
                        handleDragOver(e, cellId);
                        if (draggedLayer && draggedLayer.sourceColumnId === column.id) {
                          handleLayerReorderDragOver(e, column.id, layerNum);
                        }
                      }}
                      onDragLeave={(e) => handleDragLeave(e)}
                      onDrop={(e) => {
                        // Check if this is a layer reorder (from existing layer) or asset drop (from Media/Effects)
                        const dragData = e.dataTransfer.getData('application/json');
                        if (dragData) {
                          try {
                            const data = JSON.parse(dragData);
                            if (data.type === 'layer-reorder') {
                              handleLayerReorderDrop(e, column.id, layerNum);
                            } else {
                              handleDrop(e, column.id, layerNum);
                            }
                          } catch (error) {
                            // Fallback to asset drop
                            handleDrop(e, column.id, layerNum);
                          }
                        } else {
                          // Fallback to asset drop
                          handleDrop(e, column.id, layerNum);
                        }
                      }}
                      draggable={hasAsset}
                    >
                      {hasAsset ? (
                        <div className="layer-content">
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
                                src={getAssetPath(layer.asset)}
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
                          <div className="layer-name">{layer.asset.name}</div>
                          {layer.blendMode && layer.blendMode !== 'add' && (
                            <div className="layer-blend-mode">
                              {layer.blendMode}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="layer-content">
                          <div className="layer-preview-placeholder"></div>
                          <div className="layer-name">Empty</div>
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

          {/* Drag-to-Remove Zone */}
          <div 
            className="remove-zone"
            onDragOver={handleRemoveZoneDragOver}
            onDrop={handleRemoveZoneDrop}
          >
            <div className="remove-zone-content">
              <div className="remove-zone-icon">🗑️</div>
              <div className="remove-zone-text">Drag assets here to remove</div>
            </div>
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
                onUpdateLayer={handleUpdateLayer}
              />
            </div>

            {/* Media Library / MIDI Mapper - Bottom Right */}
            <div className="layer-manager-media-library">
              {/* Tab Navigation */}
              <div className="bottom-tabs">
                <button 
                  className={`tab-button ${activeTab === 'media' ? 'active' : ''}`}
                  onClick={() => setActiveTab('media')}
                >
                  Media
                </button>
                <button 
                  className={`tab-button ${activeTab === 'effects' ? 'active' : ''}`}
                  onClick={() => setActiveTab('effects')}
                >
                  Effects
                </button>
                <button 
                  className={`tab-button ${activeTab === 'midi' ? 'active' : ''}`}
                  onClick={() => setActiveTab('midi')}
                >
                  MIDI
                </button>

              </div>
              
              {/* Tab Content */}
              <div className="tab-content">
                {activeTab === 'media' ? (
                  <MediaLibrary onClose={() => {}} isEmbedded={true} />
                ) : activeTab === 'effects' ? (
                  <EffectsBrowser />
                ) : activeTab === 'midi' ? (
                  <MIDIMapper />
                ) : (
                  <MediaLibrary onClose={() => {}} isEmbedded={true} />
                )}
              </div>
            </div>
          </div>
        </div>
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
      </div>
    );
  }
};