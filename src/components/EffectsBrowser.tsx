import React, { useState } from 'react';
import { useEffectManager } from '../utils/EffectManager';

interface EffectsBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose, isEmbedded = false }) => {
  const [selectedEffect, setSelectedEffect] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'overlays'>('effects');

  // Use the centralized effect manager
  const { effects, categories, isInitialized } = useEffectManager();

  // All effects are now dynamically discovered
  const allEffects = isInitialized ? effects.map(effect => ({
    id: effect.id,
    name: effect.name,
    type: effect.category === 'Global' ? 'global' : 
          effect.category === 'Film' ? 'film' : 
          effect.category === 'Special' ? 'overlay' : 'threejs',
    description: effect.description,
    category: effect.category,
    icon: effect.icon
  })) : [];

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
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'effect',
      effect: effect
    }));
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

  if (!isInitialized) {
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
              <li>Effects are not properly exported</li>
              <li>Dynamic discovery is not working in this environment</li>
            </ul>
            <p>Check the browser console for more details about the discovery process.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="effects-browser">
      <div className="effects-browser-header">
        <h2>Effects Browser</h2>
        <button onClick={handleClose} className="close-button">×</button>
      </div>

      <div className="effects-browser-content">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search effects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'effects' ? 'active' : ''}`}
            onClick={() => setActiveTab('effects')}
          >
            Effects
          </button>
          <button
            className={`tab ${activeTab === 'overlays' ? 'active' : ''}`}
            onClick={() => setActiveTab('overlays')}
          >
            Overlays
          </button>
        </div>

        {activeTab === 'effects' && (
          <div className="effects-grid">
            {Object.entries(effectsByCategory).map(([category, categoryEffects]) => (
              <div key={category} className="effect-category">
                <h3 className="category-title">{category}</h3>
                <div className="category-effects">
                  {categoryEffects.map((effect) => (
                    <div
                      key={effect.id}
                      className={`effect-item ${selectedEffect?.id === effect.id ? 'selected' : ''}`}
                      onClick={() => handleEffectSelect(effect)}
                      draggable
                      onDragStart={(e) => handleEffectDrag(e, effect)}
                    >
                      <div className="effect-icon">{effect.icon}</div>
                      <div className="effect-info">
                        <div className="effect-name">{effect.name}</div>
                        <div className="effect-description">{effect.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'overlays' && (
          <div className="overlays-grid">
            {allEffects.filter(effect => effect.type === 'overlay').map((effect) => (
              <div
                key={effect.id}
                className={`effect-item ${selectedEffect?.id === effect.id ? 'selected' : ''}`}
                onClick={() => handleEffectSelect(effect)}
                draggable
                onDragStart={(e) => handleEffectDrag(e, effect)}
              >
                <div className="effect-icon">{effect.icon}</div>
                <div className="effect-info">
                  <div className="effect-name">{effect.name}</div>
                  <div className="effect-description">{effect.description}</div>
                </div>
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