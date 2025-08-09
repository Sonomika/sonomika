import React, { useState, useEffect } from 'react';
import { getAllRegisteredEffects, getEffect } from '../utils/effectRegistry';
import { effectCache, CachedEffect } from '../utils/EffectCache';

interface EffectsBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose, isEmbedded = false }) => {
  const [selectedEffect, setSelectedEffect] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'overlays'>('effects');
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
        setCachedEffects(effects);
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
              icon: metadata.icon || '✨',
              author: metadata.author || 'Unknown',
              version: metadata.version || '1.0.0',
              component: effectComponent,
              metadata,
              loadTime: 0
            };
          }).filter((effect): effect is CachedEffect => effect !== null);
          
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
  const allEffects = cachedEffects.map(effect => ({
    id: effect.id,
    name: effect.name,
    type: 'threejs',
    description: effect.description,
    category: effect.category,
    icon: effect.icon,
    author: effect.author,
    version: effect.version
  }));

  // Filter effects based on search term
  const filteredEffects = allEffects.filter(effect =>
    effect.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group effects by category
  const effectsByCategory = filteredEffects.reduce((acc, effect) => {
    if (!acc[effect.category]) {
      acc[effect.category] = [];
    }
    acc[effect.category].push(effect);
    return acc;
  }, {} as Record<string, typeof allEffects>);

  const handleEffectSelect = (effect: any) => {
    setSelectedEffect(effect);
  };

  const handleEffectDrag = (e: React.DragEvent, effect: any) => {
    // Set the drag data in the format expected by the drop handlers
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'effect',
      isEffect: true,
      id: effect.id,
      name: effect.name,
      description: effect.description,
      category: effect.category,
      icon: effect.icon,
      effect: effect // Include the full effect object for backward compatibility
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
      <div className="effects-browser">
        <div className="effects-browser-header">
          <h2>Effects Browser</h2>
          <button onClick={handleClose} className="close-button">×</button>
        </div>
        <div className="effects-browser-content">
          <div className="loading">
            <div className="loading-spinner"></div>
            <div className="loading-text">{loadingProgress}</div>
          </div>
        </div>
      </div>
    );
  }

  // Show message if no effects are discovered
  if (allEffects.length === 0) {
    return (
      <div className="effects-browser">
        <div className="effects-browser-header">
          <h2>Effects Browser</h2>
          <button onClick={handleClose} className="close-button">×</button>
        </div>
        <div className="effects-browser-content">
          <div className="no-effects">
            <h3>No Effects Found</h3>
            <p>The effects browser couldn't find any effects to display.</p>
            <p>This might be because:</p>
            <ul>
              <li>No effects are in the effects folder</li>
              <li>Effects are not properly registered</li>
              <li>The registry system is not working</li>
            </ul>
            <p>Check the browser console for more details about the registration process.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="effects-browser">
      <div className="effects-browser-header">
        <div className="header-left">
          <h2>Effects Browser</h2>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search effects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        <button onClick={handleClose} className="close-button">×</button>
      </div>

      <div className="effects-browser-content">

        {activeTab === 'effects' && (
          <div className="effects-grid">
            {filteredEffects.map((effect) => (
              <div
                key={effect.id}
                className={`effect-item ${selectedEffect?.id === effect.id ? 'selected' : ''}`}
                onClick={() => handleEffectSelect(effect)}
                draggable
                onDragStart={(e) => handleEffectDrag(e, effect)}
                title={`${effect.name}: ${effect.description}`}
              >
                <div className="effect-info">
                  <div className="effect-name">{effect.name}</div>
                  <div className="effect-description">{effect.description}</div>
                </div>
                <div className="effect-tag">{effect.category}</div>
              </div>
            ))}
          </div>
        )}



        {selectedEffect && (
          <div className="effect-details">
            <h3>{selectedEffect.name}</h3>
            <p>{selectedEffect.description}</p>
            <div className="effect-actions">
              <button onClick={handleAddToLayer} className="add-button">
                Add to Layer
              </button>
              <button onClick={handlePreview} className="preview-button">
                Preview
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 