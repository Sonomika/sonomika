import React, { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, Select } from './ui';
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
      <img src={thumb} alt="thumb" className="tw-w-20 tw-h-[45px] tw-object-cover tw-rounded-[2px]" />
    ) : (
      <div 
        ref={thumbRef}
        className="tw-w-20 tw-h-[45px] tw-bg-[#111] tw-border tw-border-[#222] tw-flex tw-items-center tw-justify-center tw-text-[8px] tw-text-[#666]"
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
      <div className="tw-flex tw-flex-col tw-h-full tw-bg-neutral-900 tw-text-white">
        <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
          <h2 className="tw-text-lg tw-font-semibold">Media Browser</h2>
          <button onClick={handleClose} className="tw-border tw-border-neutral-700 tw-text-neutral-300 tw-w-8 tw-h-8 hover:tw-bg-neutral-800">×</button>
        </div>
        <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center">
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-2 tw-text-neutral-300">
            <div className="tw-animate-spin tw-w-6 tw-h-6 tw-border-2 tw-border-neutral-600 tw-border-t-transparent tw-rounded-full" />
            <div className="tw-text-sm">{loadingProgress}</div>
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
          <div className="tw-p-2 tw-space-y-3">
            {!fsApi && (
              <div className="tw-bg-[#ff6b6b] tw-text-white tw-p-3 tw-m-2 tw-rounded tw-text-center">
                ⚠️ File browser requires Electron. Please run the app using "npm run dev:electron" to access local files.
              </div>
            )}
            <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap">
              <button
                onClick={navigateUp}
                title="Up"
                className="tw-inline-flex tw-items-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2 tw-py-1 tw-text-sm tw-text-neutral-100 hover:tw-bg-neutral-800"
              >
                ↑
              </button>
              {roots.length > 0 && (
                <div className="tw-min-w-[160px]">
                  <Select
                    value={'' as any}
                    onChange={(val) => {
                      const v = String(val);
                      if (v) loadDirectory(v);
                    }}
                    options={[{ value: '', label: 'Drives' }, ...roots.map((r) => ({ value: r, label: r }))]}
                  />
                </div>
              )}
              {favorites.map((f) => (
                <button
                  key={f.path}
                  onClick={() => loadDirectory(f.path)}
                  title={f.path}
                  className="tw-inline-flex tw-items-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2 tw-py-1 tw-text-sm tw-text-neutral-100 hover:tw-bg-neutral-800"
                >
                  {f.label}
                </button>
              ))}
              <div className="tw-flex tw-gap-1.5 tw-flex-wrap tw-items-center">
                {breadcrumb.map((c, i) => (
                  <React.Fragment key={c.full}>
                    <button className="tw-text-sm tw-text-sky-400 hover:tw-underline" onClick={() => loadDirectory(c.full)}>{c.label}</button>
                    {i < breadcrumb.length - 1 && <span className="tw-text-neutral-500">/</span>}
                  </React.Fragment>
                ))}
              </div>
              <div className="tw-ml-auto">
                <div className="tw-flex tw-gap-1.5">
                  <input
                    type="text"
                    placeholder="Path"
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && pathInput) loadDirectory(pathInput); }}
                    className="tw-min-w-[280px] tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
                    style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
                  />
                  <button
                    className="tw-inline-flex tw-items-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2 tw-py-1 tw-text-sm tw-text-neutral-100 hover:tw-bg-neutral-800"
                    onClick={() => pathInput && loadDirectory(pathInput)}
                  >
                    Go
                  </button>
                  <input
                    type="text"
                    placeholder="Filter"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="tw-min-w-[140px] tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
                    style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
                  />
                </div>
              </div>
            </div>

            <div className="tw-mt-2">
              {/* Header */}
              <div className="tw-grid tw-grid-cols-[80px_1fr_120px_180px] tw-px-2 tw-py-1.5 tw-text-[#aaa] tw-border-b tw-border-[#333]">
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
                        className="tw-grid tw-grid-cols-[80px_1fr_120px_180px] tw-p-2 tw-cursor-default tw-items-center hover:tw-bg-neutral-800/40"
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
                        <div className={it.isDirectory ? 'tw-text-[#7fbfff]' : 'tw-text-white'}>{it.name}</div>
                        <div className="tw-capitalize tw-text-[#ccc]">{typeof type === 'string' ? type : ''}</div>
                        <div className="tw-text-[#aaa]">{modified}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        );

            case 'effects':
        return (
          <div className="tw-p-2 tw-space-y-3">
            <div className="tw-flex tw-items-center tw-gap-2">
              <input
                type="text"
                placeholder="Search effects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="tw-min-w-[240px] tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
                style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
              />
            </div>
            <div className="tw-space-y-4">
              <div>
                <h3 className="tw-text-sm tw-font-semibold tw-text-neutral-300">Visual Effects</h3>
                <div className="tw-grid md:tw-grid-cols-2 xl:tw-grid-cols-3 tw-gap-2">
                  {visualEffects.map((effect) => (
                    <div
                      key={effect.id}
                      className={`tw-rounded tw-border tw-p-3 tw-bg-neutral-900 tw-border-neutral-800 hover:tw-bg-neutral-800 tw-cursor-pointer ${selectedItem?.id === effect.id ? 'tw-ring-2 tw-ring-sky-600' : ''}`}
                      onClick={() => handleItemSelect(effect)}
                      draggable
                      onDragStart={(e) => handleItemDrag(e, effect, 'effect')}
                    >
                      <div className="tw-text-neutral-100 tw-font-medium">{effect.name}</div>
                      <div className="tw-text-neutral-400 tw-text-sm tw-mt-0.5">{effect.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

            case 'sources':
        return (
          <div className="tw-p-2 tw-space-y-3">
            <div className="tw-flex tw-items-center tw-gap-2">
              <input
                type="text"
                placeholder="Search sources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="tw-min-w-[240px] tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
                style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
              />
            </div>
            <div className="tw-space-y-4">
              <div>
                <h3 className="tw-text-sm tw-font-semibold tw-text-neutral-300">Generative Sources</h3>
                <div className="tw-grid md:tw-grid-cols-2 xl:tw-grid-cols-3 tw-gap-2">
                  {generativeSources.map((effect) => (
                    <div
                      key={effect.id}
                      className={`tw-rounded tw-border tw-p-3 tw-bg-neutral-900 tw-border-neutral-800 hover:tw-bg-neutral-800 tw-cursor-pointer ${selectedItem?.id === effect.id ? 'tw-ring-2 tw-ring-sky-600' : ''}`}
                      onClick={() => handleItemSelect(effect)}
                      draggable
                      onDragStart={(e) => handleItemDrag(e, effect, 'source')}
                    >
                      <div className="tw-text-neutral-100 tw-font-medium">{effect.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'midi':
        return (
          <div className="tw-p-4 tw-space-y-3">
            <h3 className="tw-text-sm tw-font-semibold tw-text-neutral-300">MIDI Mapping</h3>
            <p className="tw-text-neutral-400">Configure MIDI controllers and mappings for your composition.</p>
            <div className="tw-space-y-3">
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <label className="tw-text-sm tw-text-neutral-300">MIDI Input Device:</label>
                <div className="tw-max-w-[260px]">
                  <Select value={'none'} onChange={() => {}} options={[{ value: 'none', label: 'No devices detected' }]} />
                </div>
              </div>
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <label className="tw-text-sm tw-text-neutral-300">MIDI Channel:</label>
                <div className="tw-max-w-[220px]">
                  <Select value={'all'} onChange={() => {}} options={[{ value: 'all', label: 'All Channels' }, { value: '1', label: 'Channel 1' }, { value: '2', label: 'Channel 2' }]} />
                </div>
              </div>
            </div>
          </div>
        );

      case 'lfo':
        return (
          <div className="tw-p-4 tw-space-y-3">
            <h3 className="tw-text-sm tw-font-semibold tw-text-neutral-300">LFO (Low Frequency Oscillator)</h3>
            <p className="tw-text-neutral-400">Create automated parameter animations and modulations.</p>
            <div className="tw-grid tw-grid-cols-3 tw-gap-2">
              <div className="tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-200 tw-px-3 tw-py-2 hover:tw-bg-neutral-800 tw-cursor-pointer" onClick={() => handleItemSelect({ id: 'sine', name: 'Sine Wave', type: 'lfo' })}>
                Sine Wave
              </div>
              <div className="tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-200 tw-px-3 tw-py-2 hover:tw-bg-neutral-800 tw-cursor-pointer" onClick={() => handleItemSelect({ id: 'square', name: 'Square Wave', type: 'lfo' })}>
                Square Wave
              </div>
              <div className="tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-200 tw-px-3 tw-py-2 hover:tw-bg-neutral-800 tw-cursor-pointer" onClick={() => handleItemSelect({ id: 'random', name: 'Random', type: 'lfo' })}>
                Random
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-bg-neutral-900 tw-text-white">
      <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
        <h2 className="tw-text-lg tw-font-semibold">Media Browser</h2>
        <button onClick={handleClose} className="tw-border tw-border-neutral-700 tw-text-neutral-300 tw-w-8 tw-h-8 hover:tw-bg-neutral-800">×</button>
      </div>
      
      <div className="tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TabType)}>
          <TabsList>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="effects">Effects</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="midi">MIDI</TabsTrigger>
            <TabsTrigger value="lfo">LFO</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="tw-flex-1 tw-overflow-auto tw-p-2">
        {renderTabContent()}
      </div>

      {selectedItem && (
        <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-t tw-border-neutral-800">
          <div className="tw-flex tw-gap-2 tw-text-sm">
            <span className="tw-font-semibold">{selectedItem.name}</span>
            <span className="tw-text-neutral-400">{selectedItem.type}</span>
          </div>
          
          <div className="tw-flex tw-gap-2">
            <button onClick={handlePreview} className="tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-3 tw-py-1.5 hover:tw-bg-neutral-700">
              Preview
            </button>
            <button onClick={handleAddToLayer} className="tw-border tw-border-neutral-700 tw-bg-neutral-700 tw-text-white tw-px-3 tw-py-1.5 hover:tw-bg-neutral-600">
              Add to Layer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
