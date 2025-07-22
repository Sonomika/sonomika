import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/store';

interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'shader' | 'p5js' | 'threejs';
  path: string;
  thumbnail?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    size?: number;
  };
  tags: string[];
  createdAt: Date;
}

interface MediaLibraryProps {
  onClose: () => void;
  onAssetSelect?: (asset: MediaAsset) => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({ onClose, onAssetSelect }) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'shader' | 'p5js' | 'threejs'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = () => {
    try {
      const savedAssets = localStorage.getItem('vj-media-assets');
      if (savedAssets) {
        const parsedAssets = JSON.parse(savedAssets);
        // Convert createdAt strings back to Date objects
        const assetsWithDates = parsedAssets.map((asset: any) => ({
          ...asset,
          createdAt: new Date(asset.createdAt)
        }));
        setAssets(assetsWithDates);
      }
    } catch (error) {
      console.error('Failed to load media assets:', error);
    }
  };

  const saveAssets = (newAssets: MediaAsset[]) => {
    try {
      localStorage.setItem('vj-media-assets', JSON.stringify(newAssets));
      setAssets(newAssets);
    } catch (error) {
      console.error('Failed to save media assets:', error);
    }
  };

  const handleFileImport = async (files: FileList) => {
    setIsImporting(true);
    
    const newAssets: MediaAsset[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const asset = await createAssetFromFile(file);
      if (asset) {
        newAssets.push(asset);
      }
    }
    
    if (newAssets.length > 0) {
      saveAssets([...assets, ...newAssets]);
    }
    
    setIsImporting(false);
  };

  const createAssetFromFile = async (file: File): Promise<MediaAsset | null> => {
    const id = generateId();
    const type = getAssetType(file);
    
    if (!type) return null;

    const asset: MediaAsset = {
      id,
      name: file.name,
      type,
      path: URL.createObjectURL(file),
      tags: [],
      createdAt: new Date(),
      metadata: {
        size: file.size,
      },
    };

    // Generate thumbnail for images and videos
    if (type === 'image' || type === 'video') {
      try {
        const thumbnail = await generateThumbnail(file, type);
        asset.thumbnail = thumbnail;
      } catch (error) {
        console.error('Failed to generate thumbnail:', error);
      }
    }

    return asset;
  };

  const getAssetType = (file: File): MediaAsset['type'] | null => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const videoTypes = ['video/mp4', 'video/webm', 'video/ogg'];
    const shaderTypes = ['.frag', '.vert', '.glsl'];
    const p5jsTypes = ['.js'];
    const threejsTypes = ['.js'];

    if (imageTypes.includes(file.type)) return 'image';
    if (videoTypes.includes(file.type)) return 'video';
    if (shaderTypes.some(ext => file.name.toLowerCase().endsWith(ext))) return 'shader';
    if (p5jsTypes.some(ext => file.name.toLowerCase().endsWith(ext))) return 'p5js';
    if (threejsTypes.some(ext => file.name.toLowerCase().endsWith(ext))) return 'threejs';
    
    return null;
  };

  const generateThumbnail = async (file: File, type: 'image' | 'video'): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const video = document.createElement('video');

      canvas.width = 200;
      canvas.height = 150;

      if (type === 'image') {
        img.onload = () => {
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;
          
          ctx?.drawImage(img, x, y, img.width * scale, img.height * scale);
          resolve(canvas.toDataURL());
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      } else if (type === 'video') {
        video.onloadeddata = () => {
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL());
        };
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
        video.currentTime = 1; // Seek to 1 second for thumbnail
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    handleFileImport(e.dataTransfer.files);
  };

  const handleAssetClick = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    if (onAssetSelect) {
      onAssetSelect(asset);
    }
  };

  const handleAssetDragStart = (e: React.DragEvent, asset: MediaAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const filteredAssets = assets.filter(asset => {
    const matchesType = filterType === 'all' || asset.type === filterType;
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const getTypeIcon = (type: MediaAsset['type']) => {
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'shader': return '⚡';
      case 'p5js': return '🎨';
      case 'threejs': return '🔷';
      default: return '📄';
    }
  };

  const getTypeColor = (type: MediaAsset['type']) => {
    switch (type) {
      case 'image': return '#4CAF50';
      case 'video': return '#2196F3';
      case 'shader': return '#FF9800';
      case 'p5js': return '#9C27B0';
      case 'threejs': return '#00BCD4';
      default: return '#757575';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content media-library" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Media Library</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="media-library-content">
          {/* Toolbar */}
          <div className="media-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-controls">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
              >
                <option value="all">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="shader">Shaders</option>
                <option value="p5js">p5.js Sketches</option>
                <option value="threejs">Three.js Modules</option>
              </select>

              <div className="view-toggle">
                <button
                  className={viewMode === 'grid' ? 'active' : ''}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
                <button
                  className={viewMode === 'list' ? 'active' : ''}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
              </div>
            </div>

            <button
              className="import-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? 'Importing...' : 'Import Files'}
            </button>
          </div>

          {/* Drop Zone */}
          <div
            className="drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="drop-zone-content">
              <div className="drop-icon">📁</div>
              <p>Drag and drop files here</p>
              <p className="drop-hint">Supports: Images, Videos, Shaders, p5.js, Three.js</p>
            </div>
          </div>

          {/* Assets Grid/List */}
          <div className={`assets-container ${viewMode}`}>
            {filteredAssets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📂</div>
                <h3>No assets found</h3>
                <p>Import some files to get started</p>
              </div>
            ) : (
              filteredAssets.map(asset => (
                <div
                  key={asset.id}
                  className={`asset-item ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                  onClick={() => handleAssetClick(asset)}
                  draggable
                  onDragStart={(e) => handleAssetDragStart(e, asset)}
                >
                  <div className="asset-preview">
                    {asset.thumbnail ? (
                      <img src={asset.thumbnail} alt={asset.name} />
                    ) : (
                      <div className="asset-placeholder">
                        {getTypeIcon(asset.type)}
                      </div>
                    )}
                    <div className="asset-type-badge" style={{ backgroundColor: getTypeColor(asset.type) }}>
                      {asset.type.toUpperCase()}
                    </div>
                  </div>
                  
                  <div className="asset-info">
                    <div className="asset-name">{asset.name}</div>
                    <div className="asset-meta">
                      {asset.metadata?.size && (
                        <span>{(asset.metadata.size / 1024 / 1024).toFixed(1)}MB</span>
                      )}
                      <span>{asset.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.frag,.vert,.glsl,.js"
          onChange={(e) => e.target.files && handleFileImport(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
};

const generateId = () => Math.random().toString(36).substr(2, 9); 