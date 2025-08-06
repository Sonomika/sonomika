import { createLayer, createColumn, getDefaultEffectParams } from './LayerManagerUtils';

/**
 * Handle drop event for assets
 */
export const handleDrop = (
  e: React.DragEvent, 
  columnId: string, 
  layerNum: number,
  scenes: any[],
  currentSceneId: string,
  updateScene: (sceneId: string, updates: any) => void,
  setDragOverCell: (value: string | null) => void
) => {
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
          const newColumn = createColumn();
          newColumn.name = `Column ${colIndex + 1}`;
          const updatedColumns = [...currentScene.columns];
          // Ensure array is large enough
          while (updatedColumns.length <= colIndex) {
            const newCol = createColumn();
            newCol.name = `Column ${updatedColumns.length + 1}`;
            updatedColumns.push(newCol);
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
        layer = createLayer(columnId, layerNum);
        
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
        // Handle nested effect structure from EffectsBrowser
        const effectData = asset.effect || asset;
        console.log('🟢 Dropping effect asset:', effectData.name, 'type:', effectData.type, 'id:', effectData.id);
        layer.asset = effectData;
        layer.type = 'effect'; // Set layer type to effect
        layer.effectType = effectData.type; // Store the effect type (p5js or threejs)
        layer.effectFile = effectData.filePath; // Store the effect file path
        
        // Set the effects array for the layer (required by ColumnPreview)
        layer.effects = [effectData];
        
        // Set default parameters for effects
        layer.params = getDefaultEffectParams(effectData.id);
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

/**
 * Handle layer drag start for removal
 */
export const handleLayerDragStart = (e: React.DragEvent, layer: any, columnId: string) => {
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

/**
 * Handle remove zone drag over
 */
export const handleRemoveZoneDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

/**
 * Handle remove zone drop
 */
export const handleRemoveZoneDrop = (
  e: React.DragEvent,
  scenes: any[],
  currentSceneId: string,
  updateScene: (sceneId: string, updates: any) => void,
  setRefreshTrigger: (trigger: (prev: number) => number) => void
) => {
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

/**
 * Handle layer reorder drag start
 */
export const handleLayerReorderDragStart = (e: React.DragEvent, layer: any, columnId: string, setDraggedLayer: (layer: any) => void) => {
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

/**
 * Handle layer reorder drag over
 */
export const handleLayerReorderDragOver = (
  e: React.DragEvent, 
  targetColumnId: string, 
  targetLayerNum: number,
  draggedLayer: any,
  setDragOverLayer: (value: string | null) => void
) => {
  e.preventDefault();
  if (draggedLayer) {
    const targetCellId = `${targetColumnId}-${targetLayerNum}`;
    setDragOverLayer(targetCellId);
  }
};

/**
 * Handle layer reorder drop
 */
export const handleLayerReorderDrop = (
  e: React.DragEvent, 
  targetColumnId: string, 
  targetLayerNum: number,
  draggedLayer: any,
  currentScene: any,
  currentSceneId: string,
  updateScene: (sceneId: string, updates: any) => void
) => {
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