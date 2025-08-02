import React, { useState } from 'react';

interface EffectsBrowserProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({ onClose, isEmbedded = false }) => {
  const [selectedEffect, setSelectedEffect] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'overlays'>('effects');

  // Regular effects (standalone animations)
  const regularEffects = [
    {
      id: 'circle-pulse-effect',
      name: 'Circle Pulse Effect',
      type: 'threejs',
      description: 'Animated pulsing circle effect (Three.js)',
      category: 'Animation',
      icon: '●'
    },
    {
      id: 'square-pulse-effect',
      name: 'Square Pulse Effect',
      type: 'threejs',
      description: 'Animated pulsing square effect (Three.js)',
      category: 'Animation',
      icon: '■'
    },
    {
      id: 'wave-effect',
      name: 'Wave Effect',
      type: 'threejs',
      description: 'Animated wave pattern (Three.js)',
      category: 'Animation',
      icon: '~'
    },
    {
      id: 'geometric-pattern-effect',
      name: 'Geometric Pattern Effect',
      type: 'threejs',
      description: 'Geometric shape animations (Three.js)',
      category: 'Animation',
      icon: '◆'
    },
    {
      id: 'audio-reactive-effect',
      name: 'Audio Reactive Effect',
      type: 'threejs',
      description: 'Audio-driven visual effects (Three.js)',
      category: 'Audio',
      icon: '♪'
    },
    {
      id: 'color-pulse-effect',
      name: 'Color Pulse Effect',
      type: 'threejs',
      description: 'Color cycling pulse effect (Three.js)',
      category: 'Color',
      icon: '◉'
    },
    {
      id: 'r3f-pulse',
      name: 'R3F Pulse',
      type: 'threejs',
      description: 'React Three Fiber pulse effect',
      category: 'Animation',
      icon: '●'
    },
    {
      id: 'r3f-circle-pulse',
      name: 'R3F Circle Pulse',
      type: 'threejs',
      description: 'React Three Fiber circle pulse',
      category: 'Animation',
      icon: '◉'
    },
    {
      id: 'r3f-color-pulse',
      name: 'R3F Color Pulse',
      type: 'threejs',
      description: 'React Three Fiber color pulse',
      category: 'Color',
      icon: '◉'
    }
  ];

  // Overlay effects (applied to video/content)
  const overlayEffects = [
    {
      id: 'kaleidoscope',
      name: 'Kaleidoscope Effect',
      type: 'threejs',
      description: 'Shader-based kaleidoscope with video input',
      category: 'Video',
      icon: '◈'
    },
    {
      id: 'particle-effect',
      name: 'Particle Effect',
      type: 'threejs',
      description: 'Animated particles moving in 3D space',
      category: 'Animation',
      icon: '✦'
    },
    {
      id: 'r3f-particle-system',
      name: 'R3F Particle System',
      type: 'threejs',
      description: 'React Three Fiber particle system',
      category: 'Animation',
      icon: '•'
    },
    {
      id: 'video-slice',
      name: 'Video Slice',
      type: 'video',
      description: 'Slices video into horizontal strips with offset',
      category: 'Video',
      icon: '◢'
    },
    {
      id: 'video-glitch-blocks',
      name: 'Video Glitch Blocks',
      type: 'video',
      description: 'Creates random glitch blocks with color shifts',
      category: 'Video',
      icon: '◣'
    },
    {
      id: 'video-wave-slice',
      name: 'Video Wave Slice',
      type: 'video',
      description: 'Creates wave-like slicing distortion',
      category: 'Video',
      icon: '◤'
    },
    {
      id: 'global-datamosh',
      name: 'Global Datamosh',
      type: 'video',
      description: 'Applies datamosh effect to the entire composition',
      category: 'Video',
      icon: '◐'
    }
  ];

  // Get the appropriate effects array based on active tab
  const currentEffects = activeTab === 'effects' ? overlayEffects : regularEffects;
  
  const filteredEffects = currentEffects.filter(effect =>
    effect.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group effects by type
  const effectsByType = filteredEffects.reduce((groups, effect) => {
    const type = effect.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(effect);
    return groups;
  }, {} as Record<string, typeof currentEffects>);

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

  const handleAddToLayer = () => {
    if (!selectedEffect) {
      console.log('No effect selected');
      return;
    }

    console.log('Adding effect to layer:', selectedEffect);
    
    // Create a draggable effect object that can be dropped on layers
    const effectData = {
      ...selectedEffect,
      isEffect: true,
      type: 'effect',
      name: selectedEffect.name,
      filePath: `effects/${selectedEffect.id === 'global-datamosh' ? 'GlobalDatamoshEffect' : selectedEffect.id}.ts`
    };

    // Show a message to the user
    alert(`Effect "${selectedEffect.name}" is ready to be added to a layer.\n\nTo add this effect:\n1. Drag the effect from the grid above to a layer\n2. Or drag the effect from the "Add to Layer" button to a layer`);
  };

  const handlePreview = () => {
    if (!selectedEffect) {
      console.log('No effect selected');
      return;
    }

    console.log('Previewing effect:', selectedEffect);
    
    // Create a preview window or modal
    const previewWindow = window.open('', '_blank', 'width=800,height=600');
    if (previewWindow) {
      previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Effect Preview: ${selectedEffect.name}</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              background: #1a1a1a;
              color: #fff;
              font-family: Arial, sans-serif;
            }
            .preview-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 20px;
            }
            .effect-info {
              text-align: center;
              background: #2a2a2a;
              padding: 20px;
              border-radius: 8px;
              border: 1px solid #444;
            }
            .effect-icon {
              font-size: 48px;
              margin-bottom: 10px;
            }
            .effect-name {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 10px;
              color: #00bcd4;
            }
            .effect-description {
              font-size: 16px;
              color: #ccc;
              margin-bottom: 10px;
            }
            .effect-category {
              font-size: 12px;
              color: #888;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .preview-canvas {
              border: 2px solid #444;
              border-radius: 8px;
              background: #000;
            }
            .preview-message {
              text-align: center;
              color: #888;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          <div class="preview-container">
            <div class="effect-info">
              <div class="effect-icon">${selectedEffect.icon}</div>
              <div class="effect-name">${selectedEffect.name}</div>
              <div class="effect-description">${selectedEffect.description}</div>
              <div class="effect-category">${selectedEffect.category}</div>
            </div>
            <canvas id="previewCanvas" class="preview-canvas" width="600" height="400"></canvas>
            <div class="preview-message">
              Effect preview canvas - actual effect rendering would be implemented here
            </div>
          </div>
        </body>
        </html>
      `);
      previewWindow.document.close();
    } else {
      alert(`Effect Preview: ${selectedEffect.name}\n\nType: ${selectedEffect.type}\nCategory: ${selectedEffect.category}\nDescription: ${selectedEffect.description}`);
    }
  };

  return (
    <div className={`effects-browser ${isEmbedded ? 'embedded' : ''}`}>
      <div className="effects-browser-header">
        <div className="effects-header-left">
          <h3>Effects</h3>
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
        {!isEmbedded && onClose && (
          <button onClick={onClose} className="close-btn">×</button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="effects-tabs">
        <button 
          className={`effects-tab ${activeTab === 'effects' ? 'active' : ''}`}
          onClick={() => setActiveTab('effects')}
        >
          Effects
        </button>
        <button 
          className={`effects-tab ${activeTab === 'overlays' ? 'active' : ''}`}
          onClick={() => setActiveTab('overlays')}
        >
          Overlays
        </button>
      </div>

      <div className="effects-browser-content">
        {/* Effects List Grouped by Type */}
        <div className="effects-list">
          {Object.entries(effectsByType).map(([type, typeEffects]) => (
            <div key={type} className="effects-type-group">
              <div className="effects-type-header">
                <h4>{type === 'p5js' ? 'p5.js' : type === 'threejs' ? 'Three.js' : type === 'video' ? 'Video' : type}</h4>
                <span className="effect-count">{typeEffects.length}</span>
              </div>
              <div className="effects-type-grid">
                {typeEffects.map((effect) => (
                  <div
                    key={effect.id}
                    className={`effect-compact-item ${selectedEffect?.id === effect.id ? 'selected' : ''}`}
                    onClick={() => handleEffectSelect(effect)}
                    draggable
                    onDragStart={(e) => handleEffectDrag(e, effect)}
                    title={effect.description}
                  >
                    <div className="effect-compact-icon">{effect.icon}</div>
                    <div className="effect-compact-info">
                      <div className="effect-compact-name">{effect.name}</div>
                      <div className="effect-compact-category">{effect.category}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>


      </div>
    </div>
  );
}; 