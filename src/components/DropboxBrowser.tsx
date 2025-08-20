import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent, ScrollArea } from './ui';
import { useStore } from '../store/store';
import { beginAuth, isAuthed, listFolder, getTemporaryLink, type DropboxEntry, signOutDropbox, createAuthUrl } from '../lib/dropbox';

type Props = {
  onClose?: () => void;
};

type Item = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
};

export const DropboxBrowser: React.FC<Props> = ({ onClose }) => {
  const addAsset = (useStore() as any).addAsset as (a: any) => void;
  const [authed, setAuthed] = useState<boolean>(isAuthed());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pathStack, setPathStack] = useState<string[]>(['']);

  const allowedVideo = useMemo(() => new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv']), []);

  const currentPath = pathStack[pathStack.length - 1] || '';

  const refresh = useCallback(async () => {
    if (!authed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await listFolder(currentPath);
      const mapped: Item[] = res.entries
        .filter((e: DropboxEntry) => e['.tag'] === 'folder' || e['.tag'] === 'file')
        .map((e: DropboxEntry) => ({
          name: e.name,
          path: e.path_lower || e.path_display,
          isDirectory: e['.tag'] === 'folder',
          size: e.size,
        }));
      // Sort: folders first, then files by name
      mapped.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
      setItems(mapped);
    } catch (e: any) {
      setError(e?.message || 'Failed to list folder');
    } finally {
      setBusy(false);
    }
  }, [authed, currentPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = async () => {
    try {
      await beginAuth();
    } catch (e: any) {
      // As a fallback, try to build URL and open
      try {
        const url = await createAuthUrl();
        window.location.assign(url);
      } catch (err: any) {
        setError(err?.message || 'Failed to start Dropbox sign-in');
      }
    }
  };

  const disconnect = () => {
    signOutDropbox();
    setAuthed(false);
    setItems([]);
    setPathStack(['']);
  };

  const enterFolder = (subPath: string) => {
    setPathStack((prev) => [...prev, subPath]);
  };

  const goUp = () => {
    setPathStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const isVideoFile = (name: string) => {
    const lower = name.toLowerCase();
    for (const ext of allowedVideo) {
      if (lower.endsWith(ext)) return true;
    }
    return false;
  };

  const pickFile = async (item: Item) => {
    if (item.isDirectory) return;
    if (!isVideoFile(item.name)) {
      setError('Only video files are supported');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { link, expiresAt } = await getTemporaryLink(item.path);
      const asset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: item.name,
        type: 'video' as const,
        path: link,
        size: item.size || 0,
        date: new Date().toLocaleDateString(),
        dropboxPath: item.path,
        dropboxExpiresAt: expiresAt,
      };
      addAsset(asset);
      onClose?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch temporary link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="tw-bg-neutral-900 tw-border-neutral-800 tw-text-white">
      <CardHeader>
        <CardTitle>Dropbox</CardTitle>
      </CardHeader>
      <CardContent className="tw-space-y-3">
        {!authed ? (
          <div className="tw-flex tw-justify-between tw-items-center">
            <div className="tw-text-neutral-300">Connect your Dropbox to browse videos.</div>
            <Button onClick={connect}>Connect</Button>
          </div>
        ) : (
          <div className="tw-flex tw-justify-between tw-items-center">
            <div className="tw-text-neutral-300">Connected</div>
            <div className="tw-flex tw-gap-2">
              <Button variant="secondary" onClick={goUp} disabled={pathStack.length <= 1 || busy}>Up</Button>
              <Button variant="destructive" onClick={disconnect} disabled={busy}>Disconnect</Button>
            </div>
          </div>
        )}

        {error && <div className="tw-text-red-400 tw-text-sm">{error}</div>}

        {authed && (
          <ScrollArea className="tw-h-[360px] tw-border tw-border-neutral-800">
            <div className="tw-divide-y tw-divide-neutral-800">
              {busy && <div className="tw-p-3 tw-text-sm tw-text-neutral-400">Loading...</div>}
              {!busy && items.length === 0 && <div className="tw-p-3 tw-text-sm tw-text-neutral-400">Folder is empty</div>}
              {!busy && items.map((itm) => (
                <div
                  key={itm.path}
                  className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 hover:tw-bg-neutral-800 tw-cursor-pointer"
                  onClick={() => (itm.isDirectory ? enterFolder(itm.path) : pickFile(itm))}
                >
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <div className="tw-text-neutral-400">{itm.isDirectory ? 'Folder' : 'File'}</div>
                    <div>{itm.name}</div>
                  </div>
                  {!itm.isDirectory && isVideoFile(itm.name) && <div className="tw-text-xs tw-text-neutral-500">video</div>}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="tw-flex tw-justify-end tw-gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DropboxBrowser;


