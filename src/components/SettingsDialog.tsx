import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/Dialog';
import { Switch } from './ui/switch';
import { useStore } from '../store/store';
import { Button, Slider, Select, Input } from './ui';
import { getSupabase } from '../lib/supabaseClient';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { accessibilityEnabled, setAccessibilityEnabled, accentColor, setAccentColor, defaultVideoRenderScale, setDefaultVideoRenderScale, mirrorQuality, setMirrorQuality } = useStore() as any;
  const [user, setUser] = useState<any>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

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

  // Load OpenAI API key on mount
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).authStorage) {
          const key = (window as any).authStorage.loadSync('openai_api_key');
          if (key) {
            setOpenaiApiKey(key);
          }
        }
        // Fallback: web builds may store in localStorage
        if (!openaiApiKey) {
          try {
            const ls = (typeof window !== 'undefined') ? window.localStorage : null;
            const key2 = ls?.getItem('openai_api_key') || '';
            if (key2) setOpenaiApiKey(key2);
          } catch {}
        }
      } catch (error) {
        console.warn('Failed to load OpenAI API key:', error);
      }
    };
    loadApiKey();
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch {}
  };

  const saveOpenAIKey = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).authStorage) {
        if (openaiApiKey.trim()) {
          (window as any).authStorage.saveSync('openai_api_key', openaiApiKey.trim());
        } else {
          (window as any).authStorage.removeSync('openai_api_key');
        }
        setConnectionStatus('success');
      }
      // Also persist to localStorage for web builds
      try {
        const ls = (typeof window !== 'undefined') ? window.localStorage : null;
        if (ls) {
          if (openaiApiKey.trim()) ls.setItem('openai_api_key', openaiApiKey.trim());
          else ls.removeItem('openai_api_key');
        }
      } catch {}
    } catch (error) {
      console.error('Failed to save OpenAI API key:', error);
      setConnectionStatus('error');
    }
  };

  const testOpenAIConnection = async () => {
    if (!openaiApiKey.trim()) {
      setConnectionStatus('error');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${openaiApiKey.trim()}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      setConnectionStatus('error');
    } finally {
      setIsTestingConnection(false);
    }
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
          
          {/* OpenAI API Key Section */}
          <div className="tw-space-y-3">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">OpenAI API Key</div>
              <div className="tw-text-xs tw-text-neutral-400">For AI effect generation (stored securely)</div>
            </div>
            <div className="tw-space-y-2">
              <Input
                type="password"
                placeholder="sk-..."
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                className="tw-bg-neutral-800 tw-border-neutral-700"
              />
              <div className="tw-flex tw-gap-2">
                <Button
                  onClick={saveOpenAIKey}
                  className="tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-text-sm"
                >
                  Save Key
                </Button>
                <Button
                  onClick={testOpenAIConnection}
                  disabled={isTestingConnection || !openaiApiKey.trim()}
                  className="tw-bg-neutral-800 hover:tw-bg-neutral-700 tw-text-sm"
                >
                  {isTestingConnection ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>
              {connectionStatus === 'success' && (
                <div className="tw-text-xs tw-text-green-400">✓ Connection successful</div>
              )}
              {connectionStatus === 'error' && (
                <div className="tw-text-xs tw-text-red-400">✗ Connection failed</div>
              )}
            </div>
          </div>

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


