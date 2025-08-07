import React, { useState, useEffect } from 'react';
import { getAllRegisteredEffects, getEffect } from '../utils/effectRegistry';

interface EffectsBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose, isEmbedded = false }) => {
  const [selectedEffect, setSelectedEffect] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'overlays'>('effects');
  const [registeredEffects, setRegisteredEffects] = useState<string[]>([]);

  // Get all registered effects from the registry and trigger discovery
  useEffect(() => {
    const loadEffects = async () => {
      try {
        // Trigger dynamic discovery first
        const { EffectDiscovery } = await import('../utils/EffectDiscovery');
        const discovery = EffectDiscovery.getInstance();
        await discovery.discoverEffects();
        console.log('🔧 EffectsBrowser: Triggered dynamic discovery');
      } catch (error) {
        console.warn('⚠️ Could not trigger dynamic discovery:', error);
      }
      
      // Then get registered effects
      const effects = getAllRegisteredEffects();
      setRegisteredEffects(effects);
      console.log('🔧 EffectsBrowser: Found registered effects:', effects);
    };
    
    loadEffects();
  }, []);

  // Convert registered effect IDs to effect objects for display
  const allEffects = registeredEffects.map(effectId => {
    const effectComponent = getEffect(effectId);
    if (!effectComponent) return null;

    // Get metadata from the component
    const metadata = (effectComponent as any).metadata || {};
    
    return {
      id: effectId,
      name: metadata.name || effectId,
      type: metadata.type || 'threejs',
      description: metadata.description || 'No description available',
      category: metadata.category || 'Effects',
      icon: metadata.icon || '✨',
      author: metadata.author || 'Unknown',
      version: metadata.version || '1.0.0'
    };
  }).filter((effect): effect is NonNullable<typeof effect> => effect !== null);

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

  // Show loading state while effects are being registered
  if (registeredEffects.length === 0) {
    return (
      <div className="effects-browser">
        <div className="effects-browser-header">
          <h2>Effects Browser</h2>
          <button onClick={handleClose} className="close-button">×</button>
        </div>
        <div className="effects-browser-content">
          <div className="loading">Loading effects...</div>
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
            {allEffects.map((effect) => (
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