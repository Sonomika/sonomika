import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui';
import { getAllRegisteredEffects, getEffect } from '../utils/effectRegistry';
import { effectCache, CachedEffect } from '../utils/EffectCache';

interface EffectsBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

// Interface for the mapped effects with isSource property
interface MappedEffect {
  id: string;
  name: string;
  type: string;
  description: string;
  category: string;
  icon: string;
  author: string;
  version: string;
  metadata: any;
  isSource: boolean;
}

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose }) => {
  const [selectedEffect, setSelectedEffect] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'sources'>('effects');
  const [cachedEffects, setCachedEffects] = useState<CachedEffect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('Initializing...');

  // Use effect cache for much faster loading
  useEffect(() => {
    const loadEffects = async () => {
      setIsLoading(true);
      setLoadingProgress('Starting effect preloading...');
      
      try {
        // Check if effects are already preloaded
        if (effectCache.isEffectsPreloaded()) {
          console.log('🚀 EffectsBrowser: Using preloaded effects cache');
          setCachedEffects(effectCache.getCachedEffects());
          setIsLoading(false);
          return;
        }

        // Start preloading effects
        setLoadingProgress('Preloading effects...');
        await effectCache.startPreloading();
        
        // Get cached effects
        const effects = effectCache.getCachedEffects();
        setCachedEffects(effects.filter((effect): effect is CachedEffect => effect !== null));
        setLoadingProgress(`Loaded ${effects.length} effects`);
        
        console.log(`🔧 EffectsBrowser: Loaded ${effects.length} effects from cache`);
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
              icon: '',
              author: metadata.author || 'Unknown',
              version: metadata.version || '1.0.0',
              component: effectComponent,
              metadata,
              loadTime: 0
            };
          }).filter((effect) => effect !== null);
          
          setCachedEffects(effects);
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

  // Use cached effects for display (much faster than registry lookup)
  const allEffects: MappedEffect[] = cachedEffects.map(effect => ({
    id: effect.id,
    name: effect.name,
    type: 'threejs',
    description: effect.description,
    category: effect.category,
    icon: '',
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
  // const effectsByCategory = filteredEffects.reduce((acc, effect) => {
  //   if (!acc[effect.category]) {
  //     acc[effect.category] = [];
  //   }
  //   acc[effect.category].push(effect);
  //   return acc;
  // }, {} as Record<string, typeof allEffects>);

  const handleEffectSelect = (effect: any) => {
    setSelectedEffect(effect);
  };

  const handleEffectDrag = (e: React.DragEvent, effect: any) => {
    // Set the drag data in the format expected by the drop handlers
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'effect', // Always use 'effect' type for both effects and sources
      isEffect: true,
      id: effect.id,
      name: effect.name,
      description: effect.description,
      category: effect.category,
      icon: effect.icon,
      // Include the full effect object and metadata for proper handling
      effect: effect,
      metadata: effect.metadata, // Include metadata for parameters
      // Ensure the drop handler can access effect properties
      assetType: 'effect', // Always use 'effect' for proper detection
      isSource: effect.metadata?.folder === 'sources' || effect.metadata?.isSource === true
    }));
    console.log('🔧 Dragging effect:', effect);
  };

  const handleAddToLayer = () => {
    if (selectedEffect) {
      // This would typically add the effect to the current layer
      console.log('Adding effect to layer:', selectedEffect);
      // You can implement the logic to add the effect to the current layer here
    }
  };

  const handlePreview = () => {
    if (selectedEffect) {
      // This would typically open a preview of the effect
      console.log('Previewing effect:', selectedEffect);
      // You can implement the logic to preview the effect here
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  // Render different content based on loading state - all hooks called above
  if (isLoading) {
    return (
      <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-text-neutral-100 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
        <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
          <h2 className="tw-text-base tw-font-semibold">Effects Browser</h2>
          <button onClick={handleClose} className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center hover:tw-bg-neutral-800">×</button>
        </div>
        <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center tw-p-6">
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-2">
            <div className="tw-h-6 tw-w-6 tw-animate-spin tw-rounded-full tw-border-2 tw-border-neutral-600 tw-border-t-transparent" />
            <div className="tw-text-sm tw-text-neutral-300">{loadingProgress}</div>
          </div>
        </div>
      </div>
    );
  }

  // Show message if no effects are discovered
  if (allEffects.length === 0) {
    return (
      <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-text-neutral-100 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
        <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
          <h2 className="tw-text-base tw-font-semibold">Effects Browser</h2>
          <button onClick={handleClose} className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center hover:tw-bg-neutral-800">×</button>
        </div>
        <div className="tw-flex-1 tw-overflow-auto tw-p-4">
          <div className="tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-6 tw-text-center">
            <h3 className="tw-text-lg tw-font-semibold tw-mb-1">No Effects Found</h3>
            <p className="tw-text-neutral-300">The effects browser couldn't find any effects to display.</p>
            <p className="tw-text-neutral-400 tw-mt-2">This might be because:</p>
            <ul className="tw-text-left tw-text-neutral-300 tw-mt-2 tw-space-y-1 tw-list-disc tw-list-inside">
              <li>No effects are in the effects folder</li>
              <li>Effects are not properly registered</li>
              <li>The registry system is not working</li>
            </ul>
            <p className="tw-text-neutral-400 tw-mt-2">Check the browser console for more details about the registration process.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-flex tw-flex-col tw-bg-neutral-900 tw-text-neutral-100 tw-h-full tw-w-full tw-rounded-md tw-border tw-border-neutral-800">
      <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
        <div className="tw-flex tw-items-center tw-gap-3">
          <h2 className="tw-text-base tw-font-semibold">Effects Browser</h2>
          <div>
            <input
              type="text"
              placeholder="Search effects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="tw-w-64 tw-rounded tw-bg-neutral-900 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-2 tw-py-1 focus:tw-ring-2 focus:tw-ring-purple-600"
            />
          </div>
        </div>
        <button onClick={handleClose} className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center hover:tw-bg-neutral-800">×</button>
      </div>

      <div className="tw-mb-2">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'effects' | 'sources')}>
          <TabsList>
            <TabsTrigger value="effects">Visual Effects</TabsTrigger>
            <TabsTrigger value="sources">Generative Sources</TabsTrigger>
          </TabsList>
          <TabsContent value="effects" />
          <TabsContent value="sources" />
        </Tabs>
      </div>

      <div className="tw-flex-1 tw-overflow-auto tw-p-3">

        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'effects' | 'sources')}>
          <TabsContent value="effects">
            <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 2xl:tw-grid-cols-3 tw-gap-2">
              {visualEffects.map((effect) => (
                <div
                  key={effect.id}
                  className={`tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-3 tw-cursor-pointer hover:tw-bg-neutral-800 ${selectedEffect?.id === effect.id ? 'tw-ring-2 tw-ring-purple-600' : ''}`}
                  onClick={() => handleEffectSelect(effect)}
                  draggable
                  onDragStart={(e) => handleEffectDrag(e, effect)}
                  title={`${effect.name}: ${effect.description}`}
                >
                  <div className="tw-flex tw-flex-col tw-gap-0.5">
                    <div className="tw-text-sm tw-font-medium tw-flex tw-items-center tw-gap-2">
                      {effect.name}
                      {effect.metadata?.canBeGlobal && (
                        <span className="tw-inline-block tw-h-2 tw-w-2 tw-rounded-full tw-bg-sky-500" title="Can be used as a global effect" />
                      )}
                    </div>
                    <div className="tw-text-xs tw-text-neutral-300">{effect.description}</div>
                  </div>
                  <div className="tw-mt-1 tw-text-[10px] tw-uppercase tw-text-neutral-400">{effect.category}</div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="sources">
            <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 2xl:tw-grid-cols-3 tw-gap-2">
              {generativeSources.map((effect) => (
                <div
                  key={effect.id}
                  className={`tw-rounded tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-3 tw-cursor-pointer hover:tw-bg-neutral-800 ${selectedEffect?.id === effect.id ? 'tw-ring-2 tw-ring-purple-600' : ''}`}
                  onClick={() => handleEffectSelect(effect)}
                  draggable
                  onDragStart={(e) => handleEffectDrag(e, effect)}
                  title={`${effect.name}: ${effect.description}`}
                >
                  <div className="tw-flex tw-flex-col tw-gap-0.5">
                    <div className="tw-text-sm tw-font-medium tw-flex tw-items-center tw-gap-2">
                      {effect.name}
                      {effect.metadata?.canBeGlobal && (
                        <span className="tw-inline-block tw-h-2 tw-w-2 tw-rounded-full tw-bg-sky-500" title="Can be used as a global effect" />
                      )}
                    </div>
                    <div className="tw-text-xs tw-text-neutral-300">{effect.description}</div>
                  </div>
                  <div className="tw-mt-1 tw-text-[10px] tw-uppercase tw-text-neutral-400">{effect.category}</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>


        {selectedEffect && (
          <div className="tw-mt-3 tw-rounded-md tw-border tw-border-neutral-800 tw-bg-neutral-900 tw-p-3">
            <h3 className="tw-text-sm tw-font-semibold">{selectedEffect.name}</h3>
            <p className="tw-text-xs tw-text-neutral-300 tw-mt-1">{selectedEffect.description}</p>
            <div className="tw-mt-2 tw-flex tw-gap-2">
              <button onClick={handleAddToLayer} className="tw-bg-purple-600 hover:tw-bg-purple-500 tw-text-white tw-px-3 tw-py-1.5 tw-text-sm">Add to Layer</button>
              <button onClick={handlePreview} className="tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-text-neutral-100 tw-px-3 tw-py-1.5 tw-text-sm">Preview</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 