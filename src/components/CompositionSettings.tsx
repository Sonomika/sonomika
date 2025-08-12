import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';

interface CompositionSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_SIZES = [
  { name: 'Custom', width: 0, height: 0 },
  { name: '1 x 1 ;-)', width: 1, height: 1 },
  { name: '640 x 480 (VGA)', width: 640, height: 480 },
  { name: '640 x 360 (nHD)', width: 640, height: 360 },
  { name: '800 x 600 (SVGA)', width: 800, height: 600 },
  { name: '960 x 540 (qHD)', width: 960, height: 540 },
  { name: '1024 x 768 (XGA)', width: 1024, height: 768 },
  { name: '1280 x 720 (720p, HD)', width: 1280, height: 720 },
  { name: '1280 x 800 (WXGA)', width: 1280, height: 800 },
  { name: '1280 x 1024 (SXGA)', width: 1280, height: 1024 },
  { name: '1366 x 768 (FWXGA)', width: 1366, height: 768 },
  { name: '1600 x 900 (HD+)', width: 1600, height: 900 },
  { name: '1600 x 1200 (UXGA)', width: 1600, height: 1200 },
  { name: '1920 x 1080 (1080p, Full HD)', width: 1920, height: 1080 },
  { name: '1920 x 1200 (WUXGA)', width: 1920, height: 1200 },
  { name: '2560 x 1440 (1440p, Quad HD)', width: 2560, height: 1440 },
  { name: '3840 x 1080 (2x Full HD)', width: 3840, height: 1080 },
  { name: '3840 x 2160 (4K Ultra HD)', width: 3840, height: 2160 },
  { name: '5120 x 2880 (5K Ultra HD)', width: 5120, height: 2880 },
  { name: '5760 x 1080 (3x Full HD)', width: 5760, height: 1080 },
  { name: '7680 x 4320 (8K Ultra HD)', width: 7680, height: 4320 },
];

const FRAME_RATES = [
  { name: 'Auto', value: 0 },
  { name: '24 fps', value: 24 },
  { name: '25 fps', value: 25 },
  { name: '30 fps', value: 30 },
  { name: '50 fps', value: 50 },
  { name: '60 fps', value: 60 },
  { name: '120 fps', value: 120 },
];



export const CompositionSettings: React.FC<CompositionSettingsProps> = ({ isOpen, onClose }) => {
  const { compositionSettings, updateCompositionSettings } = useStore();
  const [settings, setSettings] = useState(compositionSettings);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [frameRateDropdownOpen, setFrameRateDropdownOpen] = useState(false);

  useEffect(() => {
    setSettings(compositionSettings);
  }, [compositionSettings]);

  const handleSave = () => {
    updateCompositionSettings(settings);
    onClose();
  };

  const handleCancel = () => {
    setSettings(compositionSettings);
    onClose();
  };

  const handleSizeSelect = (preset: typeof PRESET_SIZES[0]) => {
    if (preset.name === 'Custom') {
      setSettings(prev => ({ ...prev, width: 1920, height: 1080 }));
    } else {
      setSettings(prev => ({ 
        ...prev, 
        width: preset.width, 
        height: preset.height,
        aspectRatio: `${preset.width}:${preset.height}`
      }));
    }
    setSizeDropdownOpen(false);
  };

  const handleFrameRateSelect = (frameRate: typeof FRAME_RATES[0]) => {
    setSettings(prev => ({ ...prev, frameRate: frameRate.value }));
    setFrameRateDropdownOpen(false);
  };



  const getCurrentSizeName = () => {
    const preset = PRESET_SIZES.find(p => p.width === settings.width && p.height === settings.height);
    return preset ? preset.name : 'Custom';
  };

  const getCurrentFrameRateName = () => {
    const frameRate = FRAME_RATES.find(f => f.value === settings.frameRate);
    return frameRate ? frameRate.name : 'Auto';
  };



  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content composition-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Composition Settings</h3>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="setting-group">
            <label>Background Color:</label>
            <input
              type="color"
              value={settings.backgroundColor || '#000000'}
              onChange={e => setSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
            />
          </div>

          <div className="setting-group">
            <label>Name:</label>
            <input 
              type="text" 
              value={settings.name || 'new test'} 
              onChange={e => setSettings(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Composition name"
            />
          </div>

          <div className="setting-group">
            <label>Description:</label>
            <textarea 
              value={settings.description || ''} 
              onChange={e => setSettings(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Composition description"
              rows={3}
            />
          </div>

          <div className="setting-group">
            <label>Size:</label>
            <div className="size-inputs">
              <input 
                type="number" 
                value={settings.width} 
                onChange={e => setSettings(prev => ({ 
                  ...prev, 
                  width: parseInt(e.target.value) || 1920,
                  aspectRatio: `${parseInt(e.target.value) || 1920}:${prev.height}`
                }))}
                min="1"
                max="7680"
              />
              <span>x</span>
              <input 
                type="number" 
                value={settings.height} 
                onChange={e => setSettings(prev => ({ 
                  ...prev, 
                  height: parseInt(e.target.value) || 1080,
                  aspectRatio: `${prev.width}:${parseInt(e.target.value) || 1080}`
                }))}
                min="1"
                max="4320"
              />
              <div className="dropdown-container">
                <button 
                  className="dropdown-button"
                  onClick={() => setSizeDropdownOpen(!sizeDropdownOpen)}
                >
                  {getCurrentSizeName()}
                  <span className="dropdown-arrow">▼</span>
                </button>
                {sizeDropdownOpen && (
                  <div className="dropdown-menu">
                    {PRESET_SIZES.map((preset, index) => (
                      <button
                        key={index}
                        className={`dropdown-item ${getCurrentSizeName() === preset.name ? 'selected' : ''}`}
                        onClick={() => handleSizeSelect(preset)}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="setting-group">
            <label>FrameRate:</label>
            <div className="dropdown-container">
              <button 
                className="dropdown-button"
                onClick={() => setFrameRateDropdownOpen(!frameRateDropdownOpen)}
              >
                {getCurrentFrameRateName()}
                <span className="dropdown-arrow">▼</span>
              </button>
              {frameRateDropdownOpen && (
                <div className="dropdown-menu">
                  {FRAME_RATES.map((frameRate, index) => (
                    <button
                      key={index}
                      className={`dropdown-item ${getCurrentFrameRateName() === frameRate.name ? 'selected' : ''}`}
                      onClick={() => handleFrameRateSelect(frameRate)}
                    >
                      {frameRate.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>


        </div>
        
        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}; 