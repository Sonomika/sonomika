import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/Dialog';
import { Switch } from './ui/switch';
import { useStore } from '../store/store';
import { Button, Slider, Select, Input } from './ui';
import { useToast } from '../hooks/use-toast';
import { getSupabase } from '../lib/supabaseClient';
import { AITemplateLoader } from '../utils/AITemplateLoader';
import { AITemplate } from '../types/aiTemplate';
import { trackFeature } from '../utils/analytics';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { accessibilityEnabled, setAccessibilityEnabled, accentColor, setAccentColor, defaultVideoRenderScale, setDefaultVideoRenderScale, mirrorQuality, setMirrorQuality, neutralContrast, setNeutralContrast, fontColor, setFontColor } = useStore() as any;
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    try { return !!JSON.parse(localStorage.getItem('vj-debug-enabled') || 'false'); } catch { return false; }
  });
  const [appVersion, setAppVersion] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  // OpenAI settings removed
  const { toast } = useToast();

  // User FX directory + autoload
  const [fxDir, setFxDir] = useState<string>(() => {
    try { return localStorage.getItem('vj-fx-user-dir') || ''; } catch { return ''; }
  });
  const [autoloadUserFx, setAutoloadUserFx] = useState<boolean>(() => {
    try { return localStorage.getItem('vj-autoload-user-effects-enabled') === '1'; } catch { return false; }
  });

  // Initialize with Documents folder on first install if not set
  useEffect(() => {
    const initializeDefaultFxDir = async () => {
      try {
        // Only set default if not already set
        const existing = localStorage.getItem('vj-fx-user-dir');
        if (existing) return; // User has already set a directory
        
        // Check if we're in Electron and can get Documents folder
        if (typeof window !== 'undefined' && (window as any).electron?.getDocumentsFolder) {
          const result = await (window as any).electron.getDocumentsFolder();
          if (result?.success && result?.path) {
            // Point to the bank folder where effects are stored
            const fsApi = (window as any).fsApi;
            const defaultPath = fsApi?.join 
              ? fsApi.join(result.path, 'bank')
              : `${result.path}${fsApi?.sep || (process.platform === 'win32' ? '\\' : '/')}bank`;
            
            // Set it in localStorage and state
            localStorage.setItem('vj-fx-user-dir', defaultPath);
            setFxDir(defaultPath);
            // Enable autoload by default on first install
            localStorage.setItem('vj-autoload-user-effects-enabled', '1');
            setAutoloadUserFx(true);
            console.log('Initialized User FX Directory to:', defaultPath);
          }
        }
      } catch (e) {
        console.warn('Failed to initialize default FX directory:', e);
      }
    };
    
    initializeDefaultFxDir();
  }, []);

  // Load app version when Settings opens (Electron only)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadVersion = async () => {
      try {
        if (typeof window !== 'undefined' && window.electron?.getAppVersion) {
          const v = await window.electron.getAppVersion();
          if (!cancelled) setAppVersion(String(v || ''));
        } else {
          if (!cancelled) setAppVersion('');
        }
      } catch {
        if (!cancelled) setAppVersion('');
      }
    };

    loadVersion();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // AI Provider template settings
  const [templates, setTemplates] = useState<AITemplate[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    try { return localStorage.getItem('vj-ai-selected-provider') || 'openai'; } catch { return 'openai'; }
  });
  const [selectedTemplate, setSelectedTemplate] = useState<AITemplate | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Load templates when dialog opens (force reload to pick up file deletions)
  useEffect(() => {
    if (!isOpen) return; // Only load when dialog is open
    
    const loadTemplates = async () => {
      try {
        const loader = AITemplateLoader.getInstance();
        // Force reload templates when dialog opens to pick up any file changes/deletions
        await loader.reloadTemplates();
        const loadedTemplates = loader.getAllTemplates();
        console.log('SettingsDialog: Loaded templates:', loadedTemplates.length, loadedTemplates.map(t => t.id));
        setTemplates(loadedTemplates);
        
        // Set template based on selected provider ID (from state or localStorage)
        const currentProviderId = selectedProviderId || (() => {
          try { return localStorage.getItem('vj-ai-selected-provider') || 'openai'; } catch { return 'openai'; }
        })();
        
        const template = loader.getTemplate(currentProviderId) || loader.getDefaultTemplate();
        if (template) {
          setSelectedTemplate(template);
          // Load API key and model for selected template
          try {
            const storedKey = localStorage.getItem(template.apiKeyStorageKey) || '';
            const storedModel = localStorage.getItem(template.modelStorageKey) || template.defaultModel;
            setApiKey(storedKey);
            setModel(storedModel);
          } catch {}
        } else {
          console.warn('SettingsDialog: No template found for provider:', currentProviderId);
        }
      } catch (error) {
        console.error('SettingsDialog: Failed to load templates:', error);
      }
    };
    loadTemplates();
  }, [isOpen]); // Reload templates when dialog opens

  // Update selected template when provider changes
  useEffect(() => {
    if (selectedProviderId && templates.length > 0) {
      const loader = AITemplateLoader.getInstance();
      const template = loader.getTemplate(selectedProviderId);
      if (template) {
        setSelectedTemplate(template);
        try {
          const storedKey = localStorage.getItem(template.apiKeyStorageKey) || '';
          const storedModel = localStorage.getItem(template.modelStorageKey) || template.defaultModel;
          setApiKey(storedKey);
          setModel(storedModel);
          localStorage.setItem('vj-ai-selected-provider', selectedProviderId);
        } catch {}
      } else {
        console.warn(`Template not found for provider: ${selectedProviderId}. Available templates:`, Array.from(loader.getAllTemplates().map(t => t.id)));
      }
    }
  }, [selectedProviderId, templates]);

  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
    if (isElectron) return; // Skip Supabase wiring in Electron
    const supabase = getSupabase();
    let unsub: any;
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
      const sub = supabase.auth.onAuthStateChange((_evt, session) => {
        setUser(session?.user ?? null);
      });
      unsub = sub.data?.subscription;
    })();
    return () => {
      try { unsub?.unsubscribe?.(); } catch {}
    };
  }, []);

  // Removed OpenAI key loading

  const handleSignOut = async () => {
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
      if (isElectron) return;
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch {}
  };

  const handleSaveApiKey = () => {
    if (!selectedTemplate) return;
    try { 
      localStorage.setItem(selectedTemplate.apiKeyStorageKey, apiKey.trim()); 
      toast({ description: 'API key saved' });
    } catch (e) {
      toast({ description: 'Failed to save API key' });
    }
  };

  const handleSaveModel = (m: string) => {
    if (!selectedTemplate) return;
    setModel(m);
    try { 
      localStorage.setItem(selectedTemplate.modelStorageKey, m); 
      toast({ description: 'Model saved' });
    } catch (e) {
      toast({ description: 'Failed to save model' });
    }
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    // Immediately update template to avoid stale state
    const loader = AITemplateLoader.getInstance();
    const template = loader.getTemplate(providerId);
    if (template) {
      setSelectedTemplate(template);
      try {
        const storedKey = localStorage.getItem(template.apiKeyStorageKey) || '';
        const storedModel = localStorage.getItem(template.modelStorageKey) || template.defaultModel;
        setApiKey(storedKey);
        setModel(storedModel);
        localStorage.setItem('vj-ai-selected-provider', providerId);
      } catch {}
    }
  };

  const getMaskedApiKey = () => {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
    return apiKey.slice(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.slice(-4);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="tw-max-h-[90vh] tw-overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="tw-space-y-4">
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Accent Colour</div>
              <div className="tw-text-xs tw-text-neutral-400">Used for highlights and controls</div>
            </div>
            <div className="tw-flex tw-items-center tw-gap-2">
              <input
                type="color"
                value={accentColor || '#00bcd4'}
                onChange={(e) => setAccentColor(e.target.value)}
                className="tw-h-8 tw-w-12 tw-rounded tw-bg-transparent tw-border tw-border-neutral-700"
                title="Pick accent colour"
              />
              <input
                type="text"
                value={(accentColor || '#00bcd4').replace(/^#/, '')}
                onChange={(e) => setAccentColor(`#${e.target.value.replace(/[^0-9a-fA-F]/g,'').slice(0,6)}`)}
                className="tw-w-24 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900  tw-px-2 tw-py-1"
                placeholder="00bcd4"
              />
            </div>
          </div>

          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Contrast</div>
              <div className="tw-text-xs tw-text-neutral-400">Adjust grey brightness</div>
            </div>
            <div className="tw-flex tw-items-center tw-gap-2">
              <div className="tw-w-56">
                <Slider
                  min={0.75}
                  max={2.25}
                  step={0.01}
                  value={[Number(neutralContrast ?? 1.5)]}
                  onValueChange={(vals) => vals && vals.length > 0 && setNeutralContrast(vals[0])}
                />
              </div>
              <input
                type="number"
                min={0.75}
                max={2.25}
                step={0.01}
                value={Number(neutralContrast ?? 1.5).toFixed(2)}
                onChange={(e) => setNeutralContrast(parseFloat(e.target.value))}
                className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900  tw-px-2 tw-py-1"
              />
            </div>
          </div>

          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Font Colour</div>
              <div className="tw-text-xs tw-text-neutral-400">Colour for all text elements</div>
            </div>
            <div className="tw-flex tw-items-center tw-gap-2">
              <input
                type="color"
                value={fontColor || '#d6d6d6'}
                onChange={(e) => setFontColor(e.target.value)}
                className="tw-w-12 tw-h-8 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-cursor-pointer"
              />
              <input
                type="text"
                value={(fontColor || '#d6d6d6').replace(/^#/, '')}
                onChange={(e) => setFontColor(`#${e.target.value.replace(/[^0-9a-fA-F]/g,'').slice(0,6)}`)}
                className="tw-w-24 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900  tw-px-2 tw-py-1"
                placeholder="aaaaaa"
              />
            </div>
          </div>

          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Default Video Resolution</div>
              <div className="tw-text-xs tw-text-neutral-400">Internal render scale for video layers (0.10 – 1.00)</div>
            </div>
            <div className="tw-flex tw-items-center tw-gap-2">
              <div className="tw-w-56">
                <Slider
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={[Number(defaultVideoRenderScale ?? 1)]}
                  onValueChange={(vals) => vals && vals.length > 0 && setDefaultVideoRenderScale(vals[0])}
                />
              </div>
              <input
                type="number"
                min={0.1}
                max={1}
                step={0.01}
                value={Number(defaultVideoRenderScale ?? 1).toFixed(2)}
                onChange={(e) => setDefaultVideoRenderScale(parseFloat(e.target.value))}
                className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900  tw-px-2 tw-py-1"
              />
            </div>
          </div>

          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Mirror Quality</div>
              <div className="tw-text-xs tw-text-neutral-400">Affects mirror FPS, resolution, and JPEG compression</div>
            </div>
            <div className="tw-w-56">
              <Select
                value={String(mirrorQuality || 'medium')}
                onChange={(val: string) => setMirrorQuality((val as any) as ('low'|'medium'|'high'))}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' }
                ]}
              />
            </div>
          </div>

          {/* Spout Output settings removed: Spout uses a fixed sender name and FPS. */}

          {/* Keep Preview toggle removed - now controlled via External menu (Mirror / Mirror (No preview)) */}
          
          <div className="tw-border-t tw-border-neutral-800 tw-my-2" />

          {/* User FX directory */}
          <div className="tw-space-y-2">
            <div className="tw-text-sm tw-text-neutral-200">User FX Directory</div>
            <div className="tw-text-xs tw-text-neutral-400">Set a folder to auto-load portable/user effects at startup.</div>
            <div className="tw-flex tw-items-center tw-gap-2">
              <Input
                readOnly
                value={fxDir}
                placeholder="Not set"
                className="tw-flex-1"
              />
              <Button onClick={async ()=>{
                try {
                  if (!(window as any).electron?.showOpenDialog) {
                    toast({ description: 'Directory selection is only available in the Electron app.' });
                    return;
                  }
                  trackFeature('user_fx_dir_browse', { ok: true });
                  const result = await (window as any).electron.showOpenDialog({ title: 'Select User FX Directory', properties: ['openDirectory'], message: 'Choose a directory containing your custom effects (.tsx or portable .js).' });
                  if (result.canceled || !result.filePaths?.[0]) return;
                  const dir = String(result.filePaths[0]);
                  setFxDir(dir);
                  try {
                    localStorage.setItem('vj-fx-user-dir', dir);
                    localStorage.setItem('vj-autoload-user-effects-enabled', '1');
                    try { localStorage.removeItem('vj-autoload-user-effects-dirs'); } catch {}
                  } catch {}
                  setAutoloadUserFx(true);
                  try {
                    const { EffectDiscovery } = await import('../utils/EffectDiscovery');
                    const discovery = EffectDiscovery.getInstance();
                    const effects = await discovery.loadUserEffectsFromDirectory(dir);
                    toast({ description: `Loaded ${effects.length} effect(s) from ${dir}` });
                    trackFeature('user_fx_loaded', { ok: true, count: effects.length });
                  } catch (e) {
                    console.warn('Immediate load failed', e);
                  }
                } catch (e) {
                  console.error('Select FX dir failed', e);
                }
              }}>Browse…</Button>
              {fxDir && (
                <Button variant="outline" onClick={async ()=>{
                  try {
                    localStorage.removeItem('vj-fx-user-dir');
                  } catch {}
                  setFxDir('');
                  toast({ description: 'User FX directory cleared.' });
                  try {
                    const { EffectDiscovery } = await import('../utils/EffectDiscovery');
                    const discovery = EffectDiscovery.getInstance();
                    discovery.clearUserEffects();
                  } catch {}
                }}>Clear</Button>
              )}
            </div>
            <div className="tw-flex tw-items-center tw-justify-between">
              <div className="tw-text-xs tw-text-neutral-400">Autoload user FX on startup</div>
              <Switch checked={autoloadUserFx} onCheckedChange={(v)=>{ setAutoloadUserFx(Boolean(v)); try { localStorage.setItem('vj-autoload-user-effects-enabled', Boolean(v) ? '1' : '0'); } catch {} }} />
            </div>
          </div>

          <div className="tw-border-t tw-border-neutral-800 tw-my-2" />
          
          {/* AI Provider Settings */}
          <div className="tw-space-y-3">
            <div className="tw-text-sm tw-text-neutral-200">AI Provider</div>
            <div className="tw-text-xs tw-text-neutral-400">Configure your AI provider API key and model for AI effects generation</div>
            
            {templates.length > 0 ? (
              <>
                <div className="tw-space-y-2">
                  <div className="tw-text-xs tw-text-neutral-400">Provider</div>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <Select
                      value={selectedProviderId}
                      onChange={(val) => handleProviderChange(String(val))}
                      options={templates.map(t => ({
                        value: t.id,
                        label: t.name,
                      }))}
                      className="tw-text-xs"
                    />
                  </div>
                  {selectedTemplate && (
                    <div className="tw-text-xs tw-text-neutral-500">{selectedTemplate.description}</div>
                  )}
                </div>

                {selectedTemplate && (
                  <>
                    <div className="tw-space-y-2">
                      <div className="tw-text-xs tw-text-neutral-400">API Key</div>
                      <div className="tw-flex tw-items-center tw-gap-2">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          value={showApiKey ? apiKey : getMaskedApiKey()}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={selectedTemplate.apiKeyPlaceholder}
                          className="tw-flex-1 tw-text-xs"
                        />
                        <Button
                          variant="outline"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="tw-text-xs"
                        >
                          {showApiKey ? 'Hide' : 'Show'}
                        </Button>
                        <Button
                          onClick={handleSaveApiKey}
                          className="tw-text-xs"
                        >
                          Save
                        </Button>
                      </div>
                    </div>

                    <div className="tw-space-y-2">
                      <div className="tw-text-xs tw-text-neutral-400">Model</div>
                      <div className="tw-flex tw-items-center tw-gap-2">
                        <Select
                          value={model}
                          onChange={(val) => handleSaveModel(String(val))}
                          options={selectedTemplate.models}
                          className="tw-text-xs"
                        />
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="tw-text-xs tw-text-neutral-500">
                Loading templates... (Check console for errors if this persists)
              </div>
            )}

            <div className="tw-border-t tw-border-neutral-800 tw-my-2" />

            {/* AI effect cache clear control */}
            <div className="tw-flex tw-items-center tw-justify-between">
              <div className="tw-text-xs tw-text-neutral-400 tw-pr-4">
                Clear unsaved AI-generated effects from the Library.
              </div>
              <Button
                variant="outline"
                className="tw-text-xs"
                onClick={async () => {
                  try {
                    localStorage.removeItem('vj-ai-last-code');
                    localStorage.setItem('vj-ai-restore-enabled', '0');
                  } catch {}
                  try {
                    const { EffectDiscovery } = await import('../utils/EffectDiscovery');
                    const discovery = EffectDiscovery.getInstance();
                    await discovery.clearAIGeneratedEffects();
                  } catch {}
                  toast({ description: 'Cleared unsaved AI-generated effects from the Library.' });
                }}
              >
                Clear
              </Button>
            </div>
          </div>

          {(typeof window === 'undefined' || !(window as any).electron) && (
            <>
              <div className="tw-border-t tw-border-neutral-800 tw-my-2" />
              <div className="tw-flex tw-items-center tw-justify-between">
                <div>
                  <div className="tw-text-sm tw-text-neutral-200">Account</div>
                  <div className="tw-text-xs tw-text-neutral-400">{user ? (user.email || 'Signed in') : 'Not signed in'}</div>
                </div>
                {user ? (
                  <Button onClick={handleSignOut} className="!tw-bg-neutral-800 ! !tw-border-none">Sign out</Button>
                ) : (
                  <div className="tw-text-xs tw-text-neutral-500">Silent login; sign-in UI not required</div>
                )}
              </div>
            </>
          )}

          {/* Debug toggle at the bottom */}
          <div className="tw-border-t tw-border-neutral-800 tw-my-2" />
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Enable Debug Mode</div>
              <div className="tw-text-xs tw-text-neutral-400">Show developer overlays and diagnostics</div>
            </div>
            <Switch
              checked={debugMode}
              onCheckedChange={(v) => {
                const next = Boolean(v);
                setDebugMode(next);
                try { localStorage.setItem('vj-debug-enabled', JSON.stringify(next)); } catch {}
                try { (useStore.getState() as any).setDebugMode?.(next); } catch {}
              }}
            />
          </div>

          {/* Version display */}
          <div className="tw-border-t tw-border-neutral-800 tw-my-2" />
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Version</div>
              <div className="tw-text-xs tw-text-neutral-400">Application version number</div>
            </div>
            <div className="tw-text-xs tw-text-neutral-400">{appVersion || '—'}</div>
          </div>

          {/* Updates and Support */}
          <div className="tw-border-t tw-border-neutral-800 tw-my-2" />
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Updates and Support</div>
              <div className="tw-text-xs tw-text-neutral-400">Links, downloads, and community</div>
            </div>
            <button
              type="button"
              onClick={() => {
                const url = 'https://linktr.ee/sonomika';
                const electron = (window as any).electron;
                if (electron?.openExternal) {
                  electron.openExternal(url);
                } else {
                  window.open(url, '_blank', 'noopener,noreferrer');
                }
              }}
              className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-md tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-bg-neutral-700 hover:tw-bg-neutral-600 tw-text-neutral-100 tw-border tw-border-neutral-600 tw-transition-colors"
            >
              Open
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


