import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui';
import { useToast } from '../hooks/use-toast';

interface UserEffectsLoaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEffectsLoaded?: (count: number) => void;
}

export const UserEffectsLoader: React.FC<UserEffectsLoaderProps> = ({
  open,
  onOpenChange,
  onEffectsLoaded
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDirectory, setSelectedDirectory] = useState<string>('');
  const [rememberAutoload, setRememberAutoload] = useState<boolean>(() => {
    try { return localStorage.getItem('vj-autoload-user-effects-enabled') === '1'; } catch { return false; }
  });
  const { toast } = useToast();

  const handleSelectDirectory = async () => {
    try {
      // Check if we're in Electron environment
      if (typeof window !== 'undefined' && (window as any).electron?.showOpenDialog) {
        const result = await (window as any).electron.showOpenDialog({
          title: 'Select User Effects Directory',
          properties: ['openDirectory'],
          message: 'Choose a directory containing your custom effects (.tsx files)'
        });

        if (!result.canceled && result.filePaths && result.filePaths[0]) {
          setSelectedDirectory(result.filePaths[0]);
        }
      } else {
        toast({
          title: 'Not Available',
          description: 'Directory selection is only available in the Electron app.',
        });
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      toast({
        title: 'Error',
        description: 'Failed to open directory selector.',
      });
    }
  };

  const handleLoadFromSrcDirectory = async () => {
    setIsLoading(true);
    try {
      // Load from @src/ directory (assuming it's at the project root level)
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      
      // Construct path to @src directory
      const path = (window as any).require?.('path');
      if (!path) {
        throw new Error('Path module not available - Electron environment required');
      }
      
      const srcDirectory = path.join(process.cwd(), '@src');
      const effects = await discovery.loadUserEffectsFromDirectory(srcDirectory);
      
      toast({
        title: 'Success',
        description: `Loaded ${effects.length} user effects from @src/ directory.`,
      });
      
      onEffectsLoaded?.(effects.length);
      onOpenChange(false);
    } catch (error) {
      console.error('Error loading from @src directory:', error);
      toast({
        title: 'Error',
        description: 'Failed to load effects from @src/ directory. Make sure the directory exists and contains .tsx effect files.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadFromSelectedDirectory = async () => {
    if (!selectedDirectory) {
      toast({
        title: 'No Directory Selected',
        description: 'Please select a directory first.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      
      const effects = await discovery.loadUserEffectsFromDirectory(selectedDirectory);
      
      // Persist autoload preference and directory if requested
      try {
        localStorage.setItem('vj-autoload-user-effects-enabled', rememberAutoload ? '1' : '0');
        if (rememberAutoload) {
          // Single FX directory preference
          localStorage.setItem('vj-fx-user-dir', selectedDirectory);
          // Cleanup legacy multi-dir key to avoid confusion
          try { localStorage.removeItem('vj-autoload-user-effects-dirs'); } catch {}
        }
      } catch {}

      toast({
        title: 'Success',
        description: `Loaded ${effects.length} user effects from ${selectedDirectory}.`,
      });
      
      onEffectsLoaded?.(effects.length);
      onOpenChange(false);
    } catch (error) {
      console.error('Error loading from selected directory:', error);
      toast({
        title: 'Error',
        description: 'Failed to load effects from the selected directory. Make sure it contains valid .tsx effect files.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Quick load from @external-bank/ (project examples) as if they were external files
  const handleLoadFromExternalExamples = async () => {
    setIsLoading(true);
    try {
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      // Import raw sources for all example effects (recursive, allow subfolders)
      const modules: Record<string, () => Promise<string>> = (import.meta as any).glob('../../external-bank/**/*.{js,mjs}', { as: 'raw', eager: false });
      let count = 0;
      for (const [p, loader] of Object.entries(modules)) {
        try {
          const code = await (loader as any)();
          // Tag origin so browser classifies under @external-bank tab
          const effect = await discovery.loadUserEffectFromContent(code, p);
          if (effect) {
            try {
              // Patch metadata for tab classification and source path
              (effect as any).metadata = {
                ...(effect as any).metadata,
                folder: 'external-bank',
                isUserEffect: false,
                sourcePath: p,
              };
            } catch {}
          }
          if (effect) count++;
        } catch (e) {
          console.warn('Failed to load example effect', p, e);
        }
      }
      if (count > 0) {
        toast({ title: 'Loaded', description: `Loaded ${count} effect(s) from @external-bank/` });
        onEffectsLoaded?.(count);
        onOpenChange(false);
      } else {
        toast({ title: 'No Effects Found', description: 'No .js effects found in @external-bank/' });
      }
    } catch (e) {
      console.error('Error loading @external-bank/', e);
      toast({ title: 'Error', description: 'Failed to load from @external-bank/' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSingleJsFile = async () => {
    setIsLoading(true);
    try {
      if (!(window as any).electron?.showOpenDialog || !(window as any).electron?.readFileText) {
        toast({ title: 'Not Available', description: 'File selection is only available in Electron.' });
        return;
      }
      const result = await (window as any).electron.showOpenDialog({
        title: 'Select User Effect (.js)',
        properties: ['openFile'],
        filters: [{ name: 'JavaScript', extensions: ['js', 'mjs'] }],
      });
      if (result.canceled || !result.filePaths?.[0]) return;
      const fullPath = result.filePaths[0];
      const js = await (window as any).electron.readFileText(fullPath);
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      const effect = await discovery.loadUserEffectFromContent(js, fullPath.split(/[/\\]/).pop());
      if (effect) {
        // persist autoload preference and path list if enabled
        try {
          localStorage.setItem('vj-autoload-user-effects-enabled', rememberAutoload ? '1' : '0');
          if (rememberAutoload) {
            const key = 'vj-autoload-user-effects-paths';
            const raw = localStorage.getItem(key);
            const arr = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
            if (!arr.includes(fullPath)) arr.push(fullPath);
            localStorage.setItem(key, JSON.stringify(arr));
          }
        } catch {}
        toast({ title: 'Loaded', description: `Loaded user effect: ${effect.name}` });
        onEffectsLoaded?.(1);
        onOpenChange(false);
      } else {
        toast({ title: 'Invalid Module', description: 'The JS file must export default component and metadata.' });
      }
    } catch (e) {
      console.error('Error loading JS effect:', e);
      toast({ title: 'Error', description: 'Failed to load JS effect file.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearUserEffects = async () => {
    try {
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      
      discovery.clearUserEffects();
      
      toast({
        title: 'Cleared',
        description: 'All user effects have been cleared.',
      });
      
      onEffectsLoaded?.(0);
    } catch (error) {
      console.error('Error clearing user effects:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear user effects.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tw-max-w-md">
        <DialogHeader>
          <DialogTitle>Load User Effects</DialogTitle>
          <DialogDescription>
            Load custom effects from external directories. Effects should be React components exported as .tsx files.
          </DialogDescription>
        </DialogHeader>
        
        <div className="tw-space-y-4">
          <div className="tw-space-y-2">
            <h4 className="tw-text-sm tw-font-medium">Quick Load from @external-bank/</h4>
            <p className="tw-text-xs tw-text-neutral-400">Load portable .js effects in the project external-bank folder (supports subfolders).</p>
            <Button onClick={handleLoadFromExternalExamples} disabled={isLoading} className="tw-w-full">
              {isLoading ? 'Loading...' : 'Load from @external-bank/'}
            </Button>
          </div>

          <div className="tw-space-y-2">
            <h4 className="tw-text-sm tw-font-medium">Quick Load from @src/</h4>
            <p className="tw-text-xs tw-text-neutral-400">
              Load effects from the @src/ directory in your project root.
            </p>
            <Button 
              onClick={handleLoadFromSrcDirectory}
              disabled={isLoading}
              className="tw-w-full"
            >
              {isLoading ? 'Loading...' : 'Load from @src/'}
            </Button>
          </div>

          <div className="tw-border-t tw-border-neutral-700 tw-pt-4">
            <div className="tw-space-y-2">
              <h4 className="tw-text-sm tw-font-medium">Load from Custom Directory</h4>
              <p className="tw-text-xs tw-text-neutral-400">
                Choose any directory containing your custom effect files.
              </p>
              
              <div className="tw-space-y-2">
                <Button 
                  onClick={handleSelectDirectory}
                  variant="outline"
                  className="tw-w-full"
                >
                  Select Directory
                </Button>
                
                {selectedDirectory && (
                  <div className="tw-text-xs tw-text-neutral-300 tw-bg-neutral-800 tw-p-2 tw-rounded tw-break-all">
                    {selectedDirectory}
                  </div>
                )}
                
                <Button 
                  onClick={handleLoadFromSelectedDirectory}
                  disabled={isLoading || !selectedDirectory}
                  className="tw-w-full"
                >
                  {isLoading ? 'Loading...' : 'Load from Selected Directory'}
                </Button>
              </div>
            </div>
          </div>

          <div className="tw-border-t tw-border-neutral-700 tw-pt-4">
            <div className="tw-space-y-2 tw-mb-3">
              <h4 className="tw-text-sm tw-font-medium">Load single ESM .js effect</h4>
              <p className="tw-text-xs tw-text-neutral-400">External file must export default component and metadata. No bare imports.</p>
              <label className="tw-flex tw-items-center tw-gap-2 tw-text-xs tw-text-neutral-300">
                <input type="checkbox" checked={rememberAutoload} onChange={(e)=>{
                  setRememberAutoload(e.target.checked);
                  try { localStorage.setItem('vj-autoload-user-effects-enabled', e.target.checked ? '1' : '0'); } catch {}
                }} />
                Remember and auto-load on startup
              </label>
              <Button onClick={handleLoadSingleJsFile} disabled={isLoading} className="tw-w-full">
                {isLoading ? 'Loading...' : 'Load .js Effect'}
              </Button>
            </div>
            <Button 
              onClick={handleClearUserEffects}
              variant="outline"
              className="tw-w-full tw-text-red-400 hover:tw-text-red-300"
            >
              Clear All User Effects
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserEffectsLoader;
