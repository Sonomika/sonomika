import React, { useEffect, useMemo, useState } from 'react';
import { HeartIcon, HeartFilledIcon, PlusIcon } from '@radix-ui/react-icons';
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
  const FAVORITES_KEY = 'vj-effect-favorites';
  const BANK_TAB_KEY = 'vj-bank-last-tab';
  const [isLoading, setIsLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Discovering effects...');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'sources' | 'user' | 'external' | 'favorites'>(() => {
    try {
      const stored = localStorage.getItem(BANK_TAB_KEY) as 'user' | 'external' | null;
      if (stored === 'user' || stored === 'external') return stored;
    } catch {}
    return 'external';
  });
  const [externalFilter, setExternalFilter] = useState<'all' | 'effects' | 'sources'>('all');
  const [userFilter, setUserFilter] = useState<'all' | 'effects' | 'sources'>('all');
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
      // Ensure user FX are autoloaded before listing
      try {
        const enabled = localStorage.getItem('vj-autoload-user-effects-enabled') === '1';
        const dir = localStorage.getItem('vj-fx-user-dir') || '';
        if (enabled && dir) {
          await discovery.loadUserEffectsFromDirectory(dir);
        }
      } catch {}
      // Prefer filesystem-based discovery in Electron for immediate detection of new files
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
    window.addEventListener('vj-bank-updated', handler as any);
    return () => { window.removeEventListener('vj-bank-updated', handler as any); };
  }, []);

  // Load favorites from localStorage once
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

  // Utility: clean display name by removing trailing "(External)" and redundant whitespace
  const displayName = (name: string) => (name || '').replace(/\s*\(External\)\s*$/i, '').trim();

  const toggleFavorite = (e: LightEffect) => {
    const key = effectKey(e);
    if (!key) return;
    const set = new Set(favorites);
    if (set.has(key)) set.delete(key); else set.add(key);
    persistFavorites(Array.from(set));
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

  const isExternalBank = (e: LightEffect) => {
    const src = (e as any)?.fileKey || '';
    return typeof src === 'string' && src.includes('bank/');
  };

  const visualEffectsAll = filtered.filter((e) => !(e.metadata?.isSource || e.metadata?.folder === 'sources') && !e.metadata?.isUserEffect && !isExternalBank(e));
  const generativeSourcesAll = filtered.filter((e) => (e.metadata?.isSource || e.metadata?.folder === 'sources') && !e.metadata?.isUserEffect && !isExternalBank(e));
  const userEffectsAll = filtered.filter((e) => e.metadata?.isUserEffect && !isExternalBank(e));
  const externalBankAll = filtered.filter((e) => isExternalBank(e));

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

  const externalBankEffects = Array.from(
    externalBankAll.reduce((map, e) => {
      const existing = map.get(e.id);
      if (!existing) map.set(e.id, e);
      return map;
    }, new Map<string, LightEffect>()).values()
  );

  const externalFiltered = useMemo(() => {
    if (externalFilter === 'effects') return externalBankEffects.filter((e) => !e.metadata?.isSource);
    if (externalFilter === 'sources') return externalBankEffects.filter((e) => !!e.metadata?.isSource);
    return externalBankEffects;
  }, [externalBankEffects, externalFilter]);

  const favoritedVisualEffects = visualEffects.filter((e) => favorites.includes(effectKey(e)));
  const favoritedGenerativeSources = generativeSources.filter((e) => favorites.includes(effectKey(e)));
  const favoritedUserEffects = userEffects.filter((e) => favorites.includes(effectKey(e)));

  if (isLoading) {
    return (
      <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-text-neutral-100 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
        <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center tw-p-6">
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-2">
            <div className="tw-h-6 tw-w-6 tw-animate-spin tw-rounded-full tw-border-2 tw-border-neutral-600 tw-border-t-transparent" />
            <div className="tw-text-sm tw-text-neutral-300">{loadingText}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && effects.length === 0) {
    return (
      <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-text-neutral-100 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
        <div className="tw-flex-1 tw-overflow-auto tw-p-4">
          <div className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-6 tw-text-center">
            <h3 className="tw-text-lg tw-font-semibold tw-mb-1">No Effects Found</h3>
            <p className="tw-text-neutral-300">No effects are available to display.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-text-neutral-100 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
      <div className="tw-mb-2">
        <Tabs value={activeTab} onValueChange={(v) => {
          const val = v as 'user' | 'external' | 'favorites';
          setActiveTab(val);
          if (val === 'user' || val === 'external') {
            try { localStorage.setItem(BANK_TAB_KEY, val); } catch {}
          }
        }}>
          <TabsList>
            <TabsTrigger value="external">System</TabsTrigger>
            <TabsTrigger value="user">User</TabsTrigger>
            <TabsTrigger value="favorites" title="Favorites">
              {activeTab === 'favorites' ? (
                <HeartFilledIcon className="tw-w-4 tw-h-4" />
              ) : (
                <HeartIcon className="tw-w-4 tw-h-4" />
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="user" />
          <TabsContent value="external" />
          <TabsContent value="favorites" />
        </Tabs>
      </div>
      <div className="tw-px-3 tw-pb-2 tw-flex tw-gap-2">
        <input
          type="text"
          placeholder="Search effects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tw-flex-1 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
        />
        {/* Refresh effects using compact param button styling */}
        <button
          type="button"
          onClick={refreshEffects}
          disabled={isLoading}
          title="Refresh effects list"
          className="param-btn tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-w-5 tw-h-5 xl:tw-w-6 xl:tw-h-6 leading-[1] hover:tw-bg-neutral-700"
        >
          {isLoading ? '⟳' : '↻'}
        </button>
      </div>
      <div className="tw-flex-1 tw-overflow-auto tw-p-3">
        <Tabs value={activeTab} onValueChange={(v) => {
          const val = v as 'user' | 'external' | 'favorites';
          setActiveTab(val);
          if (val === 'user' || val === 'external') {
            try { localStorage.setItem(BANK_TAB_KEY, val); } catch {}
          }
        }}>
          <TabsContent value="user">
            <div className="tw-space-y-2">
              <div className="tw-mb-1">
                <div className="tw-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${userFilter==='all' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setUserFilter('all')}
                  >All</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${userFilter==='effects' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setUserFilter('effects')}
                  >Effects</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${userFilter==='sources' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setUserFilter('sources')}
                  >Sources</button>
                </div>
              </div>
              {userEffects.length === 0 && (
                <div className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-6 tw-text-center">
                  <h3 className="tw-text-lg tw-font-semibold tw-mb-1">No User Effects Loaded</h3>
                  <p className="tw-text-neutral-300">Set a User FX Directory in Settings to auto-load on startup.</p>
                </div>
              )}
              {userFiltered.map((e) => (
                <div
                  key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                  className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'effect', isEffect: true, id: e.id, name: e.name,
                      description: e.description, category: e.category, icon: e.icon,
                      metadata: e.metadata, assetType: 'effect', isSource: e.metadata?.isSource || false,
                    }));
                  }}
                  title={`${e.name}: ${e.description} (Author: ${e.author})`}
                >
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <div>
                      <div className="tw-text-sm tw-font-medium tw-text-left">{displayName(e.name)}</div>
                      <div className="tw-text-xs tw-text-neutral-400">by {e.author}</div>
                    </div>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }}
                      className={
                        'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1'
                      }
                      title={favorites.includes(effectKey(e)) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {favorites.includes(effectKey(e)) ? (
                        <HeartFilledIcon className="tw-w-4 tw-h-4 tw-text-white" />
                      ) : (
                        <HeartIcon className="tw-w-4 tw-h-4 tw-text-neutral-400" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="external">
            <div className="tw-space-y-2">
              <div className="tw-mb-1">
                <div className="tw-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${externalFilter==='all' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setExternalFilter('all')}
                  >All</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${externalFilter==='effects' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setExternalFilter('effects')}
                  >Effects</button>
                  <button
                    className={`tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 ${externalFilter==='sources' ? 'tw-bg-neutral-700 tw-border-neutral-700 tw-text-white' : 'tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700'}`}
                    onClick={() => setExternalFilter('sources')}
                  >Sources</button>
                </div>
              </div>
              {externalBankEffects.length === 0 && (
                <div className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-6 tw-text-center">
                  <h3 className="tw-text-lg tw-font-semibold tw-mb-1">No System items</h3>
                  <p className="tw-text-neutral-300">Portable items in project bank will appear here.</p>
                </div>
              )}
              {externalFiltered.map((e) => (
                <div
                  key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                  className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'effect', isEffect: true, id: e.id, name: e.name,
                      description: e.description, category: e.category, icon: e.icon,
                      metadata: e.metadata, assetType: 'effect', isSource: e.metadata?.isSource || false,
                    }));
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
                        <HeartFilledIcon className="tw-w-4 tw-h-4 tw-text-white" />
                      ) : (
                        <HeartIcon className="tw-w-4 tw-h-4 tw-text-neutral-400" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="favorites">
            <div className="tw-space-y-3">
              <div>
                <div className="tw-text-xs tw-text-neutral-400 tw-mb-1">Effects</div>
                <div className="tw-space-y-2">
                  {favoritedVisualEffects.length === 0 && (
                    <div className="tw-text-xs tw-text-neutral-500">No favorited effects yet.</div>
                  )}
                  {favoritedVisualEffects.map((e) => (
                    <div
                      key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                      className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'effect', isEffect: true, id: e.id, name: e.name,
                          description: e.description, category: e.category, icon: e.icon,
                          metadata: e.metadata, assetType: 'effect', isSource: false,
                        }));
                      }}
                      title={`${e.name}: ${e.description}`}
                    >
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <div className="tw-text-sm tw-font-medium tw-text-left">{displayName(e.name)}</div>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }}
                          className={
                            'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1'
                          }
                          title={favorites.includes(effectKey(e)) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {favorites.includes(effectKey(e)) ? (
                            <HeartFilledIcon className="tw-w-4 tw-h-4 tw-text-white" />
                          ) : (
                            <HeartIcon className="tw-w-4 tw-h-4 tw-text-neutral-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="tw-text-xs tw-text-neutral-400 tw-mb-1">Sources</div>
                <div className="tw-space-y-2">
                  {favoritedGenerativeSources.length === 0 && (
                    <div className="tw-text-xs tw-text-neutral-500">No favorited sources yet.</div>
                  )}
                  {favoritedGenerativeSources.map((e) => (
                    <div
                      key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                      className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'effect', isEffect: true, id: e.id, name: e.name,
                          description: e.description, category: e.category, icon: e.icon,
                          metadata: e.metadata, assetType: 'effect', isSource: true,
                        }));
                      }}
                      title={`${e.name}: ${e.description}`}
                    >
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <div className="tw-text-sm tw-font-medium tw-text-left">{displayName(e.name)}</div>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }}
                          className={
                            'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1'
                          }
                          title={favorites.includes(effectKey(e)) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {favorites.includes(effectKey(e)) ? (
                            <HeartFilledIcon className="tw-w-4 tw-h-4 tw-text-white" />
                          ) : (
                            <HeartIcon className="tw-w-4 tw-h-4 tw-text-neutral-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="tw-text-xs tw-text-neutral-400 tw-mb-1">User</div>
                <div className="tw-space-y-2">
                  {favoritedUserEffects.length === 0 && (
                    <div className="tw-text-xs tw-text-neutral-500">No favorited user bank items yet.</div>
                  )}
                  {favoritedUserEffects.map((e) => (
                    <div
                      key={e.fileKey || `${e.id}:${e.metadata?.folder || 'other'}`}
                      className="tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-2 tw-cursor-pointer hover:tw-bg-neutral-800 tw-text-left"
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'effect', isEffect: true, id: e.id, name: e.name,
                          description: e.description, category: e.category, icon: e.icon,
                          metadata: e.metadata, assetType: 'effect', isSource: e.metadata?.isSource || false,
                        }));
                      }}
                      title={`${e.name}: ${e.description} (Author: ${e.author})`}
                    >
                      <div className="tw-flex tw-items-center tw-justify-between">
                        <div>
                          <div className="tw-text-sm tw-font-medium tw-text-left">{displayName(e.name)}</div>
                          <div className="tw-text-xs tw-text-neutral-400">by {e.author}</div>
                        </div>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }}
                          className={
                            'tw-inline-flex tw-items-center tw-justify-center tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 hover:tw-bg-neutral-800 tw-px-1.5 tw-py-1'
                          }
                          title={favorites.includes(effectKey(e)) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <HeartIcon className={`tw-w-4 tw-h-4 ${favorites.includes(effectKey(e)) ? 'tw-text-white' : 'tw-text-neutral-400'}`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <UserEffectsLoader
        open={userEffectsLoaderOpen}
        onOpenChange={setUserEffectsLoaderOpen}
        onEffectsLoaded={(count) => {
          console.log(`Loaded ${count} user effects`);
          refreshEffects(); // Refresh the effects list to show newly loaded effects
        }}
      />
    </div>
  );
};

export default EffectsBrowser;