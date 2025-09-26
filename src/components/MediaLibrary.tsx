import React, { useState, useRef, useMemo, useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, Button, Dialog, DialogContent, DialogHeader, DialogTitle } from './ui';
import DropboxBrowser from './DropboxBrowser';
import { 
  generateVideoThumbnail
} from '../utils/ThumbnailCache';
import { useStore } from '../store/store';
// Radix ContextMenu wrappers are available in './ui', but this component keeps the existing
// inline context menu implementation to avoid behavior changes.

interface MediaLibraryProps {
  onClose: () => void;
  isEmbedded?: boolean;
}



export const MediaLibrary: React.FC<MediaLibraryProps> = ({ onClose, isEmbedded = false }) => {
  // Subscribe ONLY to the slices we need so LFO/store updates don't rerender the list
  const { assets, addAsset, removeAsset, updateAsset } = useStore(
    (state: any) => ({
      assets: state.assets,
      addAsset: state.addAsset,
      removeAsset: state.removeAsset,
      updateAsset: state.updateAsset,
    }),
    shallow
  ) as any;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  // Removed unused viewMode state
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string>('');
  const [showDropbox, setShowDropbox] = useState(false);
  // Radix ContextMenu is used per item; no global contextMenu state needed

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasRestoredRef = useRef(false);
  const isElectronEnv = typeof window !== 'undefined' && ((window as any).electron || (window as any).require);

  // Restore assets from base64Data when component mounts
  useEffect(() => {
    if (hasRestoredRef.current) return; // Already restored
    
    // console.log('MediaLibrary: Checking for assets to restore...');
    let hasRestored = false;
    
    assets.forEach((asset: any) => {
      // If asset has base64Data but no valid path, restore the blob URL
      if (asset.base64Data && (!asset.path || asset.path.startsWith('blob:'))) {
        // console.log('Restoring asset from base64Data:', asset.name);
        let mimeType = 'image/*';
        if (asset.type === 'video') mimeType = 'video/*';
        else if (asset.type === 'audio') mimeType = 'audio/*';
        
        const restoredBlobURL = convertBase64ToBlobURL(asset.base64Data, mimeType);
        if (restoredBlobURL) {
          // Update the asset with the restored blob URL in the store
          updateAsset(asset.id, { path: restoredBlobURL });
          // console.log('Asset restored successfully:', asset.name);
          hasRestored = true;
        }
      }
    });
    
    if (hasRestored) {
      // console.log('Asset restoration completed');
      hasRestoredRef.current = true;
    }
  }, [assets, updateAsset]);

  // Handle drag start for assets
  const handleDragStart = (e: React.DragEvent, asset: any) => {
    // console.log('🎯 Starting drag for asset:', asset);
    
    const assetData = JSON.stringify(asset);
    // console.log('🎯 Setting drag data:', assetData);
    
    e.dataTransfer.setData('application/json', assetData);
    e.dataTransfer.effectAllowed = 'copy';
    
    // console.log('🎯 Drag prepared');
  };



  // Handle file import
  const handleFileImport = async (files: FileList) => {
    // console.log('Importing files:', files.length, 'files');
    
    // Check if we're in Electron environment
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    // console.log('Is Electron environment:', isElectron);
    
    for (const file of Array.from(files)) {
      // console.log('Processing file:', file.name, file.type, file.size);
      
      // Check if asset already exists
      const existingAsset = assets.find((asset: any) => asset.name === file.name);
      if (existingAsset) {
        // console.log('Asset already exists:', file.name);
        setDuplicateWarning(`"${file.name}" already exists in library`);
        setTimeout(() => setDuplicateWarning(''), 3000); // Clear warning after 3 seconds
        continue; // Skip this file
      }
      
      try {
        // Get the file path using our resolver function
        let filePath = resolveFilePath(file);
        
        if (!filePath) {
          // Fallback to other methods
          if ((file as any).path) {
            filePath = (file as any).path;
            // console.log('Found file path:', filePath);
          } else if (file.webkitRelativePath) {
            filePath = file.webkitRelativePath;
            // console.log('Found webkit path:', filePath);
          } else if (isElectron) {
            // In Electron, try to get the path from the file object
            // console.log('File object properties:', Object.keys(file));
            
            // Try to access the path property directly
            if ((file as any).path) {
              filePath = (file as any).path;
              // console.log('Found path via direct access:', filePath);
            }
          }
        }
        
        // Create a blob URL for immediate use
        const blobURL = URL.createObjectURL(file);
        // console.log('Created blob URL:', blobURL, 'for file:', file.name);
        
        // Convert to base64 for persistence (try for all files, but handle large files carefully)
        let base64Data = '';
        try {
          if (file.size < 50 * 1024 * 1024) { // Try for files smaller than 50MB
            base64Data = await fileToBase64(file);
            // console.log('Converted file to base64 for persistence');
          } else {
            // console.log('File too large for base64 conversion, will rely on file path:', file.size);
          }
        } catch (error) {
          console.error('Failed to convert file to base64:', error);
          // console.log('Will rely on file path for persistence');
        }
        
        // For video files, ensure we have both blob URL and file path
        let finalPath = blobURL;
        if (file.type.startsWith('video/')) {
          // For videos, store the file path for persistence, but use blob URL for immediate use
          if (filePath) {
            finalPath = `file://${filePath}`;
            // console.log('Video file - using file path for persistence:', finalPath);
          } else {
            finalPath = blobURL;
            // console.log('Video file - no file path available, using blob URL:', finalPath);
          }
        } else if (filePath) {
          // For other files, prefer file path if available
          finalPath = `file://${filePath}`;
          // console.log('Non-video file - using file path:', finalPath);
        }
        
        const asset = {
          id: `asset-${Date.now()}-${Math.random()}`,
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 
                file.type.startsWith('video/') ? 'video' : 
                file.type.startsWith('audio/') ? 'audio' : 'unknown',
          path: finalPath, // Store file path for persistence
          filePath: filePath, // Store actual file path if available
          base64Data: base64Data, // Store base64 for persistence (small files only)
          file: file, // Keep file object for blob URL recreation
          size: file.size,
          date: new Date().toLocaleDateString()
        };
        
        addAsset(asset);
        // console.log('Imported asset:', asset);
        
      } catch (error) {
        console.error('Error processing file:', file.name, error);
      }
    }
  };

  // Convert base64 data back to blob URL when loading persisted assets
  const convertBase64ToBlobURL = (base64Data: string, type: string) => {
    try {
      // Remove the data URL prefix if present
      const base64WithoutPrefix = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      
      // Validate base64 data
      if (!base64WithoutPrefix || base64WithoutPrefix.length === 0) {
        console.error('Invalid base64 data');
        return null;
      }
      
      // Decode base64 to binary
      const byteCharacters = atob(base64WithoutPrefix);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      
      // Create blob with proper MIME type
      const blob = new Blob([byteArray], { type });
      
      // Validate blob
      if (blob.size === 0) {
        console.error('Created blob is empty');
        return null;
      }
      
      const blobURL = URL.createObjectURL(blob);
      
      // Validate blob URL format
      if (!blobURL.startsWith('blob:')) {
        console.error('Invalid blob URL format:', blobURL);
        return null;
      }
      
              // console.log('Successfully created blob URL:', blobURL, 'for type:', type, 'size:', byteArray.length);
      return blobURL;
    } catch (error) {
      console.error('Error converting base64 to blob URL:', error);
      return null;
    }
  };

  // Function to resolve file path in Electron environment
  const resolveFilePath = (file: File): string => {
    // console.log('Resolving file path for:', file.name);
    
    // Check if we're in Electron environment
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    
    if (isElectron) {
      try {
        // In Electron, we can use Node.js path module
        const path = (window as any).require('path');
        
        // Try different ways to get the file path
        if ((file as any).path) {
          const resolvedPath = path.resolve((file as any).path);
          // console.log('Resolved file path (Electron):', resolvedPath);
          return resolvedPath;
        }
        
        // If no path property, try to construct from name (this is a fallback)
        // console.log('No path property found, using fallback');
        return '';
      } catch (error) {
        console.error('Error resolving file path (Electron):', error);
        return '';
      }
    } else {
      // In browser environment, we can't resolve file paths
      // console.log('Browser environment detected, cannot resolve file paths');
      return '';
    }
  };

  // Function to convert file to base64 for persistence
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Process assets to ensure they have valid paths - use useMemo to prevent recreation
  const processedAssets = useMemo(() => {
    // console.log('Processing assets:', assets?.length || 0, 'assets');
    
    const processed = (assets || []).map((asset: any) => {
      // If asset has a File object, create a fresh blob URL for immediate use
      if (asset.file && asset.file instanceof File) {
        try {
          const blobURL = URL.createObjectURL(asset.file);
          // console.log('Created fresh blob URL for asset:', asset.name, blobURL);
          return {
            ...asset,
            // Store the file path for persistence, but keep blob URL for immediate use
            path: asset.filePath ? `file://${asset.filePath}` : asset.path,
            blobURL: blobURL, // Store blob URL separately for immediate use
            filePath: asset.filePath || asset.path?.replace('file://', '') || asset.path?.replace('blob:', '')
          };
        } catch (error) {
          console.error('Failed to create blob URL for asset:', asset.name, error);
        }
      }
      
      // If asset has base64Data, ensure we have the file path for persistence
      if (asset.base64Data && asset.filePath) {
        // console.log('Asset has base64Data and filePath, ensuring file path is stored:', asset.name);
        return {
          ...asset,
          // Store file path for persistence
          path: `file://${asset.filePath}`,
          filePath: asset.filePath
        };
      }
      
      // If asset has a filePath, ensure it's stored as the main path
      if (asset.filePath && !asset.path.startsWith('file://')) {
        // console.log('Asset has filePath, storing as main path for persistence:', asset.name, asset.filePath);
        return {
          ...asset,
          path: `file://${asset.filePath}`,
          filePath: asset.filePath
        };
      }
      
      // If asset has a blob URL, try to preserve the file path if available
      if (asset.path && asset.path.startsWith('blob:') && asset.filePath) {
        // console.log('Asset has blob URL, but storing file path for persistence:', asset.name);
        return {
          ...asset,
          path: `file://${asset.filePath}`,
          blobURL: asset.path, // Keep blob URL for immediate use
          filePath: asset.filePath
        };
      }
      
      // If asset has a file:// path, ensure we have filePath
      if (asset.path && asset.path.startsWith('file://')) {
        // console.log('Asset already has file path:', asset.name, asset.path);
        return {
          ...asset,
          filePath: asset.filePath || asset.path.replace('file://', '')
        };
      }
      
      // If asset has no valid path, create a placeholder
      if (!asset.path) {
        console.warn('Asset has no path:', asset.name);
        let placeholderMime = 'image/png';
        if (asset.type === 'video') placeholderMime = 'video/mp4';
        else if (asset.type === 'audio') placeholderMime = 'audio/mpeg';
        
        return {
          ...asset,
          path: `data:${placeholderMime};base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`
        };
      }
      
      return asset;
    });

    // Cleanup old blob URLs that are no longer needed
    const currentBlobUrls = processed.map((asset: any) => asset.path).filter((path: string) => path.startsWith('blob:'));
    // console.log('Current blob URLs:', currentBlobUrls);

    return processed;
  }, [assets]); // Only recreate when assets change

  // Cleanup old blob URLs when component unmounts or assets change
  useEffect(() => {
    const currentBlobUrls = processedAssets
      .map((asset: any) => asset.path)
      .filter((path: string) => path.startsWith('blob:'));
    
            // console.log('Current blob URLs:', currentBlobUrls);
    
    // Return cleanup function
    return () => {
      // Note: We don't revoke URLs here as they might still be in use
      // The browser will clean them up when the page is unloaded
    };
  }, [processedAssets]);

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileImport(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Handle import button click
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileImport(e.target.files);
    }
  };

  // Handle drop zone click
  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  // Filter assets based on search and type
  const filteredAssets = useMemo(() => {
    return processedAssets.filter((asset: any) => {
      const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || asset.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [processedAssets, searchTerm, filterType]);

  // Lightweight component to render a cached video thumbnail
  const THUMBS_DISABLED = false;
  const VideoThumb: React.FC<{ asset: any }> = ({ asset }) => {
    if (THUMBS_DISABLED) {
      return <div className="tw-w-full tw-h-full tw-bg-neutral-900 tw-rounded" />;
    }
    const [thumb, setThumb] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isVisible, setIsVisible] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const thumbRef = useRef<HTMLDivElement>(null);
    
    // Intersection Observer to only generate thumbnails for visible items
    useEffect(() => {
      if (!thumbRef.current) return;
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsVisible(true);
              observer.disconnect(); // Only trigger once
            }
          });
        },
        {
          rootMargin: '100px', // Start loading slightly before item becomes visible
          threshold: 0.1
        }
      );
      
      observer.observe(thumbRef.current);
      return () => observer.disconnect();
    }, []);
    
    // Generate thumbnail only when visible
    useEffect(() => {
      if (!isVisible || thumb || error || isGenerating) return;
      
      setIsGenerating(true);
              // console.log('🎬 VideoThumb: Starting thumbnail generation for:', asset.name);
      
      // Get a valid path for thumbnail generation
      getThumbnailPath(asset).then((thumbnailPath) => {
        if (!thumbnailPath) {
          setError('No valid path available for thumbnail generation');
          setIsGenerating(false);
          return;
        }
        
        // console.log('🎬 VideoThumb: Using path for thumbnail generation:', thumbnailPath);
        
        // Higher priority for visible items
        const priority = 1;
        
        generateVideoThumbnail(thumbnailPath, { captureTimeSec: 0.1, width: 160, height: 90 }, priority)
          .then((url) => { 
            // console.log('🎬 VideoThumb: Thumbnail generated successfully for:', asset.name, 'URL length:', url.length);
            if (url.startsWith('data:image/jpeg;base64,')) {
              setThumb(url);
              setError('');
            } else {
              console.error('🎬 VideoThumb: Invalid thumbnail URL format for:', asset.name, 'URL:', url.substring(0, 100));
              setError('Invalid thumbnail format');
            }
          })
          .catch((err) => { 
            console.error('🎬 VideoThumb: Failed to generate thumbnail for:', asset.name, 'error:', err);
            setError(err.message || 'Thumbnail generation failed');
            setThumb('');
          })
          .finally(() => {
            setIsGenerating(false);
          });
      }).catch((err) => {
        console.error('🎬 VideoThumb: Failed to get thumbnail path for:', asset.name, 'error:', err);
        setError('Failed to get file path');
        setIsGenerating(false);
      });
    }, [isVisible, asset, thumb, error, isGenerating]);
    
    if (error) {
      console.warn('🎬 VideoThumb: Showing error state for:', asset.name, 'error:', error);
      return (
        <div className="tw-w-full tw-h-full tw-bg-neutral-900 tw-rounded" title={`Error: ${error}`} />
      );
    }
    
    if (thumb) {
      return (
        <img
          src={thumb}
          alt={asset.name}
          draggable={false}
          className="tw-w-full tw-h-full tw-object-contain"
          onError={() => {
            console.error('🎬 VideoThumb: Image failed to load for:', asset.name, 'src:', thumb.substring(0, 100));
            setError('Image load failed');
          }}
          onLoad={() => {
            // console.log('🎬 VideoThumb: Image loaded successfully for:', asset.name);
          }}
        />
      );
    }
    
    return (
      <div ref={thumbRef} className="tw-w-full tw-h-full tw-bg-neutral-900 tw-rounded" />
    );
  };

  // Function to get a valid path for thumbnail generation
  const getThumbnailPath = async (asset: any): Promise<string> => {
    // If we have a blob URL stored separately, use it directly
    if (asset.blobURL && asset.blobURL.startsWith('blob:')) {
      return asset.blobURL;
    }
    
    // If we have base64 data, convert it to a blob URL
    if (asset.base64Data) {
      const mimeType = asset.type === 'video' ? 'video/*' : 
                      asset.type === 'image' ? 'image/*' : 'application/octet-stream';
      const blobURL = convertBase64ToBlobURL(asset.base64Data, mimeType);
      if (blobURL) {
        return blobURL;
      }
    }
    
    // If we have a file:// path, try to read the file and create a blob URL
    if (asset.path && asset.path.startsWith('file://')) {
      try {
        // In Electron, we can use the file system API to read the file
        const fsApi = (window as any).fsApi;
        if (fsApi && asset.filePath) {
          // console.log('🎬 Reading file for thumbnail generation:', asset.filePath);
          // This is a placeholder - in a real implementation, you'd read the file
          // and create a blob URL from the file data
          return asset.path; // For now, return the file path
        }
      } catch (error) {
        console.error('🎬 Failed to read file for thumbnail:', error);
      }
    }
    
    // Fallback to the original path
    return asset.path || '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleRemoveAsset = (assetId: string) => {
    removeAsset(assetId);
            // console.log('Removed asset:', assetId);
  };

  // Item row component for list view (Thumb, Name, Size, Length)
  const AssetItem = React.memo(({ item }: { item: any }) => (
    <div
      className={`tw-grid tw-grid-cols-[80px_1fr_auto_auto] tw-items-center tw-gap-3 tw-px-2 tw-py-2 tw-border-b tw-border-neutral-800 ${selectedAsset?.id === item.id ? 'tw-bg-neutral-800/60' : 'tw-bg-transparent'}`}
      onClick={() => setSelectedAsset(item)}
      draggable
      onDragStart={(e) => handleDragStart(e, item)}
    >
      <div className="tw-w-[72px] tw-h-[40px] tw-rounded tw-overflow-hidden tw-bg-neutral-900 tw-flex tw-items-center tw-justify-center">
        {item.type === 'image' && (
          <img src={item.path} alt={item.name} draggable={false} className="tw-w-full tw-h-full tw-object-contain" />
        )}
        {item.type === 'video' && (
          <div className="tw-w-full tw-h-full"><VideoThumb asset={item} /></div>
        )}
        {item.type !== 'image' && item.type !== 'video' && (
          <div className="asset-placeholder tw-text-xs tw-text-neutral-400">{item.type.toUpperCase()}</div>
        )}
      </div>
      <div className="tw-text-neutral-200 tw-truncate">{item.name}</div>
      <div className="tw-text-neutral-400 tw-text-xs tw-whitespace-nowrap">{formatFileSize(item.size)}</div>
      <div className="tw-text-neutral-400 tw-text-xs tw-whitespace-nowrap">{(item as any).duration ? `${Math.round((item as any).duration)}s` : '-'}</div>
    </div>
  ), (prev: any, next: any) => prev.item.id === next.item.id && prev.item.path === next.item.path && prev.item.size === next.item.size && prev.item.duration === next.item.duration);

  // No global context menu listeners needed; Radix manages open/close

  // Context menu actions are handled inline per-item (regenerate removed)

  return (
    isEmbedded ? (
      <div className="tw-h-full tw-overflow-auto tw-p-3">
        {(
          <> 
            <div className="media-toolbar tw-flex tw-items-center tw-gap-2 tw-p-2">
              <div className="search-bar">
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)
                  }
                  className="tw-w-64 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-0 focus:tw-outline-none tw-shadow-none"
                />
              </div>
              <div className="filter-controls">
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 tw-shadow-none focus:tw-ring-0 focus:tw-outline-none">
                  <option value="all">All Types</option>
                  <option value="image">Images</option>
                  <option value="video">Videos</option>
                </select>
              </div>

              {isElectronEnv && (
                <Button variant="secondary" onClick={handleImportClick}>Import</Button>
              )}
              <Button variant="secondary" onClick={() => setShowDropbox(true)}>Dropbox</Button>
              

            </div>

            {duplicateWarning && (
              <div className="duplicate-warning">
                ⚠️ {duplicateWarning}
              </div>
            )}

            {isElectronEnv && (
              <div
                className={`tw-border-2 tw-border-dashed tw-border-neutral-700 tw-rounded tw-p-6 tw-bg-neutral-900/30 tw-text-neutral-300 hover:tw-border-neutral-500 ${isDragOver ? 'tw-ring-2 tw-ring-purple-600' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={handleDropZoneClick}
              >
                <div className="tw-text-center tw-space-y-1">
                  <div>Drop media files here</div>
                  <div className="tw-text-neutral-400 tw-text-sm">or click to browse</div>
                </div>
              </div>
            )}

            {/* Hidden file input */}
            {isElectronEnv && (
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
            )}

            <div className="tw-flex tw-flex-col tw-divide-y tw-divide-neutral-800 tw-border tw-border-neutral-800 tw-rounded-md">
              {filteredAssets.length === 0 ? (
                <div className="empty-state">
                  <h3>No assets found</h3>
                  <p>Import some media files to get started</p>
                  {assets && assets.length > 0 && (
                    <div className="warning-message">
                      <p>⚠️ Assets were lost after refresh due to storage limits.</p>
                      <p>Please re-import your media files.</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Performance hint for large asset lists */}
                  {filteredAssets.length > 50 && (
                    <div className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-300 tw-text-sm tw-px-3 tw-py-2 tw-my-2">
                      <strong>Performance Tip:</strong> Large asset lists ({filteredAssets.length} items) are optimized with lazy thumbnail generation. 
                      Only visible items generate thumbnails to improve performance. <strong>Thumbnails are now persistent and won't be lost on refresh!</strong>
                    </div>
                  )}
                  
                  {/* Header row */}
                  <div className="tw-grid tw-grid-cols-[80px_1fr_auto_auto] tw-gap-3 tw-px-2 tw-py-2 tw-bg-neutral-900 tw-sticky tw-top-0 tw-z-10 tw-border-b tw-border-neutral-800">
                    <div className="tw-text-neutral-400 tw-text-xs">Thumb</div>
                    <div className="tw-text-neutral-400 tw-text-xs">Video Name</div>
                    <div className="tw-text-neutral-400 tw-text-xs tw-text-right">Size</div>
                    <div className="tw-text-neutral-400 tw-text-xs tw-text-right">Length</div>
                  </div>
                  {filteredAssets.map((asset: any) => (
                    <AssetItem key={asset.id} item={asset} />
                  ))}
                </>
              )}
            </div>
          </>
        )}
        <Dialog open={showDropbox} onOpenChange={setShowDropbox}>
          <DialogContent className="tw-bg-neutral-900 tw-border-neutral-800 tw-text-white tw-max-w-2xl">
            <DialogHeader>
              <DialogTitle>Dropbox</DialogTitle>
            </DialogHeader>
            <DropboxBrowser onClose={() => setShowDropbox(false)} />
          </DialogContent>
        </Dialog>
      </div>
    ) : (
      <div className="tw-fixed tw-inset-0 tw-bg-black/60 tw-z-[5000]">
        <div className="tw-fixed tw-left-1/2 tw-top-1/2 tw--translate-x-1/2 tw--translate-y-1/2 tw-rounded-lg tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-100 tw-shadow-xl tw-w-[900px] tw-max-w-[95vw] tw-max-h-[90vh] tw-flex tw-flex-col">
          <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
            <h2 className="tw-text-base tw-font-semibold">Media Library</h2>
            <button onClick={onClose} className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center hover:tw-bg-neutral-800">×</button>
          </div>

          {(
            <> 
              <div className="media-toolbar tw-flex tw-items-center tw-gap-2 tw-p-2">
                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="Search assets..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)
                    }
                    className="tw-w-64 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-0 focus:tw-outline-none tw-shadow-none"
                  />
                </div>
                <div className="filter-controls">
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1">
                    <option value="all">All Types</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                  </select>
                </div>

                {isElectronEnv && (
                  <Button variant="secondary" onClick={handleImportClick}>Import</Button>
                )}
                <Button variant="secondary" onClick={() => setShowDropbox(true)}>Dropbox</Button>
                

              </div>

              {duplicateWarning && (
                <div className="duplicate-warning">
                  ⚠️ {duplicateWarning}
                </div>
              )}

              {isElectronEnv && (
                <div
                  className={`tw-border-2 tw-border-dashed tw-border-neutral-700 tw-rounded tw-p-6 tw-bg-neutral-900/30 tw-text-neutral-300 hover:tw-border-neutral-500 ${isDragOver ? 'tw-ring-2 tw-ring-purple-600' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={handleDropZoneClick}
                >
                  <div className="tw-text-center tw-space-y-1">
                    <div>Drop media files here</div>
                    <div className="tw-text-neutral-400 tw-text-sm">or click to browse</div>
                  </div>
                </div>
              )}

              {/* Hidden file input */}
              {isElectronEnv && (
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
              )}

              <div className="tw-grid tw-gap-3 lg:tw-grid-cols-2 xl:tw-grid-cols-3 2xl:tw-grid-cols-4">
                {filteredAssets.length === 0 ? (
                  <div className="empty-state">
                    <h3>No assets found</h3>
                    <p>Import some media files to get started</p>
                    {assets && assets.length > 0 && (
                      <div className="warning-message">
                        <p>⚠️ Assets were lost after refresh due to storage limits.</p>
                        <p>Please re-import your media files.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Performance hint for large asset lists */}
                    {filteredAssets.length > 50 && (
                      <div className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-300 tw-text-sm tw-px-3 tw-py-2 tw-my-2">
                        <strong>Performance Tip:</strong> Large asset lists ({filteredAssets.length} items) are optimized with lazy thumbnail generation. 
                        Only visible items generate thumbnails to improve performance. <strong>Thumbnails are now persistent and won't be lost on refresh!</strong>
                      </div>
                    )}
                    
                    {filteredAssets.map((asset: any) => (
                      <AssetItem key={asset.id} item={asset} />
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <Dialog open={showDropbox} onOpenChange={setShowDropbox}>
          <DialogContent className="tw-bg-neutral-900 tw-border-neutral-800 tw-text-white tw-max-w-2xl">
            <DialogHeader>
              <DialogTitle>Dropbox</DialogTitle>
            </DialogHeader>
            <DropboxBrowser onClose={() => setShowDropbox(false)} />
          </DialogContent>
        </Dialog>
        {/* Item-level context menus handled via trigger buttons above */}
      </div>
    )
  );
}; 