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
  
  // Check if this is a system file drop (from Windows File Explorer)
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    console.log('🟢 System file drop detected:', e.dataTransfer.files.length, 'files');
    handleSystemFileDrop(e, columnId, layerNum, scenes, currentSceneId, updateScene);
    return;
  }
  
  // Handle regular asset drops (from Media Browser, Effects, etc.)
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
        // Create new layer
        layer = createLayer(`Layer ${layerNum}`, layerNum);
        column.layers.push(layer);
        console.log('🆕 Created new layer:', layer);
      }
      
      // Update layer with asset
      layer.asset = asset;
      layer.assetType = asset.type || 'unknown';
      layer.name = `Layer ${layerNum}`;
      layer.layerNum = layerNum;
      
      console.log('🎯 Layer asset assigned:', {
        layerName: layer.name,
        assetType: layer.assetType,
        asset: layer.asset,
        assetKeys: Object.keys(layer.asset),
        isEffect: layer.asset.isEffect,
        hasEffect: !!layer.asset.effect,
        isSource: layer.asset.isSource
      });
      
      // Set default effect parameters if this is an effect
      if (asset.isEffect || asset.type === 'effect') {
        console.log('🎨 Processing effect drop:', {
          asset,
          metadata: asset.metadata,
          effectMetadata: asset.effect?.metadata,
          isSource: asset.isSource
        });
        
        // Get parameters from the nested effect object or metadata
        const effectParams = asset.metadata?.parameters || 
                           asset.effect?.metadata?.parameters || 
                           getDefaultEffectParams(asset.id);
        
        console.log('🎨 Effect parameters resolved:', effectParams);
        
        layer.effects = [{
          id: asset.id,
          name: asset.name,
          type: 'effect',
          parameters: effectParams
        }];
        
        // Also set the asset type to indicate this is an effect
        layer.assetType = 'effect';
        
        console.log('🎨 Layer effects set:', layer.effects);
      }
      
      // Update the scene
      updateScene(currentSceneId, { columns: currentScene.columns });
      console.log('🟢 Layer updated with asset:', layer);
      console.log('🟢 Column layers after:', column.layers);
      
    } catch (error) {
      console.error('❌ Error processing asset drop:', error);
    }
  }
};

/**
 * Handle system file drops from Windows File Explorer
 */
const handleSystemFileDrop = (
  e: React.DragEvent,
  columnId: string,
  layerNum: number,
  scenes: any[],
  currentSceneId: string,
  updateScene: (sceneId: string, updates: any) => void
) => {
  const files = Array.from(e.dataTransfer.files);
  console.log('🟢 Processing system files:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
  
  // Filter for supported media files
  const supportedFiles = files.filter(file => {
    const isVideo = file.type.startsWith('video/') || 
                   ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'].some(ext => 
                     file.name.toLowerCase().endsWith(ext)
                   );
    const isImage = file.type.startsWith('image/') || 
                   ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].some(ext => 
                     file.name.toLowerCase().endsWith(ext)
                   );
    const isAudio = file.type.startsWith('audio/') || 
                   ['.mp3', '.wav', '.aiff', '.flac', '.ogg'].some(ext => 
                     file.name.toLowerCase().endsWith(ext)
                   );
    
    return isVideo || isImage || isAudio;
  });
  
  if (supportedFiles.length === 0) {
    console.warn('⚠️ No supported media files found in drop');
    return;
  }
  
  console.log('🟢 Supported files:', supportedFiles.length);
  
  // Find the current scene and column
  const currentScene = scenes.find((scene: any) => scene.id === currentSceneId);
  if (!currentScene) {
    console.error('❌ No current scene found');
    return;
  }
  
  let column = currentScene.columns.find((col: any) => col.id === columnId);
  if (!column) {
    // Handle placeholder columns by auto-creating a real column
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
      console.log('🆕 Auto-created column for system file drop:', newColumn);
      column = newColumn;
    } else {
      console.error('❌ Column not found and not a placeholder:', columnId);
      return;
    }
  }
  
  // Process each supported file
  supportedFiles.forEach((file, index) => {
    const targetLayerNum = layerNum + index; // Spread files across layers if multiple
    
    // Find or create the layer
    let layer = column.layers.find((l: any) => 
      l.name.includes(`Layer ${targetLayerNum}`) || 
      l.layerNum === targetLayerNum ||
      l.name === `Layer ${targetLayerNum}`
    );
    
    if (!layer) {
      // Create new layer
      layer = createLayer(`Layer ${targetLayerNum}`, targetLayerNum);
      column.layers.push(layer);
      console.log('🆕 Created new layer for system file:', layer);
    }
    
    // Determine file type
    let assetType = 'unknown';
    if (file.type.startsWith('video/') || ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'].some(ext => 
      file.name.toLowerCase().endsWith(ext))) {
      assetType = 'video';
    } else if (file.type.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].some(ext => 
      file.name.toLowerCase().endsWith(ext))) {
      assetType = 'image';
    } else if (file.type.startsWith('audio/') || ['.mp3', '.wav', '.aiff', '.flac', '.ogg'].some(ext => 
      file.name.toLowerCase().endsWith(ext))) {
      assetType = 'audio';
    }
    
    // Create asset object for the file
    const asset = {
      id: `system-file-${Date.now()}-${index}`,
      name: file.name,
      type: assetType,
      filePath: (file as any).path || file.name, // Try to get system path
      path: URL.createObjectURL(file), // Create blob URL for immediate use
      date: Date.now(),
      size: file.size,
      isSystemFile: true,
      originalFile: file // Keep reference to original file object
    };
    
    // Update layer with asset
    layer.asset = asset;
    layer.assetType = assetType;
    layer.name = `Layer ${targetLayerNum}`;
    layer.layerNum = targetLayerNum;
    
    console.log('🟢 Layer updated with system file:', layer);
  });
  
  // Update the scene
  updateScene(currentSceneId, { columns: currentScene.columns });
  console.log('🟢 Scene updated with system files');
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