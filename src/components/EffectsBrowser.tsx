import React, { useEffect, useMemo, useState } from 'react';
import { Cross2Icon, HeartIcon, HeartFilledIcon } from '@radix-ui/react-icons';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui';
import { UserEffectsLoader } from './UserEffectsLoader';

interface EffectsBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

type LightEffect = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  author: string;
  version: string;
  metadata: { folder?: string; isSource?: boolean; isUserEffect?: boolean; [key: string]: any };
  fileKey?: string;
};

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose }) => {
  const isElectron = (() => {
    try {
      return typeof window !== 'undefined' && !!(window as any).electron;
    } catch {
      return false;
    }
  })();
  const showLibraryTab = isElectron;
  const showBundledTab = !isElectron;
  const FAVORITES_KEY = 'vj-effect-favorites';
  const BUNDLED_TAB_KEY = 'vj-bundled-last-tab';
  const [isLoading, setIsLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Discovering effects...');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'sources' | 'user' | 'external' | 'favorites'>(() => {
    try {
      const stored = localStorage.getItem(BUNDLED_TAB_KEY) as 'user' | 'external' | null;
      if (stored === 'user' && showLibraryTab) return 'user';
      if (stored === 'external' && showBundledTab) return 'external';
    } catch {}
    if (showLibraryTab) return 'user';
    if (showBundledTab) return 'external';
    return 'favorites';
  });
  const [externalFilter, setExternalFilter] = useState<'all' | 'effects' | 'sources'>('all');
  const [userFilter, setUserFilter] = useState<'all' | 'effects' | 'sources'>('all');
  const [favoritesFilter, setFavoritesFilter] = useState<'all' | 'effects' | 'sources'>('all');
  const [effects, setEffects] = useState<LightEffect[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [userEffectsLoaderOpen, setUserEffectsLoaderOpen] = useState(false);

  const refreshEffects = async () => {
    let mounted = true;
    try {
      setIsLoading(true);
      setLoadingText('Refreshing effects...');
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      try {
        const enabled = localStorage.getItem('vj-autoload-user-effects-enabled') === '1';
        const dir = localStorage.getItem('vj-fx-user-dir') || '';
        if (enabled && dir) {
          await discovery.loadUserEffectsFromDirectory(dir);
        }
      } catch {}
      const light = await discovery.listAvailableEffectsFromFilesystem();
      if (!mounted) return;
      const mapped: LightEffect[] = light.map((e: any) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        category: e.category,
        icon: e.icon,
        author: e.author,
        version: e.version,
        metadata: e.metadata as any,
        fileKey: e.fileKey,
      }));
      setEffects(mapped);
    } catch (err) {
      console.warn('EffectsBrowser: discovery failed', err);
      if (mounted) setEffects([]);
    } finally {
      if (mounted) setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshEffects();
    const handler = () => refreshEffects();
    window.addEventListener('vj-bundled-updated', handler as any);
    return () => { window.removeEventListener('vj-bundled-updated', handler as any); };
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setFavorites(parsed as string[]);
      }
    } catch {}
  }, []);

  const persistFavorites = (next: string[]) => {
    setFavorites(next);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
  };

  const effectKey = (e: LightEffect) => e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`;
  const displayName = (name: string) => (name || '').replace(/\s*\(External\)\s*$/i, '').trim();
  const hasCachedUserEffectCode = (id: string) => {
    const key = String(id || '').trim();
    if (!key) return false;
    try {
      const v = localStorage.getItem(`vj-user-effect-code:${key}`);
      return typeof v === 'string' && v.trim().length > 0;
    } catch {
      return false;
    }
  };
  const isAIGeneratedTemp = (e: LightEffect) => {
    const src = String(e?.fileKey || (e as any)?.metadata?.sourcePath || '').toLowerCase();
    return (
      src.includes('ai-live-edit.js') ||
      src.startsWith('ai-cache/') ||
      src.includes('ai-generated-') ||
      (src.includes('ai') && src.includes('cache'))
    );
  };
  const canRemoveFromBank = (e: LightEffect) => {
    // Show remove only for items that are backed by cached user-effect code
    // (typical for AI-generated effects, including those rehydrated when loading a set).
    // This also safely covers cases where a cached AI effect "overlays" a bank effect id.
    return isAIGeneratedTemp(e) || hasCachedUserEffectCode(e.id);
  };

  const toggleFavorite = (e: LightEffect) => {
    const key = effectKey(e);
    if (!key) return;
    const set = new Set(favorites);
    if (set.has(key)) set.delete(key); else set.add(key);
    persistFavorites(Array.from(set));
  };

  const removeFromBank = async (e: LightEffect) => {
    try {
      // Remove from favorites if it was favorited (prevents ghost entries in Favorites tab)
      try {
        const k = effectKey(e);
        if (k && favorites.includes(k)) {
          persistFavorites(favorites.filter((x) => x !== k));
        }
      } catch {}

      // Remove persisted code so it doesn't rehydrate on reload/preset load
      try {
        localStorage.removeItem(`vj-user-effect-code:${String(e.id)}`);
      } catch {}

      // Special-case: if this is the "last AI live edit", also clear the restore cache
      try {
        const src = String(e.fileKey || '').toLowerCase();
        if (src.includes('ai-live-edit.js')) {
          localStorage.removeItem('vj-ai-last-code');
          localStorage.removeItem('vj-user-effect-code:user-ai-live-edit');
        }
      } catch {}

      // Remove from EffectDiscovery registry so it disappears from the Library list
      try {
        const { EffectDiscovery } = await import('../utils/EffectDiscovery');
        const discovery = EffectDiscovery.getInstance();
        await discovery.removeUserEffect(String(e.id), String(e.fileKey || ''));
      } catch {}

      // Optimistically remove from current list and refresh to ensure consistency
      try {
        const k = effectKey(e);
        setEffects((prev) => prev.filter((x) => effectKey(x) !== k));
      } catch {}
      refreshEffects();
    } catch {}
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return effects;
    return effects.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q)
    );
  }, [effects, search]);

  const isBundledEffect = (e: LightEffect) => {
    if (!showBundledTab) return false;
    const src = (e as any)?.fileKey || '';
    const isSystem = e?.metadata?.isUserEffect === false;
    const looksLikeBundledPath = typeof src === 'string' && (src.includes('bundled/') || src.startsWith('effects/') || src.startsWith('sources/'));
    return isSystem || looksLikeBundledPath;
  };

  const visualEffectsAll = filtered.filter((e) => !(e.metadata?.isSource || e.metadata?.folder === 'sources') && !e.metadata?.isUserEffect && !isBundledEffect(e));
  const generativeSourcesAll = filtered.filter((e) => (e.metadata?.isSource || e.metadata?.folder === 'sources') && !e.metadata?.isUserEffect && !isBundledEffect(e));
  const userEffectsAll = filtered.filter((e) => e.metadata?.isUserEffect && !isBundledEffect(e));
  const bundledAll = filtered.filter((e) => isBundledEffect(e));

  const visualEffects = Array.from(
    visualEffectsAll.reduce((map, e) => {
      const existing = map.get(e.id);
      if (!existing) {
        map.set(e.id, e);
      } else {
        const preferCurrent = (e.metadata?.folder === 'effects') && existing.metadata?.folder !== 'effects';
        if (preferCurrent) map.set(e.id, e);
      }
      return map;
    }, new Map<string, LightEffect>()).values()
  );

  const generativeSources = Array.from(
    generativeSourcesAll.reduce((map, e) => {
      const existing = map.get(e.id);
      if (!existing) {
        map.set(e.id, e);
      } else {
        const preferCurrent = (e.metadata?.folder === 'sources') && existing.metadata?.folder !== 'sources';
        if (preferCurrent) map.set(e.id, e);
      }
      return map;
    }, new Map<string, LightEffect>()).values()
  );

  const userEffects = Array.from(
    userEffectsAll.reduce((map, e) => {
      const norm = (e.name || '').replace(/\s*\(User\)\s*$/i, '').toLowerCase();
      const existing = map.get(norm);
      if (!existing) {
        map.set(norm, e);
      } else {
        const existingHasSuffix = /\(User\)\s*$/i.test(existing.name || '');
        const currentHasSuffix = /\(User\)\s*$/i.test(e.name || '');
        if (existingHasSuffix && !currentHasSuffix) {
          map.set(norm, e);
        }
      }
      return map;
    }, new Map<string, LightEffect>()).values()
  );

  const userFiltered = useMemo(() => {
    if (userFilter === 'effects') return userEffects.filter((e) => !e.metadata?.isSource);
    if (userFilter === 'sources') return userEffects.filter((e) => !!e.metadata?.isSource);
    return userEffects;
  }, [userEffects, userFilter]);

  const bundledEffects = Array.from(
    bundledAll.reduce((map, e) => {
      const existing = map.get(e.id);
      if (!existing) map.set(e.id, e);
      return map;
    }, new Map<string, LightEffect>()).values()
  );

  const externalFiltered = useMemo(() => {
    if (externalFilter === 'effects') return bundledEffects.filter((e) => !e.metadata?.isSource);
    if (externalFilter === 'sources') return bundledEffects.filter((e) => !!e.metadata?.isSource);
    return bundledEffects;
  }, [bundledEffects, externalFilter]);

  const favoritedAll = useMemo(() => {
    const onlyFaved = filtered.filter((e) => favorites.includes(effectKey(e)));
    const map = new Map<string, LightEffect>();
    for (const e of onlyFaved) {
      const key = effectKey(e);
      if (!map.has(key)) map.set(key, e);
    }
    return Array.from(map.values());
  }, [filtered, favorites]);

  const favoritedEffects = useMemo(
    () => favoritedAll.filter((e) => !(e.metadata?.isSource || e.metadata?.folder === 'sources')),
    [favoritedAll]
  );
  const favoritedSources = useMemo(
    () => favoritedAll.filter((e) => (e.metadata?.isSource || e.metadata?.folder === 'sources')),
    [favoritedAll]
  );

  const favoritesFiltered = useMemo(() => {
    if (favoritesFilter === 'effects') return favoritedEffects;
    if (favoritesFilter === 'sources') return favoritedSources;
    return favoritedAll;
  }, [favoritedAll, favoritedEffects, favoritedSources, favoritesFilter]);

  if (isLoading) {
    return (
      <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
        <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center tw-p-6">
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-2">
            <div className="tw-h-6 tw-w-6 tw-animate-spin tw-rounded-full tw-border-2 tw-border-neutral-600 tw-border-t-transparent" />
            <div className="tw-text-sm">{loadingText}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
      <div className="tw-mb-2">
        <Tabs value={activeTab} onValueChange={(v) => {
          const val = v as 'user' | 'external' | 'favorites';
          setActiveTab(val);
          if ((val === 'user' && showLibraryTab) || (val === 'external' && showBundledTab)) {
            try { localStorage.setItem(BUNDLED_TAB_KEY, val); } catch {}
          }
        }}>
          <TabsList>
            {showLibraryTab && (<TabsTrigger value="user">Library</TabsTrigger>)}
            {showBundledTab && (<TabsTrigger value="external">Bundled</TabsTrigger>)}
            <TabsTrigger value="favorites" title="Favorites">
              {activeTab === 'favorites' ? (
                <HeartFilledIcon className="tw-w-4 tw-h-4" />
              ) : (
                <HeartIcon className="tw-w-4 tw-h-4" />
              )}
            </TabsTrigger>
          </TabsList>
          {showLibraryTab && (<TabsContent value="user" />)}
          {showBundledTab && (<TabsContent value="external" />)}
          <TabsContent value="favorites" />
        </Tabs>
      </div>
      <div className="tw-px-3 tw-pb-2 tw-flex tw-gap-2">
        <input
          type="text"
          placeholder="Search effects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tw-flex-1 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
        />
        <button
          type="button"
          onClick={refreshEffects}
          disabled={isLoading}
          title="Refresh effects list"
          className="param-btn tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-w-5 tw-h-5 xl:tw-w-6 xl:tw-h-6 leading-[1] hover:tw-bg-neutral-700"
        >
          {isLoading ? '⟳' : '↻'}
        </button>
      </div>
      <div className="tw-flex-1 tw-overflow-auto tw-p-3">
        <Tabs value={activeTab} onValueChange={(v) => {
          const val = v as 'user' | 'external' | 'favorites';
          setActiveTab(val);
          if ((val === 'user' && showLibraryTab) || (val === 'external' && showBundledTab)) {
            try { localStorage.setItem(BUNDLED_TAB_KEY, val); } catch {}
          }
        }}>
          {showLibraryTab && (
          <TabsContent value="user">
            <div className="tw-space-y-2">
              <div className="tw-mb-1">
                <div className="tw-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${userFilter==='all' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setUserFilter('all')}
                  >All {userEffects.length}</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${userFilter==='effects' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setUserFilter('effects')}
                  >Effects {userEffects.filter((e) => !e.metadata?.isSource).length}</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${userFilter==='sources' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setUserFilter('sources')}
                  >Sources {userEffects.filter((e) => !!e.metadata?.isSource).length}</button>
                </div>
              </div>
              {userEffects.length === 0 && (
                <div className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-6 tw-text-center">
                  <h3 className="tw-text-lg tw-font-semibold tw-mb-1">No User Effects Loaded</h3>
                  <p>Set a User FX Directory in Settings to auto-load on startup.</p>
                </div>
              )}
              {userFiltered.map((e) => (
                <div
                  key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                  className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                  draggable
                  onDragStart={(ev) => {
                    const payload = {
                      type: 'effect', isEffect: true, id: e.id, name: e.name,
                      description: e.description, category: e.category, icon: e.icon,
                      metadata: e.metadata, assetType: 'effect', isSource: e.metadata?.isSource || false,
                    };
                    try {
                      ev.dataTransfer.effectAllowed = 'copy';
                      // Some Chromium/Electron builds are picky about custom MIME types; include text/plain too.
                      ev.dataTransfer.setData('text/plain', JSON.stringify(payload));
                    } catch {}
                    ev.dataTransfer.setData('application/json', JSON.stringify(payload));
                  }}
                  title={`${e.name}: ${e.description} (Author: ${e.author})`}
                >
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <div>
                      <div className="tw-text-sm tw-font-medium tw-text-left">{displayName(e.name)}</div>
                      <div className="tw-text-xs ">by {e.author}</div>
                    </div>
                    <div className="tw-flex tw-items-center tw-gap-1">
                      {canRemoveFromBank(e) ? (
                        <button
                          onMouseDown={(ev) => { ev.stopPropagation(); }}
                          onClick={(ev) => { ev.stopPropagation(); void removeFromBank(e); }}
                          className={'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1 tw-text-red-400 hover:tw-text-red-300'}
                          title="Remove from bank"
                        >
                          <Cross2Icon className="tw-w-4 tw-h-4" />
                        </button>
                      ) : null}
                      <button
                        onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }}
                        className={'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1'}
                        title={favorites.includes(effectKey(e)) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favorites.includes(effectKey(e)) ? (
                          <HeartFilledIcon className="tw-w-4 tw-h-4 " />
                        ) : (
                          <HeartIcon className="tw-w-4 tw-h-4 " />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          )}
          {showBundledTab && (
          <TabsContent value="external">
            <div className="tw-space-y-2">
              <div className="tw-mb-1">
                <div className="tw-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${externalFilter==='all' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setExternalFilter('all')}
                  >All {bundledEffects.length}</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${externalFilter==='effects' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setExternalFilter('effects')}
                  >Effects {bundledEffects.filter((e) => !e.metadata?.isSource).length}</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${externalFilter==='sources' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setExternalFilter('sources')}
                  >Sources {bundledEffects.filter((e) => !!e.metadata?.isSource).length}</button>
                </div>
              </div>
              {bundledEffects.length === 0 && (
                <div className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-6 tw-text-center">
                  <h3 className="tw-text-lg tw-font-semibold tw-mb-1">No Bundled items</h3>
                  <p>Bundled effects will appear here.</p>
                </div>
              )}
              {externalFiltered.map((e) => (
                <div
                  key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                  className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                  draggable
                  onDragStart={(ev) => {
                    const payload = {
                      type: 'effect', isEffect: true, id: e.id, name: e.name,
                      description: e.description, category: e.category, icon: e.icon,
                      metadata: e.metadata, assetType: 'effect', isSource: e.metadata?.isSource || false,
                    };
                    try {
                      ev.dataTransfer.effectAllowed = 'copy';
                      ev.dataTransfer.setData('text/plain', JSON.stringify(payload));
                    } catch {}
                    ev.dataTransfer.setData('application/json', JSON.stringify(payload));
                  }}
                  title={`${e.name}: ${e.description}`}
                >
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <div className="tw-text-sm tw-font-medium tw-text-left">{displayName(e.name)}</div>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }}
                      className={'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1'}
                      title={favorites.includes(effectKey(e)) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {favorites.includes(effectKey(e)) ? (
                        <HeartFilledIcon className="tw-w-4 tw-h-4 " />
                      ) : (
                        <HeartIcon className="tw-w-4 tw-h-4 " />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          )}
          <TabsContent value="favorites">
            <div className="tw-space-y-2">
              <div className="tw-mb-1">
                <div className="tw-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${favoritesFilter==='all' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setFavoritesFilter('all')}
                  >All {favoritedAll.length}</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${favoritesFilter==='effects' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setFavoritesFilter('effects')}
                  >Effects {favoritedEffects.length}</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${favoritesFilter==='sources' ? 'tw-bg-neutral-700 tw-border-neutral-700 ' : 'tw-bg-neutral-800  tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setFavoritesFilter('sources')}
                  >Sources {favoritedSources.length}</button>
                </div>
              </div>
              {favoritedAll.length === 0 && (
                <div className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-6 tw-text-center">
                  <div className="tw-text-sm">No favorites yet.</div>
                </div>
              )}
              {favoritesFiltered.map((e) => (
                <div
                  key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                  className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                  draggable
                  onDragStart={(ev) => {
                    const payload = {
                      type: 'effect', isEffect: true, id: e.id, name: e.name,
                      description: e.description, category: e.category, icon: e.icon,
                      metadata: e.metadata, assetType: 'effect', isSource: e.metadata?.isSource || false,
                    };
                    try {
                      ev.dataTransfer.effectAllowed = 'copy';
                      ev.dataTransfer.setData('text/plain', JSON.stringify(payload));
                    } catch {}
                    ev.dataTransfer.setData('application/json', JSON.stringify(payload));
                  }}
                  title={`${e.name}: ${e.description}`}
                >
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <div>
                      <div className="tw-text-sm tw-font-medium tw-text-left">{displayName(e.name)}</div>
                      {e.author ? (<div className="tw-text-xs ">by {e.author}</div>) : null}
                    </div>
                    <div className="tw-flex tw-items-center tw-gap-1">
                      {canRemoveFromBank(e) ? (
                        <button
                          onMouseDown={(ev) => { ev.stopPropagation(); }}
                          onClick={(ev) => { ev.stopPropagation(); void removeFromBank(e); }}
                          className={'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1 tw-text-red-400 hover:tw-text-red-300'}
                          title="Remove from bank"
                        >
                          <Cross2Icon className="tw-w-4 tw-h-4" />
                        </button>
                      ) : null}
                      <button
                        onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }}
                        className={'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1'}
                        title={favorites.includes(effectKey(e)) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favorites.includes(effectKey(e)) ? (
                          <HeartFilledIcon className="tw-w-4 tw-h-4 " />
                        ) : (
                          <HeartIcon className="tw-w-4 tw-h-4 " />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <UserEffectsLoader
        open={userEffectsLoaderOpen}
        onOpenChange={setUserEffectsLoaderOpen}
        onEffectsLoaded={(count) => {
          console.log(`Loaded ${count} user effects`);
          refreshEffects();
        }}
      />
    </div>
  );
};

export default EffectsBrowser;