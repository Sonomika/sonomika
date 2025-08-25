import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/Dialog';
import { Switch } from './ui/switch';
import { useStore } from '../store/store';
import { Button } from './ui';
import { getSupabase } from '../lib/supabaseClient';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { accessibilityEnabled, setAccessibilityEnabled, accentColor, setAccentColor, defaultVideoFitMode, setDefaultVideoFitMode } = useStore() as any;
  const [user, setUser] = useState<any>(null);

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

  const handleSignOut = async () => {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch {}
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
          <div className="tw-border-t tw-border-neutral-800 tw-my-2" />
          <div className="tw-flex tw-items-center tw-justify-between">
            <div>
              <div className="tw-text-sm tw-text-neutral-200">Default Video Size</div>
              <div className="tw-text-xs tw-text-neutral-400">Applied to new video/image/webcam layers</div>
            </div>
            <select
              value={defaultVideoFitMode || 'cover'}
              onChange={(e) => setDefaultVideoFitMode(e.target.value as any)}
              className="tw-w-40 tw-px-3 tw-py-2 tw-border tw-border-neutral-700 tw-bg-neutral-900 tw-text-neutral-100 tw-rounded-md tw-text-sm"
            >
              <option value="none">Original</option>
              <option value="contain">Fit</option>
              <option value="cover">Fill</option>
              <option value="stretch">Stretch</option>
              <option value="tile">Tile</option>
            </select>
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


