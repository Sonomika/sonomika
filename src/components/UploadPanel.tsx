import React, { useCallback, useMemo, useState } from 'react';
import { getSupabase } from '../lib/supabaseClient';
import { Button, Card, CardHeader, CardTitle, CardContent, Progress, Input } from './ui';

type Props = {
  onUploaded?: (publicUrl: string, path: string) => void;
};

export const UploadPanel: React.FC<Props> = ({ onUploaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bucket = useMemo(() => 'videos', []);

  const handleFile = useCallback((f?: File) => {
    if (f) setFile(f);
  }, []);

  const upload = useCallback(async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setProgress(0);
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
      if (isElectron) {
        setError('File upload is not available in Electron mode');
        return;
      }
      const supabase = getSupabase();
      const ext = file.name.split('.').pop() || 'mp4';
      const key = `u/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error: e } = await supabase.storage.from(bucket).upload(key, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (e) throw e;
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(data.path);
      onUploaded?.(pub.publicUrl, data.path);
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }, [file, bucket, onUploaded]);

  return (
    <Card className="tw-bg-neutral-900 tw-border-neutral-800 tw-text-white">
      <CardHeader>
        <CardTitle>Upload a video</CardTitle>
      </CardHeader>
      <CardContent className="tw-space-y-3">
        <Input type="file" accept="video/*" onChange={(e) => handleFile(e.target.files?.[0] || undefined)} />
        {busy && <Progress value={progress} />}
        {error && <div className="tw-text-red-400 tw-text-sm">{error}</div>}
        <Button onClick={upload} disabled={!file || busy}>Upload</Button>
      </CardContent>
    </Card>
  );
};

export default UploadPanel;


