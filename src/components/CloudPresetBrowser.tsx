import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ScrollArea, Button, Input, Separator } from './ui';
import { useStore } from '../store/store';

interface CloudPresetBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CloudPresetItem {
  name: string;
  updated_at?: string;
}

const CloudPresetBrowser: React.FC<CloudPresetBrowserProps> = ({ open, onOpenChange }) => {
  const { listCloudPresets, loadPresetCloud, deletePresetCloud } = useStore() as any;
  const [items, setItems] = useState<CloudPresetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [busyName, setBusyName] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await listCloudPresets();
      setItems(Array.isArray(res) ? res : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, filter]);

  const handleLoad = async (name: string) => {
    try {
      setBusyName(name);
      const ok = await loadPresetCloud(name);
      if (ok) onOpenChange(false);
    } finally {
      setBusyName(null);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      setBusyName(name);
      const ok = await deletePresetCloud(name);
      if (ok) fetchItems();
    } finally {
      setBusyName(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Load Preset</DialogTitle>
          <DialogDescription>Select a preset saved to your account.</DialogDescription>
        </DialogHeader>

        <div className="tw-flex tw-gap-2 tw-items-center tw-mb-2">
          <Input
            placeholder="Filter by name"
            value={filter}
            onChange={(e: any) => setFilter(e.target.value)}
          />
          <Button onClick={fetchItems} disabled={loading}>Refresh</Button>
        </div>

        <Separator />

        <div className="tw-mt-2 tw-border tw-border-neutral-800 tw-rounded">
          <div className="tw-grid tw-grid-cols-8 tw-text-xs tw-text-neutral-300 tw-px-2 tw-py-1 tw-border-b tw-border-neutral-800">
            <div className="tw-col-span-5">Name</div>
            <div className="tw-col-span-2">Updated</div>
            <div className="tw-col-span-1 tw-text-right">Actions</div>
          </div>
          <ScrollArea className="tw-max-h-64">
            {loading ? (
              <div className="tw-p-3 tw-text-sm tw-text-neutral-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="tw-p-3 tw-text-sm tw-text-neutral-400">No presets found.</div>
            ) : (
              <div>
                {filtered.map((it) => (
                  <div key={it.name} className="tw-grid tw-grid-cols-8 tw-items-center tw-px-2 tw-py-2 tw-border-b tw-border-neutral-900 hover:tw-bg-neutral-900/40">
                    <div className="tw-col-span-5 tw-truncate">{it.name}</div>
                    <div className="tw-col-span-2 tw-text-xs tw-text-neutral-400">
                      {it.updated_at ? new Date(it.updated_at).toLocaleString() : '-'}
                    </div>
                    <div className="tw-col-span-1 tw-flex tw-justify-end tw-gap-2">
                      <Button variant="default" onClick={() => handleLoad(it.name)} disabled={busyName === it.name}>Load</Button>
                      <Button variant="destructive" onClick={() => handleDelete(it.name)} disabled={busyName === it.name}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CloudPresetBrowser;


