import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateVideoThumbnail } from '../utils/ThumbnailCache';
import { getAllRegisteredEffects, getEffect } from '../utils/effectRegistry';
import { effectCache, CachedEffect } from '../utils/EffectCache';

interface MediaBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

type TabType = 'media' | 'effects' | 'sources' | 'midi' | 'lfo';

export const MediaBrowser: React.FC<MediaBrowserProps> = ({ onClose }) => {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('media');
  const [cachedEffects, setCachedEffects] = useState<CachedEffect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('Initializing...');

  // Native-like filesystem browser state
  const [currentPath, setCurrentPath] = useState<string>('');
  const [dirItems, setDirItems] = useState<Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    mtimeMs?: number;
  }>>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Array<{ label: string; path: string }>>([]);
  const [pathInput, setPathInput] = useState<string>('');

  // Filesystem access via preload (safe)
  const fsApi = (window as any).fsApi || null;
  const fs = null as any;
  const pathMod = null as any;
  const os = null as any;

  // Debug logging for fsApi
  console.log('🔍 MediaBrowser: Component mounted');
  console.log('🔍 MediaBrowser: Window object keys:', Object.keys(window));
  console.log('🔍 MediaBrowser: fsApi available:', !!fsApi);
  console.log('🔍 MediaBrowser: electron available:', !!(window as any).electron);
  if (fsApi) {
    console.log('🔍 MediaBrowser: fsApi methods:', Object.keys(fsApi));
  }

  const pathJoin = (...parts: string[]) => (fsApi?.join ? fsApi.join(...parts) : parts.join('/'));
  const sep = fsApi?.sep || '/';

  const allowedVideo = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv']);
  const InlineThumb: React.FC<{ path: string }> = ({ path }) => {
    const [thumb, setThumb] = React.useState<string>('');
    const [isVisible, setIsVisible] = React.useState(false);
    const [isGenerating, setIsGenerating] = React.useState(false);
    const thumbRef = React.useRef<HTMLDivElement>(null);
    const normalized = path.startsWith('local-file://') ? path : path;
    
    // Intersection Observer to only generate thumbnails for visible items
    React.useEffect(() => {
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
          rootMargin: '200px', // Start loading before item becomes visible
          threshold: 0.1
        }
      );
      
      observer.observe(thumbRef.current);
      return () => observer.disconnect();
    }, []);
    
    // Generate thumbnail only when visible
    React.useEffect(() => {
      if (!isVisible || thumb || isGenerating) return;
      
      setIsGenerating(true);
      generateVideoThumbnail(normalized, { width: 80, height: 45, captureTimeSec: 0.1 }, 0) // Lower priority for browser
        .then((d) => { 
          setThumb(d); 
        })
        .catch(() => { 
          setThumb(''); 
        })
        .finally(() => {
          setIsGenerating(false);
        });
    }, [isVisible, normalized, thumb, isGenerating]);
    
    return thumb ? (
      <img src={thumb} alt="thumb" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 2 }} />
    ) : (
      <div 
        ref={thumbRef}
        style={{ 
          width: 80, 
          height: 45, 
          background: '#111', 
          border: '1px solid #222',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: '#666'
        }}
        title={isGenerating ? 'Generating thumbnail...' : 'Waiting to generate...'}
      >
        {isGenerating ? 'GEN...' : 'WAIT...'}
      </div>
    );
  };
  const allowedImage = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);
  const allowedAudio = new Set(['.mp3', '.wav', '.aiff', '.flac', '.ogg']);

  const getExt = (file: string) => file.slice(file.lastIndexOf('.')).toLowerCase();
  const classifyType = (fileName: string): 'video' | 'image' | 'audio' | 'other' => {
    const ext = getExt(fileName);
    if (allowedVideo.has(ext)) return 'video';
    if (allowedImage.has(ext)) return 'image';
    if (allowedAudio.has(ext)) return 'audio';
    return 'other';
  };

  const loadDirectory = (dirPath: string) => {
    try {
      if (!fsApi) {
        console.warn('❌ MediaBrowser: fsApi is not available');
        return;
      }
      const items = fsApi.listDirectory(dirPath);
      // Sort: directories first, then name asc
      items.sort((a: any, b: any) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setDirItems(items);
      setCurrentPath(dirPath);
      setPathInput(dirPath);
      localStorage.setItem('vj-last-media-path', dirPath);
    } catch (e) {
      console.error('❌ MediaBrowser: Failed to read directory:', dirPath, e);
    }
  };

  // Use effect cache for much faster loading
  useEffect(() => {
    const loadEffects = async () => {
      setIsLoading(true);
      setLoadingProgress('Starting effect preloading...');
      
      try {
        // Check if effects are already preloaded
        if (effectCache.isEffectsPreloaded()) {
          console.log('🚀 MediaBrowser: Using preloaded effects cache');
          setCachedEffects(effectCache.getCachedEffects());
          setIsLoading(false);
          return;
        }

        // Start preloading effects
        setLoadingProgress('Preloading effects...');
        await effectCache.startPreloading();
        
        // Get cached effects
        const effects = effectCache.getCachedEffects();
        setCachedEffects(effects);
        setLoadingProgress(`Loaded ${effects.length} effects`);
        
        console.log(`🔧 MediaBrowser: Loaded ${effects.length} effects from cache`);
      } catch (error) {
        console.warn('⚠️ Cache loading failed, falling back to registry:', error);
        setLoadingProgress('Falling back to discovery...');
        
        // Fallback to old discovery method
        try {
          const { EffectDiscovery } = await import('../utils/EffectDiscovery');
          const discovery = EffectDiscovery.getInstance();
          await discovery.discoverEffects();
          
          // Get registered effects from registry
          const registeredEffectIds = getAllRegisteredEffects();
          const effects = registeredEffectIds.map(effectId => {
            const effectComponent = getEffect(effectId);
            if (!effectComponent) return null;

            const metadata = (effectComponent as any).metadata || {};
            return {
              id: effectId,
              name: metadata.name || effectId,
              description: metadata.description || 'No description available',
              category: metadata.category || 'Effects', 
              icon: metadata.icon || '✨',
              author: metadata.author || 'Unknown',
              version: metadata.version || '1.0.0',
              component: effectComponent,
              metadata,
              loadTime: 0
            };
          }).filter((effect): effect is NonNullable<typeof effect> => effect !== null);
          
          setCachedEffects(effects as CachedEffect[]);
          setLoadingProgress(`Loaded ${effects.length} effects via registry`);
        } catch (fallbackError) {
          console.error('❌ Both cache and registry loading failed:', fallbackError);
          setLoadingProgress('Failed to load effects');
        }
      }
      
      setIsLoading(false);
    };
    
    loadEffects();
  }, []);

  // Initialize default folder, detect roots and favorites
  useEffect(() => {
    try {
      if (!fsApi) {
        console.warn('❌ MediaBrowser: fsApi not available during initialization');
        // Set a default message when not in Electron
        setDirItems([{
          name: 'Not running in Electron',
          path: '',
          isDirectory: false,
          size: 0,
          mtimeMs: Date.now()
        }]);
        setCurrentPath('Not available');
        return;
      }

      // Detect roots (drives on Windows, '/' on POSIX)
      const detected: string[] = fsApi.roots ? fsApi.roots() : [sep];
      setRoots(detected);

      // Favorites
      const favs: Array<{ label: string; path: string }> = [];
      const home = (fsApi.homedir && fsApi.homedir()) || '';
      const exists = (p: string) => (fsApi.exists ? fsApi.exists(p) : false);
      const maybe = (label: string, p: string) => { try { if (p && exists(p)) favs.push({ label, path: p }); } catch {} };
      maybe('Home', home);
      maybe('Desktop', pathJoin(home, 'Desktop'));
      maybe('Documents', pathJoin(home, 'Documents'));
      maybe('Downloads', pathJoin(home, 'Downloads'));
      setFavorites(favs);

      const last = localStorage.getItem('vj-last-media-path');
      const platform = fsApi.platform ? fsApi.platform() : 'unknown';
      const cRoot = `C:${sep}`;
      let defaultPath = '';
      if (last) {
        defaultPath = last;
      } else if (platform === 'win32' && exists(cRoot)) {
        // Default to C:\ on Windows when available
        defaultPath = cRoot;
      } else if (detected[0]) {
        defaultPath = detected[0];
      } else if (home) {
        defaultPath = home;
      } else {
        defaultPath = detected[0] || sep;
      }
      loadDirectory(defaultPath);
    } catch (e) {
      console.error('❌ MediaBrowser: Error during initialization:', e);
      // Set error message when initialization fails
      setDirItems([{
        name: 'Error during initialization',
        path: '',
        isDirectory: false,
        size: 0,
        mtimeMs: Date.now()
      }]);
      setCurrentPath('Error');
    }
  }, [fsApi]);

  // Use cached effects for display (much faster than registry lookup)
  const allEffects = cachedEffects.map(effect => ({
    id: effect.id,
    name: effect.name,
    type: 'threejs',
    description: effect.description,
    category: effect.category,
    icon: effect.icon,
    author: effect.author,
    version: effect.version,
    metadata: effect.metadata, // Preserve effect metadata (including parameters)
    // Determine if this is an effect or source based on the folder location and metadata
    isSource: effect.metadata?.folder === 'sources' || 
              effect.metadata?.isSource === true ||
              // Fallback: check if the effect ID contains source-related keywords
              effect.id.toLowerCase().includes('particle') ||
              effect.id.toLowerCase().includes('noise') ||
              effect.id.toLowerCase().includes('matrix') ||
              effect.id.toLowerCase().includes('pointcloud') ||
              effect.id.toLowerCase().includes('blob') ||
              effect.id.toLowerCase().includes('flux') ||
              effect.id.toLowerCase().includes('pulse') ||
              effect.id.toLowerCase().includes('generative')
  }));

  // Filter effects based on search term - search across all effects regardless of tab
  const filteredEffects = allEffects.filter(effect =>
    effect.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Separate effects into Effects vs Sources for tab display
  const visualEffects = filteredEffects.filter(effect => !effect.isSource);
  const generativeSources = filteredEffects.filter(effect => effect.isSource);

  // Group effects by category
  const effectsByCategory = filteredEffects.reduce((acc, effect) => {
    if (!acc[effect.category]) {
      acc[effect.category] = [];
    }
    acc[effect.category].push(effect);
    return acc;
  }, {} as Record<string, typeof allEffects>);

  const handleItemSelect = (item: any) => {
    setSelectedItem(item);
  };

  const handleItemDrag = (e: React.DragEvent, item: any, itemType: string) => {
    // Normalize drag payload so both Effects and Sources are treated as effects by drop handlers
    // Sources still carry isSource=true for downstream logic (e.g., transparent background)
    const payload = {
      type: 'effect',            // unify for DnD handling
      assetType: 'effect',       // explicit for consumers
      isEffect: true,            // ensure drop handler processes as effect
      isSource: itemType === 'source',
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      icon: item.icon,
      // include full metadata and nested effect object like the EffectsBrowser does
      metadata: item.metadata,
      effect: item
    } as any;

    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    console.log(`🔧 Dragging ${itemType} as effect:`, payload);
  };

  const handleFileDrag = (e: React.DragEvent, fileEntry: { name: string; path: string }) => {
    const extType = classifyType(fileEntry.name);
    const asset = {
      id: fileEntry.path,
      name: fileEntry.name,
      type: extType,
      filePath: fileEntry.path,
      path: `local-file://${fileEntry.path}`,
      date: Date.now(),
      size: undefined,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    console.log('🔧 Dragging file asset:', asset);
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split(sep).filter(Boolean);
    if (parts.length === 0) return;
    const parent = currentPath.endsWith(sep) && parts.length > 1 ? parts.slice(0, parts.length - 1).join(sep) : currentPath.split(sep).slice(0, -1).join(sep);
    if (parent) loadDirectory(parent);
  };

  const breadcrumb = useMemo(() => {
    if (!currentPath) return [] as Array<{ label: string; full: string }>;
    const parts = currentPath.split(sep).filter(Boolean);
    const crumbs: Array<{ label: string; full: string }>= [];
    let acc = currentPath.startsWith(sep) ? sep : '';
    parts.forEach((p, idx) => {
      acc = acc ? pathJoin(acc, p) : p;
      crumbs.push({ label: p, full: acc });
    });
    return crumbs;
  }, [currentPath, sep]);

  const handleAddToLayer = () => {
    if (selectedItem) {
      console.log('Adding item to layer:', selectedItem);
    }
  };

  const handlePreview = () => {
    if (selectedItem) {
      console.log('Previewing item:', selectedItem);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  // Render different content based on loading state
  if (isLoading) {
    return (
      <div className="media-browser">
        <div className="media-browser-header">
          <h2>Media Browser</h2>
          <button onClick={handleClose} className="close-button">×</button>
        </div>
        <div className="media-browser-content">
          <div className="loading">
            <div className="loading-spinner"></div>
            <div className="loading-text">{loadingProgress}</div>
          </div>
        </div>
      </div>
    );
  }

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'media':
        return (
          <div className="tab-content">
            {!fsApi && (
              <div style={{ 
                background: '#ff6b6b', 
                color: '#fff', 
                padding: '12px', 
                margin: '8px', 
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                ⚠️ File browser requires Electron. Please run the app using "npm run dev:electron" to access local files.
              </div>
            )}
            <div className="file-browser-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={navigateUp} className="btn" title="Up">↑</button>
              {roots.length > 0 && (
                <select
                  value={''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) loadDirectory(val);
                    e.currentTarget.value = '';
                  }}
                  style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '4px 6px' }}
                  title="Drives"
                >
                  <option value="" disabled>Drives</option>
                  {roots.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
              {favorites.map((f) => (
                <button key={f.path} className="btn" onClick={() => loadDirectory(f.path)} title={f.path}>{f.label}</button>
              ))}
              <div className="breadcrumbs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {breadcrumb.map((c, i) => (
                  <React.Fragment key={c.full}>
                    <button className="crumb" onClick={() => loadDirectory(c.full)}>{c.label}</button>
                    {i < breadcrumb.length - 1 && <span style={{ color: '#888' }}>/</span>}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Path"
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && pathInput) loadDirectory(pathInput); }}
                    className="search-input"
                    style={{ minWidth: 280 }}
                  />
                  <button className="btn" onClick={() => pathInput && loadDirectory(pathInput)}>Go</button>
                  <input
                    type="text"
                    placeholder="Filter"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                    style={{ minWidth: 140 }}
                  />
                </div>
              </div>
            </div>

            <div className="file-list" style={{ marginTop: 8 }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 180px', padding: '6px 8px', color: '#aaa', borderBottom: '1px solid #333' }}>
                <div>Preview</div>
                <div>Name</div>
                <div>Type</div>
                <div>Modified</div>
              </div>
              <div>
                {dirItems
                  .filter((it) => it.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((it) => {
                    const type = it.isDirectory ? 'Folder' : classifyType(it.name);
                    const modified = it.mtimeMs ? new Date(it.mtimeMs).toLocaleString() : '';
                    return (
                      <div
                        key={it.path}
                        className="file-row"
                        style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 180px', padding: '8px', cursor: 'default', alignItems: 'center' }}
                        onDoubleClick={() => {
                          if (it.isDirectory) loadDirectory(it.path);
                        }}
                        draggable={!it.isDirectory && classifyType(it.name) !== 'other'}
                        onDragStart={(e) => {
                          if (!it.isDirectory) handleFileDrag(e, it);
                        }}
                        onClick={() => setSelectedItem({ id: it.path, name: it.name, type })}
                        title={it.path}
                      >
                        <div>
                          {!it.isDirectory && typeof type === 'string' && type === 'video' ? (
                            <InlineThumb path={it.path} />
                          ) : null}
                        </div>
                        <div style={{ color: it.isDirectory ? '#7fbfff' : '#fff' }}>{it.name}</div>
                        <div style={{ textTransform: 'capitalize', color: '#ccc' }}>{typeof type === 'string' ? type : ''}</div>
                        <div style={{ color: '#aaa' }}>{modified}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        );

            case 'effects':
        return (
          <div className="tab-content">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search effects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="effects-grid">
              {/* Visual Effects (from @effects folder) */}
              <div className="effect-category">
                <h3>Visual Effects</h3>
                <div className="effect-items">
                  {visualEffects.map((effect) => (
                    <div
                      key={effect.id}
                      className={`effect-item ${selectedItem?.id === effect.id ? 'selected' : ''}`}
                      onClick={() => handleItemSelect(effect)}
                      draggable
                      onDragStart={(e) => handleItemDrag(e, effect, 'effect')}
                    >
                      <div className="effect-name">{effect.name}</div>
                      <div className="effect-description">{effect.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

            case 'sources':
        return (
          <div className="tab-content">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search sources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="sources-grid">
              {/* Generative Sources (from sources folder) */}
              <div className="source-category">
                <h3>Generative Sources</h3>
                <div className="source-items">
                  {generativeSources.map((effect) => (
                    <div
                      key={effect.id}
                      className={`source-item ${selectedItem?.id === effect.id ? 'selected' : ''}`}
                      onClick={() => handleItemSelect(effect)}
                      draggable
                      onDragStart={(e) => handleItemDrag(e, effect, 'source')}
                    >
                      <div className="source-name">{effect.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'midi':
        return (
          <div className="tab-content">
            <div className="midi-content">
              <h3>MIDI Mapping</h3>
              <p>Configure MIDI controllers and mappings for your composition.</p>
              <div className="midi-settings">
                <div className="setting-group">
                  <label>MIDI Input Device:</label>
                  <select className="midi-select">
                    <option>No devices detected</option>
                  </select>
                </div>
                <div className="setting-group">
                  <label>MIDI Channel:</label>
                  <select className="midi-select">
                    <option>All Channels</option>
                    <option>Channel 1</option>
                    <option>Channel 2</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 'lfo':
        return (
          <div className="tab-content">
            <div className="lfo-content">
              <h3>LFO (Low Frequency Oscillator)</h3>
              <p>Create automated parameter animations and modulations.</p>
                             <div className="lfo-presets">
                 <div className="lfo-preset" onClick={() => handleItemSelect({ id: 'sine', name: 'Sine Wave', type: 'lfo' })}>
                   <div className="lfo-name">Sine Wave</div>
                 </div>
                 <div className="lfo-preset" onClick={() => handleItemSelect({ id: 'square', name: 'Square Wave', type: 'lfo' })}>
                   <div className="lfo-name">Square Wave</div>
                 </div>
                 <div className="lfo-preset" onClick={() => handleItemSelect({ id: 'random', name: 'Random', type: 'lfo' })}>
                   <div className="lfo-name">Random</div>
                 </div>
               </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="media-browser">
      <div className="media-browser-header">
        <h2>Media Browser</h2>
        <button onClick={handleClose} className="close-button">×</button>
      </div>
      
             <div className="media-browser-tabs">
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
           className={`tab-button ${activeTab === 'sources' ? 'active' : ''}`}
           onClick={() => setActiveTab('sources')}
         >
           Sources
         </button>
         <button
           className={`tab-button ${activeTab === 'midi' ? 'active' : ''}`}
           onClick={() => setActiveTab('midi')}
         >
           MIDI
         </button>
         <button
           className={`tab-button ${activeTab === 'lfo' ? 'active' : ''}`}
           onClick={() => setActiveTab('lfo')}
         >
           LFO
         </button>
       </div>

      <div className="media-browser-content">
        {renderTabContent()}
      </div>

      {selectedItem && (
        <div className="media-browser-footer">
          <div className="selected-item-info">
            <span className="selected-item-name">{selectedItem.name}</span>
            <span className="selected-item-type">{selectedItem.type}</span>
          </div>
                     <div className="action-buttons">
             <button onClick={handlePreview} className="action-button">
               Preview
             </button>
             <button onClick={handleAddToLayer} className="action-button primary">
               Add to Layer
             </button>
           </div>
        </div>
      )}
    </div>
  );
};
