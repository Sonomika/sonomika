import React, { useState } from 'react';

interface EffectsBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose, isEmbedded = false }) => {
  const [selectedEffect, setSelectedEffect] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Sample effects data
  const effects = [
    {
      id: 'pulse',
      name: 'Pulse Effect',
      type: 'p5js',
      description: 'Animated pulsing circle effect',
      category: 'Animation',
      icon: '🎨'
    },
    {
      id: 'square-pulse',
      name: 'Square Pulse',
      type: 'p5js',
      description: 'Animated pulsing square effect',
      category: 'Animation',
      icon: '⬜'
    },
    {
      id: 'wave',
      name: 'Wave Effect',
      type: 'p5js',
      description: 'Animated wave pattern',
      category: 'Animation',
      icon: '🌊'
    },
    {
      id: 'particles',
      name: 'Particle System',
      type: 'p5js',
      description: 'Dynamic particle system',
      category: 'Animation',
      icon: '✨'
    },
    {
      id: 'geometric',
      name: 'Geometric Pattern',
      type: 'p5js',
      description: 'Geometric shape animations',
      category: 'Animation',
      icon: '🔷'
    },
    {
      id: 'audio-reactive',
      name: 'Audio Reactive',
      type: 'p5js',
      description: 'Audio-driven visual effects',
      category: 'Audio',
      icon: '🎵'
    },
    {
      id: 'color-pulse',
      name: 'Color Pulse',
      type: 'p5js',
      description: 'Color cycling pulse effect',
      category: 'Color',
      icon: '🌈'
    }
  ];

  const filteredEffects = effects.filter(effect =>
    effect.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEffectSelect = (effect: any) => {
    setSelectedEffect(effect);
    console.log('Selected effect:', effect);
  };

  const handleEffectDrag = (e: React.DragEvent, effect: any) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      ...effect,
      isEffect: true
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className={`effects-browser ${isEmbedded ? 'embedded' : ''}`}>
      <div className="effects-browser-header">
        <h3>Effects Browser</h3>
        {!isEmbedded && onClose && (
          <button onClick={onClose} className="close-btn">×</button>
        )}
      </div>

      <div className="effects-browser-content">
        {/* Search Bar */}
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search effects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Effects Grid */}
        <div className="effects-grid">
          {filteredEffects.map((effect) => (
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
                <div className="effect-category">{effect.category}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Selected Effect Details */}
        {selectedEffect && (
          <div className="effect-details">
            <h4>Effect Details</h4>
            <div className="effect-detail-item">
              <strong>Name:</strong> {selectedEffect.name}
            </div>
            <div className="effect-detail-item">
              <strong>Type:</strong> {selectedEffect.type}
            </div>
            <div className="effect-detail-item">
              <strong>Category:</strong> {selectedEffect.category}
            </div>
            <div className="effect-detail-item">
              <strong>Description:</strong> {selectedEffect.description}
            </div>
            <div className="effect-actions">
              <button className="effect-btn primary">Add to Layer</button>
              <button className="effect-btn secondary">Preview</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 