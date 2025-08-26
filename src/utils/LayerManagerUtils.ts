import { v4 as uuidv4 } from 'uuid';

/**
 * Helper function to get proper file path for Electron
 */
export const getAssetPath = (asset: any, useForPlayback: boolean = false): string => {
  if (!asset) return '';
  // console.log('getAssetPath called with asset:', asset, 'useForPlayback:', useForPlayback);
  
  // For video playback, prioritize file paths over blob URLs
  if (useForPlayback && asset.type === 'video') {
    if (asset.filePath) {
      const filePath = `file://${asset.filePath}`;
      // console.log('Using file path for video playback:', filePath);
      return filePath;
    }
    if (asset.path && asset.path.startsWith('file://')) {
      // console.log('Using existing file URL for video playback:', asset.path);
      return asset.path;
    }
    if (asset.path && asset.path.startsWith('local-file://')) {
      const filePath = asset.path.replace('local-file://', '');
      const standardPath = `file://${filePath}`;
      // console.log('Converting local-file to file for video playback:', standardPath);
      return standardPath;
    }
  }
  
  // For thumbnails and other uses, prioritize blob URLs
  if (asset.path && asset.path.startsWith('blob:')) {
    // console.log('Using blob URL:', asset.path);
    return asset.path;
  }
  
  if (asset.filePath) {
    const filePath = `file://${asset.filePath}`;
    // console.log('Using file protocol:', filePath);
    return filePath;
  }
  
  if (asset.path && asset.path.startsWith('file://')) {
    // console.log('Using existing file URL:', asset.path);
    return asset.path;
  }
  
  if (asset.path && asset.path.startsWith('local-file://')) {
    const filePath = asset.path.replace('local-file://', '');
    const standardPath = `file://${filePath}`;
    // console.log('Converting local-file to file:', standardPath);
    return standardPath;
  }
  
  if (asset.path && asset.path.startsWith('data:')) {
    // console.log('Using data URL:', asset.path);
    return asset.path;
  }
  
  // console.log('Using fallback path:', asset.path);
  return asset.path || '';
};

/**
 * Get layer type name for display
 */
export const getLayerTypeName = (type: string): string => {
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

/**
 * Get track color for timeline display
 */
export const getTrackColor = (type: string): string => {
  switch (type) {
    case 'audio': return '#4CAF50';
    case 'video': return '#2196F3';
    case 'effect': return '#FF9800';
    default: return '#9E9E9E';
  }
};

/**
 * Create a new layer with default properties
 */
export const createLayer = (columnId: string, layerNum: number) => {
  return {
    id: `layer-${columnId}-${layerNum}-${Date.now()}`,
    name: `Layer ${layerNum}`,
    type: 'media',
    columnId: columnId,
    layerNum: layerNum,
    loopMode: 'none',
    loopCount: 1,
    reverseEnabled: false,
    pingPongEnabled: false,
    blendMode: 'add',
    opacity: 1.0
  };
};

/**
 * Create a new column with default properties
 */
export const createColumn = () => {
  return {
    id: uuidv4(),
    name: `Column ${Date.now()}`,
    layers: []
  };
};

/**
 * Get default effect parameters
 */
export const getDefaultEffectParams = (effectId: string) => {
  // Attempt to derive defaults from effect metadata when available
  try {
    const { getEffect } = require('../utils/effectRegistry');
    const effectComponent = getEffect(effectId) || getEffect(`${effectId}Effect`);
    const metadata = effectComponent ? (effectComponent as any).metadata : null;
    if (metadata && Array.isArray(metadata.parameters)) {
      const params: Record<string, any> = {};
      for (const p of metadata.parameters as any[]) {
        params[p.name] = { value: p.value, ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}), ...(p.step !== undefined ? { step: p.step } : {}) };
      }
      return params;
    }
  } catch {}

  // Fallback minimal structure if no metadata found
  return {} as Record<string, any>;
};

/**
 * Handle resize start event
 */
export const handleResizeStart = (e: React.MouseEvent, setIsResizing: (value: boolean) => void) => {
  e.preventDefault();
  setIsResizing(true);
};

/**
 * Handle resize move event
 */
export const handleResizeMove = (e: MouseEvent, isResizing: boolean, setPaneSizes: (sizes: any) => void) => {
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

/**
 * Handle resize end event
 */
export const handleResizeEnd = (setIsResizing: (value: boolean) => void) => {
  setIsResizing(false);
};

/**
 * Handle drag over event
 */
export const handleDragOver = (e: React.DragEvent, cellId: string, setDragOverCell: (value: string | null) => void) => {
  e.preventDefault();
  console.log('🔵 Drag over cell:', cellId);
  console.log('🔵 DataTransfer types:', e.dataTransfer.types);
  console.log('🔵 DataTransfer items:', e.dataTransfer.items);
  
  // Check if this is a system file drag (from Windows File Explorer)
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    // Filter for supported media files
    const supportedFiles = Array.from(e.dataTransfer.files).filter(file => {
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
    
    if (supportedFiles.length > 0) {
      console.log('🔵 System file drag over detected:', supportedFiles.length, 'supported files');
      // Set drag effect to copy for system files
      e.dataTransfer.dropEffect = 'copy';
      setDragOverCell(cellId);
      return;
    }
  }
  
  // Handle regular asset drags
  setDragOverCell(cellId);
};

/**
 * Handle drag leave event
 */
export const handleDragLeave = (e: React.DragEvent, setDragOverCell: (value: string | null) => void) => {
  console.log('🔴 Drag leave');
  setDragOverCell(null);
};

/**
 * Handle layer click event
 */
export const handleLayerClick = (layer: any, columnId: string, setSelectedLayer: (layer: any) => void, setSelectedColumn: (columnId: string | null) => void) => {
  setSelectedLayer(layer);
  setSelectedColumn(columnId);
};

/**
 * Handle column click event
 */
export const handleColumnClick = (columnId: string, setSelectedColumn: (columnId: string | null) => void) => {
  setSelectedColumn(columnId);
};

/**
 * Handle layer play event
 */
export const handleLayerPlay = (layerId: string, currentScene: any, setPreviewContent: (content: any) => void, setIsPlaying: (playing: boolean) => void) => {
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

/**
 * Handle stop event
 */
export const handleStop = (setIsPlaying: (playing: boolean) => void, setPreviewContent: (content: any) => void, stopColumn: () => void, clearStorage: () => void) => {
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

/**
 * Handle drag end event
 */
export const handleDragEnd = (setDragOverCell: (value: string | null) => void, setDraggedLayer: (value: any) => void, setDragOverLayer: (value: string | null) => void) => {
  setDragOverCell(null);
  setDraggedLayer(null);
  setDragOverLayer(null);
  document.body.classList.remove('dragging');
}; 