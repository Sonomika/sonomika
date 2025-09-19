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
  const { accessibilityEnabled, setAccessibilityEnabled, accentColor, setAccentColor, defaultVideoRenderScale, setDefaultVideoRenderScale, mirrorQuality, setMirrorQuality, neutralContrast, setNeutralContrast } = useStore() as any;
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

  // Removed OpenAI key saving

  // Removed OpenAI connection test

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="tw-space-y-4">
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Accessibility</div>
              <div className="tw-text-xs tw-text-neutral-400">Enable high-contrast focus rings and highlights</div>
            </div>
            <Switch checked={!!accessibilityEnabled} onCheckedChange={(val) => setAccessibilityEnabled(Boolean(val))} />
          </div>
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
                className="tw-w-24 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
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
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={[Number(neutralContrast ?? 1)]}
                  onValueChange={(vals) => vals && vals.length > 0 && setNeutralContrast(vals[0])}
                />
              </div>
              <input
                type="number"
                min={0.5}
                max={1.5}
                step={0.01}
                value={Number(neutralContrast ?? 1).toFixed(2)}
                onChange={(e) => setNeutralContrast(parseFloat(e.target.value))}
                className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
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
                className="tw-w-20 tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-px-2 tw-py-1"
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

          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Keep Preview During Mirror</div>
              <div className="tw-text-xs tw-text-neutral-400">Show in-app preview and mirror window simultaneously</div>
            </div>
            <Switch
              checked={((useStore.getState() as any).mirrorKeepPreview) !== false}
              onCheckedChange={(val) => (useStore.getState() as any).setMirrorKeepPreview(Boolean(val))}
            />
          </div>
          
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
          
          {/* OpenAI section removed */}

          <div className="tw-border-t tw-border-neutral-800 tw-my-2" />
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Account</div>
              <div className="tw-text-xs tw-text-neutral-400">{user ? (user.email || 'Signed in') : 'Not signed in'}</div>
            </div>
            {user ? (
              <Button onClick={handleSignOut} className="!tw-bg-neutral-800 !tw-text-neutral-100 !tw-border-none">Sign out</Button>
            ) : (
              <div className="tw-text-xs tw-text-neutral-500">Silent login; sign-in UI not required</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


