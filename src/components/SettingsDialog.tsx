import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/Dialog';
import { Switch } from './ui/switch';
import { useStore } from '../store/store';
import { Button, Slider, Select, Input } from './ui';
import { useToast } from '../hooks/use-toast';
import { getSupabase } from '../lib/supabaseClient';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { accessibilityEnabled, setAccessibilityEnabled, accentColor, setAccentColor, defaultVideoRenderScale, setDefaultVideoRenderScale, mirrorQuality, setMirrorQuality, neutralContrast, setNeutralContrast, fontColor, setFontColor } = useStore() as any;
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

  // OpenAI API key settings
  const STORAGE_KEY_API = 'vj-ai-openai-api-key';
  const STORAGE_KEY_MODEL = 'vj-ai-openai-model';
  const [apiKey, setApiKey] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY_API) || ''; } catch { return ''; }
  });
  const [model, setModel] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY_MODEL) || 'gpt-5-mini'; } catch { return 'gpt-5-mini'; }
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  useEffect(() => {
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
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch {}
  };

  const handleSaveApiKey = () => {
    try { 
      localStorage.setItem(STORAGE_KEY_API, apiKey.trim()); 
      toast({ description: 'API key saved' });
    } catch (e) {
      toast({ description: 'Failed to save API key' });
    }
  };

  const handleSaveModel = (m: string) => {
    setModel(m);
    try { 
      localStorage.setItem(STORAGE_KEY_MODEL, m); 
      toast({ description: 'Model saved' });
    } catch (e) {
      toast({ description: 'Failed to save model' });
    }
  };

  const getMaskedApiKey = () => {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
    return apiKey.slice(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.slice(-4);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
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
                value={fontColor || '#aaaaaa'}
                onChange={(e) => setFontColor(e.target.value)}
                className="tw-w-12 tw-h-8 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-cursor-pointer"
              />
              <input
                type="text"
                value={(fontColor || '#aaaaaa').replace(/^#/, '')}
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
          
          {/* OpenAI API Settings */}
          <div className="tw-space-y-3">
            <div className="tw-text-sm tw-text-neutral-200">OpenAI API</div>
            <div className="tw-text-xs tw-text-neutral-400">Configure your OpenAI API key and model for AI effects generation</div>
            
            <div className="tw-space-y-2">
              <div className="tw-text-xs tw-text-neutral-400">API Key</div>
              <div className="tw-flex tw-items-center tw-gap-2">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={showApiKey ? apiKey : getMaskedApiKey()}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
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
                  options={[
                    { value: 'gpt-5', label: 'gpt-5' },
                    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
                    { value: 'gpt-4o', label: 'gpt-4o' },
                    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
                    { value: 'o4-mini', label: 'o4-mini' },
                  ]}
                  className="tw-text-xs"
                />
              </div>
            </div>
          </div>

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
        </div>
      </DialogContent>
    </Dialog>
  );
};


