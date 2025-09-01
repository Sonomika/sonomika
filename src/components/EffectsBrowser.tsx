import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui';

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
  metadata: { folder?: string; isSource?: boolean; [key: string]: any };
  fileKey?: string;
};

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Discovering effects...');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'sources'>('effects');
  const [effects, setEffects] = useState<LightEffect[]>([]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setIsLoading(true);
        setLoadingText('Discovering effects...');
        const { EffectDiscovery } = await import('../utils/EffectDiscovery');
        const discovery = EffectDiscovery.getInstance();
        const light = await discovery.listAvailableEffectsLightweight();
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
    run();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return effects;
    return effects.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q)
    );
  }, [effects, search]);

  const visualEffectsAll = filtered.filter((e) => !(e.metadata?.isSource || e.metadata?.folder === 'sources'));
  const generativeSourcesAll = filtered.filter((e) => e.metadata?.isSource || e.metadata?.folder === 'sources');

  const visualEffects = Array.from(
    visualEffectsAll.reduce((map, e) => {
      const existing = map.get(e.id);
      if (!existing) {
        map.set(e.id, e);
      } else {
        const preferCurrent = (e.metadata?.folder === 'visual-effects') && existing.metadata?.folder !== 'visual-effects';
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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'effects' | 'sources')}>
          <TabsList>
            <TabsTrigger value="effects">Visual Effects</TabsTrigger>
            <TabsTrigger value="sources">Generative Sources</TabsTrigger>
          </TabsList>
          <TabsContent value="effects" />
          <TabsContent value="sources" />
        </Tabs>
      </div>
      <div className="tw-px-3 tw-pb-2">
        <input
          type="text"
          placeholder="Search effects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tw-w-full tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
        />
      </div>
      <div className="tw-flex-1 tw-overflow-auto tw-p-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'effects' | 'sources')}>
          <TabsContent value="effects">
            <div className="tw-space-y-2">
              {visualEffects.map((e) => (
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
                  <div className="tw-text-sm tw-font-medium tw-text-left">{e.name}</div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="sources">
            <div className="tw-space-y-2">
              {generativeSources.map((e) => (
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
                  <div className="tw-text-sm tw-font-medium tw-text-left">{e.name}</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EffectsBrowser;