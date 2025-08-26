import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Select } from './ui';
import { generateVideoThumbnail } from '../utils/ThumbnailCache';

type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  mtimeMs?: number;
};

type Favorite = { label: string; path: string };

const SUPPORTED_VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv']);
const SUPPORTED_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);
const SUPPORTED_AUDIO = new Set(['.mp3', '.wav', '.aiff', '.flac', '.ogg']);

const getExtension = (file: string): string => {
  const idx = file.lastIndexOf('.');
  return idx >= 0 ? file.slice(idx).toLowerCase() : '';
};

const classifyType = (fileName: string): 'video' | 'image' | 'audio' | 'other' => {
  const ext = getExtension(fileName);
  if (SUPPORTED_VIDEO.has(ext)) return 'video';
  if (SUPPORTED_IMAGE.has(ext)) return 'image';
  if (SUPPORTED_AUDIO.has(ext)) return 'audio';
  return 'other';
};

const FAVORITES_KEY = 'vj-file-favorites';
const LAST_PATH_KEY = 'vj-filebrowser-last-path';

// Local thumbnail cache to avoid flashes on re-mounts
const fileBrowserThumbCache = new Map<string, string>();

const FileBrowser: React.FC = () => {
  const fsApi = (window as any).fsApi || null;
  const sep: string = (fsApi && fsApi.sep) || '/';

  const [roots, setRoots] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [pathInput, setPathInput] = useState<string>('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [favLabel, setFavLabel] = useState<string>('');

  const loadDirectory = (dir: string) => {
    try {
      if (!fsApi) return;
      const items = (fsApi.listDirectory(dir) || []) as FileEntry[];
      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setEntries(items);
      setCurrentPath(dir);
      setPathInput(dir);
      try { localStorage.setItem(LAST_PATH_KEY, dir); } catch {}
    } catch (e) {
      console.warn('FileBrowser: failed to load directory', dir, e);
    }
  };

  const pathJoin = (...parts: string[]) => (fsApi?.join ? fsApi.join(...parts) : parts.join('/'));

  useEffect(() => {
    try {
      if (!fsApi) return;
      const detected = fsApi.roots ? (fsApi.roots() as string[]) : [sep];
      setRoots(detected);

      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        try { setFavorites(JSON.parse(stored) as Favorite[]); } catch {}
      } else {
        const favs: Favorite[] = [];
        const home = fsApi.homedir ? fsApi.homedir() : '';
        const exists = (p: string) => { try { return fsApi.exists ? fsApi.exists(p) : false; } catch { return false; } };
        const maybe = (label: string, p: string) => { if (p && exists(p)) favs.push({ label, path: p }); };
        maybe('Home', home);
        maybe('Desktop', pathJoin(home, 'Desktop'));
        maybe('Documents', pathJoin(home, 'Documents'));
        maybe('Downloads', pathJoin(home, 'Downloads'));
        setFavorites(favs);
      }

      const last = localStorage.getItem(LAST_PATH_KEY);
      const platform = fsApi.platform ? fsApi.platform() : 'unknown';
      const cRoot = `C:${sep}`;
      let start = '';
      if (last) start = last;
      else if (platform === 'win32' && fsApi.exists && fsApi.exists(cRoot)) start = cRoot;
      else if (detected[0]) start = detected[0];
      else start = sep;
      loadDirectory(start);
    } catch (e) {
      console.warn('FileBrowser: init error', e);
    }
  }, [fsApi]);

  const breadcrumb = useMemo(() => {
    if (!currentPath) return [] as Array<{ label: string; full: string }>;
    const parts = currentPath.split(sep).filter(Boolean);
    const crumbs: Array<{ label: string; full: string }> = [];
    let acc = currentPath.startsWith(sep) ? sep : '';
    parts.forEach((p) => {
      acc = acc ? pathJoin(acc, p) : p;
      crumbs.push({ label: p, full: acc });
    });
    return crumbs;
  }, [currentPath, sep]);

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split(sep).filter(Boolean);
    if (parts.length === 0) return;
    const parent = currentPath.endsWith(sep) && parts.length > 1
      ? parts.slice(0, parts.length - 1).join(sep)
      : currentPath.split(sep).slice(0, -1).join(sep);
    if (parent) loadDirectory(parent);
  };

  const filteredEntries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => e.name.toLowerCase().includes(q));
  }, [entries, filter]);

  const addFavorite = () => {
    const label = favLabel.trim() || currentPath;
    if (!currentPath) return;
    const exists = favorites.some(f => f.path === currentPath);
    if (exists) return;
    const next = [...favorites, { label, path: currentPath }];
    setFavorites(next);
    setFavLabel('');
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
  };

  const removeFavorite = (p: string) => {
    const next = favorites.filter(f => f.path !== p);
    setFavorites(next);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
  };

  const handleFileDrag = (e: React.DragEvent, item: FileEntry) => {
    if (item.isDirectory) return;
    const type = classifyType(item.name);
    if (type === 'other') return;
    const asset = {
      id: item.path,
      name: item.name,
      type,
      filePath: item.path,
      path: `local-file://${item.path}`,
      date: Date.now(),
      size: item.size,
    } as const;
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
  };

  const InlineThumb: React.FC<{ path: string }> = ({ path }) => {
    const normalized = path.startsWith('local-file://') ? path : `local-file://${path}`;
    const [thumb, setThumb] = useState<string>(() => fileBrowserThumbCache.get(normalized) || '');
    const [error, setError] = useState<string>('');
    const [isVisible, setIsVisible] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const thumbRef = useRef<HTMLDivElement>(null);
    const hasQueuedRef = useRef<boolean>(false);
    
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
      if (!isVisible || thumb || error || isGenerating || hasQueuedRef.current) return;
      hasQueuedRef.current = true;
      setIsGenerating(true);
      const thumbnailPath = normalized;
      const priority = 1;
      generateVideoThumbnail(thumbnailPath, { captureTimeSec: 0.1, width: 160, height: 90 }, priority)
        .then((url) => { 
          if (url.startsWith('data:image/jpeg;base64,')) {
            fileBrowserThumbCache.set(normalized, url);
            setThumb(url);
            setError('');
          } else {
            console.error('VideoThumb: Invalid thumbnail URL format for:', path, 'URL:', url.substring(0, 100));
            setError('Invalid thumbnail format');
          }
        })
        .catch((err) => { 
          console.error('VideoThumb: Failed to generate thumbnail for:', path, 'error:', err);
          setError(err.message || 'Thumbnail generation failed');
          setThumb('');
        })
        .finally(() => {
          setIsGenerating(false);
        });
    }, [isVisible, normalized, thumb, error, isGenerating]);
    
    if (error) {
      return (
        <div className="tw-w-[160px] tw-h-[90px] tw-bg-neutral-900 tw-rounded-[2px]" title={`Error: ${error}`} />
      );
    }
    
    if (thumb) {
      return (
        <img
          src={thumb}
          alt="thumbnail"
          draggable={false}
          className="tw-w-[160px] tw-h-[90px] tw-object-cover tw-rounded-[2px]"
          onError={() => {
            console.error('VideoThumb: Image failed to load for:', path, 'src:', thumb.substring(0, 100));
            setError('Image load failed');
          }}
        />
      );
    }
    
    return (
      <div ref={thumbRef} className="tw-w-[160px] tw-h-[90px] tw-bg-neutral-900 tw-rounded-[2px]" />
    );
  };

  const MemoInlineThumb = React.memo(InlineThumb);

  const ImageThumb: React.FC<{ path: string; name: string }> = ({ path, name }) => {
    const [loaded, setLoaded] = React.useState(false);
    return (
      <div className="tw-relative tw-w-[160px] tw-h-[90px]">
        <div className="tw-absolute tw-inset-0 tw-bg-[#111] tw-border tw-border-[#222]" />
        <img
          src={path}
          alt={name}
          className="tw-absolute tw-inset-0 tw-w-full tw-h-full tw-object-cover tw-rounded-[2px] tw-transition-opacity tw-duration-150"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          draggable={false}
          loading="lazy"
        />
      </div>
    );
  };

  const MemoImageThumb = React.memo(ImageThumb);

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-text-white">
      {!fsApi && (
        <div className="tw-bg-[#ff6b6b] tw-text-white tw-p-2 tw-text-sm tw-text-center tw-mb-2">
          File browser requires Electron. Run the app via Electron to access files.
        </div>
      )}

      <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap tw-mb-2">
        <button
          onClick={navigateUp}
          title="Up"
          className="tw-inline-flex tw-items-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2 tw-py-1 tw-text-sm tw-text-neutral-100 hover:tw-bg-neutral-800"
        >
          Up
        </button>

        {roots.length > 0 && (
          <div className="tw-min-w-[160px]">
            <Select
              value={'' as any}
              onChange={(val) => { const v = String(val); if (v) loadDirectory(v); }}
              options={[{ value: '', label: 'Drives' }, ...roots.map(r => ({ value: r, label: r }))]}
            />
          </div>
        )}

        {favorites.map((f) => (
          <div key={f.path} className="tw-inline-flex tw-items-center tw-gap-1">
            <button
              onClick={() => loadDirectory(f.path)}
              title={f.path}
              className="tw-inline-flex tw-items-center tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-px-2 tw-py-1 tw-text-sm tw-text-neutral-100 hover:tw-bg-neutral-800"
            >
              {f.label}
            </button>
            <button
              onClick={() => removeFavorite(f.path)}
              title="Remove favorite"
              className="tw-inline-flex tw-items-center tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-text-neutral-300 tw-px-1 tw-py-1 hover:tw-bg-neutral-800"
            >
              ×
            </button>
          </div>
        ))}

        <div className="tw-flex tw-items-center tw-gap-1 tw-ml-auto">
          <input
            type="text"
            placeholder="Path"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && pathInput) loadDirectory(pathInput); }}
            className="tw-min-w-[260px] tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
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
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="tw-min-w-[140px] tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
            style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
          />
        </div>
      </div>

      <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2 tw-flex-wrap">
        <div className="tw-flex tw-gap-1.5 tw-flex-wrap tw-items-center">
          {breadcrumb.map((c, i) => (
            <React.Fragment key={c.full}>
              <button className="tw-text-sm tw-text-sky-400 hover:tw-underline" onClick={() => loadDirectory(c.full)}>{c.label}</button>
              {i < breadcrumb.length - 1 && <span className="tw-text-neutral-500">/</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="tw-ml-auto tw-flex tw-items-center tw-gap-2">
          <input
            type="text"
            placeholder="Favorite label"
            value={favLabel}
            onChange={(e) => setFavLabel(e.target.value)}
            className="tw-min-w-[160px] tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2"
            style={{ ['--tw-ring-color' as any]: 'var(--accent)' }}
          />
          <button
            onClick={addFavorite}
            className="tw-inline-flex tw-items-center tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-white tw-px-2 tw-py-1 hover:tw-bg-neutral-700"
          >
            Save Favorite
          </button>
        </div>
      </div>

      <div className="tw-flex-1 tw-min-h-0 tw-overflow-auto tw-space-y-3">
        {/* Folders for navigation */}
        <div>
          {filteredEntries.filter(e => e.isDirectory).map((it) => (
            <div
              key={it.path}
              className="tw-grid tw-grid-cols-[1fr_120px_180px] tw-p-2 tw-cursor-default tw-items-center hover:tw-bg-neutral-800/40"
              onDoubleClick={() => loadDirectory(it.path)}
              title={it.path}
            >
              <div className="tw-text-[#7fbfff]">{it.name}</div>
              <div className="tw-text-[#ccc]">Folder</div>
              <div className="tw-text-[#aaa]">{it.mtimeMs ? new Date(it.mtimeMs).toLocaleString() : ''}</div>
            </div>
          ))}
        </div>

        {/* Media grid: only videos, images, audio */}
        <div className="tw-grid md:tw-grid-cols-3 xl:tw-grid-cols-4 tw-gap-2">
          {filteredEntries.filter(e => !e.isDirectory && classifyType(e.name) !== 'other').map((it) => {
            const type = classifyType(it.name);
            const localSrc = it.path.startsWith('local-file://') ? it.path : `local-file://${it.path}`;
            return (
              <div
                key={it.path}
                className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-space-y-2 hover:tw-bg-neutral-800 tw-cursor-pointer"
                draggable
                onDragStart={(e) => handleFileDrag(e, it)}
                title={it.path}
              >
                <div className="tw-flex tw-items-center tw-justify-center">
                  {type === 'video' && <MemoInlineThumb path={it.path} />}
                  {type === 'image' && (
                    <MemoImageThumb path={localSrc} name={it.name} />
                  )}
                  {type === 'audio' && (
                    <div className="tw-w-[160px] tw-h-[90px] tw-bg-[#111] tw-border tw-border-[#222] tw-flex tw-items-center tw-justify-center tw-text-[10px] tw-text-[#999]">
                      AUDIO
                    </div>
                  )}
                </div>
                <div className="tw-text-xs tw-truncate tw-text-neutral-200" title={it.name}>{it.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(FileBrowser);


