import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  Button,
  Input,
  Label,
  Select
} from './ui';

interface CompositionSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_SIZES = [
  { name: 'Custom', width: 0, height: 0 },
  { name: '640 × 360 (nHD)', width: 640, height: 360 },
  { name: '640 × 480 (VGA, 4:3)', width: 640, height: 480 },
  { name: '720 × 720 (square)', width: 720, height: 720 },
  { name: '720 × 1280 (portrait)', width: 720, height: 1280 },
  { name: '768 × 576 (PAL, 4:3)', width: 768, height: 576 },
  { name: '800 × 600 (SVGA, 4:3)', width: 800, height: 600 },
  { name: '960 × 540 (qHD)', width: 960, height: 540 },
  { name: '1024 × 768 (XGA, 4:3)', width: 1024, height: 768 },
  { name: '1080 × 1080 (square)', width: 1080, height: 1080 },
  { name: '1080 × 1350 (portrait, 4:5)', width: 1080, height: 1350 },
  { name: '1080 × 1920 (portrait, vertical)', width: 1080, height: 1920 },
  { name: '1200 × 628 (landscape, wide)', width: 1200, height: 628 },
  { name: '1280 × 720 (HD, 16:9)', width: 1280, height: 720 },
  { name: '1280 × 800 (WXGA)', width: 1280, height: 800 },
  { name: '1280 × 1024 (SXGA, 5:4)', width: 1280, height: 1024 },
  { name: '1366 × 768 (FWXGA, widescreen)', width: 1366, height: 768 },
  { name: '1600 × 900 (HD+)', width: 1600, height: 900 },
  { name: '1600 × 1200 (UXGA, 4:3)', width: 1600, height: 1200 },
  { name: '1920 × 1080 (Full HD, 16:9)', width: 1920, height: 1080 },
  { name: '1920 × 1200 (WUXGA)', width: 1920, height: 1200 },
  { name: '2560 × 1440 (Quad HD, 1440p)', width: 2560, height: 1440 },
  { name: '2816 × 640 (wide custom)', width: 2816, height: 640 },
  { name: '3840 × 1080 (dual Full HD, wide)', width: 3840, height: 1080 },
  { name: '3840 × 2160 (4K Ultra HD)', width: 3840, height: 2160 },
  { name: '5120 × 2880 (5K Ultra HD)', width: 5120, height: 2880 },
  { name: '5760 × 1080 (triple-wide)', width: 5760, height: 1080 },
  { name: '7680 × 4320 (8K Ultra HD)', width: 7680, height: 4320 },
  { name: '10240 × 768 (ultra-wide custom)', width: 10240, height: 768 },
];

// Removed frame rate selection; live uses rAF, export fixed 30fps

export const CompositionSettings: React.FC<CompositionSettingsProps> = ({ isOpen, onClose }) => {
  const { compositionSettings, updateCompositionSettings } = useStore();
  const [settings, setSettings] = useState(compositionSettings);
  // No local dropdown open state when using standard Select

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
  };

  // Frame rate selection removed

  const getCurrentSizeName = () => {
    const preset = PRESET_SIZES.find(p => p.width === settings.width && p.height === settings.height);
    return preset ? preset.name : 'Custom';
  };

  // Frame rate display removed

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="tw-max-w-md">
        <DialogHeader>
          <DialogTitle>Composition Settings</DialogTitle>
        </DialogHeader>
        
        <div className="tw-space-y-4">
          <div className="tw-space-y-2">
            <Label htmlFor="backgroundColor">Background Color:</Label>
            <div className="tw-flex tw-items-center tw-gap-2">
              <input
                type="color"
                id="backgroundColor"
                value={settings.backgroundColor || '#000000'}
                onChange={e => setSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                className="tw-w-12 tw-h-8 tw-border tw-border-neutral-700 tw-rounded"
              />
              <span className="tw-text-sm tw-text-neutral-400">{settings.backgroundColor || '#000000'}</span>
            </div>
          </div>

          

          <div className="tw-space-y-2">
            <Label>Size:</Label>
            <div className="tw-space-y-2">
              <div className="tw-flex tw-items-center tw-gap-2">
                <Input 
                  type="number" 
                  value={settings.width} 
                  onChange={e => setSettings(prev => ({ 
                    ...prev, 
                    width: parseInt(e.target.value) || 1920,
                    aspectRatio: `${parseInt(e.target.value) || 1920}:${prev.height}`
                  }))}
                  min="1"
                  max="7680"
                  className="tw-w-20 !tw-text-neutral-100"
                />
                <span className="tw-text-neutral-400">x</span>
                <Input 
                  type="number" 
                  value={settings.height} 
                  onChange={e => setSettings(prev => ({ 
                    ...prev, 
                    height: parseInt(e.target.value) || 1080,
                    aspectRatio: `${prev.width}:${parseInt(e.target.value) || 1080}`
                  }))}
                  min="1"
                  max="4320"
                  className="tw-w-20 !tw-text-neutral-100"
                />
              </div>
              <Select
                value={getCurrentSizeName()}
                onChange={(name: string) => {
                  const preset = PRESET_SIZES.find(p => p.name === name) || PRESET_SIZES[0];
                  handleSizeSelect(preset);
                }}
                options={PRESET_SIZES.map(p => ({ value: p.name, label: p.name }))}
                className="tw-w-[220px]"
              />
            </div>
          </div>

          {/* Frame rate control removed; live via requestAnimationFrame, export fixed 30fps */}
        </div>

        <DialogFooter>
          <Button variant="outline" className="!tw-bg-neutral-900 !tw-text-neutral-100 !tw-border-neutral-700" onClick={handleCancel}>
            Cancel
          </Button>
          <Button className="!tw-bg-neutral-800 !tw-text-neutral-100" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 