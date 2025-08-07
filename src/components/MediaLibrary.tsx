import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useStore } from '../store/store';

interface MediaLibraryProps {
  onClose: () => void;
  isEmbedded?: boolean;
}



export const MediaLibrary: React.FC<MediaLibraryProps> = ({ onClose, isEmbedded = false }) => {
  const { assets, addAsset, removeAsset, updateAsset } = useStore() as any;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasRestoredRef = useRef(false);

  // Restore assets from base64Data when component mounts
  useEffect(() => {
    if (hasRestoredRef.current) return; // Already restored
    
    console.log('MediaLibrary: Checking for assets to restore...');
    let hasRestored = false;
    
    assets.forEach((asset: any) => {
      // If asset has base64Data but no valid path, restore the blob URL
      if (asset.base64Data && (!asset.path || asset.path.startsWith('blob:'))) {
        console.log('Restoring asset from base64Data:', asset.name);
        let mimeType = 'image/*';
        if (asset.type === 'video') mimeType = 'video/*';
        else if (asset.type === 'audio') mimeType = 'audio/*';
        
        const restoredBlobURL = convertBase64ToBlobURL(asset.base64Data, mimeType);
        if (restoredBlobURL) {
          // Update the asset with the restored blob URL in the store
          updateAsset(asset.id, { path: restoredBlobURL });
          console.log('Asset restored successfully:', asset.name);
          hasRestored = true;
        }
      }
    });
    
    if (hasRestored) {
      console.log('Asset restoration completed');
      hasRestoredRef.current = true;
    }
  }, [assets, updateAsset]);

  // Handle drag start for assets
  const handleDragStart = (e: React.DragEvent, asset: any) => {
    console.log('🎯 Starting drag for asset:', asset);
    console.log('🎯 Asset type:', asset.type);
    console.log('🎯 Asset name:', asset.name);
    
    const assetData = JSON.stringify(asset);
    console.log('🎯 Setting drag data:', assetData);
    
    e.dataTransfer.setData('application/json', assetData);
    e.dataTransfer.effectAllowed = 'copy';
    
    console.log('🎯 Drag data set successfully');
    console.log('🎯 DataTransfer types after set:', e.dataTransfer.types);
    console.log('🎯 DataTransfer items after set:', e.dataTransfer.items);
  };



  // Handle file import
  const handleFileImport = async (files: FileList) => {
    console.log('Importing files:', files.length, 'files');
    
    // Check if we're in Electron environment
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    console.log('Is Electron environment:', isElectron);
    
    for (const file of Array.from(files)) {
      console.log('Processing file:', file.name, file.type, file.size);
      
      // Check if asset already exists
      const existingAsset = assets.find((asset: any) => asset.name === file.name);
      if (existingAsset) {
        console.log('Asset already exists:', file.name);
        setDuplicateWarning(`"${file.name}" already exists in library`);
        setTimeout(() => setDuplicateWarning(''), 3000); // Clear warning after 3 seconds
        continue; // Skip this file
      }
      
      try {
        // Get the file path using our resolver function
        let filePath = resolveFilePath(file);
        
        if (!filePath) {
          // Fallback to other methods
          if (file.path) {
            filePath = file.path;
            console.log('Found file path:', filePath);
          } else if (file.webkitRelativePath) {
            filePath = file.webkitRelativePath;
            console.log('Found webkit path:', filePath);
          } else if (isElectron) {
            // In Electron, try to get the path from the file object
            console.log('File object properties:', Object.keys(file));
            console.log('File object:', file);
            
            // Try to access the path property directly
            if ((file as any).path) {
              filePath = (file as any).path;
              console.log('Found path via direct access:', filePath);
            }
          }
        }
        
        // Create a blob URL for immediate use
        const blobURL = URL.createObjectURL(file);
        console.log('Created blob URL:', blobURL, 'for file:', file.name);
        
        // Convert to base64 for persistence (try for all files, but handle large files carefully)
        let base64Data = '';
        try {
          if (file.size < 50 * 1024 * 1024) { // Try for files smaller than 50MB
            base64Data = await fileToBase64(file);
            console.log('Converted file to base64 for persistence');
          } else {
            console.log('File too large for base64 conversion, will rely on file path:', file.size);
          }
        } catch (error) {
          console.error('Failed to convert file to base64:', error);
          console.log('Will rely on file path for persistence');
        }
        
        const asset = {
          id: `asset-${Date.now()}-${Math.random()}`,
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 
                file.type.startsWith('video/') ? 'video' : 
                file.type.startsWith('audio/') ? 'audio' : 'unknown',
          path: filePath ? `file://${filePath}` : blobURL, // Use file path if available, otherwise blob URL
          filePath: filePath, // Store actual file path if available
          base64Data: base64Data, // Store base64 for persistence (small files only)
          file: file, // Keep file object for blob URL recreation
          size: file.size,
          date: new Date().toLocaleDateString()
        };
        
        addAsset(asset);
        console.log('Imported asset:', asset);
        
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
      
      console.log('Successfully created blob URL:', blobURL, 'for type:', type, 'size:', byteArray.length);
      return blobURL;
    } catch (error) {
      console.error('Error converting base64 to blob URL:', error);
      return null;
    }
  };

  // Function to resolve file path in Electron environment
  const resolveFilePath = (file: File): string => {
    console.log('Resolving file path for:', file.name);
    console.log('File object:', file);
    
    // Check if we're in Electron environment
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    
    if (isElectron) {
      try {
        // In Electron, we can use Node.js path module
        const path = (window as any).require('path');
        
        // Try different ways to get the file path
        if ((file as any).path) {
          const resolvedPath = path.resolve((file as any).path);
          console.log('Resolved file path (Electron):', resolvedPath);
          return resolvedPath;
        }
        
        // If no path property, try to construct from name (this is a fallback)
        console.log('No path property found, using fallback');
        return '';
      } catch (error) {
        console.error('Error resolving file path (Electron):', error);
        return '';
      }
    } else {
      // In browser environment, we can't resolve file paths
      console.log('Browser environment detected, cannot resolve file paths');
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
    console.log('Processing assets:', assets?.length || 0, 'assets');
    console.log('Raw assets:', assets);
    
    const processed = (assets || []).map((asset: any) => {
      // If asset has a file path, use it directly (highest priority)
      if (asset.filePath && asset.filePath.length > 0) {
        console.log('Using file path for asset:', asset.name, asset.filePath);
        return {
          ...asset,
          path: `file://${asset.filePath}` // Use file:// protocol for local files
        };
      }
      
      // If asset has a File object, create a fresh blob URL
      if (asset.file && asset.file instanceof File) {
        try {
          const blobURL = URL.createObjectURL(asset.file);
          console.log('Created fresh blob URL for asset:', asset.name, blobURL);
          return {
            ...asset,
            path: blobURL
          };
        } catch (error) {
          console.error('Failed to create blob URL for asset:', asset.name, error);
        }
      }
      
      // If asset has base64Data, try to recreate blob URL
      if (asset.base64Data && !asset.path.startsWith('blob:')) {
        let mimeType = 'image/*';
        if (asset.type === 'video') mimeType = 'video/*';
        else if (asset.type === 'audio') mimeType = 'audio/*';
        
        const newPath = convertBase64ToBlobURL(asset.base64Data, mimeType);
        if (newPath) {
          console.log('Recreated blob URL for asset:', asset.name, 'from:', asset.path, 'to:', newPath);
          return {
            ...asset,
            path: newPath
          };
        } else {
          console.error('Failed to recreate blob URL for asset:', asset.name);
        }
      }
      
      // If asset has no base64Data but has a filePath, try to use the file path
      if (!asset.base64Data && asset.filePath) {
        console.log('Asset has file path but no base64 data:', asset.name, asset.filePath);
        return {
          ...asset,
          path: `file://${asset.filePath}`
        };
      }
      
      // If asset has a blob URL that's still valid, keep it
      if (asset.path && asset.path.startsWith('blob:')) {
        console.log('Asset already has blob URL:', asset.name, asset.path);
        return asset;
      }
      
      // If asset has a file:// path, keep it
      if (asset.path && asset.path.startsWith('file://')) {
        console.log('Asset already has file path:', asset.name, asset.path);
        return asset;
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
    console.log('Current blob URLs:', currentBlobUrls);
    console.log('Processed assets:', processed);

    return processed;
  }, [assets]); // Only recreate when assets change

  // Cleanup old blob URLs when component unmounts or assets change
  useEffect(() => {
    const currentBlobUrls = processedAssets
      .map((asset: any) => asset.path)
      .filter((path: string) => path.startsWith('blob:'));
    
    console.log('Current blob URLs:', currentBlobUrls);
    
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
  const filteredAssets = processedAssets.filter((asset: any) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || asset.type === filterType;
    return matchesSearch && matchesType;
  });

  // Debug logging
  console.log('MediaLibrary Debug:', {
    assetsCount: assets?.length || 0,
    processedAssetsCount: processedAssets?.length || 0,
    filteredAssetsCount: filteredAssets?.length || 0,
    searchTerm,
    filterType,
    assets: assets,
    processedAssets: processedAssets,
    filteredAssets: filteredAssets
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleRemoveAsset = (assetId: string) => {
    removeAsset(assetId);
    console.log('Removed asset:', assetId);
  };



  const renderMediaTab = () => (
    <>
      <div className="media-toolbar">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search assets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-controls">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </select>
        </div>

        <button className="import-button" onClick={handleImportClick}>Import</button>
      </div>

      {duplicateWarning && (
        <div className="duplicate-warning">
          ⚠️ {duplicateWarning}
        </div>
      )}

      <div
        className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleDropZoneClick}
      >
        <div className="drop-zone-content">
          <div>Drop media files here</div>
          <div className="drop-hint">or click to browse</div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      <div className="assets-container list">
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
          filteredAssets.map((asset: any) => {
            return (
              <div
                key={asset.id}
                className={`asset-item ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                onClick={() => setSelectedAsset(asset)}
                draggable
                onDragStart={(e) => handleDragStart(e, asset)}
              >
                <div className="asset-preview">
                  {asset.type === 'image' ? (
                    <img src={asset.path} alt={asset.name} />
                  ) : asset.type === 'audio' ? (
                    <div className="asset-placeholder audio">
                      <div className="audio-icon">🎵</div>
                      <div className="audio-name">{asset.name}</div>
                    </div>
                  ) : (
                    <div className="asset-placeholder">
                      {asset.type.toUpperCase()}
                    </div>
                  )}
                  <div className="asset-type-badge">
                    {asset.type.toUpperCase()}
                  </div>
                </div>
                <div className="asset-info">
                  <div className="asset-name">{asset.name}</div>
                  <div className="asset-meta">
                    <span>{formatFileSize(asset.size)}</span>
                    <span>{asset.date}</span>
                  </div>
                </div>
                <div className="asset-actions">
                  <button className="delete-button" onClick={(e) => { e.stopPropagation(); handleRemoveAsset(asset.id); }}>🗑️</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );



  if (isEmbedded) {
    return (
      <div className="media-library-content embedded">
        {renderMediaTab()}
      </div>
    );
  }

  return (
    <div className="media-library-modal">
      <div className="media-library-content">
        <div className="media-library-header">
          <h2>Media Library</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        {renderMediaTab()}
      </div>
    </div>
  );
}; 