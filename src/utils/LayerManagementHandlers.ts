/**
 * Handle column play event
 */
import { preloadColumnAssets } from './AssetPreloader';

export const handleColumnPlay = async (
  columnId: string,
  currentScene: any,
  setPreviewContent: (content: any) => void,
  setIsPlaying: (playing: boolean) => void,
  playColumn: (columnId: string) => void
) => {
  // console.log('🎵 handleColumnPlay called with columnId:', columnId);
  const column = currentScene?.columns.find((col: any) => col.id === columnId);
  // console.log('🎵 Found column:', column);
  
  if (!column) return;
  const layersWithContent = column.layers.filter((layer: any) => layer.asset);
  // console.log('🎵 Column layers with content:', layersWithContent);
  // console.log('🎵 Total layers in column:', column.layers.length);

  if (layersWithContent.length === 0) {
    console.log('❌ No layers with content in column:', columnId);
    setPreviewContent({
      type: 'column',
      columnId,
      column,
      layers: column.layers,
      isEmpty: true
    });
    setIsPlaying(false);
    return;
  }

  // Switch the live render state immediately. Waiting for preload here creates
  // a visible transport hitch on fast MIDI/OSC column changes.
  setPreviewContent({
    type: 'column',
    columnId,
    column,
    layers: layersWithContent
  });
  setIsPlaying(true);

  try {
    void preloadColumnAssets(column, { timeoutMs: 1500 }).catch((e) => {
      console.warn('Preload failed or timed out after column switch:', e);
    });
  } catch (e) {
    console.warn('Preload failed or timed out after column switch:', e);
  }

  // Defer play to ensure the preview mounts and event listeners are attached
  try {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { playColumn(columnId); } catch {}
      });
    });
  } catch {
    // Fallback without RAF
    setTimeout(() => { try { playColumn(columnId); } catch {} }, 0);
  }
};

/**
 * Handle clear layers event
 */
export const handleClearLayers = (
  currentScene: any,
  updateScene: (sceneId: string, updates: any) => void,
  setCurrentScene: (sceneId: string) => void,
  setRefreshTrigger: (trigger: (prev: number) => number) => void,
  setSelectedLayer: (layer: any) => void,
  setSelectedColumn: (columnId: string | null) => void,
  setPreviewContent: (content: any) => void,
  setIsPlaying: (playing: boolean) => void
) => {
  if (currentScene) {
    const confirmed = window.confirm('Are you sure you want to clear all layers? This will remove all assets from all layers.');
    if (confirmed) {
      // console.log('Starting clear layers process for scene:', currentScene.id);
      // console.log('Current scene columns:', currentScene.columns.length);
      
      // Create a deep copy of the current scene
      const updatedScene = JSON.parse(JSON.stringify(currentScene));
      
      // Clear all assets from all layers and remove empty layers
      let clearedCount = 0;
      updatedScene.columns.forEach((column: any, columnIndex: number) => {
        // console.log(`Processing column ${columnIndex + 1}:`, column.id);
        if (column.layers) {
          // Filter out layers that have no assets
          column.layers = column.layers.filter((layer: any) => {
            if (layer.asset) {
              // console.log(`Clearing asset from layer:`, layer.asset.name);
              clearedCount++;
              return false; // Remove layers with assets
            }
            return false; // Remove all layers
          });
        }
      });
      
      // console.log(`Cleared ${clearedCount} assets total`);
      
      // Update the scene with the new data
      updateScene(currentScene.id, updatedScene);
      // console.log('Updated scene with cleared layers');
      
      // Force multiple refresh mechanisms
      setCurrentScene(currentScene.id);
      setRefreshTrigger(prev => prev + 1);
      
      // Force a complete re-render by updating selected states
      setSelectedLayer(null);
      setSelectedColumn(null);
      setPreviewContent(null);
      setIsPlaying(false);
      
      // console.log('Forced complete component refresh');
      
      // Additional force refresh after a short delay
      setTimeout(() => {
        setRefreshTrigger(prev => prev + 1);
        // console.log('Additional refresh triggered');
      }, 100);
    }
  }
};

/**
 * Handle force clear event
 */
export const handleForceClear = (
  currentScene: any,
  updateScene: (sceneId: string, updates: any) => void,
  setSelectedLayer: (layer: any) => void,
  setSelectedColumn: (columnId: string | null) => void,
  setPreviewContent: (content: any) => void,
  setIsPlaying: (playing: boolean) => void,
  setRefreshTrigger: (trigger: (prev: number) => number) => void
) => {
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

/**
 * Handle remove asset event
 */
export const handleRemoveAsset = (
  columnId: string,
  layerId: string,
  currentScene: any,
  updateScene: (sceneId: string, updates: any) => void,
  setRefreshTrigger: (trigger: (prev: number) => number) => void
) => {
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

/**
 * Handle update layer event
 */
export const handleUpdateLayer = (
  layerId: string,
  updatedLayer: any,
  currentScene: any,
  updateScene: (sceneId: string, updates: any) => void,
  setSelectedLayer: (layer: any) => void,
  setRefreshTrigger: (trigger: (prev: number) => number) => void
) => {
  if (currentScene) {
    let layerFound = false;
    const updatedColumns = (currentScene.columns || []).map((column: any) => {
      let columnChanged = false;
      const layers = (column.layers || []).map((layer: any) => {
        if (!layer || layer.id !== layerId) return layer;
        columnChanged = true;
        layerFound = true;
        return {
          ...layer,
          ...updatedLayer,
          params: updatedLayer?.params ? { ...(layer.params || {}), ...(updatedLayer.params || {}) } : layer.params
        };
      });
      return columnChanged ? { ...column, layers } : column;
    });

    if (layerFound) {
      updateScene(currentScene.id, { columns: updatedColumns });
    }
  }
};